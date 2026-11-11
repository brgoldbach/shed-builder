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

| File | Content |
|---|---|
| `src/drawings/drawing.ts` | `View`, `project`, `depthOf`, `shapesOf`, `bounds`, `memberTitle`, and the `Drawing`, `Shape`, `Dimension` types. |
| `src/drawings/sheets.ts` | `buildDrawings`, one function for each sheet, and their helpers. |
| `src/drawings/piece.ts` | `outlineOf`, `cutKind`, `pieceDrawing`, `cutLengthKey`. |
| `src/drawings/scale.ts` | `SCALES`, `pointsPerInch`, `pickScale`. |
| `src/ui/DrawingSvg.tsx` | `DrawingSvg`, `layoutOf`, `fitScale`. |
| `src/ui/FramingView.tsx` | The Framing tab and the zoom viewer (`Viewer`). |
| `src/ui/pdf.ts` | `downloadPlans`, `plansPdf`: the PDF plan set. |
| `src/ui/PieceInfo.tsx` | The piece drawing of the selected cut-list line. |

`src/drawings` is pure TypeScript, with no React and no DOM. It reads the model and never changes
it.

## Terms

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
| RO (rough opening) | The framed hole for a door or window, between the jacks, under the header, over the rough sill. |
| Layout | The positions of studs, joists, or rafters along a plate or rim. |
| o.c. | On center: the spacing between member centers. |
| PT | Pressure-treated lumber. |
| Long point | The farthest point of an angled end cut. A cut length runs long point to long point. |
| Birdsmouth | The notch where a rafter sits on a wall: a level seat and a plumb heel. |
| Mark | A cut-list line label, such as `RF-2`. `marks` maps each member id to its mark. |
| Context shape | A member of another assembly, drawn dashed for reference. It has no id, so it cannot be picked. |
| Left-out part | A part whose framing would collide. The model omits its members and keeps its loop in a warning. |
| Drawing side | `bottom`, `top`, `left`, or `right` of a drawing (`Side` in `drawing.ts`). It is not a building side. |
| User's front | The side the user calls the front. With `front: 'gable'` it is the model's left gable end (`src/core/naming.ts`). |

## 1. The `Drawing` type

### Units

- Drawing coordinates are inches. Drawing x runs along `View.right`, drawing y along `View.up`, and
  y is up.
- Dimension offsets, tier sizes, margins, and text sizes are px. They keep their size at every scale.
- In the PDF, 1 px of the SVG is 1 pt of paper.

### Fields

| Field | Type | Content |
|---|---|---|
| `id` | `string` | Unique in the set. The Framing tab uses it as the React key and the zoom-viewer key. |
| `title` | `string` | The figure caption, the viewer bar, and the PDF title block. |
| `shapes` | `Shape[]` | Projected members and solids, back to front. Context shapes come first. |
| `dims` | `Dimension[]` | Chain, running, and aligned dimensions. |
| `labels` | `{ at, text, room }[]` | Text centered at `at`. `room` is the width in inches that the text may take. Only RO names use labels. |
| `outlines` | `Point[][]` | Dashed reference loops. Four plans use one: the footprint, which is the outside of the walls. The gambrel rafter detail uses one: the gusset. |
| `missing` | `Point[][]` | Loops of left-out parts, projected into the view, drawn red and dashed. |
| `notes` | `string[]` | Sentences under the drawing. Keep them distinct: each note is a React key. |
| `wireframe` | `boolean`, optional | Draws shapes without fill, so lower parts show through. Only the foundation plan sets it. |

### Shapes

| `Shape` field | Content |
|---|---|
| `outline` | `polygon` (points) or `circle` (center, radius). Only a cylinder in a plan becomes a circle. |
| `kind` | `member`, `context`, or the solid's material: `concrete`, `sheet`, or `steel`. |
| `id` | The member id. Only `member` shapes have one, so only they can be picked. |
| `role`, `treated` | From the member. `treated` gives the PT fill. |
| `mark` | The member's mark from `marks`, on `member` shapes only. |
| `title` | The hover tooltip. Members use `memberTitle`: mark, role label, size, `PT`, length. Solids use their `label`. |
| `axis` | Unit vector of the member's length in the drawing. It is undefined when the member points at the viewer. |
| `cut` | True in a section view for a member with no `axis`. `DrawingSvg` draws an X on it. |

### Dimensions

| Kind | Fields | `DrawingSvg` draws | Text |
|---|---|---|---|
| `chain` | `side`, `tier`, `at`, `feet` | Extension lines, one dimension line, a tick at each position. | Each gap between successive `at` values. `feet: true` uses `formatLength` (`8' 0"`); else `formatInches` (`96"`). |
| `running` | `side`, `tier`, `origin`, `at` | Extension lines, one line from the origin to the last position, a tick at each position. | `at − origin` with `formatInches`, at each position. |
| `aligned` | `from`, `to`, `offset`, `along` | Two extension lines, the dimension line, two ticks. | The distance from `from` to `to`. With `along`, only its part along that direction. |

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
largest dimension. A tier number with no dimension takes no room.

| Dimension | Tier size |
|---|---|
| `chain` | 24 px (`CHAIN`). |
| `running` | The widest label, estimated, plus 14 px. Running labels stand out from the line, so their length sets the tier. |

### Labels, outlines, and `missing`

| Part | Drawn as | Source |
|---|---|---|
| Label | Text with a halo at the RO center. It shows only when its width plus 50 px fits inside the RO width in px. | `openingLabels` |
| `outlines` | Grey dashed loop (6 4 dash), no fill, no pick. | `footprint(config, view)` on the foundation, decks, loft, and roof plans; the gusset on the gambrel rafter detail |
| `missing` | Red dashed loop (4 3 dash, 1.5 px), no fill, no pick. | `missingIn(model, view, shows)` |

The 50 px label margin is 2 × (14 + 11) px. It keeps the name clear of the RO height dimension
inside the opening's left edge.

Decision: a left-out part shows as a red dashed outline on the drawings of its assembly. The user
then sees where the part goes and that the frame lacks it. The 3D view draws the same loop.

`missingIn` projects the `missing.outline` loop of each warning whose `missing.assembly` passes
`shows`. The loop is in model coordinates, so any view projects it.

| `missing.assembly` | Left out by | Sheets that draw it |
|---|---|---|
| `wall.<wall>` | An opening that collides (`leftOut`, `walls.ts`). | That wall elevation. |
| `gable.<wall>` | A gable opening that collides (`leftOut`, `roof.ts`). | That gable-end elevation. |
| `roof` | Collar ties that hit the ridge board or the peak gussets (`attic.ts`). | Building section. |
| `loft` | A loft hatch that collides (`attic.ts`). | Loft framing plan. |
| `addition.<side>` | A lean-to that cannot be framed (`additions.ts`). | Roof framing plan. |
| `ramp` | A ramp with too little rise (`ramps.ts`). | Foundation plan, and decks and ramps. |
| `knee.<wall>` | No generator leaves out a knee-wall part. | The knee-wall elevation passes it. |

## 2. Views and projection

### `View`

| Field | Meaning |
|---|---|
| `origin` | The model point at drawing (0, 0) and depth 0. |
| `right` | Unit model vector along drawing x. |
| `up` | Unit model vector along drawing y. |
| `forward` | Unit model vector of the line of sight, away from the viewer. |

- `project(view, point)` gives (dot(point − origin, right), dot(point − origin, up)). The
  projection is orthographic: it has no perspective.
- `depthOf(view, point)` gives dot(point − origin, forward). A larger depth is farther from the
  viewer.
- Every view in the code has right × up = −forward. A view that breaks this rule draws a mirror
  image.

