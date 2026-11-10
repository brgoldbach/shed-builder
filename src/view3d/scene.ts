import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  DirectionalLight,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
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
  RepeatWrapping,
  Scene,
  Shape,
  Sphere,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LUMBER } from '../core/catalog';
import { DEPTH, WAVE, type Corrugated, type FinishPart, type Look } from '../core/gen/finishes';
import type { Member, Panel, Role, Solid, Vec3 } from '../core/member';

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

const PX = 8; // texture pixels per inch

// Draws one tile of a look in grays, for a texture tinted by the material color and for its relief.
// A tile is drawn at PX pixels per inch, except the garage section, which stretches to its tile.
function drawLook(look: Look): HTMLCanvasElement | null {
  const sizes: Partial<Record<Look, [number, number]>> = {
    lap: [8, 6 * PX],
    't1-11': [8 * PX, 8],
    'board-batten': [12 * PX, 8],
    shingles: [36 * PX, 10 * PX],
    planks: [6 * PX, 8],
    garage: [64, 64],
  };
  const size = sizes[look];
  if (!size) return null;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = size;
  const pen = canvas.getContext('2d')!;
  const fill = (shade: number, x: number, y: number, width: number, height: number) => {
    pen.fillStyle = `rgb(${shade} ${shade} ${shade})`;
    pen.fillRect(x, y, width, height);
  };
  const [width, height] = size;
  // A repeatable pseudo-random shade, so every render looks the same.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  switch (look) {
    case 'lap': {
      // One course: lighter toward its lower edge, with the shadow of the course below it.
      const gradient = pen.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgb(205 205 205)');
      gradient.addColorStop(1, 'rgb(240 240 240)');
      pen.fillStyle = gradient;
      pen.fillRect(0, 0, width, height);
      fill(110, 0, height - 3, width, 3);
      break;
    }
    case 't1-11':
      fill(228, 0, 0, width, height);
      for (let x = 4; x < width; x += 5) fill(210 + Math.round(random() * 30), x, 0, 1, height);
      fill(95, 0, 0, 3, height);
      break;
    case 'board-batten':
      fill(215, 0, 0, width, height);
      fill(245, 0, 0, 20, height);
      fill(120, 20, 0, 2, height);
      break;
    case 'planks':
      fill(225, 0, 0, width, height);
      fill(110, 0, 0, 2, height);
      break;
    case 'garage':
      fill(228, 0, 0, width, height);
      pen.strokeStyle = 'rgb(150 150 150)';
      pen.lineWidth = 2;
      pen.strokeRect(6, 8, width - 12, height - 20);
      fill(110, 0, height - 4, width, 4);
      break;
    case 'shingles': {
      // Two 5 in courses of 12 in tabs, the upper one offset half a tab, each tab its own shade.
      const course = height / 2;
      const tab = 12 * PX;
      for (const [index, top] of [0, course].entries()) {
        for (let x = index === 0 ? -tab / 2 : 0; x < width; x += tab) {
          fill(165 + Math.round(random() * 60), x, top, tab, course);
          fill(80, x, top, 2, course);
        }
        fill(60, 0, top + course - 4, width, 4);
      }
      break;
    }
  }
  return canvas;
}

