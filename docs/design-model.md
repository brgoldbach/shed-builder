# Design model

A design is one `ShedConfig` value: the config. The zod schema `shedSchema` in `src/core/config.ts`
defines every setting, its default, and its range. This document covers how the config is
defined, stored, named, and moved between the browser, files, and links. For the overview and the
conventions, see [DEVELOPER.md](DEVELOPER.md). For the user's view, see "Design files" in
[README.md](../README.md).

| Form | Content | Writer | Reader |
|---|---|---|---|
| In memory | The full config, inside the undo history | `edit`, `replace` (`src/ui/App.tsx`) | every output |
| Autosave | The full config, with `appVersion` | `serializeConfig` | `parseConfigText` |
| Saved file | The compact form, with `appVersion` | `designFileText` | `parseConfigText` |
| Link | The compact form, deflate-raw, base64url, after `#design=` | `designToLink` | `designFromLink` |

The compact form is the pruned config (`pruneConfig`) without its default values (`compactDesign`).
Every reader ends in `parseConfig`, so all stored forms accept the same input.

**Decision.** Shed Builder is a static site with no server. A design lives in the browser's
storage, or in a file or a link that the user holds.

| Term | Meaning |
|---|---|
| RO | Rough opening: the framed hole for a door or window. |
| PT | Pressure-treated lumber. |
| o.c. | On center: the distance from the center of one member to the center of the next. Fields named `oc` hold it. |
| psf | Pounds per square foot. |
| Model side | `front`, `back`, `left`, or `right` in model coordinates. Config fields hold model sides. |
| User side | The name the user sees for a model side. It depends on `front`. |
| Eave wall | The model's front or back wall. It carries the rafters. |
| End wall | The model's left or right wall. On a gable or gambrel roof, it carries the gable-end framing. |
| Lean-to roof | A main roof with one slope: `roof.style: 'lean-to'`. |
| Gambrel roof | A main roof with two slopes on each side, a steep lower slope and a shallower upper slope: `roof.style: 'gambrel'`. |
| Break | The line on a gambrel roof where the top lines of the lower and upper slopes meet. |
| Lean-to | An open addition on posts against one side of the shed: an item of `additions`. |
| Compact form | The output of `compactDesign`: what a saved file and a link hold. |
| Link data | The text after `#design=` in a link. |

## 1. The config

### 1.1 Top-level structure

| Field | Purpose | Key fields |
|---|---|---|
| `schemaVersion` | File format. Required, literal `1`. No default. | — |
| `name` | Design name. Trimmed; an empty name fails with `Required`. Default `Untitled shed`. | — |
| `width` | Front to back, across the ridge. 48–480 in, default 120. | — |
| `length` | Left to right, along the ridge. 48–480 in, default 144. | — |
| `studHeight` | A precut stud length, or `custom`. Default 92.625. | See 1.6. |
| `wallHeight` | Floor surface to the top of the top plates, for `custom` only. 60–200 in, default 97.125. | See 1.6. |
| `front` | The side the user calls the front: `eave` or `gable`. Default `eave`. It changes names only. | See 3. |
| `foundation` | Skids, piers, or a slab. | `type`; `skid` {`size`, `count`}; `pier` {`diameter`, `depth`, `aboveGrade`, `post`, `postLength`, `girder`, `girderPlies`, `girderCount`, `maxSpacing`}; `slab` {`thickness`, `thickenedEdge`, `edgeWidth`, `edgeDepth`, `anchorSpacing`, `anchorEndDistance`} |
| `floor` | Floor framing over skids or piers. | `joist`, `oc`, `treated`, `blocking`, `subfloor` |
| `walls` | Wall framing. | `stud`, `oc`, `capPlate`, `mudSill`, `corner`, `through`, `header`, `doubleJackOver`, `sillPlies`, `sheathing` |
| `openingTypes` | Reusable openings. Placement rows refer to a type by name. | `name`, `kind`, `width`, `height`, `header`, `girder`, `plateBelow`, `plateAbove`, `jacks`, `headroom` |
| `openings` | Placement rows: one type on one wall, at one or more positions. | `enabled`, `type`, `wall`, `sill`, `along`, `at` |
| `roof` | Main roof, ties, loft, and knee walls. | `style`, `pitch`, `gambrel` {`lowerPitch`, `breakRun`, `ridgeBoard`}, `rafter`, `oc`, `eaveOverhang`, `rakeOverhang`, `tailCut`, `fascia`, `sheathing`, `roofing`, `gablePanel`, `purlin`, `purlinSpacing`, `rakeLadder`, `ridge`, `highSide`, `rafterTies`, `collarTies`, `loft`, `kneeWalls` |
| `additions` | Lean-tos, one per side. | `side`, `mirror`, `attach`, `depth`, `length`, `center`, `pitch`, `drop`, `roofing`, `post`, `beam`, `floor`, `deck` |
| `ramps` | Ramps from the floor down to grade. | `opening` and `margin`, or `wall`, `along`, `at`, `width`; `slope`, `belowGrade`, `material`, `stringer`, `oc`, `thickness` |
| `finishes` | The 3D look only. It does not change the framing, cut list, or BOM. | `siding`, `sidingColor`, `trimColor`, `roofColor`, `doorColor`, `panelLength`, `metalOverhang` |
| `loads` | Loads for the span checks, psf. | `roof` (20 is the live load with no snow; 30–70 are snow loads), `roofDead`, `loft` |
| `catalog` | Lumber and prices. | `species`, `kerf`, `maxLength`, `maxOnePiece`, `stock`, `prices` |

`config.ts` holds the range and a comment for each field. This document does not repeat them,
except for the roof fields whose meaning depends on `roof.style`:

| `roof.style` | Shape | Pitch fields |
|---|---|---|
| `gable` (default) | Two slopes that meet at a ridge. | `pitch`: both slopes. |
| `gambrel` | Two sides that meet at a ridge. Each side has a lower slope from the eave to the break, and an upper slope from the break to the ridge. | `gambrel.lowerPitch`: the lower slope, 12–36, default 20 (59.0°). `pitch`: the upper slope. `gambrel.breakRun`: `auto` (`width` / 4) or 12–240 in, horizontal from the eave wall's outside face to the break. `gambrel.ridgeBoard` (true): false butts the upper rafters at the peak, joined by gussets. |
| `lean-to` | One slope, high at `highSide`. | `pitch` |

`frameRoof` keeps the break at least 12 in from the ridge line, with a warning (framing.md). Two
helpers in `config.ts` group the styles:

| Helper | Returns |
|---|---|
| `ridged(roof)` | `true` for `gable` and `gambrel`: two sides that meet at a ridge. The ridge board, ties, loft, through end walls, and the extension rule (1.5) follow it. |
| `hasRidgeBoard(roof)` | `true` for a gable, or a gambrel with `gambrel.ridgeBoard`. The ridge board, ridge posts, `ridge`, and `rakeLadder.ridgeExtends` follow it. |
| `eavePitch(roof)` | The pitch at the eaves, per 12: `gambrel.lowerPitch` on a gambrel, else `pitch`. |

