import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  ExtrudeGeometry,
  GridHelper,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Shape,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LUMBER } from '../core/catalog';
import type { Member, Role, Solid, Vec3 } from '../core/member';

const CLICK_SLOP = 4; // px of pointer travel that still counts as a click, not an orbit
// From the user's front-left corner, above. A gable front is the model's -x end, with +y on its left.
const VIEW_FROM = {
  eave: new Vector3(-0.55, -1, 0.6).normalize(),
  gable: new Vector3(-1, 0.55, 0.6).normalize(),
};

const vector = (value: Vec3) => new Vector3(value[0], value[1], value[2]);

function boxGeometry(member: Member): BufferGeometry {
  const { width, thick } = LUMBER[member.size];
  return new BoxGeometry(member.length, width, thick);
}

function profileGeometry(member: Member): BufferGeometry {
  const { points, depth } = member.profile!;
  const shape = new Shape(points.map(([along, across]) => new Vector2(along, across)));
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

// A profile's axes are right-handed, so they form a rotation. A box is centered, so the sign of
// its third basis vector does not matter.
function placeMesh(mesh: Mesh, member: Member) {
  const along = vector(member.axes.length);
  const across = vector(member.axes.width);
  const third = member.profile ? vector(member.axes.thick) : along.clone().cross(across);
  mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(along, across, third));
  if (member.profile) {
    mesh.position.copy(vector(member.origin));
    return;
  }
  const { width, thick } = LUMBER[member.size];
  mesh.position
    .copy(vector(member.origin))
    .addScaledVector(along, member.length / 2)
    .addScaledVector(across, width / 2)
    .addScaledVector(vector(member.axes.thick), thick / 2);
}

// Plates, headers, and sills take the darker color, so they read apart from the studs.
const HORIZONTAL = new Set<Role>([
  'plate.sill',
  'plate.bottom',
  'plate.top',
  'plate.cap',
  'header',
  'header.plate',
  'sill',
  'plate.gable',
  'ridge',
  'fascia',
  'lookout',
]);

