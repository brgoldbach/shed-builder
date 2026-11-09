import { sheetLabel, type Bom, type Line, type LumberGroup, type Piece } from '../core/out/bom';
import { formatInches, formatLength } from '../core/units';

interface Props {
  bom: Bom;
  marks: ReadonlyMap<string, string>;
  onCsv: () => void;
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

export function BomView({ bom, marks, onCsv }: Props) {
  return (
    <div className="bom">
      <div className="panel-toolbar">
        <button onClick={onCsv}>Download CSV</button>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <h3>Lumber</h3>
      <table className="cutlist lumber">
        <thead>
          <tr>
            <th>Length</th>
            <th className="number">Qty</th>
          </tr>
        </thead>
        {bom.lumber.map((group) => (
          <LumberRows key={`${group.size}-${group.treated}`} group={group} marks={marks} />
        ))}
      </table>
      <details className="cut-plan">
        <summary>Cutting plan</summary>
        {bom.lumber.map((group) => (
          <CutPlan key={`${group.size}-${group.treated}`} group={group} marks={marks} />
        ))}
      </details>
      {bom.warnings.length > 0 && (
        <ul className="warnings">
          {bom.warnings.map(({ source, message }) => (
            <li key={`${source}: ${message}`}>
              <strong>{source}</strong> {message}
            </li>
          ))}
        </ul>
      )}

      {bom.sheets.length > 0 && (
        <>
          <h3>Sheets</h3>
          <table className="cutlist">
            <thead>
              <tr>
                <th>Sheet</th>
                <th className="number">Qty</th>
                <th>Used for</th>
              </tr>
            </thead>
            <tbody>
              {bom.sheets.map(({ sheet, count, uses, waste }) => (
                <tr key={sheet}>
                  <td>{sheetLabel(sheet)}</td>
                  <td className="number">{count}</td>
                  <td>
                    {uses.map(({ label, panels }) => `${label}: ${panels} panels`).join('; ')}
                    <span className="note"> Waste {percent(waste)}.</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <LineTable title="Concrete" lines={bom.concrete} />
      <LineTable title="Hardware" lines={bom.hardware} />
      <LineTable title="Roofing" lines={bom.roofing} />

      <ul className="bom-notes">
        <li>Lumber: each cut takes the saw kerf from the lumber catalog. A piece as long as a stock length, such as a precut stud, takes that board.</li>
        <li>Sheets: each panel is cut from the rectangle around it. Offcuts are used again along the width of a sheet.</li>
        <li>Concrete volumes are net. Add for waste and an uneven subgrade.</li>
      </ul>
    </div>
  );
}

const stockName = (group: LumberGroup) => `${group.size}${group.treated ? ' PT' : ''}`;
const pieceText = (marks: ReadonlyMap<string, string>, { id, length }: Piece) => `${marks.get(id) ?? id} ${formatInches(length)}`;

function LumberRows({ group, marks }: { group: LumberGroup; marks: ReadonlyMap<string, string> }) {
  const label = stockName(group);
  const bought = group.boards.reduce((sum, { stock }) => sum + stock, 0);
  return (
    <tbody>
      <tr className="group">
        <th colSpan={2}>
          {label}{' '}
          <span className="note">
            {group.boards.length} boards, {Math.round(bought / 12)} ft, waste {percent(group.waste)}
          </span>
        </th>
      </tr>
      {[...Map.groupBy(group.boards, ({ stock }) => stock)].map(([stock, boards]) => (
        <tr key={stock}>
          <td>{formatLength(stock)}</td>
          <td className="number">{boards.length}</td>
        </tr>
      ))}
      {group.tooLong.length > 0 && (
        <tr>
          <td>Special order</td>
          <td className="number">{group.tooLong.length}</td>
        </tr>
      )}
      {group.tooLong.length > 0 && (
        <tr>
          <td colSpan={2} className="note">
            Longer than any stock: {group.tooLong.map((piece) => pieceText(marks, piece)).join(', ')}
          </td>
        </tr>
      )}
    </tbody>
  );
}

// The pieces cut from each board, by stock length. Boards with the same pieces show once, with a count.
function CutPlan({ group, marks }: { group: LumberGroup; marks: ReadonlyMap<string, string> }) {
  return (
    <>
      <h4>{stockName(group)}</h4>
      <ul>
        {[...Map.groupBy(group.boards, ({ stock }) => stock)].flatMap(([stock, boards]) =>
          [...Map.groupBy(boards, (board) => board.pieces.map((piece) => pieceText(marks, piece)).join(', '))].map(([pieces, same]) => (
            <li key={`${stock}: ${pieces}`}>
              <strong>
                {same.length} × {formatLength(stock)}
              </strong>
              : {pieces}
            </li>
          )),
        )}
      </ul>
    </>
  );
}

function LineTable({ title, lines }: { title: string; lines: readonly Line[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <table className="cutlist">
        <thead>
          <tr>
            <th>Item</th>
            <th className="number">Qty</th>
            <th>Unit</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ item, quantity, unit, note }) => (
            <tr key={item}>
              <td>{item}</td>
              <td className="number">{quantity}</td>
              <td className="unit">{unit}</td>
              <td className="note">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
