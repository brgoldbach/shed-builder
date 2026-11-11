# Developer guide

How Shed Builder is built, and how to change it. For setup, scripts, and hosting, see
[README.md](../README.md). For changes by release, see [CHANGELOG.md](../CHANGELOG.md).

Update this guide and the detailed documents below in the same commit as any change they describe.

## Detailed documents

| Document | Subject |
|---|---|
| [design-model.md](design-model.md) | The config schema, units, side names, opening placement, the lumber catalog, file versions, prune, compact files, share links, and autosave. |
| [framing.md](framing.md) | The framing model, coordinates, build order, foundation and floor, walls and openings, roofs, gable ends, ties, loft, and knee walls. |
| [additions-and-finishes.md](additions-and-finishes.md) | Lean-tos and their decks, ramps, sheathing, and the visual finishes. |
| [outputs.md](outputs.md) | The cut list, lumber and sheet packing, concrete, hardware, roofing, costs, span checks, and CSV. |
| [drawings.md](drawings.md) | Drawing views and projection, each sheet and its dimensions, SVG layout, the zoom viewer, and the PDF. |
| [ui.md](ui.md) | App state, undo, storage, the form and its editors, the 3D view, the phone layout, and the build scripts. |

## Decisions

The decisions that shape the whole app. Each detailed document gives the decisions in its area.

| Decision | Reason |
|---|---|
| A static site with no server. | Free hosting, and each design stays with its user: in the browser, a file, or a link. |
| Inches everywhere in the model. | US lumber, plans, and tools use inches; the display formats feet and inches. |
| The model's front and back are the eave walls. A gable front only renames the sides. | One geometry for both fronts keeps the generators simple. |
| Cut lengths run long point to long point, along the board. | That is the shortest board each piece comes from. |
| The app builds what the user enters wherever the parts can exist, and warns. It leaves out only framing that would collide, drawn in red. | The tool must not limit the user. The outputs must match the input, or show where they cannot. |
| Saved files and links hold only the settings the design uses, without defaults. | Small files, and links short enough for a QR code. Old, fuller files still load. |
| Autosave keeps the full design. | A setting the user switches away from and back keeps its value. |
| Finishes are visual only. | They show the look; they do not change the framing, cut list, or BOM. |
| The PDF libraries load only when the user makes a PDF. | They are large; the first load stays fast. |

## Overview

Shed Builder is a static single-page app. Every computation runs in the browser, and there is no
server. One design object, the config, goes in. Pure functions turn it into the outputs.

```
ShedConfig ── buildModel ──▶ Model { members, solids, warnings, openings, planes, leanTos }
    │                          ├─ buildCutList ──▶ CutLine[]      (marks: FW-1, RF-2, ...)
    │                          ├─ buildBom ──────▶ Bom            (stock, sheets, counts, costs)
    │                          ├─ checkSpans ────▶ SpanCheck[]    (span warnings)
    │                          ├─ buildDrawings ─▶ Drawing[]  ──▶ DrawingSvg (screen), pdf.ts (PDF)
    │                          └─ buildFinishes ─▶ FinishPart[] ─▶ FramingScene (3D)
    └─ pruneConfig ─▶ compactDesign ─▶ saved file, share link
```

| Layer | Folder | Rule |
|---|---|---|
| Design model | `src/core` | Pure TypeScript. No React, no DOM, no Three.js. |
| Drawings | `src/drawings` | Pure. Inches, drawing y up. |
| User interface | `src/ui` | React. Owns all state. |
| 3D view | `src/view3d` | Three.js. Draws what the UI passes it. |

## Conventions

