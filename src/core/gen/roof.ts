import { LUMBER, SHEETS, stockFor, type LumberSize, type SheetKey } from '../catalog';
import { eavePitch, extensionSides, hasRidgeBoard, ridged, type ShedConfig } from '../config';
import type { Assembly, Member, Point, Role, Solid, Vec3, Warning } from '../member';
import { roOffset } from '../placement';
import { formatInches } from '../units';
import { frameAttic, type Deck, type Gussets } from './attic';
import { crossing, degrees, idMaker, pitchOf, planeMember, profileOf, type Pitch, type Plane, type Profile, type Slope } from './section';
import {
  headerOf,
  inGable,
  leftOut,
  openingBoards,
  openingZone,
  placements,
  resolveHeader,
  splitPlate,
  wallFrames,
  wallTops,
  warnThickHeader,
  type FittedOpening,
  type Placed,
  type RoughOpening,
  type Wall,
} from './walls';

const PLY = 1.5; // thickness of 2x lumber
const MIN_STUD = 3; // a shorter gable stud or cripple is left out
const MIN_UPPER = 12; // a gambrel's break stays this far from the ridge line, horizontal
const GUSSET = 12; // a gambrel gusset's reach along each rafter's top edge from the break
const GUSSET_SHEET: SheetKey = 'ply-15/32';
const NEAR = 0.01;
const X: Vec3 = [1, 0, 0];
const UP: Vec3 = [0, 0, 1];
const DOWN: Vec3 = [0, 0, -1];

// Puts the drawn section on one side of the building: real y = map(drawn y).
interface Side {
  map: (y: number) => number;
  sign: 1 | -1;
}

// A gambrel's miter at the break, from the top line down through the member.
interface Joint {
  top: Point;
  bottom: Point;
}
// level: a plumb cut this deep from the top line, then a level cut back to the bottom edge.
type Cut = 'plumb' | 'square' | Joint | { level: number };
interface Notch {
  heel: number; // y of the birdsmouth's plumb face
}

/**
 * The rafter tops of one roof side, where the sheathing lies: from the lower edge over the fascia
 * up to the ridge line or over the high fascia, rake edge to rake edge. u × v points out of the roof.
 */
export interface RoofPlane {
  assembly: Assembly; // whose rafters carry it
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  length: number; // along u
  width: number; // along v, up the slope
  eaves: number; // edges along u that take drip edge
  sheathed: boolean; // false: metal roofing on purlins
  ridge: boolean; // its upper edge is on the ridge line
  breakEdge: 'low' | 'high' | null; // its edge on a gambrel's break
}

/** The underside of the main roof outside a wall: what a lean-to roof must stay under. */
export interface Soffit {
  /** Height `x` outside the wall's face at `u` along it, or null past the roof's edge. */
  under: (wall: Wall, u: number, x: number) => number | null;
  /** Distances out from the wall's face where `under` changes course, nearest first. */
  breaks: (wall: Wall) => number[];
}

