import { Group, Mesh } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * The pieces as binary glTF (.glb), one group per layer. Each piece keeps its name and its
 * unselected material, without its edge lines. glTF is in meters with y up; the model is in
 * inches with z up, so the root scales and turns it.
 */
export async function toGlb(pieces: readonly Mesh[]): Promise<ArrayBuffer> {
  const root = new Group();
  root.name = 'Shed';
  root.scale.setScalar(0.0254);
  root.rotation.x = -Math.PI / 2;
  const layers = new Map<string, Group>();
  for (const piece of pieces) {
    const layer: string = piece.userData.layer;
    let group = layers.get(layer);
    if (!group) {
      group = new Group();
      group.name = layer;
      layers.set(layer, group);
      root.add(group);
    }
    const copy = new Mesh(piece.geometry, piece.userData.base ?? piece.material);
    copy.name = piece.name;
    copy.position.copy(piece.position);
    copy.quaternion.copy(piece.quaternion);
    group.add(copy);
  }
  return (await new GLTFExporter().parseAsync(root, { binary: true, trs: true })) as ArrayBuffer;
}
