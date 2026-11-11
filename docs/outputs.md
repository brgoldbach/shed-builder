# Outputs: cut list, bill of materials, span checks, CSV

The functions in `src/core/out` turn the model from `buildModel` into what a builder cuts, buys, and
checks. They are pure, and they run in the browser on each design change. This document gives each
algorithm, constant, and rule as the code has it. Read [DEVELOPER.md](DEVELOPER.md) first for the
structure and conventions.

Shed Builder is a planning aid, not a validated engineering tool. The span checks are a screen, not
a design. `DISCLAIMER` (`src/core/disclaimer.ts`) closes each CSV file and each printed page.

## Pipeline

`src/ui/App.tsx` computes each output as a `useMemo` of the config, in this order:

1. `buildModel(config)` gives the `Model`.
2. `naming(config)` gives the user's names for sides and assemblies.
3. `buildCutList(model.members, names)` gives the cut lines.
4. `markOf` maps each member id to the mark of its cut line.
5. `buildDrawings` and `buildBom(config, model, markOf)` read the model and the marks. `checkSpans(config, model, names)` reads the model.
6. The Warnings tab lists `model.warnings`, then `bom.warnings`, then `spanWarnings(spans, config)`.

| Function | File | Output | Shown in |
|---|---|---|---|
| `buildCutList` | `src/core/out/cutlist.ts` | `CutLine[]` | Cut list tab: `CutListTable`, `PieceInfo` |
| `buildBom` | `src/core/out/bom.ts` | `Bom` | BOM tab: `BomView` |
| `checkSpans`, `spanWarnings` | `src/core/out/spans.ts` | `SpanCheck[]`, `Warning[]` | Warnings tab: warning list and `SpanTable` |
| `cutListCsv`, `bomCsv` | `src/core/out/csv.ts` | CSV text | Download CSV buttons |
| `pieceDrawing`, `cutLengthKey` | `src/drawings/piece.ts` | `Drawing` | `PieceInfo`; the last framing drawing |

## Terms

| Term | Meaning |
|---|---|
| Piece | One `Member` to cut. |
| Board | One stock board to buy. Pieces come from boards. |
| Stock length | A board length that a yard sells, in inches. |
| Cut line | Identical pieces under one mark: a `CutLine`. |
| BOM line | One counted item of concrete, hardware, or roofing: a `Line`. |
| Mark | The label written on each piece of a cut line, for example `RF-2`. |
| Long point | The point of an angled end that is farthest along the board. |
| Kerf | The width of wood that one saw cut removes. `catalog.kerf`, default 1/8 in. |
| PT | Pressure-treated: `Member.treated` is true. Labels add ` PT` after the size. |
| Panel | One piece of sheet goods: a `Solid` with `sheet` set and a `panel` shape. |
| Sheet | One 48 × 96 in stock sheet. |
| Drawing | One page of the plan set: a `Drawing`. |
| RO | Rough opening: the framed hole for a door or window. |
| Birdsmouth, seat | The notch where a rafter sits on a plate; the seat is its level cut. |
| Soffit lean-to | `attach: 'soffit'`: its own rafters hang from a ledger under the main roof. |
| Extension lean-to | `attach: 'extension'`: its rafters lap the main rafters at a downhill eave. |
| Hung loft | `roof.loft.support: 'hung'`: loft joists hang in hangers between ledgers. Else they sit on the wall plates. |
| Hatch | An opening in the loft floor, framed by doubled trimmers and doubled headers. Tail joists run from a header to the eave. |
| o.c. | On center: member center to member center. |
| psf, plf | Load in pounds per square foot of surface; load in pounds per linear foot of member. |
| AWC, NDS | American Wood Council; its National Design Specification for Wood Construction. |
| Fb, Fv, E | Reference design values, psi: bending stress, shear stress parallel to grain, modulus of elasticity. |
| CF | Size factor on Fb, by nominal width. |
| Cr | Repetitive member factor on Fb: 1.15, for joists and rafters. |
| Cd | Load duration factor on Fb and Fv: 1.0 for floor live load, 1.15 for snow, 1.25 for roof live load. |
| L/360 | Deflection limit: the live-load deflection is at most the span divided by 360. L/240 and L/180 work the same way. |
| Tributary width | The width of floor or roof that one member carries. |

## 1. Cut list

`buildCutList(members, names)` puts identical members on one cut line and gives each line a mark.

### 1.1 `CutLine`

| Field | Content |
|---|---|
| `mark` | The assembly prefix, a hyphen, and the line number in its assembly: `FW-4`. |
| `assembly`, `role`, `size`, `treated` | Shared by every piece on the line. |
| `length` | Cut length, inches, to the nearest 1/16 in. |
| `note` | Shop instruction from the generator: angles, birdsmouths, cutouts, fasteners. Absent when the member has none. |
| `ids` | Member ids. `ids.length` is the quantity. |

### 1.2 Steps

1. Round each member length: `Math.round(length * 16) / 16`.
2. Make the key `assembly|role|size|treated|length|note`. Members with the same key share a line. The first member gives the line its fields.
3. Sort the lines by `names.rank(assembly)`, then by the role's position in `ROLES`, then longest first.
4. Count the lines of each assembly from 1. The mark is `names.assembly(assembly).prefix`, a hyphen, and the count.

### 1.3 Order and prefixes

`naming` (`src/core/naming.ts`) gives the rank: the `KIND_ORDER` index × 10, plus the side's place in
front, back, left, right. The side is the user's name for it.

| Order | Assembly | Prefix |
|---|---|---|
| 1 | `foundation` | `FD` |
| 2 | `floor` | `FL` |
| 3 | `wall.<side>` | First letter of the user's side name, then `W`: `FW`, `BW`, `LW`, `RW` |
| 4 | `gable.<side>` | `G`, then the side letter: `GL`, `GR` |
| 5 | `roof` | `RF` |
| 6 | `loft` | `LF` |
| 7 | `knee.<side>` | `K`, then the side letter |
| 8 | `addition.<side>` (lean-to) | `A`, then the side letter |
| 9 | `ramp` | `RP` |

With `front: 'gable'`, the user's front is the model's left gable end (`GABLE_FRONT`). The model's
front wall then shows as the right wall, gets marks `RW-n`, and sorts after the other walls.

Within an assembly, roles follow the key order of `ROLES` (`src/core/member.ts`). That order starts
with mud sill, bottom plate, top plate, cap plate, corner stud, and stud. Within a role, the longer
line comes first.

### 1.4 Cut length

`LENGTH_RULE`: "Cut lengths run long point to long point, measured along the board: the shortest
board each piece comes from."

- A square-cut member's `length` is its length.
- A profiled member's `length` is the extent of its outline along the board. `planeMember` (`src/core/gen/section.ts`) sets it.
- The BOM packs each piece at this length, rounded the same way.

| Decision | Reason |
|---|---|
| Cut lengths run long point to long point along the board. | That length is the shortest board each piece comes from. The cut list and the BOM then use one length. |

`LENGTH_RULE` shows in four places:

- the Cut list tab hint;
- the last data row of the cut list CSV;
- the first note of each piece drawing;
- the first note of the cut-length key.

### 1.5 Piece drawing and cut-length key

`src/drawings/piece.ts` lays one piece flat: its length to the right, its board width up.

- `outlineOf(member)`: the profile points as (along, across), or the rectangle `length × LUMBER[size].width`.
- `edgesOf(outline)`: the lowest and highest `across` levels, and the extent along the board at each level: `bottom` and `top`.

`cutKind(outline)` compares the ends of the two edges, with a tolerance of 1/32 in:

| Kind | Rule | Example in the 8x10 preset |
|---|---|---|
| `square` | Both ends of the two edges line up. | Stud |
| `one-end` | One end lines up. The other does not. | Gable stud |
| `toward` | Neither end lines up. One edge's extent holds the other's: that edge has both long points. | Collar tie |
| `parallel` | Neither end lines up. Neither edge holds the other: the long points are on opposite edges. | Rafter with plumb cuts at both ends |

`pieceDims` gives these aligned dimensions:

| Dimension | From, to | Offset (in) | Shown |
|---|---|---|---|
| Cut length | Leftmost point to rightmost point, along the board | −40, below | Always |
| Bottom edge | The `bottom` extent | −16 | When longer than 1/32 in and shorter than the cut length by more than 1/32 in |
| Top edge | The `top` extent | +16 | Same rule |
| Width | Right end of the bottom edge to right end of the top edge, across | −16 | Always |

`pieceDrawing(member, mark)` returns a drawing with id `piece-<id>`, the outline, these dimensions,
and the notes: `LENGTH_RULE`, then the member note when it has one.

Examples from `tests/piece.test.ts`, 8x10 preset:

- A 2x4 rafter at 6/12 with plumb cuts at both ends has edges of 66-1/4 in. Its cut length is 68 in: 66-1/4 + 3-1/2 × 6/12.
- A gable stud reads 5-7/16 in long, 4-11/16 in on its short side, and 1-1/2 in wide. Its top cut crosses the 1-1/2 in face.

`cutLengthKey(members, marks)` builds the drawing "Measuring cut lengths", id `cut-lengths`:

1. For each kind `one-end`, `toward`, and `parallel`, take the profiled members of that kind.
2. Pick the member with the fewest profile points. On a tie, pick the longer one, by more than 1/32 in.
3. Return `null` when no kind has a member. `buildDrawings` then leaves the drawing out.
4. Stack the examples down the drawing, `KEY_GAP` = 14 in apart, for room for their dimensions.
5. Write the notes: `LENGTH_RULE`, then one note for each example.

An example note reads `{mark}, {part}: {kind text} Here {cut length}, with edges of {long edge} and
{short edge}.` The kind texts (`KINDS`):

| Kind | Text |
|---|---|
| `one-end` | One end cut. The cut length is the long side. |
| `toward` | Both ends cut toward each other. The cut length is the long edge. |
| `parallel` | Both ends cut the same way. The long points are on opposite edges, so the cut length is longer than either edge. |

In the `parallel` case, the cut length is longer than both edges. A measure along either edge gives
a piece that is too short. For the 8x10 preset, the key shows a gable stud, a collar tie, and a fly
rafter. The fly rafter has fewer profile points than a rafter with a birdsmouth. The key is the last
drawing in `buildDrawings`, so the PDF plan set has it too.

### 1.6 What the user sees

- The Cut list tab has a hint (`LENGTH_RULE` and how to select a line), Download CSV, Print, and `CutListTable`.
- `CutListTable` has one table body for each assembly, under the assembly label. Columns: Mark, Qty, Stock (`2x6 PT`), Length (`formatInches`), Part (the `ROLES` label), Notes. The footer gives the total piece count.
- A click on a row selects its line. A second click clears the selection.
- A pick of a member in 3D or on a drawing selects the member's line.
- `PieceInfo` shows the selected line in the 3D view, on the Framing tab, and on the Cut list tab.
- `PieceInfo` reads `{mark} {assembly}, {part}: {qty} × {stock} at {length}`. Below it are the drawing of the line's first member (`ids[0]`), scaled to fit 420 × 160 px, and the note. The × button clears the selection.

### 1.7 Edge cases

- The group key has no `profile`. Two pieces with the same key and different angle cuts share one line. A generator must state each cut difference in `note`.
- Members whose lengths round to the same 1/16 in share a line, even when their exact lengths differ.
- Lines with the same assembly, role, and length keep the order of their first members in `model.members`. `Array.prototype.sort` is stable.
- A new line moves the numbers of the later lines in its assembly. A mark is not stable across design changes.
- `names` defaults to `naming({ front: 'eave' })`.

### 1.8 Change it safely

1. Add a new role to `ROLES` at the position you want in the cut list.
2. Put each cut difference between pieces into `note`.
3. Keep `LENGTH_RULE` as the only text of the rule. Four places read it.
4. Run `npm test`. A change to the key or the sort moves marks in the golden files.
5. Read the golden diff, then run `npx vitest run -u`.

`tests/every-design.test.ts` checks one cut line for each member, and a unique mark for each line.

## 2. Lumber in the BOM

`lumberGroups(config, members)` in `src/core/out/bom.ts` packs pieces onto stock boards and prices
the boards.

### 2.1 `LumberGroup`

| Field | Content |
|---|---|
| `size`, `treated` | The group key. |
| `boards` | `Board[]`, each `{ stock, pieces }`, longest stock first. |
| `tooLong` | Pieces longer than the longest stock. Not packed, not priced. |
| `waste` | The fraction of bought length that is not in a piece. |
| `rate` | Dollars per foot of stock, with the treated markup. |
| `cost` | `{ total, basis }`. |

### 2.2 Stock lengths

`DEFAULT_STOCK` (`src/core/catalog.ts`), inches:

| Size | Default stock lengths |
|---|---|
| 2x4, 2x6 | 92-5/8, 104-5/8, 116-5/8 (`PRECUT_STUDS`), 96, 120, 144, 168, 192, 216, 240 |
| 2x8, 2x10, 2x12, 4x4, 4x6, 6x6 | 96, 120, 144, 168, 192, 216, 240 |
| 1x4 | 96, 120, 144, 192 |

`PRECUT_STUDS` suit 8, 9, and 10 ft walls with a bottom plate and a double top plate.
`catalog.stock[size]` replaces the list for one size (`stockLengths`). Each length is 12 to 480 in.
An empty field in the form restores the default list.

Two settings divide the stock:

| Setting (form label) | Default | Range | Use |
|---|---|---|---|
| `catalog.maxLength` (Longest stock) | 192 in | 96–480 | The longest board to buy. Plates, rims, ridges, fascia, and girders splice at this length (`splitPlate`). Each piece up to this length comes from a board no longer than it. |
| `catalog.maxOnePiece` (Longest one-piece stock) | 240 in | 96–480 | The longest board for a piece that cannot splice: a rafter, a tie, or a joist. |

- `general = stockFor(catalog, size)`: the stock lengths up to `maxLength`.
- `long = onePiece(config, size)`: the stock lengths up to the larger of `maxLength` and `maxOnePiece`.
- When no stock length is short enough, `stockFor` returns the shortest one. Neither list is empty.

| Decision | Reason |
|---|---|
| Only a piece longer than every general board opens a board from `long`. | The user sets the longest board to buy. Short pieces stay on those boards, even when a longer board packs tighter. |

### 2.3 Steps in `lumberGroups`

1. Group the members by `size|treated`. Groups keep the order of their first member in `model.members`.
2. Round each piece to 1/16 in, as the cut list does.
3. Find `longest`, the longest length in `long`.
4. Send the pieces up to `longest` + 0.01 in to `packLumber(pieces, general, kerf, long)`. Put the rest in `tooLong`.
5. Sum `bought`, the stock lengths of the boards, and `used`, the piece lengths.
6. Set `waste` = 1 − `used` / `bought`, or 0 when nothing is bought.
7. Set `rate` = `prices.lumber[size]`. For PT, multiply it by 1 + `treatedMarkup` / 100.
8. Set `cost.total` = `bought` / 12 × `rate`.

### 2.4 `packLumber`

`packLumber(pieces, general, kerf, long = general)` returns `Board[]`. Each comparison allows
`NEAR` = 0.01 in.

