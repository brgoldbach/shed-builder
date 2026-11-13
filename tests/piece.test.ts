import { describe, expect, it } from 'vitest';
import type { Member, Point } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { LENGTH_RULE } from '../src/core/out/cutlist';
import { PRESETS } from '../src/core/presets';
import type { Dimension } from '../src/drawings/drawing';
import { cutKind, cutLengthKey, outlineOf, pieceDrawing } from '../src/drawings/piece';
import { formatInches } from '../src/core/units';

const { members } = buildModel(PRESETS[0]);
const first = (role: Member['role']) => members.find((member) => member.role === role)!;
// What an aligned dimension reads: its length along `along`, or from point to point, to 1/16.
const reading = (dim: Dimension) => {
  if (dim.kind !== 'aligned') return '';
  const [dx, dy] = [dim.to[0] - dim.from[0], dim.to[1] - dim.from[1]];
  const [ux, uy]: Point = dim.along ?? [dx, dy];
  return formatInches(Math.abs(dx * ux + dy * uy) / Math.hypot(ux, uy));
};

describe('piece drawings', () => {
  it('sorts pieces by how their ends are cut', () => {
    expect(['stud', 'stud.gable', 'tie.collar', 'rafter'].map((role) => cutKind(outlineOf(first(role as Member['role']))))).toEqual([
      'square',
      'one-end',
      'toward',
      'parallel',
    ]);
  });

  it('dimensions a rafter long point to long point, past both of its edges', () => {
    // 2x6 at 6/12 with plumb cuts at both ends: each edge is 66-1/4, and the long points sit
    // 5-1/2 × 6/12 = 2-3/4 farther apart, on opposite edges.
    const { dims } = pieceDrawing(first('rafter'));
    expect(dims.map(reading)).toEqual(['69"', '66-1/4"', '66-1/4"', '5-1/2"']);
  });

  it('dimensions a gable stud by its long side, with the short side above', () => {
    // The top cut crosses the 1-1/2 in face seen in the gable wall: 1-1/2 × 6/12 = 3/4 in shorter.
    expect(pieceDrawing(first('stud.gable')).dims.map(reading)).toEqual(['4-15/16"', '4-3/16"', '1-1/2"']);
  });

  it('gives one example of each kind of end cut, simplest outline first', () => {
    const key = cutLengthKey(members, new Map())!;
    expect(key.shapes.map((shape) => shape.role)).toEqual(['stud.gable', 'tie.collar', 'rafter.fly']);
    expect(key.notes[0]).toBe(LENGTH_RULE);
    expect(key.notes[3]).toBe(
      'fly rafter: Both ends cut the same way. The long points are on opposite edges, so the cut length is longer than ' +
        'either edge. Here 69", with edges of 66-1/4" and 66-1/4".',
    );
  });
});
