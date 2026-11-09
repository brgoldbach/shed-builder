import type { LumberSize } from '../catalog';
import { ASSEMBLIES, ROLES, type Assembly, type Member, type Role } from '../member';

/** Identical pieces of one assembly. `mark` is the label written on each piece. */
export interface CutLine {
  mark: string;
  assembly: Assembly;
  role: Role;
  size: LumberSize;
  treated: boolean;
  length: number;
  ids: string[];
}

const ASSEMBLY_ORDER = Object.keys(ASSEMBLIES);
const ROLE_ORDER = Object.keys(ROLES);

/** Group members into cut lines: by assembly, then role, then longest first. Lengths round to 1/16 in. */
export function buildCutList(members: readonly Member[]): CutLine[] {
  const lines = new Map<string, Omit<CutLine, 'mark'>>();
  for (const member of members) {
    const length = Math.round(member.length * 16) / 16;
    const key = [member.assembly, member.role, member.size, member.treated, length].join('|');
    const line = lines.get(key);
    if (line) line.ids.push(member.id);
    else lines.set(key, { ...pick(member), length, ids: [member.id] });
  }

  const sorted = [...lines.values()].sort(
    (first, second) =>
      ASSEMBLY_ORDER.indexOf(first.assembly) - ASSEMBLY_ORDER.indexOf(second.assembly) ||
      ROLE_ORDER.indexOf(first.role) - ROLE_ORDER.indexOf(second.role) ||
      second.length - first.length,
  );

  const counts = new Map<Assembly, number>();
  return sorted.map((line) => {
    const count = (counts.get(line.assembly) ?? 0) + 1;
    counts.set(line.assembly, count);
    return { mark: `${ASSEMBLIES[line.assembly].prefix}-${count}`, ...line };
  });
}

const pick = ({ assembly, role, size, treated }: Member) => ({ assembly, role, size, treated });