| Topic | Convention |
|---|---|
| Units | Inches everywhere. `formatInches` and `formatLength` show a length; `parseLength` reads one (`src/core/units.ts`). |
| Axes | x runs along the length, left to right. y runs front to back. z is up from the floor surface: the subfloor top, or the slab top. |
| Sides | The model's front and back are always the eave walls; left and right are the gable ends. `front: 'gable'` only renames the sides (`src/core/naming.ts`). Config fields such as `openings[].wall` and `additions[].side` use model sides. |
| Member | One piece of lumber: `origin`, `axes`, `length`, and an optional `profile` for angled cuts (`src/core/member.ts`). |
| Cut length | A profiled member's length is its extent along the board: long point to long point. `planeMember` (`src/core/gen/section.ts`) sets it from the outline. |
| Solid | A non-lumber part: concrete, a sheet, or steel. |
| Ids and marks | A generator names members with `idMaker(prefix)`, for example `RF-R01`. The cut list groups identical members and gives each line a mark: the assembly prefix and a number, for example `RF-2`. |
| Warnings | `{ source, message }`. A generator warns and goes on; it never throws on a valid config. |
| Left out | The app builds what the user enters wherever the parts can exist, and warns. A part whose framing would collide is left out: its warning carries `missing`, a loop in model coordinates, and its message ends with `LEFT_OUT`. The 3D view and the drawings of `missing.assembly` draw the loop in red. |
| Splices | `splitPlate` splits a long run at stud centers, at most `catalog.maxLength` apart. |
| Comments | Comment intent only: a non-obvious rule, an equation, a units constraint. |

## Source map

| File | Content |
|---|---|
| `src/core/config.ts` | The zod schema `shedSchema`: every setting with its default and range. `parseConfig`, `serializeConfig`. |
| `src/core/catalog.ts` | Lumber sizes and dimensions, sheet goods, species values, stock lengths, default prices. |
| `src/core/model.ts` | `buildModel`: calls the generators in order. |
| `src/core/gen/floor.ts` | Foundation (skids, piers, girders, posts, slab) and floor framing. |
| `src/core/gen/walls.ts` | Wall framing, openings in the walls, plates and splices, anchor bolts. |
| `src/core/gen/roof.ts` | Rafters, ridge, fascia, rake ladders, purlins, gable-end framing and gable openings. Calls `attic.ts`. |
| `src/core/gen/attic.ts` | Rafter and collar ties, loft floor and hatches, knee walls. |
| `src/core/gen/additions.ts` | Lean-tos: ledger or roof extension, rafters, beam, posts, piers, slab, or deck. |
| `src/core/gen/ramps.ts` | Ramps: `rampPlace` (its wall and edges, from its opening or its own position); wood stringers and boards, or a concrete wedge as a panel solid. The foot is `belowGrade` under grade. `withoutOpeningRow` removes an opening row and keeps each ramp in place. |
| `src/core/gen/sheathing.ts` | Wall, roof, and floor sheets, cut around openings. |
| `src/core/gen/finishes.ts` | 3D look only: siding, roofing, trim, doors, windows. It does not change framing, cut list, or BOM. |
| `src/core/gen/section.ts` | Shared geometry: `planeMember`, pitch and slope math, `idMaker`. |
| `src/core/out/cutlist.ts` | `buildCutList`, and `LENGTH_RULE`, the cut-length text. |
| `src/core/out/bom.ts` | `buildBom`: lumber packed onto stock lengths, sheets, concrete, hardware, roofing, costs. |
| `src/core/out/spans.ts` | `checkSpans`: AWC span equations with NDS 2018 values for No. 2 lumber. |
| `src/core/out/csv.ts` | Cut list and BOM as CSV. |
| `src/core/naming.ts` | The user's names for sides and assemblies, and the cut-list order. |
| `src/core/placement.ts` | Opening positions: percent, or from the left or right corner. |
| `src/core/prune.ts` | `pruneConfig`: resets each setting the design does not use. |
| `src/core/share.ts` | Compact file text and share links. |
| `src/drawings/sheets.ts` | `buildDrawings`: every framing sheet. |
| `src/drawings/drawing.ts` | The `Drawing` type, projection of members and solids into a view. |
| `src/drawings/piece.ts` | A piece laid flat and dimensioned, and the cut-length key sheet. |
| `src/drawings/scale.ts` | Plan scales, and the pick of the largest scale that fits a sheet. |
| `src/ui/App.tsx` | App state, tabs, autosave, file open and save, share link. |
| `src/ui/DesignForm.tsx` | The settings form, one section component for each part of the config. |
| `src/ui/fields.tsx` | Field components and the `Section`, `Group`, and `Card` folds. |
| `src/ui/OpeningsEditor.tsx`, `AdditionsEditor.tsx`, `RampsEditor.tsx` | List editors for opening types, placements, lean-tos, and ramps. |
| `src/ui/history.ts` | The undo history: `record`, `undo`, `redo`, 100 steps. |
| `src/ui/pdf.ts` | The PDF plan set. Loaded only on demand, with jsPDF, svg2pdf.js, and qrcode-generator. |
| `src/view3d/scene.ts` | `FramingScene`: meshes, finish textures, picking, camera fit. |