function corrugatedGeometry({ length, width }: Corrugated): BufferGeometry {
  const steps = Math.max(2, Math.ceil((length / WAVE) * 8));
  const positions: number[] = [];
  const indices: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const x = (length * step) / steps;
    const z = (DEPTH / 2) * (1 - Math.cos((2 * Math.PI * x) / WAVE));
    positions.push(x, 0, z, x, width, z);
  }
  for (let step = 0; step < steps; step++) {
    const first = 2 * step;
    indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The panel's outline along its crests, so each panel section reads.
function panelOutline({ length, width }: Corrugated): BufferGeometry {
  const corners = [
    [0, 0],
    [length, 0],
    [length, width],
    [0, width],
  ];
  const positions = corners.flatMap(([x, y], index) => {
    const [nextX, nextY] = corners[(index + 1) % corners.length];
    return [x, y, DEPTH, nextX, nextY, DEPTH];
  });
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
}

// Painted in the trim color in the finished view: the boards seen at the eaves and rakes.
const TRIM_ROLES = new Set<Role>(['fascia', 'rafter.fly']);

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
  private readonly finishes = new Group(); // not pickable
  private readonly finishMaterials = new Map<string, MeshStandardMaterial>();
  private readonly textures = new Map<string, CanvasTexture | null>();
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
  private trim: MeshStandardMaterial | null = null;
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
    this.scene.add(new HemisphereLight(0xffffff, 0x8a7a66, 2), sun, this.grid, this.members, this.solids, this.finishes);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
  }

  /** Show the framing, sheet goods, and finishes. A `trimColor` paints the fascia and fly rafters. */
  setModel(members: readonly Member[], solids: readonly Solid[], finishes: readonly FinishPart[] = [], trimColor: string | null = null) {
    this.clearModel();
    this.trim?.dispose();
    this.trim = trimColor ? new MeshStandardMaterial({ color: trimColor, roughness: 0.8 }) : null;
    for (const solid of solids) this.solids.add(this.solidMesh(solid));
    for (const part of finishes) this.finishes.add(this.finishMesh(part));
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
    if (box.isEmpty() || this.host.clientWidth === 0 || this.host.clientHeight === 0) return;
    // The first fit can come before the resize observer reports the host: take its shape now.
    this.matchHost();
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
    this.trim?.dispose();
    this.finishMaterials.forEach((material) => {
      material.map?.dispose();
      material.bumpMap?.dispose();
      material.dispose();
    });
    this.textures.forEach((texture) => texture?.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private baseMaterial(member: Member) {
    if (this.trim && TRIM_ROLES.has(member.role)) return this.trim;
    if (member.treated) return this.materials.treated;
    return HORIZONTAL.has(member.role) ? this.materials.plate : this.materials.stud;
  }

  private applySelection() {
    for (const mesh of this.members.children as Mesh[]) {
      mesh.material = this.selection.has(mesh.userData.id) ? this.materials.selected : mesh.userData.base;
    }
  }

  private panelMesh(shape: Panel, material: MeshStandardMaterial, edges = true): Mesh {
    const outline = new Shape(shape.outline.map(([a, b]) => new Vector2(a, b)));
    outline.holes = shape.holes.map((hole) => new Path(hole.map(([a, b]) => new Vector2(a, b))));
    const geometry = new ExtrudeGeometry(outline, { depth: shape.thick, bevelEnabled: false });
    const mesh = new Mesh(geometry, material);
    const [u, v] = [vector(shape.u), vector(shape.v)];
    mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(u, v, u.clone().cross(v)));
    mesh.position.copy(vector(shape.origin));
    if (edges) mesh.add(new LineSegments(new EdgesGeometry(geometry), this.materials.edges));
    return mesh;
  }

  private boxMesh({ min, max }: { min: Vec3; max: Vec3 }, material: MeshStandardMaterial): Mesh {
    const size = [0, 1, 2].map((axis) => max[axis] - min[axis]);
    const geometry = new BoxGeometry(size[0], size[1], size[2]);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...([0, 1, 2].map((axis) => min[axis] + size[axis] / 2) as [number, number, number]));
    mesh.add(new LineSegments(new EdgesGeometry(geometry), this.materials.edges));
    return mesh;
  }

  private finishMesh(part: FinishPart): Mesh {
    const material = this.finishMaterial(part);
    const { shape } = part;
    if (shape.kind === 'panel') return this.panelMesh(shape, material, part.look !== 'glass');
    if (shape.kind === 'box') return this.boxMesh(shape, material);
    const mesh = new Mesh(corrugatedGeometry(shape), material);
    const [u, v] = [vector(shape.u), vector(shape.v)];
    mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(u, v, u.clone().cross(v)));
    mesh.position.copy(vector(shape.origin));
    mesh.add(new LineSegments(panelOutline(shape), this.materials.edges));
    return mesh;
  }

  // One material per look, color, and tile; a textured look takes its tile as the repeat.
  private finishMaterial({ look, color, tile }: FinishPart): MeshStandardMaterial {
    const key = `${look}|${color}|${tile?.join('x') ?? ''}`;
    const cached = this.finishMaterials.get(key);
    if (cached) return cached;
    const material =
      look === 'glass'
        ? new MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 })
        : look === 'metal'
          ? new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.55, side: DoubleSide })
          : new MeshStandardMaterial({ color, roughness: 0.8 });
    const map = this.texture(look, true);
    const bump = this.texture(look, false);
    if (map && bump && tile) {
      material.map = map.clone();
      material.bumpMap = bump.clone();
      material.bumpScale = 1.5;
      for (const texture of [material.map, material.bumpMap]) texture.repeat.set(1 / tile[0], 1 / tile[1]);
    }
    this.finishMaterials.set(key, material);
    return material;
  }

  // A look's texture, drawn once: in sRGB as the color map, or as linear values for the relief.
  private texture(look: Look, color: boolean): CanvasTexture | null {
    const key = `${look}|${color}`;
    if (!this.textures.has(key)) {
      const canvas = drawLook(look);
      const texture = canvas && new CanvasTexture(canvas);
      if (texture) {
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        if (color) texture.colorSpace = SRGBColorSpace;
      }
      this.textures.set(key, texture);
    }
    return this.textures.get(key)!;
  }

  private solidMesh(solid: Solid): Mesh {
    const { shape } = solid;
    if (shape.kind === 'panel') return this.panelMesh(shape, this.materials[solid.material]);
    if (shape.kind === 'cylinder') {
      // Three.js cylinders stand along y; turn the axis to z.
      const geometry = new CylinderGeometry(shape.radius, shape.radius, shape.height, 24).rotateX(Math.PI / 2);
      const mesh = new Mesh(geometry, this.materials[solid.material]);
      mesh.position.set(shape.base[0], shape.base[1], shape.base[2] + shape.height / 2);
      return mesh;
    }
    return this.boxMesh(shape, this.materials[solid.material]);
  }

  private clearModel() {
    for (const group of [this.members, this.solids, this.finishes]) {
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

  private matchHost() {
    const { clientWidth, clientHeight } = this.host;
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private resize = () => {
    if (this.host.clientWidth === 0 || this.host.clientHeight === 0) return;
    this.matchHost();
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
