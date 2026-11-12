# Drawings and PDF plans

`buildDrawings` turns the config and the model into framing drawings, in inches, in sheet order.
`DrawingSvg` draws each one as SVG on the Framing tab. `plansPdf` writes each one on its own PDF
page, at a standard scale when one fits. Read [DEVELOPER.md](DEVELOPER.md) first for the overview
and conventions.

```
ShedConfig, Model, Naming, marks
  └─ buildDrawings (sheets.ts) ─▶ Drawing[]   inches, drawing y up, sheet order
       ├─ DrawingSvg (DrawingSvg.tsx) ─▶ SVG in px ─▶ FramingView: Framing tab, zoom viewer, Print
       └─ plansPdf (pdf.ts) ─▶ svg2pdf.js at a standard scale ─▶ landscape PDF, title blocks, QR sheet
Member, mark ─ pieceDrawing (piece.ts) ─▶ PieceInfo: the selected cut-list line, laid flat
```

## Terms

Framing terms (RO, layout, o.c., PT, long point, birdsmouth) are in
[framing.md, Terms](framing.md#terms). Member ids are in
[framing.md §1.2](framing.md#12-ids-and-roles), and cut-list marks in
[outputs.md §1](outputs.md#1-cut-list).

| Term | Meaning |
|---|---|
| Plan | A view down from above. |
| Elevation | A view square to one vertical face. Every elevation here is seen from outside the building. |
| Section | A view of a slice cut through the building. Members that the slice cuts show an X. |
| Sheet | One drawing of the plan set: one figure on the Framing tab, one page of the PDF. |
| Chain dimension | A row of consecutive dimensions between positions along one drawing side. |
| Running dimension | The distance from one origin to each position, as a tape hooked on the origin reads it. |
| Aligned dimension | One dimension between two points, in any direction. |
| Tier | One row of side dimensions at a fixed px distance from the drawing. Tier 1 is nearest. |
| Drawing side | `bottom`, `top`, `left`, or `right` of a drawing (`Side` in `drawing.ts`). It is not a building side. |
| Context shape | A member of another assembly, drawn dashed for reference. It has no id, so it cannot be picked. |
| User's front | The side the user calls the front. With `front: 'gable'` it is the model's left end ([design-model.md §3.1](design-model.md#31-the-quarter-turn)). |

## 1. The `Drawing` contract

`src/drawings/drawing.ts` declares `Drawing`, `Shape`, and `Dimension`. `src/drawings` reads the
model and never changes it.

### Units

- Drawing coordinates are inches. Drawing x runs along `View.right`, drawing y along `View.up`, and
  y is up.
- Dimension offsets, tier sizes, margins, and text sizes are px. They keep their size at every scale.
- In the PDF, 1 px of the SVG is 1 pt of paper.

### Rules that the types do not state

| Field | Rule |
|---|---|
| `id` | Unique in the set. The Framing tab uses it as the React key and the zoom-viewer key. |
| `shapes` | Back to front, context shapes first. Only `member` shapes carry an `id` and a `mark`, so only they can be picked. |
| `Shape.axis` | Undefined when the member points at the viewer. In a section view, such a member gets `cut`, and `DrawingSvg` draws an X on it. |
| `notes` | Keep them distinct: each note is a React key. |
| `wireframe` | Draws shapes without fill, so lower parts show through. Only the foundation plan sets it. |

### Dimensions

| Kind | Use for | Measures | Text |
|---|---|---|---|
| `chain` | Consecutive spans along one drawing side, such as RO edges or overhangs. | Each gap between successive `at` values. | `feet: true` uses `formatLength` (`8' 0"`); else `formatInches` (`96"`). |
| `running` | A layout that a tape reads from one origin. | `at − origin`, at each position. | `formatInches`. |
| `aligned` | A size in any direction, or inside the drawing. | The distance from `from` to `to`. With `along`, only its part along that direction. | `formatInches`. |

- `at` and `origin` are drawing coordinates along the side: x for `bottom` and `top`, y for `left`
  and `right`. Give `at` from low to high. `distinct` in `sheets.ts` sorts and drops repeats.
- A side dimension stands beyond the edge of the drawing's bounds, not beyond the points it measures.
  All dimensions of one tier align.
- A positive `offset` puts the aligned dimension to the left of the direction from `from` to `to`, or
  of `along`. For a left-to-right dimension, left is above. For an upward dimension, left is left.
- The aligned dimension line stands `offset` px beyond the farther of the two points. Without
  `along`, both points are equally far.

### Tiers

Tier n of a drawing side stands beyond tiers 1 to n − 1 of that side. A tier takes the size of its
largest dimension (`tierSize`). A tier number with no dimension takes no room. A chain tier has the
fixed size `CHAIN`. A running tier is its widest label plus 14 px, because running labels stand out
from the line.

### Labels, outlines, and `missing`

Section 5 gives how each one draws.

| Field | Content |
|---|---|
| `labels` | RO names only, at the RO center. `room` is the RO width in inches. |
| `outlines` | Dashed reference loops: the footprint (the outside of the walls) on the foundation, decks, loft, and roof plans, and the gusset on the gambrel rafter detail. |
| `missing` | The loops of left-out parts, in red. |

Decision: a left-out part shows as a red dashed outline on the drawings of its assembly. The user
then sees where the part goes and that the frame lacks it. The 3D view draws the same loop.

`missingIn(model, view, shows)` projects the `missing.outline` loop of each warning whose
`missing.assembly` passes `shows`. The loop is in model coordinates, so any view projects it. The
parts that the generators leave out are in
[framing.md §10](framing.md#10-warnings-and-left-out-parts) and
[additions-and-finishes.md §6](additions-and-finishes.md#6-warnings-and-left-out-parts).

| `missing.assembly` | Sheets that draw it |
|---|---|
| `wall.<wall>` | That wall elevation. |
| `gable.<wall>` | That gable-end elevation. |
| `knee.<wall>` | That knee-wall elevation. No generator leaves out a knee-wall part. |
| `loft` | Loft framing plan. |
| `roof` | Building section. |
| `addition.<side>` | Roof framing plan. |
| `ramp` | Foundation plan, and decks and ramps. |

## 2. Views and projection

### `View`

`View` holds `origin`, `right`, `up`, and `forward`: the line of sight, away from the viewer.
`project` is orthographic. `depthOf` is the distance along `forward`: a larger depth is farther from
the viewer.

Rule: every view has right × up = −forward. A view that breaks this rule draws a mirror image.

| View | Line of sight | Sheets |
|---|---|---|
| `planView(config)` | Down, the user's front at the bottom. | Foundation, floor, decks, loft, and roof plans |
| `elevationView(config, wall)` | Inward, square to the wall, from outside. | Wall, gable-end, and knee-wall elevations |
| Section | Along +x, from the model's left end. | Building section |
| `facing(forward)` | Along x, from the end that puts the rafter's low end on the left. | Common rafter, Gambrel rafters |
| Gussets | Along x, from the model's left end, the lower rafter on the left. | Gussets |

### Projection (`shapesOf`)

| Rule | Reason |
|---|---|
| A profiled member whose `axes.thick` runs along the line of sight keeps its projected profile. A panel seen square to its face keeps its outline. | The outline is exact, notches too. A gambrel gusset has an inside corner that the hull would lose. |
| Every other member or solid takes the convex hull of its projected corners (`hull`, `src/core/gen/section.ts`). | The hull is exact for a box from any direction. A profiled member seen other than square to its face loses its notches. |
| A cylinder is a circle in a plan. In a side view it is a rectangle, its diameter along `right`. | `right` is level in every view that sees a cylinder from the side. |
| Members and solids sort together by the mean depth of their corners, farthest first. | Painter's order: near shapes cover far shapes. It is not an occlusion test. |
| Context shapes go first, without a sort. | The sheet's own framing covers them. |

### Bounds

`layoutOf` passes `outlines` and `missing` to `bounds`, so a dashed or red loop outside the framing
stays on the sheet. Context shapes count in the bounds, but not in the dimensions, which use the
sheet's own framing. Side-dimension positions do not count: a position past the bounds lands in the
pad or outside the SVG.

### Plans: the user's front at the bottom

| `front` | Bottom of the plan | Left of the plan | Right of the plan |
|---|---|---|---|
| `eave` | Model front eave wall (y = 0) | Model left gable end (x = 0) | Model right gable end |
| `gable` | Model left gable end (x = 0), the user's front | Model back eave wall, the user's left | Model front eave wall, the user's right |

Decision: every plan puts the user's front at the bottom, also when the front is a gable end. The
plans then agree with the side names on every other sheet, and with how the user faces the shed.

With `front: 'gable'`, members turn a quarter turn on the page. Floor joists that run front to back
in the model run left to right, so `runningLayout` puts their layout on the left side.

### Elevations from outside

`elevationView` takes the wall frame of `wallFrames` ([framing.md §2.2](framing.md#22-wall-frames)).

- Drawing x is the distance along the wall from its left corner, seen from outside.
- Drawing y is the height above the floor surface.
- Depth 0 is the outside face of the wall framing. A depth equal to the stud width is the inside face.
- The fitted ROs in `model.openings` are in this frame. The sheets use them as drawing coordinates
  with no conversion, and do not compute them again.

Decision: every elevation is seen from outside. Left and right then match what a person outside the
wall sees, and layout runs from the left end as seen from there.

### Section view and cut marks

The model back is on the left of the section, and the model front on the right. With
`front: 'gable'`, the model's left end is the user's front.

`shapesOf(..., { section: true })` sets `cut` on each member whose length runs along the line of
sight: plates, the ridge board, skids, girders, and rims along the length. `DrawingSvg` draws the X
only on a 4-point polygon. The code does not test that the member crosses the cut plane.

### Context shapes

| Sheet | Context members |
|---|---|
| Wall elevation | Members of the other three walls whose depth range overlaps this wall's thickness: the ends of the adjacent walls. |
| Gable-end elevation | Every `rafter` and `rafter.upper`, and the end wall's `plate.top` and `plate.cap`, inside the wall's thickness. |
| Knee-wall elevation | `rim.loft`, inside the wall's thickness. |

## 3. Sheets

`buildDrawings(config, model, names, marks)` calls each sheet function in order and drops each
`null`. `marks` maps each member id to its cut-list mark.

| # | `id` | Title | Function | `null` when |
|---|---|---|---|---|
| 1 | `foundation` | Foundation plan | `foundationPlan` | Never |
| 2 | `floor` | Floor framing plan | `floorPlan` | No `floor` members (a slab) |
| 3 | `decks` | Decks and ramps | `deckPlan` | No deck or ramp framing, and no ramp concrete |
| 4 | `wall-<wall>`, four sheets | `<Wall label>, from outside` | `wallElevation` | Never |
| 5 | `gable-left`, `gable-right` | `<Gable label>, from outside` | `upperElevation` | No members in that gable assembly |
| 6 | `loft` | Loft framing plan | `loftPlan` | No `loft` members |
| 7 | `knee-front`, `knee-back` | `<Knee-wall label>, from outside` | `upperElevation` | No members in that knee wall |
| 8 | `roof` | Roof framing plan | `roofPlan` | Never |
| 9 | `section` | Building section | `buildingSection` | Never |
| 10 | `rafter` | Common rafter, or Gambrel rafters on a gambrel roof | `rafterDetail` | No `rafter` in assembly `roof` |
| 11 | `gussets` | Gussets | `gussetDetail` | Not a gambrel, or no gusset solids |
| 12 | `cut-lengths` | Measuring cut lengths | `cutLengthKey` (`piece.ts`) | No angled piece of a key kind |

Decisions:

- Each framing panel (wall, gable end, knee wall) has its own drawing, so the PDF has a page for
  each panel. An earlier wall elevation also drew the panel above it. That sheet mixed two panels
  with different layouts.
- Sheets follow the build order. Gable ends follow the walls. Knee walls follow the loft plan,
  because they stand on the loft deck.
- The wall sheets follow `names.sides`: the user's front, back, left, right. Gable-end and knee-wall
  sheets keep that order among their walls.
- Ids use the model's wall names. Titles use the user's names from `names.assembly`. With
  `front: 'gable'`, `wall-left` is titled "Front wall, from outside".

### Drafting rules

- A layout is a running dimension at tier 1, to the near edge of each member (`runningLayout`,
  `panelDims`). A framer marks a plate that way. At 16 in o.c. from a corner, the marks are
  15-1/4, 31-1/4, and on.
- Overall sizes are `feet` chains on the outermost tier (`overall`).
- The notes of each sheet state the origin of each layout and what each dashed line is.
- Keep aligned offsets small. The largest one sets the least pad on all four drawing sides
  (section 5).
- Use `along` when a dimension must read one component, such as a cut length along a board.

### Dimensions on each sheet

| Sheet | Dimensions |
|---|---|
| Foundation, skids or piers | Tier 1: a chain across the lines, from footprint edge to footprint edge through each line center (each pier center on piers). On piers, also a chain along the lines through each pier center. Tier 2: `overall` of the footprint. |
| Foundation, slab | Tier 2: `overall` of the footprint. |
| Floor | Tier 1: running, from the floor framing corner to each `joist.floor` and `joist.end`. Tier 2: `overall` of the floor framing. |
| Decks and ramps | Tier 1: `overall` of one box around the footprint, the framing, the posts, and the concrete panels. |
| Wall, gable end, knee wall | `panelDims` (3.4). |
| Loft | Tier 1: running, from the footprint corner to each `joist.loft`. Tier 2: `overall` of the loft and knee-wall members. |
| Roof | Tier 1: running, from the footprint corner to each `rafter` of assembly `roof`. Tier 2: chains on the bottom and right, framing edge, footprint edges, framing edge: the overhangs and the walls. Tier 3: `overall` of the framing. |
| Building section | Tier 1 chains, in inches. Right: the lower of the member bottom and 0, the floor surface, the front wall top, the member top. Top: the overhangs and the width. Left: the back wall top, only when it differs from the front wall top. |
| Rafter detail, Gussets, Cut-length key | Aligned dimensions only (3.6, 3.7, section 4). |

The front wall is on the right of the section, so its height chains on the right.

### 3.1 Foundation plan (`foundationPlan`, `foundation`)

The sheet shows the `foundation` members and the solids on layer `foundation`. It is a wireframe, so
piers show under the girders and posts.

- Dimensions run to the centers of the lines and piers, and a note says so.
- The chains use only the shed's own piers: concrete cylinders whose id starts with `FD`. Lean-to
  piers stand outside the footprint.
- A left-out ramp shows here too, because a design with no deck or ramp framing has no decks sheet.

Change safely: `lines[0]` must exist. The config gives skid and girder counts a minimum of 2. Keep
the `FD` id prefix, or change this filter with it.

### 3.2 Floor, loft, and roof plans (`floorPlan`, `loftPlan`, `roofPlan`)

- The floor plan draws only the `floor` members: no subfloor sheets and no footprint.
- The loft plan draws the loft and the knee-wall members.
- The roof plan draws every `roof` member and every lean-to member (`addition.*`).

### 3.3 Decks and ramps (`deckPlan`, `decks`)

The sheet shows, in plan: the `DECK_FRAMING` roles (deck ledgers, joists, beams, ramp stringers), a
deck's own skids and girders, the `post` members of each assembly with deck framing, and the
concrete ramp panels (layer `ramps`).

- The sheet leaves out the deck boards, so the framing under them shows.
- The shed's skids or girders that run on under a deck show on the foundation plan.
- The lean-to deck note reads `<Side> lean-to deck: PT <joist> joists at <oc>" o.c., <boards> deck boards,
  on the shed's foundation.` (or `on piers.`). A deck on a slab-founded shed reads `on piers.`
- Each ramp in `config.ramps` has a note, numbered from 1. A left-out ramp keeps its note.

Change safely: the dimension box and the bounds both include the footprint. The sheet then frames
the whole shed, with the decks and ramps beside it.

### 3.4 Panel elevations (`wallElevation`, `upperElevation`)

Each panel sheet shows only its own assembly. `panelDims` gives the dimensions of all three:

| Drawing side | Tier | Kind | Positions |
|---|---|---|---|
| Bottom | 1 | running | From the layout origin to the left edge of each `LAYOUT` member: `stud`, `king`, `cripple`, `stud.gable`. |
| Bottom | 2 | chain | Plate start, each RO left and right, plate end. Only when the panel has ROs. |
| Bottom | 3, or 2 without ROs | chain, feet | Plate start, plate end: the panel length. |
| Right | 1 | chain, feet | Framing bottom, framing top: the panel height. |
| Inside each RO | n/a | aligned, `INSIDE` | The RO width under its top edge. The sill height above `base`, when the RO bottom is above `base`. The RO height at its left edge. |

| Panel | Layout origin | ROs on the sheet | `base` |
|---|---|---|---|
| Wall | The left end of its bottom plate | Bottom below the wall framing top | 0, the floor surface |
| Gable end, built as a panel | The left end of its own bottom plate | Bottom at or above the gable framing bottom | The gable framing bottom |
| Gable end, cut in place | The left end of the end wall's bottom plate | Same | Same |
| Knee wall | The left end of its own bottom plate | Bottom at or above the knee-wall framing bottom | The knee-wall framing bottom |

Decisions:

- Layout and RO positions measure from the plate end, not the corner. A butted wall starts one wall
  depth in from the corner ([framing.md §5.1](framing.md#51-through-walls-and-butted-walls)).
- Jacks and corner studs are not in the layout dimension.
- RO sizes stand inside the opening, next to the RO they measure.
- A gable cut in place has no bottom plate, and its studs take the end wall's layout.
- The knee-wall sheet draws the loft deck's edge as `sheet` shapes, not as context: each loft sheet
  panel whose least depth is at the wall's outside face.

Change safely: the wall sheet and the gable sheet split the ROs by height. Keep the two tests
complementary.

### 3.5 Building section (`buildingSection`, `section`)

The slice is one rafter space (`roof.oc`) wide. It centers on the middle x of the `rafter` nearest
the middle of the length, or on the middle of the length without rafters. The overlap test is
strict, so the next rafter pair stays out. The note gives the cut position from the model's left
end, with the user's name for that end.

The cut position takes every member with role `rafter`, lean-to rafters too.

### 3.6 Common rafter or gambrel rafters (`rafterDetail`, `rafter`)

- The sheet draws the main-roof rafter nearest the middle of the length. This skips the gable-end
  rafters, which have no birdsmouth on a raised roof.
- On a gambrel, that rafter is a lower rafter. The sheet adds the `rafter.upper` in the same plane,
  on the same side.

`cutDims` reads the outline. The longest edge is the top edge. A seat is a level edge. A heel is a
plumb edge that shares a corner with a seat. A plumb-and-level tail is a heel and a seat too: the
sheet gives its plumb depth and its level cut. Its mark on the top edge falls on the tail end, so the
top-edge chain leaves it out, as it does any mark at the same point as the one before it.

| Dimension | Place |
|---|---|
| Top edge, from each end to each heel line | Above |
| Each seat | Below |
| Each heel | On the tail side, clear of the seat dimension |
| Cut length, tail long point to ridge long point, `along` the rafter | Below, clear of the seat dimension |
| Gambrel: the gusset along each top edge from the break | Above |

An upper rafter has no heel, so its cut length is its only dimension. On a gambrel, the dashed
gusset in `outlines` is the one nearest the viewer, on the upper rafter's side.

Change safely:

- `shares` compares corner objects by reference. Build the edges from the one `points` array.
- The top edge must be the longest edge, and the seats must be level.
- On a gambrel, the right end of the lower rafter's top edge must be the break.

### 3.7 Gussets (`gussetDetail`, `gussets`)

The sheet shows each gusset shape laid flat as cut, so the builder can cut them from the sheet.

- Each joint has a row: the break, and the peak when the gambrel has no ridge board. The break row
  is above the peak row.
- Each row shows one of each shape from the front slope: the common rafter's, then the gable-end
  rafter's. [framing.md §7.8](framing.md#78-gambrel-break-miter-and-gussets) gives the shapes.
  The sheet tells them apart by label and corner count.
- Rows and shapes stand 24 in apart. Each edge has an aligned dimension outside the shape.
- The notes give the angle where the top edges meet, and the count of each shape.

## 4. Piece drawings and the cut-length key

### Piece drawing (`pieceDrawing(member, mark)`)

`PieceInfo` shows one piece of the selected cut-list line in this drawing
([ui.md, Selection](ui.md#selection)). It fits the drawing in `ROOM` (420 × 160 px) with
`fitScale`, with no selection, and a click on it does nothing. `outlineOf` lays the piece flat:
length to the right, width up. A profiled member gives its profile. A square member gives a
rectangle, its length by its lumber width. The notes are `LENGTH_RULE`, then the member's `note`.

| `pieceDims` dimension | Shown |
|---|---|
| Cut length: leftmost point to rightmost point, along x | Always |
| Bottom edge and top edge: the extent along x | Only when longer than 1/32 in, and shorter than the cut length by 1/32 in |
| Board width, at the right end | Always |

### Cut kinds (`cutKind(outline)`)

An end is cut when the two long edges start (or end) more than 1/32 in apart.

| Kind | Test | Cut length | Why this rule |
|---|---|---|---|
| `square` | Neither end cut. | Either edge. | Both edges are the full length. The key shows no example. |
| `one-end` | One end cut. | The long side. | One edge runs the full length. |
| `toward` | Both ends cut, and one edge's extent holds the other's. | The long edge. | Both long points are on one edge. |
| `parallel` | Both ends cut, and neither edge holds the other. | Longer than either edge. | The long points are on opposite edges. Long point to long point along the board is more than either edge. |

The rule behind all four is `LENGTH_RULE` ([outputs.md §1](outputs.md#1-cut-list)). Example:
the 2x4 rafter at 6/12 in the 8x10 preset is `parallel`, with edges of 66-1/4 in. Its long points
lie 3-1/2 × 6/12 = 1-3/4 in farther apart, so its cut length is 68 in.

### Cut-length key (`cut-lengths`)

The key shows one example for each kind `one-end`, `toward`, and `parallel`, from the profiled
members.

- It picks the member with the fewest profile points, then the longest. The simplest outline reads
  best.
- The examples stack down the sheet, `KEY_GAP` apart. Each has `pieceDims` and a note from `KINDS`.
- The example shapes keep their member ids, so a click on one selects its cut-list line.

Edge case: the 14 in `KEY_GAP` is in drawing inches, but the dimensions between two examples are in
px. With 11 px text they take up to 67 px: 40 + 5.5 under the upper example, 16 + 5.5 over the
lower one. Below 67 / 14 = 4.8 px (or pt) per inch, their text can overlap.

## 5. SVG renderer (`DrawingSvg.tsx`)

### Layout (`layoutOf(drawing, fixedScale)`)

- The default scale is the largest that fits the bounds in `MAX_WIDTH` × `MAX_HEIGHT` px, at most
  `MAX_SCALE` px per inch. `fixedScale` replaces it.
- That limit applies to the bounds only. The pads come on top. CSS (`width: 100%`, with
  `max-width` the natural width) then shrinks the SVG to its figure.
- The pad of each side is `MARGIN` plus the larger of its tiers and `reach`: the largest aligned
  |`offset`| + `FONT`. The largest aligned offset thus sets the least pad on all four sides.
- Tiers, text, and margins keep their px size, so a small drawing gets wide pads around it.
- `px` maps a drawing point into the SVG. It flips y: drawing y up, SVG y down.

`fitScale(drawing, width, height, most)` gives the largest scale, at most `most`, at which the
drawing and its dimensions fit `width` × `height` px. It lays out at scale 0, which gives the pads,
and at scale 1. The result is exact, because the pads do not change with the scale. The PDF calls it
with no limit.

### Draw order

Shapes back to front, dashed `outlines`, red `missing` loops, labels, then dimensions. Labels and
dimensions draw last, so the framing never covers them.

### Rules

- A shape with an `id` calls `onPick(id)` on a click. Context shapes and solids have no `id`, so a
  click on them does nothing. [ui.md, Selection](ui.md#selection) gives what a pick does.
- Dashed outlines, red outlines, cut marks, and marks have `pointer-events: none`. A click through
  them reaches the member under them.
- A mark shows at the shape center, along the member's axis, only when it fits inside the shape.
- An RO label shows only when its width plus 2 × (`GAP` + `FONT`) = 50 px fits inside the RO width
  in px. The margin keeps the name clear of the RO height dimension inside the opening's left edge.
- `upright` turns text to read left to right or bottom to top, never upside down.
- Chain text sits on the line, at the middle of each gap. Running labels stand 6 px past the line,
  away from the drawing. On the bottom and top they stand on end and read upward.
- Chain text and labels have the `halo` class. On screen, a 4 px stroke in the surface color goes
  under each glyph, so text reads over lines. Running labels have no halo: they stand clear of the
  drawing.
- `textWidth` estimates the text width as characters × font size × `CHAR`. It sizes running tiers
  and decides when a mark or a label fits.
- Each tick is a 45° slash, as on architectural drawings.

### Lines and fills

| Class | Meaning | Style |
|---|---|---|
| `.shape.treated` | PT lumber | Green tint |
| `.shape.concrete` | Concrete | Grey tint |
| `.shape.sheet` | Sheet goods | Light tint |
| `.shape.steel` | Steel | Solid fill |
| `.shape.context` | Another assembly, for reference | No fill, grey, 4 3 dash |
| `.outline` | A reference loop (`outlines`) | No fill, grey, 6 4 dash |
| `.missing` | A left-out part | No fill, red, 1.5 px, 4 3 dash |
| `.shape.selected` | The selected cut-list line, on screen only | Accent tint |

Decision: fills carry meaning: PT, concrete, sheet goods, steel. Headers have no tint. A tint with
no legend read as an unexplained code.

`app.css` holds the screen styles. `STYLE` in `pdf.ts` holds the print styles, because the app's
theme colors do not suit paper. Print text is 9 px against 11 px on screen, so it crowds less at
small scales. The layout still makes room for 11 px text. The print style has no halo rule, so text
has no halo on paper.

## 6. The Framing tab and the zoom viewer

### Framing tab (`FramingView`)

The toolbar holds the paper choice, Download PDF, and Print. One figure for each drawing follows,
in sheet order: the title with a Zoom button, the SVG at its default scale, the notes, and the
notice (`DISCLAIMER`) for print only.

Decision: the Framing tab has no row of buttons that jump to each drawing. That row grew with each
wall, gable-end, and knee-wall sheet and took most of a phone's first screen. A scroll through the
sheets in order is quicker.

- The paper choice (Letter, the default, or Tabloid) applies to the PDF only.
- Download PDF loads `./pdf` on demand. While the PDF builds, the button reads "Making PDF…" and is
  disabled. The code has no `catch`, so an error shows no message.
- `fileName` in `App.tsx` names the PDF `<name>.plans.pdf` ([ui.md, Flows](ui.md#flows)).
- Print uses the print CSS in `app.css`. It hides the header, form, tabs, toolbars, piece box,
  viewer, and Zoom buttons. It sets black on white. It puts each figure on its own page, with the
  notice under it.
- Print fills the page width and is not at a standard scale. Use the PDF for a set to scale.

### Zoom viewer (`Viewer`)

The viewer covers the window as a dialog. It draws the drawing at its default layout, `zoom` times
its px size, at an offset in the canvas.

| Input | Action |
|---|---|
| Wheel | Zoom by e^(−0.0015 × `deltaY`) about the pointer. |
| `+` or `=` key, + button | Zoom in by 1.25 about the canvas center. |
| `-` key, − button | Zoom out by 1.25 about the canvas center. |
| Fit button | Fit the drawing to 95 % of the canvas, centered. The viewer also fits when it opens. |
| Drag | Pan. |
| Click with 4 px of travel or less | Pick a member, as on the tab. |
| `Escape` key, Close button | Close the viewer. |

- The zoom stays between 0.1 and 40. A zoom about a point keeps that point still.
- The wheel listener is not passive. It calls `preventDefault`, so the page does not scroll under
  the drawing.
- A click handler in the capture phase stops the click after a drag, so a pan never picks a member.
- The canvas sets `touch-action: none`. The viewer zooms on wheel events only, although its bar says
  "Scroll or pinch to zoom". The code has no handler for a two-finger touch pinch.
- The move handler does not filter by `pointerId`.

## 7. The PDF (`pdf.ts`)

`FramingView` imports `./pdf` only when the user clicks Download PDF. `pdf.ts` imports jsPDF,
svg2pdf.js, qrcode-generator, and `react-dom/server`, so all four stay out of the main bundle
([DEVELOPER.md, Decisions](DEVELOPER.md#decisions)). Keep every import of `pdf.ts` dynamic.

### One drawing sheet

`plansPdf(drawings, designName, paper, link)` makes a landscape document in pt, with one page for
each drawing.

- The drawing area is the inner width (page width − 2 × `MARGIN`) by the page height − 2 ×
  `MARGIN` − `BLOCK` − the notes height − 12 pt. The notes go under it. The title block goes at the
  foot of the page.
- The scale is the largest standard scale that fits (`pickScale`). `pickScale` sizes the drawing
  with `layoutOf` at each scale, so the size includes the pads.
- Without a standard scale, `fitScale(..., Infinity)` fills the area, and the title block reads "Not
  to scale".
- `svgOf` renders `DrawingSvg` to markup with no selection, and adds the print `STYLE`. `svg2pdf`
  draws it at the center of the drawing area.

### Standard scales (`scale.ts`)

`SCALES` holds 11 architectural scales, from 3" = 1'-0" down to 1/16" = 1'-0". `pointsPerInch` gives
paper pt per building inch: `inchesPerFoot / 12 × 72`.

Decisions:

- A standard scale lets a builder measure the paper with an architect's scale.
- The largest scale that fits gives the most detail.
- 3" = 1'-0" is the largest scale. A drawing that fits at 3" = 1'-0" with room to spare stays at
  that scale.
- Dimensions, text, and margins stay at their pt size at every scale, so text stays readable on a
  small-scale sheet.
- A standard scale always wins when one fits. The "Not to scale" fallback thus only makes a drawing
  smaller than 1/16" = 1'-0".

### Title block

`titleBlock` draws one boxed row across the inner width, at the foot of each page. Its cells hold
the notice (`DISCLAIMER`), the design name and app version, the sheet title and scale, and
`Sheet <n> of <total>` with the date (`YYYY-MM-DD`).

### QR sheet

With a share link, the last sheet holds the link as a QR code that opens the design, with a caption
and its own title block. With `link` null, the PDF has no QR sheet. `shareLink` is `null` until
`designToLink` resolves ([ui.md, Copy link](ui.md#copy-link)).

Decisions:

- `qrcode(0, 'L')` takes the smallest QR version that holds the link, so a longer link gives more,
  smaller modules.
- Level L error correction keeps a long link to the fewest modules. The link holds the whole design,
  so the code is dense: 77 to 105 modules.
- The 4-module quiet zone is what the QR standard asks.
- The code is `CODE` = 360 pt (5 in), less only when the room above the title block or the inner
  width is smaller. At 360 pt, a 105-module code prints each module over 1 mm: 127 mm / 113 cells.
  A phone camera reads that easily.
- The code has its own last sheet. A code in the title block was too fine to scan from paper.
- Each row's dark runs draw as one rectangle, 0.05 pt taller than a cell, so no seam shows between
  rows.

## 8. Change it safely

[DEVELOPER.md, Add a drawing sheet](DEVELOPER.md#add-a-drawing-sheet) gives the recipe. A new sheet
also needs:

- `null` when the design has nothing to show.
- A view that keeps the rule right × up = −forward (section 2).
- `missingIn(model, view, ...)` for each assembly that it draws
  ([DEVELOPER.md, Leave out a part](DEVELOPER.md#leave-out-a-part-that-cannot-be-framed)).
- Notes and dimensions under the drafting rules (section 3).
- A unique `id`, and a call at its place in the build order in `buildDrawings`.
- A row in the sheet table here, in the `missing` table when it draws left-out parts, and in the
  list in DEVELOPER.md.
- A CHANGELOG entry.
- An update to the id list of the test "gives each panel its own sheet, in build order", when the
  sheet shows on that design.

For any change:

- A new role shows in a layout, or on the decks sheet, only after you add it to `LAYOUT` or
  `DECK_FRAMING`. On other sheets, add it to the role filter of the sheet.
- A change to `bounds`, `layoutOf`, or a tier size moves every sheet. Check the PDF scales of a
  small and a large design after it.
- A change to the text sizes in `DrawingSvg` changes running tier sizes, label fit, and mark fit.
- No test renders `DrawingSvg`, `FramingView`, or `pdf.ts`. No test checks the decks sheet, the loft
  or roof plan dimensions, or `missing` on a drawing.
