import { describe, expect, it } from 'vitest';
import { parseConfig, shedSchema } from '../src/core/config';
import { corners, type Member, type Role } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { buildBom } from '../src/core/out/bom';
import { naming } from '../src/core/naming';
import { checkSpans } from '../src/core/out/spans';
import { PRESETS } from '../src/core/presets';

// 8x10 on skids: 6/12 main roof, 2x4 rafters (seat 2-9/16), 12 in eave, 2x6 fascia, 7/16 OSB walls
// and roof. A 3/12 lean-to 96 in deep with 2x6 rafters, a 2-ply 2x8 beam on 4x4 posts.
const [gableSkid] = PRESETS;
const withLeanTo = (addition: object) => shedSchema.parse({ ...gableSkid, additions: [addition] });
const model = buildModel(withLeanTo({ side: 'front', mirror: true }));
const front = model.members.filter(({ assembly }) => assembly === 'addition.front');
const ofRole = (members: Member[], role: Role) => members.filter((member) => member.role === role);
const cos3 = Math.cos(Math.atan(0.25));

// Main eave: rafter underside at the wall face is the plate less the heel, falling 6/12 outward. The
// fascia bottom hangs 5-1/2 below the rafter top at the 12 in tail.
const fasciaBottom = 97.125 - 0.5 * 2.5625 - 0.5 * 12 + 3.5 * Math.hypot(1, 0.5) - 5.5;
// Rafter ends against the ledger at 7/16 + 1-1/2 out. Lean-to roof top (+7/16 OSB) clears the fascia
// bottom, 13-1/2 out, by 1-1/2 in.
const start = 0.4375 + 1.5;
const ledgerTop = fasciaBottom - 1.5 - 0.4375 + 0.25 * (13.5 - start);