/** Rafters, ridge, rake ladders, fascia, gable-end framing, gambrel gussets, and for a gable or gambrel roof the attic. */
export function frameRoof(config: ShedConfig): {
  members: Member[];
  solids: Solid[]; // gambrel gussets
  warnings: Warning[];
  planes: RoofPlane[];
  openings: RoughOpening[];
  // Horizontal clear span between bearings, or from the bearing to the ridge board. A gambrel's
  // lower rafters span from the bearing to the break, its upper rafters from the break to the ridge board.
  rafterSpans: { member: string; span: number }[];
  deck: Deck | null; // the loft deck
  soffit: Soffit;
  // At a downhill eave's wall: the rafter top over the outside face, the bearing plate's top, the
  // bearing depth, the eave pitch per 12, and how far in from the outside face the rafter sides are
  // clear. Roof extensions start here.
  eave: { top: number; plate: number; bearing: number; pitch: number; lap: number };
} {
  const { roof, walls, width, length } = config;
  const members: Member[] = [];
  const solids: Solid[] = [];
  const warnings: Warning[] = [];
  const warn = (message: string) => warnings.push({ source: 'Roof', message });

  const tops = wallTops(config);
  const wallDepth = LUMBER[walls.stud].width;
  const pitch = pitchOf(eavePitch(roof));
  const depth = LUMBER[roof.rafter].width;
  // Two sides that meet at a ridge: a gable or a gambrel roof.
  const gable = ridged(roof);
  const lowWall = gable || roof.highSide === 'back' ? 'front' : 'back';
  // Knee walls in a gable roof's loft raise the roof: the rafters bear on them. They stand on the
  // deck over joists on the plates, or on the wall top when the joists hang between ledgers.
  const raised = roof.style === 'gable' && roof.loft.enabled && roof.kneeWalls.enabled;
  const kneeBase =
    roof.loft.support === 'hung'
      ? tops.front
      : tops.front + LUMBER[roof.loft.joist].width + SHEETS[roof.loft.deck].thick;
  const bearingDepth = raised ? LUMBER[roof.kneeWalls.stud].width : wallDepth;
  const seat = seatLength(depth, bearingDepth, pitch, warn);
  const plate = raised ? kneeBase + roof.kneeWalls.height : tops[lowWall];
  const plumb = depth / pitch.cos;
  // The eave slope: the whole side, or a gambrel's lower slope.
  const slope: Slope = {
    pitch,
    depth,
    seat,
    bottom: (y) => plate + pitch.rise * (y - seat),
    top: (y) => plate + pitch.rise * (y - seat) + plumb,
  };

  const front: Side = { map: (y) => y, sign: 1 };
  const back: Side = { map: (y) => width - y, sign: -1 };
  const sides = gable ? [front, back] : [lowWall === 'front' ? front : back];

  // Drawn extent of a rafter, and its cuts. Without a ridge board a gambrel's upper rafters meet at
  // the ridge line.
  const ridgeBoard = hasRidgeBoard(roof);
  const eave = roof.eaveOverhang;
  const from = -eave;
  const to = gable ? width / 2 - (ridgeBoard ? PLY / 2 : 0) : width + eave;

  // A gambrel's upper slope rises from the break, where the top lines meet.
  let breakRun = 0;
  let upper: Slope | null = null;
  if (roof.style === 'gambrel') {
    const { run, wanted } = gambrelBreak(config);
    breakRun = run;
    if (run < wanted) {
      warn(`The break ${formatInches(wanted)} in from the wall is within 1 ft of the ridge line. It is at ${formatInches(run)}.`);
    }
    const upperPitch = pitchOf(roof.pitch);
    const breakTop = slope.top(breakRun);
    const upperTop = (y: number) => breakTop + upperPitch.rise * (y - breakRun);
    upper = { pitch: upperPitch, depth, seat: 0, top: upperTop, bottom: (y) => upperTop(y) - depth / upperPitch.cos };
  }
  const profile = profileOf(upper ? [slope, upper] : [slope]);
  const peak = upper ?? slope; // the slope at the ridge or the high end
  // The miter at the break for a member `deep` under the top line, and its cut from square.
  const miter = (deep: number): Cut => miterOf(slope, peak, 0, deep);
  const miterText = upper ? `Cut ${((slope.pitch.degrees - upper.pitch.degrees) / 2).toFixed(1)}° from square at the break.` : '';

  // A plumb fascia at a low eave is set down until the roof plane passes over its outer top edge,
  // so the sheathing and drip edge run over it: thickness × rise below the rafter top.
  const [fasciaThick, fasciaDepth] = roof.fascia === 'none' ? [0, 0] : [LUMBER[roof.fascia].thick, LUMBER[roof.fascia].width];
  const fasciaDrop = fasciaThick * pitch.rise;
  // A plumb-and-level tail is plumb as deep as the fascia hangs, then level back to the bottom edge.
  const levelDepth = fasciaDrop + fasciaDepth;
  const levelRun = (plumb - levelDepth) / pitch.rise;

  // A square cut needs the overhang to reach past the cut's lower corner; a level cut, past its
  // inner end.
  let tailCut: Cut = 'plumb';
  if (roof.tailCut === 'square') {
    if (eave >= depth * pitch.sin) tailCut = 'square';
    else warn(`A square tail cut needs ${formatInches(depth * pitch.sin)} of eave overhang. The tails are plumb cut.`);
  } else if (roof.tailCut === 'plumb-level') {
    if (roof.fascia === 'none') warn('A plumb-and-level tail cut needs a fascia. The tails are plumb cut.');
    else if (levelRun > eave) warn(`A plumb-and-level tail cut needs ${formatInches(levelRun)} of eave overhang. The tails are plumb cut.`);
    else if (levelRun > 0) tailCut = { level: levelDepth };
  }
  const level = typeof tailCut === 'object';
  // A lean-to roof's high eave rises outward: its tail is plumb cut and its fascia stays up.
  const highCut: Cut = gable ? 'plumb' : level ? 'plumb' : tailCut;
  const cutText = (cut: Cut) =>
    cut === 'square' ? 'square cut' : typeof cut === 'object' && 'level' in cut ? `plumb cut ${formatInches(cut.level)} deep, then level cut` : `plumb cut ${degrees(pitch)}`;
  // A member's own tail: a level cut needs more plumb end than the fascia covers, as in `outline`.
  const tailOf = (memberDepth: number): Cut => (level && memberDepth / pitch.cos - levelDepth <= 1 / 16 ? 'plumb' : tailCut);
  const endsText = (memberDepth: number) => {
    const low = tailOf(memberDepth);
    return highCut === low ? `Both ends ${cutText(low)}.` : `Low end ${cutText(low)}; high end ${cutText(highCut)}.`;
  };
  const notches: Notch[] = gable ? [{ heel: 0 }] : [{ heel: 0 }, { heel: width - wallDepth }];

  const rake = roof.rakeOverhang >= PLY ? roof.rakeOverhang : 0;
  const ends: [number, number] = [-rake, length + rake];
  const rafters = rafterStarts(length, roof.oc);
  const centers = rafters.map((x) => x + PLY / 2);
  const maxStock = (size: LumberSize) => Math.max(...stockFor(config.catalog, size));
  const nextId = idMaker('RF');

  // A section plane at x on a side. Its extrusion covers x to x + 1-1/2.
  const planeAt = (x: number, side: Side): Plane =>
    side.sign === 1 ? { origin: [x, 0, 0], h: [0, 1, 0] } : { origin: [x + PLY, width, 0], h: [0, -1, 0] };

  // A roof extension takes over a side's low eave: there the rafters stop, plumb cut, at the wall's
  // outside face. The side's own drawn eave is its low end.
  const extended = extensionSides(config.additions);
  const isExtended = (side: Side) => extended.has(side.sign === 1 ? 'front' : 'back');
  const lowEnd = (side: Side) => (isExtended(side) ? 0 : from);
  const lowCut = (side: Side): Cut => (isExtended(side) ? 'plumb' : tailCut);
  const tailText = (side: Side, memberDepth = depth) =>
    isExtended(side) ? 'No tail: plumb cut at the wall line, under the lean-to rafter beside it.' : tailNote(tailOf(memberDepth), eave / pitch.cos);
  const rafterNote = (side: Side) => {
    const run = -lowEnd(side);
    const birdsmouth = `seat ${formatInches(seat)}, heel ${formatInches(pitch.rise * seat)}.`;
    if (upper) {
      return `${miterText} Birdsmouth: heel line ${formatInches(breakRun / pitch.cos)} from the break long point on the top edge; ${birdsmouth} ${tailText(side)}`;
    }
    return gable
      ? `Plumb cut ${degrees(pitch)} at the ridge. Birdsmouth: heel line ${formatInches(to / pitch.cos)} ` +
          `from the ridge long point on the top edge; ${birdsmouth} ` +
          tailText(side)
      : `Birdsmouths on the top edge, ${formatInches(run / pitch.cos)} and ` +
          `${formatInches((width - wallDepth + run) / pitch.cos)} from its low end; each seat ${formatInches(seat)}, ` +
          `heel ${formatInches(pitch.rise * seat)}. ${endsText(depth)}`;
  };
  const ridgeText = ridgeBoard ? `Plumb cut ${degrees(peak.pitch)} at the ridge.` : `Plumb cut ${degrees(peak.pitch)} at the peak, against the rafter on the other side.`;
  // A rake ladder built on the gable-end rafter goes up with it.
  const onEndRafter = (x: number) => rake > 0 && roof.rakeLadder.onEndRafter && (x === rafters[0] || x === rafters[rafters.length - 1]);
  const ladderNote = 'Build the rake ladder on this rafter on the ground (lookouts and fly rafter), then set it in place.';
  const withLadder = (x: number, note: string) => (onEndRafter(x) ? `${note} ${ladderNote}` : note);
  for (const side of sides) {
    const rafterOutline = outline(slope, lowEnd(side), to, notches, lowCut(side), upper ? miter(depth) : highCut);
    for (const x of rafters) {
      const base = { id: nextId('R'), assembly: 'roof', role: 'rafter', size: roof.rafter, note: withLadder(x, rafterNote(side)) } as const;
      members.push(planeMember(base, planeAt(x, side), rafterOutline, [pitch.cos, pitch.sin]));
    }
    if (upper) {
      const upperOutline = outline(upper, breakRun, to, [], miter(depth), 'plumb');
      for (const x of rafters) {
        const base = { id: nextId('UR'), assembly: 'roof', role: 'rafter.upper', size: roof.rafter, note: withLadder(x, `${miterText} ${ridgeText}`) } as const;
        members.push(planeMember(base, planeAt(x, side), upperOutline, [upper.pitch.cos, upper.pitch.sin]));
      }
    }
  }

  // Plywood gussets join each gambrel rafter pair at the break, and without a ridge board at the
  // peak, on both faces. Each reaches GUSSET along each rafter's top edge from the joint, square
  // across it. On a common pair the lower edge runs straight across, under the joint's inside
  // corner, as a web (5 corners). A gable-end rafter takes one, inside, within the rafter depth
  // (6 corners): the gable top plate is under it. Outlines are counterclockwise in real y and z.
  let gussets: Gussets | null = null;
  let peakBottom = Infinity; // the peak gussets' lowest point
  if (upper) {
    const { thick, label } = SHEETS[GUSSET_SHEET];
    const gussetIds = idMaker('RF');
    const place = (code: string, use: string, common: Point[], end: Point[]) => {
      for (const x of rafters) {
        const first = x === rafters[0];
        const last = x === rafters[rafters.length - 1];
        for (const at of [...(first ? [] : [x - thick]), ...(last ? [] : [x + PLY])]) {
          solids.push({
            id: gussetIds(code),
            label: `${use}, ${label}`,
            layer: 'roof',
            material: 'sheet',
            sheet: GUSSET_SHEET,
            shape: { kind: 'panel', origin: [at, 0, 0], u: [0, 1, 0], v: [0, 0, 1], thick, outline: first || last ? end : common, holes: [] },
          });
        }
      }
    };
    // From a joint's top point, `reach` along a top line rising at `cos`, `sin`: the top edge point
    // and the bottom edge point square across from it.
    const along = (top: Point, cos: number, sin: number, reach: number): [Point, Point] => {
      const edge: Point = [top[0] + reach * cos, top[1] + reach * sin];
      return [edge, [edge[0] + depth * sin, edge[1] - depth * cos]];
    };

    const { top: knee, bottom: inside } = miterOf(slope, upper, 0, depth);
    const [lowTop, lowBottom] = along(knee, slope.pitch.cos, slope.pitch.sin, -GUSSET);
    const [highTop, highBottom] = along(knee, upper.pitch.cos, upper.pitch.sin, GUSSET);
    const common: Point[] = [lowBottom, highBottom, highTop, knee, lowTop];
    for (const side of sides) {
      const loop = (drawn: Point[]) => {
        const shape = drawn.map(([y, z]): Point => [side.map(y), z]);
        return side.sign === 1 ? shape : shape.reverse();
      };
      place('GU', 'Break gusset', loop(common), loop([lowBottom, inside, highBottom, highTop, knee, lowTop]));
    }
    const heights = common.map(([, z]) => z);
    gussets = { thick, bottom: Math.min(...heights), top: Math.max(...heights), inside: inside[1] };

    if (!ridgeBoard) {
      // Across the ridge line: the back rafter is the front one mirrored.
      const top: Point = [width / 2, upper.top(width / 2)];
      const [frontTop, frontBottom] = along(top, upper.pitch.cos, upper.pitch.sin, -GUSSET);
      const [backTop, backBottom] = [frontTop, frontBottom].map(([y, z]): Point => [width - y, z]);
      const below: Point = [width / 2, upper.bottom(width / 2)];
      place('GP', 'Peak gusset', [frontBottom, backBottom, backTop, top, frontTop], [frontBottom, below, backBottom, backTop, top, frontTop]);
      peakBottom = frontBottom[1];
    }
  }

  let deck: Deck | null = null;
  if (gable) {
    // The ties stay under the ridge board, or under the peak gussets.
    let ridgeBottom = peakBottom;
    if (ridgeBoard) {
      const ridgeTop = peak.top(to);
      const ridgeDepth = LUMBER[roof.ridge].width;
      const peakPlumb = depth / peak.pitch.cos;
      if (ridgeDepth < peakPlumb) {
        warn(`The ridge board (${roof.ridge}) is shallower than the rafter plumb cut (${formatInches(peakPlumb)}).`);
      }
      const ridgeEnds: [number, number] = roof.rakeLadder.ridgeExtends ? ends : [0, length];
      for (const [start, end] of splitPlate(ridgeEnds, maxStock(roof.ridge), centers)) {
        members.push(box(nextId('RB'), 'ridge', roof.ridge, end - start, [start, width / 2 - PLY / 2, ridgeTop - ridgeDepth], {
          length: X,
          width: UP,
          thick: [0, 1, 0],
        }));
      }
      ridgeBottom = ridgeTop - ridgeDepth;
    }
    const attic = frameAttic(config, profile, rafters, ridgeBottom, wallDepth, tops.front, raised ? kneeBase : null, gussets);
    deck = attic.deck;
    members.push(...attic.members);
    warnings.push(...attic.warnings);
  }

  if (rake > 0) {
    const { rakeLadder } = roof;
    // Without the ridge board out to them, the fly rafters and rails meet at the ridge line.
    const meeting = gable && (!ridgeBoard || !rakeLadder.ridgeExtends);
    const flyTo = meeting ? width / 2 : to;
    // A rake ladder that goes up in one piece: the fly rafter, lookouts, and a rail that is
    // face-nailed to the gable-end rafter, tops flush, or the gable-end rafter itself as the rail.
    // Too short a rake leaves out the rail.
    const lookoutDepth = LUMBER[rakeLadder.size].width;
    const railed = !rakeLadder.onEndRafter && rake >= 2 * PLY;
    const lookoutLength = rake - (railed ? 2 : 1) * PLY;
    const xs = [-rake + PLY, length + (railed ? PLY : 0)];
    for (const side of sides) {
      // One ladder per slope. The fascia ties the ladder's eave ends, so a lookout goes there only
      // when chosen. A gambrel's upper ladder takes one at the break, where the fly rafters meet.
      const ends = (memberDepth: number) => (gable ? `${ridgeText} ${tailText(side, memberDepth)}` : endsText(memberDepth));
      const ladders = upper
        ? [
            { on: slope, start: lowEnd(side), end: breakRun, low: () => lowCut(side), high: miter, ends: (memberDepth: number) => `${miterText} ${tailText(side, memberDepth)}`, first: rakeLadder.fasciaLookouts ? 0 : 1, last: 1 },
            { on: upper, start: breakRun, end: flyTo, low: miter, high: () => highCut, ends: () => `${miterText} ${ridgeText}`, first: 0, last: 1 },
          ]
        : [{ on: slope, start: lowEnd(side), end: flyTo, low: () => lowCut(side), high: () => highCut, ends, first: rakeLadder.fasciaLookouts ? 0 : 1, last: gable || !rakeLadder.fasciaLookouts ? 1 : 0 }];
      for (const ladder of ladders) {
        const { on, start, end } = ladder;
        const flyOutline = outline(on, start, end, [], ladder.low(depth), ladder.high(depth));
        for (const x of [-rake, length + rake - PLY]) {
          const base = { id: nextId('FR'), assembly: 'roof', role: 'rafter.fly', size: roof.rafter, note: `No birdsmouth. ${ladder.ends(depth)}` } as const;
          members.push(planeMember(base, planeAt(x, side), flyOutline, [on.pitch.cos, on.pitch.sin]));
        }
        if (railed) {
          const railSlope: Slope = { ...on, depth: lookoutDepth, bottom: (y) => on.top(y) - lookoutDepth / on.pitch.cos };
          const railOutline = outline(railSlope, start, end, [], ladder.low(lookoutDepth), ladder.high(lookoutDepth));
          const note = `${ladder.ends(lookoutDepth)} Assemble the rake ladder on the ground, then face-nail this rail to the gable-end rafter, tops flush.`;
          for (const x of [-PLY, length]) {
            const base = { id: nextId('LR'), assembly: 'roof', role: 'rail.ladder', size: rakeLadder.size, note } as const;
            members.push(planeMember(base, planeAt(x, side), railOutline, [on.pitch.cos, on.pitch.sin]));
          }
        }
        if (lookoutLength < PLY) continue;
        // Lookouts on edge, flush with the rafter tops, evenly spaced along the ladder up to where
        // a lookout's lower corner meets the high end's plumb line. On a gable roof the ridge board,
        // run out to the fly rafters, is the top rung; without it a plumb block at the peak meets
        // the one on the other slope.
        const { cos, sin, rise } = on.pitch;
        const reach = (end - start) / cos - PLY - lookoutDepth * rise;
        const gaps = Math.max(1, Math.ceil(reach / rakeLadder.spacing));
        for (let index = ladder.first; index <= gaps - ladder.last; index++) {
          const along = (index * reach) / gaps;
          const drawn: Point = [start + along * cos, on.top(start) + along * sin];
          for (const x of xs) {
            members.push(box(nextId('LO'), 'lookout', rakeLadder.size, lookoutLength, [x, side.map(drawn[0]), drawn[1]], {
              length: X,
              width: [0, side.sign * sin, -cos],
              thick: [0, side.sign * cos, sin],
            }));
          }
        }
      }
      if (meeting && lookoutLength >= PLY) {
        const y = side.sign === 1 ? width / 2 - PLY : width / 2;
        const bottom = peak.top(width / 2 - PLY) - lookoutDepth;
        for (const x of xs) {
          const block = box(nextId('LO'), 'lookout', rakeLadder.size, lookoutLength, [x, y, bottom], { length: X, width: UP, thick: [0, 1, 0] });
          members.push({ ...block, note: 'Plumb, at the peak, against the block on the other slope.' });
        }
      }
    }
  }

  if (roof.fascia !== 'none') {
    const fasciaSize = roof.fascia;
    for (const side of sides) {
      const eaves: { y: number; out: 1 | -1 }[] = [
        ...(isExtended(side) ? [] : [{ y: from, out: -1 as const }]),
        ...(gable ? [] : [{ y: to, out: 1 as const }]),
      ];
      for (const { y, out } of eaves) {
        const plumbFascia = tailCut !== 'square';
        const drop = plumbFascia && out === -1 ? fasciaDrop : 0;
        const axes = plumbFascia
            ? { length: X, width: DOWN, thick: [0, out * side.sign, 0] as Vec3 }
            : {
                length: X,
                width: [0, side.sign * pitch.sin, -pitch.cos] as Vec3,
                thick: [0, out * side.sign * pitch.cos, out * pitch.sin] as Vec3,
              };
        for (const [start, end] of splitPlate(ends, maxStock(fasciaSize), centers)) {
          members.push(box(nextId('FA'), 'fascia', fasciaSize, end - start, [start, side.map(y), slope.top(y) - drop], axes));
        }
      }
    }
  }

  const gableEnds = frameGableEnds(config, profile, sides, gable, tops.left, wallDepth, bearingDepth, raised, warnings);
  members.push(...gableEnds.members);

  // The fascia thickness, measured along the slope. An extended side's sheathing stops at the wall
  // line, where the extension's takes over.
  const fasciaRun = roof.fascia === 'none' ? 0 : fasciaThick / (tailCut === 'square' ? 1 : pitch.cos);
  // Each side's slopes: from the low end to the break, the ridge face, or the high end.
  const runs = (side: Side): [Slope, number, number][] => (upper ? [[slope, lowEnd(side), breakRun], [upper, breakRun, to]] : [[slope, lowEnd(side), to]]);
  // Metal roofing on purlins laid flat across the rafters, or across the sheathing on them, evenly
  // spaced along each slope from its low edge up to the break, the ridge face, or the high end, rake to rake.
  if (roof.roofing !== 'shingles') {
    const purlinWidth = LUMBER[roof.purlin].width;
    const lift = roof.roofing === 'metal-over-sheathing' && roof.sheathing !== 'none' ? SHEETS[roof.sheathing].thick : 0;
    for (const side of sides) {
      for (const [on, start, stop] of runs(side)) {
        const run = (stop - start) / on.pitch.cos - purlinWidth;
        const gaps = Math.max(1, Math.ceil(run / roof.purlinSpacing));
        const thick: Vec3 = [0, -side.sign * on.pitch.sin, on.pitch.cos]; // out of the roof
        for (let index = 0; index <= gaps; index++) {
          const y = start + ((index * run) / gaps) * on.pitch.cos;
          const origin = (from: number): Vec3 => [from, side.map(y) + thick[1] * lift, on.top(y) + thick[2] * lift];
          for (const [from, end] of splitPlate(ends, maxStock(roof.purlin), centers)) {
            const purlin = box(nextId('PU'), 'purlin', roof.purlin, end - from, origin(from), { length: X, width: [0, side.sign * on.pitch.cos, on.pitch.sin], thick });
            members.push(lift > 0 ? { ...purlin, note: 'Over the roof sheathing: fasten through it into the rafters.' } : purlin);
          }
        }
      }
    }
  }

  const planes = sides.flatMap((side): RoofPlane[] => {
    const lowRun = isExtended(side) ? 0 : fasciaRun;
    const lowEdge: Point = [lowEnd(side) - lowRun * pitch.cos, slope.top(lowEnd(side)) - lowRun * pitch.sin];
    const slopeLength = (gable ? ((upper ? breakRun : width / 2) - lowEnd(side)) / pitch.cos : (to - lowEnd(side)) / pitch.cos + fasciaRun) + lowRun;
    const plane = (edge: Point, on: Slope, run: number, eaves: number, ridge: boolean, breakEdge: RoofPlane['breakEdge']): RoofPlane => ({
      assembly: 'roof',
      eaves,
      sheathed: roof.roofing !== 'metal',
      origin: [side.sign === 1 ? ends[0] : ends[1], side.map(edge[0]), edge[1]],
      u: [side.sign, 0, 0],
      v: [0, side.sign * on.pitch.cos, on.pitch.sin],
      length: ends[1] - ends[0],
      width: run,
      ridge,
      breakEdge,
    });
    const eaves = (gable ? 0 : 1) + (isExtended(side) ? 0 : 1);
    if (!upper) return [plane(lowEdge, slope, slopeLength, eaves, gable, null)];
    return [
      plane(lowEdge, slope, slopeLength, eaves, false, 'high'),
      plane([breakRun, slope.top(breakRun)], upper, (width / 2 - breakRun) / upper.pitch.cos, 0, true, 'low'),
    ];
  });
  const rafterSpans = upper
    ? [
        { member: 'Lower rafters', span: breakRun - seat },
        { member: 'Upper rafters', span: to - breakRun },
      ]
    : [{ member: 'Rafters', span: (gable ? to : width - wallDepth) - seat }];

  // Rafter underside over real y, from whichever side covers it.
  const rafterUnder = (y: number) => Math.min(...sides.map((side) => profile.bottom(side.map(y))));
  // Over a low eave the level cut, when there is one, lifts the underside near the tail.
  const lowEave = (wall: Wall) => gable || wall === lowWall;
  const levelUnder = level ? slope.top(from) - levelDepth : -Infinity;
  const soffit: Soffit = {
    under: (wall, u, x) => {
      if (wall === 'left' || wall === 'right') {
        // Over a gable end the end rafter, lookouts, and fly rafter: the rafter line is the lowest.
        return x <= rake + NEAR ? rafterUnder(wall === 'left' ? width - u : u) : null;
      }
      const y = (eaveOut: number) => (wall === 'front' ? -eaveOut : width + eaveOut);
      if (x <= eave + NEAR) return lowEave(wall) ? Math.max(rafterUnder(y(x)), levelUnder) : rafterUnder(y(x));
      // The fascia's bottom edge, hung from the rafter top at the tail, set down at a low eave.
      if (x <= eave + fasciaThick + NEAR) return rafterUnder(y(eave)) + plumb - fasciaDepth - (lowEave(wall) && tailCut !== 'square' ? fasciaDrop : 0);
      return null;
    },
    breaks: (wall) => {
      if (wall === 'left' || wall === 'right') return [0, rake];
      return level && lowEave(wall) ? [0, eave - levelRun, eave, eave + fasciaThick] : [0, eave, eave + fasciaThick];
    },
  };
  // An extension rafter laps the main rafter's side up to the gussets.
  const lap = upper ? breakRun - GUSSET * pitch.cos : Infinity;
  return {
    members,
    solids,
    warnings,
    planes,
    openings: gableEnds.openings,
    rafterSpans,
    deck,
    soffit,
    eave: { top: slope.top(0), plate, bearing: bearingDepth, pitch: eavePitch(roof), lap },
  };
}

