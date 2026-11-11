import { LUMBER, SHEETS, TWO_BY, stockFor, type LumberSize } from '../catalog';
import { OPPOSITE, type Addition, type ShedConfig } from '../config';
import { ASSEMBLIES, corners, LEFT_OUT, type Member, type Point, type Solid, type Vec3, type Warning } from '../member';
import { naming } from '../naming';
import { formatInches, formatLength } from '../units';
import type { RoofPlane, Soffit } from './roof';
import { idMaker, planeMember } from './section';
import { deckHeights, frameDeck, type DeckFacts } from './deck';
import { gradeOf } from './floor';
import { splitPlate, wallFrames, type Wall } from './walls';

const PLY = 1.5;
const CLEARANCE = 1.5; // lean-to roof surface to the main roof's underside
const HEADROOM = 80; // a lower clear height under the beam gets a warning
const MIN_POST = 12; // a shorter post gets a warning
const LAP = 24; // an extension rafter in the main roof's plane laps its main rafter this far in from the wall line
const UP: Vec3 = [0, 0, 1];
const DOWN: Vec3 = [0, 0, -1];
const NEAR = 0.01;

/** What the span checks and the BOM need from one lean-to. Lengths in inches. */
export interface LeanTo {
  side: Wall;
  addition: Addition;
  rafterSpan: number; // ledger face, or the wall's outside face, to the inner end of the beam seat, horizontal
  postSpacing: number; // post center to post center
  beamTributary: number; // horizontal roof carried per unit length of beam
  lags: number; // two at each main-wall stud behind the ledger
  deck: DeckFacts | null;
}

/** The main roof facts a lean-to builds against. */
export interface MainRoof {
  soffit: Soffit;
  eave: { top: number; plate: number; bearing: number };
}

/** Open lean-tos on posts against the main walls: below the main roof's soffit, or extending its eave. */
export function frameAdditions(
  config: ShedConfig,
  main: MainRoof,
  framing: readonly Member[],
): { members: Member[]; solids: Solid[]; warnings: Warning[]; planes: RoofPlane[]; leanTos: LeanTo[] } {
  const out = { members: [] as Member[], solids: [] as Solid[], warnings: [] as Warning[], planes: [] as RoofPlane[], leanTos: [] as LeanTo[] };
  for (const addition of config.additions) {
    frameLeanTo(config, addition, addition.side, addition.center, main, framing, out);
    // The mirror image across the building: the same distance from the opposite corner.
    if (addition.mirror) frameLeanTo(config, addition, OPPOSITE[addition.side], 100 - addition.center, main, framing, out);
  }
  return out;
}