## Build order

`buildModel` (`src/core/model.ts`) runs the generators in this order. The first three read only
the config; the later ones also read what came before.

1. `frameFloor`: foundation and floor.
2. `frameWalls`: walls and their openings.
3. `frameRoof`: roof, gable ends, and through `frameAttic` the ties, loft, and knee walls.
4. `frameAdditions`: lean-tos. They need the main roof's soffit and eave facts, and the shed members.
5. `frameRamps`: ramps. They need grade, from the foundation members.
6. `frameSheathing`: sheets. They need the members, openings, roof planes, and loft deck.

Grade comes from `gradeOf` (`src/core/gen/floor.ts`): the slab top, the skid bottoms, or the pier
tops less their height above grade. The floor surface is z = 0.

## Config rules

- Every field has a default. Each nested object uses `.prefault({})`, so `{ "schemaVersion": 1 }`
  parses to a full design.
- Objects are strict: an unknown key fails the parse. If you rename or remove a field, add an
  upgrade step in `parseConfig`, as `keepWallHeight` does, so old files still load.
- `schemaVersion` stays 1 until an old file needs an upgrade step to load. A new field with a
  default does not change it.
- The app never blocks a design for being unusual. It builds what it can and warns.

## Saved files and links

| Form | Content | Code |
|---|---|---|
| Autosave | The full design, in `localStorage` key `shed-builder.config`. A setting you switch away from keeps its value. | `serializeConfig` |
| Saved file | The pruned design, without default values. | `designFileText` |
| Share link | `#design=` and the compact JSON, deflate-raw compressed, base64url. | `designToLink`, `designFromLink` |

The compact form: `pruneConfig`, then strip each default value. List items keep the keys that a
file must give. A value whose default depends on another field comes back. When the compact form
does not load back to the same design, the full pruned design goes in instead.

`pruneConfig` must not change the output. The prune test builds each design before and after.

## Drawings and PDF

A `Drawing` holds shapes (projected members and solids), dimensions (`chain`, `running`,
`aligned`), labels, dashed outlines, and notes. `buildDrawings` returns them in sheet order:

1. Foundation plan.
2. Floor framing plan.
3. Decks and ramps.
4. Wall elevations, in the user's side order.
5. Gable-end elevations.
6. Loft framing plan.
7. Knee-wall elevations.
8. Roof framing plan.
9. Building section.
10. Common rafter.
11. Cut-length key.

A sheet with nothing to show is left out. On screen, `DrawingSvg` renders each drawing. The PDF
puts one drawing on each sheet, at the largest standard scale that fits, with a title block. When a
share link exists, the last sheet holds it as a QR code.

## User interface

- `App.tsx` holds the config inside an undo history (`history.ts`). Every output is a `useMemo` of
  the config. A change that leaves the design as it was is not an undo step.
- A form edit goes through `edit(next)`, which validates with `shedSchema.safeParse`. A section
  component gets `value` and `onChange` (`SectionProps`).
- A load (file, preset, link) goes through `replace(next)`, which remounts the form.
- 3D layers come from `LAYERS` in `src/core/member.ts`. The Framing and Finished buttons hide sets
  of layers.
- The phone layout starts at 760 px. `PHONE` in `App.tsx` and the media query in `app.css` must
  match.
