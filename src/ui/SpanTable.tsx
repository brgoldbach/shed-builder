import { SPECIES, type Species } from '../core/catalog';
import type { SpanCheck } from '../core/out/spans';
import { formatLength } from '../core/units';

/** Every span check, with how much of its allowable span each member uses. */
export function SpanTable({ checks, species }: { checks: readonly SpanCheck[]; species: Species }) {
  return (
    <>
      <h3 className="span-title">Span checks: {SPECIES[species].label}</h3>
      <table className="cutlist spans">
        <thead>
          <tr>
            <th>Member</th>
            <th>Lumber</th>
            <th className="number">Span</th>
            <th className="number">Allowed</th>
            <th className="number">Used</th>
            <th>Governs</th>
          </tr>
        </thead>
        <tbody>
          {checks.map(({ member, lumber, span, allowed, governs, basis }, index) => (
            <tr key={index} className={allowed !== null && span > allowed ? 'over' : undefined} title={basis}>
              <td>
                {member}
                <div className="note">{basis}</div>
              </td>
              <td>{lumber}</td>
              <td className="number">{formatLength(span)}</td>
              <td className="number">{allowed === null ? '—' : formatLength(allowed)}</td>
              <td className="number">{allowed === null ? '—' : `${Math.round((span / allowed) * 100)}%`}</td>
              <td>{governs ?? 'No design values for this size'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