/**
 * A gambrel's break: its run in from the eave wall's outside face, kept 1 ft from the ridge line,
 * the run asked for, and the height of the rafter tops there, as `frameRoof` builds it.
 */
export function gambrelBreak(config: ShedConfig): { run: number; wanted: number; height: number } {
  const { roof, width, walls } = config;
  const pitch = pitchOf(roof.gambrel.lowerPitch);
  // auto: lower and upper rafters of equal length, run / cos, as on a classic barn.
  const upperCos = pitchOf(roof.pitch).cos;
  const wanted = roof.gambrel.breakRun === 'auto' ? ((width / 2) * pitch.cos) / (pitch.cos + upperCos) : roof.gambrel.breakRun;
  const run = Math.min(wanted, width / 2 - MIN_UPPER);
  const depth = LUMBER[roof.rafter].width;
  const seat = seatLength(depth, LUMBER[walls.stud].width, pitch, () => {});
  return { run, wanted, height: wallTops(config).front + pitch.rise * (run - seat) + depth / pitch.cos };
}

// The miter where two slopes meet, through a member from `upper` to `lower` under the top line.
function miterOf(eaveward: Slope, ridgeward: Slope, upper: number, lower: number): Joint {
  const line = (slope: Slope, below: number) => (y: number) => slope.top(y) - below / slope.pitch.cos;
  return {
    top: crossing(line(eaveward, upper), line(ridgeward, upper)),
    bottom: crossing(line(eaveward, lower), line(ridgeward, lower)),
  };
}