| View | `origin` | `right` | `up` | `forward` | Sheets |
|---|---|---|---|---|---|
| `planView`, `front: 'eave'` | (0, 0, 0) | +x | +y | −z | Foundation, floor, decks, loft, roof plans |
| `planView`, `front: 'gable'` | (0, width, 0) | −y | +x | −z | Same |
| `elevationView(config, wall)` | Wall frame origin | Wall frame `u` | +z | Wall frame `v` | Wall, gable-end, knee-wall elevations |
| Section | (0, width, 0) | −y | +z | +x | Building section |
| `facing(forward)` | (0, 0, 0) | forward × up | +z | −x or +x | Common rafter, Gambrel rafters |

### `shapesOf(view, members, solids, marks, { context, section })`

1. Set `plan` when the line of sight is vertical: |`forward` z| > 1 − 1e-6.
2. Project the `corners` of each member: 8 box corners, or the profile on both faces.
3. If the member has a `profile` and `axes.thick` is parallel to `forward`, keep the projected
   profile of the first face. This is the exact outline, notches too.
4. Else take the convex hull of all projected corners (`hull`, `src/core/gen/section.ts`).
5. Set `axis` to the projected `axes.length`, normalized. Leave it undefined below a norm of 0.01.
6. Set `mark` from `marks` and `title` from `memberTitle`. Set `cut` when `section` is true and
   `axis` is undefined.
7. Project each solid. A `panel` gives its `panelCorners`, a `box` its 8 corners.
8. A cylinder in a plan gives a circle. In other views it gives 4 points: base and top, ± radius
   along `right`.
9. A panel seen square to its face (|(`u` × `v`) · `forward`| > 1 − 1e-6) keeps the projected
   `outline` of its first face: its exact outline. Other solids, except a cylinder in a plan, take
   the convex hull.
10. Give each shape the mean depth of its corners. Sort members and solids together, farthest first.
11. Put the `context` members first, as `context` shapes, without a sort.

Decisions:

- The hull is exact for a box from any direction, because a box is convex. A profiled member seen
  other than square to its face loses its notches.
- A panel seen square to its face keeps its exact outline, as a profiled member does. A gambrel
  gusset has an inside corner that the hull would lose.
- The sort is painter's order: near shapes cover far shapes. It compares one mean depth for each
  shape; it is not an occlusion test.
- Context shapes go first, so the sheet's own framing covers them.
- A cylinder's side view uses `right` for its width. This is correct because `right` is level in
  every view that sees a cylinder from the side.

### `bounds(shapes, loops)`

`bounds` gives the lower-left and upper-right corners around all polygon points, circle extents, and
`loops`. `layoutOf` passes the `missing` loops, so a red outline outside the framing stays on the
sheet. It does not pass `outlines`.

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

`elevationView` takes the wall frame from `wallFrames(width, length)` in `src/core/gen/walls.ts`.

| Wall | Frame origin | `u` (drawing x) | `v` (line of sight, inward) |
|---|---|---|---|
| `front` | (0, 0, 0) | +x | +y |
| `back` | (length, width, 0) | −x | −y |
| `left` | (0, width, 0) | −y | +x |
| `right` | (length, 0, 0) | +y | −x |

- Drawing x is the distance along the wall from its left corner, seen from outside.
- Drawing y is the height above the floor surface.
- Depth 0 is the outside face of the wall framing. A depth equal to the stud width is the inside face.
- `RoughOpening` positions (`left`, `right`, `bottom`, `top`) are in this frame. The sheets use them
  as drawing coordinates with no conversion. `frameWalls` records each fitted RO in
  `model.openings`, so the drawings do not compute them again.

Decision: every elevation is seen from outside. Left and right then match what a person outside the
wall sees, and layout runs from the left end as seen from there.

### Section view and cut marks

The section looks along +x, from the model's left end. The model back is on the left and the model
front is on the right. With `front: 'gable'`, the model's left end is the user's front.

`shapesOf(..., { section: true })` sets `cut` on each member whose length runs along the line of
sight. These are plates, the ridge board, skids, girders, and rims along the length. `ShapeView`
draws the X from corner to corner when the polygon has 4 points. The code does not test that the
member crosses the cut plane.

### Context shapes

| Sheet | Context members | Depth test |
|---|---|---|
| Wall elevation | Members of the other three walls. | Depth range overlaps (0.01, stud width − 0.01): the ends of the adjacent walls inside this wall. |
| Gable-end elevation | Every `rafter` and `rafter.upper`, and the end wall's `plate.top` and `plate.cap`. | Depth range inside [−0.01, stud width + 0.01]. |
| Knee-wall elevation | `rim.loft`. | Same as the gable end. |

Context shapes are grey and dashed. They count in `bounds`, but not in the dimensions, which use the
sheet's own framing.

## 3. Sheets

`buildDrawings(config, model, names, marks)` makes one `Context` (`config`, `model`, `names`,
`marks`), calls each sheet function in order, and drops each `null`. `tests/drawings.test.ts`
passes an empty `Map`, so its shapes have no marks.

| # | `id` | Title | Function | `null` when | `missing` assemblies |
|---|---|---|---|---|---|
| 1 | `foundation` | Foundation plan | `foundationPlan` | Never | `ramp` |
| 2 | `floor` | Floor framing plan | `floorPlan` | No `floor` members (a slab) | None |
| 3 | `decks` | Decks and ramps | `deckPlan` | No deck or ramp framing, and no ramp concrete | `ramp` |
| 4 | `wall-<wall>`, four sheets | `<Wall label>, from outside` | `wallElevation` | Never | `wall.<wall>` |
| 5 | `gable-left`, `gable-right` | `<Gable label>, from outside` | `upperElevation` | No members in that gable assembly | That gable |
| 6 | `loft` | Loft framing plan | `loftPlan` | No `loft` members | `loft` |
| 7 | `knee-front`, `knee-back` | `<Knee-wall label>, from outside` | `upperElevation` | No members in that knee wall | That knee wall |
| 8 | `roof` | Roof framing plan | `roofPlan` | Never | `addition.*` |
| 9 | `section` | Building section | `buildingSection` | Never | `roof` |
| 10 | `rafter` | Common rafter, or Gambrel rafters on a gambrel roof | `rafterDetail` | No `rafter` in assembly `roof` | None |
| 11 | `gussets` | Gussets | `gussetDetail` | Not a gambrel, or no gusset solids | None |
| 12 | `cut-lengths` | Measuring cut lengths | `cutLengthKey` (`piece.ts`) | No angled piece of a key kind | None |

Decisions:

- Each framing panel (wall, gable end, knee wall) has its own drawing, so the PDF has a page for
  each panel. An earlier wall elevation also drew the panel above it. That sheet mixed two panels
  with different layouts.
- Sheets follow the build order. Gable ends follow the walls. Knee walls follow the loft plan,
  because they stand on the loft deck.
- The wall sheets follow `names.sides`: the user's front, back, left, right. Gable-end and knee-wall
  sheets keep that order among their walls.
- Ids use the model's wall names. Titles use the user's names from `names.assembly`. With `front: 'gable'`, `wall-left` is titled "Front wall, from outside".

### Shared helpers in `sheets.ts`

