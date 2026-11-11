# Framing

How `buildModel` frames the main shed: foundation, floor, walls, wall openings, roof, gable ends,
and attic. For the overview, the conventions, and the recipes, see [DEVELOPER.md](DEVELOPER.md).
Lean-tos (`additions.ts`), ramps (`ramps.ts`), sheets (`sheathing.ts`), and finishes
(`finishes.ts`) are not in this document.

| Part | Function | File | Section |
|---|---|---|---|
| Member types and warnings | `Member`, `Solid`, `Warning`, `corners` | `src/core/member.ts` | 1 |
| Shared geometry | `planeMember`, `clipBelow`, `idMaker`, `profileOf` | `src/core/gen/section.ts` | 2 |
| Build order | `buildModel` | `src/core/model.ts` | 3 |
| Foundation and floor | `frameFloor`, `gradeOf` | `src/core/gen/floor.ts` | 4 |
| Walls | `frameWalls`, `splitPlate` | `src/core/gen/walls.ts` | 5 |
| Wall openings | `fitOpening`, `openingBoards` | `src/core/gen/walls.ts` | 6 |
| Rafters, ridge, fascia, rake ladders, purlins, gussets | `frameRoof`, `gambrelBreak` | `src/core/gen/roof.ts` | 7 |
| Gable ends and gable openings | `frameGableEnds`, `fitGableOpening` | `src/core/gen/roof.ts` | 8 |
| Ties, loft, knee walls | `frameAttic`, `frameLoft`, `frameKneeWalls` | `src/core/gen/attic.ts` | 9 |
| Warnings and left-out parts | all of the above | | 10 |
| Tests | | `tests/*.test.ts` | 11 |

All lengths are inches. "Wall depth" is the stud width: 3-1/2 in for 2x4 walls, 5-1/2 in for 2x6
walls. "1-1/2 in" is the thickness of 2x lumber, the constant `PLY` in each generator.

## Terms

| Term | Definition |
|---|---|
| Member | One piece of lumber in the model: a `Member`. |
| Run | The full extent of a plate, rim, skid, girder ply, ridge, fascia, purlin, ledger, or knee-wall plate before `splitPlate` cuts it. |
| Piece | One stock-length part of a run. |
| Splice | The joint between two pieces of a run. |
| o.c. | On center: the distance between the centers of two members in a layout. |
| Layout | The positions of repeated members at o.c. multiples from a start corner. |
| PT | Pressure-treated lumber. `Member.treated` is true. |
| RO | Rough opening: the framed hole for a door, window, or vent unit. |
| King | A full-height stud at each side of an RO. |
| Jack | A stud inside the king, from the bottom plate to the header. It carries the header. |
| Header | The beam over an RO. It carries the load above the RO to the jacks. |
| Rough sill | Flat boards at the bottom of an RO that does not start at the floor. |
| Cripple | A short stud on layout above a header or below a rough sill. |
| Mud sill | A PT plate under the bottom plate, on a slab. |
| Cap plate | The second top plate. At a level corner, one wall's cap laps over the other wall and ties the two walls. |
| Lap | One member over another at a corner, which ties them. |
| Through wall | A wall that runs to both building corners and carries the corner posts. |
| Butted wall | A wall that fits between the two through walls. |
| Plumb cut | A cut that is vertical when the member is in place. |
| Level cut | A cut that is horizontal when the member is in place. |
| Square cut | A cut at 90° to the board edges. |
| Long point | The end of a cut farthest out along the board. |
| Birdsmouth | The notch in a rafter's bottom edge that sits on the bearing plate. |
| Seat | The level face of the birdsmouth. It bears on the plate. |
| Heel | The plumb face of the birdsmouth. |
| Tail | The part of a rafter past the wall's outside face. |
| Gambrel | A roof with two slopes on each side: a steep lower slope from the eave, and a shallow upper slope to the ridge. |
| Break | The line where a gambrel's lower and upper slopes meet, on the rafter top lines. |
| Miter | The cut at the break, where a lower rafter meets an upper rafter. It is on the bisector of the two slopes. |
| Gusset | A plywood plate on a rafter face, across the break. It joins the lower and upper rafters and acts as a web between them. |
| Roof profile | One roof side in the drawn section: its slopes from the eave up. The `Profile` type (2.6). |
| Ridge board | The board at the peak of a gable or gambrel roof, between the rafter pairs. |
| Ridge post | A stud in each gable end, under the ridge board. None without a ridge board. |
| Rake | The roof edge over a gable end. The rake overhang is its distance past the end wall. |
| Rake ladder | The framing of the rake overhang: a fly rafter, lookouts, and a rail. |
| Fly rafter | The outer rafter of a rake ladder, at the rake edge. |
| Lookout | A short block across a rake ladder, between the fly rafter and the rail or the end rafter. |
| Fascia | A board along an eave, on the rafter tails. |
| Purlin | A board laid flat across the rafters. It carries metal roofing. |
| Rafter tie | A level member near the plates. It ties a rafter pair so that the walls do not spread. |
| Collar tie | A level member high in the roof. It ties a rafter pair. |
| Knee wall | A short wall on the loft floor at each eave. On a raised roof it carries the rafters. |
| Trimmer | A joist at the side of a loft hatch. |
| Tail joist | A short loft joist from a hatch header to the eave. |
| Ledger | A board on the face of a wall. Joists hang from it. |
| Rim joist | A joist across the ends of other joists, at the edge of a floor. |
| Skid | A timber on edge under the floor. The shed sits on the skids. |
| Pier | A concrete column in the ground. |
| Girder | A beam of one or more plies on the piers. It carries the floor joists. |

## 1. The framing model

### 1.1 Member

`Member` (`src/core/member.ts`) is one piece of lumber in model coordinates.

| Field | Content |
|---|---|
| `id` | Unique name, for example `RF-R01` (1.4). |
| `assembly` | A key of `ASSEMBLIES`: the cut-list group, the id prefix, and the 3D layer (1.3). |
| `role` | A key of `ROLES`: what the piece is (1.5). |
| `size` | A `LumberSize`. `LUMBER` in `src/core/catalog.ts` gives its dressed `thick` and `width`. |
| `treated` | True for PT lumber. |
| `length` | Inches along `axes.length`. For a profiled member, the extent along the board (2.4). |
| `origin` | One corner of the piece. |
| `axes` | Unit vectors `length`, `width`, and `thick`. |
| `profile` | Optional: `points` in (along, across) coordinates, and `depth`. |
| `note` | Optional shop instruction. It prints on the cut line. |

A member has one of two shapes.

| Shape | What it fills | Axes |
|---|---|---|
| Box (no `profile`) | `length` along `axes.length`, the lumber width along `axes.width`, the lumber thickness along `axes.thick`. | `axes.thick` points to the side where the board lies. The axes can be left-handed: the front floor rim has `length` +x, `width` +z, and `thick` +y. |
| Profiled | The polygon `profile.points`, extruded `profile.depth` along `axes.thick`. | Right-handed: `thick = length × width`. `planeMember` sets them (2.3). |

`corners(member)` returns the eight box corners, or the profile points on both faces. The drawings,
the 3D view, and `gradeOf` use it.

The plane of a profile sets which lumber dimension each profile coordinate holds:

| Members | Profile across extent | `profile.depth` |
|---|---|---|
| Rafters, upper rafters, fly rafters, ladder rails, ties, loft joists | Lumber width | Lumber thickness |
| Skids | Lumber width (the skid stands on edge) | Lumber thickness |
| Gable-end members (2.3, section 8) | 1-1/2 in, the lumber thickness | Wall depth, the lumber width |

`tests/every-design.test.ts` checks that no profile is wider across than its lumber width.

| PT members | Rule |
|---|---|
| `skid`, `girder`, `post` | Always PT. |
| `joist.end`, `joist.floor`, `rim.floor`, `blocking` | `floor.treated`, default true. |
| `plate.sill` | Always PT. |
| All other members | Not PT. `planeMember` sets `treated: false`. |

### 1.2 Solid and Panel

A `Solid` is a part that is not lumber: concrete, a sheet, or steel. Its `shape` is one of three:

| Shape | Fields |
|---|---|
| `box` | `min`, `max` corners. |
| `cylinder` | `base` center, `radius`, `height` up from the base. |
| `Panel` | `outline` and `holes` in (u, v) from `origin`, extruded `thick` along u × v. `panelCorners` returns the outline on both faces. |

A panel cut from a stock sheet carries `sheet`. The generators in this document make these solids:

| Solid | Shape | Material | Id | Made by |
|---|---|---|---|---|
| Slab | box | concrete | `FD-SL01` | `frameFloor` |
| Thickened edge | 4 boxes | concrete | `FD-TE01`–`FD-TE04` | `frameFloor` |
| Pier | cylinder | concrete | `FD-PRnn` | `frameFloor` |
| Anchor bolt | cylinder | steel | wall prefix + `ABnn`, for example `FW-AB01` | `frameWall` |
| Break gusset, peak gusset | `Panel`, sheet `ply-15/32` | sheet | `RF-GUnn`, `RF-GPnn` | `frameRoof` (7.15) |

Sheets and ramp panels come from `sheathing.ts` and `ramps.ts`.

### 1.3 Assemblies and layers

`ASSEMBLIES` gives each assembly a label, an id prefix, and a 3D layer. `LAYERS` lists the layers
in build order, as the 3D view's toggles show them.

| Assembly | Label | Prefix | Layer |
|---|---|---|---|
| `foundation` | Foundation | `FD` | `foundation` |
| `floor` | Floor | `FL` | `floor` |
| `wall.front`, `wall.back`, `wall.left`, `wall.right` | Front wall, ... | `FW`, `BW`, `LW`, `RW` | `walls` |
| `gable.left`, `gable.right` | Left gable end, Right gable end | `GL`, `GR` | `gables` |
| `roof` | Roof | `RF` | `roof` |
| `loft` | Loft | `LF` | `loft` |
| `knee.front`, `knee.back` | Front knee wall, Back knee wall | `KF`, `KB` | `knee` |

`layerOf(member)` returns the assembly's layer, except for the rake roles `rafter.fly`,
`rail.ladder`, and `lookout`. These are `roof` members on the `rake` layer.

### 1.4 Ids and cut-list marks

`idMaker(prefix)` returns a function of `code`. Each call counts that code and returns
`${prefix}-${code}${count}`, with the count padded to two digits: `RF-R01`, `RF-R02`. `frameWall`
has its own `nextId` with the same scheme and the assembly's prefix.

- Ids always use the model's prefix from `ASSEMBLIES`.
- Ids are unique in a model. `tests/every-design.test.ts` checks this.
- An id is a position in its counter. It changes when a member before it in the same counter
  appears or goes.
- Two counters share a prefix only with different codes. `frameRoof` and `frameAttic` both use
  `RF`: `frameRoof` uses `R`, `UR`, `RB`, `FR`, `LR`, `LO`, `FA`, `PU`, and `frameAttic` uses `RT`,
  `CT`. A third `RF` counter in `frameRoof` gives the gusset solids `GU` (break) and `GP` (peak).

The cut list does not show ids. `buildCutList` (`src/core/out/cutlist.ts`) makes cut lines:

1. It puts members with the same `assembly`, `role`, `size`, `treated`, `length` (rounded to
   1/16 in), and `note` on one line.
2. It sorts the lines by assembly rank (`naming(config).rank`), then by the key order of `ROLES`,
   then longest first.
3. It gives each line a mark: the user's assembly prefix, a hyphen, and the line number in that
   assembly, for example `RF-2`.

A `note` is part of the line key. Two skids with different end notes get two marks.

`naming.rank` orders the kinds foundation, floor, wall, gable, roof, loft, knee, addition, ramp, and
the sides in the user's order. The key order of `ASSEMBLIES` is the cut-list order only for
`front: 'eave'`. With `front: 'gable'`, the model's `wall.left` keeps ids `LW-...`, but its marks
are `FW-...`, because the user calls it the front wall.

### 1.5 Roles

The key order of `ROLES` is the cut-list order in an assembly. This table lists the roles of the
main shed, in that order.

| Role | Label | Assemblies | Id code | Made by |
|---|---|---|---|---|
| `plate.sill` | Mud sill | `wall.*` | `SL` | `frameWall` |
| `plate.bottom` | Bottom plate | `wall.*`, `gable.*`, `knee.*` | `BP` | `frameWall`, `frameGableEnds` (panel), `frameKneeWalls` |
| `plate.top` | Top plate | `wall.*`, `knee.*` | `TP` | `frameWall`, `frameKneeWalls` |
| `plate.cap` | Cap plate | `wall.*`, `knee.*` | `CP` | `frameWall`, `frameKneeWalls` |
| `corner` | Corner stud | `wall.*` | `C` | `frameWall` |
| `stud` | Stud | `wall.*`, `knee.*` | `S` | `frameWall`, `frameKneeWalls` |
| `king` | King stud | `wall.*`, `gable.*` | `K` | `frameWall`, `frameGableEnds` |
| `jack` | Jack stud | `wall.*`, `gable.*` | `J` | `frameWall`, `frameGableEnds` |
| `header` | Header | `wall.*`, `gable.*` | `H` | `openingBoards` |
| `header.plate` | Header plate | `wall.*`, `gable.*` | `HP` | `openingBoards` |
| `sill` | Rough sill | `wall.*`, `gable.*` | `RS` | `openingBoards` |
| `cripple` | Cripple | `wall.*`, `gable.*` | `CR` | `frameWall`, `frameGableEnds` |
| `plate.gable` | Gable top plate | `gable.*` | `TP` sloped plate, `CP` corner plate | `frameGableEnds` |
| `stud.gable` | Gable stud | `gable.*` | `S` | `frameGableEnds` |
| `post.ridge` | Ridge post | `gable.*` | `P` | `frameGableEnds` |
| `ridge` | Ridge board | `roof` | `RB` | `frameRoof` |
| `rafter` | Rafter | `roof` | `R` | `frameRoof` |
| `rafter.upper` | Upper rafter | `roof` | `UR` | `frameRoof` |
| `rafter.fly` | Fly rafter | `roof` | `FR` | `frameRoof` |
| `rail.ladder` | Ladder rail | `roof` | `LR` | `frameRoof` |
| `lookout` | Lookout | `roof` | `LO` | `frameRoof` |
| `fascia` | Fascia | `roof` | `FA` | `frameRoof` |
| `tie.rafter` | Rafter tie | `roof` | `RT` | `frameAttic` |
| `tie.collar` | Collar tie | `roof` | `CT` | `frameAttic` |
| `joist.loft` | Loft joist | `loft` | `J` | `frameLoft` |
| `rim.loft` | Loft rim joist | `loft` | `R` | `frameLoft` |
| `ledger.loft` | Loft ledger | `loft` | `L` | `frameLoft` |
| `edge.loft` | Loft edge joist | `loft` | `E` | `frameLoft` |
| `trimmer.loft` | Hatch trimmer | `loft` | `T` | `frameLoft` |
| `header.loft` | Hatch header | `loft` | `H` | `frameLoft` |
| `tail.loft` | Tail joist | `loft` | `TJ` | `frameLoft` |
| `skid` | Skid | `foundation` | `SK` | `frameFloor` |
| `girder` | Girder ply | `foundation` | `GD` | `frameFloor` |
| `purlin` | Purlin | `roof` | `PU` | `frameRoof` |
| `post` | Post | `foundation` | `PS` | `frameFloor` |
| `rim.floor` | Rim joist | `floor` | `R` | `frameFloor` |
| `joist.end` | End joist | `floor` | `EJ` | `frameFloor` |
| `joist.floor` | Floor joist | `floor` | `J` | `frameFloor` |
| `blocking` | Blocking | `floor` | `B` | `frameFloor` |

