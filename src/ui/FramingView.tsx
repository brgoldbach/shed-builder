import type { Point, Role } from '../core/member';
import { formatInches, formatLength } from '../core/units';
import { bounds, type Dimension, type Drawing, type Shape, type Side } from '../drawings/drawing';

const MAX_WIDTH = 900; // px
const MAX_HEIGHT = 900;
const MAX_SCALE = 16; // px per inch
const FONT = 11;
const MARK_FONT = 9;
const CHAR = 0.6; // average glyph width per px of font size
const GAP = 14; // drawing to its first dimension tier
const CHAIN = 24; // height of a chain tier
const MARGIN = 16;
const TICK = 3;
const HEADERS = new Set<Role>(['header', 'header.plate', 'header.loft']);

interface Props {
  drawings: readonly Drawing[];
  selected: ReadonlySet<string>;
  onPick: (id: string) => void;
}

export function FramingView({ drawings, selected, onPick }: Props) {
  return (
    <div className="drawings">
      <div className="panel-toolbar">
        <button onClick={() => window.print()}>Print</button>
      </div>
      {drawings.map((drawing) => (
        <figure key={drawing.id} className="drawing">
          <figcaption>{drawing.title}</figcaption>
          <DrawingSvg drawing={drawing} selected={selected} onPick={onPick} />
          {drawing.notes.length > 0 && (
            <ul>
              {drawing.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </figure>
      ))}
    </div>
  );
}

const textWidth = (text: string, size = FONT) => text.length * size * CHAR;
const runningLabels = (dim: Extract<Dimension, { kind: 'running' }>) => dim.at.map((value) => formatInches(value - dim.origin));
const sideDims = (dims: readonly Dimension[]) => dims.filter((dim) => dim.kind !== 'aligned');

function tierSize(dim: Exclude<Dimension, { kind: 'aligned' }>): number {
  if (dim.kind === 'chain') return CHAIN;
  return Math.max(0, ...runningLabels(dim).map((label) => textWidth(label))) + 14;
}

/** Text angle in degrees for a px direction, turned so the text reads left to right or bottom to top. */
function upright(dx: number, dy: number): number {
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle >= 90 - 1e-6) return angle - 180;
  if (angle < -90 - 1e-6) return angle + 180;
  return angle;
}

function DrawingSvg({ drawing, selected, onPick }: { drawing: Drawing; selected: ReadonlySet<string>; onPick: (id: string) => void }) {
  const { min, max } = bounds(drawing.shapes);
  const scale = Math.min(MAX_WIDTH / (max[0] - min[0]), MAX_HEIGHT / (max[1] - min[1]), MAX_SCALE);

  // Offset of each side tier from the drawing, and the room each side needs.
  const tiers: Record<Side, number[]> = { bottom: [], top: [], left: [], right: [] };
  for (const dim of sideDims(drawing.dims)) {
    tiers[dim.side][dim.tier] = Math.max(tiers[dim.side][dim.tier] ?? 0, tierSize(dim));
  }
  const tierOffset = (side: Side, tier: number) =>
    GAP + tiers[side].slice(0, tier).reduce((sum, size) => sum + (size ?? 0), 0);
  const room = (side: Side) => (tiers[side].length ? tierOffset(side, tiers[side].length) : 0);
  const reach = Math.max(0, ...drawing.dims.map((dim) => (dim.kind === 'aligned' ? Math.abs(dim.offset) + FONT : 0)));
  const pad = (side: Side) => MARGIN + Math.max(room(side), reach);
  const [left, top] = [pad('left'), pad('top')];
  const geometry = { x0: left, x1: left + (max[0] - min[0]) * scale, y0: top, y1: top + (max[1] - min[1]) * scale };
  const width = geometry.x1 + pad('right');
  const height = geometry.y1 + pad('bottom');
  const px = ([x, y]: Point): Point => [left + (x - min[0]) * scale, top + (max[1] - y) * scale];

  return (
    <svg className={drawing.wireframe ? 'wireframe' : undefined} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      {drawing.shapes.map((shape, index) => (
        <ShapeView
          key={shape.id ?? `part-${index}`}
          shape={shape}
          px={px}
          scale={scale}
          selected={shape.id !== undefined && selected.has(shape.id)}
          onPick={onPick}
        />
      ))}
      {drawing.outlines.map((outline, index) => (
        <polygon key={index} className="outline" points={outline.map((point) => px(point).join(',')).join(' ')} />
      ))}
      {drawing.labels.map(({ at, text, room }) => {
        // Clear of the RO height dimension inside the opening's left edge.
        if (textWidth(text) + 2 * (GAP + FONT) > room * scale) return null;
        const [x, y] = px(at);
        return (
          <text key={`${text}-${x}-${y}`} className="label halo" x={x} y={y} textAnchor="middle" dominantBaseline="central">
            {text}
          </text>
        );
      })}
      {drawing.dims.map((dim, index) => (
        <g key={index} className="dim">
          {dim.kind === 'aligned' ? (
            <Aligned dim={dim} px={px} />
          ) : (
            <SideDim dim={dim} px={px} geometry={geometry} offset={tierOffset(dim.side, dim.tier)} />
          )}
        </g>
      ))}
    </svg>
  );
}

interface ShapeProps {
  shape: Shape;
  px: (point: Point) => Point;
  scale: number;
  selected: boolean;
  onPick: (id: string) => void;
}

function ShapeView({ shape, px, scale, selected, onPick }: ShapeProps) {
  const classes = ['shape', shape.kind];
  if (shape.role && HEADERS.has(shape.role)) classes.push('header');
  if (shape.treated) classes.push('treated');
  if (selected) classes.push('selected');
  const { id } = shape;
  const events = id === undefined ? {} : { onClick: () => onPick(id) };
  const title = <title>{shape.title}</title>;

  if (shape.outline.kind === 'circle') {
    const [cx, cy] = px(shape.outline.center);
    return (
      <circle className={classes.join(' ')} cx={cx} cy={cy} r={shape.outline.radius * scale} {...events}>
        {title}
      </circle>
    );
  }
  const points = shape.outline.points.map(px);
  return (
    <g {...events}>
      <polygon className={classes.join(' ')} points={points.map((point) => point.join(',')).join(' ')}>
        {title}
      </polygon>
      {shape.cut && points.length === 4 && (
        <path className="cut-mark" d={`M${points[0].join(',')}L${points[2].join(',')}M${points[1].join(',')}L${points[3].join(',')}`} />
      )}
      {shape.mark && <Mark text={shape.mark} points={points} axis={shape.axis} />}
    </g>
  );
}

// The cut-list mark along the member, when it fits inside.
function Mark({ text, points, axis }: { text: string; points: Point[]; axis?: Point }) {
  const [ax, ay] = axis ? [axis[0], -axis[1]] : [1, 0];
  const along = points.map(([x, y]) => x * ax + y * ay);
  const across = points.map(([x, y]) => -x * ay + y * ax);
  const [alongLow, alongHigh] = [Math.min(...along), Math.max(...along)];
  const [acrossLow, acrossHigh] = [Math.min(...across), Math.max(...across)];
  if (alongHigh - alongLow < textWidth(text, MARK_FONT) + 4 || acrossHigh - acrossLow < MARK_FONT) return null;
  const middleAlong = (alongLow + alongHigh) / 2;
  const middleAcross = (acrossLow + acrossHigh) / 2;
  const x = middleAlong * ax - middleAcross * ay;
  const y = middleAlong * ay + middleAcross * ax;
  return (
    <text className="mark" x={x} y={y} textAnchor="middle" dominantBaseline="central" transform={`rotate(${upright(ax, ay)} ${x} ${y})`}>
      {text}
    </text>
  );
}

function Tick({ at: [x, y] }: { at: Point }) {
  return <line x1={x - TICK} y1={y + TICK} x2={x + TICK} y2={y - TICK} />;
}

function DimText({ at: [x, y], angle, children }: { at: Point; angle: number; children: string }) {
  return (
    <text className="halo" x={x} y={y} textAnchor="middle" dominantBaseline="central" transform={angle ? `rotate(${angle} ${x} ${y})` : undefined}>
      {children}
    </text>
  );
}

function Aligned({ dim, px }: { dim: Extract<Dimension, { kind: 'aligned' }>; px: (point: Point) => Point }) {
  const [dx, dy] = [dim.to[0] - dim.from[0], dim.to[1] - dim.from[1]];
  const length = Math.hypot(dx, dy);
  // The drawing's left normal, in px with y down.
  const normal: Point = [-dy / length, -dx / length];
  const sign = Math.sign(dim.offset);
  const shift = ([x, y]: Point, by: number): Point => [x + normal[0] * by, y + normal[1] * by];
  const [from, to] = [px(dim.from), px(dim.to)];
  const [start, end] = [shift(from, dim.offset), shift(to, dim.offset)];
  return (
    <>
      {[from, to].map((point, index) => {
        const [x1, y1] = shift(point, sign * 2);
        const [x2, y2] = shift(point, dim.offset + sign * 4);
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} />
      <Tick at={start} />
      <Tick at={end} />
      <DimText at={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]} angle={upright(end[0] - start[0], end[1] - start[1])}>
        {formatInches(length)}
      </DimText>
    </>
  );
}

interface Geometry {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function SideDim({
  dim,
  px,
  geometry,
  offset,
}: {
  dim: Exclude<Dimension, { kind: 'aligned' }>;
  px: (point: Point) => Point;
  geometry: Geometry;
  offset: number;
}) {
  const horizontal = dim.side === 'bottom' || dim.side === 'top';
  const outward = dim.side === 'bottom' || dim.side === 'right' ? 1 : -1;
  const edge = { bottom: geometry.y1, top: geometry.y0, left: geometry.x0, right: geometry.x1 }[dim.side];
  const line = edge + outward * offset;
  // A position along the side, and the point at `across` from the drawing.
  const along = (value: number) => (horizontal ? px([value, 0])[0] : px([0, value])[1]);
  const at = (position: number, level: number): Point => (horizontal ? [position, level] : [level, position]);
  const positions = (dim.kind === 'chain' ? dim.at : [dim.origin, ...dim.at]).map(along);
  const extensions = positions.map((position, index) => {
    const [x1, y1] = at(position, edge + outward * 3);
    const [x2, y2] = at(position, line + outward * 4);
    return <line key={`e${index}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
  });
  const [x1, y1] = at(Math.min(...positions), line);
  const [x2, y2] = at(Math.max(...positions), line);

  if (dim.kind === 'chain') {
    const format = dim.feet ? formatLength : formatInches;
    return (
      <>
        {extensions}
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        {positions.map((position, index) => (
          <Tick key={`t${index}`} at={at(position, line)} />
        ))}
        {dim.at.slice(1).map((value, index) => (
          <DimText key={`d${index}`} at={at((positions[index] + positions[index + 1]) / 2, line)} angle={horizontal ? 0 : -90}>
            {format(Math.abs(value - dim.at[index]))}
          </DimText>
        ))}
      </>
    );
  }

  const labels = runningLabels(dim);
  return (
    <>
      {extensions}
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {positions.map((position, index) => (
        <Tick key={`t${index}`} at={at(position, line)} />
      ))}
      {positions.slice(1).map((position, index) => {
        const [x, y] = at(position, line + outward * 6);
        // Bottom and top labels stand on end, reading upward. All labels run away from the drawing.
        return (
          <text
            key={`l${index}`}
            className="running"
            x={x}
            y={y}
            textAnchor={horizontal ? (outward === 1 ? 'end' : 'start') : outward === 1 ? 'start' : 'end'}
            dominantBaseline="central"
            transform={horizontal ? `rotate(-90 ${x} ${y})` : undefined}
          >
            {labels[index]}
          </text>
        );
      })}
    </>
  );
}