| Helper | Does |
|---|---|
| `makeDrawing(id, title, parts)` | Fills empty `dims`, `labels`, `outlines`, `missing`, and `notes` under `parts`. |
| `distinct(values)` | Sorts the values. Drops each value within `NEAR` (0.01 in) of the one before. |
| `boxOf(points)` | The box around the points. |
| `extentOf(view, members)` | The box around the members' projected corners. |
| `footprint(config, view)` | The rectangle (0, 0) to (length, width) at z = 0, projected: the outside of the walls. |
| `overall(box, tier)` | Two `feet` chains at `tier`: the box width on the bottom, the box height on the right. |
| `across(view, member)` | The drawing axis that members advance along: y (1) when the length runs more along `right`, else x (0). |
| `runningLayout(view, members, origin)` | One running dimension at tier 1 from `origin` to the near edge of each member. |
| `panelDims(view, framing, openings, ...)` | The dimensions of a wall, gable end, or knee wall (section 3.4). |
| `openingLabels(openings)` | One label for each RO: its name at its center, with `room` = the RO width. |
| `missingIn(model, view, shows)` | The projected loops of the left-out parts whose assembly passes `shows`. |
| `pitchText(config)` | `Pitch 6/12 (26.6°).`: the rise per 12 and the angle to 0.1°. On a gambrel: `Pitch 20/12 (59.0°) lower, 6/12 (26.6°) upper.` |
| `UPPER` | The panel above each wall: `gable.left` and `gable.right` over the end walls, `knee.front` and `knee.back` over the eave walls. |
| `LAYOUT` | The roles in a panel's layout: `stud`, `king`, `cripple`, `stud.gable`. |

`runningLayout` steps:

1. Take the axis from the first member with `across`. All members must run the same way.
2. Take the near edge of each member: its lowest coordinate on that axis.
3. Pass the edges through `distinct`. Drop each edge at or before `origin` + 0.01 in.
4. Put the dimension on the bottom for axis x, or on the left for axis y.

Decision: layout runs to the near edge of each member, as a framer marks a plate. At 16 in o.c.
from a corner, the marks are 15-1/4, 31-1/4, and on.

### 3.1 Foundation plan (`foundationPlan`, `foundation`)

Shows the members of assembly `foundation`: skids, girders, posts. Shows the solids on layer
`foundation`: piers, the slab and its thickened edge, anchor bolts, lean-to piers and slab. The view is the plan, as a wireframe, with
the dashed footprint.

1. Take `planView`, the footprint, and the footprint's box.
2. For a slab, add the notes only.
3. For skids or piers, take the `lines`: the `skid` or `girder` members. Set `side` to
   `across(view, lines[0])`, and `along` to the other axis.
4. For piers, take the centers of the shed's own piers: concrete cylinders whose id starts with
   `FD`. Lean-to piers stand outside the footprint, so the chains leave them out.
5. Add a tier-1 chain across the lines: footprint edge, each line center, footprint edge. For piers,
   the centers across come from the pier centers.
6. For piers, add a tier-1 chain along the lines: footprint edge, each pier center, footprint edge.
7. Add `overall` at tier 2 on the footprint box.

An axis-x chain goes on the bottom, an axis-y chain on the right (`sideOf`).

| Foundation | Notes |
|---|---|
| `slab` | `<thickness> slab`, with the thickened edge width and depth when set. Anchor bolts: 1/2", the end distance, the largest spacing, none in doorways. |
| `pier` | Pier diameter, depth below grade, height above grade, largest spacing. Girder count, plies, and size. Post size and length when `post` is not `none`. Then "Dimensions run to the centers of the lines and piers." |
| `skid` | `<count> PT <size> skids on edge, the full length.` Then "Dimensions run to the centers of the lines and piers." |

Example (10x12 lean-to on piers, `tests/drawings.test.ts`): the girder lines chain on the right at
[0, 5, 60, 115, 120]. The piers chain on the bottom at [0, 5, 72, 139, 144].

Decisions:

- `wireframe: true`, so piers show under the girders and posts.
- Dimensions run to the centers of the lines and piers, and a note says so.
- A left-out ramp shows here too. A design with no deck or ramp framing has no decks sheet.

Change safely: `lines[0]` must exist. The config gives skid and girder counts a minimum of 2. The
`FD` id prefix separates the shed's piers from lean-to piers; keep it if the pier ids change.

### 3.2 Floor framing plan (`floorPlan`, `floor`)

`null` when the design has no `floor` members, as on a slab.

Shows: the floor members in plan. It draws no subfloor sheets and no footprint.

| Drawing side | Tier | Kind | Positions |
|---|---|---|---|
| Across the joists | 1 | running | From the framing box corner to the near edge of each `joist.floor` and `joist.end`. |
| Bottom, right | 2 | chain, feet | The framing box. |

Notes:

- `[PT ]<joist> joists at <oc>" o.c., <subfloor label> subfloor.`
- "Layout runs to the near edge of each joist."
- "Blocking at mid-span.", only when `floor.blocking` is on.

Example (8x10 with `front: 'gable'`): the running dimension is on the left, from 0, at [15.25,
31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 118.5]. The last position is the end joist.

### 3.3 Decks and ramps (`deckPlan`, `decks`)

`null` when no member has role `ledger.deck`, `joist.deck`, `beam.deck`, or `stringer`, and no solid
is on layer `ramps`.

Shows, in plan:

- Deck ledgers, joists, and beams, and ramp stringers (`DECK_FRAMING`), and a deck's own skids and
  girders. The shed's skids or girders that run on under a deck show on the foundation plan.
- The `post` members of each assembly that has deck framing: the posts that stand on the deck beam, and any deck posts under it.
- Concrete ramp panels (layer `ramps`).
- The dashed footprint.

It leaves out the deck boards (`decking`), so the framing under them shows.

Dimensions: `overall` at tier 1, in feet, on one box around the footprint, the framing, the posts,
and the concrete panel corners.

Notes, in order:

1. One for each lean-to with a deck: `<Side> lean-to deck: PT <joist> joists at <oc>" o.c. in
   hangers, 2x6 deck boards.`
2. One for each ramp in `config.ramps`, numbered from 1. A left-out ramp keeps its note.
   - Wood: `Ramp <n>: PT <stringer> stringers at <oc>" o.c., 1 in <slope>, 2x6 deck boards.`
   - Concrete: `Ramp <n>: concrete, 1 in <slope>, over a <thickness> base.`
   - Both add `Its foot is <depth> below grade.` when `belowGrade` is above 0.
3. "The dashed line is the outside of the walls."

Change safely: a new deck or ramp role shows here only when you add it to `DECK_FRAMING`. The
dimension box and the `layoutOf` bounds both include the footprint, so the sheet frames the whole
shed with the decks and ramps beside it.

### 3.4 Wall elevations (`wallElevation`, `wall-<wall>`)

Always four sheets. Each shows the members of `wall.<wall>` only. The gable end or knee wall above
has its own sheet. Context shapes show the ends of the adjacent walls at the corners.

1. Take `elevationView(config, wall)` and the wall framing.
2. Take the plate box: the extent of the `plate.bottom` and `plate.sill` members.
3. Take the ROs of this wall whose bottom is below the framing top − 0.01 in, sorted by `left`.
   A higher RO belongs to the gable-end sheet.
4. Call `panelDims` with `origin` = the plate start, `span` = plate start to plate end, `base` = 0.
5. Add `openingLabels` and the left-out ROs of `wall.<wall>`.

`panelDims` gives:

| Drawing side | Tier | Kind | Positions |
|---|---|---|---|
| Bottom | 1 | running | From `origin` to the left edge of each `stud`, `king`, `cripple`, and `stud.gable`. |
| Bottom | 2 | chain | Plate start, each RO left and right, plate end. Only when the panel has ROs. |
| Bottom | 3, or 2 without ROs | chain, feet | Plate start, plate end: the panel length. |
| Right | 1 | chain, feet | Framing bottom, framing top: the panel height. |
| Inside each RO | n/a | aligned, −14 px (`INSIDE`) | The RO width under its top edge. The sill height from `base`, when the RO bottom is above `base`. The RO height at its left edge. |

