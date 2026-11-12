import { LUMBER } from '../src/core/catalog';
import type { ShedConfig } from '../src/core/config';
import { buildFinishes } from '../src/core/gen/finishes';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { buildBom } from '../src/core/out/bom';
import { buildCutList } from '../src/core/out/cutlist';
import { checkSpans } from '../src/core/out/spans';
import { pieceDrawing } from '../src/drawings/piece';
import { buildDrawings } from '../src/drawings/sheets';

const EPSILON = 1e-6;

// Every number in a nested value, so one NaN or Infinity anywhere shows.
const numbers = (value: unknown): number[] =>
  typeof value === 'number' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(numbers) : [];

/**
 * What breaks the rules every design must pass, whatever its options: an empty list when none
 * does. The golden files hold the values.
 */
export function designProblems(design: ShedConfig): string[] {
  try {
    const model = buildModel(design);
    const names = naming(design);
    const cutList = buildCutList(model.members, names);
    const marks = new Map(cutList.flatMap((line) => line.ids.map((id) => [id, line.mark] as const)));
    const byId = new Map(model.members.map((member) => [member.id, member]));
    const drawings = buildDrawings(design, model, names, marks);
    const pieces = cutList.map(({ ids: [id], mark }) => pieceDrawing(byId.get(id)!, mark));
    const outputs = [model, buildBom(design, model, marks), checkSpans(design, model, names), drawings, pieces, buildFinishes(design, model)];

    const wide = model.members.filter(({ profile, size }) => profile && Math.max(...profile.points.map(([, across]) => across)) > LUMBER[size].width + EPSILON);
    const listed = cutList.flatMap(({ ids }) => ids).sort();
    return [
      byId.size !== model.members.length && 'two members share an id',
      ...model.members.filter(({ length }) => !(length > 0)).map(({ id }) => `${id} has no length`),
      ...wide.map(({ id }) => `${id} is cut wider than its board`),
      JSON.stringify(listed) !== JSON.stringify([...byId.keys()].sort()) && 'the cut list does not hold each member once',
      new Set(cutList.map(({ mark }) => mark)).size !== cutList.length && 'two cut lines share a mark',
      numbers(outputs).some((value) => !Number.isFinite(value)) && 'an output holds NaN or Infinity',
      ...drawings.filter(({ shapes }) => shapes.length === 0).map(({ id }) => `drawing ${id} is empty`),
    ].filter((problem): problem is string => typeof problem === 'string');
  } catch (error) {
    return [`throws: ${error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' ') : String(error)}`];
  }
}