### 1.2 Value builders

`config.ts` builds most fields from a few helpers:

| Helper | Accepts | Error text |
|---|---|---|
| `len(min, max)` | A number of inches in range. | `Min 4' 0"`, `Max 40' 0"`: the limit through `formatLength`. |
| `count(min, max)` | An integer in range. | `Whole number`, `Min 2`, `Max 6` |
| `spacing` | One of `SPACINGS`: 12, 16, 19.2, 24. | zod's own text |
| `twoBy` | One of `TWO_BY`. | zod's own text |
| `auto` | The literal `auto`, in a union with a number: `jacks`, `gambrel.breakRun`, `collarTies.height`. | — |
| `money(fallback)` | 0–10,000 US dollars. | `Min 0`, `Max 10000` |
| `priceTable(defaults)` | A strict object with one `money` field for each key of `defaults`. | — |
| `color(fallback)` | `#rrggbb`, either case. | `Not a color, e.g. #a0b0c0` |

Each choice list is an exported `as const` array: `FOUNDATION_TYPES`, `WALLS`, `ROOFING`, and so on.
The UI builds its select options from these arrays. Some lists extend the catalog: `SHEATHING` is
`none` plus `SHEET_KEYS`, and `MUD_SILLS` and `FASCIA` add `TWO_BY`.

### 1.3 Defaults and `.prefault({})`

1. Each scalar field has a `.default(...)`. The exceptions are `schemaVersion`, the keys a list
   item must give, and the optional `openingTypes[].header` (1.4).
2. Each nested object uses `.prefault({})`. In zod 4, `.prefault` parses `{}` through the object
   schema, so the inner defaults apply. `.default({})` returns `{}` as is, with no inner defaults.
3. Lists default to `[]`. `catalog.stock` defaults to `{}`.