The roles `ledger`, `beam`, the deck roles (`ledger.deck`, `joist.deck`, `rim.deck`, `beam.deck`,
`decking`), and `stringer` belong to lean-tos and ramps. To add a
role, follow "Add a member role" in DEVELOPER.md.

## 2. Coordinates and planes

### 2.1 Model axes

| Axis | Direction | Range of the footprint |
|---|---|---|
| x | Along the length, left to right | 0 to `length` |
| y | Front to back | 0 to `width` |
| z | Up from the floor surface: the subfloor top, or the slab top | Floor surface at 0 |

The axes are right-handed. The footprint is the outside faces of the framing.

Decision: the model's front and back are always the eave walls, and left and right are the gable
ends. `front: 'gable'` only renames the sides (`src/core/naming.ts`). The framing, the ids, and
the config fields such as `openings[].wall` use model sides with either setting. Warning labels,
such as `window (front 50%)`, and cut-list marks use the user's names.

### 2.2 Wall frames

`wallFrames(width, length)` gives each wall a `Frame`. The origin is the building corner at the
wall's left end, viewed from outside. `u` runs along the wall to the right, `v` runs inward, and z
is up.

| Wall | `origin` | `u` | `v` | Span |
|---|---|---|---|---|
| `front` | (0, 0, 0) | +x | +y | `length` |
| `back` | (`length`, `width`, 0) | −x | −y | `length` |
| `left` | (0, `width`, 0) | −y | +x | `width` |
| `right` | (`length`, 0, 0) | +y | −x | `width` |

`at(frame, u, v, z)` returns `origin + u * frame.u + v * frame.v`, at height z. `ADJACENT[wall]`
names the walls at u = 0 and at u = span.

### 2.3 Section planes and `planeMember`

A `Plane` is a vertical drawing plane: `origin` and a horizontal unit vector `h`. The plane point
(a, z) is at `origin + a * h + z * up`. A member in the plane extrudes along `h × up`, which is
`(h[1], -h[0], 0)`.

`planeMember(base, plane, outline, dir, depth)` makes a profiled member from its outline in a
plane:

1. Normalize `dir` to `along`. `across` is `along` turned 90° toward +z: `(-along[1], along[0])`.
2. Remove consecutive duplicate points, and a last point equal to the first (`dedupe`).
3. Project each point onto `along` and `across`.
4. Set `length = max(along) - min(along)`.
5. Set `origin` to the plane point at (min along, min across), in model coordinates.
6. Set `axes.length` and `axes.width` to `along` and `across` in model space, and
   `axes.thick = (h[1], -h[0], 0)`. This equals `length × width`, so the axes are right-handed.
7. Set `profile.points` to the projections less the minimums. `depth` defaults to the lumber
   thickness.
8. Set `treated: false`. A caller that needs PT sets it after the call, as `frameFloor` does for
   skids.

The planes in use:

| Members | `origin` | `h` | Extrudes | `dir` |
|---|---|---|---|---|
| Skid | (0, line + across / 2, 0) | +x | −y, `across` thick | (1, 0) |
| Rafter, upper rafter, fly rafter, rail, front side | (x, 0, 0) | +y | +x, from x to x + 1-1/2 | (cos, sin) of its slope |
| Rafter, upper rafter, fly rafter, rail, back side | (x + 1-1/2, `width`, 0) | −y | −x, from x + 1-1/2 to x | (cos, sin) of its slope |
| Tie, collar tie, loft joist | (x, 0, 0) | +y | +x | (1, 0) |
| Left gable end | (wall depth, `width`, 0) | −y | −x, wall depth thick, to x = 0 | per member |
| Right gable end | (`length` − wall depth, 0, 0) | +y | +x, wall depth thick, to x = `length` | per member |

On a gable plane, a = u of the end wall's frame, so gable members follow the end wall's layout.

### 2.4 Cut length

Decision: cut lengths run long point to long point, measured along the board. The length is the
shortest board each piece comes from. `LENGTH_RULE` in `src/core/out/cutlist.ts` prints this rule
on the cut list. `planeMember` sets `length` to the extent along `dir`, so every profiled member
follows the rule.

Example: a 2x6 gable rafter at 6/12 on an 8 ft wide shed with a 12 in eave. The run from the tail
to the ridge face is 12 + 48 − 3/4 = 59-1/4 in. The cut length is
`59.25 / cos + 5.5 * tan` = 68.99 in. The second term is the ridge plumb cut's long point past its
short point.

### 2.5 `clipBelow` and `hull`

`clipBelow(polygon, k, limit)` returns the part of a convex polygon where `k · (a, z) <= limit`
(one Sutherland–Hodgman pass, tolerance `EPSILON` = 1e-9). `frameAttic` calls it twice for each
slope to trim a level piece to the roof top lines on both sides (9.1).

`hull(points)` returns the convex hull, counterclockwise, by the monotone chain method. The framing
generators do not use it. Sheathing, finishes, and drawings do.

### 2.6 Pitch, slope, and roof profile

`pitchOf(perTwelve)` (`section.ts`) returns a `Pitch` from a rise per 12 of run:

| Field | Formula |
|---|---|
| `rise` | `pitch / 12` |
| `cos`, `sin` | of `atan(pitch / 12)` |
| `degrees` | `atan(pitch / 12) * 180 / π`. `degrees(pitch)` prints it to 0.1°, for example `26.6°`. |

`frameRoof` gives the eave slope `pitchOf(eavePitch(roof))`: `roof.gambrel.lowerPitch` on a
gambrel, else `roof.pitch`. A gambrel's upper slope takes `roof.pitch` (7.15).

A `Slope` is one straight rafter line in a section across the building. The section is drawn for a
side whose eave wall's outside face is at y = 0, and the roof rises toward +y. The formulas are for
the eave slope.

| Field | Formula | Content |
|---|---|---|
| `pitch` | `pitchOf(...)` | The slope's `Pitch`. |
| `depth` | `LUMBER[roof.rafter].width` | Rafter depth, square to its edge. |
| `seat` | `seatLength(...)` (7.4) | Length of the birdsmouth seat. 0 on a slope with no birdsmouth. |
| `bottom(y)` | `plate + rise * (y - seat)` | Rafter bottom edge. It passes through (seat, plate), the inner end of the seat. |
| `top(y)` | `bottom(y) + depth / cos` | Rafter top edge. `depth / cos` is the plumb depth, `plumb`. |

A `Profile` is the roof profile of one side. `profileOf(slopes)` builds it from the slopes, eave
slope first: one for a gable or a lean-to, two for a gambrel. The roof profile is convex, so each of
its lines is the lowest of the slopes' lines.

| Field | Content |
|---|---|
| `slopes` | The slopes, eave slope first. |
| `top(y)`, `bottom(y)` | The lowest `top(y)` or `bottom(y)` of the slopes. |
| `reachTop(z)` | The y where the top line rises to z from the eave: the largest `(z - top(0)) / rise` of the slopes. |
| `reachBottom(z)` | The y where the bottom line rises to z from the eave: the largest `seat + (z - bottom(seat)) / rise` of the slopes. |
| `along(from, to)` | The slopes that the top line follows from y = `from` to y = `to`. |

`crossing(first, second)` returns the point where two straight lines z = f(y) cross. `profileOf`
uses it to find the break on the top line. With one slope, each `Profile` function gives the value
of the slope's own formula.

`Side.map` moves the drawn section onto a real side: `y` for the front, `width - y` for the back.
`Side.sign` is +1 or −1. A side's `map` is its own inverse.

## 3. Build order

`buildModel(config)` (`src/core/model.ts`) runs the generators in this order:

| Step | Call | Reads | Returns |
|---|---|---|---|
| 1 | `frameFloor(config)` | config | `members`, `solids` |
| 2 | `frameWalls(config)` | config | `members`, `warnings`, `solids` (anchor bolts), `openings` |
| 3 | `frameRoof(config)` | config | `members`, `solids` (gussets), `warnings`, `planes`, `openings` (gable), `rafterSpans`, `deck`, `soffit`, `eave` |
| 4 | `frameAdditions(config, roof, shed)` | config, `roof.soffit`, `roof.eave`, shed members | lean-tos |
| 5 | `frameRamps(config, shed)` | config, shed members (for grade) | ramps |
| 6 | `frameSheathing(config, members, openings, planes, roof.deck)` | all members, all ROs, all roof planes, the loft deck | sheet solids |

Steps 1 to 3 read only the config. They share geometry through pure functions, not through
outputs: `frameRoof` calls `wallTops`, `wallFrames`, `placements`, `inGable`, `openingZone`,
`resolveHeader`, `warnThickHeader`, `openingBoards`, `leftOut`, and `splitPlate` from `walls.ts`.
`frameFloor` calls `splitPlate`. `shed` is the floor, wall, and roof members.

The heights chain through z = 0:

1. `frameFloor` puts all its parts below z = 0.
2. `frameWalls` stands every wall on z = 0. `wallTops` gives each wall's top.
3. `frameRoof` seats the rafters on `wallTops`, or on the knee walls (7.13).

The `Model` collects:

| Field | Content |
|---|---|
| `members` | Floor, walls, roof (with gable ends and attic), lean-tos, ramps. |
| `solids` | Floor, walls, roof (gussets), lean-tos, ramps, sheathing. |
| `warnings` | Walls, roof (with gable ends and attic), lean-tos, ramps. `frameFloor` has no warnings. |
| `openings` | Wall ROs, then gable ROs. Only fitted openings. |
| `planes` | Main roof planes, then lean-to roof planes. |
| `rafterSpans` | The main rafter spans for `checkSpans`, one for each rafter member (7.12). |
| `leanTos` | Lean-to facts for the span checks. |

## 4. Foundation and floor

`frameFloor(config)` builds the foundation and the floor framing. Everything it builds is below
z = 0. It has no warnings.

### 4.1 Inputs

| Field | Values | Default | Use |
|---|---|---|---|
| `width`, `length` | 48–480 | 120, 144 | Footprint. |
| `foundation.type` | `skid`, `pier`, `slab` | `skid` | |
| `foundation.skid.size` | `4x4`, `4x6`, `6x6` | `4x6` | Stands on edge. |
| `foundation.skid.count` | 2–6 | 3 | |
| `foundation.pier.diameter` | 8, 10, 12 | 10 | |
| `foundation.pier.depth` | 0–72 | 36 | Below grade. |
| `foundation.pier.aboveGrade` | 0–48 | 8 | |
| `foundation.pier.post` | `none`, `4x4`, `6x6` | `none` | |
| `foundation.pier.postLength` | 6–96 | 12 | With a post only. |
| `foundation.pier.girder` | any `LUMBER_SIZES` | `2x8` | Ply size. |
| `foundation.pier.girderPlies` | 1–3 | 2 | |
| `foundation.pier.girderCount` | 2–6 | 2 | |
| `foundation.pier.maxSpacing` | 24–144 | 72 | Pier center to pier center, along a girder. |
| `foundation.slab.thickness` | 3-1/2–8 | 4 | |
| `foundation.slab.thickenedEdge` | boolean | true | |
| `foundation.slab.edgeWidth`, `edgeDepth` | 6–36 | 12, 12 | Edge depth: slab top to edge bottom. |
| `floor.joist` | `2x4`–`2x12` | `2x6` | |
| `floor.oc` | 12, 16, 19.2, 24 | 16 | |
| `floor.treated` | boolean | true | |
| `floor.blocking` | boolean | false | |
| `floor.subfloor` | sheet key | `tg-23/32` | Only its thickness. `frameSheathing` lays the sheets. |
| `catalog.maxLength`, `catalog.stock` | | 192 | Longest stock for splices (5.6). |

### 4.2 Framed floor (skid and pier)

1. Set `joistBottom = -SHEETS[floor.subfloor].thick - LUMBER[floor.joist].width`. Default:
   −(23/32 + 5-1/2) = −6-7/32.
2. Put an end joist at x = 0 and at x = `length − 1-1/2`.
3. Put a layout joist at `from = i * oc - 0.75` for each i ≥ 1 with `i * oc < length`. Keep it only
   where `from >= 1.5` and `from + 1.5 <= length - 1.5`, clear of the end joists.
4. Run each joist front to back between the rims: length `width − 3`, from y = 1-1/2, on edge.
5. Run a rim along y = 0 and along y = `width`, the full length. `splitPlate` splits each rim on
   the joist centers.
6. With `floor.blocking`, fill each bay with one block at mid-span, centered on y = `width / 2`,
   from one joist face to the next.

| Role | Id | Length | Position |
|---|---|---|---|
| `joist.end` | `FL-EJnn` | `width − 3` | x = 0 and `length − 1-1/2` |
| `joist.floor` | `FL-Jnn` | `width − 3` | Layout positions |
| `rim.floor` | `FL-Rnn` | Pieces of `length` | y = 0 to 1-1/2, and y = `width − 1-1/2` to `width` |
| `blocking` | `FL-Bnn` | The bay's clear width | y = `width / 2 − 3/4` |

All are `floor.joist` size and `floor.treated`, with no notes.

Example, 8 × 10 ft, 2x6 at 16 in: layout joists at x = 15-1/4, 31-1/4, ... 111-1/4, each 93 in.
The blocks are 5-3/4, 13-3/4, and six of 14-1/2.

`rafterStarts` (7.5) uses the same rule as steps 2 and 3. Floor joists and rafters at the same o.c.
land on the same x.

### 4.3 Skids

1. Stand each skid on edge: `height` is the lumber width, `across` is the lumber thickness.
2. Center skid i on `y = across / 2 + i * (width - across) / (count - 1)`. The outer skids are
   flush with the floor edges.
3. Put the skid top at `joistBottom`, under the joists and rims.
4. Split each skid run with `splitPlate([x0, x1], maxStock(size), joist centers)`. The run is
   `[0, length]`, longer where a gable-end deck continues it (`continuedDecks` in `deck.ts`): out to
   that deck's beam, with its joist centers as more splice points. `supportLines` (`supports.ts`)
   gives the line positions, width, and top, which the lean-to decks share.
