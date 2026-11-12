# User interface

The user interface is a React app in `src/ui` and a Three.js scene in `src/view3d`. `App` holds one
design, the config, in an undo history. The form edits the config. Every output is a `useMemo` of
the config, and the tabs show the outputs. `FramingScene` draws the model in 3D.

| Related document | Subject |
|---|---|
| [DEVELOPER.md](DEVELOPER.md) | Conventions, decisions, recipes, tests, the gate, release. |
| [README.md](../README.md) | Setup, npm scripts, hosting. |
| [design-model.md](design-model.md) | `shedSchema`, `pruneConfig`, the compact form, share links, the autosave format and keys. |
| [drawings.md](drawings.md) | The Framing tab, `DrawingSvg`, the zoom viewer, the PDF. |
| [outputs.md](outputs.md) | The cut list, BOM, span checks, and CSV that the tabs show. |
| [additions-and-finishes.md](additions-and-finishes.md) | Lean-tos, ramps, and the finish parts that the 3D view draws. |

## Source map

| File | Content |
|---|---|
| `src/main.tsx` | Mounts `App` in `StrictMode` and `ErrorBoundary`. |
| `src/ui/App.tsx` | App state, undo keys, autosave, files, presets, links, tabs, 3D layers, selection. |
| `src/ui/autosave.ts` | `restore`, `save`, the backup, `setAside`. It owns the storage keys. |
| `src/ui/ErrorBoundary.tsx` | The recovery page when a render throws. |
| `src/ui/history.ts` | `UndoHistory`, `startHistory`, `record`, `undo`, `redo`. |
| `src/ui/fields.tsx` | `Edit`, `SectionProps`, `setter`, the `Section`, `Group`, and `Card` folds, and the field components. |
| `src/ui/DesignForm.tsx` | One component for each form section, `PriceGroup`, and `HatchesEditor`. |
| `src/ui/OpeningsEditor.tsx`, `AdditionsEditor.tsx`, `RampsEditor.tsx` | The list editors: opening types and rows, lean-tos, ramps. |
| `src/ui/View3D.tsx` | The React host of `FramingScene`, with Fit view and Download 3D. |
| `src/view3d/scene.ts` | `FramingScene`: meshes, materials, textures, red loops, pick, camera fit, disposal. |
| `src/view3d/export.ts` | `toGlb`: the shown pieces as binary glTF. Loaded on demand. |
| `src/ui/FramingView.tsx`, `DrawingSvg.tsx`, `pdf.ts` | The Framing tab. See [drawings.md](drawings.md). |
| `src/ui/CutListTable.tsx`, `BomView.tsx`, `SpanTable.tsx`, `PieceInfo.tsx` | The Cut list, BOM, and Warnings tabs, and the piece panel. See [outputs.md](outputs.md). |
| `src/ui/ChangelogDialog.tsx`, `src/ui/changelog.ts` | The changelog dialog and its Markdown parser. |
| `src/ui/download.ts` | `download`: saves text or bytes as a file. |
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
  ├─ effect ──▶ save ──▶ localStorage
  └─ effect ──▶ designToLink ─▶ shareLink ─▶ Copy link, PDF QR sheet