Notes: `<stud> studs at <oc>" o.c.` and "Layout and RO (rough opening) positions run from the left
end of the bottom plate, viewed from outside."

Example (8x10 gable on skids, front wall):

| Dimension | Value |
|---|---|
| Running, from 3.5 | [15.25, 31.25, 45, 63.25, 73.5, 79.25, 95.25, 111.25] |
| RO chain | [3.5, 48, 72, 116.5] |
| Length chain | [3.5, 116.5], feet |
| Height chain | [0, 97.125], feet |
| RO aligned | 24 (width), 46.25 (sill height), 36 (height) |

Decisions:

- Layout is a running dimension from the left end of the bottom plate. It reads straight off a tape
  hooked on the plate end.
- The labels measure from the plate end, not the corner. An eave wall that fits between the end
  walls starts 3-1/2 in from the corner.
- Jacks and corner studs are not in the layout dimension.
- RO sizes stand 14 px inside the opening, next to the RO they measure.

Change safely: a new vertical role is in the layout only after you add it to `LAYOUT`. The wall
sheet and the gable sheet split the ROs by height; keep the two tests complementary.

### 3.5 Gable-end elevations (`upperElevation`, `gable-left`, `gable-right`)

`null` when the gable assembly has no members. A lean-to roof also has them: the framing above each
end wall.

Shows: the gable members, the end rafters (lower and upper on a gambrel) and the end wall's top and
cap plates as context shapes, and the gable ROs.

1. Take the gable framing, its box, and its own `plate.bottom` members.
2. Find the layout origin.
   - Built as a panel (`roof.gablePanel`): the left end of the gable's own bottom plate.
   - Cut in place (no bottom plate): the left end of the end wall's bottom plate. The gable studs
     take the wall's layout.
3. Take the ROs of this wall whose bottom is at or above the gable framing bottom − 0.01 in.
4. Call `panelDims` with `base` = the gable framing bottom. The height chain runs from the top of the
   end wall's top plate to the peak.

| Gable | Notes |
|---|---|
| Panel | `<stud> gable studs on the <oc>" wall layout, top cut to the gable top plates.` "Built as a panel. Frame it flat on the floor. Stand it on the end wall. Nail the bottom plate down to the top plate." Then the origin note for the panel's bottom plate. |
| Cut in place | The same first note. "Cut in place. Cut each stud to fit between the end wall's top plate and the gable top plate. Toenail both ends." Then the origin note for the end wall's bottom plate. |

Example (8x10, left gable, cut in place): running from 0 at [15.25, 31.25, 63.25, 79.25]; length
chain [0, 96]; height chain [97.125, 119.46875]. As a panel, the origin and the plate start move to
5.5625 in (5-9/16 in), where the 2x4 end rafters clear the plate.

### 3.6 Loft framing plan (`loftPlan`, `loft`)

`null` when no member has assembly `loft`.

Shows: the loft members and the knee-wall members in plan, and the dashed footprint.

| Drawing side | Tier | Kind | Positions |
|---|---|---|---|
| Across the joists | 1 | running | From the footprint corner to the near edge of each `joist.loft`. |
| Bottom, right | 2 | chain, feet | The box of the loft and knee-wall members. |

Notes: `<joist> loft joists at <oc>" o.c.` and "Layout runs to the near edge of each joist. The
dashed line is the outside of the walls." A left-out hatch shows as a red outline.

### 3.7 Knee-wall elevations (`upperElevation`, `knee-front`, `knee-back`)

`null` when the knee wall has no members.

Shows:

- The knee-wall members.
- The loft rim under it (`rim.loft`), as a context shape.
- The loft deck's edge: each loft `sheet` panel whose least depth is within 0.01 in of the wall's
  outside face. It draws as a `sheet` shape, not as context.

The layout origin is the left end of the knee wall's own bottom plate. `panelDims` takes `base` =
the knee-wall framing bottom.

Notes: `<knee stud> studs at <oc>" o.c., on the wall layout. The loft rim below is dashed.` and
"Layout runs from the left end of the bottom plate, viewed from outside."

Example (8x10 with a loft and 36 in knee walls, front): the rim spans 3.5 to 116.5 at heights
97.125 to 102.625. Two deck sheets cover 3.5 to 96 and 96 to 116.5 at 102.625 to 103.34375.

### 3.8 Roof framing plan (`roofPlan`, `roof`)

Always present.

Shows: every `roof` member (rafters, ridge, fascia, rake ladders, purlins, ties) and every lean-to
member (`addition.*`), in plan, with the dashed footprint.

| Drawing side | Tier | Kind | Positions |
|---|---|---|---|
| Across the rafters | 1 | running | From the footprint corner to the near edge of each `rafter` of assembly `roof`. |
| Bottom | 2 | chain | Framing edge, footprint edges, framing edge: the rake overhangs and the length. |
| Right | 2 | chain | Framing edge, footprint edges, framing edge: the eave overhangs and the width. |
| Bottom, right | 3 | chain, feet | The framing box. |

Notes: `<rafter> rafters at <oc>" o.c.` with `pitchText`, and "Layout runs from the end wall to the
near edge of each rafter. The dashed line is the outside of the walls." A left-out lean-to shows
its footprint at grade as a red outline.

### 3.9 Building section (`buildingSection`, `section`)

Always present.

1. Find `cut`: the middle x of the `rafter` member nearest the middle of the length. Without
   rafters, use the middle of the length.
2. Take the slice from `cut − roof.oc / 2` to `cut + roof.oc / 2`: one rafter space wide.
3. Take each member and solid whose x range overlaps the slice. The overlap test is strict, so the
   next rafter pair stays out.
4. Project with the section view and `section: true`.
5. Add the dimensions.

| Drawing side | Tier | Kind | Positions |
|---|---|---|---|
| Right | 1 | chain | The lower of the member bottom and 0, the floor surface (0), the front wall top, the member top. |
| Top | 1 | chain | Member left edge, 0, width, member right edge: the overhangs and the building width. |
| Left | 1 | chain | 0, the back wall top. Only when the back wall top differs from the front by more than 0.01 in. |

The chains are in inches, not feet. The front wall is on the right of this view, so its height
chains on the right.

Notes:

- `Through the rafters <cut> from the <left> end, viewed from the <left> end.`, then `pitchText`.
- "Members cut by the section show an X."

`<left>` is the user's name for the model's left end: `left`, or `front` with `front: 'gable'`.

Example (8x10): the cut is 48 in from the left end, and the slice holds 2 rafters. The ridge has an
X. The height chain starts [−11.71875, 0, 97.125]: subfloor, joist, and skid under the floor
surface, then the wall.

`cut` takes every member with role `rafter`, lean-to rafters too. `rafterDetail` takes only the
rafters of assembly `roof`.

### 3.10 Common rafter or gambrel rafters (`rafterDetail`, `rafter`)

`null` when no `rafter` has assembly `roof`. The title is `Gambrel rafters` on a gambrel roof, else
`Common rafter`. The id is `rafter` for both.

1. Take the main-roof rafter whose first corner is nearest the middle of the length. This skips the
   gable-end rafters, which have no birdsmouth on a raised roof. On a gambrel, it is a lower rafter.
2. On a gambrel, take the upper rafter in the same plane on the same side: the `rafter.upper`
   within 1 in of the rafter's x range whose mean y is nearest the rafter's.
3. View the rafter from the model's right end (`facing([-1, 0, 0])`). If its lowest corner is right
   of its highest, view it from the model's left end. The low end is then on the left.
4. Project the rafters. Their `axes.thick` runs along the line of sight, so each outline is the
   exact profile. A gable rafter has 7 corners: tail, heel, seat, ridge plumb cut, and top edge.