5. `skidOutline` (`supports.ts`) cuts each outer end of a run, so a continued run has its cut at the
   deck end.
5. Cut each run end (a piece end at x = 0 or x = `length`) 45° across the bottom. The cut is
   `cut = round(height / 3 * 8) / 8`: one third of the height, to the nearest 1/8 in. It runs
   `cut` up the end and `cut` in along the bottom.
6. Leave each splice end square.
7. Build each piece with `planeMember` on the plane (0, y + across / 2, 0), h = +x. Set
   `treated: true`.

| Skid | Height | `cut` |
|---|---|---|
| `4x4` | 3-1/2 | 1-1/8 |
| `4x6` | 5-1/2 | 1-7/8 |
| `6x6` | 5-1/2 | 1-7/8 |

The note names the cut ends:

| Piece | Note |
|---|---|
| Both run ends | `Both ends cut 45° across the bottom, 1-7/8" up and in, so the shed drags without digging in.` |
| One run end | `The outer end cut 45° ...` |
| No run end | None. |

Decision: the skid ends are cut so a skid shed drags without digging in. The cut acts as a sled
runner, so the shed rides up over the ground. Only the outer ends of a run get the cut. A splice in
a long run stays square.

### 4.4 Piers

| Quantity | Formula |
|---|---|
| `radius` | `diameter / 2` |
| `bays` | `ceil((length - 2 * radius) / maxSpacing)` |
| Pier x | `x0 + radius + i * (x1 - x0 - 2 * radius) / bays`, i = 0 to `bays`, over the line's run `[x0, x1]`: the floor's length, or longer under a continued gable-end deck. The end piers are flush with the run's ends. |
| `girderWidth` | `girderPlies * LUMBER[girder].thick` |
| `girderBottom` | `joistBottom - LUMBER[girder].width` |
| `postLength` | `pier.postLength`, or 0 with no post |
| `pierTop` | `girderBottom - postLength` |
| Girder line y | `lines(girderCount, max(girderWidth, postSide, diameter))`: the same formula as skids, with the widest part as `across` |
| Ply k origin y | `line - girderWidth / 2 + k * ply thickness` |

1. Lay each girder line from `girderPlies` plies, each the full length on edge, under the joists.
2. Split each ply with `splitPlate([0, length], maxStock(girder), pier x)`. All plies of a line
   splice over the same piers.
3. With a post, stand one square post on each pier, centered, from `pierTop` up to the girder.
4. Put a pier cylinder under each post or girder: top at `pierTop`, base at
   `pierTop - aboveGrade - depth`.

| Part | Role or solid | Id | PT |
|---|---|---|---|
| Girder ply | `girder` | `FD-GDnn` | Yes |
| Post | `post` | `FD-PSnn` | Yes |
| Pier | cylinder, label `Pier, 10" diameter` | `FD-PRnn` | — |

Decision: the widest of girder, post, and pier sets the line spacing, so no part passes the floor
edge.

Example, 10 × 12 ft, three 2-ply 2x8 girders, 10 in piers, 72 in maximum spacing: girder centers at
y = 5, 60, 115. (144 − 10) / 72 rounds up to 2 bays, so the piers are at x = 5, 72, 139. Each pier
runs 44 in, from 36 in below grade to 8 in above it.

### 4.5 Slab

1. Pour the slab: a box from (0, 0, −`thickness`) to (`length`, `width`, 0).
2. When `thickenedEdge` is set and `edgeDepth > thickness`, add four boxes from z = −`edgeDepth` to
   −`thickness`, `edgeWidth` wide. The front and back strips run the full length. The left and right
   strips fit between them.
3. Return no members. The walls stand on the slab at z = 0, on mud sills (5.7).

### 4.6 Grade

`gradeOf(config, framing)` returns the z of the ground:

| Foundation | Grade |
|---|---|
| `slab` | 0, the slab top. |
| `skid` | The lowest corner of the `foundation` members: the skid bottoms. |
| `pier` | The lowest corner of the `foundation` members (the post bottoms, or the girder bottoms), less `aboveGrade`. |

`frameAdditions` and `frameRamps` call it with the shed members.

### 4.7 Change it safely

- Keep every floor part below z = 0. The walls, the roof, and `gradeOf` assume the floor surface
  at z = 0.
- A new `foundation` member lower than the skids or posts moves grade for lean-to decks and ramps.
- Keep each skid profile within its lumber width. `tests/every-design.test.ts` checks it.
- Rims, skids, and girders splice through `splitPlate`. Give it the centers of the members that
  bear on the run.
- `lines` divides by `count - 1`. The schema keeps `count` and `girderCount` at 2 or more.
- `tests/floor.test.ts` pins the joist layout, blocking, skid lines and cuts, girder plies, piers,
  posts, the slab, and the anchor bolts.

## 5. Walls

`frameWalls(config)` frames the four walls: plates, corners, layout studs, openings (section 6),
mud sills, and anchor bolts. `frameWall` frames one wall in its frame (2.2).

### 5.1 Inputs

| Field | Values | Default | Use |
|---|---|---|---|
| `walls.stud` | `2x4`, `2x6` | `2x4` | Stud and plate size. Its width is the wall depth. |
| `walls.oc` | 12, 16, 19.2, 24 | 16 | Layout. |
| `walls.capPlate` | boolean | true | |
| `walls.mudSill` | `none`, `match`, `2x4`–`2x12` | `match` | Slab only. `match` is the stud size. |
| `walls.corner` | `four-stud`, `three-stud`, `california`, `two-stud` | `four-stud` | |
| `walls.through` | `ends`, `eaves` | `ends` | Gable or gambrel roof only. |
| `studHeight` | 92.625, 104.625, 116.625, `custom` | 92.625 | Precut stud length. |
| `wallHeight` | 60–200 | 97.125 | `custom` only: floor surface to the top of the top plates. |
| `roof.style`, `roof.pitch`, `roof.highSide` | | | Lean-to high wall (5.3). |
| `foundation.slab.anchorSpacing` | 12–120 | 72 | |
| `foundation.slab.anchorEndDistance` | 2–24 | 12 | |
| `catalog.maxLength`, `catalog.stock` | | 192 | Plate splices (5.6). |

### 5.2 Through walls and butted walls

`isThrough(config, wall)` returns `isEave(wall) !== (ridged(roof) && walls.through === 'ends')`.
`ridged(roof)` (`src/core/config.ts`) is true for a gable or a gambrel roof.

| Roof | `walls.through` | Through walls | Butted walls |
|---|---|---|---|
| gable, gambrel | `ends` | left, right | front, back |
| gable, gambrel | `eaves` | front, back | left, right |
| lean-to | any | front, back | left, right |

Decisions:

| Decision | Reason |
|---|---|
| A gable or gambrel roof's end walls run through by default. | Each gable end is one full-width frame. |
| A lean-to's eave walls always run through. | The lean-to's end walls stop below the high wall. |

| Quantity | Through wall | Butted wall |
|---|---|---|
| `span` | `length` for front and back, `width` for left and right | same |
| `start` | 0 | wall depth |
| `end` | `span` | `span` − wall depth |

Plates, layout studs, and openings stay between `start` and `end`.

### 5.3 Heights

| Function | Formula |
|---|---|
| `plateStack` | `(mud sill ? 1.5 : 0) + 1.5 * (capPlate ? 3 : 2)` |
| `studLengths` | Precut: `studHeight`. Custom: `wallHeight - plateStack`. |
| `studLengths`, lean-to | The high wall adds `pitch / 12 * (width - wall depth)`. |
| `wallTops` | `studLengths + plateStack`: the rafter bearing height. |

The stack in one wall:

| Layer | z of the bottom | Present |
|---|---|---|
| Mud sill (`plate.sill`) | 0 | Slab with a mud sill |
| Bottom plate (`plate.bottom`) | 0, or 1-1/2 on a mud sill | Always. On a slab with no mud sill it is a `plate.sill` (5.7). |
| Studs | `base = mud sill thickness + 1.5` | Always |
| Top plate | `plateUnder = base + stud length` | Always |
| Cap plate | `plateUnder + 1.5` | `walls.capPlate` |

| Case | Stud length | Wall top |
|---|---|---|
| Default, framed floor | 92-5/8 | 97-1/8 |
| Slab with mud sill, precut 92-5/8 | 92-5/8 | 98-5/8 |
| Slab with mud sill, custom 97-1/8 | 91-1/8 | 97-1/8 |
| Precut 116-5/8 | 116-5/8 | 121-1/8 |
| Lean-to 10 × 12 ft, 3/12, high side front | front 121-3/4, others 92-5/8 | front 126-1/4 |

Decisions:

| Decision | Reason |
|---|---|
| A precut keeps its length. A mud sill makes the wall 1-1/2 in taller. | The stud stays a stock precut. |
| A custom height keeps the wall top. The stud is shorter by the plate stack. | The user sets the wall top. |
| The lean-to high wall rises by `pitch / 12 * (width - wall depth)`. | Full-width seats: the rafter underside meets the low wall's inside top corner and the high wall's outside top corner. These corners are `width − wall depth` apart. |

### 5.4 Corners

The u positions are at the wall's left end. The right end mirrors them.

| `walls.corner` | Through wall, at each end | Butted wall | Pieces at one corner, both walls |
|---|---|---|---|
| `four-stud` | `corner` studs at u = 0, 1-1/2, and 3: end, middle, and backing studs, face-nailed into a solid post | End stud at u = wall depth | 4 |
| `three-stud` | End stud at u = 0. Backing stud at u = wall depth, its face in line with the butted wall's inside face. | End stud at u = wall depth | 3 |
| `california` | End stud at u = 0. A flat backing stud from u = 1-1/2 to 1-1/2 + wall depth, on the inside edge (v = wall depth − 1-1/2). | End stud at u = wall depth | 3 |
| `two-stud` | End stud at u = 0 | End stud at u = wall depth | 2 |

Every corner piece has role `corner`, code `C`, and the full stud length from `base`. Each one
goes into `occupied`, so openings and layout studs keep clear of it. Each one except the flat
California stud also goes into `centers`, where plate splices can land.

Example, 8 × 10 ft, four-stud, right wall: corner studs at y = 0, 1-1/2, 3, 91-1/2, 93, 94-1/2.

### 5.5 Layout studs

Decision: the layout starts at the building corner, u = 0, also on a butted wall. Reason: sheet
edges land on stud centers.

1. Take `from = i * oc - 0.75` for each i ≥ 1 with `i * oc < span`. The stud center is at
   `i * oc`.
2. Skip the position if it is outside `[start, end]`.
3. Skip the position if it overlaps `occupied`: corners, kings, and jacks.
4. If it overlaps a fitted opening's zone, put cripples there (6.7).
5. Else put a full-height `stud` there, from `base`.

`stud` positions go into `centers`. Cripples do not.

Example, 8 × 10 ft at 16 in: front stud centers at x = 16, 32, ... 112. Back stud centers at
x = 120 − 16, ... 120 − 112, because the back wall's u runs from x = `length`. Rafters lay out from
x = 0 (7.5), so back-wall studs and rafters line up only when `length` is a multiple of the o.c.

### 5.6 Plates and splices

| Plate | Role, code | Extent | z |
|---|---|---|---|
| Bottom plate | `plate.bottom`, `BP` | `[start, end]` | 0, or 1-1/2 on a mud sill |
| Top plate | `plate.top`, `TP` | `[start, end]` | `plateUnder` |
| Cap plate | `plate.cap`, `CP` | `[capInset(near), span - capInset(far)]` | `plateUnder + 1.5` |

Each plate lies flat across the wall depth, from the outside face. `splitPlate` splits each run on
`centers`. The cap also avoids the top plate's splices.

`capInset(other)` compares this wall's stud length with the adjacent wall's (`heights[other] ===
studLength`):

| This wall | Corner | Cap inset |
|---|---|---|
| Through | Level | Wall depth: the cap stops short. |
| Through | Step in height | 0: the cap runs to the building corner. |
| Butted | Level | 0: the cap runs to the building corner, over the through wall's top plate. |
| Butted | Step in height | Wall depth. |

Decision: at a level corner the butted wall's cap laps over the through wall's top plate, and the
through wall's cap stops short. At a step in height neither cap laps.

| Case | Cap lengths |
|---|---|
| 8 × 10 ft gable, ends through | left 89, front 120 |
| 8 × 10 ft gable, eaves through | front 113, left 96 |
| 10 × 12 ft lean-to, high side front | front 144, back 137, left 116-1/2, right 116-1/2 |

`splitPlate([start, end], maxLength, studCenters, avoid = [])`:

1. Set `from = start`.
2. While `end - from > maxLength`, find the legal joints: stud centers `c` with
   `c - from >= 24`, `c - from <= maxLength`, `end - c >= 24`, and at least 24 from each `avoid`
   value.
3. If no joint is legal, stop. The rest stays one piece, longer than stock, with no warning.
4. Take the largest legal joint. Add the piece `[from, joint]`. Set `from = joint`.
5. Add the last piece `[from, end]`.

| Constant | Value | Rule |
|---|---|---|
| `MIN_PLATE_PIECE` | 24 | No piece shorter than 24 in at a run end. |
| `CAP_SPLICE_OFFSET` | 24 | A cap splice stays 24 in or more from a top-plate splice. |

`maxLength` is the longest stock length of the size that is not longer than `catalog.maxLength`
(`stockFor` in `src/core/catalog.ts`). When no stock length is short enough, `stockFor` returns the
shortest one.

| Case | Top plate | Cap plate |
|---|---|---|
| 24 ft end wall, `maxLength` 240 | 240, 48 | 204-1/2, 76-1/2 (the 224 joint is 16 in from the top splice) |
| 24 ft end wall, default 192 | 192, 96 | 156-1/2, 124-1/2 |

`splitPlate` also splits floor rims, skids, girder plies, the ridge, fascia, purlins, loft ledgers
and rims, and knee-wall plates.

### 5.7 Mud sills

`mudSillSize(config)` returns the mud sill size, or null. It is null unless the foundation is a
slab and `walls.mudSill` is not `none`. `match` gives the stud size.

| Foundation | `walls.mudSill` | Members at the wall bottom |
|---|---|---|
| `skid`, `pier` | any | `plate.bottom` (`BP`) at z = 0, not PT. |
| `slab` | `none` | `plate.sill` (`SL`) at z = 0, PT, stud size. The PT plate is the bottom plate. |
| `slab` | `match` or a 2x size | `plate.sill` (`SL`) at z = 0, PT, sill size. `plate.bottom` (`BP`) at z = 1-1/2. |

The mud sill is flush with the outside face. A wider sill runs past the inside face. A mud sill has
the same pieces as the bottom plate.

Warning (source `Walls`): `The 2x4 mud sill is narrower than the 2x6 walls.` The sill is built.

### 5.8 Anchor bolts

On a slab only, `frameWall` sets bolts in each bottom-plate piece:

1. Remove the doorway spans from the piece (`subtract`). A doorway is a fitted opening with
   `sill === 0`, RO edge to RO edge.
2. For each part `[low, high]`, call `boltPositions(low, high, anchorEndDistance, anchorSpacing)`.
3. If the part is no longer than two end distances, put one bolt at its middle.
4. Else put `ceil((length - 2 * end) / spacing) + 1` bolts, evenly from `low + end` to `high - end`.
5. Put each bolt on the sill centerline, v = sill width / 2.

Each bolt is a steel cylinder, radius 1/4 in, label `Anchor bolt, 1/2"`, layer `foundation`. It
starts `BOLT_EMBED` = 7 in below the slab top and runs 9-1/2 in up: the embedment, the 1-1/2 in
sill, and 1 in more.

Example, 8 × 10 ft slab: the front sill runs 3-1/2 to 116-1/2, with bolts at 15-1/2, 60, and
104-1/2. With a door RO from 41 to 79, the bolts are at 15-1/2, 29, 91, and 104-1/2.

Decision: the bottom plate runs through doorways, so the wall goes up in one piece. You cut out the
doorway part after you anchor the wall (6.8). The bolts stay out of the doorways.

### 5.9 Change it safely

- `studLengths` and `wallTops` are the only source of wall heights. `frameRoof`, the gable ends,
  and the loft read them.
- A member that must block openings or layout goes into `occupied`. A member that a plate splice
  may land on goes into `centers`.
- At fit time, `occupied` holds only the corners (6.3). Kings and jacks go in after the fit.
- `capInset` compares stud lengths with `===`. Two walls that differ by any amount make a step.
- `tests/walls.test.ts` pins the corners, layout, plates, caps, splices, mud sills, custom heights,
  and the lean-to walls.

## 6. Openings in walls

`frameWall` fits each opening, then frames the fitted ones. The fit functions are shared with the
gable ends (8.6).

### 6.1 Inputs

| Field | Values | Default | Use |
|---|---|---|---|
| `openingTypes[].name` | text | — | A row refers to it. |
| `openingTypes[].kind` | `door`, `window`, `overhead`, `custom` | — | `overhead` gets the headroom check. |
| `openingTypes[].width`, `height` | 6–240, 6–192 | — | RO size. |
| `openingTypes[].header` | any `LUMBER_SIZES` | `walls.header` | Header ply size. |
| `openingTypes[].girder` | `single`, `double`, `triple`, `flat` | `double` | Header style. |
| `openingTypes[].plateBelow`, `plateAbove` | boolean | false | Flat header plates. |
| `openingTypes[].jacks` | `auto`, 1–3 | `auto` | Jacks per side. |
| `openingTypes[].headroom` | 0–48 | 12 | Overhead doors: clear height above the RO for the track. |
| `openings[].enabled` | boolean | true | |
| `openings[].type`, `wall` | name, model side | — | |
| `openings[].sill` | 0–240 | 0 | Floor surface to the RO bottom. |
| `openings[].along` | `percent`, `left`, `right` | `percent` | |
| `openings[].at` | list | — | One opening for each value. |
| `walls.header` | `2x4`–`2x12` | `2x8` | |
| `walls.doubleJackOver` | 24–240 | 72 | RO width above which `auto` gives 2 jacks a side. |
| `walls.sillPlies` | 1–2 | 1 | Rough sill plies. |

### 6.2 Placement

`placements(config)` makes one `Placed` for each value in `at` of each enabled row. Its `label`
comes from `openingLabel`, in the user's side names: `window (front 60" from left)`.

`roOffset(along, value, span, width)` (`src/core/placement.ts`) gives the RO left edge, from the
wall's left corner viewed from outside:

| `along` | RO left edge |
|---|---|
| `left` | `value` |
| `right` | `span - value - width` |
| `percent` | `span * value / 100 - width / 2` |

`inGable(config, row)` is true for a row on an end wall with `sill >= wallTops[wall] - 0.01`. Such a
row frames in the gable (8.6), not the wall.

### 6.3 Fit order and checks

`frameWall` fits the openings one at a time, in config order: row by row, then position by
position. `blocked` holds `occupied` (only the corners at this time) and the zones of the openings
fitted before. The first opening in the list wins a conflict.

`openingZone(type, offset, walls)`:

| Quantity | Formula |
|---|---|
| `jacks` | `auto`: 2 when `width > walls.doubleJackOver`, else 1. Else the number given. |
| `side` | `(jacks + 1) * 1.5`: the king and jacks on one side. |
| `zone` | `[offset - side, offset + width + side]`: outside face of the left king to outside face of the right king. |

`fitOpening` runs these checks in order. A left-out opening stops at its first failed check.

| Step | Check | Result |
|---|---|---|
| 1 | `zone` outside `[start, end]` | Left out: `The framing runs past the wall end. The king and jacks need 3" on each side of the RO.` |
| 2 | `zone` overlaps `blocked` | Left out: `The framing overlaps a corner or another opening.` |
| 3 | `gap = plateUnder - roTop - header.depth < 0` | Left out: `The header does not fit. RO top ... plus ... of header is above the top plate at ....` |
| 4 | `0 < gap < 3` | Adjusted: tight header (6.6). |
| 5 | `sill > 0` and `sill - sillPlies * 1.5 < base` | Left out: `The rough sill is below the top of the bottom plate.` |
| 6 | Header plies thicker than the wall | Warning, built (6.4). It comes after the left-out checks, so only a built opening carries it. |
| 7 | Flat header on the front or back wall | Warning, built: `A flat header is on a bearing wall.` |
| 8 | `kind === 'overhead'` and `wallTop - roTop < headroom` | Warning, built: `The headroom above the RO is 13-1/8". The door needs 16".` |

`roTop` starts at `sill + height`. `wallTop` is the top of the top plate, or of the cap plate.

### 6.4 Headers

`resolveHeader(type, walls)`:

| Field | Formula |
|---|---|
| `size` | `flat`: `walls.stud`. Else `type.header ?? walls.header`. |
| `plies` | `single` 1, `double` 2, `triple` 3, `flat` 1 (`HEADER_PLIES`) |
| `depth` | `(flat ? thick : width) + 1.5 * (plateBelow + plateAbove)`: the whole stack |

`openingBoards(frame, walls, fit)` builds the stack between the kings, on the jacks:

1. Set the header span to `[zone[0] + 1.5, zone[1] - 1.5]`. Its length is the RO width plus
   `2 * jacks * 1.5`.
2. Start at `level = roTop`.
3. With `plateBelow`, lay a flat `header.plate` (`HP`), stud size. Add 1-1/2 to `level`.
4. For `flat`, lay one flat `header` (`H`), stud size. Add 1-1/2.
5. Else stand `plies` header plies on edge. Ply i sits at `v = i * thick` from the outside face.
   When `plies * thick <= wall depth`, the last of 2 or more plies moves to the inside face:
   `v = wall depth - thick`. Add the lumber width.
6. With `plateAbove`, lay a flat `header.plate` (`HP`).

The gap between the outside plies and the inside ply holds a spacer. The model has no spacer
member, so the cut list and the BOM do not list one.

| Style | Wall | Ply v (from the outside face) | Result |
|---|---|---|---|
| `double` 2x | 2x4 | 0, 2 | Both faces flush. |
| `triple` 2x | 2x6 | 0, 1-1/2, 4 | Both faces flush. |
| `triple` 2x | 2x4 | 0, 1-1/2, 3 | 1 in proud of the inside face. Warning. |
| `single` 4x6 | 2x4 | 0 | Flush. |
| `flat` | any | Flat on the jacks | `header.size` is the stud size. |

`warnThickHeader(header, wallDepth, warn)` warns when `plies * thick - wallDepth > 0.01` on a header
that is not flat: `3 plies of 2x8 are thicker than the wall. They stand 1" proud of its inside
face.`

Decision: the app does not limit the user. A header thicker than the wall is built. Its plies
stack from the outside face and stand proud of the inside face, and a warning says by how much.

### 6.5 Kings and jacks

| Member | Role, code | u | z | Length |
|---|---|---|---|---|
| Left king | `king`, `K` | `zone[0]` | `base` | stud length |
| Right king | `king`, `K` | `zone[1] - 1.5` | `base` | stud length |
| Left jack i (1 to `jacks`) | `jack`, `J` | `offset - i * 1.5` | `base` | `roTop - base` |
| Right jack i | `jack`, `J` | `offset + width + (i - 1) * 1.5` | `base` | `roTop - base` |

Kings and jacks go into `occupied`. Kings also go into `centers`.

Example, 8 × 10 ft, a 64 × 76 door on the left wall at 16 in. The kings are 92-5/8, and the jacks
are 74-1/2 (76 − 1-1/2). The double 2x8 header plies are 67 (64 + 2 jacks). A 108 in garage RO gets
2 jacks a side.

### 6.6 Tight header

When the gap between the header stack and the top plate is more than 0 and less than `MIN_CRIPPLE`
= 3 in:

1. Raise `roTop` by `gap`. The header goes tight under the top plate.
2. The jacks grow by `gap`. No cripples go above the header.
3. Warn: `The header goes tight to the top plate, because cripples would be shorter than 3". The RO
   height grows by 2-3/8" to 84-7/8".`

`RoughOpening.top` is the raised `roTop`. The sheathing and the span checks read it.

Example: an 82-1/2 in door with a 2x10 header. 82-1/2 + 9-1/4 = 91-3/4, which is 2-3/8 in under
the plate at 94-1/8. The jacks become 83-3/8 and the RO grows to 84-7/8.

Decision: a gap under 3 in closes, so no cripple above a wall header is shorter than 3 in.

### 6.7 Rough sill and cripples

| Member | Role, code | Rule |
|---|---|---|
| Rough sill | `sill`, `RS` | Only when `sill > 0`. `sillPlies` flat plies, RO width long, from `offset`. Ply i at `sillBottom + i * 1.5`, with `sillBottom = sill - sillPlies * 1.5`. |
| Upper cripple | `cripple`, `CR` | At each layout position in the zone that is clear of the kings and jacks. From the header top to `plateUnder`, when that is more than 0. |
| Lower cripple | `cripple`, `CR` | At the same positions, from `base` to `sillBottom`, when `sillBottom > base`. |

The tight-header rule keeps each upper cripple at 3 in or more. A lower cripple has no minimum
length: a sill of 4 in on a framed floor gives 1 in cripples.

Example, 8 × 10 ft, a 24-1/2 × 36-1/2 window on the front wall at 48 in, sill 46. The jacks are
81, the header plies 27-1/2, and the rough sill is at z = 44-1/2. Layout 64 takes a 4-3/8 cripple
above and a 43 cripple below. Layout 16, 32, 80, 96, and 112 stay full studs.

### 6.8 Doorways

An opening with `sill === 0` has no rough sill. The bottom plate runs through it. Each bottom-plate
piece over a doorway gets a note, measured from that piece's left end:

`After anchoring, cut out door (left 16" from left) from 16" to 80" from the left end, viewed from
outside.`

A mud sill under that piece gets the same note. Anchor bolts skip the doorway (5.8).

### 6.9 Left-out openings

`leftOut(placed, assembly, frame, span, message)` returns the warning:

- `source` is the opening's label.
- `message` is the reason, then `LEFT_OUT`.
- `missing.assembly` is the wall's assembly, for example `wall.front`.
- `missing.outline` is the RO on the wall's outside face (v = 0): RO left to right, `sill` to
  `sill + height`.

A left-out opening emits no members. It does not block later openings or the layout, so layout studs
fill its place. It has no entry in `Model.openings`, so the sheathing does not cut a hole for it.

Example: a window at 48 and at 60 on the front wall. The one at 60 overlaps and is left out, with
the outline (60, 0, 46), (84-1/2, 0, 46), (84-1/2, 0, 82-1/2), (60, 0, 82-1/2).

### 6.10 Output

Each fitted opening adds a `RoughOpening` to `Model.openings`:

| Field | Content |
|---|---|
| `wall` | Model side. |
| `name` | Opening type name. |
| `left`, `right` | RO edges, u in the wall frame. |
| `bottom`, `top` | `sill` and `roTop`, from the floor surface. |
| `header` | `headerOf(header)`: `size`, `plies`, `flat`, for `checkSpans`. |

### 6.11 Change it safely

- Every fit check runs before the opening emits a member. A leave-out returns null and emits
  nothing.
- `openingZone`, `resolveHeader`, `warnThickHeader`, `openingBoards`, and `leftOut` also frame gable
  openings. Check section 8 after a change.
- To add a new left-out case, follow "Leave out a part that cannot be framed" in DEVELOPER.md.
- `tests/openings.test.ts` pins the kings, jacks, header plies and positions, header plates, the
  tight header, cripples, rough sills, doorway notes, placement rows, and the left-out outlines.

## 7. Roofs

`frameRoof(config)` frames the rafters, ridge board, rake ladders, fascia, purlins, and a gambrel's
gussets. It calls `frameAttic` (section 9) and `frameGableEnds` (section 8). It returns the roof
planes, the rafter spans, the gussets, the loft deck, and the facts that lean-tos build against.

### 7.1 Inputs

| Field | Values | Default | Use |
|---|---|---|---|
| `roof.style` | `gable`, `gambrel`, `lean-to` | `gable` | |
| `roof.pitch` | 1–24 | 6 | Rise per 12 of run. Gambrel: the upper slope. |
| `roof.gambrel.lowerPitch` | 12–36 | 20 | Gambrel: the lower slope, per 12. |
| `roof.gambrel.breakRun` | `auto`, 12–240 | `auto` | Gambrel: horizontal run from the eave wall's outside face to the break. `auto` is `width / 4`. |
| `roof.gambrel.ridgeBoard` | boolean | true | Gambrel: false butts the upper rafters at the peak, with peak gussets. `hasRidgeBoard(roof)` is true for a gable, or a gambrel with this on. |
| `roof.rafter` | `2x4`–`2x12` | `2x6` | |
| `roof.oc` | 12, 16, 19.2, 24 | 24 | |
| `roof.eaveOverhang` | 0–36 | 12 | Horizontal, from the wall's outside face. |
| `roof.rakeOverhang` | 0–24 | 8 | From the end wall's outside face. |
| `roof.tailCut` | `plumb`, `square` | `plumb` | |
| `roof.fascia` | `none`, `2x4`–`2x12` | `2x6` | |
| `roof.ridge` | `2x4`–`2x12` | `2x8` | Gable and gambrel. |
| `roof.highSide` | `front`, `back` | `back` | Lean-to only. |
| `roof.roofing` | `shingles`, `metal`, `metal-over-sheathing` | `shingles` | Purlins for metal. |
| `roof.sheathing` | `none`, sheet key | `osb-7/16` | Purlin lift. |
| `roof.purlin` | `1x4`, `2x4` | `1x4` | |
| `roof.purlinSpacing` | 12–48 | 24 | Along the slope, center to center. |
| `roof.rakeLadder.size` | `2x4`–`2x12` | `2x4` | Lookouts and rail. |
| `roof.rakeLadder.spacing` | 12, 16, 19.2, 24 | 24 | Lookouts, at most this far apart. |
| `roof.rakeLadder.ridgeExtends` | boolean | true | With a ridge board: it runs out to the fly rafters. |
| `roof.rakeLadder.fasciaLookouts` | boolean | false | A lookout at each fascia end of the ladder. |
| `roof.rakeLadder.onEndRafter` | boolean | false | The gable-end rafter is the ladder's inner rail. |
| `roof.loft`, `roof.kneeWalls` | | | Raised roof (7.13). Knee walls: gable only. |
| `additions[]` with `attach: 'extension'` | | | `extensionSides`: the eaves that a lean-to roof extension takes over. |

