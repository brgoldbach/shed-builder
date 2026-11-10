import type { LumberSize } from '../catalog';
import { ROLES, type Assembly, type Member, type Role } from '../member';
import { naming, type Naming } from '../naming';

/** Identical pieces of one assembly. `mark` is the label written on each piece. */
export interface CutLine {
  mark: string;
  assembly: Assembly;
  role: Role;
  size: LumberSize;
  treated: boolean;
  length: number;
  note?: string;
  ids: string[];
}

const ROLE_ORDER = Object.keys(ROLES);

/** How the cut list measures a piece. */
export const LENGTH_RULE =
  'Cut lengths run long point to long point, measured along the board: the shortest board each piece comes from.';

/**
 * Group members into cut lines: by assembly, then role, then longest first. Lengths round to
 * 1/16 in. Assembly order and mark prefixes follow the user's side names.
 */
export function buildCutList(members: readonly Member[], names: Naming = naming({ front: 'eave' })): CutLine[] {
  const lines = new Map<string, Omit<CutLine, 'mark'>>();
  for (const member of members) {
    const length = Math.round(member.length * 16) / 16;
    const key = [member.assembly, member.role, member.size, member.treated, length, member.note].join('|');
    const line = lines.get(key);
    if (line) line.ids.push(member.id);
    else lines.set(key, { ...pick(member), length, ids: [member.id] });
  }

  const sorted = [...lines.values()].sort(
    (first, second) =>
      names.rank(first.assembly) - names.rank(second.assembly) ||
      ROLE_ORDER.indexOf(first.role) - ROLE_ORDER.indexOf(second.role) ||
      second.length - first.length,
  );

  const counts = new Map<Assembly, number>();
  return sorted.map((line) => {
    const count = (counts.get(line.assembly) ?? 0) + 1;
    counts.set(line.assembly, count);
    return { mark: `${names.assembly(line.assembly).prefix}-${count}`, ...line };
  });
}

const pick = ({ assembly, role, size, treated, note }: Member) => ({
  assembly,
  role,
  size,
  treated,
  ...(note && { note }),
});