function frameLeanTo(
  config: ShedConfig,
  addition: Addition,
  side: Wall,
  center: number,
  { soffit, eave }: MainRoof,
  framing: readonly Member[],
  out: ReturnType<typeof frameAdditions>,
) {
  const { width, length, walls, roof, foundation, catalog } = config;
  const frame = wallFrames(width, length)[side];
  const assembly = `addition.${side}` as const;
  const nextId = idMaker(ASSEMBLIES[assembly].prefix);
  const label = naming(config).side(side);
  const source = `${label.charAt(0).toUpperCase()}${label.slice(1)} lean-to`;
  const warn = (message: string) => out.warnings.push({ source, message });
  const maxStock = (size: LumberSize) => Math.max(...stockFor(catalog, size));

  // Along the wall from its left corner, viewed from outside.
  const span = side === 'front' || side === 'back' ? length : width;
  const middle = (center / 100) * span;
  let [u0, u1] = addition.length === 'full' ? [0, span] : [middle - addition.length / 2, middle + addition.length / 2];
  if (u0 < -NEAR || u1 > span + NEAR) {
    warn('The lean-to runs past the ends of the wall. It stops at the corners.');
    [u0, u1] = [Math.max(0, u0), Math.min(span, u1)];
  }
  const run = u1 - u0;
  // A point `x` out from the wall's outside face, at `u` along it.
  const at = (u: number, x: number, z: number): Vec3 => [
    frame.origin[0] + frame.u[0] * u - frame.v[0] * x,
    frame.origin[1] + frame.u[1] * u - frame.v[1] * x,
    z,
  ];
  const outward: Vec3 = [-frame.v[0], -frame.v[1], 0];

  const wallSheet = walls.sheathing === 'none' ? 0 : SHEETS[walls.sheathing].thick;
  const metal = addition.roofing === 'metal';
  // What sits on the rafters under the roofing: purlins, or the main roof's sheathing.
  const roofSheet = metal ? LUMBER[addition.purlin].thick : roof.sheathing === 'none' ? 0 : SHEETS[roof.sheathing].thick;
  const extension = addition.attach === 'extension';
  const pitch = addition.pitch === 'main' ? roof.pitch : addition.pitch;
  const samePlane = extension && pitch === roof.pitch;
  const angle = Math.atan(pitch / 12);
  const [rise, cos, sin] = [pitch / 12, Math.cos(angle), Math.sin(angle)];
  const depth = LUMBER[addition.rafter].width;
  const plumb = depth / cos;
  const ledger = TWO_BY.find((size) => LUMBER[size].width >= plumb) ?? '2x12';
  if (!extension && LUMBER[ledger].width < plumb) warn(`A 2x12 ledger is shallower than the rafter's ${formatInches(plumb)} plumb end.`);
  const ledgerDepth = LUMBER[ledger].width;

  // Below the soffit: the rafters' plumb ends meet the ledger, as high as the main roof allows less
  // the drop. Main roof and lean-to roof are straight between the soffit's breaks, so the breaks
  // and the lean-to's ends bound it. Extension: the rafters continue the main roof's top line from
  // over the wall's outside face, and lap the main rafters inward: 2 ft in the same plane, or to the
  // wall's inside face at a broken pitch.
  const start = extension ? (samePlane ? -LAP : -eave.bearing) : wallSheet + PLY;
  const ledgerTop = extension
    ? 0
    : Math.min(
        ...soffit.breaks(side).flatMap((x) =>
          [u0, u1].flatMap((u) => {
            const point = Math.max(x, wallSheet);
            const under = soffit.under(side, u, point);
            return under === null ? [] : [under - CLEARANCE - roofSheet + rise * (point - start)];
          }),
        ),
      ) - addition.drop;
  const [anchorX, anchorZ] = extension ? [0, eave.top] : [start, ledgerTop];
  const top = (x: number) => anchorZ - rise * (x - anchorX);
  const bottom = (x: number) => top(x) - plumb;

  // Posts centered on the support line, the beam centered on the posts.
  const post = LUMBER[addition.post].width;
  const line = addition.depth - post / 2;
  const beamWidth = addition.beamPlies * PLY;
  const beamDepth = LUMBER[addition.beam].width;
  const heel = line + beamWidth / 2;
  // The birdsmouth seat takes the beam width, no deeper than 1/3 of the rafter.
  let seat = Math.min(beamWidth, Math.floor((depth / 3 / sin) * 16) / 16);
  if (seat < PLY) {
    warn(`A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 of the ${addition.rafter} rafter. Use a deeper rafter or a lower pitch.`);
    seat = PLY;
  }
  const grade = gradeOf(config, framing);
  // The lean-to's footprint at grade, for a lean-to that cannot be framed.
  const leaveOut = (message: string) => {
    const outline = [at(u0, 0, grade), at(u1, 0, grade), at(u1, addition.depth, grade), at(u0, addition.depth, grade)];
    out.warnings.push({ source, message: `${message} ${LEFT_OUT}`, missing: { assembly, outline } });
  };
  if (!Number.isFinite(ledgerTop)) {
    leaveOut('The main roof does not reach past the wall here, so the ledger has no height. Give the main roof an overhang on this side.');
    return;
  }
  if (heel - seat <= Math.max(start, 0)) {
    leaveOut('The lean-to is too shallow for its beam. Make it deeper.');
    return;
  }
  const beamTop = bottom(heel - seat);
  const tail = Math.max(addition.depth + addition.eaveOverhang, heel);
  // A deck's heights (`deck.ts`). Its piers rise to the deck beam, unless a deck post of MIN_POST
  // or more fits under it.
  const deckHeight = deckHeights(config, addition);
  const natural = grade + foundation.pier.aboveGrade;
  const pierTop = !deckHeight || deckHeight.joistBottom - natural >= MIN_POST ? natural : deckHeight.joistBottom;
  // The posts stand on the slab, on the piers, or on the deck beam.
  const postBottom = addition.floor === 'slab' ? grade : (deckHeight?.joistTop ?? pierTop);
  const postLength = beamTop - beamDepth - postBottom;
  if (postLength < NEAR) {
    leaveOut('The beam is at or below the post bases. Lower the pitch or the drop, or make the lean-to shallower.');
    return;
  }
  if (postLength < MIN_POST) warn(`The posts are only ${formatInches(postLength)} long.`);
  const clear = beamTop - beamDepth - (deckHeight?.top ?? grade);
  if (clear < HEADROOM) warn(`The clear height under the beam is ${formatLength(clear)}, less than 6' 8".`);

  const degrees = `${((angle * 180) / Math.PI).toFixed(1)}°`;
  const beamText = `on the beam: heel line ${formatInches((heel - start) / cos)} from the upper end on the top edge; seat ${formatInches(seat)}, heel ${formatInches(rise * seat)}. Tail ${formatInches((tail - heel) / cos)} past the heel line on the top edge, plumb cut.`;
  let starts: number[];
  let outline: Point[];
  let note: string;
  const toBeam: Point[] = [
    [start, top(start)],
    [tail, top(tail)],
    [tail, bottom(tail)],
    [heel, bottom(heel)],
    [heel, beamTop],
    [heel - seat, beamTop],
  ];
  if (extension) {
    // Beside each main rafter, away from its ties: on the -x side, or the +x side of the first.
    const xs = [
      ...new Set(
        framing
          .filter(({ role, assembly }) => role === 'rafter' && assembly === 'roof')
          .map((member) => Math.round(Math.min(...corners(member).map(([x]) => x)) * 16) / 16),
      ),
    ].sort((first, second) => first - second);
    // Extensions are on eave walls, whose u runs along ±x.
    const uOf = (x: number) => (x - frame.origin[0]) * frame.u[0];
    starts = xs
      .map((x) => (x < NEAR ? x + PLY : x - PLY))
      .map((x) => Math.min(uOf(x), uOf(x + PLY)))
      .sort((first, second) => first - second);
    // A second birdsmouth on the main wall's bearing plate: heel at the outside face, seat inward
    // to where the rafter's underside meets the plate.
    const seatEnd = (anchorZ - plumb - eave.plate) / rise;
    if (-seatEnd > Math.floor((depth / 3 / sin) * 16) / 16 + NEAR) {
      warn(`The birdsmouth on the main wall cuts deeper than 1/3 of the ${addition.rafter} rafter. Use a rafter no deeper than the main rafters.`);
    }
    const stand = (rise - roof.pitch / 12) * -start;
    if (stand > 0.125) warn(`At the steeper pitch the lean-to rafters stand ${formatInches(stand)} over the main roof plane at their upper ends. Trim them flush.`);
    outline = [...toBeam, [0, bottom(0)], [0, eave.plate], ...(seatEnd > start ? ([[seatEnd, eave.plate], [start, bottom(start)]] as Point[]) : ([[start, eave.plate]] as Point[]))];
    note =
      `Laps the main rafter ${formatInches(-start)} in from the wall line, nailed to it; upper end plumb cut ${degrees}. ` +
      `Birdsmouths on the main wall (heel at its outside face, seat ${formatInches(Math.min(-seatEnd, -start))}) and ${beamText}`;
  } else {
    // One flush with each end, the rest on o.c. multiples from the left end.
    starts = [u0, u1 - PLY];
    for (let index = 1; u0 + index * addition.oc < u1; index++) {
      const from = u0 + index * addition.oc - PLY / 2;
      if (from >= u0 + PLY && from + PLY <= u1 - PLY) starts.push(from);
    }
    starts.sort((first, second) => first - second);
    outline = [...toBeam, [start, bottom(start)]];
    note = `Plumb cut ${degrees} at the ledger, in a joist hanger. Birdsmouth ${beamText}`;
  }
  const centers = starts.map((u) => u + PLY / 2);
  // The plane extrudes along outward × up; start each rafter at the end that extrusion leaves from.
  const along = outward[1] * frame.u[0] - outward[0] * frame.u[1];
  for (const u of starts) {
    const plane = { origin: at(along > 0 ? u : u + PLY, 0, 0), h: outward };
    out.members.push(planeMember({ id: nextId('R'), assembly, role: 'rafter', size: addition.rafter, note }, plane, outline, [cos, -sin]));
  }

  const board = (code: string, role: Member['role'], size: LumberSize, treated: boolean, length: number, origin: Vec3, axes: Member['axes'], note?: string) =>
    out.members.push({ id: nextId(code), assembly, role, size, treated, length, origin, axes, ...(note && { note }) });
  const alongWall = { length: frame.u, width: UP, thick: frame.v };

  if (!extension) {
    for (const [from, to] of splitPlate([u0, u1], maxStock(ledger), centers)) {
      board('L', 'ledger', ledger, false, to - from, at(from, start, ledgerTop - ledgerDepth), alongWall, 'Lag-bolt through the sheathing into each main-wall stud.');
    }
  }

  const count = Math.max(2, Math.ceil((run - post) / addition.maxSpacing) + 1);
  const posts = Array.from({ length: count }, (_, index) => u0 + post / 2 + (index * (run - post)) / (count - 1));
  for (let ply = 0; ply < addition.beamPlies; ply++) {
    const outer = line - beamWidth / 2 + (ply + 1) * PLY;
    for (const [from, to] of splitPlate([u0, u1], maxStock(addition.beam), posts)) {
      board('B', 'beam', addition.beam, false, to - from, at(from, outer, beamTop - beamDepth), alongWall);
    }
  }
  const postAxes = { length: UP, width: frame.u, thick: frame.v };
  const onDeck = !deckHeight ? undefined : deckHeight.supports ? 'Stands on the deck beam.' : 'Stands on the deck beam, over the pier.';
  for (const u of posts) board('P', 'post', addition.post, true, postLength, at(u - post / 2, line + post / 2, postBottom), postAxes, onDeck);

  const fasciaThick = addition.fascia === 'none' ? 0 : LUMBER[addition.fascia].thick;
  if (addition.fascia !== 'none') {
    for (const [from, to] of splitPlate([u0, u1], maxStock(addition.fascia), centers)) {
      board('FA', 'fascia', addition.fascia, false, to - from, at(from, tail, top(tail)), { length: frame.u, width: DOWN, thick: outward });
    }
  }

  if (addition.floor === 'slab') {
    const ends = [at(u0, 0, grade - foundation.slab.thickness), at(u1, addition.depth, grade)];
    const min: Vec3 = [Math.min(ends[0][0], ends[1][0]), Math.min(ends[0][1], ends[1][1]), ends[0][2]];
    const max: Vec3 = [Math.max(ends[0][0], ends[1][0]), Math.max(ends[0][1], ends[1][1]), ends[1][2]];
    out.solids.push({ id: nextId('SL'), label: 'Slab', layer: 'foundation', material: 'concrete', shape: { kind: 'box', min, max } });
  } else if (!deckHeight?.supports) {
    const { pier } = foundation;
    // At least the pier depth below grade, and below its top.
    const base = Math.min(grade, pierTop) - pier.depth;
    for (const u of posts) {
      out.solids.push({
        id: nextId('PR'),
        label: `Pier, ${pier.diameter}" diameter`,
        layer: 'foundation',
        material: 'concrete',
        shape: { kind: 'cylinder', base: at(u, line, base), radius: pier.diameter / 2, height: pierTop - base },
      });
    }
  }

  const deck = deckHeight && frameDeck({
    config,
    addition,
    side,
    frame,
    span: [u0, u1],
    line,
    posts,
    grade,
    pierTop,
    heights: deckHeight,
    assembly,
    nextId,
    members: out.members,
    solids: out.solids,
    warn,
  });

  if (metal) {
    // Flat across the rafter tops, from the tail up to the ledger end, evenly spaced along the slope.
    const purlinWidth = LUMBER[addition.purlin].width;
    const slope = (tail - start) / cos;
    const gaps = Math.max(1, Math.ceil((slope - purlinWidth) / addition.purlinSpacing));
    const upSlope: Vec3 = [frame.v[0] * cos, frame.v[1] * cos, sin];
    const normal: Vec3 = [outward[0] * sin, outward[1] * sin, cos];
    for (let index = 0; index <= gaps; index++) {
      const lower = (index * (slope - purlinWidth)) / gaps; // along the slope from the tail
      const x = tail - lower * cos;
      for (const [from, to] of splitPlate([u0, u1], maxStock(addition.purlin), centers)) {
        board('PU', 'purlin', addition.purlin, false, to - from, at(from, x, top(x)), { length: frame.u, width: upSlope, thick: normal });
      }
    }
  }

  // Roofing from over the fascia up to the wall: sheathing, or the metal panels' area.
  const low = tail + fasciaThick;
  out.planes.push({
    assembly,
    sheathed: !metal,
    origin: at(u0, low, top(low)),
    u: frame.u,
    v: [frame.v[0] * cos, frame.v[1] * cos, sin],
    length: run,
    width: (low - (extension ? 0 : wallSheet)) / cos,
    eaves: 1,
  });

  // Studs behind the ledger, each taking two lag screws.
  const ledgerSpan = [ledgerTop - ledgerDepth, ledgerTop];
  const studs = framing.filter((member) => {
    if (member.assembly !== `wall.${side}` && member.assembly !== `gable.${side}`) return false;
    if (Math.abs(member.axes.length[2]) < 1 - NEAR) return false;
    const points = corners(member);
    const us = points.map((point) => (point[0] - frame.origin[0]) * frame.u[0] + (point[1] - frame.origin[1]) * frame.u[1]);
    const middleU = (Math.min(...us) + Math.max(...us)) / 2;
    const zs = points.map(([, , z]) => z);
    return middleU > u0 && middleU < u1 && Math.min(...zs) < ledgerSpan[1] && Math.max(...zs) > ledgerSpan[0];
  });

  out.leanTos.push({
    side,
    addition,
    rafterSpan: heel - seat - (extension ? 0 : start),
    postSpacing: (run - post) / (count - 1),
    beamTributary: (line - (extension ? 0 : start)) / 2 + (tail - line),
    lags: extension ? 0 : 2 * studs.length,
    deck,
  });
}
