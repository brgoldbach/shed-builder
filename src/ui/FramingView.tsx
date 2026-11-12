import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DISCLAIMER } from '../core/disclaimer';
import type { Drawing } from '../drawings/drawing';
import { DrawingSvg, layoutOf } from './DrawingSvg';

const PAPERS = { letter: 'Letter 11x8.5', tabloid: 'Tabloid 11x17' } as const;

interface Props {
  drawings: readonly Drawing[];
  selected: ReadonlySet<string>;
  onPick: (id: string) => void;
}

export function FramingView({
  drawings,
  selected,
  onPick,
  designName,
  pdfName,
  shareLink,
}: Props & { designName: string; pdfName: string; shareLink: string | null }) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [paper, setPaper] = useState<keyof typeof PAPERS>('letter');
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const open = drawings.find(({ id }) => id === zoomed);
  const close = useCallback(() => setZoomed(null), []);
  return (
    <div className="drawings">
      <div className="panel-toolbar">
        <select value={paper} aria-label="Paper" onChange={(event) => setPaper(event.target.value as keyof typeof PAPERS)}>
          {Object.entries(PAPERS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          disabled={making}
          onClick={async () => {
            setMaking(true);
            setFailed(null);
            try {
              // Loaded on demand: the PDF library is large.
              const { downloadPlans } = await import('./pdf');
              await downloadPlans(drawings, designName, paper, pdfName, shareLink);
            } catch (error) {
              setFailed(`The PDF was not made: ${(error as Error).message}`);
            } finally {
              setMaking(false);
            }
          }}
        >
          {making ? 'Making PDF…' : 'Download PDF'}
        </button>
        {failed && (
          <small className="error" role="alert">
            {failed}
          </small>
        )}
        <button onClick={() => window.print()}>Print</button>
      </div>
      {drawings.map((drawing) => (
        <figure key={drawing.id} className="drawing">
          <figcaption>
            {drawing.title}
            <button onClick={() => setZoomed(drawing.id)}>Zoom</button>
          </figcaption>
          <DrawingSvg drawing={drawing} selected={selected} onPick={onPick} />
          {drawing.notes.length > 0 && (
            <ul>
              {drawing.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <p className="notice print-only">{DISCLAIMER}</p>
        </figure>
      ))}
      {open && <Viewer drawing={open} selected={selected} onPick={onPick} onClose={close} />}
    </div>
  );
}

type View = { zoom: number; x: number; y: number };
const ZOOM_STEP = 1.25;
const clampZoom = (zoom: number) => Math.min(Math.max(zoom, 0.1), 40);

// One drawing over the whole window: the wheel or a pinch zooms about the pointer, a drag pans.
function Viewer({ drawing, selected, onPick, onClose }: Omit<Props, 'drawings'> & { drawing: Drawing; onClose: () => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const dragged = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const root = useRef<HTMLDivElement>(null);
  const { width, height } = layoutOf(drawing);

  const fit = useCallback(() => {
    const box = canvas.current!.getBoundingClientRect();
    const zoom = Math.min(box.width / width, box.height / height) * 0.95;
    setView({ zoom, x: (box.width - width * zoom) / 2, y: (box.height - height * zoom) / 2 });
  }, [width, height]);
  useLayoutEffect(fit, [fit]);

  const zoomAt = useCallback((factor: number, at?: { x: number; y: number }) => {
    const box = canvas.current!.getBoundingClientRect();
    const { x: cx, y: cy } = at ?? { x: box.width / 2, y: box.height / 2 };
    setView((current) => {
      if (!current) return current;
      const zoom = clampZoom(current.zoom * factor);
      const ratio = zoom / current.zoom;
      return { zoom, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio };
    });
  }, []);

  useEffect(() => {
    const element = canvas.current!;
    // Not passive, so the page does not scroll under the drawing.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') zoomAt(ZOOM_STEP);
      if (event.key === '-') zoomAt(1 / ZOOM_STEP);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [zoomAt, onClose]);

  // One pointer drags to pan; two pinch to zoom about their midpoint. A click with no drag still
  // picks a member. The first pointer down listens for all of them, until the last one is up.
  const startDrag = (event: ReactPointerEvent) => {
    const active = pointers.current;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (active.size > 1) {
      dragged.current = true;
      return;
    }
    let travel = 0;
    dragged.current = false;
    const spread = () => {
      const [first, second] = [...active.values()];
      return { distance: Math.hypot(second.x - first.x, second.y - first.y), x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    };
    const move = (moved: PointerEvent) => {
      const last = active.get(moved.pointerId);
      if (!last) return;
      if (active.size === 1) {
        const [dx, dy] = [moved.clientX - last.x, moved.clientY - last.y];
        travel += Math.hypot(dx, dy);
        if (travel > 4) dragged.current = true;
        active.set(moved.pointerId, { x: moved.clientX, y: moved.clientY });
        setView((current) => current && { ...current, x: current.x + dx, y: current.y + dy });
        return;
      }
      const before = spread();
      active.set(moved.pointerId, { x: moved.clientX, y: moved.clientY });
      const after = spread();
      if (before.distance === 0) return;
      const box = canvas.current!.getBoundingClientRect();
      zoomAt(after.distance / before.distance, { x: after.x - box.left, y: after.y - box.top });
      setView((current) => current && { ...current, x: current.x + after.x - before.x, y: current.y + after.y - before.y });
    };
    const end = (ended: PointerEvent) => {
      active.delete(ended.pointerId);
      if (active.size > 0) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // Focus moves into the viewer while it is open, and back to what opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.focus();
    return () => opener?.focus();
  }, []);

  return (
    <div ref={root} className="viewer" role="dialog" aria-modal="true" aria-label={drawing.title} tabIndex={-1}>
      <div className="viewer-bar">
        <strong>{drawing.title}</strong>
        <span className="muted">Scroll or pinch to zoom, drag to pan, Esc to close.</span>
        <button onClick={() => zoomAt(1 / ZOOM_STEP)} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => zoomAt(ZOOM_STEP)} aria-label="Zoom in">
          +
        </button>
        <button onClick={fit}>Fit</button>
        <button onClick={onClose}>Close</button>
      </div>
      <div
        ref={canvas}
        className="viewer-canvas drawing"
        onPointerDown={startDrag}
        onClickCapture={(event) => {
          if (dragged.current) event.stopPropagation();
        }}
      >
        {view && (
          <div className="viewer-art" style={{ left: view.x, top: view.y }}>
            <DrawingSvg drawing={drawing} selected={selected} onPick={onPick} zoom={view.zoom} />
          </div>
        )}
      </div>
    </div>
  );
}