So `{ "schemaVersion": 1 }` parses to a full design. `tests/config.test.ts` checks this ("fills
every default from a bare file"). A default is part of the file format, because files and links
leave default values out (6.4).

`newAddition(side)` and `newRamp()` return a list item with every default. `AdditionsEditor` and
`RampsEditor` use them for a new item.

### 1.4 Strict objects and list items

Every object is a `z.strictObject`. An unknown key fails the parse and names its path, for example
`walls: Unrecognized key: "studlength"`. A typo in a hand-edited file thus gives an error, not a
silent loss of the value. The cost: a renamed or removed field breaks old files unless an upgrade
step maps it (6.3).

| List | Keys an item must give | Other keys |
|---|---|---|
| `openingTypes` | `name`, `kind`, `width`, `height` | defaults; `header` is optional and has no default |
| `openings` | `type`, `wall`, `at` (one position or more) | defaults |
| `additions` | `side` | defaults |
| `ramps` | none | defaults |
| `roof.loft.hatches` | `x`, `y`, `width`, `depth` | none |

An opening type without `header` uses `walls.header`. A `flat` header is the wall stud.

### 1.5 Cross-field rules

Item-level refinements:

| Item | Rule | Path and message |
|---|---|---|
| `openings[]` | With `along: 'percent'`, each value of `at` is 100 or less. | `openings.N.at: Max 100%` |
| `ramps[]` | With `along: 'percent'`, `at` is 100 or less. | `ramps.N.at: Max 100%` |

With `along` set to `left` or `right`, `at` has no maximum, because the wall length comes from
other fields. A position past the wall end is valid. `frameWalls` then leaves the opening out with
a warning. `additions[].center` is always a percent, so its own range is 0–100.

`shedSchema.superRefine` checks the whole config:

| Rule | Path and message | Reason |
|---|---|---|
| On a gambrel, `gambrel.lowerPitch` is more than `pitch`. | `roof.gambrel.lowerPitch`: `The lower pitch (L/12) must be steeper than the upper pitch (U/12)` | A `Profile` takes the lowest slope line at each point. That holds only when the lower slope is the steeper one. |
| One lean-to per side. A lean-to with `mirror` takes `side` and `OPPOSITE[side]`. | `additions.N.side`: `One lean-to per side` | Each side has one lean-to assembly, for example `addition.front` with mark prefix `AF`. |
| An extension (`attach: 'extension'`) needs a downhill eave on each side it takes. On a gable or gambrel roof (`ridged`), that is `front` or `back`. On a lean-to roof, it is the side opposite `highSide`. | `additions.N.attach`: `A roof extension needs an eave the roof slopes down to` | Extension rafters lap the main rafters at a downhill eave, in place of the main eave overhang. |
| An extension has `length: 'full'`. | `additions.N.length`: `A roof extension runs the full wall length` | It replaces the eave overhang along the whole wall. |
| Opening type names are unique. The check is case-sensitive and runs after the trim. | `openingTypes.N.name`: `Duplicate name "<name>"` | A row finds its type by name. |
| Each row's `type` names an opening type. | `openings.N.type`: `No opening type "<type>"` | Same. |

`extensionSides(additions)` returns the model sides whose eave an extension takes over.
`frameRoof` uses it.

Nothing checks `ramps[].opening` against `openings`. `count(0, 999)` limits `row` and `index`
only. A ramp whose opening is gone stays valid: `frameRamps` warns `The opening it follows is gone.
It stands at its own position.`

**Decision.** The app never limits the user. The schema rejects a value outside its type or range,
and the combinations in the tables above. Every other design builds. A generator warns and goes on,
and leaves out a part whose framing would collide ("Left out" in DEVELOPER.md).

### 1.6 Stud height and wall height

| `studHeight` | Wall top: floor surface to the top of the top plates | Stud length |
|---|---|---|
| 92.625, 104.625, or 116.625 (`PRECUT_STUDS`) | stud length + plate stack | the precut |
| `custom` | `wallHeight` | `wallHeight` − plate stack |

The plate stack (`plateStack` in `src/core/gen/walls.ts`) is 1.5 in for each ply. It holds the
bottom plate, the top plate, and the cap plate when `walls.capPlate` is true. On a slab, a mud sill
adds a ply unless `walls.mudSill` is `none`. The defaults give 3 plies, 4.5 in. The 92.625 in
precut then gives a 97.125 in wall top, which is the `wallHeight` default.

`studLengths` adds the roof rise to the high wall of a lean-to roof: (`pitch` / 12) × (`width` −
wall depth).

| Rule | Where |
|---|---|
| `wallHeight` has an effect only with `custom`. `pruneConfig` resets it otherwise, so a compact file holds it only with `custom`. | `studLengths`, `pruneConfig` |
| A switch to `custom` in the form sets `wallHeight` to the current wall top (`wallTops(value).left`), so the walls do not move. | `DesignForm.tsx` |
| A file with `wallHeight` and no `studHeight` loads as `custom`. Files saved before stud heights existed had only `wallHeight`. | `keepWallHeight` (6.1) |
| Because of `keepWallHeight`, a compact file must hold `studHeight` whenever it holds `wallHeight`. | `restore` in `compactDesign` (8.3) |

The B and B fixture holds `studHeight: 92.625` with `wallHeight: 109.125`. That `wallHeight` has
no effect.

### 1.7 Validation paths

| Path | Callers | Steps | Errors |
|---|---|---|---|
| `parseConfigText(text)` → `parseConfig(raw)` | Autosave restore, Open, open from a link, `compactDesign` | `JSON.parse`, `withoutAppVersion`, `keepWallHeight`, `shedSchema.safeParse` | A list, one per issue: `<path>: <message>`, or `file: <message>` for the root. `Not valid JSON` for bad JSON. |
| `edit(next)` in `App.tsx` | Every form edit | `shedSchema.safeParse` | The first issue's message. The field shows it. |
| `shedSchema.parse` | `PRESETS`, `DESIGNS`, `pruneConfig` | Parse, or throw | An exception |

`ParsedInput` (`src/ui/fields.tsx`) commits on blur or Enter. A rejected value stays in the box, and
its error shows after the input.

Presets and test fixtures go through `shedSchema.parse`, not `parseConfig`. Upgrade steps do not
apply to them, so they must use the current shape.

### 1.8 Change the config safely

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
| Color | `#rrggbb` | `finishes.roofColor` |

Model axes: x runs along `length`, left to right. y runs along `width`, front to back. z is up from
the floor surface: the subfloor top, or the slab top. Coordinates use model sides (3).

`src/core/units.ts` converts lengths to and from text:

| Function | Output | Examples from `tests/units.test.ts` |
|---|---|---|
| `formatLength(inches)` | Feet and inches, to the nearest 1/16 in | 126 → `10' 6"`; 92.625 → `7' 8-5/8"`; 24.5 → `2' 0-1/2"`; 0.5 → `1/2"`; 11.99 → `1' 0"`; −6.25 → `-6-1/4"` |
| `formatInches(inches)` | Inches only, to the nearest 1/16 in | 92.625 → `92-5/8"`; 0.0625 → `1/16"`; 144 → `144"` |
| `formatMoney(dollars)` | US dollars to the cent | `$1,234.50` |
| `parseLength(text)` | Inches, or `null` when the text is not a length | See the steps below. |

`format` steps, for both format functions:

1. Round the absolute value × 16 to an integer: the count of sixteenths.
2. For `formatLength` only, take the feet: sixteenths / 192, rounded down.
3. Split the rest into whole inches and sixteenths.
4. Halve the numerator and the denominator while the numerator is even.
5. After feet, write whole inches before a fraction: `2' 0-1/2"`, not `2' 1/2"`.
6. Put `-` before a negative value.

`parseLength` steps:

1. Trim the text. Change `ft`, `feet`, and `foot` to `'`. Change `in`, `inch`, and `inches` to `"`.
2. If the text has a `'`, read the text before it as decimal feet. Drop one `-` after the `'`.
3. Drop a final `"`.
4. Read the rest as inches: `92`, `92.625`, `92 5/8`, `92-5/8`, or `5/8`. No rest after feet is 0 in.
5. Return `null` for a zero denominator, or for text that does not match.

| Accepted | Rejected (`null`) |
|---|---|
| `10'`, `10' 6"`, `10'-6"`, `10'6`, `1.5'`, `126`, `92.625`, `92 5/8`, `92-5/8"`, `7' 8-5/8"`, `5/8`, ` 48" `, `8 ft`, `10 ft 6 in`, `92 5/8 in` | empty, `abc`, `5/0`, `'`, `10 m`, `-6`, `10' x`, `6" 2"` |

A bare number is inches. A negative length is rejected; every `len` field has a minimum of 0 or
more.

Where the 1/16 in rule applies:

| Place | Rule |
|---|---|
| `formatLength`, `formatInches` | Display only. The stored value does not change. |
| `parseLength` | It does not round: `92.6` stays 92.6. |
| `buildCutList`, `lumberGroups` (`src/core/out/bom.ts`) | Piece lengths round to 1/16 in. The cut list then groups them, and the BOM packs them. |
| `OpeningRow` (`src/ui/OpeningsEditor.tsx`) | A converted position rounds to 1/16 in, or to 0.1 for a percent. |

`tests/units.test.ts` checks that `parseLength` reads back every 1/16 in from 0 to 20 ft as both
format functions write it.

Change units safely:

- Store lengths unrounded. Round only for display, in the cut list, and in the BOM.
- Use `len(min, max)` for a new length field, so its messages show feet and inches.
- Keep the round-trip test in `tests/units.test.ts` green after a change to `parseLength` or `format`.

## 3. Sides and naming

**Decision.** The model's front and back are always the eave walls. Left and right are the end
walls. `front: 'gable'` only renames the sides. Generators read `front` only through `naming`, for
text, so the geometry is the same for both values. Config fields such as `openings[].wall`,
`additions[].side`, and `ramps[].wall` hold model sides.

`front` has an effect in three places only:

| Place | Effect |
|---|---|
| `naming(config)` (`src/core/naming.ts`) | Labels, mark prefixes, side order, cut-list order. |
| `planView` (`src/drawings/sheets.ts`) | Plans put the user's front at the bottom. |
| `FramingScene.setFront` (`src/view3d/scene.ts`) | The 3D camera views from the user's front. |

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
| `sides` | The model sides in the user's order: their front, back, left, right. `eave`: `front`, `back`, `left`, `right`. `gable`: `left`, `right`, `back`, `front`. |
| `assembly(assembly)` | `{ label, prefix }`. An assembly without a side, such as `roof`, takes both from `ASSEMBLIES` (`src/core/member.ts`). An assembly with a side takes them from `KIND_WORDS` and the user side. |
| `rank(assembly)` | Sort key: index in `KIND_ORDER` × 10 + index of the user side in `SIDE_ORDER`. |

`KIND_ORDER` is `foundation`, `floor`, `wall`, `gable`, `roof`, `loft`, `knee`, `addition`, `ramp`.

`KIND_WORDS` builds each sided label and prefix from the user side's first letter:

| Assembly kind | Label | Prefix | `gable` example |
|---|---|---|---|
| `wall` | `<Side> wall` | `<S>W` | `wall.left` → `Front wall`, `FW` |
| `gable` | `<Side> gable end` | `G<S>` | `gable.left` → `Front gable end`, `GF` |
| `knee` | `<Side> knee wall` | `K<S>` | `knee.back` → `Left knee wall`, `KL` |
| `addition` | `<Side> lean-to` | `A<S>` | `addition.front` → `Right lean-to`, `AR` |

Assemblies without a side keep their `ASSEMBLIES` entry: `Foundation` `FD`, `Floor` `FL`, `Roof`
`RF`, `Loft` `LF`, `Ramps` `RP`.

### 3.3 Cut-list order and marks

`buildCutList(members, names)` (`src/core/out/cutlist.ts`):

1. Group members with the same assembly, role, size, treatment, length to 1/16 in, and note.
2. Sort the lines by `names.rank(assembly)`, then by the role's order in `ROLES`, then by length,
   longest first.
3. Number the lines in each assembly from 1. The mark is `<prefix>-<number>`, for example `FW-1`.

With `gable`, the 8x10 preset's door wall is the model's left wall. It becomes the front wall, the
first wall in the list, with mark `FW-1` (`tests/naming.test.ts`).

Other users of the user's names:

- `buildDrawings` puts the wall and upper elevations in `names.sides` order.
- Warnings and notes name an opening by its user side (`openingLabel`, 4.1).
- The editors show user names. The openings and ramp editors list walls in `names.sides` order.
  The lean-to editor lists them in `WALLS` order.
- A new lean-to takes the first free side in `names.sides` order.

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
| `wall` | Model side. |
| `sill` | Floor surface to the RO bottom. On an end wall, a sill at or above the wall top puts the opening in the gable. |
| `along` | `percent`: each value in `at` is the RO center, as a percent of the wall span. `left` or `right`: each value is the distance from that outside corner, viewed from outside, to the near RO edge. |
| `at` | One or more positions in `along` units. |
| `enabled` | `false` keeps the row and its type but frames nothing. |

A ramp places itself the same way with `wall`, `along`, `at`, and `width`, to its center or near
edge. A ramp that follows an opening takes that opening's RO instead (`rampPlace` in
`src/core/gen/ramps.ts`).