| Name | Meaning |
|---|---|
| `cap` | The longest length in `general`. |
| `content(board)` | The sum of its piece lengths, plus one kerf between each pair of neighbors: Σ length + kerf × (n − 1). |
| `shortestFor(length)` | The shortest stock that is at least `length`. It searches `general` when `length` ≤ `cap`, else `long`. |
| First fit | Each piece goes on the first board that has room for it. |

Steps:

1. Give each piece that equals a stock length its own board (`whole`). A piece up to `cap` matches `general`. A longer piece matches `long`.
2. Sort the other pieces, longest first.
3. Pack the sorted pieces two ways, by first fit. A board has room when `content` + kerf + length ≤ stock. When no board has room, the piece opens a new board:
   - Way A opens it at `shortestFor(length)`.
   - Way B opens it at `cap`, or at `shortestFor(length)` for a piece longer than `cap`.
4. In each way, cut back each board to `shortestFor(content)`.
5. In each way, split each board that has two or more pieces. Compare three options, and keep the one that buys the least length:
   - the board as it is;
   - each piece alone, on `shortestFor(piece)`;
   - the longest piece alone, and the rest on `shortestFor(content of the rest)`.

   A tie keeps the earlier option. The rest does not split again.
6. Take way B only when it buys more than 0.01 in less than way A.
7. Return the `whole` boards and the packed boards, longest stock first.

Within one group the price is per foot. So the way that buys less length is the cheaper way.
`packLumber` is a heuristic: it does not search every arrangement, and a better cut plan can exist.

| Decision | Reason |
|---|---|
| A piece equal to a stock length takes that board whole. | Precut studs stay precut. No stud comes from a long board. |
| Two ways to open a board. | Way A suits pieces near a stock length. Way B lets many short pieces share one long board. |
| Cut-back and split after first fit. | First fit can leave a board longer than its pieces need, or pieces that cost less on separate boards. |
| A split tie keeps the board as it is. | That option has the fewest boards. |

Examples, kerf 1/8 in. The first four are in `tests/bom.test.ts`.

| Pieces (in) | Stock (in) | Result |
|---|---|---|
| 92-5/8, 50, 40, 30, 20 | 92-5/8, 96, 120, 144 | 92-5/8 takes a whole board. Way A: [50, 40] and [30, 20] on two 92-5/8 boards, 185-1/4 in. Way B: all four on one 144, content 140-3/8. Way B wins. |
| 100, 90, 80 | 96, 120, 144, 192, 240 | 192 [100, 90] and 96 [80]. |
| 100, 90, 80 | `general` 96, 120; `long` 96 to 240 | 120 [100], 96 [90], 96 [80]. |
| 100, 90, 80, 204 | `general` 96, 120; `long` 96 to 240, with 216 | 216 [204]. The short pieces stay on 120 and 96 boards. |
| 48, 48 | 2x8 default to 192 | 120 [48, 48]. With the kerf, 48 + 1/8 + 48 does not fit a 96 board. |

### 2.5 Kerf and waste

- `catalog.kerf`: default 1/8 in, range 0 to 1/4 in. A kerf of 0 is valid.
- A board takes one kerf between neighbor pieces. Its ends take none. A whole-board piece takes none.
- `waste` counts kerf and offcuts as waste.

### 2.6 Too-long pieces

A piece longer than `longest` + 0.01 in goes to `tooLong`. It is not packed and not priced.

`buildBom` makes the warnings:

1. For each lumber group, group the `tooLong` pieces by mark: `marks.get(id)`, or the id when no mark exists.
2. Make one warning for each mark. Its `source` is the mark.
3. For one piece, the message is "The {size} at {length} is longer than the longest stock, {longest}. Splice it or order it long."
4. For two or more, the message is "The {n} pieces of {size} at {length} are longer than the longest stock, {longest}. Splice them or order them long."

`{longest}` is the longest length in `long`. `{length}` comes from the first piece, and every piece of
a cut line has that length.

| Decision | Reason |
|---|---|
| A cut line with pieces longer than the longest stock gives one warning with a count, not one per piece. | The pieces of a cut line share size and length, so one message covers them. Ten rafters give one warning, not ten copies. |

Example (`tests/bom.test.ts`): the 10x12 lean-to preset with 2x8 stock of 96 and 144 in has 10
rafters and 2 fly rafters at 150-1/4 in. The BOM gives two warnings: `RF-1` for 10 pieces and `RF-2`
for 2 pieces.

### 2.7 Prices

`DEFAULT_PRICES.lumber`, dollars per linear foot, untreated:

| 1x4 | 2x4 | 2x6 | 2x8 | 2x10 | 2x12 | 4x4 | 4x6 | 6x6 |
|---|---|---|---|---|---|---|---|---|
| 0.45 | 0.45 | 0.75 | 1.05 | 1.50 | 2.00 | 1.40 | 2.10 | 3.50 |

- `treatedMarkup`: 50 %, range 0 to 500 %.
- `cost.basis` reads `$0.75/ft` for untreated, and `$3.15/ft, untreated +50%` for PT.
- The rate applies per foot to each stock length, precut studs too.

Example (`tests/bom.test.ts`): the 8x10 preset has three 10 ft PT 4x6 skids. 30 ft at $2.10 × 1.5 =
$3.15/ft gives $94.50.

### 2.8 What the user sees

The BOM tab, Lumber section:

- A header row for each group: `{size}[ PT] {n} boards, {ft} ft, waste {percent}, at {basis}`, and the group cost.
- One row for each stock length: the length (`formatLength`), the board count, and count × stock × rate / 12.
- A Special order row when `tooLong` has pieces: the count and "Not priced". A note below it lists each piece by mark and length.
- Cutting plan, a fold: for each group, the boards by stock length. Boards with the same pieces show once with a count: `{n} × {stock}: {mark} {length}, ...`.
- The BOM warnings, under the cutting plan. The Warnings tab lists them too.
- A note at the end: each cut takes the saw kerf, and a piece as long as a stock length takes that board.

### 2.9 Edge cases

- A direct call of `packLumber` with a piece longer than each stock in `long` opens a board of length `Infinity`. `lumberGroups` removes such pieces first.
- When `maxOnePiece` is less than `maxLength`, `long` is equal to `general`.
- When each custom stock length is above `maxLength`, `general` holds only the shortest of them.
- PT and untreated pieces of one size go in separate groups.

### 2.10 Change it safely

1. Round BOM pieces to 1/16 in, as the cut list does.
2. Remove too-long pieces before each call of `packLumber`.
3. Run `tests/bom.test.ts`. Its "lumber packing" cases pin the algorithm.
4. Expect STOCK and COST lines to change in the golden files. Read the diff before `npx vitest run -u`.
5. For a new lumber size, add it to `LUMBER_SIZES`, `LUMBER`, `DEFAULT_STOCK`, and `DEFAULT_PRICES.lumber`.

## 3. Sheets

`sheetGroups(solids, kerf, prices)` and `packSheets(pieces, kerf)` in `src/core/out/bom.ts`.

### 3.1 Steps in `sheetGroups`

1. Take the solids that have `sheet` set and a `panel` shape.
2. Group them by `sheet`, the `SheetKey`.
3. For each panel, take the rectangle around its outline. `long` is its longer side. `short` is its shorter side.
4. Count the sheets: `packSheets(pieces, kerf)`.
5. Count the panels by use: the label text before the first comma, for example `Wall sheathing`.
6. Set `waste` = 1 − Σ(long × short) / (count × 96 × 48).
7. Set `cost` = count × `prices.sheets[sheet]`, basis `$16.50 per sheet`.

Each panel comes from the rectangle around it. Holes and angled edges do not reduce the material, and
`waste` counts them as used.

### 3.2 `packSheets`

