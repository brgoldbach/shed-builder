import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { buildBom, sheetLabel } from '../src/core/out/bom';
import { buildCutList } from '../src/core/out/cutlist';
import { checkSpans, spanWarnings } from '../src/core/out/spans';
import { PRESETS } from '../src/core/presets';
import { formatInches, formatLength, formatMoney } from '../src/core/units';

// A change in any preset's cut list, warnings, parts, bill of materials, costs, or span checks fails here
// until the golden file is reviewed and updated with `npx vitest run -u`.
describe('preset cut lists', () => {
  it.each(PRESETS.map((preset) => [preset.name, preset] as const))('%s', async (name, preset) => {
    const model = buildModel(preset);
    const cutList = buildCutList(model.members, naming(preset));
    const lines = cutList.map((line) =>
      [
        line.mark.padEnd(6),
        String(line.ids.length).padStart(3),
        `${line.size}${line.treated ? ' PT' : ''}`.padEnd(8),
        formatInches(line.length).padStart(10),
        ROLES[line.role] + (line.note ? `. ${line.note}` : ''),
      ].join('  '),
    );
    const warnings = model.warnings.map((warning) => `WARNING ${warning.source}: ${warning.message}`);
    const counts = Map.groupBy(model.solids, (solid) => solid.label);
    const solids = [...counts].sort(([first], [second]) => first.localeCompare(second)).map(([label, group]) => `SOLID ${label} x${group.length}`);
    const marks = new Map(cutList.flatMap((line) => line.ids.map((id) => [id, line.mark] as const)));
    const bom = buildBom(preset, model, marks);
    const stock = bom.lumber.flatMap((group) =>
      [...Map.groupBy(group.boards, ({ stock }) => stock)].map(
        ([length, boards]) => `STOCK ${group.size}${group.treated ? ' PT' : ''} ${formatLength(length)} x${boards.length}`,
      ),
    );
    const sheets = bom.sheets.map(({ sheet, count }) => `SHEETS ${sheetLabel(sheet)} x${count}`);
    const items = [...bom.concrete, ...bom.hardware, ...bom.roofing].map(({ item, quantity, unit }) => `ITEM ${item}: ${quantity} ${unit}`);
    const costs = Object.entries(bom.costs).map(([section, dollars]) => `COST ${section} ${formatMoney(dollars)}`);
    const bomWarnings = bom.warnings.map((warning) => `WARNING ${warning.source}: ${warning.message}`);
    const checks = checkSpans(preset, model, naming(preset));
    const spans = checks.map(
      ({ member, lumber, span, allowed, governs }) =>
        `SPAN ${member}: ${lumber} ${formatInches(span)} of ${allowed === null ? 'unchecked' : `${formatInches(allowed)} (${governs})`}`,
    );
    const spanWarns = spanWarnings(checks, preset).map((warning) => `WARNING ${warning.source}: ${warning.message}`);
    const all = [...lines, ...warnings, ...solids, ...stock, ...sheets, ...items, ...costs, ...bomWarnings, ...spans, ...spanWarns];
    await expect(`${all.join('\n')}\n`).toMatchFileSnapshot(
      `golden/${name.replaceAll(' ', '-')}.txt`,
    );
  });
});
