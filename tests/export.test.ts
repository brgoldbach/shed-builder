import { BoxGeometry, EdgesGeometry, LineSegments, Mesh, MeshStandardMaterial } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { toGlb } from '../src/view3d/export';

// Node has no FileReader. The exporter reads its blobs with one.
class BlobReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
}

interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

// The JSON chunk follows the 12-byte header and its own 8-byte prefix.
function readGlb(glb: ArrayBuffer) {
  const view = new DataView(glb);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, view.getUint32(12, true))));
  return { magic: view.getUint32(0, true), json };
}

describe('glTF export', () => {
  beforeAll(() => {
    vi.stubGlobal('FileReader', BlobReader);
  });

  it('writes each piece in meters, y up, by layer, without its edges or selection', async () => {
    const wood = new MeshStandardMaterial({ name: 'wood' });
    const stud = new Mesh(new BoxGeometry(92.625, 3.5, 1.5), new MeshStandardMaterial({ name: 'selected' }));
    stud.name = 'W-F-S01';
    stud.position.set(10, 20, 30);
    stud.userData = { id: stud.name, base: wood, layer: 'walls' };
    stud.add(new LineSegments(new EdgesGeometry(stud.geometry)));
    const pier = new Mesh(new BoxGeometry(12, 12, 12), new MeshStandardMaterial({ name: 'concrete' }));
    pier.name = 'FN-P01';
    pier.userData = { layer: 'foundation' };

    const { magic, json } = readGlb(await toGlb([stud, pier]));
    expect(magic).toBe(0x46546c67); // 'glTF'
    const nodes: GltfNode[] = json.nodes;
    const root = nodes[json.scenes[0].nodes[0]];
    expect(root.name).toBe('Shed');
    expect(root.scale).toEqual([0.0254, 0.0254, 0.0254]);
    // -90° about x: the model's z, up, becomes glTF's y.
    expect(root.rotation![0]).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(root.rotation![3]).toBeCloseTo(Math.SQRT1_2, 9);
    const layers = root.children!.map((index) => nodes[index]);
    expect(layers.map(({ name }) => name)).toEqual(['walls', 'foundation']);
    const [studNode] = layers[0].children!.map((index) => nodes[index]);
    expect(studNode).toMatchObject({ name: 'W-F-S01', translation: [10, 20, 30] });
    expect(studNode.children).toBeUndefined();
    expect(json.meshes).toHaveLength(2);
    expect(json.materials.map(({ name }: { name: string }) => name)).toEqual(['wood', 'concrete']);
  });
});