`packSheets` fills 96 × 48 in sheets (`SHEET_LENGTH`, `SHEET_WIDTH`) with shelves. A shelf is a strip
along the 96 in length. Its height runs across the 48 in width.

1. Sort the pieces by short side, widest first, then by long side, longest first.
2. List the orientations of a piece: its long side along the sheet. When the long side is 48 in or less, add its short side along the sheet.
3. Search each shelf of each sheet, in order, in each orientation. Take the first shelf that fits: across ≤ shelf height, and used + kerf + along ≤ 96.
4. When a shelf fits, add kerf + along to its used length.
5. Else, open a new shelf on the first sheet where height + kerf + short ≤ 48. The shelf height is `short`. Its used length is `long`.
6. Else, start a new sheet with that shelf.
7. Return the number of sheets.

A sheet takes one kerf between pieces on a shelf, and one kerf between shelves. The first piece and
the first shelf take none.

Examples (`tests/bom.test.ts`, kerf 1/8 in):

- 8x10 subfloor panels of 96 × 48, 72 × 48, 48 × 48, and 48 × 24 take 3 sheets. The 48 × 24 turns and fits beside the 48 × 48.
- Two 72 × 20 strips take 1 sheet, on two shelves.

### 3.3 Sheet goods and prices

| `SheetKey` | Label | Actual thickness (in) | Default price |
|---|---|---|---|
| `osb-7/16` | 7/16" OSB | 7/16 | $16.50 |
| `ply-15/32` | 15/32" plywood (1/2") | 15/32 | $28.00 |
| `ply-19/32` | 19/32" plywood (5/8") | 19/32 | $35.00 |
| `tg-23/32` | 23/32" T&G (3/4") | 23/32 | $34.00 |

`sheetLabel(sheet)` adds `, 4×8` to the label.

### 3.4 What the user sees

The Sheets table has the columns Sheet, Qty, Price, Cost, and Used for. Used for lists
`{use}: {n} panels` and the waste percent. A note at the end says that each panel comes from the
rectangle around it. It also says that offcuts are used again along the width of a sheet.

### 3.5 Edge cases and safe change

- `packSheets` does not check that a panel fits on one sheet. A panel larger than 48 × 96 in still counts as one sheet.
- A new shelf always lays its piece with the long side along the sheet.
- Keep panel labels in the form `{use}, {sheet}`. The use is the text before the first comma.
- The golden SHEETS lines pin the count for each design.

## 4. Concrete

`concrete(solids, prices)` in `src/core/out/bom.ts`. It takes the solids with
`material: 'concrete'`. Anchor bolts are `steel` cylinders, so they do not count.

### 4.1 Volume per shape

| Shape | Parts | Volume, cu in |
|---|---|---|
| `box` | Main slab, thickened edge, lean-to slab | (max − min) in x × (max − min) in y × (max − min) in z |
| `cylinder` | Foundation and lean-to piers | π × r² × h |
| `panel` | Concrete ramp wedge | A × `thick` |

For a ramp, `outline` is the wedge profile in the plane square to the wall, and `thick` is the ramp
width (`src/core/gen/ramps.ts`). `area` uses the shoelace formula, for a simple polygon:

```
A = |Σ (xᵢ · yᵢ₊₁ − xᵢ₊₁ · yᵢ)| / 2
```

`area` ignores holes. Ramp panels have none.

### 4.2 Steps in `pour(item, parts)`

1. cu ft = Σ volume / 1728.
2. cu yd = cu ft / 27, rounded to 0.01.
3. bags = ⌈cu ft / 0.60⌉.
4. The note reads "{cu ft, to 0.1} cu ft net, or {bags} bags of 80 lb mix at 0.60 cu ft each."
5. When cu yd < 1, the cost is bags × `concrete.bag`, basis `{bags} bags at $6.00`.
6. Else the cost is cu yd × `concrete.readyMix`, basis `$165.00 per cu yd, ready-mix`.

| Constant | Value | Source |
|---|---|---|
| `BAG_YIELD` | 0.60 cu ft per 80 lb bag | QUIKRETE Concrete Mix No. 1101 data sheet |
| `CUBIC_FOOT` | 1728 cu in | |
| `BAGS_UNDER` | 1 cu yd | Ready-mix adds a short-load fee below about this volume. |

| Decision | Reason |
|---|---|
| A pour under 1 cu yd is priced in bags. | Ready-mix adds a short-load fee below about 1 cu yd. The fee itself is not in the price. |

The threshold compares the rounded cu yd value.

### 4.3 BOM lines

| Order | Item | Solids | Unit |
|---|---|---|---|
| 1 | `Concrete, slab` | Each `box` | cu yd |
| 2 | `Concrete, ramp`, or `Concrete, {n} ramps` | Each `panel` | cu yd |
| 3 | `Concrete, {n} piers` | Each `cylinder` | cu yd |
| 4 | `Form tube, {diameter}` | One for each pier. Note `{height} each.`; price `formTube`. | ea |

A shape kind with no solids gives no line. Each line chooses bags or ready-mix from its own volume,
so a small ramp is in bags even next to a large slab.

Form tubes take the diameter and the height of the first pier. Each pier, foundation or lean-to, uses
`foundation.pier.diameter` and a height of `depth + aboveGrade`. So one size covers them.

### 4.4 Examples (`tests/bom.test.ts`)

- 10x12 lean-to on piers: 9 piers, 10 in diameter, 44 in high. π × 5² × 44 × 9 = 31,102 cu in = 18.0 cu ft = 0.67 cu yd. ⌈18.0 / 0.6⌉ = 30 bags at $6 = $180. 9 form tubes at $16 = $144.
- 12x20 garage on slab: a 240 × 144 × 4 in slab, plus a 12 in wide ring 8 in under it. The total is 207,360 cu in = 120 cu ft = 4.44 cu yd, at the ready-mix price of $165.

### 4.5 What the user sees

The Concrete table has the columns Item, Qty, Unit, Price, Cost, and Notes. A note at the end says
that volumes are net, and to add for waste and an uneven subgrade.

### 4.6 Change it safely

1. Add a volume case for each new concrete shape kind.
2. Group form tubes by diameter if lean-to piers get their own size.
3. Give each concrete solid `material: 'concrete'`. Other materials do not count.

## 5. Hardware

`hardware(config, model)` counts connectors. Its `add` drops a line with a quantity of 0. Each line
has the unit `ea`, and a cost of quantity × unit price, basis `$X.XX each`.

### 5.1 Items, in output order

| Item | Quantity | Price key, default |
|---|---|---|
| Anchor bolt, 1/2", with nut and washer | Solids whose label starts with `Anchor bolt` | `anchorBolt`, $2.50 |
| Hurricane tie, rafter to plate | Main rafters × seats, plus lean-to rafters × (2 for an extension, else 1) | `hurricaneTie`, $0.75 |
| Post base, {size} | Members with role `post`, by size | `postBase`, $9.00 |
| Post cap, {size} | Members with role `post`, by size | `postCap`, $9.00 |
| Joist hanger, {size} | See 5.3. One line for each size. | `joistHanger`, $1.60 |
| Joist hanger, double {loft joist} | `header.loft` count, plus `trimmer.loft` and `edge.loft` counts for a hung loft | `doubleHanger`, $3.00 |
| Ledger lag screw, 1/2" | Σ `leanTo.lags` | `lag`, $1.25 |
| Deck ledger lag screw, 1/2" | 2 × `joist.deck` count | `lag`, $1.25 |
| Beam seat, {plies}-ply {joist} | `deck.seats` of each lean-to with a deck: one at each pier under the beam, none where deck posts carry it | `postCap`, $9.00 |
| Ramp lag screw, 1/2" | 2 × `stringer` count | `lag`, $1.25 |

### 5.2 How each count works, and why