// Seat the full wall depth, shortened so the notch is no deeper than 1/3 of the rafter depth,
// measured square to the edge. Bearing stays at least 1-1/2 in.
function seatLength(depth: number, wallDepth: number, pitch: Pitch, warn: (message: string) => void): number {
  const limit = Math.floor((depth / 3 / pitch.sin) * 16) / 16;
  const seat = Math.min(wallDepth, limit);
  if (seat >= PLY) return seat;
  warn(
    `A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 of the ${formatInches(depth)} rafter depth. ` +
      'Use a deeper rafter or a lower pitch.',
  );
  return PLY;
}

// Rafter outline in the drawn section: low end, along the bottom edge through each birdsmouth,
// high end, then back along the top edge. A joint end takes its own points, not `from` or `to`.
function outline(slope: Slope, from: number, to: number, notches: Notch[], lowCut: Cut, highCut: Cut): Point[] {
  const { bottom, top, depth, pitch, seat } = slope;
  // An end's points from the top line down to the bottom edge. A level cut on a member too shallow
  // for it, such as a ladder rail, is a plumb cut.
  const end = (y: number, cut: Cut): Point[] => {
    if (typeof cut === 'object' && 'top' in cut) return [cut.top, cut.bottom];
    if (typeof cut === 'object' && depth / pitch.cos - cut.level > 1 / 16) {
      return [[y, top(y)], [y, top(y) - cut.level], [y + (depth / pitch.cos - cut.level) / pitch.rise, top(y) - cut.level]];
    }
    return [[y, top(y)], cut === 'square' ? [y + depth * pitch.sin, top(y) - depth * pitch.cos] : [y, bottom(y)]];
  };
  const low = end(from, lowCut);
  const high = end(to, highCut);
  const path: Point[] = [low[low.length - 1]];
  for (const { heel } of notches) {
    const level = bottom(heel + seat);
    path.push([heel, bottom(heel)], [heel, level], [heel + seat, level]);
  }
  path.push(...[...high].reverse(), ...low.slice(0, -1));
  return path;
}