A gambrel's `lowerPitch` must be more than `pitch`. Else the schema gives the error `The lower pitch
(L/12) must be steeper than the upper pitch (U/12)` at `roof.gambrel.lowerPitch`.

### 7.2 Gable, gambrel, and lean-to

In `frameRoof`, `gable` is `ridged(roof)`: true for a gable or a gambrel roof. The formulas below
use it in that sense.

| Item | Gable | Gambrel | Lean-to |
|---|---|---|---|
| Slopes in the roof profile | 1, at `roof.pitch` | 2: lower at `lowerPitch`, upper at `roof.pitch` (7.15) | 1, at `roof.pitch` |
| Low wall (`lowWall`) | `front` | `front` | `front` when `highSide` is `back`, else `back` |
| Sides drawn | front and back | front and back | the low side only |
| Drawn extent, `from` to `to` | `-eave` to `width / 2 - 0.75` (the ridge face) | As gable. The break divides it. | `-eave` to `width + eave` |
| Rafters | `rafter` | `rafter` to the break, `rafter.upper` from the break | `rafter` |
| High end cut (`highCut`) | Plumb, at the ridge | Plumb, at the ridge, on the upper rafter | `tailCut` |
| Birdsmouths (heel y) | 0 | 0, on the lower rafter | 0 and `width − wall depth` |
| Ridge board, ties, loft | Yes | Yes | No |
| Knee walls | Yes | No | No |
| Fascia | Each eave | Each eave | Low eave and high end |
| Gable framing (section 8) | Up to the ridge post | Up to the ridge post | Up to the high wall's inside face |

On a lean-to, the high wall is taller by the roof rise (5.3). The high birdsmouth has its heel at
the high wall's inside face, and its seat runs outward over that wall. The seat level is
`plate + rise * (width - wall depth)`, which is the high wall's top.

### 7.3 Bearing

| Quantity | Formula |
|---|---|
| `pitch` | `pitchOf(eavePitch(roof))`: the eave slope's pitch (2.6) |
| `raised` | `roof.style === 'gable' && roof.loft.enabled && roof.kneeWalls.enabled` |
| `plate` | `raised ? kneeBase + kneeWalls.height : wallTops[lowWall]` |
| `bearingDepth` | `raised ? LUMBER[kneeWalls.stud].width : wall depth` |
| `plumb` | `depth / cos` |

`kneeBase` is in 7.13. The seat (7.4), the tails (7.6), and the fascia (7.9) use the eave slope's
pitch.

### 7.4 Birdsmouth seat

`seatLength(depth, bearingDepth, pitch, warn)`:

1. Compute `limit = floor(depth / 3 / sin * 16) / 16`. A seat of `limit` cuts the notch 1/3 of the
   rafter depth deep, measured square to the edge (notch depth = `seat * sin`). It rounds down to
   1/16 in.
2. Set `seat = min(bearingDepth, limit)`.
3. If `seat >= 1.5`, return it.
4. Else warn: `A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 of the 3-1/2" rafter depth. Use a
   deeper rafter or a lower pitch.` Return 1-1/2.

The heel height is `rise * seat`.

| Rafter, pitch, wall | Seat | Heel |
|---|---|---|
| 2x6, 6/12, 2x4 | 3-1/2 (the full wall) | 1-3/4 |
| 2x4, 12/12, 2x4 | 1-5/8 | 1-5/8 |
| 2x4, 18/12, 2x4 | 1-1/2, with the warning | 2-1/4 |
| 2x6, 20/12 (gambrel lower slope), 2x4 | 2-1/8 | 3-9/16 |

Decision: the seat bears on the full wall depth when it can. It shortens so the notch stays within
1/3 of the rafter depth. The bearing stays at least 1-1/2 in.

### 7.5 Rafter layout and outline

`rafterStarts(length, oc)` gives the x of each rafter's near face: 0, `length − 1.5`, and
`i * oc - 0.75` for each i with the same keep rule as floor joists (4.2). Each start gets one rafter
on each drawn side. Example, 10 ft at 24 in: 0, 23-1/4, 47-1/4, 71-1/4, 95-1/4, 118-1/2.

`outline(slope, from, to, notches, lowCut, highCut)` returns the rafter polygon in the drawn
section:

1. Low bottom corner. Plumb: `(from, bottom(from))`. Square:
   `(from + depth * sin, top(from) - depth * cos)`.
2. For each notch: `(heel, bottom(heel))`, `(heel, level)`, `(heel + seat, level)`, with
   `level = bottom(heel + seat)`.
3. High bottom corner. Plumb: `(to, bottom(to))`. Square:
   `(to + depth * sin, top(to) - depth * cos)`.
4. High top corner `(to, top(to))`, then low top corner `(from, top(from))`.

A `Cut` is `plumb`, `square`, or a `Joint` `{ top, bottom }`: a miter at the break (7.15). At a
joint end, the outline takes the joint's `bottom` and `top` points in place of the corners at
`from` or `to`.

`planeMember` turns the outline into a member with `dir = (cos, sin)`.

The heel at y = 0 is at the eave wall's outside face. The seat runs inward from there, on the plate
top. The bottom edge passes through (seat, plate).

### 7.6 Tails

| Rule | Detail |
|---|---|
| Tail run | `eave = roof.eaveOverhang`, horizontal. The tail is `eave / cos` along the top edge past the heel line. |
| Square tail | Needs `eave >= depth * sin`, so the cut's lower corner stays outside the wall face. |
| Square tail on a short eave | Adjusted: plumb tails, and the warning `A square tail cut needs 2-7/16" of eave overhang. The tails are plumb cut.` |
| Extended eave | A lean-to roof extension takes over the side's low eave. `lowEnd = 0`: the rafter stops at the wall's outside face, plumb cut, with no tail. |

### 7.7 Rafter notes

| Roof | Note |
|---|---|
| Gable | `Plumb cut 26.6° at the ridge. Birdsmouth: heel line 52-13/16" from the ridge long point on the top edge; seat 3-1/2", heel 1-3/4".` and the tail text. The heel line distance is `to / cos`. |
| Lean-to | `Birdsmouths on the top edge, X and Y from its low end; each seat S, heel H. Both ends plumb cut 14.0°.` (or `Both ends square cut.`). X is `run / cos`, Y is `(width - wall depth + run) / cos`, with `run = -lowEnd`. |
| Gambrel, lower rafter | `Cut 16.2° from square at the break. Birdsmouth: heel line 46-5/8" from the break long point on the top edge; seat 2-1/8", heel 3-9/16".` and the tail text. The heel line distance is `run / cos`, with the break `run` (7.15). |
| Gambrel, upper rafter | `Cut 16.2° from square at the break. Plumb cut 26.6° at the ridge.` |

| Tail text | When |
|---|---|
| `Tail 13-7/16" past the heel line on the top edge, plumb cut.` | `eave > 0` |
| `No tail.` | `eave = 0` |
| `No tail: plumb cut at the wall line, under the lean-to rafter beside it.` | Extended side |

The gambrel notes are for the example in 7.15.

With `rakeLadder.onEndRafter` and a rake, the gable-end rafters of each side add: `Build the rake
ladder on this rafter on the ground (lookouts and fly rafter), then set it in place.` On a gambrel,
the lower and the upper gable-end rafters both add it.

### 7.8 Ridge board

On a gable roof, or a gambrel with `gambrel.ridgeBoard`. Without it, `to` is `width / 2`: the upper
rafters run to the ridge line, plumb cut, against each other. Their note ends `Plumb cut 26.6° at
the peak, against the rafter on the other side.` Peak gussets join them (7.15). `peak` is the slope at the ridge: the upper slope on a gambrel,
else the eave slope.

1. Set the ridge top to `peak.top(to)`: the rafter top at the ridge face.
2. Set the ridge bottom to the top less the ridge lumber width.
3. Center the ridge on y = `width / 2`, 1-1/2 thick.
4. Run it from −rake to `length + rake` with `ridgeExtends`, else from 0 to `length`.
5. Split it on the rafter centers.

Warning, built: `The ridge board (2x6) is shallower than the rafter plumb cut (6-1/8").` It fires
when the ridge width is less than the plumb cut at the ridge, `depth / peak.cos`.

Example, 8 × 10 ft, 2x6 at 6/12, 2x8 ridge, 8 in rakes: the ridge is 136 long. Its bottom is at
97-1/8 + 1/2 × (47-1/4 − 3-1/2) + 5-1/2 / cos − 7-1/4 = 117.899. On the gambrel in 7.15, the
ridge top is 144.273 + 1/2 × 23-1/4 = 155.898, and its bottom is 148.648.

### 7.9 Fascia

With `roof.fascia` not `none`, each drawn side gets a fascia at:

- the low eave, y = `from`, unless the side is extended;
- on a lean-to, the high end, y = `to`.

1. Run the fascia from x = −rake to `length + rake`, split on the rafter centers.
2. Put its top at the rafter top at the tail, `slope.top(y)`.
3. On plumb tails, hang it plumb against the tail cut.
4. On square tails, tilt it square to the roof.

Example, 8 × 10 ft: two fascia boards of 136 in.

### 7.10 Rake ladders

The rake is `roof.rakeOverhang` when it is 1-1/2 in or more, else 0. With a rake of 0 there is no
ladder, and the ridge, fascia, and purlins stop at the end walls.

| Part | Role, code | x of the near face | Size | Built when |
|---|---|---|---|---|
| Fly rafter | `rafter.fly`, `FR` | −rake, and `length + rake − 1.5` | `roof.rafter` | rake > 0 |
| Rail | `rail.ladder`, `LR` | −1-1/2, and `length` | `rakeLadder.size` | not `onEndRafter`, and rake ≥ 3 |
| Lookout | `lookout`, `LO` | −rake + 1-1/2, and `length` (+ 1-1/2 with a rail) | `rakeLadder.size` | lookout length ≥ 1-1/2 |
| Peak block | `lookout`, `LO` | as the lookouts | `rakeLadder.size` | gable or gambrel, no ridge board or not `ridgeExtends` |

- The fly rafter has the rafter outline with no birdsmouth. Note: `No birdsmouth.` and the end cuts.
- The rail sits against the gable-end rafter's outside face, top flush with the rafter top. Its
  section is `railSlope`: `bottom(y) = slope.top(y) - ladder width / cos`. Note: `... Assemble the
  rake ladder on the ground, then face-nail this rail to the gable-end rafter, tops flush.`
- A lookout is `rake - (railed ? 2 : 1) * 1.5` long. It stands on edge, square to the roof, its top
  flush with the rafter tops.
- `flyTo` is `width / 2` when the ladders meet at the ridge line: no ridge board, or `ridgeExtends`
  false. Else it is `to`.

Each end of a side has one ladder for each slope of the roof profile:

| Ladder | `start` to `end` | Low end | High end | Lookouts, i |
|---|---|---|---|---|
| Gable, lean-to | Low end to `flyTo` | Tail cut | `highCut` | `fasciaLookouts ? 0 : 1` to `gaps − 1` on a gable or without `fasciaLookouts`, else to `gaps` |
| Gambrel, lower | Low end to the break | Tail cut | Miter (7.15) | `fasciaLookouts ? 0 : 1` to `gaps − 1` |
| Gambrel, upper | The break to `flyTo` | Miter | Plumb | 0 to `gaps − 1`: one at the break |

Lookout spacing along one ladder, on its own slope:

1. Set `reach = (end - start) / cos - 1.5 - ladder width * rise`. This is the last place where a
   lookout's lower corner stays inside a plumb line at `end`.
2. Set `gaps = max(1, ceil(reach / rakeLadder.spacing))`.
3. Put lookout i at `i * reach / gaps` along the top edge from `start`, for each i in the table.