- **Anchor bolts.** `frameWalls` places them only on a slab. They go on each sill's centerline, in each part of the sill clear of doorways. `foundation.slab.anchorSpacing` and `anchorEndDistance` set their positions. The BOM counts those solids. The 12x20 garage preset gives 17.
- **Hurricane ties.** One goes at each rafter seat, the rafter-to-plate connection. A main rafter on a gable roof has 1 seat: it runs from one eave wall to the ridge. A main rafter on a lean-to (single-slope) roof has 2 seats: the front and back walls. A soffit lean-to rafter has 1 seat, on its beam, because its high end hangs from the ledger. An extension lean-to rafter has 2 seats: its beam and the main wall. Fly rafters (`rafter.fly`) have no seat. The line note states the rule. Examples: the 8x10 gable has 6 rafter pairs, so 12 ties; the 10x12 lean-to roof has 10 rafters × 2, so 20 ties.
- **Post bases and caps.** Each post, foundation or lean-to, takes one base and one cap. A lean-to post over a deck stands on the deck beam, so its base is on the beam. A deck post stands on a pier under the beam. The base note reads "Set in the pier, or anchored to the slab or a deck beam." The cap note reads "To the girder or beam."
- **Ledger lags.** `frameAdditions` finds the vertical studs of `wall.{side}` and `gable.{side}` behind the ledger: within the lean-to's length and across the ledger's depth. It sets `lags` to 2 for each stud. An extension lean-to has no ledger, so its `lags` is 0.
- **Deck ledger lags.** Two go at each deck joist, through the ledger into the floor framing. The cut-list note on the deck ledger says the same.
- **Beam seats.** The deck beam is a flush beam on the post line, with plies enough to bear the post (3 for a 4x4, 4 for a 6x6). Where the piers rise to the beam, a beam seat at each pier ties the beam to it. Where deck posts carry the beam, their post caps do.
- **Ramp lags.** Two go at each wood ramp stringer, into the floor framing. A concrete ramp has no stringers.

### 5.3 Joist hangers

| Member | Hangers for each member | Size |
|---|---|---|
| `joist.loft` | 2 in a hung loft, between the ledgers. 0 when the joists sit on the plates. | `roof.loft.joist` |
| `tail.loft` | 1, at the hatch header. 2 in a hung loft: also at the ledger. | `roof.loft.joist` |
| Soffit lean-to rafter | 1, at the ledger | The rafter's size |
| `joist.deck` | 2, at the ledger and at the beam | The joist's size |

Hangers of the same size add up to one line.

Double hangers: hatch headers, hatch trimmers, and loft edge joists are doubled. A doubled pair has two
ends and takes one double hanger at each end. So the double hanger count equals the member count.
Headers always hang between trimmers. Trimmers and edge joists hang only in a hung loft; otherwise
they sit on the plates.

Example, the 10x16 loft shed golden file (hung loft, back lean-to with a deck):

| Line | Count |
|---|---|
| Joist hanger, 2x6 | 6 loft joists × 2 + 4 tail joists × 2 + 9 lean-to rafters + 13 deck joists × 2 = 55 |
| Joist hanger, double 2x6 | 8 headers + 8 trimmers + 2 edge joists = 18 |
| Hurricane tie | 26 main rafters × 1 + 9 lean-to rafters × 1 = 35 |
| Deck ledger lag screw | 13 deck joists × 2 = 26 |
| Beam seat, 3-ply 2x6 | 3 piers under the deck beam = 3 |

### 5.4 Not counted

Nails, screws, straps, and connectors other than those in 5.1. Siding, trim, doors, and windows:
`src/core/gen/finishes.ts` is for the 3D view only.

## 6. Roofing

`roofing(config, model)` reads `model.planes`: the main roof planes, then the lean-to planes. With no
planes, it gives no lines.

| `RoofPlane` field | Content |
|---|---|
| `assembly` | `roof` for the main roof; `addition.<side>` for a lean-to |
| `length` | Along the eave, rake edge to rake edge, in |
| `width` | Up the slope, from over the fascia to the ridge line or the high edge, in |
| `eaves` | The number of edges along `length` that take drip edge |
| `sheathed` | false: metal roofing on purlins, with no sheathing |

Steps:

1. Put each plane in one of two types: metal or shingles. A main roof plane is metal when `roof.roofing` is `metal` or `metal-over-sheathing`. A lean-to plane is metal when it is not sheathed (`addition.roofing` is `metal`). A sheathed lean-to takes shingles. `finishes.ts` uses the same rule for the 3D roof.
2. For each type that has planes, area = Σ length × width / 144, rounded to 0.1 sq ft.
3. Write the note `{area / 100, to 0.01} squares.` A square is 100 sq ft.
4. Set the cost to area × the price per sq ft.
5. Find the eave length: Σ length × `eaves` / 12 ft.
6. Find the rake length: Σ 2 × width / 12 ft.
7. Set the drip edge to eaves + rakes, rounded to 0.1 ft. Write the note `Eaves {x} ft, rakes {y} ft.`

| Plane | `eaves` |
|---|---|
| Main gable plane | 1. 0 when an extension lean-to takes over that eave. |
| Main single-slope plane | 2: the low eave and the high edge. 1 when an extension lean-to takes over the low eave. |
| Lean-to plane | 1: its low eave. |

Each plane counts two rakes. The ridge takes no drip edge.

| Price key | Default |
|---|---|
| `shingles` | $1.50 per sq ft |
| `metal` | $1.75 per sq ft |
| `dripEdge` | $1.50 per ft |

Example (`tests/bom.test.ts`): the 8x10 gable preset has two planes of 136 × 68.76 in. Area:
2 × 136 × 68.76 / 144 = 129.9 sq ft. Eaves: 2 × 136 / 12 = 22.7 ft. Rakes: 4 × 68.76 / 12 = 22.9 ft.
Drip edge: 45.6 ft.

Edge cases:

- The areas are net plane areas. They include no waste, starter, ridge cap, underlayment, or fasteners.
- The metal area does not include `finishes.metalOverhang` past the eave.

## 7. Costs and prices

### 7.1 Totals

`buildBom` sums `cost.total` for each section: `lumber`, `sheets`, `concrete`, `hardware`, and
`roofing`. `costs.total` is the sum of the five. Each `Cost` holds `total`, in dollars, and `basis`,
the unit price text.

### 7.2 `PRICE_NOTE`

"US dollars, before tax and delivery, at the unit prices in the lumber catalog. Special-order lumber
is not priced." It shows under the Cost table, and in the Total row of the BOM CSV.

### 7.3 Defaults

`DEFAULT_PRICES` (`src/core/catalog.ts`):

| Group | Key: default |
|---|---|
| `lumber` | Per linear foot, untreated: see 2.7 |
| `treatedMarkup` | 50 % |
| `sheets` | Per sheet: see 3.3 |
| `concrete` | `bag` $6.00 (80 lb), `readyMix` $165.00 per cu yd (the code comment says "delivered"), `formTube` $16.00 each |
| `hardware` | `anchorBolt` $2.50, `hurricaneTie` $0.75, `postBase` $9.00, `postCap` $9.00, `joistHanger` $1.60, `doubleHanger` $3.00, `lag` $1.25 |
| `roofing` | `shingles` $1.50 per sq ft, `metal` $1.75 per sq ft, `dripEdge` $1.50 per ft |

The source is US home-center retail, searched in November 2026.

| Decision | Reason |
|---|---|
| Prices are defaults that the user edits under Lumber catalog. They are retail estimates, before tax and delivery. | Prices change by place and time. The form tells the user to check them against a local yard. |

### 7.4 Config