5. For each rafter (`cutDims`), take the edges of the outline. The longest edge is the top edge.
6. Take the seats: level edges. Take the heels: plumb edges that share a corner with a seat.
7. When the rafter has heels, mark points on the top edge: its left end, the point above each heel,
   its right end. An upper rafter has no heel, so its cut length is its only dimension.
8. Add the dimensions.
9. On a gambrel, add the gusset.

| Dimension | Kind | Offset |
|---|---|---|
| Top edge, between successive marked points | aligned, along the edge | 16 px, above |
| Each seat, left to right | aligned | −30 px, below |
| Each heel, bottom to top | aligned | 16 px, on the tail side, clear of the seat dimension |
| Cut length, tail long point to ridge long point | aligned, `along` the rafter | −56 px, below, clear of the seat dimension |
| Gambrel: the gusset along each top edge from the break | aligned | 40 px |

The gusset on a gambrel:

1. Take the `Break gusset` panels in the rafter's plane, on the upper rafter's side.
2. Take the one nearest the viewer: the least depth. Its face is square to the view, so it keeps its
   exact outline (section 2): 5 corners on a common rafter.
3. Put its outline in `outlines`. It draws as a dashed loop.
4. Find the break: the right end of the lower rafter's top edge. Take the gusset corner nearest it,
   and the two corners next to that corner.
5. Add one dimension from each of the two corners to the break corner: 12 in (`GUSSET`) each.

Notes:

- `<mark>: <size>, <length> long point to long point.` for each rafter, lower first, then
  `pitchText`.
- Each rafter's own `note`, when it has one.
- "Top-edge dimensions run from each end of the top edge to the heel lines."
- On a gambrel: "Dashed: the plywood gusset on each face, dimensioned along the top edges from the
  break. The Gussets sheet gives its shape."

Example (8x10, 2x4 at 6/12):

| Dimension | Value |
|---|---|
| Top edge, tail to heel line | The slope length of the 12 in eave run. |
| Top edge, heel line to ridge | The slope length of the 47-1/4 in run to the ridge face. |
| Seat | 2-9/16 in: the birdsmouth stops at 1/3 of the rafter depth. |
| Heel | 1-9/32 in: the seat × 6/12. |
| Cut length | 68". |

Example (`tests/drawings.test.ts`, the 8x10 preset as a 2x6 gambrel): the shapes are `rafter` and
`rafter.upper`. The gusset is one dashed loop of 5 points, with two 12 in dimensions.

Change safely: `shares` compares corner objects by reference. Build the edges from the one
`points` array. A rafter whose longest edge is not its top edge breaks the top-edge dimensions. On a
gambrel, the right end of the lower rafter's top edge must be the break.

### 3.11 Gussets (`gussetDetail`, `gussets`)

`null` unless the roof is a gambrel with gusset solids. It shows each gusset shape laid flat as cut,
so the builder can cut them from the sheet.

1. Take the `Break gusset` panels, and the `Peak gusset` panels when the gambrel has no ridge
   board. A common rafter's has 5 corners, a gable-end rafter's 6 (framing.md 7.15).
2. In each joint's row, take one of each shape from the front slope, common first.
3. View each from the model's left end (`right` = +y, `up` = +z), lower rafter on the left. Its
   face is square to the view, so it keeps its exact outline.
4. Lay out the rows: the break row above the peak row, 24 in apart. In a row the shapes stand 24
   in apart.
5. Dimension each edge, aligned, 16 px outside the shape.

Notes:

- `<sheet label>, cut to these shapes, seen from the <left side name> end with the lower rafter on
  the left. The ends are square to the rafter edges.`
- One per row: `At the break (top row): the top edges meet at A°. Left: N for the common rafters,
  one on each face of each pair. Right: N for the gable-end rafters, on the inside face.` The row
  name is left out with one row. At the break `A = 180 − (lower angle − upper angle)`; at the peak
  `A = 180 − 2 × upper angle`.
- `A common rafter's gusset runs straight across under the joint's inside corner, as a web. A
  gable-end rafter's stays within the rafter depth, over the gable framing.`

Example (`tests/drawings.test.ts`, the 8x10 preset as a 2x6 gambrel): 5 and 6 corners, 11
dimensions: four 12 in top edges and four 5-1/2 in ends. The top edges meet at 147.5°. 16 common and
4 gable-end gussets. Without a ridge board a peak row adds 2 shapes: 8 common and 2 gable-end
gussets, meeting at 126.9°.

### 3.12 Cut-length key

See section 4.

## 4. Piece drawings and the cut-length key

### Piece drawing (`pieceDrawing(member, mark)`)

`PieceInfo` shows one piece of the selected cut-list line, laid flat. `pieceDrawing` gives:

| Field | Value |
|---|---|
| `id` | `piece-<member id>` |
| `title` | `memberTitle(member, mark)` |
| `shapes` | One `member` shape with `axis` (1, 0). `PieceInfo` passes `onPick={() => {}}`, so a click on it does nothing. |
| `dims` | `pieceDims(outline)` |
| `notes` | `LENGTH_RULE`, then the member's `note` when it has one. |

`outlineOf(member)` lays the piece flat: length to the right, width up. A profiled member gives its
profile points. A square member gives a rectangle `length` by the lumber width of its size.

`pieceDims` gives:

| Dimension | Rule | Offset |
|---|---|---|
| Cut length | Leftmost point to rightmost point, along x. Always. | −40 px, below |
| Bottom edge | Its extent along x, only when longer than 1/32 in and shorter than the cut length by 1/32 in. | −16 px, below |
| Top edge | Same rule. | 16 px, above |
| Board width | From the bottom edge's right end to the top edge's right end, along y. | −16 px, right of the right end |

### Cut kinds (`cutKind(outline)`)

`edgesOf` finds the low and high long edges and the x extent of each. An end is cut when the two
edges start (or end) more than 1/32 in apart.

| Kind | Test | Cut length | Why this rule |
|---|---|---|---|
| `square` | Neither end cut. | Either edge. | Both edges are the full length. The key shows no example. |
| `one-end` | One end cut. | The long side. | One edge runs the full length. |
| `toward` | Both ends cut, and one edge's extent holds the other's. | The long edge. | Both long points are on one edge. |
| `parallel` | Both ends cut, and neither edge holds the other. | Longer than either edge. | The long points are on opposite edges. Long point to long point along the board is more than either edge. |

The rule behind all four is `LENGTH_RULE` (`src/core/out/cutlist.ts`): cut lengths run long point to
long point, measured along the board. That length is the shortest board each piece comes from.

Examples (8x10 preset): `stud` is `square`, `stud.gable` is `one-end`, `tie.collar` is `toward`,
`rafter` is `parallel`. The 2x4 rafter at 6/12 has edges of 66-1/4 in. Its long points lie
3-1/2 × 6/12 = 1-3/4 in farther apart, so its cut length is 68 in.

### Cut-length key (`cutLengthKey(members, marks)`, `cut-lengths`)

`null` when the design has no profiled member of kind `one-end`, `toward`, or `parallel`.

1. For each of the three kinds, take the profiled members of that kind.
2. Pick the one with the fewest profile points. Break a tie with the longest piece. The simplest
   outline reads best.
3. Skip a kind with no member.
4. Stack the examples down the sheet. Each top sits 14 in (`KEY_GAP`) under the bottom of the one
   above.
5. Add `pieceDims` for each example.
6. Add notes: `LENGTH_RULE`, then one note for each example.

Each example note is `<mark>, <role>: <kind text> Here <cut length>, with edges of <long> and
<short>.` The kind texts are in `KINDS`. The example shapes keep their member ids, so a click on one
on the Framing tab selects its cut-list line.

