import { ROLES } from '../core/member';
import type { Naming } from '../core/naming';
import type { CutLine } from '../core/out/cutlist';
import { formatInches } from '../core/units';

interface Props {
  lines: readonly CutLine[];
  names: Naming;
  selected: string | null;
  onSelect: (mark: string) => void;
}

export const stockLabel = (line: CutLine) => `${line.size}${line.treated ? ' PT' : ''}`;

export function CutListTable({ lines, names, selected, onSelect }: Props) {
  const groups = Map.groupBy(lines, (line) => line.assembly);
  const pieces = lines.reduce((sum, line) => sum + line.ids.length, 0);

  return (
    <table className="cutlist parts">
      <thead>
        <tr>
          <th>Mark</th>
          <th className="number">Qty</th>
          <th>Stock</th>
          <th className="number">Length</th>
          <th>Part</th>
          <th className="note">Notes</th>
        </tr>
      </thead>
      {[...groups].map(([assembly, rows]) => (
        <tbody key={assembly}>
          <tr className="group">
            <th colSpan={6}>{names.assembly(assembly).label}</th>
          </tr>
          {rows.map((line) => (
            <tr
              key={line.mark}
              className={line.mark === selected ? 'selected' : undefined}
              onClick={() => onSelect(line.mark)}
            >
              <td className="nowrap">{line.mark}</td>
              <td className="number">{line.ids.length}</td>
              <td className="nowrap">{stockLabel(line)}</td>
              <td className="number">{formatInches(line.length)}</td>
              <td className="nowrap">{ROLES[line.role]}</td>
              <td className="note">{line.note}</td>
            </tr>
          ))}
        </tbody>
      ))}
      <tfoot>
        <tr>
          <td colSpan={6} className="muted">
            {pieces} pieces
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