`catalog.prices` in `shedSchema` (`src/core/config.ts`). `priceTable` gives each price its own
default and a range of 0 to 10,000. A file can give only some prices; the rest keep their defaults.
The form groups them under Lumber catalog: Lumber prices (with Treated markup), Sheet prices, Concrete
prices, Hardware prices, and Roofing prices.

### 7.5 What the costs leave out

- Special-order lumber (`tooLong`).
- Tax, delivery, and the ready-mix short-load fee.
- Each item that the BOM does not count (5.4, and the roofing edge cases in 6).

### 7.6 What the user sees

The Cost table is the first table on the BOM tab. It has one row for each section with a cost above
0, then the Total, then `PRICE_NOTE`.

### 7.7 Change it safely

Add a counted item this way (the recipe in DEVELOPER.md):

1. Add its default price to `DEFAULT_PRICES` in `src/core/catalog.ts`.
2. Add the line in `concrete()`, `hardware()`, or `roofing()` in `src/core/out/bom.ts`.
3. Add its price label to the `*_PRICE_LABELS` table of its group in `src/ui/DesignForm.tsx`.
4. Give the item a unique `item` text in its section. `LineTable` keys its rows by it.

A change to a default price changes the COST lines in the golden files.

## 8. Span checks

`checkSpans(config, model, names)` returns one `SpanCheck` for each member group that it checks.
`spanWarnings(checks, config)` makes a warning for each check over its allowed span. The method is the
AWC Span Tables for Joists and Rafters 2021, with NDS 2018 design values for No. 2 lumber.

| Decision | Reason |
|---|---|
| The app is a planning aid, not a validated engineering tool. Span checks are a screen, not a design. | They cover simple spans under uniform gravity loads only (8.10). The form says: "They are a check, not an engineered design." |

### 8.1 `SpanCheck`

| Field | Content |
|---|---|
| `member` | The checked member, for example `Rafters` or `door 36 header (front wall)` |
| `lumber` | `2x6 at 16" o.c.`, `2-ply 2x8`, or `flat 2x4` |
| `span` | Measured span, in |
| `allowed` | Allowed span, in. `null` when the size has no design values. |
| `governs` | `bending`, `deflection`, `shear`, or `null` |
| `basis` | The load and limit text (8.8) |

### 8.2 Design values

`SPECIES` (`src/core/catalog.ts`): No. 2 grade reference design values, psi, for normal load duration
and dry service. Source: NDS 2018 Supplement Table 4A (Douglas Fir-Larch, Hem-Fir, Spruce-Pine-Fir
"No. 1/No. 2") and Table 4B (Southern Pine, by nominal width, size factor included).

| Key | Label | Fb | Fv | E |
|---|---|---|---|---|
| `spf` (default) | Spruce-Pine-Fir No. 2 | 875 | 135 | 1,400,000 |
| `dfl` | Douglas Fir-Larch No. 2 | 900 | 180 | 1,600,000 |
| `hf` | Hem-Fir No. 2 | 850 | 150 | 1,300,000 |
| `sp` | Southern Pine No. 2 | By nominal width: 4 in 1100, 6 in 1000, 8 in 925, 10 in 800, 12 in 750 | 175 | 1,400,000 |

`bendingValue(species, size)` returns Fb × CF, psi:

1. Read the nominal thickness and width from the size name.
2. Return `null` for a thickness below 2 or above 4: `1x4` and `6x6`.
3. For `sp`, return the table value for the nominal width. 4x sizes take the same values as 2x sizes.
4. For the other species, return Fb × CF.

CF, from NDS 2018 Supplement Table 4A adjustment factors, No. 2 grade:

| Nominal width (in) | 4 | 6 | 8 | 10 | 12 |
|---|---|---|---|---|---|
| 2 in thick | 1.5 | 1.3 | 1.2 | 1.1 | 1.0 |
| 4 in thick | 1.5 | 1.3 | 1.3 | 1.2 | 1.1 |

Section sizes are the dressed sizes in `LUMBER` (American Softwood Lumber Standard, DOC PS 20):

| Size | 2x4 | 2x6 | 2x8 | 2x10 | 2x12 | 4x4 | 4x6 |
|---|---|---|---|---|---|---|---|
| Thickness × width (in) | 1.5 × 3.5 | 1.5 × 5.5 | 1.5 × 7.25 | 1.5 × 9.25 | 1.5 × 11.25 | 3.5 × 3.5 | 3.5 × 5.5 |

### 8.3 Equations

`allowedSpan(beam)` gives the longest simple span under a uniform load. Its inputs are b and d (in),
F'b and F'v (psi, adjusted), and E (psi). It also takes the total and live loads (plf), and n of the
deflection limit L/n.

```
w  = total / 12        wL = live / 12          lb/in
S  = b · d² / 6        I  = b · d³ / 12        in³, in⁴

Bending:     w·L²/8 = F'b·S                  →  L = √(8·F'b·S / w)           AWC Span Tables 2021, Eq. A.3.1-1
Deflection:  5·wL·L⁴ / (384·E·I) = L/n       →  L = ∛(384·E·I / (5·wL·n))    Eq. A.1-2, live load only
Shear:       1.5·V / (b·d) = F'v, V = w·L/2  →  L = 4·F'v·b·d / (3·w)        rectangular section
```

- The allowed span is the least of the three. `governs` names it. A tie goes to bending, then deflection, then shear.
- The deflection span is ∞ when wL = 0. The shear span is ∞ when F'v is `null`.
- With psi, in, and lb/in, each span is in inches.

`joistSpan(species, size, oc, load, duration)` uses the AWC Span Tables method for joists and rafters:

- b is the thickness and d is the width of the size.
- F'b = Fb·CF × Cr × Cd.
- F'v is `null`: no shear check, as in the joist and rafter tables.
- total = (live + dead) × oc / 12 plf, and live = live × oc / 12 plf.
- When `bendingValue` is `null`, `joistSpan` returns `null`.

The `beam` helper in `checkSpans` checks headers, lean-to beams, deck beams, and pier girders:

- F'b = Fb·CF × Cd, and F'v = Fv × Cd. Beams carry plf loads with no repetitive member factor.
- b = plies × thickness, and d = width. A flat header has b = width and d = thickness.

### 8.4 Factors

| Factor | Value | Applies to | Source |
|---|---|---|---|
| CF | 1.0 to 1.5 (8.2) | Fb, in each check | NDS 2018 Supplement Table 4A |
| Cr (`REPETITIVE`) | 1.15 | Fb of joists and rafters only | NDS 2018 Supplement Table 4A adjustment factors |
| Cd, roof live | 1.25 | Roof checks when `loads.roof` is 20 | AWC Span Tables 2021, A.9: 7 days |
| Cd, snow | 1.15 | Roof checks when `loads.roof` is 30 or more | A.9: 2 months |
| Cd, normal | 1.0 | Floor, loft, and deck joists; each beam with floor or loft live load | |
| E | Not adjusted | Deflection | |

A beam with floor or loft live load (`floorLive`) takes Cd = 1.0 for its full load, the roof share
too. This is conservative: it uses the lowest Cd with the full load.

### 8.5 Loads

| Config field | Values | Default |
|---|---|---|
| `loads.roof` | 20 (roof live load, no snow), or 30, 40, 50, 60, 70 (design roof snow load), psf | 20 |
| `loads.roofDead` | 10, 15, 20 psf | 10 |
| `loads.loft` | `storage`, `sleeping` | `storage` |

The form tells the user to enter the design roof snow load from the building department, not the
ground snow load.

Load cases in `spans.ts`, from AWC Span Tables for Joists and Rafters 2021, Tables A-1 to A-4:

| Constant | Live psf | Dead psf | Limit | AWC case |
|---|---|---|---|---|
| `FLOOR` | 40 | 10 | L/360 | F-2: rooms other than sleeping areas |
| `LOFT.storage` | 20 | 10 | L/240 | C-2: limited attic storage |
| `LOFT.sleeping` | 30 | 10 | L/360 | F-1: sleeping areas and attic floors |
| Rafters | `loads.roof` | `loads.roofDead` | L/180 (`RAFTER_LIMIT`) | R-13 to R-24: no drywall ceiling on the rafters |

Other constants: `WALL_DEAD` = 10 psf of wall face, for framing and sheathing above a header or on a
girder. `PLY` = 1-1/2 in.

### 8.6 The checks

| `member` | Method | Span | Load | Cd | Limit |
|---|---|---|---|---|---|
| `Rafters` | `joistSpan` | `model.rafterSpan`: horizontal clear span from the inner end of the seat to the ridge board face (gable), or between the two seats (single slope) | Roof + roof dead, at `roof.oc` | Roof | L/180 |
| `Floor joists`, when a `joist.floor` exists | `joistSpan` | The largest clear gap between skid and girder lines | `FLOOR` | 1.0 | L/360 |
| `Loft joists`, when the loft is on and a `joist.loft` exists | `joistSpan` | width − 2 × (stud depth + 1-1/2 in for a hung loft): between the eave-wall plates, or between the ledgers | `LOFT[loads.loft]` | 1.0 | L/240 or L/360 |
| `{name} header ({side} wall)`, for each opening in `model.openings` | beam | The RO width: `right − left` | `eaveLoad` (8.7) | 1.0 with a loft share, else roof | L/360 with a loft share, else L/240 |
| `{Side} lean-to rafters` | `joistSpan` | `leanTo.rafterSpan`: horizontal, from the ledger face, or the wall's outside face for an extension, to the inner end of the beam seat | Roof + roof dead, at `addition.oc` | Roof | L/180 |
| `{Side} lean-to beam` | beam | `postSpacing`: post center to post center | Roof + roof dead over `beamTributary` | Roof | L/240 |
| `{Side} lean-to deck joists` | `joistSpan` | `deck.joistSpan`: ledger face to the beam's inner face | `FLOOR`, at `addition.deck.oc` | 1.0 | L/360 |
| `{Side} lean-to deck beam`, `deck.plies` plies of the deck joist size | beam | `postSpacing` | `FLOOR` over `deck.beamTributary` | 1.0 | L/360 |
| `Front girder`, `Inner girder`, `Back girder`, on a pier foundation | beam | The largest center-to-center gap between foundation piers along x | Floor tributary, plus the eave wall load on the outer lines | 1.0 | L/360 |

Joists, rafters, and headers use clear spans. Lean-to beams, deck beams, and girders use the
center-to-center spacing of their posts or piers.

Floor joist span:

1. Take the y extent of each `skid` and `girder` member.
2. Merge the extents that overlap (`mergeRanges`, 0.01 in tolerance).
3. Take the largest gap between neighbor lines.

Pier girders:

1. Merge the y extents of the `girder` members into lines. Take the center of each line.
2. Take the x of each foundation pier, rounded to 1/16 in, with no duplicates. A foundation pier is a `cylinder` solid with an id that starts with `FD`.
3. Set the span to the largest gap between neighbor pier x values.
4. Set the floor tributary of each line. It runs from midway to each neighbor line, or to the floor edge (y = 0 or y = width).
5. Give the first line (front) and the last line (back) the load `eaveLoad(wall, wall height)` too. The wall height is the top of the `wall.{side}` and `knee.{side}` framing.
6. Set total = 50 psf × floor tributary + the eave total load.
7. Set live = 40 psf × floor tributary + the eave live load.

### 8.7 Tributary loads

`eaveLoad(wall, wallAbove)` gives the line load on a header or an outer girder:

```
roofWidth = width/2 + eaveOverhang        front or back wall (eave wall)
          = oc/2 + rake                   left or right wall (end wall)
rake      = rakeOverhang; 0 when rakeOverhang < 1-1/2 in
loftWidth = loftSpan / 2                  eave wall with a loft; else 0

total plf = (roof + roofDead)·roofWidth/12 + (loftLive + loftDead)·loftWidth/12 + 10·wallAbove/12
live plf  = roof·roofWidth/12 + loftLive·loftWidth/12
floorLive = loftWidth > 0
```

- For a header, `wallAbove` is the top of the framing in `wall.{side}`, `gable.{side}`, and `knee.{side}`, less the header top, and at least 0.
- The header top is the RO top plus the header depth, or plus its thickness for a flat header.
- `frameRoof` builds no rake under 1-1/2 in, so the check counts no rake there.

Lean-to tributaries, horizontal, from `frameAdditions`:

```
beamTributary      = (beam line − ledger face) / 2 + (rafter tail − beam line)     ledger face = 0 for an extension
deck.beamTributary = deck.joistSpan / 2 + (beam outer face − beam inner face)
```

The beam line is the post centerline. An extension lean-to measures from the main wall's outside face.

Worked example (`tests/spans.test.ts`): the 8x10 preset's front window 24x36 header, 2-ply 2x8, SPF.

| Step | Value |
|---|---|
| Roof | 30 psf over 48 + 12 = 60 in = 5 ft: 150 plf |
| Wall above | 10 psf over 7-5/8 in, from the header top (82-1/4 + 7-1/4) to the framing top (97-1/8): 6.4 plf |
| F'b | 875 × 1.2 × 1.25 = 1,312.5 psi |
| S | 3 × 7.25² / 6 = 26.28 in³ |
| Bending span | √(8 × 1,312.5 × 26.28 / (156.4 / 12)) = 145.5 in. Bending governs. |

Shear can govern a short beam under a heavy load. In the 12x16 lean-to studio golden file, a 1-ply
2x10 front girder spans 45 in, and shear limits it to 57 in.

### 8.8 Warnings and basis text

`spanWarnings(checks, config)` makes a warning for each check where `allowed` is not `null` and
`span > allowed`. There is no tolerance.

- `source`: the check's `member`.
- `message`: `{lumber} spans {span}. {species label} allows {allowed} ({governs}; {basis}).` Lengths are in feet and inches (`formatLength`).

Example (`tests/spans.test.ts`): 2x4 rafters at 24 in on an 18 ft wide gable on a slab give "2x4 at 24"
o.c. spans 8' 8-11/16". Spruce-Pine-Fir No. 2 allows 8' 0-1/8" (bending; 20 psf roof live + 10 psf
dead, L/180)." The bending span is:

```
L = √(8 × 875 × 1.5 × 1.15 × 1.25 × 3.0625 / (60 / 12)) = 96.15 in       Fb × CF × Cr × Cd; S = 3.0625 in³; w = 60 plf
```

The roof label is `{loads.roof} psf roof {live|snow} + {loads.roofDead} psf dead`. It reads `live`
when `loads.roof` is 20.

| Check | `basis` |
|---|---|
| Rafters, lean-to rafters | `{roof label}, L/180` |
| Floor joists, deck joists | `40 psf live + 10 psf dead, L/360` |
| Loft joists | `{live} psf live + 10 psf dead, L/{limit}` |
| Header | `{roof label} over {roofWidth}[, loft {live} + {dead} psf over {loftSpan / 2}], wall 10 psf, L/{limit}` |
| Lean-to beam | `{roof label} over {beamTributary}, L/240` |
| Deck beam | `40 psf live + 10 psf dead over {deck.beamTributary}, L/360` |
| Girder | `Floor 40 + 10 psf over {tributary}[; {header load text}], L/360` |

### 8.9 What the user sees

The Warnings tab lists the warnings, then `SpanTable`, titled `Span checks: {species label}`.

