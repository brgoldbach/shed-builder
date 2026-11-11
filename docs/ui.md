# User interface

The user interface is a React app in `src/ui` and a Three.js scene in `src/view3d`. `App` holds one
design, the config, in an undo history. The form edits the config. Every output is a `useMemo` of
the config, and the tabs show the outputs. `FramingScene` draws the model in 3D. The design stays
in the browser, in a file, or in a link: there is no server.

| Related document | Subject |
|---|---|
| [DEVELOPER.md](DEVELOPER.md) | Overview, conventions, recipes, the gate. |
| [design-model.md](design-model.md) | `shedSchema`, `pruneConfig`, the compact form, link data. |
| [drawings.md](drawings.md) | The Framing tab, `DrawingSvg`, the zoom viewer, the PDF. |
| [outputs.md](outputs.md) | The cut list, BOM, span checks, and CSV that the tabs show. |
| [additions-and-finishes.md](additions-and-finishes.md) | Lean-tos, ramps, and the finish parts that the 3D view draws. |

## Source map

| File | Content |
|---|---|
| `index.html` | The page shell: `<div id="root">` and the module script `/src/main.tsx`. |
| `src/main.tsx` | Mounts `App` in `StrictMode` and imports `app.css`. |
| `src/ui/App.tsx` | App state, undo keys, autosave, files, presets, links, tabs, 3D layers, selection. |
| `src/ui/history.ts` | `UndoHistory`, `startHistory`, `record`, `undo`, `redo`. |
| `src/ui/fields.tsx` | `Edit`, `SectionProps`, `setter`, the `Section`, `Group`, and `Card` folds, and the field components. |
| `src/ui/DesignForm.tsx` | The form: one component for each section, `PriceGroup`, and `HatchesEditor`. |
| `src/ui/OpeningsEditor.tsx` | `OpeningTypesEditor` (types) and `OpeningRowsEditor` (placement rows). |
| `src/ui/AdditionsEditor.tsx` | Lean-to cards. |
| `src/ui/RampsEditor.tsx` | Ramp cards and the Follows choice. |
| `src/ui/View3D.tsx` | The React host of `FramingScene`, the toolbar slot, and the Fit view button. |
| `src/view3d/scene.ts` | `FramingScene`: meshes, materials, canvas textures, red loops, pick, camera fit, disposal. |
| `src/ui/FramingView.tsx`, `DrawingSvg.tsx`, `pdf.ts` | The Framing tab. See [drawings.md](drawings.md). |
| `src/ui/CutListTable.tsx` | The cut list table and `stockLabel`. |
| `src/ui/BomView.tsx` | The BOM tab. |
| `src/ui/SpanTable.tsx` | The span-check table on the Warnings tab. |
| `src/ui/PieceInfo.tsx` | The panel of the selected cut-list line, with one piece laid flat. |
| `src/ui/ChangelogDialog.tsx`, `src/ui/changelog.ts` | The changelog dialog and its Markdown parser. |
| `src/ui/app.css` | Theme tokens, layout grid, form, 3D toolbar, tables, drawings, phone layout, print. |

## App state and data flow

### Data flow

```
field commit ─▶ setter chain ─▶ edit(next) ─ shedSchema.safeParse ─▶ change ─▶ record
                                   └─ rejected: first issue message back to the field
designHistory.present = config
  ├─ useMemo ─▶ model ─▶ cutList ─▶ markOf ─▶ drawings, bom
  │              ├─▶ spans, finishes
  │              └─▶ shown, shownSolids, shownFinishes, shownMissing ─▶ View3D
  ├─ effect ──▶ localStorage 'shed-builder.config'
  └─ effect ──▶ designToLink ─▶ shareLink ─▶ Copy link, PDF QR sheet
```

### State in `App`

| State | Initial value | Purpose |
|---|---|---|
| `designHistory` | `startHistory(restore())` | The design and its undo steps. `config` is `designHistory.present`. |
| `revision` | `0` | The `key` of `DesignForm`. A load adds 1, which remounts the form. |
| `loadError` | `null` | `{ file, errors }` for the error banner. |
| `tab` | `'3d'` | The selected tab. |
| `phone` | `matchMedia(PHONE).matches` | From `usePhone`. True at 760 px wide and below. |
| `layersOpen` | `false` | On a phone: the layer list is open. |
| `selected` | `null` | The selected cut-list mark, for example `RF-2`. |
| `hidden` | `new Set(VIEWS.Framing)` | The hidden 3D layers. |
| `hadDesign` | `saved() !== null` | Storage held a design at mount. A link asks before it replaces the design only when true. |
| `shareLink` | `null` | The link for Copy link and the PDF's last sheet. |
| `copied` | `false` | Shows "Link copied" for 2000 ms. |
| `changelogOpen` | `false` | Shows `ChangelogDialog`. |
| `fileInput` | `useRef(null)` | The hidden file input of Open. |

`view` is the tab on screen: `'3d'` when the screen is wider than a phone and `tab` is `'design'`,
else `tab`. `.app` carries it as `data-view`.

### Derived outputs

Each value is a `useMemo`, except where the table says "each render".

| Value | Computation | Used by |
|---|---|---|
| `model` | `buildModel(config)` | Everything below. |
| `names` | `naming(config)` | Cut list, drawings, span checks, `PieceInfo`. |
| `cutList` | `buildCutList(model.members, names)` | Cut list tab, selection. |
| `markOf` | `Map` of member id to cut-list mark | Drawings, BOM, 3D pick, Framing pick. |
| `drawings` | `buildDrawings(config, model, names, markOf)` | Framing tab and PDF. |
| `bom` | `buildBom(config, model, markOf)` | BOM tab. |
| `spans` | `checkSpans(config, model, names)` | Warnings tab. |
| `warnings` (each render) | `model.warnings`, `bom.warnings`, `spanWarnings(spans, config)` | Warnings tab and its count. |
| `finishes` | `buildFinishes(config, model)` | 3D. |
| `shown`, `shownSolids`, `shownFinishes` | Members by `layerOf`, solids by `solid.layer`, finish parts by `part.layer`, without the `hidden` layers | 3D. |
| `shownMissing` | `missing.outline` of each warning whose `ASSEMBLIES[missing.assembly].layer` is not hidden | 3D red loops. |
| `selectedLine` (each render) | The cut line whose mark is `selected` | `PieceInfo`, `selectedIds`. |
| `selectedIds` | `new Set(selectedLine?.ids)` | 3D and drawing highlight. |

### An edit, step by step

1. A field parses its text and calls its `onChange` with a value of its own type.
2. `setter(value, onChange)(key)` spreads the value into its parent object and calls the parent's
   `onChange`. The setters chain up to `DesignForm`'s `onChange`, which is `edit` in `App`.
3. `edit` runs `shedSchema.safeParse(next)` on the whole design.
4. On failure, `edit` returns `result.error.issues[0].message`. The history does not change.
5. On success, `edit` passes `result.data` to `change`.
6. `change` records the design as an undo step, unless its JSON equals the present design.
7. React renders again. Each `useMemo` with a changed input runs again. The effects autosave the
   design and rebuild the share link.

Every `onChange` has the type `Edit<T>`: it returns the error message, or `null`. `ParsedInput`
shows the message. `SelectField`, `SelectInput`, `CheckField`, the fold switches, and the list
buttons drop it.

### `edit` and `replace`

| | `edit(next)` | `replace(next)` |
|---|---|---|
| Callers | `DesignForm` `onChange` | Open, drag and drop, New from preset. `openLink` does the same three steps. |
| Validation | `shedSchema.safeParse`. Returns the first message, or `null`. | None. The caller passes a parsed config. |
| History | `change`: one undo step. | `change`: one undo step. |
| Form | Stays mounted. | `revision + 1` remounts `DesignForm`. |
| Load error | Unchanged. | Cleared. |

### Selection

1. `selected` holds a cut-list mark, or `null`.
2. `toggle(mark)` selects the mark. When the mark is already selected, it clears the selection.
3. The 3D view calls `toggle(id && (markOf.get(id) ?? null))`. A click on empty space passes
   `null` and clears the selection.