### 4.1 Functions

`src/core/placement.ts`:

| Function | Result |
|---|---|
| `wallSpan(config, wall)` | Corner to corner, outside faces of the framing: `length` for `front` and `back`, `width` for `left` and `right`. |
| `roOffset(along, value, span, width)` | The wall's left corner, viewed from outside, to the RO left edge. |
| `positionFor(along, offset, span, width)` | The inverse of `roOffset`: the position that puts the RO left edge at `offset`. |
| `evenPercents(count)` | RO centers in percent for `count` openings: each at the center of an equal share. |
| `positionText(along, value)` | `50%`, or `24" from left`. |
| `openingLabel(names, row, position)` | `<type> (<user side> <position text>)`, for example `window 24x36 (front 50%)`. |

| `along` | `roOffset` | `positionFor` |
|---|---|---|
| `left` | `value` | `offset` |
| `right` | `span − value − width` | `span − offset − width` |
| `percent` | `span × value / 100 − width / 2` | `(offset + width / 2) / span × 100` |

`evenPercents(count)` gives `(2i + 1) / (2 × count) × 100` for `i` from 0: one opening at 50; two at
25 and 75; three at about 16.67, 50, and 83.33.

"Viewed from outside" sets the direction along each wall. The left corner of the front wall is at
x = 0. The left corner of the back wall is at x = `length`. `wallFrames` in
`src/core/gen/walls.ts` puts u = 0 at that corner for each wall.

### 4.2 Callers

| Caller | Use |
|---|---|
| `frameWalls` (`fitOpening`, `leftOut`) | RO left edge on an eave or end wall. |
| `frameRoof` (`fitGableOpening`) | RO left edge in a gable, over the end wall's span (`width`). |
| `rampPlace` | Ramp edges, from its opening or from its own position. |
| `OpeningRow` (`src/ui/OpeningsEditor.tsx`) | `changeAlong`: a new `along` converts each position, so each opening stays where it is. `spread`: a new count replaces the positions with `evenPercents`, converted to the row's `along`. |
| `RampsEditor` | `openingLabel` names each opening that a ramp can follow. |

`OpeningRow` rounds each converted position to 0.1 for a percent and to 1/16 in for a length.

### 4.3 Edge cases

| Case | Result |
|---|---|
| A position puts the king studs and jacks past the wall end. | Left out, with `The framing runs past the wall end.` |
| Two openings overlap, or an opening overlaps a corner. | Left out, with `The framing overlaps a corner or another opening.` |
| A row has `enabled: false`. | No framing. The row still counts as a use of its type (7). |
| An opening row is removed in the form. | `withoutOpeningRow` places each ramp that followed it on its own, at the same place. A ramp that follows a later row moves to the new row index. |
| A ramp follows an index past the row's `at` list. | `rampPlace` returns `lost: true`. The ramp stands at its own `wall`, `along`, `at`, and `width`, with a warning. |

### 4.4 Change placement safely

- Keep `roOffset` and `positionFor` exact inverses. The form converts with both.
- Name an opening in text only through `openingLabel`, so warnings, notes, and editors agree.

## 5. Lumber catalog

`src/core/catalog.ts` holds the fixed lumber data. `catalog` in the config holds the user's choices.

### 5.1 Sizes and stock lengths

Dry dressed sizes from the American Softwood Lumber Standard (DOC PS 20):

| Size | Thickness × width, in | In `TWO_BY` | Default stock (`DEFAULT_STOCK`), in |
|---|---|---|---|
| `1x4` | 0.75 × 3.5 | no | 96, 120, 144, 192 |
| `2x4` | 1.5 × 3.5 | yes | 92.625, 104.625, 116.625, then 96–240 by 24 |
| `2x6` | 1.5 × 5.5 | yes | 92.625, 104.625, 116.625, then 96–240 by 24 |
| `2x8` | 1.5 × 7.25 | yes | 96–240 by 24 |
| `2x10` | 1.5 × 9.25 | yes | 96–240 by 24 |
| `2x12` | 1.5 × 11.25 | yes | 96–240 by 24 |
| `4x4` | 3.5 × 3.5 | no | 96–240 by 24 |
| `4x6` | 3.5 × 5.5 | no | 96–240 by 24 |
| `6x6` | 5.5 × 5.5 | no | 96–240 by 24 |

`PRECUT_STUDS` (92.625, 104.625, 116.625) are the precut studs for 8, 9, and 10 ft walls with a
bottom plate and a double top plate. They are also the `studHeight` choices.

| Function | Result |
|---|---|
| `stockLengths(overrides, size)` | `catalog.stock[size]` when the user set it, else `DEFAULT_STOCK[size]`. |
| `stockFor(catalog, size, max = catalog.maxLength)` | The stock lengths no longer than `max`. When none is, the shortest stock length. |

`catalog.stock` is a partial record: a size absent from it uses the default list. Each list holds at
least one length from 12 to 480 in. In the form, a cleared field deletes the size's entry.

### 5.2 `maxLength` and `maxOnePiece`

