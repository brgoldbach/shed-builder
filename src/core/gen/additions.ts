import { LUMBER, SHEETS, TWO_BY, stockFor, type LumberSize } from '../catalog';
import { OPPOSITE, type Addition, type ShedConfig } from '../config';
import { ASSEMBLIES, corners, LEFT_OUT, type Member, type Point, type Solid, type Vec3, type Warning } from '../member';
import { naming } from '../naming';
import { formatInches, formatLength } from '../units';
import type { RoofPlane, Soffit } from './roof';
import { idMaker, planeMember } from './section';
import { gradeOf } from './floor';
import { splitPlate, wallFrames, type Wall } from './walls';

const PLY = 1.5;
const CLEARANCE = 1.5; // lean-to roof surface to the main roof's underside
const HEADROOM = 80; // a lower clear height under the beam gets a warning
const MIN_POST = 12; // a shorter post gets a warning
const DECK_GAP = 0.25; // between deck boards

type Span = readonly [number, number];
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
  // The deck: ledger face to the beam's inner face, the deck each unit of beam carries, and the
  // piers that seat the beam directly (none when deck posts stand under it).
  deck: { joist: LumberSize; plies: number; joistSpan: number; beamTributary: number; seats: number } | null;
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
  // A deck: 2x6 boards over joists, level with the floor less the drop, on a flush beam.
  const deckTop = addition.floor === 'deck' ? -addition.deck.drop : null;
  const deckJoistTop = deckTop === null ? null : deckTop - PLY;
  const deckBeamBottom = deckJoistTop === null ? null : deckJoistTop - LUMBER[addition.deck.joist].width;
  // The piers rise to the deck beam, unless a deck post of MIN_POST or more fits under it.
  const natural = grade + foundation.pier.aboveGrade;
  const pierTop = deckBeamBottom === null || deckBeamBottom - natural >= MIN_POST ? natural : deckBeamBottom;
  // The posts stand on the slab, on the piers, or on the deck beam over the piers.
  const postBottom = addition.floor === 'slab' ? grade : (deckJoistTop ?? pierTop);
  const postLength = beamTop - beamDepth - postBottom;
  if (postLength < NEAR) {
    leaveOut('The beam is at or below the post bases. Lower the pitch or the drop, or make the lean-to shallower.');
    return;
  }
  if (postLength < MIN_POST) warn(`The posts are only ${formatInches(postLength)} long.`);
  const clear = beamTop - beamDepth - (deckTop ?? grade);
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
  const onDeck = deckTop === null ? undefined : 'Stands on the deck beam, over the pier.';
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
  } else {
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

  let deck: LeanTo['deck'] = null;
  if (deckTop !== null && deckJoistTop !== null && deckBeamBottom !== null) {
    // A ledger on the floor framing and joists in hangers carry the boards. The joists hang from a
    // flush beam on the post line. The beam bears on the piers, or on deck posts on the piers, and
    // the posts stand on it over them, so each load runs straight down.
    const { joist, oc } = addition.deck;
    const [joistTop, joistBottom] = [deckJoistTop, deckBeamBottom];
    // The ledger bears on the floor framing: the wall sheathing starts above it.
    const ledgerFace = PLY;
    // Plies enough to bear the post's full width.
    const plies = Math.max(2, Math.ceil(post / PLY - NEAR));
    const [beamInner, beamOuter] = [line - (plies * PLY) / 2, line + (plies * PLY) / 2];
    const seated = pierTop === joistBottom;
    if (joistBottom < grade) warn(`The deck framing runs ${formatInches(grade - joistBottom)} below grade.`);
    const joists = [u0, u1 - PLY];
    for (let index = 1; u0 + index * oc < u1; index++) {
      const from = u0 + index * oc - PLY / 2;
      if (from >= u0 + PLY && from + PLY <= u1 - PLY) joists.push(from);
    }
    joists.sort((first, second) => first - second);
    const joistCenters = joists.map((u) => u + PLY / 2);
    for (const [from, to] of splitPlate([u0, u1], maxStock(joist), joistCenters)) {
      board('DL', 'ledger.deck', joist, true, to - from, at(from, ledgerFace, joistBottom), alongWall, 'Lag-bolt into the floor framing, two at each joist.');
    }
    for (const u of joists) {
      board('DJ', 'joist.deck', joist, true, beamInner - ledgerFace, at(u, ledgerFace, joistBottom), { length: outward, width: UP, thick: frame.u }, 'Joist hangers at both ends.');
    }
    const beamNote = seated ? 'Bears on the piers; the posts stand on it.' : 'Bears on the deck posts; the posts above stand on it.';
    for (let ply = 1; ply <= plies; ply++) {
      for (const [from, to] of splitPlate([u0, u1], maxStock(joist), posts)) {
        board('DB', 'beam.deck', joist, true, to - from, at(from, beamInner + ply * PLY, joistBottom), alongWall, beamNote);
      }
    }
    if (!seated) {
      for (const u of posts) board('DP', 'post', addition.post, true, joistBottom - pierTop, at(u - post / 2, line + post / 2, pierTop), postAxes, 'Under the deck beam.');
    }

    // Boards along the wall from the floor framing out past the beam, 1/4 in apart. A board the posts
    // reach from one edge is notched around them; one they cover or stand inside is cut between them.
    const boardWidth = LUMBER['2x6'].width;
    const rows = Math.ceil((beamOuter + DECK_GAP) / (boardWidth + DECK_GAP));
    const postSpans: Span[] = posts.map((u) => [u - post / 2, u + post / 2]);
    const flat = { length: frame.u, width: outward, thick: UP };
    for (let row = 0; row < rows; row++) {
      const x = row * (boardWidth + DECK_GAP);
      const [low, high] = [Math.max(x, line - post / 2), Math.min(x + boardWidth, line + post / 2)];
      for (const [from, to] of splitPlate([u0, u1], maxStock('2x6'), joistCenters)) {
        const hits = high - low > NEAR ? postSpans.filter(([start, end]) => start < to - NEAR && end > from + NEAR) : [];
        const [inner, outer] = [low <= x + NEAR, high >= x + boardWidth - NEAR];
        if (hits.length === 0) {
          board('DK', 'decking', '2x6', true, to - from, at(from, x, joistTop), flat);
        } else if (inner !== outer) {
          const notches = hits.map(([start, end]): Span => [Math.max(start, from) - from, Math.min(end, to) - from]);
          const points = notchedBoard(to - from, boardWidth, high - low, inner, notches);
          out.members.push({
            id: nextId('DK'),
            assembly,
            role: 'decking',
            size: '2x6',
            treated: true,
            length: to - from,
            origin: at(from, x, deckTop),
            axes: { length: frame.u, width: outward, thick: DOWN },
            profile: { points, depth: PLY },
            note: 'Notch around the posts.',
          });
        } else {
          let start = from;
          for (const [left, right] of [...hits].sort((first, second) => first[0] - second[0])) {
            if (left > start + NEAR) board('DK', 'decking', '2x6', true, left - start, at(start, x, joistTop), flat, 'Cut to fit between the posts.');
            start = Math.max(start, right);
          }
          if (to > start + NEAR) board('DK', 'decking', '2x6', true, to - start, at(start, x, joistTop), flat, 'Cut to fit between the posts.');
        }
      }
    }
    deck = {
      joist,
      plies,
      joistSpan: beamInner - ledgerFace,
      beamTributary: (beamInner - ledgerFace) / 2 + (beamOuter - beamInner),
      seats: seated ? posts.length : 0,
    };
  }

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

/**
 * The outline of a deck board `length` long and `width` wide, with `notches` (spans along it) cut
 * `depth` in from its inner edge, or its outer edge. Points on a straight run go, so a notch at an
 * end leaves no sliver.
 */
function notchedBoard(length: number, width: number, depth: number, inner: boolean, notches: readonly Span[]): Point[] {
  const sorted = [...notches].sort((first, second) => first[0] - second[0]);
  const points: Point[] = inner
    ? [[0, 0], ...sorted.flatMap(([from, to]): Point[] => [[from, 0], [from, depth], [to, depth], [to, 0]]), [length, 0], [length, width], [0, width]]
    : [[0, 0], [length, 0], [length, width], ...[...sorted].reverse().flatMap(([from, to]): Point[] => [[to, width], [to, width - depth], [from, width - depth], [from, width]]), [0, width]];
  const straight = (list: Point[], index: number) => {
    const [before, point, after] = [list[(index + list.length - 1) % list.length], list[index], list[(index + 1) % list.length]];
    return Math.abs((point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0])) < 1e-9;
  };
  let result = points;
  for (let index = result.findIndex((_, at) => straight(result, at)); index >= 0; index = result.findIndex((_, at) => straight(result, at))) {
    result = result.filter((_, at) => at !== index);
  }
  return result;
}