4. The Framing tab calls `toggle(markOf.get(id) ?? null)` with the member id of the shape.
5. The cut list calls `toggle(line.mark)`.
6. `selectedIds` holds every member id of the line. The 3D view and the drawings color each one.
7. `pickInfo` is a `PieceInfo` of the line and its first member, `selectedLine.ids[0]`. The 3D,
   Framing, and Cut list tabs show it.

| Edge case | Result |
|---|---|
| An edit renumbers the cut list. | `selected` keeps the mark text. It now names the line with that mark, which can be another part. |
| An edit removes the mark. | `selectedLine` is `undefined`: no highlight and no `PieceInfo`. `selected` keeps the text. |
| The selected member is on a hidden layer. | The 3D view does not draw it. `PieceInfo` still shows. |
| The BOM or Warnings tab is open. | `PieceInfo` does not show there. The selection stays. |

### Decisions

| Decision | Reason |
|---|---|
| Every output is a `useMemo` of the config. | The config is the only input. The outputs never drift from the form, and nothing else needs to be saved. |
| An edit validates with `shedSchema.safeParse` on the whole design. | The schema is the one source of ranges, defaults, and cross-field rules. A rejected value never reaches the history or the outputs. |
| `edit` stores `result.data`, not `next`. | The parse applies the schema's transforms, for example the trim of `name`. |
| A load remounts the form. An edit does not. | A field with a draft, an open card, or an `added` index belongs to the old design. A remount drops them all. |
| Selection is by cut-list mark, not by member id. | A mark covers every identical piece. One value drives the 3D view, the drawings, the cut list, and `PieceInfo`. |

### Change it safely

- Add a new output as a `useMemo` with every input in its dependency list. Do not keep a copy of an
  output in state.
- Send each form change through `edit`, so it validates. Send each load through `replace`, so the
  form remounts.
- In `App.tsx`, `history` is `window.history`. The undo history is `designHistory`. Do not import a
  binding named `history` into this file.

## Undo and redo

`history.ts` keeps a value with the values before and after it. `App` keeps the config in it.

```ts
interface UndoHistory<T> { past: readonly T[]; present: T; future: readonly T[] }
```

| Function | Result |
|---|---|
| `startHistory(present)` | `{ past: [], present, future: [] }`. |
| `record(history, next)` | `past` gets `present` and keeps the last 100 (`LIMIT`). `next` becomes `present`. `future` empties. |
| `undo(history)` | The last of `past` becomes `present`. The old `present` goes to the start of `future`. With no `past`, it returns the same object. |
| `redo(history)` | The first of `future` becomes `present`. The old `present` goes to the end of `past`. With no `future`, it returns the same object. |

The functions are pure. `App` passes them to `setDesignHistory` as updaters.

### What is a step

| Action | Undo step |
|---|---|
| A field commit, a select, a checkbox, a switch, a list button | Yes, through `edit`. |
| A commit that leaves the design as it was | No. `change` compares `JSON.stringify(next)` with the present design. |
| A file open, a drag and drop, a preset, a link | Yes, through `change`. A load can be undone. |
| A rejected edit | No. |
| A layer toggle, a tab, a selection | No. They are not part of the design. |

### Keys

| Keys | Action |
|---|---|
| Ctrl+Z, Cmd+Z | `undo` |
| Ctrl+Shift+Z, Cmd+Shift+Z | `redo` |
| Ctrl+Y, Cmd+Y | `redo` |

1. A `keydown` listener on `window` reads each key.
2. It skips the key when neither Ctrl nor Cmd (`metaKey`) is down, or when Alt is down.
3. It skips the key when the target is a `textarea`, or an `input` whose `type` is in `TEXT_INPUTS`
   (`text`, `number`, `search`, `email`, `url`, `tel`, `password`).
4. It reads `event.key` in lower case: `z` with Shift is redo, `z` is undo, `y` is redo.
5. It calls `preventDefault` and `setDesignHistory(step)`.

The Undo and Redo buttons in the header call the same functions. Each button is disabled when its
list is empty. The titles say "Undo (Ctrl+Z)" and "Redo (Ctrl+Shift+Z)".

### Edge cases

| Case | Result |
|---|---|
| The focus is in a text box. | The keys go to the browser's own undo, for the text in the box. The design does not change until the box commits. |
| The focus is on a select, checkbox, color input, or button. | The keys undo and redo the design. |
| A text box holds a draft, and the user clicks Undo. | The box blurs first and commits the draft as a step. The click then undoes that step. Redo brings it back. |
| A text box shows a rejected draft, and the design is undone. | The box keeps its draft and error. Other fields show the undone values. |
| An undo restores a color. | `ColorField` has `key={value}`, so the input remounts with the restored color. |
| More than 100 steps. | The oldest step goes. |
| A reload. | A new history starts from the autosaved design. |

### Decisions

| Decision | Reason |
|---|---|
| The history is in memory only. A reload starts a new history. | The history is an aid for one session. Autosave keeps the present design, and a file or link keeps a copy. |
| 100 steps. | Each step is a full design. The limit bounds the memory. |
| A load is a step. | A file, preset, or link replaces the whole design. Undo brings the old design back. |
| A change that leaves the design as it was is not a step. | A commit of the same value, for example `96` typed into a length box that holds 8 ft, would add a step that does nothing. |
| Text boxes keep the browser's undo. | While the user types, Ctrl+Z must act on the text, as in any other box. |
| An undo does not remount the form. | A field with no draft shows `format(value)`, so it follows the undo at once. A remount would close every fold the user opened. |

### Change it safely

- Keep `history.ts` generic and pure. `tests/history.test.ts` covers the steps, both ends, the loss
  of redo steps on a new edit, and the 100-step limit.
- A new input type that holds typed text must go in `TEXT_INPUTS`, or Ctrl+Z undoes the design
  while the user types.

## Storage

### Forms of the design

| Form | Content | Code | Trigger |
|---|---|---|---|
| Autosave | The full design: `serializeConfig(config)`. | `App` effect on `[config]` | Every change, an undo, and the first render. |
| Saved file | The compact design: `designFileText(config)`. | `download` | Save. |
| Share link | `#design=` and the compact design, deflate-raw, base64url. | `designToLink` | Every change, in an effect. |
| Preset | A JSON file in `presets/`, parsed at module load. | `PRESETS` | New from preset. |

The compact form and the link format are in [design-model.md](design-model.md).

### Autosave and restore

1. `saved()` reads `localStorage` key `shed-builder.config` (`STORAGE_KEY`). It returns `null`
   when the key is absent or storage is blocked.
2. `restore()` parses the text with `parseConfigText`. It returns the design, or `PRESETS[0]`
   ("8x10 gable on skids") when there is no text or the text does not parse.
3. An effect on `[config]` writes `serializeConfig(config)` to the key. A blocked storage throws,
   and the effect ignores it: autosave is off.

| Edge case | Result |
|---|---|
| Storage is blocked, as in some private windows. | The app starts from `PRESETS[0]`. Autosave fails each time, with no message. |
| The stored text does not parse. | The app starts from `PRESETS[0]` with no message. The first autosave writes over the stored text. |
| Two tabs are open. | Each tab writes its own design to the same key. The last write wins. `App` does not listen for the `storage` event. |

### Save

1. Save calls `download(fileName(config.name, 'shed.json'), designFileText(config))`.
2. `download` makes a `Blob` URL, clicks a temporary `<a download>`, and revokes the URL in a
   `setTimeout`.
3. `fileName` puts the name in lower case, changes each run of other characters to `-`, and trims
   `-` at both ends. An empty result is `shed`. "8x10 gable on skids" saves as
   `8x10-gable-on-skids.shed.json`.

The same `fileName` and `download` make `*.cutlist.csv` and `*.bom.csv` (type `text/csv`), and
`fileName` names `*.plans.pdf`.

### Open and drag and drop

1. Open… clicks the hidden `<input type="file" accept=".json,application/json">`.
2. The input's `onChange` takes the first file and resets `value` to `''`, so the same file can be
   opened again.
3. A drop on `.app` takes `event.dataTransfer.files[0]`. `onDragOver` calls `preventDefault` on the
   whole app, so a drop anywhere works. A drop does not check the file type.
