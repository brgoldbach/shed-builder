# Outputs: cut list, bill of materials, span checks, CSV

The pure functions in `src/core/out` turn the model into what a builder cuts, buys, and checks. `App`
computes each one from the config ([ui.md, Data flow](ui.md#data-flow)). All lengths are inches.

## Terms

| Term | Meaning |
|---|---|
| Piece | One `Member` to cut. |
| Board | One stock board to buy. Pieces come from boards. |
| Stock length | A board length that a yard sells. |
| Cut line | Identical pieces under one mark: a `CutLine`. |
| Mark | The label written on each piece of a cut line, for example `RF-2`. |
| BOM line | One counted item of concrete, hardware, or roofing: a `Line`. |
| Kerf | The width of wood that one saw cut removes: `catalog.kerf`. |
| Panel | One piece of sheet goods: a `Solid` with `sheet` set and a `panel` shape. |
| Sheet | One 48 × 96 in stock sheet. |
| psf, plf | Load in pounds per square foot of surface; load in pounds per linear foot of member. |
| AWC, NDS | American Wood Council; its National Design Specification for Wood Construction. |
| Fb, Fv, E | Reference design values, psi: bending stress, shear stress parallel to grain, modulus of elasticity. |
| CF, Cr, Cd | Size factor, repetitive member factor, and load duration factor (8.4). |
| L/n | Deflection limit: the live-load deflection is at most the span divided by n. |
| Tributary width | The width of floor or roof that one member carries. |

Framing terms (RO, seat, long point, fly rafter, trimmer) are in [framing.md](framing.md#terms).
Soffit and extension lean-tos are in [additions-and-finishes.md](additions-and-finishes.md#1-lean-tos).

## 1. Cut list

`buildCutList(members, names)` (`src/core/out/cutlist.ts`) puts identical members on one cut line
and gives each line a mark.

### 1.1 `CutLine`

A line holds its mark, the fields that its pieces share, and `ids`. `ids.length` is the quantity.

### 1.2 Steps

| Step | Rule |
|---|---|
| Group | Members with the same assembly, role, size, `treated`, length to the nearest 1/16 in, and `note` share a line. The first member gives the line its fields. |
| Sort | By `names.rank(assembly)`, then by the role's key order in `ROLES`, then longest first. Ties keep the order of `model.members`: the sort is stable. |
| Mark | The assembly prefix, a hyphen, and the line number in its assembly, from 1: `FW-4`. |

### 1.3 Order and prefixes

`naming` gives `rank` and the prefix from the user's side names. The assembly order, the prefixes,
and the effect of `front: 'gable'` are in
[design-model.md §3.3](design-model.md#33-cut-list-order-and-marks).

### 1.4 Cut length

`LENGTH_RULE`: "Cut lengths run long point to long point, measured along the board: the shortest
board each piece comes from."

| Decision | Reason |
|---|---|
| Cut lengths run long point to long point along the board. | That length is the shortest board each piece comes from. The cut list and the BOM then use one length. |

A square-cut member's `length` is its length. `planeMember` (`src/core/gen/section.ts`) sets a
profiled member's `length` to the extent of its outline along the board. The BOM packs each piece at
this length, rounded as the cut list rounds it.

`LENGTH_RULE` is the only text of the rule. The Cut list tab hint, the cut list CSV, each piece
drawing, and the cut-length key read it.

### 1.5 Piece drawing and cut-length key

The piece drawing, the cut kinds, and the cut-length key are in
[drawings.md §4](drawings.md#4-piece-drawings-and-the-cut-length-key).

### 1.6 What the user sees

- The Cut list tab has Download CSV, Print, a hint, and `CutListTable`. The hint gives
  `LENGTH_RULE`, how to select a line, and a pointer to the "Measuring cut lengths" sheet.
- `CutListTable` has one table body for each assembly, under the assembly label. Its columns are
  Mark, Qty, Stock (`2x6 PT`), Length (`formatInches`), Part (the `ROLES` label), and Notes. The
  footer gives the total piece count.
- A click on a row selects its line, and a second click clears it
  ([ui.md, Selection](ui.md#selection)).
- `PieceInfo` shows the selected line: `{mark} {assembly}, {part}: {qty} × {stock} at {length}`.
  Below it are the piece drawing of the first member, fit to 420 × 160 px, and the note. Its ×
  button clears the selection.

### 1.7 Edge cases

- The group key has no `profile`. Two pieces with the same key and different angle cuts share one
  line. So a generator must state each cut difference in `note`.
- Members whose lengths round to the same 1/16 in share a line.
- A new line renumbers the later lines of its assembly. A mark is not stable across design changes.

### 1.8 Change it safely

- Put each cut difference between pieces into `note`.
- Keep `LENGTH_RULE` as the only text of the rule.
- A change to the key or the sort moves marks in the golden files.

## 2. Lumber

`lumberGroups(config, members)` and `packLumber` in `src/core/out/bom.ts` pack pieces onto stock
boards and price the boards.

### 2.1 Groups

- One group holds the pieces of one size and treatment, in the order of its first member. PT and
  untreated pieces never share a board.
- Each piece takes its cut-list length, to the nearest 1/16 in.
- `waste` is 1 − piece length / bought length, or 0 when nothing is bought. Kerf and offcuts count
  as waste.
- `cost.total` is bought length / 12 × `rate` (2.6).

### 2.2 Stock lengths

The stock lists, `maxLength`, and `maxOnePiece` are in
[design-model.md §5](design-model.md#5-lumber-catalog). The BOM packs from two lists:

| List | Stock lengths |
|---|---|
| `general` | `stockFor(catalog, size)`: up to `catalog.maxLength`. |
| `long` | Up to the larger of `maxLength` and `maxOnePiece`. |

| Decision | Reason |
|---|---|
| Only a piece longer than every `general` board opens a board from `long`. | The user sets the longest board to buy. Short pieces stay on those boards, even when a longer board packs tighter. |

### 2.3 `packLumber`

`packLumber(pieces, general, kerf, long = general)` returns `Board[]`, longest stock first. Each
comparison allows `NEAR` = 0.01 in.

| Name | Meaning |
|---|---|
| `cap` | The longest length in `general`. |
| Content | The sum of a board's piece lengths, plus one kerf between each pair of neighbors. |
| `shortestFor(length)` | The shortest stock that is at least `length`: from `general` up to `cap`, else from `long`. |

1. Give each piece that equals a stock length its own board.
2. Sort the other pieces, longest first.
3. Pack the sorted pieces two ways, by first fit. A piece goes on the first board where content +
   kerf + length ≤ stock. When no board has room, the piece opens a new board:
   - Way A opens it at `shortestFor(length)`.
   - Way B opens it at `cap`, or at `shortestFor(length)` for a piece longer than `cap`.
4. In each way, cut back each board to `shortestFor(content)`.
5. In each way, split each board of two or more pieces when a split buys less length. The options,
   in order, are the board as it is, each piece alone, and the longest piece alone with the rest on
   one board. A tie keeps the earlier option. The rest does not split again.
6. Take way B only when it buys more than 0.01 in less than way A.

Within one group the price is per foot, so the way that buys less length costs less. `packLumber` is
a heuristic. It does not search every arrangement, and a better cut plan can exist.

| Decision | Reason |
|---|---|
| A piece equal to a stock length takes that board whole. | Precut studs stay precut. No stud comes from a long board. |
| Two ways to open a board. | Way A suits pieces near a stock length. Way B lets many short pieces share one long board. |
| Cut back and split after first fit. | First fit can leave a board longer than its pieces need, or pieces that cost less on separate boards. |
| A split tie keeps the board as it is. | That option has the fewest boards. |

Example (`tests/bom.test.ts`, kerf 1/8 in, stock 92-5/8, 96, 120, 144): pieces of 92-5/8, 50, 40,
30, and 20. The 92-5/8 piece takes a whole board. Way A puts [50, 40] and [30, 20] on two 92-5/8
boards, 185-1/4 in. Way B puts all four on one 144 board, content 140-3/8. Way B wins.

### 2.4 Kerf

- A board takes one kerf between neighbor pieces. Its ends take none, and a whole-board piece takes
  none. A kerf of 0 is valid.
- Two 48 in pieces need 96-1/8 in, so they take a 120 in board, not a 96 in board.

### 2.5 Too-long pieces

A piece longer than the longest `long` stock, plus 0.01 in, goes to `tooLong`. It is not packed and
not priced.

`buildBom` groups the `tooLong` pieces of each lumber group by mark, and makes one warning for each
mark. The `source` is the mark. The message gives the count, size, and length, and the longest
`long` stock. It tells the user to splice the pieces or order them long.

| Decision | Reason |
|---|---|
| One warning for each cut line, with a count. | The pieces of a cut line share size and length, so one message covers them. Ten rafters give one warning, not ten. |

### 2.6 Prices

`rate` is `prices.lumber[size]`, dollars per linear foot, untreated. For PT, multiply it by
1 + `treatedMarkup` / 100. Each stock length costs `rate` per foot, precut studs too. The defaults
are `DEFAULT_PRICES` ([design-model.md §5.5](design-model.md#55-default-prices)).

### 2.7 Change it safely

- Round BOM pieces to 1/16 in, as the cut list does.
- Remove too-long pieces before each call of `packLumber`. A piece longer than every `long` stock
  opens a board of length `Infinity`.

### 2.8 What the user sees

The BOM tab shows, in order: the Cost table (7.2), Lumber, the Cutting plan, the BOM warnings,
Sheets, Concrete, Hardware, and Roofing. Notes on kerf, sheet offcuts, and net concrete volumes
close it. The warnings, Sheets, Concrete, Hardware, and Roofing show only when they have lines.

- Lumber: a header row for each group gives `{size}[ PT]`, the board count, the feet, the waste,
  the price basis, and the group cost. One row for each stock length gives the board count and
  count × stock × rate / 12.
- A Special order row counts the `tooLong` pieces, "Not priced". A note lists each by mark and
  length.
- Cutting plan, a fold: for each group, the boards by stock length. Boards with the same pieces show
  once, with a count: `{n} × {stock}: {mark} {length}, ...`.
- The Warnings tab lists the BOM warnings too.

## 3. Sheets

`sheetGroups(solids, kerf, prices)` and `packSheets(pieces, kerf)` in `src/core/out/bom.ts`.

### 3.1 Groups

| Item | Rule |
|---|---|
| Panels | Solids with `sheet` set and a `panel` shape, in one group for each `SheetKey`. A gambrel's gussets (`ply-15/32`) pack with the other 15/32 in plywood. |
| Piece | The rectangle around the panel outline. Holes and angled edges do not reduce the material. |
| Use | The label text before the first comma, for example `Wall sheathing`. So generators label panels `{use}, {sheet}`. |
| `waste` | 1 − Σ rectangle area / (count × 96 × 48). It counts holes and angled edges as used. |
| Cost | count × `prices.sheets[sheet]`. |

### 3.2 `packSheets`

`packSheets` fills 96 × 48 in sheets with shelves. A shelf is a strip along the 96 in length. Its
height runs across the 48 in width.

1. Sort the pieces by short side, widest first, then by long side, longest first.
2. Lay each piece with its long side along the sheet. A piece with a long side of 48 in or less can
   also turn.
3. Search each shelf of each sheet in order, in each orientation. Take the first shelf where across
   ≤ shelf height, and used + kerf + along ≤ 96.
4. Else open a new shelf on the first sheet where its height + kerf + short ≤ 48. The shelf height is
   the short side, and the piece lies long side along.
5. Else start a new sheet with that shelf.

A sheet takes one kerf between pieces on a shelf, and one kerf between shelves. The first piece and
the first shelf take none.

A panel larger than 48 × 96 in counts as one sheet of its own, and no other piece shares it.

### 3.3 What the user sees

The Sheets table has the columns Sheet (`sheetLabel`), Qty, Price, Cost, and Used for. Used for
lists `{use}: {n} panels` and the waste. The BOM note says that each panel comes from the rectangle
around it, and that offcuts are used again along the width of a sheet.

## 4. Concrete

`concrete(solids, prices)` in `src/core/out/bom.ts` counts the solids with `material: 'concrete'`.
Anchor bolts are `steel`, so they do not count.

### 4.1 Volume

| Shape | Parts | Volume |
|---|---|---|
| `box` | Main slab, thickened edge, lean-to slab | Δx × Δy × Δz |
| `cylinder` | Foundation and lean-to piers | π × r² × h |
| `panel` | Concrete ramp wedge | Outline area × `thick`, the ramp width |

`area` uses the shoelace formula, for a simple polygon. It ignores holes; ramp panels have none.

### 4.2 Bags or ready-mix

| Rule | Value |
|---|---|
| Volume | cu ft = Σ volume / 1728. cu yd = cu ft / 27, to 0.01. |
| Bags | ⌈cu ft / `BAG_YIELD`⌉. `BAG_YIELD` is 0.60 cu ft per 80 lb bag: QUIKRETE Concrete Mix No. 1101 data sheet. |
| Price | Under `BAGS_UNDER` (1 cu yd): bags × `concrete.bag`. Else cu yd × `concrete.readyMix`. The threshold compares the rounded cu yd. |

| Decision | Reason |
|---|---|
| A pour under 1 cu yd is priced in bags. | Ready-mix adds a short-load fee below about 1 cu yd. The fee itself is not in the price. |

### 4.3 BOM lines

| Line | Solids | Unit |
|---|---|---|
| `Concrete, slab` | Each `box` | cu yd |
| `Concrete, ramp`, or `Concrete, {n} ramps` | Each `panel` | cu yd |
| `Concrete, {n} piers` | Each `cylinder` | cu yd |
| `Form tube, {diameter}` | One for each pier, at `formTube` | ea |

A shape kind with no solids gives no line. Each line chooses bags or ready-mix from its own volume,
so a small ramp is in bags even next to a large slab.

Each pier, foundation or lean-to, uses `foundation.pier.diameter`, so one line covers the tubes.
A lean-to pier under a deck stops at the deck beam, so tube lengths can differ: the note then gives
the count at each length, for example `8 at 38", 3 at 45".`

### 4.4 What the user sees

The Concrete, Hardware, and Roofing tables have the columns Item, Qty, Unit, Price, Cost, and Notes.
The BOM note says that concrete volumes are net, and to add for waste and an uneven subgrade.

### 4.5 Change it safely

- Add a volume case for each new concrete shape kind.
- Group form tubes by diameter if lean-to piers get their own size.
- Give each concrete solid `material: 'concrete'`. Other materials do not count.

## 5. Hardware

`hardware(config, model)` counts connectors. A count of 0 gives no line. Each line is in `ea`, at
quantity × unit price. The default unit prices are `DEFAULT_PRICES.hardware`.

| Item | Quantity | Price key |
|---|---|---|
| Anchor bolt, 1/2", with nut and washer | Solids whose label starts with `Anchor bolt` | `anchorBolt` |
| Hurricane tie, rafter to plate | Main `rafter` members × seats, plus lean-to rafters × `leanTo.seats` | `hurricaneTie` |
| Post base, {size}; Post cap, {size} | One each for each member with role `post`, by size | `postBase`, `postCap` |
| Joist hanger, {size} | 5.1. One line for each size. | `joistHanger` |
| Joist hanger, double {loft joist} | 5.1 | `doubleHanger` |
| Ledger lag screw, 1/2" | Σ `leanTo.lags` | `lag` |
| Deck ledger lag screw, 1/2" | Σ `deck.ledgerLags` | `lag` |
| Beam seat, {plies}-ply {joist} | `deck.seats` of each lean-to with a deck | `postCap` |
| Ramp lag screw, 1/2" | 2 × `stringer` count | `lag` |

Count rules and reasons:

- **Anchor bolts.** The BOM counts the bolt solids that `frameWalls` places, on a slab only
  ([framing.md §5.7](framing.md#57-anchor-bolts-and-doorways)).
- **Hurricane ties.** One goes at each rafter seat, the rafter-to-plate connection. `frameAdditions`
  sets `leanTo.seats`. The line note states the rule.

  | Rafter | Seats |
  |---|---|
  | Main rafter, gable or gambrel roof | 1: it runs from one eave wall to the ridge. A gambrel's upper rafter (`rafter.upper`) has none. |
  | Main rafter, single-slope roof (`roof.style: 'lean-to'`) | 2: the front and back walls. |
  | Soffit lean-to rafter | 1, on its beam. Its high end hangs from the ledger. |
  | Extension lean-to rafter | 2, its beam and the main wall, when it has a birdsmouth on the main wall. Under a steeper main eave, as on a gambrel, it passes over the plate with no birdsmouth: 1. It laps the main rafter and is nailed to it, and that rafter's tie holds the plate. |
  | Fly rafter (`rafter.fly`) | None. |

- **Post bases and caps.** Each post, foundation or lean-to, takes one base and one cap. A lean-to
  post over a deck stands on the deck beam, so its base is on the beam. A deck post stands on a pier
  under the beam.
- **Ledger lags.** Two go at each main-wall stud behind a lean-to ledger. An extension lean-to has
  no ledger, so it has no lags ([additions-and-finishes.md, Lags](additions-and-finishes.md#lags)).
- **Deck ledger lags.** Two go at each deck joist, through the ledger into the floor framing
  ([additions-and-finishes.md, `DeckFacts`](additions-and-finishes.md#deckfacts)).
- **Beam seats.** Where the piers rise to the deck beam, a beam seat at each pier ties the beam to
  it. Where deck posts carry the beam, their post caps do.
- **Ramp lags.** Two go at each wood ramp stringer, into the floor framing. A concrete ramp has no
  stringers.

### 5.1 Joist hangers

| Member | Hangers for each member | Size |
|---|---|---|
| `joist.loft` | 2 in a hung loft, between the ledgers. 0 when the joists sit on the plates. | `roof.loft.joist` |
| `tail.loft` | 1, at the hatch header. 2 in a hung loft: also at the ledger. | `roof.loft.joist` |
| Soffit lean-to rafter | 1, at the ledger | The rafter's size |
| `joist.deck` | `deck.hangers`: 2 per joist, at the ledger and the beam. None on a gable end on the shed's foundation, where the joists sit on the skids or girders. | The joist's size |

Hangers of the same size add up to one line. A hung loft is `roof.loft.support: 'hung'`
([framing.md §9.4](framing.md#94-loft-floor)).

Double hangers: hatch headers, hatch trimmers, and loft edge joists are doubled
([framing.md §9.5](framing.md#95-hatches)). A doubled pair has two ends and takes one double hanger
at each end. So the double hanger count equals the member count. Headers always hang between
trimmers. Trimmers and edge joists hang only in a hung loft; otherwise they sit on the plates.

### 5.2 Not counted

Nails, screws, straps, and connectors other than those in the table. Siding, trim, doors, and
windows: `src/core/gen/finishes.ts` is for the 3D view only.

## 6. Roofing

`roofing(config, model)` reads `model.planes`: the main roof planes, then the lean-to planes. With
no planes, it gives no lines.

| Line | Rule |
|---|---|
| `Roof area, shingles`, `Roof area, metal panels` | Σ length × width / 144 for the planes of that type, to 0.1 sq ft. The note gives squares of 100 sq ft. |
| `Drip edge` | Eaves Σ length × `eaves`, plus rakes Σ 2 × width, in ft, to 0.1 ft. |

A main roof plane is metal unless `roof.roofing` is `shingles`. A lean-to plane is metal when it is
not sheathed. A sheathed lean-to takes shingles. The 3D roof uses the same rule
([additions-and-finishes.md §5](additions-and-finishes.md#5-finishes)).

| Plane | `eaves` |
|---|---|
| Main gable plane, main gambrel lower plane | 1. 0 when an extension lean-to takes over that eave. |
| Main gambrel upper plane | 0. |
| Main single-slope plane | 2: the low eave and the high edge. 1 when an extension lean-to takes over the low eave. |
| Lean-to plane | 1: its low eave. |

Each plane counts two rakes. A gambrel has two planes on each side, so each rake counts in two
segments. The ridge and the break take no drip edge.

The areas are net plane areas. They include no waste, starter, ridge cap, underlayment, or
fasteners. The metal area does not include `finishes.metalOverhang` past the eave.

## 7. Costs

### 7.1 Totals

`buildBom` sums `cost.total` for each section: `lumber`, `sheets`, `concrete`, `hardware`, and
`roofing`. `costs.total` is the sum of the five. `PRICE_NOTE` states what the prices cover.

| Decision | Reason |
|---|---|
| Prices are defaults that the user edits under Lumber catalog. They are retail estimates, before tax and delivery. | Prices change by place and time. The form tells the user to check them against a local yard. |

The default prices, their source, and `priceTable` are in
[design-model.md §5.5](design-model.md#55-default-prices).

The costs leave out:

- special-order lumber (`tooLong`);
- tax, delivery, and the ready-mix short-load fee;
- each item that the BOM does not count (5.2), and the roofing items that section 6 leaves out.

### 7.2 What the user sees

The Cost table is the first table on the BOM tab. It has one row for each section with a cost above
0, then the Total, then `PRICE_NOTE`.

### 7.3 Change it safely

Follow "Add a counted BOM item" in [DEVELOPER.md](DEVELOPER.md#add-a-counted-bom-item). Give the
item a unique `item` text in its section: `LineTable` keys its rows by it.

## 8. Span checks

`checkSpans(config, model, names)` (`src/core/out/spans.ts`) returns one `SpanCheck` for each member
group that it checks. `spanWarnings(checks, config)` makes a warning for each check over its allowed
span. The method is the AWC Span Tables for Joists and Rafters 2021, with NDS 2018 design values for
No. 2 lumber.

| Decision | Reason |
|---|---|
| The app is a planning aid, not a validated engineering tool. Span checks are a screen, not a design. | They cover simple spans under uniform gravity loads only (8.10). The form says: "They are a check, not an engineered design." `DISCLAIMER` (`src/core/disclaimer.ts`) closes each CSV file and each printed page. |

### 8.1 `SpanCheck`

A check gives the member group, its lumber, the measured span, the allowed span, what governs, and
`basis`: the load and limit text. `allowed` and `governs` are `null` for a size without design
values.

### 8.2 Design values

`SPECIES` (`src/core/catalog.ts`) holds No. 2 grade reference design values, psi, for normal load
duration and dry service. Source: NDS 2018 Supplement Table 4A (Douglas Fir-Larch, Hem-Fir,
Spruce-Pine-Fir "No. 1/No. 2") and Table 4B (Southern Pine, by nominal width, size factor included).

| Key | Label | Fb | Fv | E |
|---|---|---|---|---|
| `spf` (default) | Spruce-Pine-Fir No. 2 | 875 | 135 | 1,400,000 |
| `dfl` | Douglas Fir-Larch No. 2 | 900 | 180 | 1,600,000 |
| `hf` | Hem-Fir No. 2 | 850 | 150 | 1,300,000 |
| `sp` | Southern Pine No. 2 | By nominal width: 4 in 1100, 6 in 1000, 8 in 925, 10 in 800, 12 in 750 | 175 | 1,400,000 |

`bendingValue(species, size)` returns Fb × CF, psi. It reads the nominal thickness and width from the
size name. It returns `null` for a thickness below 2 or above 4: `1x4` and `6x6`. Southern Pine takes
its table value, and 4x sizes take the 2x values. The other species take Fb × CF.

CF, from NDS 2018 Supplement Table 4A adjustment factors, No. 2 grade:

| Nominal width (in) | 4 | 6 | 8 | 10 | 12 |
|---|---|---|---|---|---|
| 2 in thick | 1.5 | 1.3 | 1.2 | 1.1 | 1.0 |
| 4 in thick | 1.5 | 1.3 | 1.3 | 1.2 | 1.1 |

Section sizes are the dressed sizes in `LUMBER`
([design-model.md §5.1](design-model.md#51-sizes-and-stock-lengths)).

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

- The allowed span is the least of the three. `governs` names it. A tie goes to bending, then
  deflection, then shear.
- The deflection span is ∞ when wL = 0. The shear span is ∞ when F'v is `null`.
- With psi, in, and lb/in, each span is in inches.

`joistSpan(species, size, oc, load, duration)` uses the AWC Span Tables method for joists and
rafters:

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
| CF | 1.0 to 1.5, by size | Fb, in each check | NDS 2018 Supplement Table 4A |
| Cr (`REPETITIVE`) | 1.15 | Fb of joists and rafters only | NDS 2018 Supplement Table 4A adjustment factors |
| Cd, roof live | 1.25 | Roof checks when `loads.roof` is 20 | AWC Span Tables 2021, A.9: 7 days |
| Cd, snow | 1.15 | Roof checks when `loads.roof` is 30 or more | A.9: 2 months |
| Cd, normal | 1.0 | Floor, loft, and deck joists; each beam with floor or loft live load | |
| E | Not adjusted | Deflection | |

A beam with floor or loft live load (`floorLive`) takes Cd = 1.0 for its full load, the roof share
too. This is conservative: it uses the lowest Cd with the full load.

### 8.5 Loads

`loads.roof` is 20 psf of roof live load with no snow, or a design roof snow load of 30 psf or more.
The form tells the user to enter the design roof snow load from the building department, not the
ground snow load. `loads.roofDead` is the roof dead load. `loads.loft` selects the loft case:
`storage` or `sleeping`.

Load cases in `spans.ts`, from AWC Span Tables for Joists and Rafters 2021, Tables A-1 to A-4:

| Constant | Live psf | Dead psf | Limit | AWC case |
|---|---|---|---|---|
| `FLOOR` | 40 | 10 | L/360 | F-2: rooms other than sleeping areas |
| `LOFT.storage` | 20 | 10 | L/240 | C-2: limited attic storage |
| `LOFT.sleeping` | 30 | 10 | L/360 | F-1: sleeping areas and attic floors |
| Rafters | `loads.roof` | `loads.roofDead` | L/180 (`RAFTER_LIMIT`) | R-13 to R-24: no drywall ceiling on the rafters |

`WALL_DEAD` = 10 psf of wall face, for framing and sheathing above a header or on a girder.

### 8.6 The checks

| `member` | Method | Span | Load | Cd | Limit |
|---|---|---|---|---|---|
| `Rafters`; on a gambrel `Lower rafters` and `Upper rafters` | `joistSpan` | One check for each `model.rafterSpans` entry: horizontal clear spans | Roof + roof dead, at `roof.oc` | Roof | L/180 |
| `Floor joists`, when a `joist.floor` exists | `joistSpan` | The largest clear gap between the shed's skid and girder lines | `FLOOR` | 1.0 | L/360 |
| `Loft joists`, when the loft is on and a `joist.loft` exists | `joistSpan` | width − 2 × (stud depth + 1-1/2 in for a hung loft): between the eave-wall plates, or between the ledgers | `LOFT[loads.loft]` | 1.0 | L/240 or L/360 |
| `{name} header ({side} wall)`, for each opening in `model.openings` | beam | The RO width: `right − left` | `eaveLoad` (8.7) | 1.0 with a loft share, else roof | L/360 with a loft share, else L/240 |
| `{Side} lean-to rafters` | `joistSpan` | `leanTo.rafterSpan` | Roof + roof dead, at `addition.oc` | Roof | L/180 |
| `{Side} lean-to beam` | beam | `postSpacing`: post center to post center | Roof + roof dead over `beamTributary` | Roof | L/240 |
| `{Side} lean-to deck joists` | `joistSpan` | `deck.joistSpan` | `FLOOR`, at `addition.deck.oc` | 1.0 | L/360 |
| `{Side} lean-to deck beam`, `deck.plies` plies of the deck joist size | beam | `deck.beamSpan`; no check when it is 0 | `FLOOR` over `deck.beamTributary` | 1.0 | L/360 |
| `Front girder`, `Inner girder`, `Back girder`, on a pier foundation | beam | The largest center-to-center gap between foundation piers along x | Floor tributary, plus the eave wall load on the outer lines | 1.0 | L/360 |

Joists, rafters, and headers use clear spans. Lean-to beams, deck beams, and girders use the
center-to-center spacing of their posts or piers.

Rafter spans (`model.rafterSpans`, from `frameRoof`) run horizontally:

| `member` | From | To |
|---|---|---|
| `Rafters`, gable | The inner end of the seat | The ridge board face, or the ridge line with no ridge board |
| `Rafters`, single slope | The inner end of the front seat | The back seat |
| `Lower rafters` | The inner end of the seat | The break |
| `Upper rafters` | The break | The ridge board face, or the ridge line with no ridge board |

Floor joist span:

1. Take the y extent of each `skid` and `girder` member of the `foundation` assembly. A deck's own
   skids and girders do not count.
2. Merge the extents that overlap (`mergeRanges`, 0.01 in tolerance).
3. Take the largest gap between neighbor lines.

Pier girders:

1. Merge the y extents of the foundation `girder` members into lines. Take the center of each line.
2. Take the x of each foundation pier, rounded to 1/16 in, with no duplicates. A foundation pier is
   a `cylinder` solid with an id that starts with `FD`.
3. Set the span to the largest gap between neighbor pier x values.
4. Set the floor tributary of each line. It runs from midway to each neighbor line, or to the floor
   edge (y = 0 or y = width).
5. Give the first line (front) and the last line (back) the load `eaveLoad(wall, wall height)` too.
   The wall height is the top of the `wall.{side}` and `knee.{side}` framing.
6. Set total = 50 psf × floor tributary + the eave total load.
7. Set live = 40 psf × floor tributary + the eave live load.

The lean-to and deck spans and tributary widths come from `frameAdditions`: see
[`LeanTo` facts](additions-and-finishes.md#leanto-facts) and
[`DeckFacts`](additions-and-finishes.md#deckfacts).

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

- For a header, `wallAbove` is the top of the framing in `wall.{side}`, `gable.{side}`, and
  `knee.{side}`, less the header top, and at least 0.
- The header top is the RO top plus the header depth, or plus its thickness for a flat header.
- `frameRoof` builds no rake under 1-1/2 in, so the check counts no rake there.

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

### 8.8 Warnings

`spanWarnings(checks, config)` makes a warning for each check where `allowed` is not `null` and
`span > allowed`. There is no tolerance. The `source` is the check's `member`. The message gives the
lumber, the span, the species, the allowed span, what governs, and `basis`.

Example (`tests/spans.test.ts`): 2x4 SPF rafters at 24 in o.c. on an 18 ft wide gable on a slab span
8' 8-11/16". Bending allows 8' 0-1/8", so the check warns:

```
L = √(8 × 875 × 1.5 × 1.15 × 1.25 × 3.0625 / (60 / 12)) = 96.15 in       Fb × CF × Cr × Cd; S = 3.0625 in³; w = 60 plf
```

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
| Members | Studs; the ridge board; rafter and collar ties; a gambrel's gussets; skids, and a deck's own girders; loft ledgers; loft edge joists, trimmers, hatch headers, and tail joists; posts; ramps; purlins, lookouts, fascia, rim joists, blocking, and deck boards |
| Foundation | Pier bearing on soil |
| Loads | Wind, seismic, and uplift; point loads; drift and unbalanced snow; the thrust at a gambrel's break; lean-to loads on main-wall headers and girders; deck loads on the shed floor framing. The checks use uniform gravity loads on simple spans only. |
| Strength | Shear in joists and rafters, as in the AWC tables; bearing length; notches; lateral stability |
| Factors | Wet service, temperature, incising, flat use, and beam stability factors. PT members outdoors use dry-service values. |
| Other | Wall bracing; connections (the BOM counts hardware, it does not size it); grades other than No. 2; `1x4` and `6x6` (no design values); local code requirements |

### 8.11 Edge cases

- Two openings with the same name on one wall give two checks with the same `member`. The 12x16
  lean-to studio golden file has two `window 36x48 header (front wall)` checks.
- A pier foundation with 4 or more girder lines gives two or more checks named `Inner girder`.
- The floor joist span needs at least two skid or girder lines. One merged line gives a span of −∞.
  The config allows no fewer than 2 skids or 2 girder lines.

### 8.12 Change it safely

1. Add a check in `checkSpans` for each new member that carries load.
2. Use `joistSpan` for repetitive members, and the `beam` helper for single members.
3. Update the not-checked list (8.10) in the same change.

`tests/spans.test.ts` pins `joistSpan`, rounded to the nearest inch, to published span tables. The
tables are from the 2018 International Residential Code (IRC), as adopted in the 2018 Seattle
Residential Code:

| IRC table | Case | Example |
|---|---|---|
| R502.3.1(2) | Floor joists, 40 psf live, 10 dead, L/360 | DFL 2x8 at 16 in: 12' 9" |
| R502.3.1(1) | Sleeping areas, 30 psf live, L/360 | HF 2x10 at 16 in: 16' 10" |
| R802.4.1(1) | Rafters, 20 psf roof live, L/180, Cd 1.25 | DFL 2x6 at 16 in: 14' 7" |
| R802.5.1(2) | Ceiling joists, limited attic storage, L/240 | DFL 2x8 at 16 in: 16' 6" |

## 9. CSV formats

`src/core/out/csv.ts` writes both files under these rules:

| Rule | Value |
|---|---|
| Separator | Comma |
| Row end | LF (`\n`), with a final LF |
| Quotes | A field with `"`, a comma, or LF goes in double quotes. An inner `"` becomes `""`. |
| Last row | `DISCLAIMER`, one field. So the header stays the first row. |
| File | `fileName(config.name, 'cutlist.csv')` or `'bom.csv'`, type `text/csv` ([ui.md, Flows](ui.md#flows)). |

`cutListCsv(lines, names)` writes one row for each cut line. It gives the length twice: in decimal
inches, and as `formatInches` writes it. A row with `LENGTH_RULE` follows the lines, then
`DISCLAIMER`.

`bomCsv(bom)` writes these rows, under the header `Section,Item,Length,Qty,Unit,Price,Cost,Notes`:

| Section | Rows |
|---|---|
| `Lumber` | One for each group and stock length: the board count, the group's price basis, and the cost boards × stock × rate / 12. |
| `Sheets` | One for each sheet group. Notes lists `{use}: {n} panels; ...`. |
| `Concrete`, `Hardware`, `Roofing` | One for each BOM line, with its `note`. |
| `Total` | `Materials`, with `costs.total` and `PRICE_NOTE`. `DISCLAIMER` follows it. |

A Cost cell holds dollars with two decimals and no `$`, for example `9.00`. A Price cell holds the
basis text, for example `$0.75 each`.

The BOM CSV does not hold special-order pieces, BOM warnings, waste, the cutting plan, or section
subtotals.