// Start x of each rafter: one flush with each gable end, the rest centered on o.c. multiples.
function rafterStarts(length: number, oc: number): number[] {
  const starts = [0, length - PLY];
  for (let index = 1; index * oc < length; index++) {
    const start = index * oc - PLY / 2;
    if (start >= PLY && start + PLY <= length - PLY) starts.push(start);
  }
  return starts.sort((first, second) => first - second);
}

type Span = readonly [number, number];

// Where gable openings may go on one end wall, in its frame.
interface GableRoom {
  plateTop: number; // the gable framing stands on the end-wall plate here
  clear: number; // from each eave to the first place a gable stud may stand
  span: number;
  top: (u: number) => number; // underside of the gable top plates
  post: Span | null;
}

function fitGableOpening(
  { label, type, row, position }: Placed,
  walls: ShedConfig['walls'],
  room: GableRoom,
  others: readonly FittedOpening[],
  warn: (message: string) => void,
  leaveOut: (message: string) => null,
): FittedOpening | null {
  const offset = roOffset(row.along, position, room.span, type.width);
  const { jacks, side, zone } = openingZone(type, offset, walls);
  const overlaps = ([low, high]: Span) => low < zone[1] && high > zone[0];
  if (zone[0] < room.clear || zone[1] > room.span - room.clear) {
    return leaveOut(`The framing runs past the gable. The king and jacks need ${formatInches(side)} on each side of the RO.`);
  }
  if (others.some((other) => overlaps(other.zone))) return leaveOut('The framing overlaps another opening.');
  const { post } = room;
  if (post && overlaps(post) && (post[0] < offset || post[1] > offset + type.width)) {
    return leaveOut('The kings or jacks land on the ridge post. Move the opening.');
  }
  const header = resolveHeader(type, walls);
  const roTop = row.sill + type.height;
  // The gable top plates are lowest over the header's outer ends.
  const clearance = Math.min(room.top(zone[0] + PLY), room.top(zone[1] - PLY));
  if (roTop + header.depth > clearance) {
    return leaveOut(
      `The header does not fit. RO top ${formatInches(roTop)} plus ${formatInches(header.depth)} of header ` +
        `is above the gable top plate at ${formatInches(clearance)}.`,
    );
  }
  let sillBottom: number | null = null;
  if (row.sill > room.plateTop + NEAR) {
    sillBottom = row.sill - walls.sillPlies * PLY;
    if (sillBottom < room.plateTop - NEAR) return leaveOut('The rough sill is below the top of the end-wall plate.');
  }
  warnThickHeader(header, LUMBER[walls.stud].width, warn);
  return { label, type, offset, sill: row.sill, jacks, zone, roTop, header, sillBottom };
}