4. `open(file)` runs `parseConfigText(await file.text())`.
5. On success, `replace(result.config)`. On failure, `setLoadError({ file: file.name, errors })`.

### Load errors

The banner sits at the top of the sidebar, with `role="alert"`. It shows "Cannot load" and the file
name, a list of the errors, and Dismiss. The errors come from `parseConfig`:
`path: message` for each schema issue, `Not valid JSON`, or for a link "The link is damaged or
incomplete. Ask for the link again." A successful load clears the banner.

### Presets

1. `PRESETS` (`src/core/presets.ts`) imports three JSON files from `presets/` and parses each with
   `shedSchema.parse`. An invalid preset throws at module load, and the app does not start.
2. The header select always has the value `""`, with the disabled option "New from preset…". The
   same preset can be picked again.
3. A pick asks `Replace the current design with "<name>"?`. On OK, `replace(preset)`.

### Copy link

1. An effect on `[config]` calls `designToLink(config)`. It is async, because
   `CompressionStream` is async.
2. A `current` flag drops the result of an older config. The link is
   `origin + pathname + '#design=' + data`.
3. Copy link is disabled while `shareLink` is `null`, before the first result.
4. A click calls `navigator.clipboard.writeText(link)`. On success, the label is "Link copied" for
   2000 ms.
5. When the promise rejects, `window.prompt('Copy this link:', link)` shows the link to copy by
   hand.

`FramingView` also gets `shareLink`. The PDF prints it as a QR code on its last sheet.

On a page that is not a secure context, `navigator.clipboard` is `undefined`. The call then throws
before a promise exists, and no prompt shows. The hosted site (HTTPS) and `localhost` are secure
contexts. A dev server opened by a LAN address over HTTP is not.

### Open a link

`openLink` runs at mount and on each `hashchange`, so a link pasted into an open page also works.

1. `linkData(window.location.hash)` returns the text after `#design=`, or `null`. On `null`, stop.
2. `history.replaceState` removes the fragment from the address.
3. `designFromLink(data)` inflates and parses the design.
4. On failure, the banner shows "Cannot load the shared link". Stop.
5. When `hadDesign` is true, `confirm` asks: `Open the shared design "<name>"? It replaces the
   design in this browser. Save yours first to keep it.` On Cancel, stop.
6. `change(result.config)`, `revision + 1`, and the banner clears.

| Edge case | Result |
|---|---|
| The browser had no stored design. | The link opens without a question. |
| The user cancels. | The fragment is already gone. To open the design, the user opens the link again. |
| A link arrives after edits in a session that began with no stored design. | `hadDesign` is fixed at mount, so the link opens without a question. Undo brings the edits back. |
| `StrictMode` runs the effect twice in development. | The first run removes the fragment before its `await`. The second run finds no fragment. |
| A link made on `npm run dev`. | It holds the dev server's origin, so it opens only on that machine. |

### Decisions

| Decision | Reason |
|---|---|
| A static site with no server. | The host is free, and each design stays with its user: in the browser, a file, or a link. The fragment after `#` never leaves the browser. |
| Autosave keeps the full design. | A setting the user switches away from and back keeps its value. |
| Save and links keep the compact design. | Small files, and links short enough for a QR code. |
| The fragment goes before the design opens. | A reload then keeps the design from storage and does not ask again. |
| A link asks only when the browser had a design. | A first visit from a link has nothing to lose. |
| The clipboard fallback is `window.prompt`. | When the clipboard refuses the write, the user can still copy the link by hand. |

### Change it safely

- Keep `STORAGE_KEY` as `shed-builder.config`. A new key loses every user's autosaved design.
- A change to the file format needs an upgrade step in `parseConfig`. See
  [design-model.md](design-model.md).
- Test a link from the hosted site or from `npm run preview`, not only from the dev server.

## The form

`DesignForm` gets `value` (the config) and `onChange` (`edit`). Each section component gets
`SectionProps<T>`: `value` and `onChange` for its part of the config.

### Sections

In order, top to bottom:

| Section | Component | Shown when | Brief (closed) |
|---|---|---|---|
| Shed | inline in `DesignForm` | Always. Open at mount. | — |
| Foundation | `FoundationSection` | Always. | `{count} {size} skids`, `Piers, {girderCount} {girder} girders`, or `{thickness} slab` |
| Floor | `FloorSection` | Foundation is not a slab. | `{joist} at {oc}" o.c.` |
| Walls | `WallsSection` | Always. | `{stud} at {oc}" o.c.` |
| Openings | `OpeningsSection` | Always. | Count of positions in enabled rows |
| Roof | `RoofSection` | Always. | `{Style}, {pitch}/12, {rafter} at {oc}" o.c.`. Gambrel: `Gambrel, {lowerPitch}/12 and {pitch}/12, {rafter} at {oc}" o.c.` |
| Loft | `LoftSection` | Gable or gambrel roof. Has a switch. | `{joist} at {oc}" o.c.`, and `, knee walls` on a gable roof with knee walls on |
| Lean-tos | `AdditionsEditor` | Always. | Count of lean-tos |
| Ramps | `RampsEditor` | Always. | Count of ramps |
| Finishes | `FinishesSection` | Always. | `{siding}, shingles` or `{siding}, metal roof` |
| Loads and species | `LoadsSection` | Always. | `{roof} psf roof, {SPECIES}` |
| Lumber catalog | `CatalogSection` | Always. | `Stock to {maxLength}` |

A count brief is `None` at 0, else for example `1 lean-to` or `3 lean-tos` (`count`).

### Section contents

"Ridged" below means a gable or gambrel roof: `ridged(roof)` in `config.ts`. A gambrel takes no knee
walls, because its steep lower slope gives the headroom.

| Section | Fields and groups, with their conditions |
|---|---|
| Shed | Name. Front of the shed (Eave wall, Gable end). Width and Length: the labels follow the front. Wall height: 8, 9, or 10 ft precut (92-5/8, 104-5/8, 116-5/8 in) or Custom. Floor to top of plates (Custom only). A hint with the wall top and the stud length. |
| Foundation | Type. Skid: size, count. Pier: diameter, depth below grade, height above grade, post, post length (post not `none`), girder, plies, count, max pier spacing. Slab: thickness, thickened edge (with edge width and depth), anchor bolt spacing, bolt to plate end. Groups Lean-to piers and Lean-to slab, below. |
| Floor | Joist, o.c., Pressure treated, Mid-span blocking, Subfloor. |
| Walls | Stud, o.c., Mud sill (slab only), Cap plate, Corner, Corner posts on (gable or gambrel roof), Sheathing. |
| Openings | `OpeningRowsEditor`. Group Opening types (`OpeningTypesEditor`), open when there is no type. Group Header and jack defaults: Default header, 2 jacks when RO over, Rough sill plies. |
| Roof | Style (Gable, Gambrel, Lean-to), High side (lean-to roof), Pitch, Rafter, o.c., Ridge board (`hasRidgeBoard`), Build the gable ends as panels. Group Overhangs. Group Rake ladder, when the rake overhang is 1-1/2 in or more, with Ridge runs out to the fly rafters (`hasRidgeBoard`). Group Roofing, with purlins when the roofing is metal. Group Rafter ties (ridged, no loft; switch). Group Collar ties (ridged; switch). With a loft, a hint replaces Rafter ties: "The loft joists tie the rafters." See the gambrel fields below. |
| Loft | Joist, o.c., Joist support, Deck, Open end, Open length (open end not `none`). Group Knee walls (gable roof only; switch). Group Hatches (`HatchesEditor`). |
| Finishes | A hint: 3D only. Siding, Siding color (siding not `none`), Trim, Roof, and Door colors. Longest metal panel and Metal past the eaves, when the main roof or a lean-to has metal. |
| Loads and species | Lumber (species), Roof load, Roof dead load, Loft use (loft on). Hints on snow load and the span method. |
| Lumber catalog | Saw kerf, Longest stock, Longest one-piece stock. A `LengthListField` of stock lengths for each size: clear it to restore the default list. `PriceGroup`s: Lumber (with Treated markup %), Sheet, Concrete, Hardware, Roofing. |

Side words in labels come from `naming(value)`, so a gable front renames them.

