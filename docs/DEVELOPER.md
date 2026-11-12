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
| [ui.md](ui.md) | App state and data flow, undo, the storage flows, the error banner and recovery page, the form and its editors, the 3D view, and the phone layout. |

A document states contracts, rules, and the reasons for them. It does not repeat a function body,
a test list, a schema field by field, or a value that the code names. Each fact lives in one
document; another document links to it.

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
| Solid | A non-lumber part: concrete, a sheet, or steel. |
| Ids and marks | A generator names members with `idMaker(prefix)`, for example `RF-R01`. The cut list groups identical members and gives each line a mark: the assembly prefix and a number, for example `RF-2`. |
| Warnings | `{ source, message }`. A generator warns and goes on; it never throws on a valid config. |
| Left out | The app builds what the user enters wherever the parts can exist, and warns. A part whose framing would collide is left out: its warning carries `missing`, a loop in model coordinates, and its message ends with `LEFT_OUT`. The 3D view and the drawings of `missing.assembly` draw the loop in red. |
| Comments | Comment intent only: a non-obvious rule, an equation, a units constraint. |
| File size | Split a file when a change there is hard, not for its length. |

## Source map

| File | Content |
|---|---|
| `src/core/config.ts` | The zod schema `shedSchema`: every setting with its default and range. `parseConfig`, `serializeConfig`. |
| `src/core/catalog.ts` | Lumber sizes and dimensions, sheet goods, species values, stock lengths, default prices. |
| `src/core/model.ts` | `buildModel`: calls the generators in order. |
| `src/core/gen/floor.ts` | Foundation (skids, piers, girders, posts, slab) and floor framing. |
| `src/core/gen/walls.ts` | Wall framing, openings in the walls, plates and splices, anchor bolts. |
| `src/core/gen/roof.ts` | Rafters, ridge, fascia, rake ladders, purlins, a gambrel's gussets, gable-end framing and gable openings. `gambrelBreak`: where a gambrel's break is. Calls `attic.ts`. |
| `src/core/gen/attic.ts` | Rafter and collar ties, loft floor and hatches, knee walls. |
| `src/core/gen/additions.ts` | Lean-tos: ledger or roof extension, rafters, beam, posts, piers, slab, or deck. |
| `src/core/gen/deck.ts` | Lean-to decks: `deckHeights`, `frameDeck` (ledger, joists, beam, rims, boards, and a deck's own skids or girders), and the facts the floor shares: `onShed`, `deckReach`, `continuedDecks`. |
| `src/core/gen/supports.ts` | The skid or girder lines a floor stands on (`supportLines`), and the skid end cut (`skidOutline`). |
| `src/core/gen/ramps.ts` | Ramps: `rampPlace` (its wall and edges, from its opening or its own position); wood stringers and boards, or a concrete wedge as a panel solid. The foot is `belowGrade` under grade. `withoutOpeningRow` removes an opening row and keeps each ramp in place. |
| `src/core/gen/sheathing.ts` | Wall, roof, and floor sheets, cut around openings. |
| `src/core/gen/finishes.ts` | 3D look only: siding, roofing, trim, doors, windows. It does not change framing, cut list, or BOM. |
| `src/core/gen/section.ts` | Shared geometry: `planeMember`, pitch and slope math (`pitchOf`, `Slope`), `Profile` (one roof side's slopes, from `profileOf`), `crossing`, `idMaker`. |
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
| `src/ui/App.tsx` | App state, tabs, file open and save, share link. |
| `src/ui/autosave.ts` | Autosave: `restore`, `save`, and the backup of a stored design that does not load. |
| `src/ui/ErrorBoundary.tsx` | The recovery page when a render throws: download, reload, or start a new design. |
| `src/ui/DesignForm.tsx` | The settings form, one section component for each part of the config. |
| `src/ui/fields.tsx` | Field components and the `Section`, `Group`, and `Card` folds. |
| `src/ui/OpeningsEditor.tsx`, `AdditionsEditor.tsx`, `RampsEditor.tsx` | List editors for opening types, placements, lean-tos, and ramps. |
| `src/ui/history.ts` | The undo history: `record`, `undo`, `redo`, 100 steps. |
| `src/ui/pdf.ts` | The PDF plan set. Loaded only on demand, with jsPDF, svg2pdf.js, and qrcode-generator. |
| `src/view3d/scene.ts` | `FramingScene`: meshes, finish textures, picking, camera fit. |
| `src/view3d/export.ts` | `toGlb`: the shown 3D pieces as a binary glTF file. Loaded only on demand. |
| `scripts/release.mjs`, `scripts/changelog.ts` | The release file edits: the version check, the CHANGELOG heading and link line, the release notes. |
| `.github/workflows/` | `gate.yml`; `release-command.yml` and `release.yml` (see Release). |

## Where the rest is

| Subject | Document |
|---|---|
| Build order: floor, walls, roof, additions, ramps, sheathing, and what each reads | [framing.md §3](framing.md#3-build-order) |
| Config rules: defaults, strict objects, `schemaVersion`, upgrade steps, old files | [design-model.md §1](design-model.md#1-the-config) and [§6](design-model.md#6-files-and-versions) |
| Autosave, saved files, and share links | [design-model.md §8 and §9](design-model.md#9-autosave-saved-file-and-link) |
| Drawing sheets and their order, the PDF | [drawings.md §3](drawings.md#3-sheets) |
| App state, edits, undo, the 3D view, the phone layout | [ui.md](ui.md) |
| What the span checks cover and leave out | [outputs.md §8](outputs.md#8-span-checks) and [§8.10](outputs.md#810-not-checked) |

## Recipes

### Add a setting

1. Add the field and its default in `src/core/config.ts`.
2. Read it in the generator.
3. If it applies only with some other choice, add the rule to `pruneConfig`.
4. Add the field to its section in `src/ui/DesignForm.tsx`, with its help: an entry in
   `src/ui/help/design.ts` (or `editors.ts` for a list editor), keyed by its config path.
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
| `tests/every-design.test.ts` | `designProblems` (`tests/design-checks.ts`) on each design: no throw, unique member ids, positive lengths, angled pieces within their board width, one cut line for each member, unique marks, only finite numbers in every output, and no empty drawing. |
| `tests/saved.test.ts` | Each file in `tests/fixtures/saved/vX.Y.Z/` loads and passes `designProblems`. These are the presets and test designs as each release had them. |
| `tests/random.test.ts` | `designProblems` on 300 random designs: each a test design with 1 to 6 settings changed, kept only when the schema accepts it (`tests/random-designs.ts`, fixed seed). About 4 s. |
| `tests/prune.test.ts`, `tests/share.test.ts` | Each design builds the same after pruning, and loads back from its file and link. |
| `tests/history.test.ts` | Undo and redo steps. |
| Other `tests/*.test.ts` | One file for each generator or output, with hand-checked values. |

`DESIGNS` (`tests/designs.ts`) is the presets and the fixtures in `tests/fixtures`. To cover a new
option, set it in a fixture, or add a fixture and list it in `DESIGNS`.

When a change alters a golden file on purpose, read the diff, then run `npx vitest run -u`.

When a random design fails, its test name gives the index, and the message gives the compact
design. Add that design to `tests/fixtures` with the fix. To search further, change the seed or
the count for one run; do not commit a count that slows the gate.

The gate is `npm run gate`: the tests, lint, the type check, and the build. Run it before each
commit. It also runs in two other places:

| Where | Effect |
|---|---|
| `.github/workflows/gate.yml`, on each pull request and each push to `main` | `main` requires a pull request with a passing `gate` check. |
| The Cloudflare build commands | A failed gate leaves the last good deployment live, and makes no preview. |

Lint also keeps `src/core` and `src/drawings` free of React, the DOM, and Three.js
(`eslint.config.js`).

## Release

Any pull request to `main` can be a release. You choose the version.

1. When the pull request is ready, comment `/release X.Y.Z` on it, or `/release patch`, `minor`,
   or `major` to count up from the current version. Only the repo owner's comment works.
2. `.github/workflows/release-command.yml` adds the commit "Release X.Y.Z" to the pull request's
   branch: the version in `package.json` and `package-lock.json`, `[Unreleased]` in CHANGELOG.md
   dated as the version, its link line, and copies of changed designs in
   `tests/fixtures/saved/vX.Y.Z/`. It replies in the pull request.
3. Select "Approve workflows to run" on the pull request. The workflow's built-in token pushed the
   commit, so GitHub treats it as a first-time contributor and holds `gate` until you approve.
   A personal access token would avoid this step; the repo does not use one.
4. When `gate` passes, merge the pull request.

The merge changes the version on `main`, so `.github/workflows/release.yml` then:

1. Tags the merge commit `vX.Y.Z`, "Shed Builder X.Y.Z".
2. Pushes that commit to `release`. Cloudflare deploys the push.
3. Waits up to 15 min for `version.txt` on the live site to show `X.Y.Z`.
4. Publishes the GitHub release, with the version's CHANGELOG section as its notes.

A merge with no "Release" commit changes only `main` and its preview. To release changes that
are already on `main`, open a pull request that adds only the `[Unreleased]` entries it needs,
or none, and comment on it.

| Problem | Action |
|---|---|
| The command replies "No release commit added": the version is not above the current one, or `[Unreleased]` is missing or empty. | Correct the cause, then comment again. |
| The wrong version is in the pull request. | Revert the "Release" commit, then comment again. |
| The release workflow fails. | Read its log. Correct the cause, then select "Re-run failed jobs". Each step skips work already done. |
| Cloudflare does not deploy the version. | Correct it in a new pull request, then release the next patch version. |

`scripts/release.mjs` makes the file edits for both workflows: `prepare X.Y.Z|patch|minor|major`
and `notes X.Y.Z`. If the workflows cannot run, do their steps by hand: `prepare` on the pull
request's branch, the merge, the tag, `git push origin 'vX.Y.Z^{commit}:release'`, and
`gh release create` with `notes`.

Never force-push `release`, and never merge a pull request into it. A GitHub merge makes new
commits, so the live commit would then differ from the tag.
