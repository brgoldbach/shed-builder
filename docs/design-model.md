# Design model

A design is one `ShedConfig` value: the config. The zod schema `shedSchema` in `src/core/config.ts`
defines each setting, its default, and its range, and a comment there explains each field. This
document gives the rules around the schema, and how the config moves between the browser, files,
and links (9). For the user's view, see "Design files" in [README.md](../README.md).

The compact form is the pruned config (`pruneConfig`, 7) without its default values
(`compactDesign`, 8). Saved files and links hold it. Every reader ends in `parseConfig`, so all
stored forms accept the same input.

**Decision.** Shed Builder is a static site with no server. A design lives in the browser's
storage, or in a file or a link that the user holds.

| Term | Meaning |
|---|---|
| RO | Rough opening: the framed hole for a door or window. |
| psf | Pounds per square foot. |
| Model side | `front`, `back`, `left`, or `right` in model coordinates. Config fields hold model sides. |
| User side | The name the user sees for a model side. It depends on `front`. |
| Eave wall | The model's front or back wall. It carries the rafters. |
| End wall | The model's left or right wall. On a gable or gambrel roof, it carries the gable-end framing. |
| Break | The line on a gambrel roof where the top lines of the lower and upper slopes meet. |
| Lean-to roof | A main roof with one slope: `roof.style: 'lean-to'`. |
| Lean-to | An open addition on posts against one side of the shed: an item of `additions`. |

## 1. The config

### 1.1 Top-level structure