/**
 * Gable-end framing on each end wall's plate: a top plate under each end rafter, studs on layout
 * cut to it, and for a gable or gambrel roof a ridge post under the ridge board. Openings with
 * their sill at or above the end-wall top frame here, as in a wall.
 */
function frameGableEnds(
  config: ShedConfig,
  profile: Profile,
  sides: Side[],
  gable: boolean,
  wallTop: number,
  wallDepth: number,
  bearingDepth: number,
  raised: boolean,
  warnings: Warning[],
): { members: Member[]; openings: RoughOpening[] } {
  const { width, length, walls, roof } = config;
  // The gable framing stands on the end wall's top plate, or on its own bottom plate as a panel.
  const plateTop = wallTop + (roof.gablePanel ? PLY : 0);
  const [slope] = profile.slopes; // at the eave
  const peak = profile.slopes[profile.slopes.length - 1];
  const { pitch } = slope;
  const members: Member[] = [];
  const openings: RoughOpening[] = [];
  const placed = placements(config).filter(({ row }) => inGable(config, row));
  const frames = wallFrames(width, length);
  const plateThick = PLY / pitch.cos; // plumb thickness of the gable top plate

  // Underside of the gable top plates at real y, and the slope over it. A side's map is its own inverse.
  const plateUnder = (on: Slope, y: number) => on.bottom(y) - PLY / on.pitch.cos;
  const covers = (y: number) =>
    sides.flatMap((side) => profile.slopes.map((on) => ({ on, z: plateUnder(on, side.map(y)) }))).reduce((low, next) => (next.z < low.z ? next : low));
  const under = (y: number) => covers(y).z;
  const topCut = (y: number) => `Top cut ${degrees(covers(y).on.pitch)}.`;
  // A ridge post stands under the ridge board. Without one, the top plates meet at the peak.
  const board = hasRidgeBoard(roof);
  const ridgeBottom = board ? profile.top(width / 2 - PLY / 2) - LUMBER[roof.ridge].width : 0;
  const post: Span | null = board && ridgeBottom - plateTop >= MIN_STUD ? [width / 2 - PLY / 2, width / 2 + PLY / 2] : null;

  // Top plate in the drawn section: its top against the end rafter's underside and a plumb cut at
  // the ridge post or the high wall. Its low end has a level cut where its underside meets the
  // plate below, or a plumb cut. On a roof raised by knee walls the gable end runs through to the
  // corners, and a level corner plate at each eave lines up with the knee wall's top plate. The
  // knee wall's cap plate laps over it, as at a wall corner, and the end rafter seats on the lap.
  // The top plate then starts at the knee wall's inside face, plumb against the lap.
  const base = slope.bottom(slope.seat); // where the rafters bear
  const cornerTop = raised && walls.capPlate ? base - PLY : base;
  const support = raised ? cornerTop : plateTop;
  const meet = slope.seat + (support + plateThick - base) / pitch.rise;
  const tip = slope.seat + Math.max(0, support - base) / pitch.rise; // where the end rafter clears the support
  const low = raised ? (walls.capPlate ? Math.max(slope.seat, bearingDepth) : slope.seat) : Math.max(meet, bearingDepth);
  const levelCut = raised ? slope.bottom(low) - plateThick < support : meet >= bearingDepth;
  const cornerLength = Math.max(bearingDepth + PLY, levelCut ? meet : low);
  const clear = raised ? cornerLength : Math.max(wallDepth, bearingDepth); // eave corners: no layout studs
  const high = gable ? (post ? post[0] : width / 2) : width - wallDepth;
  const highEnd = `${degrees(peak.pitch)} at the ${gable ? (board ? 'ridge post' : 'peak') : 'high wall'}`;
  const plumbHigh: [Point, Point] = [[high, plateUnder(peak, high)], [high, peak.bottom(high)]];
  // On a gambrel the plate is in two pieces, mitered at the break as the rafters are.
  const joint = slope === peak ? null : miterOf(slope, peak, slope.depth, slope.depth + PLY);
  const lowerHigh: [Point, Point] = joint ? [joint.bottom, joint.top] : plumbHigh;
  const plateOutline: Point[] = levelCut
    ? [[raised ? low : tip, support], [meet, support], ...lowerHigh, [low, slope.bottom(low)]]
    : [[low, slope.bottom(low) - plateThick], ...lowerHigh, [low, slope.bottom(low)]];
  const lowEndNote = raised
    ? `${walls.capPlate ? "Plumb cut against the knee wall's cap plate, level" : 'Level'} cut on the corner plate`
    : `Level cut on the ${roof.gablePanel ? 'bottom' : 'wall'} plate`;
  const miterText = joint ? `Cut ${((pitch.degrees - peak.pitch.degrees) / 2).toFixed(1)}° from square at the break.` : '';
  const plateNote = joint
    ? levelCut
      ? `${lowEndNote}. ${miterText}`
      : `Plumb cut ${degrees(pitch)} at the eave wall's inside face. ${miterText}`
    : levelCut
      ? `${lowEndNote}. Plumb cut ${highEnd}.`
      : `Plumb cuts ${degrees(pitch)} at the ${raised ? 'knee wall' : "eave wall's inside face"} and ${highEnd}.`;
  // Each piece: its outline, and the ends of its underside, where its length runs.
  const plates: { outline: Point[]; start: Point; finish: Point; note: string }[] = [
    { outline: plateOutline, start: [low, slope.bottom(low) - plateThick], finish: lowerHigh[0], note: plateNote },
    ...(joint ? [{ outline: [joint.bottom, ...plumbHigh, joint.top], start: joint.bottom, finish: plumbHigh[0], note: `${miterText} Plumb cut ${highEnd}.` }] : []),
  ];
  const cornerNote = walls.capPlate ? "Level, under the knee wall's cap plate, which laps over it." : "Level, under the gable-end rafter's seat.";

  // Each end wall's u runs along it from its left corner, viewed from outside. toY is its own inverse.
  const ends = [
    { wall: 'left', assembly: 'gable.left', prefix: 'GL', plane: { origin: [wallDepth, width, 0], h: [0, -1, 0] }, toY: (u: number) => width - u },
    { wall: 'right', assembly: 'gable.right', prefix: 'GR', plane: { origin: [length - wallDepth, 0, 0], h: [0, 1, 0] }, toY: (u: number) => u },
  ] as const;

  for (const end of ends) {
    const nextId = idMaker(end.prefix);
    const make = (role: Role, code: string, outline: Point[], dir: Point, note: string) =>
      planeMember({ id: nextId(code), assembly: end.assembly, role, size: walls.stud, note }, end.plane, outline, dir, wallDepth);
    const top = (u: number) => under(end.toY(u));
    const cut = (from: number) => topCut(end.toY(from + PLY / 2));
    // A 1-1/2 in column from `bottom` up to the gable top plates, or up to `to` with a square cut.
    const column = (from: number, bottom: number, to?: number): Point[] =>
      to === undefined
        ? [[from, bottom], [from + PLY, bottom], [from + PLY, top(from + PLY)], [from, top(from)]]
        : [[from, bottom], [from + PLY, bottom], [from + PLY, to], [from, to]];

    const room: GableRoom = { plateTop, clear, span: width, top, post };
    const fitted: FittedOpening[] = [];
    for (const candidate of placed.filter(({ row }) => row.wall === end.wall)) {
      const warn = (message: string) => warnings.push({ source: candidate.label, message });
      const leaveOut = (message: string) => {
        warnings.push(leftOut(candidate, end.assembly, frames[end.wall], width, message));
        return null;
      };
      const fit = fitGableOpening(candidate, walls, room, fitted, warn, leaveOut);
      if (fit) fitted.push(fit);
    }
    for (const fit of fitted) {
      const { type, offset, sill, jacks, zone, roTop, header } = fit;
      openings.push({ wall: end.wall, name: type.name, left: offset, right: offset + type.width, bottom: sill, top: roTop, header: headerOf(header) });
      for (const from of [zone[0], zone[1] - PLY]) members.push(make('king', 'K', column(from, plateTop), [0, 1], cut(from)));
      for (let index = 1; index <= jacks; index++) {
        for (const from of [offset - index * PLY, offset + type.width + (index - 1) * PLY]) {
          members.push(make('jack', 'J', column(from, plateTop, roTop), [0, 1], 'Square cut.'));
        }
      }
      for (const board of openingBoards(frames[end.wall], walls, fit)) {
        const { code, ...rest } = board;
        members.push({ id: nextId(code), assembly: end.assembly, treated: false, ...rest });
      }
    }
    // Inside an opening, a layout position takes cripples above the header and below the rough
    // sill. Above the header, the ridge post keeps its square cut under the ridge board.
    const cripples = (fit: FittedOpening, from: number, ridge: boolean) => {
      const headerTop = fit.roTop + fit.header.depth;
      if (ridge && ridgeBottom - headerTop >= MIN_STUD) {
        members.push(make('post.ridge', 'P', column(from, headerTop, ridgeBottom), [0, 1], 'Square cut.'));
      }
      if (!ridge && Math.min(top(from), top(from + PLY)) - headerTop >= MIN_STUD) {
        members.push(make('cripple', 'CR', column(from, headerTop), [0, 1], cut(from)));
      }
      if (fit.sillBottom !== null && fit.sillBottom - plateTop >= MIN_STUD) {
        members.push(make('cripple', 'CR', column(from, plateTop, fit.sillBottom), [0, 1], 'Square cut.'));
      }
    };
    const inside = (from: number) => fitted.find(({ offset, type }) => from >= offset - NEAR && from + PLY <= offset + type.width + NEAR);
    const blocked = (from: number) => fitted.some(({ zone }) => from < zone[1] && from + PLY > zone[0]);

    if (low < high) {
      for (const side of sides) {
        const toPlane = ([y, z]: Point): Point => [end.toY(side.map(y)), z];
        for (const piece of plates) {
          const [start, finish] = [toPlane(piece.start), toPlane(piece.finish)];
          members.push(make('plate.gable', 'TP', piece.outline.map(toPlane), [finish[0] - start[0], finish[1] - start[1]], piece.note));
        }
      }
    }
    // A panel's bottom plate, under the whole gable: to the corners on a raised roof, else from
    // where the end rafter clears it to the ridge's far side or the high wall.
    if (roof.gablePanel) {
      const reach = raised ? 0 : tip;
      const ys = gable ? [reach, width - reach] : [reach, high].map((y) => sides[0].map(y));
      const [first, last] = ys.map((y) => end.toY(y)).sort((one, other) => one - other);
      const plate: Point[] = [[first, wallTop], [last, wallTop], [last, plateTop], [first, plateTop]];
      members.push(make('plate.bottom', 'BP', plate, [1, 0], "Bottom plate of the gable panel. Nail it down to the end wall's top plate."));
    }
    // At each eave corner: the corner plate, on an end stud and a stud at the knee wall's inside face.
    if (raised) {
      for (const side of sides) {
        const toPlane = ([y, z]: Point): Point => [end.toY(side.map(y)), z];
        const corner: Point[] = [[0, cornerTop - PLY], [cornerLength, cornerTop - PLY], [cornerLength, cornerTop], [0, cornerTop]];
        const [first, second] = [toPlane(corner[0]), toPlane(corner[1])];
        members.push(make('plate.gable', 'CP', corner.map(toPlane), [second[0] - first[0], 0], cornerNote));
        for (const from of [0, bearingDepth]) {
          const stud: Point[] = [[from, plateTop], [from + PLY, plateTop], [from + PLY, cornerTop - PLY], [from, cornerTop - PLY]];
          members.push(make('stud.gable', 'S', stud.map(toPlane), [0, 1], 'Square cut. Under the corner plate.'));
        }
      }
    }
    if (post) {
      const fit = inside(post[0]);
      if (fit) cripples(fit, post[0], true);
      else members.push(make('post.ridge', 'P', column(post[0], plateTop, ridgeBottom), [0, 1], 'Square cut.'));
    }
    for (let index = 1; index * walls.oc < width; index++) {
      const near = index * walls.oc - PLY / 2;
      const far = near + PLY;
      if (near < clear || far > width - clear) continue;
      if (post && near < post[1] && far > post[0]) continue;
      const fit = inside(near);
      if (fit) cripples(fit, near, false);
      if (blocked(near)) continue;
      if (Math.min(top(near), top(far)) - plateTop < MIN_STUD) continue;
      members.push(make('stud.gable', 'S', column(near, plateTop), [0, 1], cut(near)));
    }
  }
  return { members, openings };
}

function tailNote(cut: Cut, run: number): string {
  if (run === 0) return 'No tail.';
  const text = typeof cut === 'object' && 'level' in cut ? `plumb cut ${formatInches(cut.level)} deep, then level cut` : `${cut} cut`;
  return `Tail ${formatInches(run)} past the heel line on the top edge, ${text}.`;
}

function box(id: string, role: Member['role'], size: LumberSize, length: number, origin: Vec3, axes: Member['axes']): Member {
  return { id, assembly: 'roof', role, size, treated: false, length, origin, axes };
}
