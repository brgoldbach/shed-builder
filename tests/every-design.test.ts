import { describe, expect, it } from 'vitest';
import { LUMBER } from '../src/core/catalog';
import { buildFinishes } from '../src/core/gen/finishes';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { buildBom } from '../src/core/out/bom';
import { buildCutList } from '../src/core/out/cutlist';
import { checkSpans } from '../src/core/out/spans';
import { pieceDrawing } from '../src/drawings/piece';
import { buildDrawings } from '../src/drawings/sheets';
import { DESIGNS } from './designs';

const EPSILON = 1e-6;

// Every number in a nested value, so one NaN or Infinity anywhere shows.
const numbers = (value: unknown): number[] =>
  typeof value === 'number' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(numbers) : [];

// The checks every design must pass, whatever its options. The golden files hold the values.
describe.each(DESIGNS.map((design) => [design.name, design] as const))('%s', (_name, design) => {
  const model = buildModel(design);
  const names = naming(design);
  const cutList = buildCutList(model.members, names);
  const marks = new Map(cutList.flatMap((line) => line.ids.map((id) => [id, line.mark] as const)));
  const byId = new Map(model.members.map((member) => [member.id, member]));

  it('gives each member its own id and a length', () => {
    expect(byId.size).toBe(model.members.length);
    expect(model.members.filter(({ length }) => !(length > 0))).toEqual([]);
  });

  it('cuts each angled piece from a board as wide as its lumber', () => {
    const wide = model.members.filter(({ profile, size }) => profile && Math.max(...profile.points.map(([, across]) => across)) > LUMBER[size].width + EPSILON);
    expect(wide.map(({ id }) => id)).toEqual([]);
  });

  it('puts each member on one cut line, and gives each line its own mark', () => {
    expect(cutList.flatMap(({ ids }) => ids).sort()).toEqual([...byId.keys()].sort());
    expect(new Set(cutList.map(({ mark }) => mark)).size).toBe(cutList.length);
  });

  it('builds every output with finite numbers', () => {
    const drawings = buildDrawings(design, model, names, marks);
    const pieces = cutList.map(({ ids: [id], mark }) => pieceDrawing(byId.get(id)!, mark));
    const outputs = [model, buildBom(design, model, marks), checkSpans(design, model, names), drawings, pieces, buildFinishes(design, model)];
    expect(numbers(outputs).filter((value) => !Number.isFinite(value))).toEqual([]);
    expect(drawings.filter(({ shapes }) => shapes.length === 0).map(({ id }) => id)).toEqual([]);
  });
});