| Field | Rule |
|---|---|
| `schemaVersion` | Required literal `1`, with no default (6.2). |
| `name` | Trimmed. An empty name fails with `Required`. |
| `width`, `length` | `width` runs front to back, across the ridge. `length` runs left to right, along the ridge. |
| `studHeight`, `wallHeight` | See 1.6. |
| `front` | The side the user calls the front: `eave` or `gable`. It changes names only (3). |
| `foundation`, `floor`, `walls`, `roof` | Framing settings. `foundation.type` selects the `skid`, `pier`, or `slab` object. See [framing.md](framing.md). |
| `openingTypes`, `openings` | Reusable opening types, and placement rows that name a type (4). |
| `additions`, `ramps` | Lean-tos, one per side, and ramps. See [additions-and-finishes.md](additions-and-finishes.md). |
| `finishes` | The 3D look only. |
| `loads` | Loads for the span checks, psf ([outputs.md 8](outputs.md#8-span-checks)). |
| `catalog` | Lumber and prices (5). |

The meaning of the pitch fields depends on `roof.style`:

| `roof.style` | Shape | Pitch fields |
|---|---|---|
| `gable` (default) | Two slopes that meet at a ridge. | `pitch`: both slopes. |
| `gambrel` | Two sides that meet at a ridge. Each side has a steep lower slope from the eave to the break, and an upper slope from the break to the ridge. | `gambrel.lowerPitch`: the lower slope. `pitch`: the upper slope. `gambrel.breakRun`: horizontal, from the eave wall's outside face to the break; `auto` makes the lower and upper rafters the same length along the slope. `gambrel.ridgeBoard: false` butts the upper rafters at the peak, joined by gussets. |
| `lean-to` | One slope, high at `highSide`. | `pitch` |

The break position and its 1 ft limit from the ridge line are in
[framing.md 7.8](framing.md#78-gambrel-break-miter-and-gussets). Three helpers in `config.ts` group
the styles:

| Helper | Returns |
|---|---|
| `ridged(roof)` | `true` for `gable` and `gambrel`. The ridge board, ties, loft, through end walls, and the extension rule (1.5) follow it. |
| `hasRidgeBoard(roof)` | `true` for a gable, or a gambrel with `gambrel.ridgeBoard`. The ridge board, ridge posts, `ridge`, and `rakeLadder.ridgeExtends` follow it. |
| `eavePitch(roof)` | The pitch at the eaves, per 12: `gambrel.lowerPitch` on a gambrel, else `pitch`. |

### 1.2 Value builders

`len(min, max)` takes inches. Its messages show the limit in feet and inches through
`formatLength`, for example `Min 4' 0"`. Use it for each new length field.

Each choice list is an exported `as const` array, for example `FOUNDATION_TYPES`. The UI builds its
select options from these arrays.

### 1.3 Defaults and `.prefault({})`

1. Each scalar field has a `.default(...)`. The exceptions are `schemaVersion`, the keys a list
   item must give (1.4), and the optional `openingTypes[].header`.
2. Each nested object uses `.prefault({})`. In zod 4, `.prefault` parses `{}` through the object
   schema, so the inner defaults apply. `.default({})` returns `{}` as is, with no inner defaults.
3. Lists default to `[]`. `catalog.stock` defaults to `{}`.

So `{ "schemaVersion": 1 }` parses to a full design. A default is part of the file format, because
files and links leave default values out (6.4).

### 1.4 Strict objects and list items

Every object is a `z.strictObject`. An unknown key fails the parse and names its path, for example
`walls: Unrecognized key: "studlength"`. A typo in a hand-edited file thus gives an error, not a
silent loss of the value. The cost: a renamed or removed field breaks old files unless an upgrade
step maps it (6.3).

| List | Keys an item must give | Other keys |
|---|---|---|
| `openingTypes` | `name`, `kind`, `width`, `height` | Defaults. `header` is optional and has no default. |
| `openings` | `type`, `wall`, `at` (one position or more) | Defaults |
| `additions` | `side` | Defaults |
| `ramps` | none | Defaults |
| `roof.loft.hatches` | `x`, `y`, `width`, `depth` | none |

An opening type without `header` uses `walls.header`. A `flat` header is the wall stud.

### 1.5 Cross-field rules

Item-level refinements:

| Item | Rule | Path and message |
|---|---|---|
| `openings[]` | With `along: 'percent'`, each value of `at` is 100 or less. | `openings.N.at: Max 100%` |
| `ramps[]` | With `along: 'percent'`, `at` is 0 to 100. | `ramps.N.at: 0% to 100%` |

With `along` set to `left` or `right`, `at` has no maximum, because the wall length comes from
other fields. A position past the wall end is valid. `frameWalls` then leaves the opening out with
a warning ([framing.md 6.1](framing.md#61-fit-order-and-checks)).

`shedSchema.superRefine` checks the whole config:

| Rule | Path | Reason |
|---|---|---|
| On a gambrel, `gambrel.lowerPitch` is more than `pitch`. | `roof.gambrel.lowerPitch` | A `Profile` takes the lowest slope line at each point. That holds only when the lower slope is the steeper one. |
| One lean-to per side. A lean-to with `mirror` takes `side` and `OPPOSITE[side]`. | `additions.N.side` | Each side has one lean-to assembly, for example `addition.front` with mark prefix `AF`. |
| An extension (`attach: 'extension'`) needs a downhill eave on each side it takes. On a `ridged` roof, that is `front` or `back`. On a lean-to roof, it is the side opposite `highSide`. | `additions.N.attach` | Extension rafters lap the main rafters at a downhill eave, in place of the main eave overhang. |
| An extension has `length: 'full'`. | `additions.N.length` | It replaces the eave overhang along the whole wall. |
| Opening type names are unique. The check is case-sensitive and runs after the trim. | `openingTypes.N.name` | A row finds its type by name. |
| Each row's `type` names an opening type. | `openings.N.type` | Same. |

Nothing checks `ramps[].opening` against `openings`. A ramp whose opening is gone stays valid. It
stands at its own position, with a warning ([additions-and-finishes.md 3](additions-and-finishes.md#3-ramps-and-stairs)).

**Decision.** The app never limits the user. The schema rejects a value outside its type or range,
and the combinations in the tables above. Every other design builds. A generator warns and goes on,
and leaves out a part whose framing would collide ("Left out" in DEVELOPER.md).

### 1.6 Stud height and wall height

A precut `studHeight`, one of `PRECUT_STUDS`, sets the stud length. The plate stack then sets the
wall top. `custom` sets the wall top to `wallHeight`, and the stud is shorter by the plate stack.
[framing.md 5.2](framing.md#52-heights) gives the plate stack and the lean-to high wall. The
`wallHeight` default, 97.125, is the wall top of the default 92.625 precut under the default
3-ply stack.

| Rule | Where |
|---|---|
| `wallHeight` has an effect only with `custom`. Prune resets it otherwise, so a compact file holds it only with `custom`. | `studLengths`, `pruneConfig` |
| A file with `wallHeight` and no `studHeight` loads as `custom`. Files saved before stud heights existed had only `wallHeight`. | `keepWallHeight` (6.1) |
| Because of `keepWallHeight`, a compact file must hold `studHeight` whenever it holds `wallHeight`. | `restore` in `compactDesign` (8.3) |

### 1.7 Change the config safely

1. Follow "Add a setting" in DEVELOPER.md.
2. Give a new field a default that gives the behavior from before the field existed. Old files and
   links do not hold the field.
3. Add a rule to `pruneConfig` when the field applies only with another choice (7).
4. Add a key to `keep` in `ITEMS` (8.2) when a list item must give a new key.
5. Add a cross-field check only for a combination that the generators cannot build. Make all other
   problems warnings.

## 2. Units and coordinates

| Quantity | Unit | Example |
|---|---|---|
| Length | Inches, as a plain number | `width`, `sill`, `kerf` |
| Roof pitch | Rise per 12 of run | `roof.pitch: 6` is 6/12. |
| Ramp slope | Run per unit of rise | `ramps[].slope: 4` is 1 in 4. |
| Percent | 0–100 | `openings[].at` with `percent`, `additions[].center`, `treatedMarkup` |
| Load | psf | `loads.roof` |
| Money | US dollars, before tax and delivery | `catalog.prices` |
| Color | `#rrggbb`, either case | `finishes.roofColor` |

The model axes are in [framing.md 2.1](framing.md#21-model-axes).

`src/core/units.ts` converts lengths to and from text:

| Function | Contract |
|---|---|
| `formatLength(inches)` | Feet and inches, to the nearest 1/16 in: 92.625 → `7' 8-5/8"`. |
| `formatInches(inches)` | Inches only, to the nearest 1/16 in: 92.625 → `92-5/8"`. |
| `parseLength(text)` | Inches, or `null` when the text is not a length. It reads each non-negative length as the format functions write it, decimal feet (`1.5'`), and `ft` and `in` words. A bare number is inches. It rejects a negative length and a zero denominator. It does not round: `92.6` stays 92.6. |

Change units safely:

- Store lengths unrounded. Round to 1/16 in only for display, in the cut list, and in the BOM.
- Keep the round-trip test in `tests/units.test.ts` green after a change to `parseLength` or
  `format`. It reads back each 1/16 in from 0 to 20 ft as both format functions write it.

## 3. Sides and naming

**Decision.** The model's front and back are always the eave walls. Left and right are the end
walls. `front: 'gable'` only renames the sides. Generators read `front` only through `naming`, for
text, so the geometry is the same for both values. Config fields such as `openings[].wall`,
`additions[].side`, and `ramps[].wall` hold model sides.

`front` has an effect in four places only:

| Place | Effect |
|---|---|
| `naming(config)` (`src/core/naming.ts`) | Labels, mark prefixes, side order, cut-list order. |
| `planView` (`src/drawings/sheets.ts`) | Plans put the user's front at the bottom. |
| `FramingScene.setFront` (`src/view3d/scene.ts`) | The 3D camera views from the user's front. |
| `DesignForm` (`src/ui/DesignForm.tsx`) | The Width and Length labels name the user's sides. |

### 3.1 The quarter turn

With a gable end in front, the user stands a quarter turn from the model. `GABLE_FRONT` maps each
model side to the user side:

| Model side | User side, `front: 'eave'` | User side, `front: 'gable'` |
|---|---|---|
| `front` (eave wall) | front | right |
| `back` (eave wall) | back | left |
| `left` (end wall) | left | front |
| `right` (end wall) | right | back |

The form follows the same turn: with `gable`, the width field reads "Width (left to right)" and the
length field reads "Length (front to back)".

### 3.2 The `Naming` interface

`naming(config)` reads only `config.front` and returns:

| Member | Returns |
|---|---|
| `side(model)` | The user side for a model side. |
| `sides` | The model sides in the user's order: their front, back, left, right. With `gable`: `left`, `right`, `back`, `front`. |
| `assembly(assembly)` | `{ label, prefix }`. A sided assembly takes both from `KIND_WORDS` and the user side. An assembly without a side keeps its `ASSEMBLIES` entry (`src/core/member.ts`). |
| `rank(assembly)` | The cut-list sort key (3.3). |

### 3.3 Cut-list order and marks

`rank` gives the `KIND_ORDER` index × 10, plus the index of the user side in front, back, left,
right. A sided prefix uses the first letter of the user side, `<S>`:

| Order | Assembly | Label, prefix |
|---|---|---|
| 1 | `foundation` | `Foundation`, `FD` |
| 2 | `floor` | `Floor`, `FL` |
| 3 | `wall.<side>` | `<Side> wall`, `<S>W` |
| 4 | `gable.<side>` | `<Side> gable end`, `G<S>` |
| 5 | `roof` | `Roof`, `RF` |
| 6 | `loft` | `Loft`, `LF` |
| 7 | `knee.<side>` | `<Side> knee wall`, `K<S>` |
| 8 | `addition.<side>` | `<Side> lean-to`, `A<S>` |
| 9 | `ramp` | `Ramps`, `RP` |

With `gable`, `wall.left` is the `Front wall`: its lines sort first among the walls, and its marks
are `FW-n`. The grouping and the sort within an assembly are in
[outputs.md 1](outputs.md#1-cut-list).

### 3.4 Change naming safely

- Keep model sides in the config and in every generator. Convert to user sides only for text, sort
  order, the plan view, and the camera.
- Add a sided assembly to `ASSEMBLIES` and to `KIND_WORDS`. Add its kind to `KIND_ORDER` at its
  place in the cut list.
- `tests/naming.test.ts` checks that `eave` gives exactly the `ASSEMBLIES` labels, prefixes, and
  order. Keep the `ASSEMBLIES` key order equal to the `rank` order.

## 4. Opening placement

An opening row (`openings[]`) places one opening type on one wall at one or more positions:

| Field | Meaning |
|---|---|
| `sill` | Floor surface to the RO bottom. On an end wall, a sill at or above the wall top puts the opening in the gable. |
| `along` | `percent`: each value in `at` is the RO center, as a percent of the wall span. `left` or `right`: each value is the distance from that outside corner, viewed from outside, to the near RO edge. |
| `at` | One or more positions in `along` units. |
| `enabled` | `false` keeps the row and its type but frames nothing. |

"Viewed from outside" sets the direction along each wall: the left corner of the front wall is at
x = 0, and the left corner of the back wall is at x = `length` ([framing.md 2.2](framing.md#22-wall-frames)).

A ramp places itself the same way with `wall`, `along`, `at`, and `width`, to its center or near
edge. A ramp that follows an opening takes that opening's RO instead
([additions-and-finishes.md 3](additions-and-finishes.md#3-ramps-and-stairs)).

### 4.1 Functions

`src/core/placement.ts`:

| Function | Result |
|---|---|
| `wallSpan(config, wall)` | Corner to corner, on the outside faces of the framing: `length` for `front` and `back`, `width` for `left` and `right`. |
| `roOffset(along, value, span, width)` | The wall's left corner, viewed from outside, to the RO left edge. |
| `positionFor(along, offset, span, width)` | The exact inverse of `roOffset`. |
| `evenPercents(count)` | RO centers in percent for `count` openings, each at the center of an equal share. One opening is at 50, two are at 25 and 75. |
| `openingLabel(names, row, position)` | One position in the user's side names, for example `window 24x36 (front 50%)`. |

### 4.2 Callers

| Caller | Use |
|---|---|
| `frameWalls` | The RO left edge on an eave or end wall. |
| `frameGableEnds` (`fitGableOpening`) | The RO left edge in a gable, over the end wall's span. |
| `rampPlace` | Ramp edges, from its opening or from its own position. |
| `OpeningRow` (`src/ui/OpeningsEditor.tsx`) | A new `along` converts each position through `roOffset` and `positionFor`, so each opening stays where it is. A new count replaces the positions with `evenPercents`, converted to the row's `along`. Each converted position rounds to 0.1 for a percent, and to 1/16 in for a length. |

### 4.3 Change placement safely

- Keep `roOffset` and `positionFor` exact inverses. The form converts with both.
- Name an opening in text only through `openingLabel`, so warnings, notes, and editors agree.

## 5. Lumber catalog

`src/core/catalog.ts` holds the fixed lumber data, each table with its source. `catalog` in the
config holds the user's choices. The packing onto stock and the prices in the BOM are in
[outputs.md 2](outputs.md#2-lumber).

### 5.1 Sizes and stock lengths

`LUMBER` holds the dry dressed sizes from the American Softwood Lumber Standard (DOC PS 20).
`DEFAULT_STOCK` holds the default stock lengths for each size.

`catalog.stock` is a partial record. A size absent from it uses `DEFAULT_STOCK[size]`
(`stockLengths`). Each list holds at least one length from 12 to 480 in. In the form, a cleared
field deletes the size's entry.

`stockFor(catalog, size, max)` returns the stock lengths no longer than `max`, by default
`maxLength`. When none is, it returns the shortest stock length, so the list is never empty.

### 5.2 `maxLength` and `maxOnePiece`

| Setting | Meaning |
|---|---|
| `maxLength` | The longest board to buy. Generators splice plates, rims, ridges, fascia, and girders at `Math.max(...stockFor(catalog, size))`: the longest stock length no longer than `maxLength`. |
| `maxOnePiece` | The longest board for a longer piece that cannot splice: a rafter, a tie, or a joist. A value below `maxLength` has no effect, because the BOM takes the larger of the two. |

### 5.3 Sheets

`SHEETS` holds each 48 × 96 in sheet good. Its `thick` is the actual thickness, which the framing
uses. Its label adds the name yards sell it under, for example `15/32" plywood (1/2")`.

### 5.4 Species for the span checks

`catalog.species` selects the No. 2 grade design values in `SPECIES`. The values, the size factor
in `bendingValue`, and their NDS 2018 sources are in [outputs.md 8](outputs.md#8-span-checks).

### 5.5 Default prices

`DEFAULT_PRICES` holds US home-center retail prices as searched in November 2026, before tax and
delivery. The user checks them against a local yard. `priceTable` builds each price group of the
schema from these tables. Each key has its own default, so a file can give only some prices. Each
group is a strict object, so an unknown price key fails.

### 5.6 Change the catalog safely

- A new counted item: follow "Add a counted BOM item" in DEVELOPER.md. The schema field comes from
  `DEFAULT_PRICES` without other changes.
- A changed default price or stock list changes every compact file that relied on it (6.4).
- A new lumber size goes in `LUMBER_SIZES`, `LUMBER`, `DEFAULT_STOCK`, and `DEFAULT_PRICES.lumber`.
  Each table is a `Record<LumberSize, …>`, so the type check fails until each table has the size.
- `5/4x6` decking is in `LUMBER_SIZES` for the cut list, BOM, and prices. `FRAMING_SIZES` leaves it
  out of the header and girder choices.
- `2x14` is for loft joists only (`LOFT_JOISTS`), for I-joists of that depth. `FRAMING_SIZES` leaves
  it out. Its price is an estimate: the 2x12 price scaled by depth. `bendingValue` gives null for it.
- `bendingValue` reads thickness and width from the size name, for example `2x8`. A new size name
  must keep the `<thickness>x<width>` form.

## 6. Files and versions

### 6.1 Parse steps

`parseConfigText(text)` and then `parseConfig(raw)` read every stored form: autosave, Open, a link,
and the check in `compactDesign`. The steps run in this order:

1. `JSON.parse`. Bad JSON gives `Not valid JSON`.
2. `withoutAppVersion`: drop `appVersion`. The strict schema would reject it, and the design does
   not keep it.
3. `keepWallHeight`: for an object with `wallHeight` and no `studHeight`, add
   `studHeight: 'custom'`. Each upgrade step goes here.
4. `shedSchema.safeParse`. A failure gives one `<path>: <message>` string for each issue, or
   `file: <message>` for the root.

Steps 2 and 3 accept any value and return a non-object as it is.

`PRESETS`, `DESIGNS`, and `pruneConfig` use `shedSchema.parse`, which throws on an invalid config.
Upgrade steps do not apply to them, so presets and test fixtures must use the current shape. An
invalid preset throws at module load, so the app does not start.

### 6.2 `schemaVersion` and `appVersion`

| Field | Rule |
|---|---|
| `schemaVersion` | `z.literal(1)`, required. A file without it, or with another value, fails. An older app thus rejects a file from a newer schema. The number stays 1 until an old file needs an upgrade step to load. A new field with a default does not change it. |
| `appVersion` | `APP_VERSION`, the `version` in `package.json`. `serializeConfig` and `designFileText` write it right after `schemaVersion`. It is for people who read the file. No logic reads a file's `appVersion`: `parseConfig` drops it, and links do not hold it. |

`keepWallHeight` shows the current practice: the step finds the old shape by its content, so
`schemaVersion` stays 1. A version change also needs `schemaVersion` to accept the old number, and
a step that upgrades the old shape.

### 6.3 Remove or rename a field

Strict objects reject an unknown key, so an old file with the old key fails to load. This applies
to autosave too: `restore` (`src/ui/autosave.ts`) then opens the first preset, and keeps the old
text in the backup key (9).

`tests/saved.test.ts` loads each file in `tests/fixtures/saved/vX.Y.Z/`: the presets and test
designs as each release had them. A change that makes one fail needs `schemaVersion` 2 and an
upgrade step for version 1.

1. Change the field in `shedSchema`.
2. Write an upgrade step beside `keepWallHeight`. It takes `unknown`, finds the old shape by its
   content, and returns the new shape.
3. Call the step in `parseConfig`, before `shedSchema.safeParse`.
4. Add a test to `tests/config.test.ts` that loads the old shape.
5. Update presets and fixtures to the new shape. `shedSchema.parse` loads them without upgrade
   steps.
6. Update `pruneConfig` and `ITEMS` in `share.ts` if they name the field.

### 6.4 Change a default

Files and links leave out each value equal to its default. A changed default thus changes every
saved file and link that relied on the old default. Autosave holds every value, so it keeps the old
one. No upgrade step can tell which default a compact file assumed: links have no `appVersion`, and
`parseConfig` drops it from files. Treat each default as part of the file format. The presets and
most fixtures are sparse too, so the golden test shows the effect of a changed default.

## 7. Prune

`pruneConfig(config)` (`src/core/prune.ts`) returns the design with each setting it does not use
back at its default. It also drops each opening type that no row places. Saved files and links
carry its output.

**Contract.** A pruned design builds the same shed: the same framing, cut list, BOM, drawings,
finishes, warnings, and span checks. `tests/prune.test.ts` checks the contract after prune, save,
and load. It uses `DESIGNS`, and `MESSY`: designs that set unused settings away from their
defaults.

Prune keeps each field whose rule in 7.1 holds and omits the rest. Then `shedSchema.parse` puts
each omitted field back at its default. The input must be a valid config, or the parse throws. A
design with each unused setting at its default and each type placed prunes to an equal config.

### 7.1 Rules

| Setting | Kept when | Reason |
|---|---|---|
| `wallHeight` | `studHeight` is `custom`. | A precut sets the wall height. |
| `foundation.skid` | `type` is `skid`. | |
| `foundation.pier`, all of it | `type` is `pier`. | |
| `foundation.pier.postLength` | Also `post` is not `none`. | No post, no length. |
| `foundation.pier.diameter`, `depth`, `aboveGrade` | `type` is `pier`, or a lean-to has a `floor` other than `slab`. | Lean-to posts stand on piers sized by the main foundation's settings. |
| `foundation.slab`, all of it | `type` is `slab`. | |
| `foundation.slab.edgeWidth`, `edgeDepth` | Also `thickenedEdge` is true. | |
| `foundation.slab.thickness` | `type` is `slab`, or a lean-to has `floor: 'slab'`. | A lean-to slab takes the main slab thickness. |
| `floor` | `foundation.type` is not `slab`. | The slab is the floor. |
| `walls.mudSill` | `foundation.type` is `slab`. | A mud sill sits on a slab only (`mudSillSize`). |
| `walls.through` | The roof is gable or gambrel. | A lean-to roof's eave walls always run through. |
| `openingTypes[]` | A row names the type, with `enabled` true or false. | A row needs its type to parse. |
| `openingTypes[].headroom` | `kind` is `overhead`. | Track room for an overhead door. |
| `roof.gambrel` | `style` is `gambrel`. | |
| `roof.sheathing` | `roof.roofing` is not `metal`, or a lean-to has `roofing` other than `metal`. | Open metal roofing has no sheathing. A lean-to without metal takes the main roof's sheathing. |
| `roof.purlin`, `purlinSpacing` | `roof.roofing` is not `shingles`. | Metal roofing sits on purlins. |
| `roof.rakeLadder` | `rakeOverhang` is 1.5 in (`LADDER`) or more. | `frameRoof` frames no rake overhang below 1.5 in. |
| `roof.rakeLadder.ridgeExtends` | Also the roof has a ridge board (`hasRidgeBoard`). | A lean-to roof, or a gambrel without a ridge board, has none. |
| `roof.ridge` | The roof has a ridge board (`hasRidgeBoard`). | |
| `roof.highSide` | `style` is `lean-to`. | |
| `roof.rafterTies` | Gable or gambrel roof, and no loft. When off, only `{ enabled: false }`. | Loft joists take the place of rafter ties. |
| `roof.collarTies` | Gable or gambrel roof. When off, only `{ enabled: false }`. | |
| `roof.loft` | Gable or gambrel roof with `loft.enabled`. | `loft.gableEnds` (`balloon`, the default, or `platform`) goes with it. |
| `roof.loft.open.length` | Also `open.end` is not `none`. | |
| `roof.kneeWalls` | `style` is `gable`, with a loft. When off, only `{ enabled: false }`. | `frameRoof` raises the roof on knee walls only with a gable loft. A gambrel takes no knee walls: its steep lower slope gives the headroom. |
| `additions[].purlin`, `purlinSpacing` | `roofing` is `metal`. | |
| `additions[].center` | `length` is not `full`. | A full-length lean-to has no center to set. |
| `additions[].drop` | `attach` is not `extension`. | `drop` lowers the ledger. An extension has no ledger. |
| `additions[].oc` | `attach` is not `extension`. | An extension puts a rafter beside each main rafter, so it takes the main spacing. |
| `additions[].deck` | `floor` is `deck`. | |
| `additions[].deck.support` | `onShed` is true. | A deck that is not on the shed's foundation stands on piers, the default. |
| `additions[].deck.join` | `onShed`, and the lean-to or its mirror is on a gable end. | Only a gable-end deck continues the shed's runs. |
| `ramps[].wall`, `along`, `at`, `width` | `opening` is null, or `rampPlace` finds it `lost`. | A ramp that follows an opening takes its place and width from it. A lost ramp stands at its own place. |
| `ramps[].opening` | `opening` is not null. | A lost ramp keeps its link, so its warning stays. |
| `ramps[].margin` | `opening` resolves to an opening. | |
| `ramps[].slope`, `material` | `kind` is `ramp`. | Stairs take the standard step. |
| `ramps[].stringer`, `oc` | `kind` is `ramp`, and `material` is `wood`. | |
| `ramps[].thickness` | `kind` is `ramp`, and `material` is `concrete`. | |
| `ramps[].from` | `leanToFloorOn` finds a lean-to deck or slab on its wall. | Whether that floor meets it, and was built, only the model knows. A file keeps `from` and `belowGrade` where it might. |
| `finishes.sidingColor` | `siding` is not `none`. | |
| `finishes.panelLength`, `metalOverhang` | The main roof or a lean-to has metal roofing. | |
| `loads.loft` | Gable or gambrel roof with a loft. | |

Each other setting stays as it is: `name`, `width`, `length`, `studHeight`, `front`, `openings`,
`catalog` with every price, and the other `walls`, `roof`, `additions`, and `finishes` fields.

### 7.2 Change prune safely

1. Reset a setting only under a condition where no generator, output, drawing, or finish reads it.
2. Add a `MESSY` case that sets the new setting away from its default where the design does not
   use it.
3. Run the prune test.
4. Change `LADDER` together with the rake threshold in `frameRoof` (`roof.rakeOverhang >= PLY`).
   `prune.ts` holds a copy of that value.

A wrong rule fails the test only for a design that uses the setting. Add test coverage before you
add a rule.

## 8. Compact files and share links

**Decision.** Saved files and links hold only what the design uses: pruned, with defaults left
out. Files stay small, and links fit in a QR code. Older, fuller files still load, because the
parse fills each absent setting and accepts each unused one. The B and B fixture
(`tests/fixtures/16x16-b-and-b-shed.json`) is such a file. Its `wallHeight` has no effect, because
its `studHeight` is a precut.

### 8.1 `compactDesign` steps

`compactDesign(config)` in `src/core/share.ts`:

1. Prune the config and serialize it: `pruned`. Parse that text into `full`, without `appVersion`.
2. `lean(full, DEFAULTS)`: drop each value equal to the value at the same path in `DEFAULTS`, the
   parsed bare design `{ schemaVersion: 1 }`. Objects recurse. An array is one value: it stays
   whole, or it goes when equal to its default. Then put `schemaVersion` back, as the first key.
3. For each list in `ITEMS`, drop each item key equal to the item default, except the `keep` keys.
4. `restore` puts back each value from `full` that loads differently without it (8.3).
5. If the result loads back to `pruned`, return it. Otherwise, return `full`: the whole pruned
   design.

`same` compares values as JSON text. Key order is stable, because every value comes from zod
output in schema order.

### 8.2 List items: `ITEMS`

`SAMPLE` is a design parsed with one minimal item in each `ITEMS` list: `openingTypes`,
`openings`, `additions`, and `ramps`. Its items give the item defaults. The `keep` keys are the
keys an item must give (1.4). They stay even when equal to the sample, for example
`kind: 'door'` or `side: 'front'`. Without them, the item fails to parse. `roof.loft.hatches` is
not in `ITEMS`: a hatch has only required keys.

### 8.3 Values whose default depends on another field

`keepWallHeight` gives `studHeight` a different value when `wallHeight` is present (1.6). So a
`studHeight` equal to its default is not always safe to drop. `restore` compares the loaded result
with `full`. It puts back each value that differs, and recurses into objects.

On `DESIGNS`, `restore` changes nothing and the fallback in 8.1 step 5 never runs. Prune writes
`wallHeight` only with `studHeight: 'custom'`, which is not a default. Both steps guard against a
future dependent default. The share test "keeps a value whose default depends on another field"
also passes without `restore`, because prune resets its `wallHeight` first. A change that removes
`restore` fails no test today.

### 8.4 Saved file

`designFileText(config)` writes `compactDesign(config)` as 2-space JSON with a final newline.
`appVersion` comes right after `schemaVersion`.

### 8.5 Link

A link is `<origin><path>#design=<data>`. `LINK_KEY` is `design=`. `designToLink(config)` makes
the link data, the text after `#design=`:

1. `JSON.stringify(compactDesign(config))`: no spaces, no `appVersion`.
2. Encode as UTF-8 with `TextEncoder`.
3. Compress with `CompressionStream('deflate-raw')`: DEFLATE with no zlib or gzip header.
4. Encode as base64url: `+` becomes `-`, `/` becomes `_`, and the `=` padding goes.

`designFromLink(data)` reverses the steps and ends in `parseConfigText`. An exception before the
parse, such as from a cut-off link, gives the damaged-link error. A link that decodes to an invalid
design gives the parse errors. `linkData(hash)` returns the text after `#design=`, or `null` for
any other fragment.

A link is a copy of the design at the time it is made. A later edit does not change it.

**Decision.** The design is in the fragment, the part after `#`. A browser does not send the
fragment to the server, so the static host never sees the design.

### 8.6 Change compact files and links safely

- Run `tests/share.test.ts` after a change to `pruneConfig`, `ITEMS`, or a default. It checks that
  each design loads back from its file and its link to the pruned design.
- Keep each link under 1000 characters. `tests/share.test.ts` checks this limit on each test
  design. A longer link needs a larger QR version, with smaller modules at the same 5 in
  ([drawings.md, "QR sheet"](drawings.md#qr-sheet)).
- Keep `LINK_KEY` and the link format as they are. Old links and printed QR codes use them.
- Add a list to `ITEMS` when its items have defaults that a file can leave out.

## 9. Autosave, saved file, and link

| | In memory | Autosave | Saved file | Link |
|---|---|---|---|---|
| Holds | The full config, inside the undo history | The full config, unused settings too | The compact form | The compact form |
| `appVersion` | No | Yes | Yes | No |
| Format | `ShedConfig` | 2-space JSON | 2-space JSON | Compact JSON, deflate-raw, base64url (8.5) |
| Where | `App` state | `localStorage` key `shed-builder.config` | A `.shed.json` file that the user keeps | The address after `#design=`, and the PDF's QR sheet |
| Writer | `edit`, `replace` (`src/ui/App.tsx`) | `serializeConfig` | `designFileText` | `designToLink` |
| Reader | Every output | `parseConfigText` | `parseConfigText` | `designFromLink` |

A stored design that does not load goes to the key `shed-builder.config.backup`. The backup holds
one design: the latest stored text that failed to load, or that the user set aside from the error
page. The flows that read and write these keys are in [ui.md, "Storage"](ui.md#storage).

**Decision.** Autosave keeps the full design, so a setting the user switches away from keeps its
value. For example, a switch from piers to a slab and back gives the old pier settings back. A
pruned autosave would reset them. The undo history also holds full configs.

A Save and Open round trip, or a link, resets each unused setting to its default. The prune
contract keeps the build output the same.