On a gambrel, the lower fly rafter's note is `No birdsmouth. Cut 16.2° from square at the break.`
and the tail text. The upper fly rafter's note is `No birdsmouth. Cut 16.2° from square at the
break. Plumb cut 26.6° at the ridge.` Each rail has the same end cuts, then the assemble sentence.
The peak blocks follow the upper slope.

| Option | Effect |
|---|---|
| `fasciaLookouts` | A lookout at the tail end. On a lean-to, also at the high end. |
| `onEndRafter` | No rail. The gable-end rafter is the inner rail. Lookouts run from the fly rafter to it. The two end rafters get the ladder note. |
| `ridgeExtends` false | The ridge stops at 0 and `length`. Fly rafters and rails run to y = `width / 2`. A plumb block at the peak of each ladder meets the block on the other slope: note `Plumb, at the peak, against the block on the other slope.` |

Decisions:

| Decision | Reason |
|---|---|
| A rake ladder goes up in one piece: fly rafter, lookouts, and a rail face-nailed to the gable-end rafter. | Builders assemble it on the ground. |
| No lookout at a fascia end unless chosen. | The fascia ties the ladder's eave ends. |
| No lookout at the top of a gable ladder. | The ridge board, run out to the fly rafters, is the top rung. Without it, the peak block is. |
| A gambrel's upper ladder has a lookout at the break. | The lower and upper fly rafters meet there. |
| A rake under 3 in has no rail. | The rail and fly rafter need 3 in. |

Example, 8 × 10 ft, 8 in rakes, 2x4 ladder at 24 in: lookouts 8 − 3 = 5 in. Reach is 62.99, so
3 gaps and 2 lookouts a ladder, 8 in all. With `fasciaLookouts`, 12. With `onEndRafter`, the
lookouts are 6-1/2 in. On the gambrel in 7.15, the lower reach is 62.64: 3 gaps, 2 lookouts. The
upper reach is 22.74: 1 gap, 1 lookout at the break. That gives 12 lookouts, 8 fly rafters, and 8
rails.

### 7.11 Purlins

With `roof.roofing` not `shingles`, purlins lie flat across the rafters. Each slope of a side gets
its own purlins, from its low edge `start` to its high edge `stop`. One slope runs from the low end
to `to`. A gambrel's lower slope runs from the low end to the break, and its upper slope from the
break to `to`.

1. Set `lift` to the sheathing thickness for `metal-over-sheathing` with sheathing, else 0.
2. Set `run = (stop - start) / cos - purlin width` along the slope.
3. Set `gaps = max(1, ceil(run / purlinSpacing))`.
4. Put purlin i, for i = 0 to `gaps`, at `i * run / gaps` along the top edge from `start`.
5. Run each from −rake to `length + rake`, split on the rafter centers.
6. Raise it by `lift` square to the roof. A raised purlin has the note `Over the roof sheathing:
   fasten through it into the rafters.`

The lowest purlin starts at the tail. The highest ends at the ridge face or the high end. On a
gambrel, one purlin ends at the break, and the next starts there. Example, 8 × 10 ft, `metal`: 4
purlins a side, each 136.

### 7.12 Roof planes and rafter spans

Each slope of each drawn side gives one `RoofPlane` for the sheathing. A gambrel side gives two,
the lower plane first.

| Field | Content |
|---|---|
| `origin` | The low edge over the fascia, at the rake. `fasciaRun = fascia thick / (plumb tails ? cos : 1)`. An extended side starts at the wall line. A gambrel's upper plane starts at the break, on the top line. |
| `u`, `v` | Along x, and up the slope. `u × v` points out of the roof. |
| `length` | Rake to rake. |
| `width` | Gable: up to the ridge line, `width / 2`. Lean-to: over the high fascia. Gambrel lower plane: up to the break. Gambrel upper plane: `(width / 2 - run) / cos` of the upper slope, up to the ridge line. |
| `eaves` | Edges along u that take drip edge. 0 on a gambrel's upper plane. |
| `sheathed` | `roofing !== 'metal'`. |
| `ridge` | True when the upper edge is on the ridge line: a gable plane, or a gambrel's upper plane. |
| `breakEdge` | The edge on a gambrel's break: `high` on the lower plane, `low` on the upper plane. Else null. |

`rafterSpans` gives the horizontal clear span of each rafter member. `checkSpans` checks each entry
as its own member, named by `member`.

| Roof | `rafterSpans` |
|---|---|
| Gable | `Rafters`: `to - seat` |
| Lean-to | `Rafters`: `width - wall depth - seat` |
| Gambrel | `Lower rafters`: `run - seat`, the bearing to the break. `Upper rafters`: `to - run`, the break to the ridge face. |

`checkSpans` does not check the thrust at the break. On the gambrel in 7.15, the lower planes are
72.887 wide and the upper planes 26.833. The spans are 21-7/8 and 23-1/4.

### 7.13 Raised roof on knee walls

| Quantity | Formula |
|---|---|
| `raised` | `roof.style === 'gable' && loft.enabled && kneeWalls.enabled` |
| `kneeBase` | `hung`: `wallTops.front`. `plates`: `wallTops.front + loft joist width + deck thick`. |
| `plate` | `kneeBase + kneeWalls.height` |
| `bearingDepth` | Knee-wall stud width |

The rafters seat on the knee walls (9.8). The ridge and the collar ties rise with the slope.

Decision: a gambrel takes no knee walls, so it is never raised. The steep lower slope gives the
headroom.

Example, 8 × 10 ft, 2x6 loft joists on the plates, 23/32 deck, 36 in knee walls: `kneeBase`
103-11/32, bearing 139-11/32, ridge top 167.368.

### 7.14 Soffit and eave facts for lean-tos

`frameRoof` returns two facts that `frameAdditions` builds against.

`soffit.under(wall, u, x)` gives the main roof's underside x out from a wall's outside face, at u
along it:

| Wall | x | Height |
|---|---|---|
| Left, right | ≤ rake | The rafter underside at that y. Of the end rafter, lookouts, and fly rafter, the rafter line is the lowest. |
| Left, right | > rake | null |
| Front, back | ≤ eave | The rafter underside at that y. |
| Front, back | ≤ eave + fascia thickness | The fascia bottom: the rafter top at the tail less the fascia width. |
| Front, back | farther | null |

The rafter underside is `profile.bottom` (2.6). Over a gable end of a gambrel, it follows both
slopes.

`soffit.breaks(wall)` lists the x where `under` changes: `[0, rake]` on end walls,
`[0, eave, eave + fascia thick]` on eave walls.

`eave` gives the facts at the eave wall. A roof extension starts here.

| Field | Content |
|---|---|
| `top` | `slope.top(0)`: the rafter top over the outside face. |
| `plate` | The bearing plate top. |
| `bearing` | `bearingDepth`. |
| `pitch` | `eavePitch(roof)`: the eave slope, per 12. A lean-to with `pitch: 'main'` takes it. |
| `lap` | Gambrel: `run - 12 * cos`, horizontal from the wall's outside face to where the gussets start. Else `Infinity`. A same-plane roof extension laps the main rafters `min(24, lap)` in from the wall. |

On the gambrel in 7.15, `lap` is 24 − 12 × cos 59.0° = 17-13/16.

### 7.15 Gambrel break, miter, and gussets

A gambrel side has two slopes. The lower slope is the eave slope (2.6), at
`roof.gambrel.lowerPitch`. The upper slope rises from the break at `roof.pitch`.

`gambrelBreak(config)` gives the break. The form shows the same values.

| Field | Formula | Content |
|---|---|---|
| `wanted` | `breakRun`, or `width / 4` for `auto` | The break run that the user asks for. |
| `run` | `min(wanted, width / 2 - MIN_UPPER)`, `MIN_UPPER` = 12 | The break run. The break stays 1 ft from the ridge line. |
| `height` | `slope.top(run)` | The rafter top at the break. |

Warning, adjusted: `The break 40" in from the wall is within 1 ft of the ridge line. It is at 36".`
It fires when `run < wanted`.

| Upper slope | Formula |
|---|---|
| `top(y)` | `slope.top(run) + upper rise * (y - run)` |
| `bottom(y)` | `top(y) - depth / upper cos` |
| `seat` | 0 |

The two top lines cross at (`run`, `height`): the break on the top line.

`miterOf(eaveward, ridgeward, upper, lower)` gives the miter as a `Joint` `{ top, bottom }`. `top`
is the `crossing` of the two slopes' lines that are `upper` below their top lines, measured square
to each slope. `bottom` is the same at `lower`. The cut is on the bisector of the two slopes:
`M = (lower degrees - upper degrees) / 2` from square. Each note prints
`Cut M° from square at the break.`, with M to 0.1°.

| Member | `upper`, `lower` |
|---|---|
| Rafter, fly rafter | 0, rafter depth |
| Ladder rail | 0, ladder width |
| Gable top plate (8.3) | rafter depth, rafter depth + 1-1/2 |

| Rafter | Role, code | Extent | Cuts |
|---|---|---|---|
| Lower | `rafter`, `R` | Low end to the miter | Tail and birdsmouth as on a gable (7.5, 7.6). Miter at the break. |
| Upper | `rafter.upper`, `UR` | Miter to the ridge face | Miter at the break. Plumb cut at the ridge. No birdsmouth. |

Each rafter start gets one lower and one upper rafter on each side. Notes are in 7.7.

Gussets join each lower and upper rafter at the break:

1. Take the joint `miterOf(slope, upper, 0, depth)`: the break on the top line, and the inside
   corner.
2. From the break, go `GUSSET` = 12 in along each rafter's top edge. From there, go square across
   the rafter depth.
3. Common rafters: make the outline from 5 points: low bottom, high bottom, high top, break, low
   top. The lower edge runs straight across, under the inside corner, so the gusset is a web.
4. Gable-end rafters: make the outline from 6 points: low bottom, inside corner, high bottom, high
   top, break, low top. It stays within the rafter depth, because the gable top plate is under it.
5. Put one gusset on each face of each common rafter: the −x face at `x − thick`, the +x face at
   `x + 1-1/2`.
6. Put one gusset on each gable-end rafter, on its inside face. The outside face carries the rake
   ladder.

Without a ridge board, peak gussets join the upper rafters across the ridge line, in the same way:
12 in down each top edge from the peak, square across, the same faces. The common one runs straight
across under the inside corner; the gable-end one stays within the rafter depth. The back half is
the front half mirrored about y = `width / 2`. `ridgeBottom` for the ties (9.3) is then the peak
gussets' lowest point.

The Gussets sheet (drawings.md) tells the shapes apart by their label and corner count.

| Field | Value |
|---|---|
| Shape | `Panel` at that x, u = +y, v = +z. The outline is in real (y, z), counterclockwise. |
| `label` | `Break gusset, 15/32" plywood (1/2")`, or `Peak gusset, …` |
| `sheet`, `material`, `layer` | `ply-15/32`, `sheet`, `roof` |
| Id | `RF-GU01`, … at the break; `RF-GP01`, … at the peak |
| Count | Break: `2 × commons + 2` a side. Peak: `2 × commons + 2` in all, one set across both sides. |

`frameRoof` passes `Gussets { thick, bottom, top, inside }` to `frameAttic` (9.1, 9.3). The fields
are the plywood thickness, the lowest and highest z of the outline, and the z of the inside corner.

Example, 8 × 10 ft, 2x4 walls with plates at 97-1/8, 2x6 rafters at 24 in, 20/12 and 6/12, `auto`
break:

| Quantity | Value |
|---|---|
| `run` | 96 / 4 = 24 |
| Seat, heel | 2-1/8, 3-9/16 (7.4) |
| `height` | 97-1/8 + 20/12 × (24 − 2-1/8) + 5-1/2 / cos 59.0° = 144.273 |
| M | (59.0° − 26.6°) / 2 = 16.2° |
| Lower, upper rafter | 79.138, 25.994 |
| Gussets | 4 commons: 10 a side, 20 in all (16 with 5 corners, 4 with 6) |
| Without a ridge board | Upper rafter 24 × √1.25 = 26.833; 10 peak gussets; peak at 144.273 + 12 = 156.273 |

### 7.16 Change it safely

- Rafters, upper rafters, fly rafters, and rails go through `planeMember` with `dir` = (cos, sin) of
  their slope. Their length stays long point to long point. Keep new angled roof members on
  `planeMember`.
- `rafterStarts` puts the gable-end rafters first and last. `frameAttic` relies on that order for
  `commons`. The gussets rely on it to find the gable-end rafters.
- The ridge bottom is `profile.top(width / 2 - 0.75)` less the ridge width. `frameRoof` computes it
  from `peak.top(to)` and passes it to `frameAttic`. `frameGableEnds` computes the same value.
  Change both together.
- With one slope, each `Profile` function must give the value of the slope's own formula. Gable and
  lean-to output depends on it.
- `frameRoof` and `frameGableEnds` each build the text `Cut M° from square at the break.` Change
  both together.
- `gambrelBreak` repeats the seat and the break height of `frameRoof`. Change both together.
- A change to `soffit` or `eave` changes every lean-to. Run `tests/additions.test.ts` too.
- `tests/roof.test.ts` pins the rafter count and length, the birdsmouth, the seat limit, and the
  ridge. It also pins rake ladders, purlins, fascia, gable panels, gable studs, the gambrel roof,
  and the lean-to roof. Two cases check that every profiled member has right-handed axes: one on a
  gable, one on a gambrel.

## 8. Gable ends

`frameGableEnds(config, profile, sides, gable, wallTop, wallDepth, bearingDepth, raised, warnings)`
frames the area above each end wall, under the end rafters. It runs for every roof style. `gable` is
`ridged(roof)` (7.2). On a lean-to, the area is the slope above each end wall, up to the high wall.
`slope` is the eave slope, and `peak` is the slope at the ridge or the high wall.

### 8.1 Planes and members

Each end wall has its own plane (2.3), id prefix (`GL`, `GR`), and assembly (`gable.left`,
`gable.right`). The local `make` builds each plate, stud, king, jack, cripple, and post:
`walls.stud` size, profiled, with `depth` = wall depth. Such a member fills the end wall's depth:
x = 0 to wall depth on the left, and `length − wall depth` to `length` on the right. Headers, header
plates, and rough sills come from `openingBoards` as box members. `toY(u)` maps the end wall's u to
y: `width - u` on the left, `u` on the right.

### 8.2 Heights

| Quantity | Formula | Content |
|---|---|---|
| `plateTop` | `wallTop + (gablePanel ? 1.5 : 0)` | Where the gable studs stand. |
| `plateThick` | `1.5 / cos` of the eave slope | Plumb thickness of the gable top plate. |
| `under(y)` | Lowest over sides and slopes of `on.bottom(map(y)) - 1.5 / on.cos` | Underside of the gable top plates. |
| `topCut(y)` | `Top cut`, then the degrees of the slope that gives `under(y)` | Top-cut note of a stud, king, or cripple, at its middle. |
| `ridgeBottom` | `profile.top(width / 2 - 0.75) - ridge width` | Gable and gambrel. |
| `post` | `[width / 2 - 0.75, width / 2 + 0.75]` when `hasRidgeBoard(roof)` and `ridgeBottom - plateTop >= 3`, else null | Gable and gambrel. The ridge post span. |

`MIN_STUD` = 3 in. A gable stud, cripple, or ridge post shorter than 3 in is not built, and no
warning appears.

### 8.3 Gable top plate

The gable top plate (`plate.gable`, code `TP`) lies under each end rafter. Its top is against the
rafter's underside. All values are in one side's drawn section.

| Name | Formula | Content |
|---|---|---|
| `base` | `slope.bottom(seat)` | The rafter bearing height. |
| `cornerTop` | `raised && capPlate ? base - 1.5 : base` | Top of a raised roof's corner plate. |
| `support` | `raised ? cornerTop : plateTop` | What the plate's low end sits on. |
| `meet` | `seat + (support + plateThick - base) / rise` | y where the plate's underside meets `support`. |
| `tip` | `seat + max(0, support - base) / rise` | y where the end rafter's underside meets `support`. |
| `low` | Raised: `capPlate ? max(seat, bearingDepth) : seat`. Else `max(meet, bearingDepth)`. | Low end of the plate. |
| `levelCut` | Raised: `bottom(low) - plateThick < support`. Else `meet >= bearingDepth`. | True: a level cut at the low end. |
| `cornerLength` | `max(bearingDepth + 1.5, levelCut ? meet : low)` | Raised roof: corner plate length. |
| `clear` | Raised: `cornerLength`. Else `max(wallDepth, bearingDepth)`. | No layout stud or opening within this distance of each eave. |
| `high` | Gable: `post ? post[0] : width / 2`. Lean-to: `width - wallDepth`. | High end of the plate. |

| Case | Outline | Note |
|---|---|---|
| Level cut | `(raised ? low : tip, support)`, `(meet, support)`, `(high, under)`, `(high, bottom(high))`, `(low, bottom(low))` | `Level cut on the wall plate. Plumb cut 26.6° at the ridge post.` Panel: `on the bottom plate`. Lean-to: `at the high wall`. |
| Level cut, raised | as above | `Plumb cut against the knee wall's cap plate, level cut on the corner plate. Plumb cut ...` With no cap plate: `Level cut on the corner plate. ...` |
| Plumb cut | `(low, under(low))`, `(high, under(high))`, `(high, bottom(high))`, `(low, bottom(low))` | `Plumb cuts 45.0° at the eave wall's inside face and 45.0° at the ridge post.` Raised: `at the knee wall`. |