- The changelog dialog reads `CHANGELOG.md` at build time and parses its `##` and `###` sections.

## Recipes

### Add a setting

1. Add the field and its default in `src/core/config.ts`.
2. Read it in the generator.
3. If it applies only with some other choice, add the rule to `pruneConfig`.
4. Add the field to its section in `src/ui/DesignForm.tsx`.
5. Add unit tests. If no test design uses it, set it in a fixture in `tests/fixtures`.
6. Add a CHANGELOG entry under `[Unreleased]`, and update README and this guide if they describe
   it.

### Add a member role

1. Add the role and its label to `ROLES` in `src/core/member.ts`. The key order is the cut-list
   order within an assembly.
2. Add an assembly to `ASSEMBLIES` if the part needs its own mark prefix or 3D layer.
3. Emit the members in the generator. The cut list and the lumber in the BOM pick them up.
4. Count any hardware for it in `hardware()` in `src/core/out/bom.ts`.
5. Add a span check in `src/core/out/spans.ts` if it carries load.

### Add a counted BOM item

1. Add its default price to `DEFAULT_PRICES` in `src/core/catalog.ts`.
2. Add the line in `concrete()`, `hardware()`, or `roofing()` in `src/core/out/bom.ts`.
3. Add the price label in the Lumber catalog section of `DesignForm.tsx`.

### Leave out a part that cannot be framed

1. Build the part whenever its pieces can exist, and warn about the problem.
2. When its framing would collide, push a warning with `missing: { assembly, outline }` and end the
   message with `LEFT_OUT`. Do not emit its members.
3. Make sure a sheet that draws `assembly` passes `missingIn(model, view, ...)` for it.

### Add a drawing sheet

1. Write a function in `src/drawings/sheets.ts` that returns `makeDrawing(...)`, or `null` when
   the design has nothing to show.
2. Add it to the list in `buildDrawings`.
3. Test its dimensions in `tests/drawings.test.ts`.

## Tests

`npm test` runs Vitest. Every test runs in Node, with no browser.

| Test | Checks |
|---|---|
| `tests/golden.test.ts` | Cut list, warnings, parts, stock, sheets, counted items, costs, and span checks of each design in `tests/designs.ts`, against `tests/golden/*.txt`. |
| `tests/every-design.test.ts` | On each design: unique member ids, positive lengths, angled pieces within their board width, one cut line for each member, unique marks, and only finite numbers in every output. |
| `tests/prune.test.ts`, `tests/share.test.ts` | Each design builds the same after pruning, and loads back from its file and link. |
| `tests/history.test.ts` | Undo and redo steps. |
| Other `tests/*.test.ts` | One file for each generator or output, with hand-checked values. |

`DESIGNS` (`tests/designs.ts`) is the presets and the fixtures in `tests/fixtures`. To cover a new
option, set it in a fixture, or add a fixture and list it in `DESIGNS`.

When a change alters a golden file on purpose, read the diff, then run `npx vitest run -u`.

The gate before each commit: `npm test`, `npm run lint`, and `npm run build`.

## Span checks

`checkSpans` checks rafters, floor joists, loft joists, opening headers, pier girders, lean-to
rafters and beams, and lean-to deck joists and beams. It does not check studs, the ridge board,
rafter and collar ties, skids, loft ledgers, posts, ramps, lean-to loads on the main-wall headers and
girders, the deck ledger's load on the floor framing, pier bearing on soil, wind, uplift, wall
bracing, or connections.

## Release

1. `npm version X.Y.Z --no-git-tag-version`.
2. In CHANGELOG.md, change `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`. Add the link line
   `[X.Y.Z]: https://github.com/brgoldbach/shed-builder/releases/tag/vX.Y.Z` above the older ones.
3. Run the gate.
4. Commit `Release X.Y.Z` on a branch, then fast-forward `main`.
5. `git tag -a vX.Y.Z -m "Shed Builder X.Y.Z"`.
6. Push `main`, then push the tag.
7. `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <the version's changelog section> --verify-tag`.

Cloudflare builds and deploys each push to `main` (see README).