| Setting | Default | Range | Meaning |
|---|---|---|---|
| `kerf` | 0.125 | 0–0.25 | Saw kerf. The BOM packs `kerf` between pieces on a board and on a sheet. |
| `maxLength` | 192 (16 ft) | 96–480 | The longest board to buy. Plates, rims, ridges, fascia, and girders splice at this length. |
| `maxOnePiece` | 240 (20 ft) | 96–480 | The longest board for a longer piece that cannot splice: a rafter, a tie, or a joist. |

How each one acts:

1. Generators take the splice limit as `Math.max(...stockFor(catalog, size))`: the longest stock
   length no longer than `maxLength`. `splitPlate` splits a run at stud centers within that limit.
2. `lumberGroups` in the BOM packs pieces onto `stockFor(catalog, size)`, the general stock.
3. Only a piece longer than all general stock opens a board from the one-piece stock:
   `stockFor(catalog, size, Math.max(maxLength, maxOnePiece))`.
4. A piece longer than the longest one-piece stock goes to `tooLong`. The BOM does not price it,
   and `buildBom` warns about it.

A `maxOnePiece` below `maxLength` has no effect, because step 3 takes the larger of the two.

### 5.3 Sheets

`SHEET_KEYS` are 48 × 96 in panels. `thick` is the actual thickness. The label adds the name yards
sell it under.

| Key | Label | `thick`, in |
|---|---|---|
| `osb-7/16` | 7/16" OSB | 7/16 |
| `ply-15/32` | 15/32" plywood (1/2") | 15/32 |
| `ply-19/32` | 19/32" plywood (5/8") | 19/32 |
| `tg-23/32` | 23/32" T&G (3/4") | 23/32 |

### 5.4 Species for the span checks

`catalog.species` selects No. 2 grade reference design values for normal load duration and dry
service. Fb is the bending value, Fv the shear value, and E the modulus of elasticity, all in psi.
The source is the NDS 2018 Supplement: Table 4A for DFL, HF, and SPF, and Table 4B for SP.

| Key | Label | Fb | Fv | E |
|---|---|---|---|---|
| `spf` (default) | Spruce-Pine-Fir No. 2 | 875 | 135 | 1,400,000 |
| `dfl` | Douglas Fir-Larch No. 2 | 900 | 180 | 1,600,000 |
| `hf` | Hem-Fir No. 2 | 850 | 150 | 1,300,000 |
| `sp` | Southern Pine No. 2 | by nominal width: 4 → 1100, 6 → 1000, 8 → 925, 10 → 800, 12 → 750 | 175 | 1,400,000 |

`bendingValue(species, size)` returns Fb with its size factor CF. SP values already include it.
For the other species, CF by nominal width is 4 → 1.5, 6 → 1.3, 8 → 1.2, 10 → 1.1, 12 → 1.0. Lumber
4 in thick uses its own column: 4 → 1.5, 6 → 1.3, 8 → 1.3, 10 → 1.2, 12 → 1.1. The function returns
`null` for `1x4` and `6x6`, which have no dimension lumber values.

### 5.5 Default prices

`DEFAULT_PRICES` holds US home-center retail prices as searched in November 2026, in US dollars,
before tax and delivery. The user checks them against a local yard.

| Group | Unit | Defaults |
|---|---|---|
| `lumber` | per linear foot, untreated | `1x4` 0.45, `2x4` 0.45, `2x6` 0.75, `2x8` 1.05, `2x10` 1.50, `2x12` 2.00, `4x4` 1.40, `4x6` 2.10, `6x6` 3.50, `5/4x6` 0.40 |
| `treatedMarkup` | percent added for PT lumber | 50 (range 0–500) |
| `sheets` | each | `osb-7/16` 16.50, `ply-15/32` 28, `ply-19/32` 35, `tg-23/32` 34 |
| `concrete` | `bag` each (80 lb), `readyMix` per cu yd delivered, `formTube` each | 6, 165, 16 |
| `hardware` | each | `anchorBolt` 2.50, `hurricaneTie` 0.75, `postBase` 9, `postCap` 9, `joistHanger` 1.60, `doubleHanger` 3, `lag` 1.25 |
| `roofing` | `shingles` and `metal` per sq ft, `dripEdge` per ft | 1.50, 1.75, 1.50 |

`priceTable` builds each price group of the schema from these tables. Each key has its own
default, so a file can give only some prices. Each group is a strict object, so an unknown price
key fails.

### 5.6 Change the catalog safely

- A new counted item: follow "Add a counted BOM item" in DEVELOPER.md. The schema field comes from
  `DEFAULT_PRICES` without other changes.
- A changed default price or stock list changes every compact file that relied on it (6.4).
- A new lumber size goes in `LUMBER_SIZES`, `LUMBER`, `DEFAULT_STOCK`, and `DEFAULT_PRICES.lumber`.
  `5/4x6` decking is in `LUMBER_SIZES` for the cut list, BOM, and prices; `FRAMING_SIZES` leaves it
  out of the header and girder choices. `DECK_BOARDS` lists the deck board choices. Its price,
  $0.40/ft untreated or $0.60/ft treated, comes from $6.68 (Home Depot) and $7.25 (Northside Material
  Brokers) for a 12 ft PT board, November 2026.
  Each table is a `Record<LumberSize, …>`, so the type check fails until each table has the size.
- `bendingValue` reads thickness and width from the size name, for example `2x8`. A new size name
  must keep the `<thickness>x<width>` form.

## 6. Files and versions

### 6.1 Parse steps

`parseConfig(raw)`:

1. `withoutAppVersion`: drop `appVersion` from an object. The strict schema would reject it, and
   the design does not keep it.
2. `keepWallHeight`: for an object with `wallHeight` and no `studHeight`, add
   `studHeight: 'custom'`.
3. `shedSchema.safeParse`.
4. Return `{ ok: true, config }`, or `{ ok: false, errors }` with one string for each issue.

Each step accepts any value and returns non-objects as they are.

### 6.2 `schemaVersion` and `appVersion`

| Field | Rule |
|---|---|
| `schemaVersion` | `z.literal(1)`, required. A file without it, or with another value, fails (`tests/config.test.ts`, "rejects another schema version"). An older app thus rejects a file from a newer schema. The number stays 1 until an old file needs an upgrade step to load. A new field with a default does not change it. |
| `appVersion` | `APP_VERSION`, the `version` in `package.json` (now 0.5.0). `serializeConfig` and `designFileText` write it right after `schemaVersion`. It is for people who read the file. No logic reads a file's `appVersion`: `parseConfig` drops it, and links do not hold it. |

`keepWallHeight` shows the current practice: the step finds the old shape by its content, so
`schemaVersion` stays 1. A version change also needs `schemaVersion` to accept the old number, and
a step that upgrades the old shape.

### 6.3 Remove or rename a field

Strict objects reject an unknown key, so an old file with the old key fails to load. This applies
to autosave too: `restore` in `App.tsx` then falls back to the first preset.

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
finishes, warnings, and span checks.

`tests/prune.test.ts` checks the contract:

1. Prune each design, write it with `serializeConfig`, and load it with `parseConfigText`.
2. Build the loaded design and the original: warnings, cut list, BOM, drawings, finishes, and span
   checks, as one JSON string.
3. Expect equal strings.

The designs are `DESIGNS` (11) and `MESSY` (7). Each `MESSY` design sets unused settings away from
their defaults:

- A slab garage with skid, pier, floor, loft, and metal settings.
- A lean-to roof with gable, loft, and slab settings.
- A gable loft with rafter tie settings and a closed loft end.
- Skids with one lean-to on piers and one on a slab.
- A gambrel loft with knee wall settings.
- A gable with gambrel settings.
- A gambrel without a ridge board, with ridge settings.

Three more tests check one rule each:

- A slab resets the skid, pier, floor, and loft settings and drops the unplaced type.
- Lean-to piers keep `diameter`, `depth`, and `aboveGrade` while `girder` goes back to `2x8`.
- Only a gambrel keeps `roof.gambrel`. A gambrel resets `roof.kneeWalls`.

### 7.1 Steps

1. Compute the flags: `gable` (`ridged(roof)`: gable or gambrel), `loft` (`gable` and
   `loft.enabled`), `anyMetal`, `sheathed`,
   `leanToPiers`, `leanToSlab`, and `placed` (the type names that rows use).
2. Build `raw`. Keep each field whose rule holds. `omit` the rest.
3. Return `shedSchema.parse(raw)`. The parse puts each omitted field back at its default.

The input must be a valid config. `shedSchema.parse` throws otherwise.

### 7.2 Rules

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
| `roof.loft` | Gable or gambrel roof with `loft.enabled`. | |
| `roof.loft.open.length` | Also `open.end` is not `none`. | |
| `roof.kneeWalls` | `style` is `gable`, with a loft. When off, only `{ enabled: false }`. | `frameRoof` raises the roof on knee walls only with a gable loft. A gambrel takes no knee walls: its steep lower slope gives the headroom. |
| `additions[].purlin`, `purlinSpacing` | `roofing` is `metal`. | |
| `additions[].center` | `length` is not `full`. | A full-length lean-to has no center to set. |
| `additions[].drop` | `attach` is not `extension`. | `drop` lowers the ledger. An extension has no ledger. |
| `additions[].deck` | `floor` is `deck`. | |
| `additions[].deck.support` | `onShed` is true. | A deck that is not on the shed's foundation stands on piers, the default. |
| `additions[].deck.join` | `onShed`, and the lean-to or its mirror is on a gable end. | Only a gable-end deck continues the shed's runs. |
| `ramps[].wall`, `along`, `at`, `width` | `opening` is null, or `rampPlace` finds it `lost`. | A ramp that follows an opening takes its place and width from it. A lost ramp stands at its own place. |
| `ramps[].opening` | `opening` is not null. | A lost ramp keeps its link, so its warning stays. |
| `ramps[].margin` | `opening` resolves to an opening. | |
| `ramps[].stringer`, `oc` | `material` is `wood`. | |
| `ramps[].thickness` | `material` is `concrete`. | |
| `finishes.sidingColor` | `siding` is not `none`. | |
| `finishes.panelLength`, `metalOverhang` | The main roof or a lean-to has metal roofing. | |
| `loads.loft` | Gable or gambrel roof with a loft. | |

Each other setting stays as it is: `name`, `width`, `length`, `studHeight`, `front`, `openings`,
`catalog` with every price, and the other `walls`, `roof`, `additions`, and `finishes` fields.

### 7.3 Edge cases

| Case | Result |
|---|---|
| Each unused setting is at its default, and each type is placed. | Prune returns an equal config. |
| A ramp follows an opening that is gone (`lost` in 4.3) | Prune keeps its `wall`, `along`, `at`, `width`, and link, so it stands in the same place after Save or a link. `tests/ramps.test.ts` checks this. |
| Disabled opening rows | Kept, with their types. |

### 7.4 Change prune safely

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
parse fills each absent setting and accepts each unused one. The B and B fixture is such a file.

### 8.1 `compactDesign` steps

`compactDesign(config)` in `src/core/share.ts`:

1. Prune the config and serialize it: `pruned`. Parse that text into `full` and delete
   `appVersion`.
2. `lean(full, DEFAULTS)`: drop each value equal to the value at the same path in `DEFAULTS`.
   Objects recurse. An array is one value: it stays whole, or it goes when equal to its default.
3. Put `schemaVersion` first.
4. For each list in `ITEMS`, drop each item key equal to the item default, except the `keep` keys.
5. Parse the result. Where the parsed result differs from `full`, `restore` puts the value from
   `full` back (8.3).
6. Parse again. If it serializes equal to `pruned`, return it. Otherwise, return `full`: the whole
   pruned design.

`same` compares values as JSON text. Key order is stable, because every value comes from zod
output in schema order.

`DEFAULTS` is the bare design `{ schemaVersion: 1 }`, parsed and serialized at module load.

### 8.2 List items: `ITEMS`

`SAMPLE` is a design parsed with one minimal item in each `ITEMS` list. Its items give the item
defaults.

| List | Sample item | `keep` |
|---|---|---|
| `openingTypes` | `{ name: 'item', kind: 'door', width: 36, height: 80 }` | `name`, `kind`, `width`, `height` |
| `openings` | `{ type: 'item', wall: 'front', at: [50] }` | `type`, `wall`, `at` |
| `additions` | `{ side: 'front' }` | `side` |
| `ramps` | `{}` | none |

The `keep` keys are the keys an item must give (1.4). They stay even when equal to the sample, for
example `kind: 'door'` or `side: 'front'`. Without them, the item fails to parse.

`roof.loft.hatches` is not in `ITEMS`: a hatch has only required keys.

### 8.3 Values whose default depends on another field

`keepWallHeight` gives `studHeight` a different value when `wallHeight` is present (1.6). So a
`studHeight` equal to its default is not always safe to drop. `restore` compares the parsed result
with `full`. It puts back each value that differs, and recurses into objects.

On the 11 test designs, `restore` changes nothing and the fallback in step 6 never runs. Prune
writes `wallHeight` only with `studHeight: 'custom'`, which is not a default. Both steps guard
against a future dependent default.

The share test "keeps a value whose default depends on another field" also passes without
`restore`. Prune resets its `wallHeight` first, so its compact form is `{ "schemaVersion": 1 }`.
A change that removes `restore` fails no test today.

### 8.4 Saved file

`designFileText(config)` writes `compactDesign(config)` as 2-space JSON with a final newline.
`appVersion` comes right after `schemaVersion`. The 8x10 preset's saved file holds this content.
The real file puts each key on its own line.