On a gambrel, each side has two gable top plates, mitered at the break as the rafters are. The
joint is `miterOf(slope, upper, depth, depth + 1.5)` (7.15).

| Piece | Outline | Note |
|---|---|---|
| Lower | As above, with the joint's `bottom` and `top` as the high end | `Level cut on the wall plate. Cut 16.2° from square at the break.` Panel: `on the bottom plate`. Plumb low end: `Plumb cut 59.0° at the eave wall's inside face. Cut 16.2° from square at the break.` |
| Upper | Joint `bottom`, `(high, under)`, `(high, bottom(high))`, joint `top` | `Cut 16.2° from square at the break. Plumb cut 26.6° at the ridge post.` |

Each piece's length runs along its underside, low end to high end. A plate exists only when
`low < high`. A gable end gets one plate for each drawn side and slope: two on a gable roof, four on
a gambrel, one on a lean-to.

Example, 8 × 10 ft, 2x6 at 6/12: `meet` = 3-1/2 + 1.677 / 0.5 = 6.85, so the plate has a level cut.
Its top edge runs from 3-1/2 to the ridge post face at 47-1/4: 43-3/4 / cos = 48.91. On the gambrel
in 7.15, the lower plates are 50.082 and the upper plates 21.643.

### 8.4 In place or as a panel

| | In place (default) | Panel (`roof.gablePanel`) |
|---|---|---|
| Stands on | The end wall's top plate | Its own bottom plate on the end wall's top plate |
| `plateTop` | `wallTop` | `wallTop + 1.5` |
| Bottom plate | None | `plate.bottom` (`BP`), from `wallTop` to `plateTop` |
| Bottom plate extent | — | Gable: `tip` to `width − tip`. Lean-to: `tip` to the high wall's inside face. Raised: 0 to `width`. |
| Bottom plate note | — | `Bottom plate of the gable panel. Nail it down to the end wall's top plate.` |

On a panel, every gable stud is 1-1/2 in shorter, and a stud under 3 in is not built. Example,
8 × 10 ft: the panel's bottom plate runs y = 6-1/2 to 89-1/2, and the two shortest studs are not
built.

### 8.5 Studs and ridge post

Layout studs follow the end wall's layout:

1. Take `near = i * oc - 0.75`, `far = near + 1.5`, for each i ≥ 1 with `i * oc < width`.
2. Skip the position if `near < clear` or `far > width - clear`.
3. Skip it if it overlaps the ridge post.
4. If it is inside a gable RO, put cripples there (8.6).
5. Skip it if it overlaps an opening's zone.
6. Skip it if `min(top(near), top(far)) - plateTop < 3`.
7. Else put a `stud.gable` (`S`) from `plateTop` up to the gable top plate. Its top follows the
   plate. Note: `topCut` at the stud's middle, for example `Top cut 26.6°.`

The ridge post (`post.ridge`, `P`) stands from `plateTop` to `ridgeBottom`, square cut. Inside an RO
it becomes a post from the header top to `ridgeBottom` and a cripple below the sill.

Example, 8 × 10 ft, 2x6 at 6/12: layout 16, 32, 64, and 80 (48 is the post). Studs 4.948, 4.948,
12.948, 12.948. Post 117.899 − 97-1/8 = 20.774. On the gambrel in 7.15, the studs at 16 and 80 are
21.460, `Top cut 59.0°.` The studs at 32 and 64 are 43.697, `Top cut 26.6°.` The post is 148.648 −
97-1/8 = 51.523.

On a raised roof, each eave corner also gets:

| Member | Role, code | Position | Note |
|---|---|---|---|
| Corner plate | `plate.gable`, `CP` | Level, top at `cornerTop`, from the outside face to `cornerLength` | With a cap plate: `Level, under the knee wall's cap plate, which laps over it.` Else: `Level, under the gable-end rafter's seat.` |
| Corner studs | `stud.gable`, `S` | At 0 and `bearingDepth`, from `plateTop` to `cornerTop − 1.5` | `Square cut. Under the corner plate.` |

Decision: on a roof raised by knee walls, the gable end runs through to the corners. A level corner
plate at each eave lines up with the knee wall's top plate. The knee wall's cap plate laps over it,
as at a wall corner, and the end rafter seats on the lap.

Example, 8 × 10 ft with 36 in knee walls: corner plates at z = 136-11/32 to 137-27/32, y = 0 to 5.
Corner studs 39-7/32, or 37-23/32 on a panel.

### 8.6 Gable openings

A gable opening is a row on an end wall with its sill at or above the end-wall top (`inGable`).
`frameWalls` skips it. `frameGableEnds` fits it with `fitGableOpening`, in config order.

| Rule | Wall (`fitOpening`) | Gable (`fitGableOpening`) |
|---|---|---|
| Ends | `zone` in `[start, end]` | `zone` in `[clear, width − clear]`. Else left out: `The framing runs past the gable. ...` |
| Overlap | Corners and earlier zones | Earlier gable zones. Left out: `The framing overlaps another opening.` |
| Ridge post | — | Left out when the post overlaps the zone but is not inside the RO: `The kings or jacks land on the ridge post. Move the opening.` |
| Thick header | Warning, built | Warning, built |
| Header top limit | Top-plate underside | The lower of `top(zone[0] + 1.5)` and `top(zone[1] - 1.5)`: the gable top plate over the header's outer ends. Else left out: `The header does not fit. RO top ... is above the gable top plate at ....` |
| Gap under 3 in above the header | Tight header, RO grows | No cripple. The RO stays. No warning. |
| Rough sill | When `sill > 0` | When `sill > plateTop + 0.01` |
| Rough sill too low | Below the bottom-plate top: left out | Below `plateTop`: left out, `The rough sill is below the top of the end-wall plate.` |
| Flat header on a bearing wall | Warning on front and back | No check |
| Overhead headroom | Warning | No check |

On a gambrel, `top` follows both slopes. Its lowest point over a header is still at an outer end.

| Member | Rule |
|---|---|
| Kings | From `plateTop` up to the gable top plate. Note `Top cut ...`. |
| Jacks | From `plateTop` to `roTop`, square cut. |
| Header, header plates, rough sill | `openingBoards` with the end wall's frame. |
| Cripples above the header | At layout positions inside the RO, 3 in or more, top cut. |
| Cripples below the sill | 3 in or more, from `plateTop` to `sillBottom`, square cut. |
| Left-out outline | The RO on the end wall's outside face, assembly `gable.left` or `gable.right`. |

Example, 10 ft wide, 2x4 rafters at 6/12, 12 × 12 vent with a flat header at 50%, sill 102: RO 54
to 66, jacks 16-7/8, header 15, rough sill at 100-1/2. The ridge post and layout 64 take 3-3/8
cripples below the sill. The post continues from the header top at 115-1/2 to the ridge board.

### 8.7 Change it safely

- Gable members from `make` are profiled in the gable plane. Their profile across is 1-1/2 in, and
  their depth is the wall depth (1.1).
- The gable studs and gable openings use the end wall's u. Keep `toY` and `wallFrames` in step.
- A gable opening uses `openingZone`, `resolveHeader`, `warnThickHeader`, `openingBoards`, and
  `leftOut` from `walls.ts`.
- The gable top plate cases depend on `raised`, `capPlate`, `gablePanel`, and the roof style. Test
  each one.
- `under` and `topCut` take the lowest of all slopes. A gable member that follows the roof must use
  `top(u)`, not one slope's line.
- `tests/roof.test.ts` pins the plates, studs, post, and panels. `tests/openings.test.ts` pins the
  gable openings. `tests/attic.test.ts` pins the raised corners.

## 9. Attic

`frameAttic(config, profile, rafters, ridgeBottom, wallDepth, wallTop, kneeBase, gussets)` frames
rafter ties, collar ties, the loft, and knee walls. It runs on gable and gambrel roofs. `gussets` is
the `Gussets` of a gambrel (7.15), else null. `plate` is the rafter bearing height, and `ridgeTop`
is `profile.top(width / 2 - 0.75)`.

| Field | Values | Default |
|---|---|---|
| `roof.rafterTies.enabled`, `size`, `every`, `height` | boolean, 2x, 1–4, 0–120 | true, `2x4`, 1, 0 |
| `roof.collarTies.enabled`, `size`, `every`, `height` | boolean, 2x, 1–4, `auto` or 12–240 | true, `2x4`, 1, `auto` |
| `roof.loft.enabled`, `joist`, `oc`, `deck` | boolean, 2x, spacing, sheet key | false, `2x6`, 16, `tg-23/32` |
| `roof.loft.support` | `plates`, `hung` | `plates` |
| `roof.loft.open.end`, `length` | `none`, `left`, `right`; 12–480 | `none`, 48 |
| `roof.loft.hatches[]` | `x`, `y`, `width`, `depth` | none |
| `roof.kneeWalls.enabled`, `height`, `stud` | boolean, 12–72, `2x4` or `2x6` | false, 36, `2x4` |

Tie heights are above the plate. Hatch `x` is from the left gable end, and `y` from the front wall,
both to the hatch edge, from the outside faces.

`commons` is `rafters` less the first and last. Decision: the gable-end rafter pairs stand on the
gable framing and get no ties.

### 9.1 Level pieces

Ties and loft joists run front to back between the slopes. `Level` builds them:

| Function | Formula |
|---|---|
| `span(bottom, inset = 0)` | `[s, width - s]` with `s = max(inset, profile.reachTop(bottom))`: where the roof top line reaches the piece's bottom, or `inset`. |
| `piece(base, x, bottom, extent, note)` | A box from `extent[0]` to `extent[1]`, from `bottom` up the lumber width. `clipBelow` trims it below each slope's top line on both sides. Plane (x, 0, 0), h = +y. |

Each tie and loft joist sits at x = rafter start + 1-1/2, beside the rafter's +x face. It laps the
rafter side, so it can reach out to the roof's top line.

`piece` gives `note` the cut angles of a trimmed end, or null when no roof line cuts a top corner.
It lists the degrees of each slope in `profile.along(from, profile.reachTop(bottom + depth))`: the
slopes over the trimmed end.

| Trimmed end | Note |
|---|---|
| Under one slope | `Ends cut 26.6° to the roof line.` |
| Across a gambrel's break | `Ends cut 59.0° and 26.6° to the roof line.` |
| None | `Square ends.` |

A rafter tie or collar tie overlaps the gussets when its z range overlaps `gussets.bottom` to
`gussets.top`. It then sits on the gusset face, at x = rafter start + 1-1/2 + `gussets.thick`. Its
note adds ` Over the gussets.`

### 9.2 Rafter ties

Built when `rafterTies.enabled` and the loft is off. Decision: loft joists take the place of rafter
ties.

1. Set the tie bottom to `plate + rafterTies.height`.
2. Compute `lowerThird = (ridgeTop - plate) / 3`. When `height > lowerThird`, warn: `Rafter ties 12"
   above the plate are above the lower third of the roof (9-5/16").` The ties are built.
3. Compute the extent with `span(bottom)`. With less than 1-1/2 in, build no ties.
4. Put a `tie.rafter` (`RF-RTnn`) on each common with index `% every === 0`.

Example, 8 × 10 ft, 2x6 at 6/12: ties at x = 24-3/4, 48-3/4, 72-3/4, 96-3/4, each 96 long, square
ends. At 12 in up, each is 65.60 long, ends cut to the roof line, with the warning.

### 9.3 Collar ties

1. Set `auto = min(gussets ? gussets.inside - depth : plate + (ridgeTop - plate) * 2 / 3,
   ridgeBottom - depth)`, under the ridge board. On a gable, it is the bottom of the upper third. On
   a gambrel, the tie top is at the miter's inside corner.
2. Set the bottom to `auto`, or to `plate + collarTies.height`.
3. If `bottom + depth > ridgeBottom`, leave the ties out: `Collar ties 20" above the plate hit the
   ridge board. Lower them.` The outline is level at the tie bottom, from the first common to the
   last common + 3 in, across `span(bottom)`. Assembly `roof`.
4. Else, with an extent of 1-1/2 in or more, put a `tie.collar` (`RF-CTnn`) on each common with
   index `% every === 0`.

Collar ties exist with or without a loft. Example, 8 × 10 ft, 2x6 at 6/12. The upper third starts
at 115.808, and the ridge bottom less 3-1/2 is 114.399. The ties sit at 114.399, and each is 44-1/2
long. On the gambrel in 7.15, the ties sit at 136.570, with their tops at the inside corner,
140.070. They overlap the gussets, so they are at x = 25-7/32, 49-7/32, 73-7/32, and 97-7/32. Each
is 57.244 long, with the note `Ends cut 59.0° to the roof line. Over the gussets.`

### 9.4 Loft floor

`frameLoft` builds the loft floor when `loft.enabled`.

| Support | Joist bottom | Joist extent inset | Along the eaves | Moves clear of rafters (`lapping`) |
|---|---|---|---|---|
| `plates`, no knee walls | `wallTop` | 0, trimmed to the roof line | Nothing | Yes |
| `plates`, knee walls | `wallTop` | 1-1/2, inside the rims | `rim.loft` on the wall top, at the outside face | No |
| `hung` | `wallTop − joist width` | wall depth + 1-1/2, inside the ledgers | `ledger.loft` on the eave walls' inside faces | No |

Decision: joists on the plates with no knee walls lap the rafters, as rafter ties do. They sit at
the rafters' bearing level, so a joist on a rafter's position collides with it. `clear(from, plies,
direction)` moves such a joist, or a pair, to the rafter's far side (+x) or near side (−x). Hung
joists and raised roofs do not move.

Joist notes: `hung` gives `Square ends. Joist hangers at both ends.` The other modes use the trim
note (9.1).

Floor ends:

| End | Members |
|---|---|
| Closed | One `joist.loft` inside the gable studs: x = wall depth on the left, `length − wall depth − 1.5` on the right. |
| Open (`open.end`) | A doubled `edge.loft` (`E`) at `clear(open.length, 2, +1)` on the left, or `clear(length - open.length - 3, 2, -1)` on the right. No joists across the open part. |

`floor` is the loft floor's x extent, and `inner` is the x range between the end members. When
`inner` is less than 1-1/2 in wide, `frameLoft` warns `The open end leaves no loft floor.` It then
builds no loft members and no deck. The rafter ties stay off, because the loft is on.

Layout joists:

1. Take `from = clear(i * loft.oc - 0.75, 1, +1)` for each i ≥ 1 with `i * oc < length`.
2. Skip it outside `inner`, or where it overlaps an end joist, edge joist, or trimmer.
3. Between a hatch's trimmers, put two `tail.loft` (`TJ`): from the extent start to the front
   header, and from the back header to the extent end.
4. Else put a `joist.loft` (`J`).