/** Three.js view of the framing members. Building z is up. Renders on demand only. */
export class FramingScene {
  private readonly host: HTMLElement;
  private readonly onPick: (id: string | null) => void;
  private readonly renderer = new WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(35, 1, 1, 20000);
  private readonly controls: OrbitControls;
  private readonly members = new Group();
  private readonly solids = new Group(); // not pickable
  private readonly grid = new GridHelper(1200, 100, 0x8a8a84, 0x8a8a84);
  private readonly raycaster = new Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly materials = {
    stud: new MeshStandardMaterial({ color: 0xdcc096, roughness: 0.85 }),
    plate: new MeshStandardMaterial({ color: 0xc49b6a, roughness: 0.85 }),
    treated: new MeshStandardMaterial({ color: 0x9fae84, roughness: 0.85 }),
    selected: new MeshStandardMaterial({ color: 0xe0914a, emissive: 0x6a3000, roughness: 0.6 }),
    concrete: new MeshStandardMaterial({ color: 0x9b9a95, roughness: 0.95 }),
    sheet: new MeshStandardMaterial({ color: 0xd8b27a, roughness: 0.9, transparent: true, opacity: 0.6 }),
    steel: new MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.4, metalness: 0.6 }),
    edges: new LineBasicMaterial({ color: 0x3b2f22, transparent: true, opacity: 0.5 }),
  };
  private selection: ReadonlySet<string> = new Set();
  private viewFrom = VIEW_FROM.eave;
  private fitted = false;
  private pointerDown: { x: number; y: number } | null = null;

  constructor(host: HTMLElement, onPick: (id: string | null) => void) {
    this.host = host;
    this.onPick = onPick;
    this.camera.up.set(0, 0, 1);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', this.render);

    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(-2, -3, 4);
    this.grid.rotateX(Math.PI / 2);
    (this.grid.material as LineBasicMaterial).transparent = true;
    (this.grid.material as LineBasicMaterial).opacity = 0.25;
    this.scene.add(new HemisphereLight(0xffffff, 0x8a7a66, 2), sun, this.grid, this.members, this.solids);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
  }

  setModel(members: readonly Member[], solids: readonly Solid[]) {
    this.clearModel();
    for (const solid of solids) this.solids.add(this.solidMesh(solid));
    for (const member of members) {
      const geometry = member.profile ? profileGeometry(member) : boxGeometry(member);
      const mesh = new Mesh(geometry, this.baseMaterial(member));
      placeMesh(mesh, member);
      mesh.userData = { id: member.id, base: mesh.material };
      mesh.add(new LineSegments(new EdgesGeometry(geometry), this.materials.edges));
      this.members.add(mesh);
    }
    this.applySelection();
    if (!this.fitted) this.fit();
    else this.render();
  }

  /** Turn the camera to look from the user's front-left corner. */
  setFront(front: 'eave' | 'gable') {
    if (this.viewFrom === VIEW_FROM[front]) return;
    this.viewFrom = VIEW_FROM[front];
    this.fit();
  }

  setSelection(ids: ReadonlySet<string>) {
    this.selection = ids;
    this.applySelection();
    this.render();
  }

  /** Point the camera at the whole frame from the front-left. */
  fit = () => {
    const box = new Box3().setFromObject(this.members).union(new Box3().setFromObject(this.solids));
    if (box.isEmpty() || this.host.clientWidth === 0) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const narrowHalfFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
    const distance = (sphere.radius / Math.sin(narrowHalfFov)) * 1.05;
    this.camera.position.copy(sphere.center).addScaledVector(this.viewFrom, distance);
    this.camera.near = distance / 100;
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    // The grid stands for the ground: at the lowest piece of lumber.
    this.grid.position.set(sphere.center.x, sphere.center.y, new Box3().setFromObject(this.members).min.z);
    this.controls.update();
    this.fitted = true;
    this.render();
  };

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.grid.dispose();
    Object.values(this.materials).forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private baseMaterial(member: Member) {
    if (member.treated) return this.materials.treated;
    return HORIZONTAL.has(member.role) ? this.materials.plate : this.materials.stud;
  }

  private applySelection() {
    for (const mesh of this.members.children as Mesh[]) {
      mesh.material = this.selection.has(mesh.userData.id) ? this.materials.selected : mesh.userData.base;
    }
  }

  private solidMesh(solid: Solid): Mesh {
    const { shape } = solid;
    if (shape.kind === 'panel') {
      const outline = new Shape(shape.outline.map(([a, b]) => new Vector2(a, b)));
      outline.holes = shape.holes.map((hole) => new Path(hole.map(([a, b]) => new Vector2(a, b))));
      const geometry = new ExtrudeGeometry(outline, { depth: shape.thick, bevelEnabled: false });
      const mesh = new Mesh(geometry, this.materials[solid.material]);
      const [u, v] = [vector(shape.u), vector(shape.v)];
      mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(u, v, u.clone().cross(v)));
      mesh.position.copy(vector(shape.origin));
      mesh.add(new LineSegments(new EdgesGeometry(geometry), this.materials.edges));
      return mesh;
    }
    if (shape.kind === 'cylinder') {
      // Three.js cylinders stand along y; turn the axis to z.
      const geometry = new CylinderGeometry(shape.radius, shape.radius, shape.height, 24).rotateX(Math.PI / 2);
      const mesh = new Mesh(geometry, this.materials[solid.material]);
      mesh.position.set(shape.base[0], shape.base[1], shape.base[2] + shape.height / 2);
      return mesh;
    }
    const size = [0, 1, 2].map((axis) => shape.max[axis] - shape.min[axis]);
    const geometry = new BoxGeometry(size[0], size[1], size[2]);
    const mesh = new Mesh(geometry, this.materials[solid.material]);
    mesh.position.set(...([0, 1, 2].map((axis) => shape.min[axis] + size[axis] / 2) as [number, number, number]));
    mesh.add(new LineSegments(new EdgesGeometry(geometry), this.materials.edges));
    return mesh;
  }

  private clearModel() {
    for (const group of [this.members, this.solids]) {
      for (const mesh of group.children as Mesh[]) {
        mesh.geometry.dispose();
        (mesh.children[0] as LineSegments | undefined)?.geometry.dispose();
      }
      group.clear();
    }
  }

  private render = () => {
    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const { clientWidth, clientHeight } = this.host;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    if (!this.fitted) this.fit();
    this.render();
  };

  private handlePointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private handlePointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const [hit] = this.raycaster.intersectObjects(this.members.children, false);
    this.onPick(hit ? (hit.object.userData.id as string) : null);
  };
}
