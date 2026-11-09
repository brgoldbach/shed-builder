import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameFloor } from '../src/core/gen/floor';
import { frameWalls } from '../src/core/gen/walls';
import type { Member, Role, Solid } from '../src/core/member';

// 8 x 10 ft. Floor: 2x6 joists at 16 in under a 23/32 subfloor, so joist bottoms are at
// -(23/32 + 5-1/2) = -6-7/32.
const parse = (overrides: object) => shedSchema.parse({ schemaVersion: 1, width: 96, length: 120, ...overrides });
const floorOf = (overrides: object = {}) => frameFloor(parse(overrides));

const ofRole = (members: Member[], role: Role) => members.filter((member) => member.role === role);
const sorted = (values: number[]) => [...values].sort((first, second) => first - second);
const box = (solid: Solid) => (solid.shape.kind === 'box' ? solid.shape : null);

describe('framed floor', () => {
  const { members } = floorOf({ floor: { blocking: true } });

  it('runs joists front to back between the rims, on 16 in centers from the left corner', () => {
    expect(sorted(ofRole(members, 'joist.end').map((joist) => joist.origin[0]))).toEqual([0, 118.5]);
    const joists = ofRole(members, 'joist.floor');
    expect(sorted(joists.map((joist) => joist.origin[0]))).toEqual([15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25]);
    for (const joist of joists) expect(joist).toMatchObject({ length: 93, treated: true, origin: [joist.origin[0], 1.5, -6.21875] });
  });

  it('closes the frame with full-length rim joists', () => {
    expect(ofRole(members, 'rim.floor').map((rim) => [rim.length, rim.origin[1]])).toEqual([[120, 0], [120, 96]]);
  });

  it('blocks each bay at mid-span', () => {
    // Bays: 0-1/2 to 15-1/4, six of 14-1/2, and 112-3/4 to 118-1/2.
    expect(sorted(ofRole(members, 'blocking').map((block) => block.length))).toEqual([5.75, 13.75, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5]);
  });
});

describe('skid foundation', () => {
  const { members } = floorOf({ foundation: { type: 'skid', skid: { size: '4x6', count: 3 } } });

  it('sets the skids on edge under the joists, outer skids flush with the edges', () => {
    const skids = ofRole(members, 'skid');
    expect(sorted(skids.map((skid) => skid.origin[1]))).toEqual([0, 46.25, 92.5]);
    // 4x6 on edge: 5-1/2 tall, below the joists at -6-7/32.
    for (const skid of skids) expect(skid).toMatchObject({ length: 120, treated: true, origin: [0, skid.origin[1], -11.71875] });
  });
});

describe('pier foundation', () => {
  // 10 x 12 ft, three 2-ply 2x8 girders, 10 in piers at most 72 in apart.
  const pier = { type: 'pier', pier: { girder: '2x8', girderPlies: 2, girderCount: 3 } };
  const { members, solids } = frameFloor(parse({ width: 120, length: 144, foundation: pier }));
  const piers = solids.filter((solid) => solid.label.startsWith('Pier'));

  it('builds each girder from plies under the joists', () => {
    const plies = ofRole(members, 'girder');
    // The 10 in piers set the spacing: girders centered at 5, 60, 115; 3 in wide plies.
    expect(sorted(plies.map((ply) => ply.origin[1]))).toEqual([3.5, 5, 58.5, 60, 113.5, 115]);
    // Under the joists at -6-7/32, 7-1/4 deep.
    for (const ply of plies) expect(ply).toMatchObject({ length: 144, origin: [0, ply.origin[1], -13.46875] });
  });

  it('spaces the piers along each girder, flush with the ends', () => {
    // (144 - 10) / 72 rounds up to 2 bays of 67: centers at 5, 72, 139.
    expect(piers).toHaveLength(9);
    const xs = sorted([...new Set(piers.map((solid) => (solid.shape.kind === 'cylinder' ? solid.shape.base[0] : 0)))]);
    expect(xs).toEqual([5, 72, 139]);
    // From the girder bottom 8 in above grade, down 36 in below it.
    expect(piers[0].shape).toMatchObject({ kind: 'cylinder', radius: 5, height: 44, base: [5, 5, -57.46875] });
  });

  it('stands posts between the piers and the girders when set', () => {
    const { members: withPosts } = frameFloor(
      parse({ width: 120, length: 144, foundation: { ...pier, pier: { ...pier.pier, post: '4x4', postLength: 12 } } }),
    );
    const posts = ofRole(withPosts, 'post');
    expect(posts).toHaveLength(9);
    expect(posts[0]).toMatchObject({ length: 12, origin: [3.25, 3.25, -25.46875] });
  });
});

describe('slab foundation', () => {
  const slab = { type: 'slab' };

  it('pours the slab under the floor surface, with a thickened edge', () => {
    const { members, solids } = floorOf({ foundation: slab });
    expect(members).toEqual([]);
    expect(solids.map((solid) => solid.label)).toEqual(['Slab', 'Thickened edge', 'Thickened edge', 'Thickened edge', 'Thickened edge']);
    expect(box(solids[0])).toMatchObject({ min: [0, 0, -4], max: [120, 96, 0] });
  });

  it('bolts each mud sill within 12 in of its ends and at most 72 in apart', () => {
    const bolts = frameWalls(parse({ foundation: slab })).solids;
    expect(bolts).toHaveLength(10);
    // Front wall sill 0 to 120: 3 bolts at 12, 60, 108, on the 2x4 sill's centerline.
    const front = bolts.filter((bolt) => bolt.id.startsWith('FW'));
    expect(front.map((bolt) => (bolt.shape.kind === 'cylinder' ? bolt.shape.base.slice(0, 2) : []))).toEqual([
      [12, 1.75],
      [60, 1.75],
      [108, 1.75],
    ]);
  });

  it('keeps bolts out of doorways', () => {
    const openingTypes = [{ name: 'door', kind: 'door', width: 38, height: 82.25 }];
    const openings = [{ type: 'door', wall: 'front', along: 'left', at: [41] }];
    const bolts = frameWalls(parse({ foundation: slab, openingTypes, openings })).solids.filter((bolt) => bolt.id.startsWith('FW'));
    // Sill parts 0 to 41 and 79 to 120: two bolts each, 12 in from each end.
    expect(bolts.map((bolt) => (bolt.shape.kind === 'cylinder' ? bolt.shape.base[0] : 0))).toEqual([12, 29, 91, 108]);
  });
});