The 14 in gap is in drawing inches, but the dimensions between two examples are in px. With 11 px
text they take up to 67 px: 40 + 5.5 under the upper example, 16 + 5.5 over the lower one. Below
67 / 14 = 4.8 px (or pt) per inch, their text can overlap.

## 5. SVG renderer (`DrawingSvg.tsx`)

### Constants

| Name | Value | Use |
|---|---|---|
| `MAX_WIDTH`, `MAX_HEIGHT` | 900 px | The default scale fits the drawing bounds in 900 × 900 px. |
| `MAX_SCALE` | 16 px/in | The largest default scale. A small piece gets no larger than this. |
| `FONT` | 11 px | Text size for layout. The screen CSS sets the same size. |
| `MARK_FONT` | 9 px | Mark text size. |
| `CHAR` | 0.6 | Estimated glyph width per px of font size. |
| `GAP` | 14 px | From the drawing bounds to tier 1. |
| `CHAIN` | 24 px | The size of a chain tier. |
| `MARGIN` | 16 px | Outside the outermost tier. |
| `TICK` | 3 px | Half the tick length, each way. |

### `layoutOf(drawing, fixedScale)`

1. Take `bounds(drawing.shapes, [...drawing.outlines, ...drawing.missing])`: the shapes, the dashed
   outlines, and the red outlines all fit.
2. Set `scale` to `fixedScale`, or else to min(900 / bounds width, 900 / bounds height, 16) px per
   inch.
3. For each side dimension, keep the largest size for its drawing side and tier.
4. `tierOffset(side, tier)` is 14 px plus the sizes of the lower tiers of that side.
5. `room(side)` is the offset past the last tier of that side, or 0 without side dimensions.
6. `reach` is the largest |`offset`| + 11 px of the aligned dimensions, or 0 without them.
7. `pad(side)` is 16 px + the larger of `room(side)` and `reach`.
8. The geometry box starts at (`pad('left')`, `pad('top')`) and spans the bounds × `scale`.
9. The SVG size is the geometry box plus `pad('right')` and `pad('bottom')`.
10. `px([x, y])` maps a drawing point into the box. It flips y: drawing y up, SVG y down.

It returns `scale`, `width`, `height`, `geometry`, `px`, and `tierOffset`.

- The 900 px limit applies to the bounds only. The pads come on top: on the test designs, SVG
  widths reach 1075 px.
- CSS (`width: 100%`, with `max-width` the natural width) shrinks the SVG to its figure. A figure is
  at most 960 px wide.
- Tiers, text, and margins keep their px size, so a small drawing gets wide pads around it.
- `bounds` leaves out `outlines`. A dashed outline, or a side-dimension position, past the shapes
  lands in the pad or outside the SVG.
- The largest aligned offset sets the least pad on all four sides.

### `fitScale(drawing, width, height, most = 16)`

`fitScale` gives the largest scale, at most `most`, at which the drawing and its dimensions fit
`width` × `height` px.

1. Lay out at scale 0. This gives the fixed px: the pads.
2. Lay out at scale 1. The difference is the bounds size in inches.
3. Return min((width − pads) / bounds width, (height − pads) / bounds height, `most`).

This is exact because the pads do not change with the scale. `PieceInfo` uses 420 × 160 px with the
default limit of 16 px/in. The PDF uses it with no limit when no standard scale fits.

### Draw order

1. Shapes, back to front (`ShapeView`).
2. Dashed `outlines`.
3. Red `missing` loops.
4. Labels.
5. Dimensions.

Labels and dimensions draw last, so the framing never covers them.

### Shapes, marks, and cut marks

- `ShapeView` gives each shape the classes `shape`, its `kind`, and `treated` and `selected` when
  they apply.
- A circle draws as `<circle>`; a polygon as `<polygon>`. Each has a `<title>` tooltip.
- A shape with an `id` gets a click handler. Context shapes and solids get none.
- A `cut` shape with 4 points gets an X from corner to corner (`cut-mark`).
- `Mark` measures the shape along its `axis` and across it, in px. It draws the mark only when the
  shape is at least the text width + 4 px long and 9 px wide.
- The mark sits at the center, turned by `upright`. A member that points at the viewer uses the x
  axis.

### Side dimensions (`SideDim`)

1. Find the drawing edge: `geometry.y1` for the bottom, `y0` top, `x0` left, `x1` right.
2. Put the line `tierOffset(side, tier)` px out from that edge.
3. Map each position along the side with `px`.
4. Draw each extension line from 3 px outside the edge to 4 px past the dimension line.
5. Draw the dimension line from the least to the largest position, and a tick at each position.
6. Chain: put the gap text at the middle of each gap, on the line. Running: put each label 6 px past
   the line, away from the drawing.

### Aligned dimensions (`Aligned`)

1. Take the direction: `along`, or else `from` to `to`.
2. Measure the length along that direction.
3. Find the left normal of the direction, in px with y down.
4. Put the line `offset` px beyond the farther of the two points, along the normal.
5. Draw each extension line from 2 px off its point to 4 px past the line.
6. Draw the line, a tick at each end, and the text at its middle.

### Text

| Text | Angle | Position |
|---|---|---|
| Chain, bottom or top | 0° | On the line, at the middle of each gap. |
| Chain, left or right | −90°: reads bottom to top | Same. |
| Running, bottom or top | −90°: stands on end, reads upward | 6 px past the line, anchored to run away from the drawing. |
| Running, left or right | 0° | Same. |
| Aligned | `upright` angle | On the line, at its middle. |
| Mark | `upright` angle of the member axis | The shape center. |
| Label | 0° | The RO center. |

- `upright(dx, dy)` turns an angle into the range −90° to 90°. Text then reads left to right or
  bottom to top, never upside down.
- Dimension text and labels have the `halo` class. On screen, a 4 px stroke in the surface color
  goes under each glyph, so text reads over lines.
- `textWidth` estimates the text width as characters × font size × 0.6. It sizes running tiers and
  decides when a mark or a label fits.

### Ticks

Each tick is a 45° slash, 3 px each way from its point, as on architectural drawings.

### Selection

1. A click on a member shape calls `onPick(id)`.
2. On the Framing tab, `App` toggles the mark of that member's cut-list line: it selects the line, or
   clears it when it is already selected.
3. `selected` becomes the ids of all members of that line. Each gets the `selected` class on every
   sheet. The 3D view and the cut list show the same line.
4. `PieceInfo` shows one piece of the line laid flat, in a sticky box under the drawings.

Dashed outlines, red outlines, cut marks, and marks have `pointer-events: none`. A click through
them reaches the member under them.

### Screen styles (`app.css`)

| Class | Style |
|---|---|
| `.shape` | Surface fill, text-color stroke, 1 px. |
| `.shape.member` | Pointer cursor. |
| `.shape.treated` | Green tint: `#3f8f4f` at 18 %. |
| `.shape.concrete` | Muted tint at 18 %. |
| `.shape.sheet` | Accent tint at 8 %. |
| `.shape.steel` | Text-color fill. |
| `.wireframe .shape` | Transparent fill. |
| `.shape.context` | No fill, muted stroke, 4 3 dash. |
| `.shape.selected` | Accent tint at 55 %. |
| `.outline` | No fill, muted stroke, 6 4 dash. |
| `.missing` | No fill, error-color stroke, 1.5 px, 4 3 dash. |
| `.dim line` | Muted stroke, 0.75 px. |
| `.mark` | 9 px, muted. |

Decision: fills carry meaning: PT, concrete, sheet goods, steel. Headers have no tint. A tint with
no legend read as an unexplained code.

