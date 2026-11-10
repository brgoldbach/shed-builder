import { useMemo } from 'react';
import { ROLES, type Member } from '../core/member';
import type { Naming } from '../core/naming';
import type { CutLine } from '../core/out/cutlist';
import { formatInches } from '../core/units';
import { pieceDrawing } from '../drawings/piece';
import { stockLabel } from './CutListTable';
import { DrawingSvg, fitScale, layoutOf } from './DrawingSvg';

const NONE = new Set<string>();
const ROOM = { width: 420, height: 160 }; // px for the piece drawing

/** The selected cut-list line, with one of its pieces laid flat and dimensioned. Close clears the selection. */
export function PieceInfo({ line, member, names, onClose }: { line: CutLine; member: Member; names: Naming; onClose: () => void }) {
  const { drawing, scale, width } = useMemo(() => {
    const drawing = pieceDrawing(member, line.mark);
    const scale = fitScale(drawing, ROOM.width, ROOM.height);
    return { drawing, scale, width: layoutOf(drawing, scale).width };
  }, [member, line.mark]);
  return (
    <>
      <button className="close" aria-label="Close the piece drawing" onClick={onClose}>
        ×
      </button>
      <div>
        <strong>{line.mark}</strong> {names.assembly(line.assembly).label}, {ROLES[line.role].toLowerCase()}: {line.ids.length} ×{' '}
        {stockLabel(line)} at {formatInches(line.length)}
      </div>
      <div className="drawing piece" style={{ width }}>
        <DrawingSvg drawing={drawing} selected={NONE} onPick={() => {}} scale={scale} />
      </div>
      {line.note && <p className="muted piece-note">{line.note}</p>}
    </>
  );
}