On a gambrel, the Roof section shows these fields in place of Pitch:

| Field | Config |
|---|---|
| Lower pitch (in / 12) | `gambrel.lowerPitch` (`NumberField`) |
| Upper pitch (in / 12) | `pitch`: the Pitch field, relabeled |
| Break, in from the wall | `gambrel.breakRun` (`AutoLengthField`: `auto` or a length) |
| Ridge board, after the hint | `gambrel.ridgeBoard` (`CheckField`). Off hides the Ridge board size and the rake ladder's Ridge runs out to the fly rafters. |

A hint follows the break: `The break is R in from the wall, H above the floor at the rafter tops.
Plywood gussets join the rafters there.` Without a ridge board it ends `there and at the peak.` `R` and `H` come from `gambrelBreak(value)` in `roof.ts`. `R` is
the run after the 1 ft limit at the ridge line (`formatInches`). `H` is the rafter-top height at the
break (`formatLength`). A pitch edit that breaks the lower-pitch rule shows `The lower pitch must be
steeper than the upper pitch` under the field. A Style choice of Gambrel that breaks the rule snaps
back with no message, because a select does not show `edit`'s message.

A switch of Wall height to Custom sets `wallHeight` to `wallTops(value).left` in the same edit, so
the walls do not move.

### Lean-to piers and Lean-to slab

Lean-to posts stand on piers or on a slab sized by `foundation.pier` and `foundation.slab`, also on
a shed with another foundation. `FoundationSection` gets two flags from `DesignForm`:

| Group | Shown when | Fields |
|---|---|---|
| Lean-to piers | `foundation.type` is not `pier`, and a lean-to floor is not `slab` (`none` or `deck`). | Pier diameter, Depth below grade, Height above grade. |
| Lean-to slab | `foundation.type` is not `slab`, and a lean-to floor is `slab`. | Thickness. |

`pruneConfig` keeps the same fields under the same conditions. Keep the two in step.

### Folds: `Section`, `Group`, `Card`

All three are `Fold` with a `kind`: `fold section`, `fold group`, or `fold card`.

| Prop | Effect |
|---|---|
| `title` | The header text. Also the `aria-label` of the switch. |
| `brief` | A one-line summary beside the title. CSS hides it while the fold is open. |
| `open` | Opens the `<details>`. React writes the attribute only when the prop changes. A user toggle changes only the DOM. |
| `enabled`, `onEnable` | A feature switch in the header. |
| `actions` | Buttons at the right end of the header, for example the remove `×`. |
| `children` | The fields. |

A fold with a switch:

1. Off: it renders `<label class="fold … off">` with the title and the checkbox. The children do
   not render.
2. On: it renders a `<details>` with the checkbox in its `<summary>`.
3. A click on the switch calls `onEnable(checked)` and sets the local `opened` state to `checked`.
4. `opened` opens the new `<details>`, so the fields the switch adds are in view.

The switches: Loft (a `Section`), and the Knee walls, Rafter ties, and Collar ties groups. The
config keeps the values of a switched-off part.

CSS: the header is a flex row with a `▸` or `▾` marker. The brief has `flex-shrink: 1000`, so a
long header cuts the brief before the title. A section has a bottom border. A group has a left
border and smaller header text. A card has a border box.

### Field components

| Component | Value | Parse | Display | Message on bad text |
|---|---|---|---|---|
| `TextField` | `string` | The text as typed. | The text. | None. The schema trims `name` and requires it. |
| `NumberField` | `number` | `Number(text)`. Empty or `NaN` is bad. | `String`. | `Not a number` |
| `LengthField` | `number`, in | `parseLength` | `formatLength` | `NOT_A_LENGTH`: `Not a length, e.g. 7' 8-5/8"` |
| `PriceField` | `number`, US dollars | Removes `$` and `,`, then as `NumberField`. | `formatMoney` | `Not a price, e.g. $3.50` |
| `AutoLengthField` | `number` or `'auto'` | `auto` in any case, or `parseLength`. | `auto` or `formatLength` | `NOT_A_LENGTH`, then `, or auto` |
| `LengthListField` | `readonly number[]` | Split on `,`, then `parseLength` each. Empty text is `[]`. | `formatLength`, joined by `, ` | `Not a comma-separated list of lengths` |
| `SelectField`, `SelectInput` | `string` or `number` | The option whose `String` equals the select value. | `describe(option)` | None. |
| `ColorField` | `string`, hex | The native `change` event. | `defaultValue` | None. |
| `CheckField` | `boolean` | `checked` | A checkbox. | None. |

`ParsedField` wraps `ParsedInput` in `<label class="field">`, a grid of the label and a 150 px
input. `wide` puts the input under the label. `SelectInput` and `ParsedInput` have no visible
label. They take `aria-label` and `title` from `label`, for the opening rows.

### `ParsedInput`: draft and commit

1. `draft` is `null`. The input shows `format(value)`.
2. Each keystroke sets `draft` to the text. The design does not change.
3. Blur or Enter calls `commit`. With a `null` draft, `commit` does nothing.
4. `parse(draft)` returns `null` for bad text. The error is the `invalid` message.
5. Else `onChange(parsed)` returns `edit`'s message, or `null`.
6. With an error, the draft stays in the box, the input gets `aria-invalid`, and
   `<small class="error">` shows the message.
7. With no error, `draft` goes back to `null`. The box shows the new value in its format, for
   example `92 5/8` becomes `7' 8-5/8"`.

### `ColorField`

1. It renders an uncontrolled `<input type="color" key={value} defaultValue={value}>`.
2. An effect adds a native `change` listener that calls `onChange(element.value)`. The browser fires
   `change` when the picker closes.
3. React's `onChange` on this input fires on each `input` event, at each step of a drag. The
   component does not use it.
4. `key={value}` remounts the input when the value changes from outside, for example on an undo.

### List editors

Each list editor holds `added`, the index of the item the user added last. That card renders with
`open`. Cards have `key={index}`, so after a removal the open or closed state of each fold stays
with its position, not with its item.

#### Opening types: `OpeningTypesEditor`, `TypeCard`

| Kind | Add button | Default | Size presets | RO rule (from product listings) |
|---|---|---|---|---|
| `door` | `+ Door` | `door 36`: RO 38 × 82-1/4 | Prehung 24, 28, 30, 32, 34, 36 × 80. 30, 32, 36 × 96. Double 48, 60, 72 × 80. | Door + 2 in wide, + 2-1/4 in high. |
| `window` | `+ Window` | `window 24x36`: RO 24 × 36 | Widths 24, 30, 36, 48, 60, 72 × heights 24, 36, 48, 60. | RO = nominal size. |
| `overhead` | `+ Garage door` | `door garage 9x7`: RO 108 × 84 | 8×7, 9×7, 9×8, 10×7, 10×8, 12×7, 12×8, 16×7, 16×8 ft. | RO = door size. |
| `custom` | `+ Custom` | `opening 48x48` | None. | — |

1. A new type takes the kind's default size, `girder: 'double'`, no flat plates, `jacks: 'auto'`,
   and `headroom: 12`. `uniqueName` adds ` 2`, ` 3`, and so on to a taken name.
2. While the name equals `autoName(kind, width, height)`, a size change also renames the type. A
   name the user typed stays.
3. A Kind change resizes the type to the new kind's default size.
4. The Size select lists `Custom RO` and the presets. A pick of `Custom RO` changes nothing.
5. Girder size shows unless the girder is Flat. `Wall default` removes the `header` key.
6. Headroom needed shows for a garage door only.
7. A rename also renames the `type` of every opening row that uses the type, in one edit.
8. Remove (`×`) is disabled while a row uses the type. Its title gives the row count.

The card brief is `RO {width} × {height}`, and `, unused` when no row uses the type.

#### Opening rows: `OpeningRowsEditor`, `OpeningRow`

A row places one type on one wall at one or more positions. With no type, the editor shows "Add an
opening type first."

1. `+ Place an opening` adds a row: the first type, `wall: 'front'`, `sill: defaultSill(type)`,
   `along: 'percent'`, `at: [50]`, `enabled: true`.