```json
{
  "schemaVersion": 1,
  "appVersion": "0.5.0",
  "name": "8x10 gable on skids",
  "width": 96,
  "length": 120,
  "openingTypes": [
    { "name": "shed door 64x76", "kind": "door", "width": 64, "height": 76 },
    { "name": "window 24x36", "kind": "window", "width": 24, "height": 36 }
  ],
  "openings": [
    { "type": "shed door 64x76", "wall": "left", "at": [50] },
    { "type": "window 24x36", "wall": "front", "sill": 46.25, "along": "left", "at": [48] }
  ],
  "roof": { "rafter": "2x4", "ridge": "2x6" }
}
```

The preset's `foundation`, `roof.pitch`, and `roof.oc` are absent because they equal the
defaults.

### 8.5 Link

`designToLink(config)`:

1. `JSON.stringify(compactDesign(config))`: no spaces, no `appVersion`.
2. Encode as UTF-8 with `TextEncoder`.
3. Compress with `CompressionStream('deflate-raw')`: DEFLATE with no zlib or gzip header.
4. Encode as base64url: `+` becomes `-`, `/` becomes `_`, and the `=` padding goes.

`App.tsx` builds the link as `<origin><path>#design=<data>`. `LINK_KEY` is `design=`.

`designFromLink(data)` reverses the steps and ends in `parseConfigText`. An exception in a step,
such as a cut-off link, gives `The link is damaged or incomplete. Ask for the link again.` A link
that decodes to an invalid design gives the parse errors.

`linkData(hash)` returns the text after `#design=`, or `null` for any other fragment.

A link is a copy of the design at the time it is made. A later edit does not change it.

**Decision.** The design is in the fragment, the part after `#`. A browser does not send the
fragment to the server, so the static host never sees the design.

### 8.6 Size

| Measure | Limit or value |
|---|---|
| Test limit, bare design (`tests/share.test.ts`) | Link data under 40 characters |
| Test limit, each test design | Link data under 1000 characters |
| Measured, bare design | Link data 28 characters |
| Measured, the 11 test designs | Link data 296–802 characters; saved file 671–2,399 bytes; autosave text 3,844–6,742 bytes |

The measured values are from the working tree at version 0.6.0 with the unreleased changes. They
change with the designs and the defaults.

### 8.7 QR sheet in the PDF

`plansPdf(drawings, designName, paper, link)` in `src/ui/pdf.ts` adds a last sheet when `link` is
not null. `App.tsx` passes `shareLink` through `FramingView` to `downloadPlans`.

| Item | Value |
|---|---|
| Content | The full link, origin included, as one QR code. |
| Encoder | `qrcode-generator`: type number 0 (the smallest version that fits), error correction level L, byte mode. Level L keeps a long link to the fewest modules. |
| Size | `CODE` = 360 pt (5 in), limited by the room above the title block and by the sheet width. On letter and tabloid landscape, the room is larger, so the code prints at 5 in. |
| Quiet zone | 4 modules on each side, inside the 5 in square. A module is 360 / (modules + 8) pt. A 105-module code gives 3.19 pt, about 1.1 mm. |
| Caption | `Scan with a phone camera to open "<name>" in Shed Builder.` and `The code holds the whole design, as it was when these plans were made.` |
| Title block | `Open this design`. The sheet counts in `Sheet N of M`. |

**Decision.** The QR code goes on its own last sheet, up to 5 in across. A code in the title block
was too dense to scan. The drawing sheets do not change.

### 8.8 Change compact files and links safely

- Run `tests/share.test.ts` after a change to `pruneConfig`, `ITEMS`, or a default. It checks that
  each design loads back from its file and its link to the pruned design.
- Keep each link under 1000 characters. A longer link needs a larger QR version, with smaller
  modules at the same 5 in.
- Keep `LINK_KEY` and the link format as they are. Old links and printed QR codes use them.
- Add a list to `ITEMS` when its items have defaults that a file can leave out.

## 9. Autosave, saved file, and link

| | Autosave | Saved file | Link |
|---|---|---|---|
| Holds | The full config, unused settings too | The compact form | The compact form |
| `appVersion` | Yes | Yes | No |
| Format | 2-space JSON | 2-space JSON | Compact JSON, deflate-raw, base64url |
| Where | `localStorage` key `shed-builder.config` | `<slug>.shed.json`, where the user keeps it | The address after `#design=`, and the PDF's QR sheet |
| Written | After each change, and once at page load | On Save | After each change, into `shareLink`. Copy link copies it. |
| Read | At page load | On Open, or a file dropped on the app | At page load, and on `hashchange` |
| Load error | Silent: the first preset loads | Banner `Cannot load <file name>`, with each error | Banner `Cannot load the shared link`, with each error |
| Asks first | No | No | Yes, when the browser had an autosave at page load |

**Decision.** Autosave keeps the full design, so a setting you switch away from keeps its value.
For example, a switch from piers to a slab and back gives the old pier settings back. A pruned
autosave would reset them. The undo history also holds full configs.

A Save and Open round trip, or a link, resets each unused setting to its default. The prune
contract keeps the build output the same.

### 9.1 Flows in `App.tsx`

Autosave:

1. At start, `restore()` reads `shed-builder.config` and parses it with `parseConfigText`.
2. No text, a parse failure, or blocked storage gives `PRESETS[0]`.
3. An effect on `config` writes `serializeConfig(config)`. It also runs once at page load.
4. When storage is blocked, the read returns `null` and the write fails without a message. Autosave
   is then off.

An autosave that fails to parse is lost: the effect in step 3 writes the first preset over it at
page load, with no message.

Save: `download(fileName(config.name, 'shed.json'), designFileText(config))`. `fileName` makes the
name lower case. It changes each run of characters other than `a`–`z` and `0`–`9` to `-`, and
trims `-` at both ends. An empty result becomes `shed`. So `8x10 gable on skids` saves as
`8x10-gable-on-skids.shed.json`. The same slug names the `.plans.pdf`, `.cutlist.csv`, and
`.bom.csv` downloads.

Open:

1. The user clicks Open… and picks a file (`.json` or `application/json`), or drops a file on the app.
2. `open(file)` parses the text with `parseConfigText`.
3. On success, `replace(config)`. On failure, a banner shows `Cannot load <file name>` and each error.
4. The file input clears its value, so the same file can open again.

New from preset: the user picks a preset. After `confirm('Replace the current design with
"<name>"?')`, `replace(preset)` runs.

`replace(next)`:

1. Records an undo step, unless `next` equals the present design as JSON.
2. Increments `revision`. This remounts `DesignForm`, so no field keeps a draft from the old design.
3. Clears the load banner.

A load is an undo step, so Undo brings back the design from before the load.

Copy link:

1. An effect on `config` runs `designToLink(config)` and sets `shareLink`. A `current` flag drops a
   result from an older config.
2. The Copy link button stays disabled until the first link exists.
3. A click writes the link with `navigator.clipboard.writeText`. The button shows `Link copied` for
   2 s.
4. Without clipboard access, `window.prompt('Copy this link:', link)` shows the link to copy by hand.

