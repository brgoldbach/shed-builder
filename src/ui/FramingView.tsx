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

export function FramingView({ drawings, selected, onPick, designName, pdfName }: Props & { designName: string; pdfName: string }) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [paper, setPaper] = useState<keyof typeof PAPERS>('letter');
  const [making, setMaking] = useState(false);
  const open = drawings.find(({ id }) => id === zoomed);
  const close = useCallback(() => setZoomed(null), []);
  return (
    <div className="drawings">
      <div className="panel-toolbar">
        <nav className="drawing-index" aria-label="Drawings">
          {drawings.map(({ id, title }) => (
            <button key={id} onClick={() => document.getElementById(`drawing-${id}`)?.scrollIntoView({ block: 'start' })}>
              {title.replace(', from outside', '')}
            </button>
          ))}
        </nav>
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
            try {
              // Loaded on demand: the PDF library is large.
              const { downloadPlans } = await import('./pdf');
              await downloadPlans(drawings, designName, paper, pdfName);
            } finally {
              setMaking(false);
            }
          }}
        >
          {making ? 'Making PDF…' : 'Download PDF'}
        </button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      {drawings.map((drawing) => (
        <figure key={drawing.id} id={`drawing-${drawing.id}`} className="drawing">
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

  // A drag pans; a click with no drag still picks a member.
  const startDrag = (event: ReactPointerEvent) => {
    let last = { x: event.clientX, y: event.clientY };
    let travel = 0;
    dragged.current = false;
    const move = (moved: PointerEvent) => {
      const [dx, dy] = [moved.clientX - last.x, moved.clientY - last.y];
      travel += Math.hypot(dx, dy);
      if (travel > 4) dragged.current = true;
      last = { x: moved.clientX, y: moved.clientY };
      setView((current) => current && { ...current, x: current.x + dx, y: current.y + dy });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  return (
    <div className="viewer" role="dialog" aria-label={drawing.title}>
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