2. `defaultSill` puts a window or custom head level with a prehung door head: `max(0, 82.25 −
   height)`. A door or garage door sits on the floor: `0`.
3. The row shows the Frame this opening checkbox, Opening type, and Wall. Then it shows Sill
   height, Position from, the positions, the Count stepper, and `×`. Wall lists the sides in the
   user's order.
4. A disabled row shows its type and wall in disabled selects, at 50 % opacity. It hides the other
   inputs. The row stays in the config.

| Control | Behavior |
|---|---|
| Positions, percent | Split on spaces, `,`, and `;`. A `%` at the end of a number is optional. Shows `25% 75%`. |
| Positions, from a corner | Split on `,` and `;` only, since a length can hold a space (`10' 6"`). Shows `formatInches` joined by `, `. |
| Position from | `changeAlong` converts each position to an RO left-edge offset (`roOffset`) and back (`positionFor`) in the new reference. Percents round to 0.1, lengths to 1/16 in. The openings do not move. |
| Count stepper | `spread(count)`: `evenPercents(count)` (2 gives 25 % and 75 %), in the row's reference. It replaces typed positions. `−` is disabled at 1. |
| Any other row edit | `withOpeningRow(value, index, next)`, which keeps each ramp that follows the row on its opening. |
| `×` | `withoutOpeningRow(value, index)`. See [Ramps](#ramps-rampseditor-rampcard). |

The positions input has `key={value.along}`, so a change of reference drops its draft.

#### Lean-tos: `AdditionsEditor`, `AdditionCard`

1. `+ Lean-to` adds `newAddition(free)`. `free` is the first side, in the user's order, that no
   lean-to takes. A mirrored lean-to takes two sides. With no free side, the button is gone.
2. The card title is `{Side} lean-to`, or `{Side} and {opposite} lean-tos` when mirrored. The brief
   is `{depth} deep` and `main pitch` or `{pitch}/12`.
3. The fields, in order:
   - Side, Mirror to the opposite side, Attachment, Depth.
   - Full wall length, Length, Center, Main roof pitch, Pitch, Ledger drop.
   - Rafters, Rafter spacing, Eave overhang, Fascia, Roofing, Purlins, Purlin spacing.
   - Posts, Max post spacing, Beam, Beam plies, Floor, and the deck fields.

   The steps below give the conditions.
4. Attachment `Extends the main roof` sets `length: 'full'` in the same edit. It hides Full wall
   length and Ledger drop, and shows a hint.
5. Full wall length off sets `length: 96`. Length and Center (% from left corner) then show.
6. Main roof pitch (Main roof plane for an extension) off sets `pitch: 3`. Pitch then shows.
7. Roofing Metal on purlins shows Purlins and Purlin spacing.
8. Floor Deck shows Deck joists, Deck joist spacing, Deck boards (5/4 decking or 2x6), Deck below
   the shed floor, and a hint. On a skid or pier shed it shows
   Deck support: piers under a beam, or the shed's skids or girders, continued. On the shed's
   foundation a gable-end lean-to shows At the gable end (run the shed's on out, or own pieces in
   line), and the hint gives the joist notch, or the deck surface against the shed floor.

`shedSchema.superRefine` rejects two lean-tos on one side. It also rejects an extension on an eave
the roof does not slope down to, and an extension that is not full length. A Side or Attachment
choice that breaks a rule snaps back with no message.

#### Ramps: `RampsEditor`, `RampCard`

A ramp stands on its own (`opening: null`: `wall`, `along`, `at`, `width`) or follows an opening
(`opening: { row, index }`: an index into `openings`, then into that row's `at`). `rampPlace`
(`src/core/gen/ramps.ts`) returns its wall, left and right edges, the label of the opening it
follows, and `lost` when that opening is gone.

1. `+ Ramp` adds `newRamp()`. It follows position 0 of the first row with `sill === 0` and a
   position, if there is one. The search does not check `enabled`.
2. The card title is `Ramp {n}`. The brief is the opening label or `{Side} wall`, the width, the
   slope as `1 in {slope}`, and `, concrete`.
3. With an opening: Wider than the RO, each side (`margin`). Without: Wall, Position from, Center
   (% of the wall) or Corner to the near edge, and Width.
4. Always: Slope: run per 1 of rise, Foot below grade, Material. Concrete: Thickness under the
   foot. Wood: Stringers, Stringer spacing.

The Follows select:

| Option | Key | Shown when |
|---|---|---|
| No opening: placed below | `free` | Always. |
| An opening that is gone | `gone` | `place.lost`. It is then the current value. |
| `{type} ({side} {position})`, and `, not framed` for a disabled row | `{row}:{index}` | One for each position of each row (`openingChoices`). |

`follow(key)`:

1. `free`: `opening: null`, and `wall`, `along: 'left'`, `at: place.left`, and
   `width: place.right − place.left`. The ramp stays where it stands, margins included.
2. `{row}:{index}`: `opening: { row, index }`. The free fields keep their stored values.

`withoutOpeningRow(config, index)`, for the row `×`:

1. A ramp that follows an earlier row does not change.
2. A ramp that follows a later row gets `row − 1`, so it follows the same opening.
3. A ramp that follows the deleted row gets the free fields from `rampPlace`, as in step 1 of
   `follow`. It stays where it stands.
4. The row leaves `openings`.

| Edge case | Result |
|---|---|
| A row edit changes its count of positions (Count stepper, typed list). | `withOpeningRow` rebases each ramp that follows the row: to its position's value if the row still has it, else to the same place in the row. A ramp whose place is gone stands where it was, on its own. A row edit that keeps the count (a move) keeps each index. |
| A ramp is `lost`, from a hand-edited file. | It stands at its stored free fields. The model warns: "The opening it follows is gone." |
| A ramp edge is left of the wall's left corner: the RO is within `margin` of the corner. | `free` and the row `×` give a negative `at`. `ramp.at` allows it: a ramp may run past a corner. Only a percent `at` must be 0% to 100%. |
| The row's type or wall changes. | The ramp follows. It moves and resizes with the RO. |

#### Hatches: `HatchesEditor`

`+ Hatch` adds `{ x: 24, y: 24, width: 24, depth: 30 }`. A card is `Hatch {n}`, with the brief
`{width} × {depth}`. The fields are From the left end, From the front wall, Along the ridge, and
Across the ridge, in the user's side words.

### Decisions

| Decision | Reason |
|---|---|
| A text field commits on blur or Enter. | Half-typed text, such as `7' 8-5/`, need not parse. Each commit rebuilds every output and is one undo step. |
| A rejected value stays in the box with its message. | The user corrects the text and does not type it again. |
| A color commits when the picker closes. | One rebuild and one undo step for each color, not one for each step of a drag. |
| Folds close to a one-line brief. | The whole design reads at a glance. |
| A feature switch shows only the header while off. | Fields of a part that is not built do not clutter the form. Their values stay in the config. |
| A switch turned on opens its fold. | The user sees the fields the switch adds. |
| A new card opens. | The user sets up the item at once. |
| Rows refer to types by name. A rename renames the rows. | A type is reused on many rows. The schema rejects a row whose type does not exist. |
| A ramp that leaves its opening keeps its place. | A change of the Follows choice or a row delete must not move a built ramp. |

### Change it safely

- Add a field with the recipe in [DEVELOPER.md](DEVELOPER.md). Put it in the section that owns its
  part of the config.
- When a field shows only under a condition, give `pruneConfig` the same condition.
- A select or checkbox does not show `edit`'s message. When a choice can break a cross-field rule,
  show the rule in a hint, or show the message.
- To edit several fields as one change, build the next value and call `onChange` once, as the
  Custom wall height and the Attachment select do. Two calls make two undo steps, and the second
  call, built from the old `value`, drops the first change.
- A list editor that removes or edits items must keep each reference by index valid.
  `withoutOpeningRow` and `withOpeningRow` are the model for ramps.

## The 3D view

`View3D` is the React side. `FramingScene` is a plain Three.js class. It draws only what `App`
passes it, and it renders on demand only: there is no animation loop.

### `View3D`

| Effect | Runs on | Calls |
|---|---|---|
| Mount | Once | `new FramingScene(host, (id) => pick.current(id))`. Cleanup: `dispose()`. |
| Model | `members`, `solids`, `finishes`, `trimColor`, `missing` | `setModel(...)` |
| Selection | `selected` | `setSelection(selected)` |
| Front | `front` | `setFront(front)` |
| Pick | `onPick` | Stores it in the `pick` ref, so the scene always calls the newest callback. |

`View3D` renders `.canvas-host` for the canvas, then `.view-toolbar` with the `toolbar` prop and the
Fit view button, then its children (`PieceInfo` in `.pick-info`).

### Scene setup

| Part | Value |
|---|---|
| Renderer | `WebGLRenderer({ antialias: true, alpha: true })`, pixel ratio `devicePixelRatio`. The page background shows through. |
| Camera | `PerspectiveCamera(35, 1, 1, 20000)`, `up = (0, 0, 1)`: building z is up. |
| Controls | `OrbitControls`. Each `change` event renders. |
| Lights | `HemisphereLight(0xffffff, 0x8a7a66, 2)`, and `DirectionalLight(0xffffff, 2)` at (−2, −3, 4). |
| Grid | `GridHelper(1200, 100, 0x8a8a84, 0x8a8a84)`: 100 ft with 1 ft squares. It turns π/2 about x into the xy plane, at 25 % opacity. |
| Groups | `members` (pickable), `solids`, `finishes`, `missing`. |
| Resize | A `ResizeObserver` on the host. |

### Geometry

| Item | Geometry | Placement |
|---|---|---|
| Member, no profile | `BoxGeometry(length, width, thick)` from `LUMBER[size]`. | Basis (`axes.length`, `axes.width`, length × width). Position: `origin` + length/2 along + width/2 across + thick/2 along `axes.thick`. |
| Member with `profile` | `ExtrudeGeometry` of `Shape(points)` in (along, across), `depth`, no bevel. | Basis (`axes.length`, `axes.width`, `axes.thick`), right-handed. Position: `origin`. |
| Solid or finish `panel` | `ExtrudeGeometry` of `outline` with `holes` as `Path`s, depth `thick`. | Basis (`u`, `v`, u × v). Position: `origin`. |
| Solid or finish `box` | `BoxGeometry` of `max − min`. | Center of `min` and `max`. |
| Solid `cylinder` | `CylinderGeometry(radius, radius, height, 24)`, turned π/2 about x to stand on z. | `base` + height/2 in z. |
| Finish `corrugated` | A strip mesh: z = `DEPTH`/2 × (1 − cos(2πx / `WAVE`)), 8 segments a wave, at least 2. | Basis (`u`, `v`, u × v). Position: `origin`. |

Each mesh gets one child `LineSegments` of its `EdgesGeometry` in the `edges` material, except
cylinders and glass panels. A corrugated panel gets its outline at crest height (`panelOutline`)
instead. `WAVE` is 24/9 in and `DEPTH` is 0.5 in (`src/core/gen/finishes.ts`).

### Materials

| Material | Color | Other | Used for |
|---|---|---|---|
| `stud` | `0xdcc096` | roughness 0.85 | Members not below. |
| `plate` | `0xc49b6a` | roughness 0.85 | `HORIZONTAL` roles: plates, headers, sills, gable plates, ridge, fascia, lookouts. |
| `treated` | `0x9fae84` | roughness 0.85 | `member.treated`. |
| `selected` | `0xe0914a` | emissive `0x6a3000`, roughness 0.6 | Members in `selectedIds`. |
| `concrete` | `0x9b9a95` | roughness 0.95 | Solids with `material: 'concrete'`. |
| `sheet` | `0xd8b27a` | roughness 0.9, opacity 0.6 | Sheet solids. |
| `steel` | `0x5a5f66` | roughness 0.4, metalness 0.6 | Steel solids. |
| `edges` | `0x3b2f22` | opacity 0.5 | Edge lines. |
| `missing` | `0xd0302a` | `depthTest: false` | Red loops. |
| trim | `trimColor` | roughness 0.8 | `TRIM_ROLES`: `fascia`, `rafter.fly`. |

`baseMaterial` picks trim first, then treated, then plate or stud. `mesh.userData` keeps `id` and
`base`. `applySelection` swaps each member between `selected` and its `base`.

### Finish materials and canvas textures

`finishMaterial` keeps one material for each look, color, and tile (`finishMaterials`):

| Look | Material |
|---|---|
| `glass` | roughness 0.1, metalness 0.2, opacity 0.35. No edge lines. |
| `metal` | roughness 0.4, metalness 0.55, both sides. |
| Others | roughness 0.8. |

A part gets a texture when `drawLook` has a canvas for its look and the part has a `tile`:

1. `texture(look, true)` and `texture(look, false)` each draw the tile once with `drawLook`, and
   keep the result in `textures`. The color map is sRGB. The relief map is linear.
2. Each texture repeats (`RepeatWrapping`) with the renderer's maximum anisotropy.
3. The material gets a clone of each as `map` and `bumpMap`, with `bumpScale` 1.5.
4. `repeat` is `1 / tile`. `ExtrudeGeometry` gives the face UVs in shape units, inches, so one tile
   covers `tile` inches.

`drawLook` draws in grays. The material color tints them. A fixed pseudo-random sequence (seed 7,
multiplier 16807, modulus 2147483647) gives the same shades on each render.

| Look | Canvas, px | Tile, in (`TILES`) | Content |
|---|---|---|---|
| `lap` | 8 × 48 | 48 × 6 | One course: a gradient from 205 to 240, with a 3 px shadow at its lower edge. |
| `t1-11` | 64 × 8 | 8 × 8 | Base 228, a 1 px stripe each 5 px at 210–240, a 3 px groove. |
| `board-batten` | 96 × 8 | 12 × 12 | Base 215, a 20 px batten at 245, a 2 px shadow. |
| `planks` | 48 × 8 | 6 × 12 | Base 225, a 2 px gap. |
| `shingles` | 288 × 80 | 36 × 10 | Two 5 in courses of 12 in tabs, the upper one offset half a tab, shades 165–225. |
| `garage` | 64 × 64 | RO width/4 × height/4 | One door section, stretched to its tile. |
| `plain`, `glass`, `metal` | none | — | A plain color. |

A canvas draws at `PX` = 8 px per inch across its pattern, except `garage`. In a direction where
the pattern does not change, the canvas is 8 px.

### Trim paint

`App` passes `trimColor` as `config.finishes.trimColor` while the siding layer shows, else `null`.
`setModel` disposes the old trim material and makes a new one. With a trim material, members with
the roles `fascia` and `rafter.fly` take it. The Framing view hides the siding, so those members
keep their lumber color there.

### Red loops

Each left-out part's warning carries `missing.outline`, a closed loop in model coordinates.
`setModel` draws each loop as a `LineLoop` in the `missing` material, with `renderOrder` 1. The
material has `depthTest: false`, so the loop shows through the framing and the finishes. A loop
hides with the layer of `missing.assembly`.

### Pick

1. `pointerdown` stores the pointer position.
2. `pointerup` measures the travel. Over `CLICK_SLOP` (4 px), the gesture was an orbit: no pick.
3. Else the raycaster casts from the camera through the pointer, in normalized device coordinates.
4. It tests only `members.children`, not recursive, so edge lines, solids, finishes, and loops do
   not catch the ray.
5. `onPick` gets the id of the nearest hit, or `null`.

A click on siding picks the member behind it. A member on a hidden layer is not in the scene and
cannot be picked.

### Camera fit

`fit` frames the members and solids from the user's front-left corner, above:

| Front | `VIEW_FROM` (normalized) | Camera |
|---|---|---|
| `eave` | (−0.55, −1, 0.6) | Model left (−x) and front (−y). |
| `gable` | (−1, 0.55, 0.6) | The user's front is the model's −x end. The user's left is +y. |

1. Take the box of `members` and `solids`. When it is empty, or the host has no size, stop.
2. `matchHost()` sets the renderer size and the camera aspect from the host.
3. Take the bounding sphere of the box.
4. The narrow half angle is the smaller of the vertical half angle and
   `atan(tan(half) × aspect)`.
5. Distance = radius / sin(narrow half angle) × 1.05.
6. Put the camera at center + `viewFrom` × distance. Near = distance/100, far = distance × 20.
7. Aim the controls at the center. Put the grid under the center, at the lowest member's z.
8. Set `fitted` and render.

| Caller | When |
|---|---|
| `setModel` | Only before the first fit (`fitted` false). Later models keep the camera. |
| `resize` | Only before the first fit, when the host gets a size. |
| `setFront` | When the front changes. |
| Fit view | On a click. |

A load also keeps the camera. After a file, preset, or link opens, Fit view frames the new design.

Step 2 is the first-fit aspect fix. The first fit can come before the `ResizeObserver` reports the
host. The camera aspect was then 1, and a tall phone screen cut the shed off at both sides.

A host with no size, such as a hidden tab, skips the fit. The `ResizeObserver` fits the model when
the tab shows.

### Layers and the Framing and Finished views

The 14 layers are `LAYERS` in `src/core/member.ts`. `layerOf(member)` puts the rake roles
(`rafter.fly`, `rail.ladder`, `lookout`) on `rake`, and other members on their assembly's layer.

| View button | Hidden layers |
|---|---|
| Framing | `sheathing`, `siding`, `roofing`, `openings` |
| Finished | `sheathing` |

1. The app starts in the Framing view: `hidden` is `VIEWS.Framing`.
2. A view button sets `hidden` to its list. It shows as pressed only while `hidden` equals that
   list exactly.
3. Each layer checkbox adds or removes one layer. After a manual change, no view button is pressed.
4. On a phone, the Layers button opens and closes the checkbox list (`layersOpen`).

A layer change makes new `shown*` arrays, so `setModel` rebuilds every mesh.

### Render and disposal

| Method | Work |
|---|---|
| `setModel` | `clearModel`, then the loops, trim, solids, finishes, and members. `applySelection`. Fit or render. |
| `setSelection` | `applySelection`, render. |
| `clearModel` | Disposes each mesh's geometry and its edge geometry, then clears the four groups. |
| `dispose` | Disconnects the observer and controls, and clears the model. Disposes the grid, materials, trim, finish materials with their maps, textures, and renderer. Removes the canvas. |

The shared materials and the texture and finish-material caches live until `dispose`. Each new
finish color adds materials to the cache.

### Decisions

| Decision | Reason |
|---|---|
| Render on demand only. | An idle 3D tab uses no GPU time. |
| Only members are pickable. | Only lumber has cut-list lines and piece drawings. |
| A 4 px click slop. | An orbit drag must not change the selection. |
| Red loops draw over everything. | A left-out part shows through the framing and finishes. |
| The camera looks from the user's front-left. | The view matches the user's names for the sides, with either front. |
| Later models keep the camera. | An edit must not move the user's view. |
| The fit takes the host's shape first. | The first view on a tall screen was cut off. |
| Textures are canvases drawn in code. | No image files to load, and one gray tile serves every color. |
| Trim paint follows the siding layer. | The bare frame shows lumber colors. The finished look shows the trim color. |

### Change it safely

- Dispose of every geometry, material, and texture you add, in `clearModel` or `dispose`.
- A new `Solid` shape kind needs a branch in `solidMesh`. A new finish shape kind needs one in
  `finishMesh`.
- A new textured look needs a size and a drawing in `drawLook`, and a tile in `TILES`.
- Keep `View3D`'s effect inputs stable. A new array on each render rebuilds the whole scene.
- A new layer goes in `LAYERS`. The checkbox list follows. Add it to a `VIEWS` list if a view hides
  it.

## Other tabs

| Tab | Component | Toolbar | Selection |
|---|---|---|---|
| Framing | `FramingView` | Paper, Download PDF, Print | A click on a member shape toggles its mark. `PieceInfo` sticks to the bottom of the panel. |
| Cut list | `CutListTable` | Download CSV, Print | A click on a line toggles its mark. `PieceInfo` sticks to the bottom. |
| BOM | `BomView` | Download CSV, Print | None. |
| Warnings | `ul.warnings`, `SpanTable` | None | None. |

### Framing

`FramingView` shows each `Drawing` with a Zoom button, the paper choice (Letter 11x8.5, Tabloid
11x17), Download PDF, and Print. Download PDF imports `./pdf` only on a click. See
[drawings.md](drawings.md).

### Cut list

1. The hint is `LENGTH_RULE` and a pointer to the "Measuring cut lengths" sheet.
2. `CutListTable` groups lines by `line.assembly`. Each group starts with a row of
   `names.assembly(assembly).label`.
3. Columns: Mark, Qty (`ids.length`), Stock (`stockLabel`: size and ` PT`), Length
   (`formatInches`), Part (`ROLES[role]`), Notes.
4. The selected line gets `class="selected"`. The footer counts all pieces.
5. Download CSV saves `cutListCsv(cutList, names)`.

### BOM

`BomView` shows, in order:

1. Cost: one row for each section with a cost above 0, and the total. `PRICE_NOTE` below.
2. Lumber: for each size and treatment, the board count, feet, waste, price basis, and cost. Then
   one row for each stock length. Pieces longer than any stock show as Special order, Not priced,
   with their marks.
3. Cutting plan, folded: the pieces cut from each board. Boards with the same pieces show once,
   with a count.
4. The BOM warnings.
5. Sheets: count, price basis, cost, uses with panel counts, and waste.
6. Concrete, Hardware, and Roofing: item, quantity, unit, price basis, cost, notes. An empty table
   does not show.
7. Notes on kerf, sheet offcuts, and net concrete volumes.

Piece text is `{mark} {length}`, from `marks`. The quantities and costs are in
[outputs.md](outputs.md).

### Warnings

1. The list joins `model.warnings`, `bom.warnings`, and `spanWarnings(spans, config)`. With none, it
   says "No warnings."
2. Each item shows its `source` in bold, then its message. The key is `{source}: {message}`.
3. The tab label adds the count, for example `Warnings (3)`.
4. `SpanTable` follows, titled `Span checks: {species label}`. Each check shows Member (with its
   basis), Lumber, Span, Allowed, Used (percent), and Governs.
5. A row with `span > allowed` gets `class="over"`, in the error color. With `allowed` `null`, the
   Allowed and Used cells show `—`, and Governs says "No design values for this size".

BOM warnings show on both the BOM and Warnings tabs. Two warnings with the same source and message
give React a duplicate key.

### Piece drawing panel: `PieceInfo`

1. `pieceDrawing(member, line.mark)` lays the line's first member flat, dimensioned.
2. `fitScale` fits it in 420 × 160 px (`ROOM`). `layoutOf` gives the width of the box.
3. The panel shows the mark, the assembly label, the role, the count, stock, and length, then the
   drawing with no selection, then the line's note.
4. The `×` button calls `onClose`, which clears the selection.

In the 3D tab the panel floats at the bottom-left (`.pick-info`). In the Framing and Cut list tabs
it sticks to the bottom of the scrolled panel (`.pick-info.sticky`).

### Changelog dialog

1. `ChangelogDialog` imports `CHANGELOG.md?raw`, so Vite puts the text in the bundle at build time.
2. `parseChangelog` runs once, at module load.
3. An effect calls `showModal()` unless the dialog is already open. `StrictMode` runs the effect
   twice in development.
4. Esc, Close, or a click on the backdrop (`event.target === event.currentTarget`) closes it. The
   native `close` event calls `onClose`.
5. `##` headings render as `h3`, `###` as `h4`. `inline` renders `**bold**`, `` `code` ``, and
   `[text](url)` links, which open in a new tab.

`parseChangelog` (`src/ui/changelog.ts`) reads only what CHANGELOG.md uses:

| Line | Result |
|---|---|
| `## ` or `### ` | A heading. `[0.5.0]` loses its brackets. |
| Empty, `# ` title, or `[x]: url` link definition | Ends the open block. Not shown. |
| `- ` | A list item. It opens a list when none is open. |
| Other text, after a list item | Continues the last item. |
| Other text, after a paragraph | Continues the paragraph. |
| Other text | Starts a paragraph. |

`tests/changelog.test.ts` checks these rules, and that the first released heading equals
`APP_VERSION`. A release must change `package.json` and CHANGELOG.md together.

## Layout and theme

### Grid

| Area | Wide screen | 760 px and below |
|---|---|---|
| `top` (`.topbar`) | Row 1, both columns, 44 px high. | Row 1, auto height, wraps. |
| `side` (`.sidebar`) | Column 1, 340 px, rows 2 and 3. Scrolls. | Takes `main`. Shown only on the Design tab. |
| `tabs` (`.tabs`) | Row 2, column 2. | Row 2. |
| `main` (`.workspace`) | Row 3, column 2. | Row 3. Hidden on the Design tab. |

`.app` is `100vh` high, then `100dvh` where the browser has it. Each `.panel` takes the rest of
the workspace and scrolls. The 3D panel does not scroll: the canvas host fills it.

The sidebar ends with the disclaimer, pushed to the bottom with `margin-top: auto`.

### Theme tokens

`:root` sets `color-scheme: light dark`, `system-ui, sans-serif`, and 14 px text.

| Token | Light | Dark | Print |
|---|---|---|---|
| `--bg` | `#f6f6f4` | `#1b1b1a` | `#fff` |
| `--surface` | `#ffffff` | `#242422` | `#fff` |
| `--border` | `#d9d9d4` | `#3a3a37` | `#999` |
| `--text` | `#1d1d1b` | `#e8e8e3` | `#000` |
| `--muted` | `#6b6b66` | `#9a9a93` | `#444` |
| `--accent` | `#b5651d` | `#e0914a` | Not set: the scheme's value. |
| `--error` | `#b3261e` | `#f2867d` | Not set: the scheme's value. |

A print from a dark scheme keeps the dark `--accent` and `--error`. The 3D canvas is transparent,
so it shows `--bg`. The 3D materials have fixed colors.

## Phone layout

The phone layout exists because the shared link, and the QR code on the PDF plans, open on phones.
Before it, the 340 px form left the workspace about 50 px wide on a phone.

`PHONE` in `App.tsx` and the media query in `app.css` are both `(max-width: 760px)`. `usePhone`
listens to the media query's `change` event.

| Part | Phone behavior | Code |
|---|---|---|
| Design tab | The form is a tab of its own. The tab button has `class="phone-only"`. | `TABS`, `.tabs .phone-only` |
| Tab on screen | `data-view` shows the sidebar on `design`, else the workspace. | `.app[data-view]` rules |
| Wider screen | `view` falls back from `design` to `3d`. `tab` keeps `design`, so a narrower screen shows the form again. | `view` in `App` |
| Header | Wraps. The actions take a full row. The preset select grows from 140 px. | `.topbar`, `.actions` |
| Tab bar | Its own grid row, in view on every tab. | `grid-template` |
| Layers | The Layers button shows. The checkboxes show only with `.layer-toggles.open`. | `layersOpen` |
| Inputs | 16 px text, so the phone does not zoom in on a tap. | `input, select` |
| Cut list | The Notes column is hidden. A tap on a line shows its note in `PieceInfo`. | `.parts .note` |
| Piece panel | The `×` closes it, since a full-screen tab has no empty space to tap. | `PieceInfo` |
| Toolbars | Panel toolbars wrap and align left. Panels pad 12 px. | `.panel-toolbar`, `.panel` |

`index.html` does not block zoom in its viewport tag. The 16 px text stops the zoom on focus.

| Edge case | Result |
|---|---|
| A link fails to load on a phone. | The banner is in the sidebar, so it shows only on the Design tab. The app opens on the 3D tab. |
| The screen turns across 760 px. | `usePhone` updates. `tab` stays, and `view` follows. |

### Change it safely

- Change `PHONE` and the media query together.
- Preview each change at 760 px and below, and above 760 px.

## Print styles

Print, in the Framing, Cut list, and BOM toolbars, calls `window.print()`. The other tab panels
have `hidden`, so only the tab on screen prints.

| Rule | Effect |
|---|---|
| Tokens | White, black, and gray. `color-scheme: light`. |
| `.topbar`, `.sidebar`, `.tabs`, `.panel-toolbar`, `.pick-info` | Hidden. |
| `.app` | `display: block`, auto height, so the page flows. |
| `.panel` | No padding, no scroll. |
| `.drawing` | Full width, no border, no break inside, a page break after: one drawing on each page. |
| `.print-only` | Shown: the disclaimer. |
| `.viewer`, drawing caption buttons | Hidden. |
| `.workspace:has(.panel.framing:not([hidden])) > .notice` | Hidden on the Framing tab. Each drawing prints its own disclaimer. |

The workspace disclaimer prints once at the top of each other tab. On the Framing tab, each
`figure.drawing` holds its own `.notice.print-only`.

## Build and run

### Scripts

| Command | Runs | Result |
|---|---|---|
| `npm run setup` | `node scripts/setup.mjs` | Checks Node, then `npm ci`, `npm test`, `npm run build`. |
| `npm run dev` | `vite` | Dev server at http://localhost:5173, or the next free port. |
| `npm run build` | `tsc && vite build` | Type check with `noEmit`, then the bundle in `dist/`. |
| `npm run preview` | `vite preview` | Serves `dist/`. |
| `npm test` | `vitest run` | `tests/**/*.test.ts` in Node. |
| `npm run lint` | `eslint .` | ESLint. |

### Vite

`vite.config.ts` uses `defineConfig` from `vitest/config`. It adds `@vitejs/plugin-react`, and sets
the test files to `tests/**/*.test.ts`. It sets no `base`, so the build expects the site root. The
`?raw` import of CHANGELOG.md works in both the build and Vitest. `tsconfig.json` includes
`vite/client` types for it.

### `setup.sh` and `start.sh`

Both are POSIX `sh`, with `set -eu`, and `cd` to the repo first.

`setup.sh`:

1. Checks for `node` and `npm`.
2. When either is absent, prints an install hint: `sudo pacman -S nodejs npm`, `brew install node`,
   or https://nodejs.org/en/download. Exits 1.
3. Runs `exec node scripts/setup.mjs`.

`scripts/setup.mjs`:

1. Reads `engines.node` from `package.json`: `^22.12.0 || ^24.0.0 || >=26.0.0`.
2. Checks `process.versions.node` against each `^X.Y.Z` or `>=X.Y.Z` term. Other operators never
   match.
3. On no match, prints the range and exits 1.
4. Runs `npm ci`, `npm test`, and `npm run build`, and stops at the first failure.

`start.sh`:

1. Checks for `npm`.
2. Runs `npm ci` when `node_modules/.package-lock.json` is absent or older than
   `package-lock.json`. npm writes that file at each install, so a pull that changes the lock file
   triggers a new install.
3. Runs `exec npm run dev -- --open`.

### Node version and host

| Item | Value |
|---|---|
| `.nvmrc` | `26`: the Node version of the Cloudflare build. |
| `engines.node` | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| Host | Cloudflare builds `main` with `npm ci` and `npm run build`, and serves `dist`. See [README.md](../README.md). |
| Skip a deployment | `[skip ci]` in the commit message. |

### Browser features in use

| Feature | Used by |
|---|---|
| `CompressionStream`, `DecompressionStream` with `deflate-raw` | Share links (`src/core/share.ts`). |
| `navigator.clipboard.writeText` | Copy link. |
| `Map.groupBy` | `CutListTable`, `BomView`. |
| `<dialog>` and `showModal` | `ChangelogDialog`. |
| `ResizeObserver`, WebGL | `FramingScene`. |
| CSS `:has()`, `color-mix()`, `dvh` | `app.css`. |

## Change the UI safely

1. Preview each UI change in a browser before you commit it. Every test runs in Node, with no
   browser, so no test renders React, the DOM, or Three.js.
2. Check the change at a wide width and at 760 px or below.
3. Check it in the light and the dark color schemes.
4. Run the gate: `npm test`, `npm run lint`, `npm run build`.
5. Update this document in the same commit as a change it describes.

| UI test | Checks |
|---|---|
| `tests/history.test.ts` | Undo and redo steps, both ends, the loss of redo steps on a new edit, and the 100-step limit. |
| `tests/changelog.test.ts` | The changelog parser, and that the newest release equals `APP_VERSION`. |