describe('below-soffit lean-to', () => {
  it('sets the ledger as high as the main fascia allows', () => {
    const [ledger] = ofRole(front, 'ledger');
    // A 2x6 at 3/12 has a 5.67 in plumb end, so the ledger is a 2x8.
    expect(ledger).toMatchObject({ size: '2x8', length: 120 });
    expect(ledger.origin[2] + 7.25).toBeCloseTo(ledgerTop, 9);
  });

  it('seats the rafters on the beam with a birdsmouth', () => {
    // Posts at 94-1/4 to 96 out; beam centered on them, its outer face (the heel) at 95-3/4.
    // Seat: the 3 in beam (1/3 depth allows more). Beam top on the rafter underside at 92-3/4.
    const beamTop = ledgerTop - 0.25 * (95.75 - 3 - start) - 5.5 / cos3;
    const plies = ofRole(front, 'beam');
    expect(plies).toHaveLength(2);
    for (const ply of plies) expect(ply.origin[2] + 7.25).toBeCloseTo(beamTop, 9);
    // Six rafters at 24 in from the left end, both end rafters flush.
    expect(ofRole(front, 'rafter').map(({ origin }) => origin[0])).toEqual([1.5, 24.75, 48.75, 72.75, 96.75, 120]);
  });

  it('spaces posts at most 96 in apart, on piers at grade', () => {
    // 120 in less a 3-1/2 in post: 116-1/2 in, so 3 posts 58-1/4 apart. Grade is the skid bottom.
    const posts = ofRole(front, 'post');
    expect(posts.map(({ origin }) => origin[0])).toEqual([0, 58.25, 116.5]);
    expect(posts.every(({ treated, origin }) => treated && origin[2] === -11.71875 + 8)).toBe(true);
    expect(model.solids.filter(({ id }) => id.startsWith('AF-PR'))).toHaveLength(3);
  });

  it('mirrors to the opposite side and warns about low headroom', () => {
    expect(ofRole(model.members.filter(({ assembly }) => assembly === 'addition.back'), 'post').map(({ origin }) => origin[1])).toEqual([192, 192, 192]);
    // Beam bottom less grade: 8 ft walls are low under a 6/12 main eave.
    expect(model.warnings.map(({ source }) => source)).toEqual(['Front lean-to', 'Back lean-to']);
    expect(model.warnings[0].message).toMatch(/^The clear height under the beam is 5' 5-5\/16"/);
  });

  it('pours a slab in place of piers', () => {
    const slab = buildModel(withLeanTo({ side: 'front', floor: 'slab' }));
    expect(slab.solids.filter(({ id }) => id.startsWith('AF')).map(({ label }) => label)).toEqual(['Slab']);
    expect(ofRole(slab.members, 'post').every(({ origin }) => origin[2] === -11.71875)).toBe(true);
  });

  it('roofs a metal lean-to on purlins, without sheathing', () => {
    const metal = buildModel(withLeanTo({ side: 'front', roofing: 'metal' }));
    // 1x4 purlins sit 3/4 in proud of the rafters, 5/16 in more than the OSB, so the ledger drops by that.
    const [ledger] = ofRole(metal.members.filter(({ assembly }) => assembly === 'addition.front'), 'ledger');
    expect(ledger.origin[2] + 7.25).toBeCloseTo(ledgerTop + 0.4375 - 0.75, 9);
    // Tail at 108 in, rafter ends at 1-15/16: 106-1/16 in run, 109.33 in along the slope. Less one
    // purlin width, 105.83 in between the end purlins: 5 gaps under 24 in, so 6 purlins of 120 in.
    const purlins = ofRole(metal.members, 'purlin');
    expect(purlins.map(({ size, length }) => [size, length])).toEqual(Array.from({ length: 6 }, () => ['1x4', 120]));
    expect(metal.solids.filter(({ label }) => label.startsWith('Roof sheathing'))).toHaveLength(10);
    expect(metal.planes.filter(({ sheathed }) => !sheathed)).toHaveLength(1);
  });

  it('allows one lean-to per side', () => {
    const result = parseConfig({ ...gableSkid, additions: [{ side: 'front', mirror: true }, { side: 'back' }] });
    expect(result.ok ? [] : result.errors).toEqual(['additions.0.side: One lean-to per side', 'additions.1.side: One lean-to per side']);
  });
});

describe('roof extension', () => {
  const extension = (extra: object = {}) =>
    buildModel(withLeanTo({ side: 'front', attach: 'extension', pitch: 'main', rafter: '2x4', ...extra }));
  const same = extension();
  const roofFront = same.members.filter(({ assembly, origin }) => assembly === 'roof' && origin[1] < 48);

  it('cuts the main rafters and fascia back to the wall line on that side', () => {
    // Top edge from the wall line to the ridge face, 47-1/4 × √1.25, plus the plumb low end's long
    // point, 3-1/2 × √1.25 × sin.
    const short = 47.25 * Math.hypot(1, 0.5) + 3.5 * Math.hypot(1, 0.5) * (0.5 / Math.hypot(1, 0.5));
    for (const rafter of ofRole(roofFront, 'rafter')) expect(rafter.length).toBeCloseTo(short, 9);
    expect(ofRole(same.members.filter(({ assembly }) => assembly === 'roof'), 'fascia')).toHaveLength(1);
  });

  it('laps a rafter beside each main rafter, clear of the ties, and continues the main plane', () => {
    const rafters = ofRole(same.members.filter(({ assembly }) => assembly === 'addition.front'), 'rafter');
    // Beside 0 (on its +x side), 23-1/4, 47-1/4, 71-1/4, 95-1/4, 118-1/2 (on their -x sides).
    const xs = rafters.map((rafter) => Math.min(rafter.origin[0], rafter.origin[0] - 1.5));
    expect(xs).toEqual([1.5, 21.75, 45.75, 69.75, 93.75, 117]);
    // 2 ft lap to the 108 in tail along the slope, plus the 1-3/4 in long point at the tail.
    for (const rafter of rafters) expect(rafter.length).toBeCloseTo(132 * Math.hypot(1, 0.5) + 1.75, 9);
    // The extension's roof plane meets the main one at the wall line.
    const [main, , lean] = same.planes;
    expect(main.origin[1]).toBe(0);
    expect(lean.origin[2] + 0.5 * 109.5).toBeCloseTo(main.origin[2], 9);
    expect(same.leanTos[0].lags).toBe(0);
  });

  it('warns when a deeper rafter at a broken pitch notches the wall too deep', () => {
    const broken = extension({ pitch: 3, rafter: '2x6' });
    expect(broken.warnings.map(({ message }) => message)).toContain(
      'The birdsmouth on the main wall cuts deeper than 1/3 of the 2x6 rafter. Use a rafter no deeper than the main rafters.',
    );
  });

  it('ties each extension rafter at the wall and the beam, with no hangers', () => {
    const { hardware } = buildBom(withLeanTo({ side: 'front', attach: 'extension', pitch: 'main', rafter: '2x4' }), same, new Map());
    expect(hardware.find(({ item }) => item === 'Hurricane tie, rafter to plate')?.quantity).toBe(12 + 6 * 2);
    expect(hardware.some(({ item }) => item.startsWith('Joist hanger'))).toBe(false);
  });

  it('extends only a downhill eave, the full length', () => {
    const errors = (config: object) => {
      const result = parseConfig(config);
      return result.ok ? [] : result.errors;
    };
    expect(errors({ ...gableSkid, additions: [{ side: 'left', attach: 'extension' }] })).toEqual([
      'additions.0.attach: A roof extension needs an eave the roof slopes down to',
    ]);
    expect(errors({ ...gableSkid, additions: [{ side: 'front', attach: 'extension', length: 96 }] })).toEqual([
      'additions.0.length: A roof extension runs the full wall length',
    ]);
    // The 10x12 lean-to's high side is the front: it slopes down to the back.
    expect(errors({ ...PRESETS[1], additions: [{ side: 'front', attach: 'extension' }] })).toHaveLength(1);
    expect(errors({ ...PRESETS[1], additions: [{ side: 'back', attach: 'extension' }] })).toEqual([]);
  });
});

describe('lean-to outputs', () => {
  it('checks the rafters and beam', () => {
    const checks = checkSpans(withLeanTo({ side: 'front' }), buildModel(withLeanTo({ side: 'front' })), naming(gableSkid));
    // Ledger face to the inner end of the seat: 95-3/4 - 3 - 1-15/16.
    expect(checks.find(({ member }) => member === 'Front lean-to rafters')?.span).toBe(90.8125);
    expect(checks.find(({ member }) => member === 'Front lean-to beam')).toMatchObject({ lumber: '2-ply 2x8', span: 58.25 });
  });

  it('counts hangers, ties, post hardware, and ledger lags', () => {
    const { hardware } = buildBom(withLeanTo({ side: 'front', mirror: true }), model, new Map());
    const quantity = (item: string) => hardware.find((line) => line.item === item)?.quantity;
    expect(quantity('Joist hanger, 2x6')).toBe(12);
    // 12 main rafters at 1 seat each, and 12 lean-to rafters on their beams.
    expect(quantity('Hurricane tie, rafter to plate')).toBe(24);
    expect(quantity('Post base, 4x4')).toBe(6);
    // Front: 2 corner studs, 5 studs, 2 kings, and 2 jacks (tops at 82-1/4) reach the ledger; the
    // cripple above the header starts at 89-1/2, over it. Back: 2 corner studs and 7 studs.
    expect(model.leanTos.map(({ lags }) => lags)).toEqual([22, 18]);
    expect(quantity('Ledger lag screw, 1/2"')).toBe(40);
  });
});

describe('lean-to left out', () => {
  it('leaves out a below-soffit lean-to where the main roof does not reach past the wall', () => {
    // No rake overhang: nothing of the main roof is over the left gable end's face.
    const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, rakeOverhang: 0 }, additions: [{ side: 'left' }] });
    const leftOut = buildModel(config);
    expect(leftOut.members.filter(({ assembly }) => assembly === 'addition.left')).toEqual([]);
    const warning = leftOut.warnings.find(({ source }) => source === 'Left lean-to');
    expect(warning?.message).toContain('does not reach past the wall');
    expect(warning?.missing?.assembly).toBe('addition.left');
  });
});