| Column | Content |
|---|---|
| Member | `member`, with `basis` below it |
| Lumber | `lumber` |
| Span | `formatLength(span)` |
| Allowed | `formatLength(allowed)`, or — |
| Used | span / allowed, as a whole percent, or — |
| Governs | `governs`, or "No design values for this size" |

A row over its allowed span gets the class `over`. The Loads and species form section sets the
species, the roof load, the roof dead load, and the loft use.

### 8.10 Not checked

| Area | Not checked |
|---|---|
| Members | Studs; the ridge board; rafter and collar ties; skids; loft ledgers; loft edge joists, trimmers, hatch headers, and tail joists; posts; ramps; purlins, lookouts, fascia, rim joists, blocking, and deck boards |
| Foundation | Pier bearing on soil |
| Loads | Wind, seismic, and uplift; point loads; drift and unbalanced snow; lean-to loads on main-wall headers and girders; deck loads on the shed floor framing. The checks use uniform gravity loads on simple spans only. |
| Strength | Shear in joists and rafters, as in the AWC tables; bearing length; notches; lateral stability |
| Factors | Wet service, temperature, incising, flat use, and beam stability factors. PT members outdoors use dry-service values. |
| Other | Wall bracing; connections (the BOM counts hardware, it does not size it); grades other than No. 2; `1x4` and `6x6` (no design values); local code requirements |

DEVELOPER.md lists the same set under Span checks. Keep the two lists the same.

### 8.11 Edge cases

- Two openings with the same name on one wall give two checks with the same `member`. The 12x16 lean-to studio golden file has two `window 36x48 header (front wall)` checks.
- A pier foundation with 4 or more girder lines gives two or more checks named `Inner girder`.
- The floor joist span needs at least two skid or girder lines. One merged line gives a span of −∞. The config allows no fewer than 2 skids or 2 girder lines.

### 8.12 Change it safely

1. Add a check in `checkSpans` for each new member that carries load.
2. Use `joistSpan` for repetitive members, and the `beam` helper for single members.
3. Run the span table tests in `tests/spans.test.ts`. They pin `joistSpan` to published spans.
4. Update the not-checked list here and in DEVELOPER.md in the same change.
5. Read the SPAN lines in the golden diff before `npx vitest run -u`.

`tests/spans.test.ts` compares `joistSpan`, rounded to the nearest inch, with published span tables.
The tables are from the 2018 International Residential Code (IRC), as adopted in the 2018 Seattle
Residential Code:

| IRC table | Case | Example |
|---|---|---|
| R502.3.1(2) | Floor joists, 40 psf live, 10 dead, L/360 | DFL 2x8 at 16 in: 12' 9" |
| R502.3.1(1) | Sleeping areas, 30 psf live, L/360 | HF 2x10 at 16 in: 16' 10" |
| R802.4.1(1) | Rafters, 20 psf roof live, L/180, Cd 1.25 | DFL 2x6 at 16 in: 14' 7" |
| R802.5.1(2) | Ceiling joists, limited attic storage, L/240 | DFL 2x8 at 16 in: 16' 6" |

## 9. CSV formats

`src/core/out/csv.ts`. Both files follow these rules:

| Rule | Value |
|---|---|
| Separator | Comma |
| Row end | LF (`\n`), with a final LF |
| Quotes | A field with `"`, a comma, or LF goes in double quotes. An inner `"` becomes `""`. |
| Last row | `DISCLAIMER`, one field. So the header stays the first row. |
| File name | `{design name}.cutlist.csv` or `{design name}.bom.csv`. The name is lower case, each run of other characters becomes `-`, and an empty name becomes `shed`. |
| Type | `text/csv` |

### 9.1 Cut list CSV

`cutListCsv(lines, names)`:

| Column | Value |
|---|---|
| Mark | `mark` |
| Assembly | `names.assembly(assembly).label` |
| Part | `ROLES[role]` |
| Stock | The size, plus ` PT` |
| Qty | `ids.length` |
| Length (in) | `length`, decimal inches, for example `150.25` |
| Length | `formatInches(length)`, for example `150-1/4"` |
| Notes | `note`, or empty |

After the lines: one row with `LENGTH_RULE`, then `DISCLAIMER`.

Example (8x10 preset):

```
Mark,Assembly,Part,Stock,Qty,Length (in),Length,Notes
FD-1,Foundation,Skid,4x6 PT,3,120,"120""","Both ends cut 45° across the bottom, 1-7/8"" up and in, so the shed drags without digging in."
```

### 9.2 BOM CSV

`bomCsv(bom)`. The header is `Section,Item,Length,Qty,Unit,Price,Cost,Notes`.

| Section | Item | Length | Qty | Unit | Price | Cost | Notes |
|---|---|---|---|---|---|---|---|
| `Lumber`, one row for each group and stock length | `2x6` or `2x6 PT` | Stock length (`formatLength`) | Boards | `ea` | Group `basis` | boards × stock × rate / 12 | Empty |
| `Sheets` | `sheetLabel(sheet)` | Empty | Sheets | `sheets` | `basis` | `cost.total` | `{use}: {n} panels; ...` |
| `Concrete`, `Hardware`, `Roofing` | `item` | Empty | `quantity` | `unit` | `basis` | `cost.total` | `note` |
| `Total` | `Materials` | Empty | Empty | Empty | Empty | `costs.total` | `PRICE_NOTE` |

`DISCLAIMER` follows the Total row. A Cost cell holds dollars with two decimals and no `$`, for
example `9.00`. A Price cell holds the basis text, for example `$0.75 each`.

Example (8x10 preset):

```
Hardware,"Hurricane tie, rafter to plate",,12,ea,$0.75 each,9.00,One at each rafter seat: 1 per main rafter.
```

The BOM CSV does not hold special-order pieces, BOM warnings, waste, the cutting plan, or section
subtotals.

`tests/bom.test.ts` pins both headers, a quoted cut-list row, a hardware row, and the last rows of each
file.

## 10. Tests

| Test | Pins |
|---|---|
| `tests/bom.test.ts` | `packLumber` cases; too-long warnings; `packSheets`; hurricane ties, roof area, drip edge, piers, form tubes, slab, anchor bolts, post bases, loft hangers; prices and totals; CSV rows |
| `tests/spans.test.ts` | `joistSpan` against IRC tables; measured spans; header load; the over-span warning text; pier girder spans |
| `tests/piece.test.ts` | `cutKind`; piece dimensions; the cut-length key examples and notes |
| `tests/golden.test.ts` | For each design in `DESIGNS`, the full output against `tests/golden/*.txt` |
| `tests/every-design.test.ts` | One cut line for each member, unique marks, and finite numbers in the BOM, span checks, and piece drawings |

A golden file holds these lines, in this order. The examples with values come from
`tests/golden/12x16-lean-to-studio.txt`.

| Lines | Example |
|---|---|
| Cut lines: mark, qty, stock, length, part, and note | `FW-4      4  2x6       161-11/16"  Corner stud` |
| Model warnings | `WARNING {source}: {message}` |
| Solids by label | `SOLID Pier, 12" diameter x15` |
| Boards by size and stock length | `STOCK 2x6 9' 8-5/8" x25` |
| Sheets | `SHEETS 7/16" OSB, 4×8 x27` |
| Concrete, hardware, and roofing lines | `ITEM Concrete, 15 piers: 1.6 cu yd` |
| Costs by section, then the total | `COST total $3,673.64` |
| BOM warnings | `WARNING {mark}: {message}` |
| Span checks: span of allowed (governs), or `unchecked` | `SPAN Front girder: 1-ply 2x10 45" of 57" (shear)` |
| Span warnings | `WARNING {member}: {message}` |

`npm test` runs every test in Node. When a change alters a golden file on purpose, read the diff, then
run `npx vitest run -u`. The gate before a commit is `npm test`, `npm run lint`, and `npm run build`.