Open from a link:

1. `openLink` runs at page load and on each `hashchange`.
2. `linkData(window.location.hash)` returns `null` for an address without a design, and the flow
   stops.
3. `history.replaceState` removes the fragment and keeps the path and query. A reload then loads
   the autosave and does not ask again.
4. `designFromLink(data)`. On failure, a banner shows `Cannot load the shared link`.
5. If the browser had an autosave at page load (`hadDesign`), `confirm` asks: `Open the shared
   design "<name>"? It replaces the design in this browser. Save yours first to keep it.` On
   Cancel, the flow stops.
6. The design loads as an undo step. The form remounts, and the banner clears.

| Edge case | Result |
|---|---|
| The user cancels the question. | The fragment is already gone. The user pastes the link again to retry. |
| The browser had no autosave at page load. | The link loads without a question. This also applies to a link pasted later in the same page. Undo brings the old design back. |
| `shareLink` is not ready yet. | Copy link is disabled, and the PDF has no QR sheet. |

## 10. Presets and test fixtures

### 10.1 Presets

`presets/*.json` are sparse files that a person writes: no `appVersion`, defaults mostly left out.
`src/core/presets.ts` imports them and parses each with `shedSchema.parse` at module load. An
invalid preset throws there, so the app does not start, and every test that imports `PRESETS`
fails.

| Index | File | `name` | Size, width × length | Foundation | Roof | Openings |
|---|---|---|---|---|---|---|
| 0 | `8x10-gable-skid.json` | 8x10 gable on skids | 96 × 120 | 3 skids, 4x6 | Gable 6/12, 2x4 rafters 24 in o.c., 2x6 ridge | 64x76 door on the left wall; 24x36 window on the front |
| 1 | `10x12-lean-to-pier.json` | 10x12 lean-to on piers | 120 × 144 | Piers, 3 girders of 2-ply 2x8 | Lean-to 3/12, 2x8 rafters 16 in o.c., high side front | Door on the front; window on the left |
| 2 | `12x20-garage-slab.json` | 12x20 garage on slab | 144 × 240, 104.625 in studs | Slab | Gable 6/12, 2x6 rafters 16 in o.c., 2x8 ridge | 9x7 overhead door with a 2x12 header on the left wall; door; window |

`PRESETS[0]` is also the start design when the browser has no usable autosave. "New from preset…"
lists the presets in this order.

### 10.2 Test fixtures

`DESIGNS` in `tests/designs.ts` is the presets plus the fixtures in `tests/fixtures`, each parsed
with `shedSchema.parse`. The fixtures cover options that the presets leave at their defaults.
`golden.test.ts` writes one golden file for each design: `tests/golden/<name with - for spaces>.txt`.

| Fixture | Foundation, floor, walls | Roof and loft | Openings, lean-tos, ramps | Other |
|---|---|---|---|---|
| `16x16-b-and-b-shed.json` | Slab; 2x6 mud sill; California corners | Loft with an open left end; knee walls | Garage door; loft windows in both gables; mirrored metal lean-tos | A full, older file with unused settings; gable front; SP; 30 psf snow |
| `10x16-loft-shed.json` | Floor blocking | 12/12; metal over sheathing; gable panels; fascia lookouts; hung loft with an open right end and two hatches; knee walls | Gable windows; back lean-to with a deck; a ramp that follows the door | T1-11; sleeping loft |
| `12x16-lean-to-studio.json` | Piers with 6x6 posts; custom wall height 120 in; 2x6 studs 24 in o.c.; three-stud corners | Lean-to roof, high in front; square tails; no fascia; metal on 2x4 purlins; rake ladder on the end rafter | Transom; a ramp that follows the door | Board and batten |
| `8x12-odd-openings.json` | Four 6x6 skids; 2x6 studs; `doubleJackOver` 60 | 4/12 | Triple, single, and flat headers; a 4x6 header; set jack counts; a disabled row; a custom vent in the gable; `left` and `right` positions; one ramp that follows an opening, one free ramp | — |
| `20x24-heavy-snow.json` | Six 6x6 skids; 2x8 joists 12 in o.c. with blocking; 104.625 in studs; two-stud corners; eave walls through | 8/12; no rake overhang; rafter ties every second pair | Overhead door with a 2x12 header; a ramp that follows it | 70 psf snow, 20 psf dead; DFL; `maxLength` 144 |
| `12x12-with-lean-tos.json` | Slab with no mud sill | Metal; a ridge that does not extend | Front extension lean-to at the main pitch; partial left lean-to; right lean-to on a slab, with 6x6 posts and a 3-ply 2x10 beam; a free concrete ramp below grade | — |
| `4x6-tiny-shed.json` | Two 4x4 skids; 2x4 joists 24 in o.c.; custom wall height 66 in; no cap plate; no wall sheathing | Lean-to roof at 2/12 with metal | 28 in door with a 2x4 header | Minimum width 48 in; T1-11; HF |
| `12x16-gambrel-barn.json` | Piers with 3 girder lines | Gambrel, 20/12 lower and 6/12 upper, auto break (36 in), no ridge board; metal on purlins; loft on the plates with a hatch | 62 in double door and a loft door in the left gable end; two windows in the front wall; back extension at 4/12, blocked over the plate; right lean-to 96 in long on a slab | Gable front |

Some designs warn on purpose: the odd openings, the heavy-snow header, the low lean-tos, and the
gambrel's extension, blocked over the plate.

### 10.3 Tests that pin this document

| Test | Checks |
|---|---|
| `tests/config.test.ts` | A bare file fills every default. `keepWallHeight`. The unknown-key and out-of-range messages. A gambrel lower pitch no steeper than the upper pitch. A percent over 100, a row type that does not exist, a duplicate name. Another schema version and bad JSON fail. `appVersion` is the second key and does not load. Each design loads back from `serializeConfig`. |
| `tests/prune.test.ts` | Each design in `DESIGNS` and `MESSY` builds the same after prune, save, and load. A slab resets the unused foundation, floor, and loft settings. Lean-to piers keep their settings. Only a gambrel keeps `roof.gambrel`, and it drops `roof.kneeWalls`. |
| `tests/share.test.ts` | Each design loads back from its link and its file as the pruned design. A slab file has no `skid`, `pier`, or `floor`. List items keep their required keys. The size limits. A cut-off link gives the damaged-link error. `linkData` reads only `#design=`. |
| `tests/naming.test.ts` | `eave` keeps the `ASSEMBLIES` names and order. `gable` turns the names a quarter turn. The cut list marks `FW-1` on the model's left wall. A warning names an opening by its user side. |
| `tests/units.test.ts` | Format and parse examples, rejected inputs, and the 1/16 in round trip up to 20 ft. |

To cover a new option, set it in a fixture, or add a fixture and list it in `DESIGNS`. Review the
golden diff, then run `npx vitest run -u`.