```

`markOf` maps each member id to its cut-list mark. The drawings, the BOM, and both picks take
their marks from it.

| Value | Purpose |
|---|---|
| `start` | `restore(browserStore())`, read once at mount: the stored design, `hadDesign`, and why it did not load. |
| `revision` | The `key` of `DesignForm`. A load adds 1, which remounts the form. |
| `loadError.stored` | The stored design did not load. The banner then offers the backup as a download. |
| `hadDesign` | Storage held a design at mount, readable or not. A link asks before it replaces the design only when true. |
| `view` | The tab on screen: `'3d'` when the screen is wider than a phone and `tab` is `'design'`, else `tab`. `.app` carries it as `data-view`. |

### The `Edit<T>` contract

Every `onChange` has the type `Edit<T>`: it returns the error message, or `null`.
`setter(value, onChange)(key)` spreads a value into its parent object and calls the parent's
`onChange`. The chain ends at `DesignForm`'s `onChange`, which is `edit` in `App`.

`edit` runs `shedSchema.safeParse` on the whole design. On failure, it returns the first issue's
message, and the history does not change. On success, it passes `result.data` to `change`.

`ParsedInput`, `SelectField`, `SelectInput`, and `CheckField` show the message in
`<small class="error">` after the input, and set `aria-invalid`. A rejected select or checkbox snaps
back to the design's value. Its message stays until the next change of that input. The fold
switches and the list buttons drop the message.

### `edit` and `replace`

| | `edit(next)` | `replace(next)` |
|---|---|---|
| Callers | `DesignForm` `onChange` | Open, drag and drop, New from preset. `openLink` does the same three steps. |
| Validation | `shedSchema.safeParse`. Returns the first message, or `null`. | None. The caller passes a parsed config. |
| History | `change`: one undo step. | `change`: one undo step. |
| Form | Stays mounted. | `revision + 1` remounts `DesignForm`. |
| Load error | Unchanged. | Cleared. |

### Selection

`selected` holds a cut-list mark, or `null`. `toggle(mark)` selects the mark, or clears the
selection when the mark is already selected. The 3D view, the Framing tab, and the cut list call
`toggle`. A 3D click on empty space passes `null` and clears the selection. `selectedIds` holds
every member id of the line, so the 3D view and the drawings color each one. `PieceInfo` shows the
line's first member.

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

`history.ts` holds pure, generic functions on `UndoHistory<T>`. `App` passes them to
`setDesignHistory` as updaters.

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
| Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, Cmd+Y | `redo` |

The `keydown` listener on `window` skips a key with Alt down. It also skips a key in a `textarea`,
or in an `input` whose `type` is in `TEXT_INPUTS`. The Undo and Redo buttons call the same
functions.

| Edge case | Result |
|---|---|
| The focus is in a text box. | The keys go to the browser's own undo, for the text in the box. The design does not change until the box commits. |
| The focus is on a select, checkbox, color input, or button. | The keys undo and redo the design. |
| A text box holds a draft, and the user clicks Undo. | The box blurs first and commits the draft as a step. The click then undoes that step. Redo brings it back. |
| A text box shows a rejected draft, and the design is undone. | The box keeps its draft and error. Other fields show the undone values. |
| An undo restores a color. | `ColorField` has `key={value}`, so the input remounts with the restored color. |

### Decisions

| Decision | Reason |
|---|---|
| The history is in memory only. A reload starts a new history. | The history is an aid for one session. Autosave keeps the present design, and a file or link keeps a copy. |
| 100 steps (`LIMIT`). The oldest step goes. | Each step is a full design. The limit bounds the memory. |
| A load is a step. | A file, preset, or link replaces the whole design. Undo brings the old design back. |
| A change that leaves the design as it was is not a step. | A commit of the same value, for example `96` typed into a length box that holds 8 ft, would add a step that does nothing. |
| Text boxes keep the browser's undo. | While the user types, Ctrl+Z must act on the text, as in any other box. |
| An undo does not remount the form. | A field with no draft shows `format(value)`, so it follows the undo at once. A remount would close every fold the user opened. |

### Change it safely

- Keep `history.ts` generic and pure.
- A new input type that holds typed text must go in `TEXT_INPUTS`, or Ctrl+Z undoes the design
  while the user types.

## Storage

The forms of the design, their formats, and the storage keys are in
[design-model.md §8 and §9](design-model.md#9-autosave-saved-file-and-link). This section gives the
`App` flows.

### Flows

| Flow | Rule |
|---|---|
| Restore | At mount, `restore` reads the stored design. With none, the app starts from `PRESETS[0]`. |
| Autosave | An effect on `[config]` calls `save`. It runs on the first render, each change, and each undo. |
| Save | `download(fileName(config.name, 'shed.json'), designFileText(config))`. The same `fileName` names the CSV, PDF, and GLB downloads. |
| Open | `open(file)` parses the text. On success, `replace`. On failure, the banner. The file input resets its `value` to `''`, so the same file can open again. |
| Drag and drop | `onDragOver` calls `preventDefault` on the whole `.app`, so a drop anywhere calls `open`. A drop does not check the file type. |
| New from preset | The select always has the value `""`, so the same preset can be picked again. A pick asks `confirm` first. |

| Edge case | Result |
|---|---|
| Storage is blocked, as in some private windows. | The app starts from `PRESETS[0]`. Autosave fails each time, with no message. |
| Two tabs are open. | Each tab writes its own design to the same key. The last write wins. `App` does not listen for the `storage` event. |

### Error banner and recovery page

| Case | Result |
|---|---|
| A file, a link, or the stored design does not load. | The banner at the top of the sidebar (`role="alert"`) names the source and lists the errors. Dismiss closes it. A successful load clears it. |
| The stored design does not load. | `restore` first copies its text to the backup, so the first autosave cannot destroy it. The app starts from `PRESETS[0]`. The banner offers the backup as a download. |
| A render throws. | `ErrorBoundary` shows "Shed Builder stopped", the message, and the version. Its buttons: Download the design (when storage holds one), Reload, Start a new design. |

A render that throws commits nothing, so autosave still holds the last design that rendered. Start
a new design calls `setAside`, which moves the stored design to the backup, then reloads. The
backup holds one design: the latest that failed to load or that the user set aside.

### Copy link

1. An effect on `[config]` calls `designToLink`. It is async, because `CompressionStream` is async.
   A `current` flag drops the result of an older config.
2. Copy link is disabled while `shareLink` is `null`, before the first result.
3. A click calls `navigator.clipboard.writeText(link)`. When the promise rejects,
   `window.prompt('Copy this link:', link)` shows the link to copy by hand.

On a page that is not a secure context, `navigator.clipboard` is `undefined`. The call then throws
before a promise exists, and no prompt shows. The hosted site (HTTPS) and `localhost` are secure
contexts. A dev server opened by a LAN address over HTTP is not.

### Open a link

`openLink` runs at mount and on each `hashchange`, so a link pasted into an open page also works.

1. `linkData(window.location.hash)` returns the link data, or `null`. On `null`, stop.
2. `history.replaceState` removes the fragment from the address.
3. `designFromLink(data)` inflates and parses the design. On failure, the banner shows. Stop.
4. When `hadDesign` is true, `confirm` asks before the design replaces the current one. On Cancel,
   stop.
5. `change(result.config)`, `revision + 1`, and the banner clears.

| Edge case | Result |
|---|---|
| The user cancels. | The fragment is already gone. To open the design, the user opens the link again. |
| A link arrives after edits in a session that began with no stored design. | `hadDesign` is fixed at mount, so the link opens without a question. Undo brings the edits back. |
| `StrictMode` runs the effect twice in development. | The first run removes the fragment before its `await`. The second run finds no fragment. |
| A link made on `npm run dev`. | It holds the dev server's origin, so it opens only on that machine. |

### Decisions

| Decision | Reason |
|---|---|
| The fragment goes before the design opens. | A reload then keeps the design from storage and does not ask again. |
| A link asks only when the browser had a design. | A first visit from a link has nothing to lose. |
| The clipboard fallback is `window.prompt`. | When the clipboard refuses the write, the user can still copy the link by hand. |

### Change it safely

- Do not change `STORAGE_KEY` in `autosave.ts`. A new key loses every user's autosaved design.
- Test a link from the hosted site or from `npm run preview`, not only from the dev server.

## The form

`DesignForm` gets `value` (the config) and `onChange` (`edit`). Each section component gets
`SectionProps<T>`: `value` and `onChange` for its part of the config. Side words in labels come
from `naming(value)`, so a gable front renames them.

### Conditional fields

A section, group, or field shows only when the design uses it. `pruneConfig` resets each setting
under the same condition ([design-model.md §7](design-model.md#7-prune)). Keep the two in step.

Lean-to posts stand on piers or a slab sized by `foundation.pier` and `foundation.slab`, on every
foundation type. So `FoundationSection` shows a Lean-to piers or Lean-to slab group when a lean-to
needs those fields and the shed's own foundation does not show them.

A switch of Wall height to Custom sets `wallHeight` to `wallTops(value).left` in the same edit, so
the walls do not move.

### Folds: `Section`, `Group`, `Card`

All three are `Fold` with a `kind`.

- `brief` is a one-line summary beside the title. CSS hides it while the fold is open.
- React writes the `open` attribute only when the prop changes. A user toggle changes only the DOM.
- With `enabled` and `onEnable`, the header holds a feature switch. While it is off, the fold
  renders only its title and switch, and the children do not render.
- A click on the switch also sets the local `opened` state, so a switch turned on opens its fold.
- The config keeps the values of a switched-off part.

### Fields

`ParsedInput`, the base of every text field, holds a `draft` while the user types. Blur or Enter
commits it: `parse`, then `onChange`. Bad text gives the field's `invalid` message. With an error,
the draft stays in the box. With none, the draft clears, and the box shows `format(value)`.

`ColorField` renders an uncontrolled `<input type="color" key={value}>`. It listens to the native
`change` event, which fires when the picker closes. React's `onChange` fires on each `input` event,
at each step of a drag, so the component does not use it. `key={value}` remounts the input when the
value changes from outside, for example on an undo.

### List editors

Each list editor holds `added`, the index of the item the user added last. That card renders with
`open`. Cards have `key={index}`, so after a removal the open or closed state of each fold stays
with its position, not with its item.

| Editor | Rule |
|---|---|
| `OpeningTypesEditor` | While a type's name equals `autoName(kind, width, height)`, a size change also renames the type. A name the user typed stays. |
| `OpeningTypesEditor` | A rename also renames the `type` of every row that uses the type, in one edit. |
| `OpeningTypesEditor` | Remove (`×`) is disabled while a row uses the type. |
| `OpeningRowsEditor` | Position from and the Count stepper convert positions as in [design-model.md §4.2](design-model.md#42-callers). The openings do not move. |
| `OpeningRowsEditor` | Positions from a corner split on `,` and `;` only, since a length can hold a space (`10' 6"`). |
| `OpeningRowsEditor` | The positions input has `key={value.along}`, so a change of reference drops its draft. |
| `OpeningRowsEditor` | A row edit goes through `withOpeningRow`, and `×` through `withoutOpeningRow`. Both keep each ramp on its opening, or where it stood ([additions-and-finishes.md §3](additions-and-finishes.md#3-ramps)). |
| `AdditionsEditor` | `+ Lean-to` adds a lean-to on the first free side, in the user's order. A mirrored lean-to takes two sides. With no free side, the button is gone. |
| `AdditionsEditor` | A Side or Attachment choice that breaks a `shedSchema` rule snaps back, with the rule's message under the select. |
| `RampsEditor` | The Follows choice "No opening: placed below" frees a ramp where it stands ([additions-and-finishes.md §3](additions-and-finishes.md#3-ramps)). A lost ramp shows "An opening that is gone" as its choice. |

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

### Change it safely

- Add a field with the recipe in [DEVELOPER.md](DEVELOPER.md#add-a-setting). Put it in the section
  that owns its part of the config.
- When a field shows only under a condition, give `pruneConfig` the same condition.
- A select or checkbox shows `edit`'s message under it, as a text field does. A feature switch in
  a fold header and a list button do not: give them only edits that the schema cannot reject.
- To edit several fields as one change, build the next value and call `onChange` once, as the
  Custom wall height and the Attachment select do. Two calls make two undo steps, and the second
  call, built from the old `value`, drops the first change.
- A list editor that removes or edits items must keep each reference by index valid.
  `withoutOpeningRow` and `withOpeningRow` are the model for ramps.

## The 3D view

`View3D` is the React side. `FramingScene` is a plain Three.js class. It draws only what `App`
passes it, and it renders on demand only: there is no animation loop.

### `View3D`

`View3D` makes one `FramingScene` at mount and calls `dispose()` at unmount. A change of `members`,
`solids`, `finishes`, `trimColor`, or `missing` calls `setModel`, which rebuilds every mesh. A
change of `selected` calls only `setSelection`. The scene calls `onPick` through the `pick` ref, so
it always calls the newest callback.

### Download 3D

- The button exports `pieces()`: the meshes of `members`, `solids`, and `finishes`, so only the
  shown layers.
- It loads `src/view3d/export.ts` on demand. That chunk holds `GLTFExporter`, about 37 kB.
- A member's copy takes `userData.base`, so a selected piece keeps its lumber color. Edge lines and
  red loops stay out.
- The root scales by 0.0254 and turns −90° about x, because glTF is in meters with y up.

### Materials

`baseMaterial` picks the trim material first, then treated, then plate or stud. `mesh.userData`
keeps `id` and `base`. `applySelection` swaps each member between `selected` and its `base`.

`App` passes `trimColor` only while the siding layer shows, else `null`. With a trim color, the
`TRIM_ROLES` members take it. The Framing view hides the siding, so those members keep their lumber
color there.

The renderer has `alpha: true`, so the canvas shows the page's `--bg`. The 3D materials have fixed
colors.

Finish textures are in [additions-and-finishes.md §5](additions-and-finishes.md#3d-view).
`ExtrudeGeometry` gives the face UVs in shape units, inches, so a `repeat` of `1 / tile` makes one
tile cover `tile` inches.

### Red loops

`setModel` draws each `missing.outline` as a `LineLoop` in the `missing` material, with
`renderOrder` 1. The material has `depthTest: false`, so the loop shows through the framing and the
finishes. A loop hides with the layer of `missing.assembly`.

### Pick

- Pointer travel over `CLICK_SLOP` between `pointerdown` and `pointerup` is an orbit: no pick.
- The raycaster tests only `members.children`, not recursive. Edge lines, solids, finishes, and
  loops do not catch the ray, so a click on siding picks the member behind it.
- A member on a hidden layer is not in the scene and cannot be picked.

### Camera fit

`fit` frames the members and solids from the user's front-left corner, above (`VIEW_FROM`).

| Caller | When |
|---|---|
| `setModel` | Only before the first fit (`fitted` false). Later models keep the camera. |
| `resize` | Only before the first fit, when the host gets a size. |
| `setFront` | When the front changes. |
| Fit view | On a click. |

A load also keeps the camera. After a file, preset, or link opens, Fit view frames the new design.

`fit` calls `matchHost()` first. The first fit can come before the `ResizeObserver` reports the
host. The camera aspect was then 1, and a tall phone screen cut the shed off at both sides.

A host with no size, such as a hidden tab, skips the fit. The `ResizeObserver` fits the model when
the tab shows.

### Layers and the Framing and Finished views

`LAYERS` and `layerOf` are in `src/core/member.ts`; each assembly's layer is in `ASSEMBLIES`
([framing.md §1.2](framing.md#12-ids-and-roles)). The Framing
and Finished buttons set `hidden` to their `VIEWS` list. The app starts in the Framing view.

- A view button shows as pressed only while `hidden` equals its list exactly. After a manual layer
  change, no view button is pressed.
- A layer change makes new `shown*` arrays, so `setModel` rebuilds every mesh.

### Disposal

`clearModel` disposes of each mesh's geometry and edge geometry. `dispose` also disposes of the
grid, the materials with their maps, the textures, and the renderer. It also removes the canvas. The texture and
finish-material caches live until `dispose`, so each new finish color adds materials to the cache.

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
- A new textured look: see [additions-and-finishes.md §5](additions-and-finishes.md#5-finishes).
- Keep `View3D`'s effect inputs stable. A new array on each render rebuilds the whole scene.
- A new layer goes in `LAYERS`. The checkbox list follows. Add it to a `VIEWS` list if a view hides
  it.

## Other tabs

| Tab | Component | Details |
|---|---|---|
| Framing | `FramingView` | [drawings.md §6](drawings.md#6-the-framing-tab-and-the-zoom-viewer) |
| Cut list | `CutListTable` | [outputs.md §1.6](outputs.md#16-what-the-user-sees) |
| BOM | `BomView` | [outputs.md §2.8](outputs.md#28-what-the-user-sees), and "What the user sees" in each BOM section |
| Warnings | `ul.warnings`, `SpanTable` | [outputs.md §8.9](outputs.md#89-what-the-user-sees) |

The Warnings list joins `model.warnings`, `bom.warnings`, and `spanWarnings(spans, config)`. Its
key is `{source}: {message}`, so two warnings with the same source and message give React a
duplicate key.

`PieceInfo` floats at the bottom-left of the 3D tab (`.pick-info`). On the Framing and Cut list
tabs, it sticks to the bottom of the scrolled panel (`.pick-info.sticky`).

### Changelog dialog

- `ChangelogDialog` imports `CHANGELOG.md?raw`, so Vite puts the text in the bundle at build time.
  The import works in the build and in Vitest. `tsconfig.json` includes the `vite/client` types for
  it.
- An effect calls `showModal()` only when the dialog is not open, because `StrictMode` runs the
  effect twice in development.
- `parseChangelog` reads only the Markdown that CHANGELOG.md uses.
- `tests/changelog.test.ts` checks that the first released heading equals `APP_VERSION`. A release
  must change `package.json` and CHANGELOG.md together.

## Phone layout

The phone layout exists because the shared link, and the QR code on the PDF plans, open on phones.
Before it, the 340 px form left the workspace about 50 px wide on a phone.

`PHONE` in `App.tsx` and the media query in `app.css` are both `(max-width: 760px)`. `usePhone`
listens to the media query's `change` event.

| Part | Phone behavior |
|---|---|
| Design tab | The form is a tab of its own (`class="phone-only"`). `data-view` shows the sidebar on `design`, else the workspace. |
| Wider screen | `view` falls back from `design` to `3d`. `tab` keeps `design`, so a narrower screen shows the form again. |
| Layers | The Layers button shows. The checkboxes show only with `.layer-toggles.open` (`layersOpen`). |
| Inputs | 16 px text, so the phone does not zoom in on a tap. `index.html` does not block zoom in its viewport tag. |
| Cut list | The Notes column is hidden. A tap on a line shows its note in `PieceInfo`. |
| Piece panel | The `×` closes it, since a full-screen tab has no empty space to tap. |

| Edge case | Result |
|---|---|
| A link fails to load on a phone. | The banner is in the sidebar, so it shows only on the Design tab. The app opens on the 3D tab. |
| The screen turns across 760 px. | `usePhone` updates. `tab` stays, and `view` follows. |

Change `PHONE` and the media query together.

## Print styles

Print, in the Framing, Cut list, and BOM toolbars, calls `window.print()`. The other tab panels have
`hidden`, so only the tab on screen prints. The print rules for the drawings are in
[drawings.md §6](drawings.md#6-the-framing-tab-and-the-zoom-viewer).

- The workspace disclaimer prints once at the top of each other tab. On the Framing tab, each
  `figure.drawing` prints its own `.notice.print-only`, and the workspace disclaimer is hidden.
- The print rules reset the other color tokens, but not `--accent` and `--error`. A print from a
  dark scheme keeps their dark values.

## Build and run

Setup, the npm scripts, and hosting are in [README.md](../README.md#setup). The gate is in
[DEVELOPER.md](DEVELOPER.md#tests), and the release in [DEVELOPER.md](DEVELOPER.md#release). Those
documents do not give these facts:

| Item | Rule |
|---|---|
| `base` in `vite.config.ts` | Not set, so the build expects the site root. |
| `dist/version.txt` | A plugin in `vite.config.ts` writes the `package.json` version there. The release workflow reads it from the live site. |
| `engines.node` | `scripts/setup.mjs` checks only `^X.Y.Z` and `>=X.Y.Z` terms. Other operators never match. |
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
