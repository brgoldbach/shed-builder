import { describe, expect, it } from 'vitest';
import { parseConfig, shedSchema } from '../src/core/config';
import type { Member, Role } from '../src/core/member';
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
    // Front: 6 corner studs, 5 studs, 2 kings, and 2 jacks (tops at 82-1/4) reach the ledger; the
    // cripple above the header starts at 89-1/2, over it. Back: 6 corner studs and 7 studs.
    expect(model.leanTos.map(({ lags }) => lags)).toEqual([30, 26]);
    expect(quantity('Ledger lag screw, 1/2"')).toBe(56);
  });
});