## 6. The Framing tab and the zoom viewer

### Framing tab (`FramingView`)

`App` passes `drawings`, `selected`, `onPick`, `designName`, `pdfName`, and `shareLink`.

1. A toolbar: the paper choice, Download PDF, and Print.
2. One figure for each drawing, in sheet order. A figure holds:
   - the caption: the title and a Zoom button;
   - the SVG at its default scale;
   - the notes, as a list;
   - the notice (`DISCLAIMER`), for print only.
3. The zoom viewer, when a drawing is zoomed.

Decision: the Framing tab has no row of buttons that jump to each drawing. That row grew with each
wall, gable-end, and knee-wall sheet and took most of a phone's first screen. A scroll through the
sheets in order is quicker.

| Control | Does |
|---|---|
| Paper | `Letter 11x8.5` (default) or `Tabloid 11x17`. It applies to the PDF only. |
| Download PDF | Loads `./pdf` on demand. Calls `downloadPlans(drawings, designName, paper, pdfName, shareLink)`. |
| Print | `window.print()`. |
| Zoom | Opens the viewer on that drawing. |

- While the PDF builds, the button reads "Making PDF…" and is disabled. A `finally` block enables it
  again. The code has no `catch`, so an error shows no message.
- `pdfName` is the design name in lower case, with each run of other characters replaced by `-`,
  plus `.plans.pdf` (`fileName` in `App.tsx`). An empty name gives `shed.plans.pdf`.
- Print uses the print CSS. It hides the header, form, tabs, toolbars, piece box, viewer, and Zoom
  buttons. It sets black on white. It puts each figure on its own page, with the notice under it.
- Print fills the page width; it is not at a standard scale. Use the PDF for a set to scale.

### Zoom viewer (`Viewer`)

The viewer covers the window as a dialog. It draws the drawing at its default layout (`layoutOf`),
`zoom` times its px size, at an offset (x, y) in the canvas.

| Input | Action |
|---|---|
| Wheel | Zoom by e^(−0.0015 × `deltaY`) about the pointer. |
| `+` or `=` key, + button | Zoom in by 1.25 about the canvas center. |
| `-` key, − button | Zoom out by 1.25 about the canvas center. |
| Fit button | Fit the drawing to 95 % of the canvas, centered. |
| Drag | Pan. |
| Click with 4 px of travel or less | Pick a member, as on the tab. |
| `Escape` key, Close button | Close the viewer. |

- The zoom stays between 0.1 and 40.
- The viewer fits the drawing when it opens (`useLayoutEffect`).
- A zoom about a point keeps that point still: new offset = point − (point − old offset) × new zoom
  / old zoom.
- The wheel listener is not passive. It calls `preventDefault`, so the page does not scroll under
  the drawing.
- Each pointer down clears `dragged` and adds move and up listeners on `window`. More than 4 px of
  total travel sets `dragged`.
- A click handler in the capture phase stops the click after a drag, so a pan never picks a member.
- The canvas sets `touch-action: none`. The viewer zooms on wheel events only, although its bar says
  "Scroll or pinch to zoom".
- The code has no handler for a two-finger touch pinch. The move handler does not filter by
  `pointerId`.

## 7. The PDF (`pdf.ts`)

### Libraries, loaded on demand

`FramingView` imports `./pdf` only when the user clicks Download PDF. `pdf.ts` imports jsPDF,
svg2pdf.js, qrcode-generator, and `react-dom/server`, so all four stay out of the main bundle. In
the `dist/` build of 2026-11-11, the `pdf` chunk is 712 KB and the main chunk is 1.09 MB. Both
sizes are minified, before compression.

### Steps (`plansPdf(drawings, designName, paper, link)`)

1. Make a landscape jsPDF document in pt on `letter` or `tabloid`.
2. Take the inner width (page width − 2 × 36 pt) and the date (`en-CA`: `YYYY-MM-DD`).
3. Count the sheets: one for each drawing, plus one when `link` is set.
4. For each drawing, make one page (section "One drawing sheet").
5. With `link`, add the QR sheet (section "QR sheet").

`downloadPlans` calls `plansPdf` and saves the result as `fileName`.

### Page

| Paper | Landscape page | Inner width | Drawing area height, with no notes |
|---|---|---|---|
| Letter | 792 × 612 pt (11 × 8.5 in) | 720 pt | 474 pt |
| Tabloid | 1224 × 792 pt (17 × 11 in) | 1152 pt | 654 pt |

| Constant | Value |
|---|---|
| `MARGIN` | 36 pt (1/2 in) on each edge. |
| `BLOCK` | 54 pt: the title block height. |
| `NOTE` | 8 pt: note text size. |
| `LINE` | 1.3: line height per text size. |
| `CODE` | 360 pt (5 in): the largest QR code. |

The drawing area height is the page height − 2 × 36 − 54 − the notes height − 12 pt.

### One drawing sheet

1. Wrap each note, with a `- ` prefix, at 8 pt Helvetica to the inner width.
2. Take the drawing area: the inner width by the height above the notes and the title block.
3. Pick the scale: `pickScale((points) => layoutOf(drawing, points), area)`.
4. Without a standard scale, use `fitScale(drawing, area.width, area.height, Infinity)`.
5. Render `DrawingSvg` at that scale to markup, with no selection (`svgOf`).
6. Add the namespace and the print `<style>`, then parse it with `DOMParser`.
7. Draw it with `svg2pdf` at the center of the drawing area.
8. Write the note lines under the area, 10.4 pt apart.
9. Draw the title block.

### Standard scales (`scale.ts`)

`SCALES` holds 11 architectural scales, largest first. `pointsPerInch` gives paper pt per building
inch: `inchesPerFoot / 12 × 72`.

| Scale | pt per inch |
|---|---|
| 3" = 1'-0" | 18 |
| 1-1/2" = 1'-0" | 9 |
| 1" = 1'-0" | 6 |
| 3/4" = 1'-0" | 4.5 |
| 1/2" = 1'-0" | 3 |
| 3/8" = 1'-0" | 2.25 |
| 1/4" = 1'-0" | 1.5 |
| 3/16" = 1'-0" | 1.125 |
| 1/8" = 1'-0" | 0.75 |
| 3/32" = 1'-0" | 0.5625 |
| 1/16" = 1'-0" | 0.375 |

`pickScale(size, area)` returns the first scale whose laid-out width and height fit the area, or
`null`. `size` must include the pads, so `pdf.ts` passes `layoutOf` at that scale.

Decisions:

- A standard scale lets a builder measure the paper with an architect's scale.
- The largest scale that fits gives the most detail.
- 3" = 1'-0" is the largest scale. A drawing that fits at 3" = 1'-0" with room to spare stays at
  that scale.
- Dimensions, text, and margins stay at their pt size at every scale, so text stays readable on a
  small-scale sheet.

### "Not to scale" fallback

When even 1/16" = 1'-0" does not fit, `fitScale` fills the drawing area with no limit. The title
block then reads "Not to scale". A standard scale always wins when one fits, so the fallback only
makes a drawing smaller than 1/16" = 1'-0".

### Title block

`titleBlock` draws one boxed row across the inner width at the foot of the page, 54 pt high, with
0.75 pt lines. Text starts 6 pt in from the cell's left and top edges. It wraps to the cell width −
12 pt.

| Cell | Share | Lines |
|---|---|---|
| Notice | 36 % | `DISCLAIMER`, 7 pt. |
| Design | 22 % | Design name, 11 pt bold. `Shed Builder <APP_VERSION>`, 8 pt. |
| Sheet | 28 % | Drawing title, 11 pt bold. `Scale <label>` or `Not to scale`, 8 pt. |
| Number | 14 % | `Sheet <n> of <total>`, 11 pt bold. Date, 8 pt. |