Example, 8 × 10 ft, 2x6 joists at 16 in on the plates: joists at 3-1/2, 15-1/4, 31-1/4, 48-3/4,
63-1/4, 79-1/4, 96-3/4, 111-1/4, 115. The joists at 47-1/4 and 95-1/4 land on rafters and move to
48-3/4 and 96-3/4. Each is 96 long, ends cut to the roof line.

### 9.5 Hatches

Each hatch gets doubled trimmers outside its x edges and doubled headers across its y ends, in
hangers.

1. Set `left = clear(x - 3, 2, -1)` and `right = clear(x + width, 2, +1)`: the trimmer pairs.
2. Set `front = y - 3` and `back = y + depth + 3`: the outer faces of the header pairs.
3. Set `tail = min(front - extent[0], extent[1] - back)`: the shortest tail joist.
4. Run the checks in the table. A failed check leaves the hatch out, outlined at the joist tops.
5. Put `trimmer.loft` (`T`) at `left`, `left + 1.5`, `right`, `right + 1.5`, the full joist extent.
6. Put `header.loft` (`H`) at y = `front`, `front + 1.5`, `y + depth`, `y + depth + 1.5`, from
   `left + 3` to `right`. Note: `Joist hangers at both ends.`

| Check | Result |
|---|---|
| `left < inner[0]` or `right + 3 > inner[1]` | Left out: `The hatch and its trimmers do not fit between the ends of the loft floor.` |
| `tail < 0.01` | Left out: `The hatch headers reach past the ends of the loft joists.` |
| Trimmers overlap an earlier hatch's | Left out: `The hatch overlaps another hatch.` |
| `lapping`, and a header is above the rafter underside, `profile.bottom` | Left out: `The hatch headers would hit the rafters. Move the hatch away from the eaves.` |
| `tail < MIN_TAIL` (3) | Warning, built: `The shortest tail joist is 2" long.` |
| Header length `right − left − 3 > LONG_HEADER` (48) | Warning, built: `The 60" hatch headers are longer than 4 ft. Check their size.` |

Tail joist note: `Joist hanger at the hatch header.`, then `Eave end cut 26.6° to the roof line.`
when trimmed, then `Joist hanger at the ledger.` when hung.

Example, `hung`, 24 × 30 hatch at x 60, y 30: trimmers at 57, 58-1/2, 84, 85-1/2, each 86. Headers
24 long at y = 27, 28-1/2, 60, 61-1/2. Tail joists at 63-1/4 and 79-1/4: 22 and 28 long.

### 9.6 Ledgers and rims

`splitPlate` splits each run on the centers of the loft members that run front to back.

| Member | Role, code | y | z | Extent | When |
|---|---|---|---|---|---|
| Ledger | `ledger.loft`, `L` | wall depth, and `width − wall depth` (inward) | `wallTop − joist width` | `floor`, under the loft floor only | `hung` |
| Rim | `rim.loft`, `R` | 0, and `width` (inward) | `wallTop` | wall depth to `length − wall depth` | Knee walls, `plates` |
| Open-end rim plies | `rim.loft`, `R` | i × 1-1/2 inside each rim, i = 1 to `plies − 1` | `wallTop` | Over each open part | Knee walls, `plates`, open end |

`plies = floor(knee stud width / 1.5)`: 2 for a 2x4 knee wall, 3 for 2x6. Note: `Under the knee wall
across the open end. Face-nail to the rim.`

Decision: across an open end, no joists carry the knee wall's inside edge. More rim plies fill the
knee wall's depth to within 1-1/2 in.

Example, `hung`, 8 × 10 ft: ledgers 113 long at y = 3-1/2 and 92-1/2, z = 91-5/8. Joists 86.

### 9.7 Loft deck

`Deck` is `{ bottom, min, max, holes }` in plan. `frameSheathing` lays the deck sheets from it.

| Quantity | Value |
|---|---|
| `bottom` | Joist top: joist bottom + joist width. |
| x extent | Knee walls on `plates`: wall depth to `length − wall depth`. Else `floor`. |
| `reach` (y from each wall) | `hung`: wall depth. Knee walls on `plates`: 0. `plates` with no knee walls: `profile.reachBottom(deck top)`, where the rafter underside meets the deck top. |
| `holes` | Each hatch, inside its trimmers and headers. Knee walls on `plates` with an open end: the open part, less a strip of knee-wall depth at each eave. |
| None | When `reach >= width / 2 - 0.01`. |

### 9.8 Knee walls

`frameKneeWalls(config, base)` builds a knee wall at each eave when the roof is raised: on a gable
roof only. `base` is `kneeBase` (7.13).

1. Set `studLength = kneeWalls.height - 1.5 * (capPlate ? 3 : 2)`. The height runs from the base to
   the top of the plates, where the rafters bear.
2. Run the wall between the gable-end walls: x = wall depth to `length − wall depth`.
3. Put the outside face flush with the wall below: y = 0 to stud width (`KF`), and `width` inward
   (`KB`).
4. Put end studs at each end. Put layout studs at `i * walls.oc - 0.75` from each wall's left
   corner, viewed from outside, clear of the end studs. The back wall's x is `length - u - 1.5`.
5. Lay the bottom plate at `base` and the top plate at `base + 1.5 + studLength`, split on the stud
   centers.
6. With `capPlate`, lay the cap from x = 0 to `length` at `base + 3 + studLength`, splices 24 in or
   more from the top-plate splices. It laps over the gable-end corner plates (8.5).

| Member | Role, code | Size |
|---|---|---|
| Stud | `stud`, `S` | `kneeWalls.stud` |
| Bottom plate | `plate.bottom`, `BP` | `kneeWalls.stud` |
| Top plate | `plate.top`, `TP` | `kneeWalls.stud` |
| Cap plate | `plate.cap`, `CP` | `kneeWalls.stud` |

| Support | Knee wall stands on |
|---|---|
| `plates` | The deck, over the rim: `wallTop + joist width + deck thick`. |
| `hung` | The eave wall's top: `wallTop`. |

Example, 8 × 10 ft, 36 in knee walls on a 2x6 loft on the plates: plates at 103-11/32, 136-11/32,
and 137-27/32. Studs 31-1/2 at x = 3-1/2, 15-1/4, ... 115. The bottom plate is 113, the cap 120.

### 9.9 Change it safely

- `commons` assumes the gable-end rafters are first and last in `rafters`.
- A new member that laps the rafter sides near a gambrel's break must sit on the gusset face, as
  the ties do (9.1).
- `clear` moves a member only when `lapping` is true. On the plates with no knee walls, send each
  new front-to-back loft member through `clear`. Else it can collide with a rafter.
- Ledgers and rims splice on members with `axes.length[1] === 1`. A new front-to-back loft member
  must use +y as its length axis to count.
- A new loft part that collides goes through `leaveOut` with assembly `loft`. The loft plan draws
  it.
- `tests/attic.test.ts` pins the ties, collar ties, loft modes, open ends, hatches, rims, ledgers,
  knee walls, and the raised gable corners.

## 10. Warnings and left-out parts

Decision: the app does not limit the user. It builds what the user enters wherever the parts can
exist, and it warns about problems. It leaves out only framing that collides with other framing,
and it draws that part in red in 3D and on the drawings.

- A generator warns and goes on. It does not throw on a valid config.
- A left-out part's `Warning` carries `missing: { assembly, outline }`. Its message ends with
  `LEFT_OUT`: `It is left out: red in 3D and on the drawings.`
- `App.tsx` passes the outlines of visible layers to the 3D view, which draws each as a red loop.
- `missingIn` in `src/drawings/sheets.ts` projects the outlines onto each sheet that draws the
  assembly.

| `missing.assembly` | Sheet that draws the outline |
|---|---|
| `wall.*` | That wall's elevation |
| `gable.*` | That gable end's elevation |
| `loft` | Loft framing plan |
| `roof` | Building section |

### 10.1 Every warning in these files

| Source | Message (start) | Trigger | Outcome | Function |
|---|---|---|---|---|
| `Walls` | `The 2x4 mud sill is narrower than the 2x6 walls.` | Slab, mud sill narrower than the stud | Built | `frameWalls` |
| Opening label | `The framing runs past the wall end. ...` | Zone past `start` or `end` | Left out, `wall.*` | `fitOpening` |
| Opening label | `The framing overlaps a corner or another opening.` | Zone overlaps a corner or an earlier zone | Left out, `wall.*` | `fitOpening` |
| Opening label | `N plies of S are thicker than the wall. They stand X proud of its inside face.` | Plies thicker than the wall depth | Built | `warnThickHeader` |
| Opening label | `The header does not fit. ... above the top plate at ...` | Header stack above the top plate | Left out, `wall.*` | `fitOpening` |
| Opening label | `The header goes tight to the top plate, ...` | Gap 0 to 3 in above the header | Adjusted: RO grows | `fitOpening` |
| Opening label | `The rough sill is below the top of the bottom plate.` | Rough sill under `base` | Left out, `wall.*` | `fitOpening` |
| Opening label | `A flat header is on a bearing wall.` | Flat header on front or back | Built | `fitOpening` |
| Opening label | `The headroom above the RO is X. The door needs Y.` | Overhead door, headroom short | Built | `fitOpening` |
| `Roof` | `A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 ...` | Seat limit under 1-1/2 in | Adjusted: seat 1-1/2 | `seatLength` |
| `Roof` | `The break X in from the wall is within 1 ft of the ridge line. It is at Y.` | Gambrel, `wanted > width / 2 - 12` | Adjusted: break at `width / 2 - 12` | `frameRoof` |
| `Roof` | `A square tail cut needs X of eave overhang. ...` | `eave < depth * sin` | Adjusted: plumb tails | `frameRoof` |
| `Roof` | `The ridge board (S) is shallower than the rafter plumb cut (X).` | Ridge width < `depth / peak.cos` | Built | `frameRoof` |
| Opening label | `The framing runs past the gable. ...` | Zone within `clear` of an eave | Left out, `gable.*` | `fitGableOpening` |
| Opening label | `The framing overlaps another opening.` | Zone overlaps an earlier gable zone | Left out, `gable.*` | `fitGableOpening` |
| Opening label | `The kings or jacks land on the ridge post. Move the opening.` | Post in the zone, not inside the RO | Left out, `gable.*` | `fitGableOpening` |
| Opening label | `N plies of S are thicker than the wall. ...` | As in walls | Built | `warnThickHeader` |
| Opening label | `The header does not fit. ... above the gable top plate at ...` | Header stack above the gable top plate | Left out, `gable.*` | `fitGableOpening` |
| Opening label | `The rough sill is below the top of the end-wall plate.` | Rough sill under `plateTop` | Left out, `gable.*` | `fitGableOpening` |
| `Roof` | `Rafter ties X above the plate are above the lower third of the roof (Y).` | `height > lowerThird` | Built | `frameAttic` |
| `Roof` | `Collar ties X above the plate hit the ridge board. Lower them.` (`the peak gussets` without a ridge board) | Tie top above `ridgeBottom` | Left out, `roof` | `frameAttic` |
| `Loft` | `The open end leaves no loft floor.` | `inner` under 1-1/2 in | No loft members, no deck, no outline | `frameLoft` |
| `Hatch N` | `The hatch and its trimmers do not fit between the ends of the loft floor.` | Trimmers outside `inner` | Left out, `loft` | `frameLoft` |
| `Hatch N` | `The hatch headers reach past the ends of the loft joists.` | `tail < 0.01` | Left out, `loft` | `frameLoft` |
| `Hatch N` | `The hatch overlaps another hatch.` | Trimmer overlap | Left out, `loft` | `frameLoft` |
| `Hatch N` | `The hatch headers would hit the rafters. ...` | `lapping`, header above the rafter underside | Left out, `loft` | `frameLoft` |
| `Hatch N` | `The shortest tail joist is X long.` | `tail < 3` | Built | `frameLoft` |
| `Hatch N` | `The X hatch headers are longer than 4 ft. Check their size.` | Header length > 48 | Built | `frameLoft` |

The opening label comes from `openingLabel`, for example `window (front 60" from left)`. The
thick-header warning comes after the left-out checks, so a left-out opening never carries it.

### 10.2 Silent rules

These rules skip a part, or keep a long piece, with no warning:

| Rule | Function |
|---|---|
| A rake under 1-1/2 in counts as 0: no rake ladder. | `frameRoof` |
| A rake under 3 in, or `onEndRafter`, has no rail. | `frameRoof` |
| A lookout shorter than 1-1/2 in is not built. | `frameRoof` |
| A gable stud, gable cripple, or ridge post shorter than 3 in is not built. | `frameGableEnds` |
| No ridge post when the ridge bottom is less than 3 in above `plateTop`, or with no ridge board. The top plates then meet at the peak: `Plumb cut 26.6° at the peak.` | `frameGableEnds` |
| Ties with an extent under 1-1/2 in are not built. | `frameAttic` |
| A run with no legal splice stays one piece, longer than stock. | `splitPlate` |
| No deck when `reach` is `width / 2` or more: the rafter undersides leave no deck area. | `frameLoft` |

## 11. Tests

| Test | What it pins |
|---|---|
| `tests/floor.test.ts` | Joist layout, rims, blocking, skid lines, skid end cuts and notes, square splices, girder plies, piers, posts, slab, anchor bolts clear of doorways. |
| `tests/walls.test.ts` | Through and butted walls, corner types, layout from the building corner, plates and caps, splices, mud sills, custom heights, lean-to walls and caps. |
| `tests/openings.test.ts` | Kings, jacks, header styles and ply positions, header plates, tight header, cripples, rough sills, doorway notes, placement, left-out outlines, overhead headroom, gable openings. |
| `tests/roof.test.ts` | Rafter layout and cut length, birdsmouth, seat limit, ridge, rake ladders and options, purlins, fascia, gable panels, gable studs and post, lean-to roof, right-handed axes. `gambrel roof`: rafters, miter and notes, ridge, gussets, planes, gable top plates and studs, rake ladders, collar ties, spans, `gambrelBreak`, the break limit, no knee walls. |
| `tests/attic.test.ts` | Rafter and collar ties, loft modes, open ends, hatches, ledgers and rims, knee walls, raised gable corners, layers. |
| `tests/every-design.test.ts` | On each design in `tests/designs.ts`: unique ids, positive lengths, and profiles within their lumber width. Also one cut line for each member, unique marks, finite numbers in every output, and no empty drawing. |

`tests/designs.ts` includes `tests/fixtures/12x16-gambrel-barn.json`. It is a gambrel with an auto
break and no ridge board, a loft with a hatch, a loft door in a gable end, a roof extension, and a
gable-end lean-to.
Its one warning is on purpose: the extension rafters pass over the main wall's plate.

`tests/golden.test.ts` compares the cut list, warnings, and costs of each design with
`tests/golden/*.txt`. When a framing change alters a golden file on purpose, read the diff. Then run
`npx vitest run -u`.