describe('lean-to deck', () => {
  // Front, 72 in deep on 4x4 posts centered 70-1/4 out. 2x8 joists under 2x6 boards, level with the
  // floor. Out from the front wall is -y. Grade is at the skid bottoms, -11-23/32.
  const config = withLeanTo({ side: 'front', depth: 72, floor: 'deck' });
  const deckModel = buildModel(config);
  const deck = deckModel.members.filter(({ assembly }) => assembly === 'addition.front');
  const range = (members: Member[], axis: number) => {
    const values = members.flatMap((member) => corners(member).map((point) => point[axis]));
    return [Math.min(...values), Math.max(...values)];
  };

  it('hangs joists from a ledger on the floor framing to a flush beam on the post line', () => {
    const ledger = ofRole(deck, 'ledger.deck');
    // On the floor framing, under the wall sheathing, its top under the boards.
    expect([range(ledger, 1), range(ledger, 2)]).toEqual([[-1.5, 0], [-8.75, -1.5]]);
    const joists = ofRole(deck, 'joist.deck');
    expect(joists).toHaveLength(9);
    expect(joists.every(({ length, treated }) => length === 66.5 && treated)).toBe(true);
    // Three plies, 68 to 72-1/2 out: wide enough to bear the 3-1/2 in posts.
    expect(ofRole(deck, 'beam.deck').map((ply) => range([ply], 1))).toEqual([[-69.5, -68], [-71, -69.5], [-72.5, -71]]);
  });

  it('seats the beam on piers that rise to it, and stands the posts on the beam', () => {
    // An 8 in pier top, at -3-23/32, is over the beam bottom at -8-3/4: the piers stop at the beam.
    const piers = deckModel.solids.filter(({ label }) => label.startsWith('Pier'));
    expect(piers).toHaveLength(3);
    for (const { shape } of piers) expect(shape).toMatchObject({ kind: 'cylinder', height: 38.96875, base: [expect.any(Number), expect.any(Number), -47.71875] });
    const posts = ofRole(deck, 'post');
    expect(posts.map((post) => range([post], 2)[0])).toEqual([-1.5, -1.5, -1.5]);
    expect(deckModel.warnings.some(({ message }) => message.includes('pier'))).toBe(false);
  });

  it('stands deck posts under the beam where the floor is high', () => {
    // On 24 in posts over the piers, the pier tops are at -37-15/32: 28-23/32 under the beam.
    const high = shedSchema.parse({ ...config, foundation: { type: 'pier', pier: { post: '4x4', postLength: 24 } } });
    const posts = ofRole(buildModel(high).members, 'post').filter(({ assembly }) => assembly === 'addition.front');
    expect(posts.filter(({ note }) => note === 'Under the deck beam.').map(({ length }) => length)).toEqual([28.71875, 28.71875, 28.71875]);
    expect(posts.filter(({ note }) => note === 'Stands on the deck beam, over the pier.')).toHaveLength(3);
  });

  it('lays 2x6 boards level with the floor, notched where the posts reach an edge', () => {
    const boards = ofRole(deck, 'decking');
    expect(boards).toHaveLength(13);
    expect(range(boards, 2)).toEqual([-1.5, 0]);
    // Rows 63-1/4 to 68-3/4 and 69 to 74-1/2 out; the posts stand 68-1/2 to 72.
    const [outer, inner] = boards.filter(({ note }) => note === 'Notch around the posts.');
    expect(outer.profile?.points).toContainEqual([0, 5.25]);
    expect(inner.profile?.points).toContainEqual([0, 3]);
    expect([outer.length, inner.length]).toEqual([120, 120]);
  });

  it('measures headroom from the deck', () => {
    expect(deckModel.warnings.find(({ message }) => message.startsWith('The clear height'))?.message).toBe(
      'The clear height under the beam is 4\' 11-9/16", less than 6\' 8".',
    );
  });

  it('checks the deck joists and beam, and counts hangers, lags, and beam seats', () => {
    const checks = checkSpans(config, deckModel, naming(config));
    expect(checks.find(({ member }) => member === 'Front lean-to deck joists')).toMatchObject({ lumber: '2x8 at 16" o.c.', span: 66.5 });
    expect(checks.find(({ member }) => member === 'Front lean-to deck beam')).toMatchObject({ lumber: '3-ply 2x8', span: 58.25 });
    const { hardware } = buildBom(config, deckModel, new Map());
    const quantity = (item: string) => hardware.find((line) => line.item === item)?.quantity;
    expect(quantity('Joist hanger, 2x8')).toBe(18);
    expect(quantity('Deck ledger lag screw, 1/2"')).toBe(18);
    expect(quantity('Beam seat, 3-ply 2x8')).toBe(3);
  });
});