### Print colors

`svgOf` puts this style into each SVG. The app's theme colors do not suit paper.

| Class | Print style |
|---|---|
| `.shape` | White fill, black stroke, 1 pt. |
| `.shape.treated` | `#dcebdc` fill. |
| `.shape.concrete` | `#e6e6e6` fill. |
| `.shape.sheet` | `#f7efe5` fill. |
| `.shape.steel` | Black fill. |
| `.shape.context` | No fill, `#777777` stroke, 4 3 dash. |
| `.wireframe .shape` | No fill. |
| `.cut-mark` | Black, 0.75 pt. |
| `.outline` | No fill, `#777777`, 6 4 dash. |
| `.missing` | No fill, `#cc0000`, 1.5 pt, 4 3 dash. |
| `.dim line` | `#555555`, 0.75 pt. |
| `text` | Black Helvetica, 9 px. |
| `.mark` | `#555555`, 7 px. |

- Print text is 9 px against 11 px on screen, so it crowds less at small scales. The layout still
  makes room for 11 px text.
- The print style has no halo rule, so text has no halo on paper.

### QR sheet

With a share link, the last sheet holds the link as a QR code that opens the design.

1. Add a page.
2. Take the room above the title block and a 36 pt caption: page height − 2 × 36 − 54 − 36.
3. Size the code: min(360 pt, the room, the inner width). On both papers this gives 360 pt.
4. Center the code across the page and in the room.
5. Make the modules with `qrcode(0, 'L')`, `addData(link, 'Byte')`, `make()`. Type 0 picks the
   smallest QR version that holds the link.
6. Draw the code in its square with a 4-module quiet zone: one cell is size / (modules + 8).
7. Draw each row's runs of dark modules as one rectangle, 0.05 pt taller than a cell.
8. Under the code, write `Scan with a phone camera to open "<design>" in Shed Builder.` (12 pt bold,
   16 pt under the code).
9. Write "The code holds the whole design, as it was when these plans were made." (9 pt, 30 pt
   under the code).
10. Draw the title block: "Open this design", "Scan the code with a phone camera", and the sheet
    number.

Decisions:

- Level L error correction keeps a long link to the fewest modules. The link holds the whole design,
  so the code is dense: 77 to 105 modules.
- The 4-module quiet zone is what the QR standard asks.
- At 360 pt (5 in), a 105-module code prints each module over 1 mm: 127 mm / 113 cells. A phone
  camera reads that easily.
- The code has its own last sheet. A code in the title block was too fine to scan from paper.
- The run rectangles are 0.05 pt taller, so no seam shows between rows.

Edge case: `App` makes the link with `designToLink`, which is asynchronous. Until it resolves,
`shareLink` is `null`, and a PDF made then has no QR sheet.

## 8. Recipes

### Add a sheet

1. Write a function in `src/drawings/sheets.ts` that takes a `Context`. Put it near the sheets it
   follows in sheet order.
2. Return `null` when the design has nothing to show.
3. Take a view: `planView(config)` for a plan, `elevationView(config, wall)` for a panel from
   outside, or a new `View`.
4. Check a new `View` for right × up = −forward. Else the drawing is a mirror image.
5. Filter the members by `assembly` or `role`, and the solids by `layer`.
6. Call `shapesOf(view, members, solids, marks, { context, section })`.
7. Add the dimensions (next recipe), labels, and dashed `outlines`.
8. Set `missing` to `missingIn(model, view, ...)` for each assembly the sheet draws.
9. Write the notes. State the origin of each layout and what each dashed line is.
10. Return `makeDrawing(id, title, parts)` with a unique `id`.
11. Add the call to `buildDrawings` at its place in the build order.
12. Test its dimensions in `tests/drawings.test.ts`. Update the id list in "gives each panel its own
    sheet, in build order" when the sheet shows on that design.
13. Update the sheet list in `docs/DEVELOPER.md` and this document. Add a CHANGELOG entry.

`every-design.test.ts` then checks that the sheet has shapes and only finite numbers on every
design. `prune.test.ts` checks that it is the same after `pruneConfig`.

### Add a dimension

1. Pick the kind.
   - `running` for a layout that a tape reads from one origin.
   - `chain` for consecutive spans along one drawing side, such as RO edges or overhangs.
   - `aligned` for a size in any direction, or inside the drawing.
2. Compute the positions in drawing inches, in this view: use `project`, `extentOf`, or `boxOf`.
3. Pass chain positions through `distinct`.
4. Pick the drawing side and tier. Tier 1 is nearest.
   - Put a layout at tier 1.
   - Put overall sizes on the outermost tier.
5. Set `feet: true` on overall chains.
6. For an aligned dimension, pick the offset sign: positive is to the left of `from` to `to`.
7. Keep aligned offsets small. The largest one sets the least pad on all four drawing sides.
8. Use `along` when the dimension must read one component, such as a cut length along a board.
9. Test the `at` values, or the aligned lengths, in `tests/drawings.test.ts`.

### Change a sheet safely

- Keep `src/drawings` free of React and the DOM.
- Keep each `Drawing.id` unique and each note distinct: both are React keys.
- A change to `bounds`, `layoutOf`, or a tier size moves every sheet. Check the PDF scales of a
  small and a large design after it.
- A change to the text sizes in `DrawingSvg` changes running tier sizes, label fit, and mark fit.
- A new role in a layout needs `LAYOUT`, `DECK_FRAMING`, or the role filter of its sheet.
- A sheet that draws an assembly with left-out parts must pass `missingIn` for that assembly
  (DEVELOPER.md, "Leave out a part that cannot be framed").
- `rafterDetail` depends on the rafter's outline: the top edge must be the longest edge, and the
  seats must be level. On a gambrel, the lower rafter's top edge must end at the break.

## Tests

`npm test` runs these in Node. No test runs in a browser.

| File | Checks |
|---|---|
| `tests/drawings.test.ts` | The sheets, in the blocks of the next table. |
| `tests/scale.test.ts` | `pointsPerInch`, and that `pickScale` gives the largest scale that fits, or `null`. |
| `tests/piece.test.ts` | `cutKind` for each kind, the piece dimensions of a rafter and a gable stud, and the key's examples and note text. |
| `tests/every-design.test.ts` | On every design: only finite numbers in the drawings and piece drawings, and shapes on each drawing. |
| `tests/prune.test.ts` | On every design: the same drawings before and after `pruneConfig`. |

| `drawings.test.ts` block | Checks |
|---|---|
| `projection` | A box member projects to its rectangle. The rafter keeps its 7-corner profile. |
| `model openings` | The fitted ROs in their wall frames. |
| `wall elevation` | Running, chain, and aligned dimensions and the RO label of the front wall. The adjacent walls as context. |
| `panel sheets` | The sheet ids in order. A wall without the panel above it. The knee-wall rim and deck edge. Gable layout, cut in place and as a panel. |
| `rafter detail` | Top-edge, seat, heel, and cut-length dimensions. |
| `gambrel rafter detail` | The title, the lower and upper rafter shapes, the 5-point gusset outline, and its two 12 in dimensions. |
| `gusset sheet` | One shape of each kind (5 and 6 corners), each edge dimensioned, the counts and the angle in the notes; none on a gable roof. |
| `building section` | The cut at the middle rafter pair, the X on the ridge, and the height chain. |
| `foundation plan` | The pier-line and pier chains. |
| `gable front` | Wall titles in the user's order, and the floor layout on the left side. |

No test checks the decks sheet, the loft or roof plan dimensions, `missing` on a drawing,
`DrawingSvg`, `FramingView`, or `pdf.ts`.
