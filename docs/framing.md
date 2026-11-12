# Framing

How `buildModel` frames the main shed: foundation, floor, walls, wall openings, roof, gable ends,
and attic. For the conventions and the recipes, see [DEVELOPER.md](DEVELOPER.md). Lean-tos, ramps,
sheathing, and finishes are in [additions-and-finishes.md](additions-and-finishes.md).

| Part | Functions | File | Section |
|---|---|---|---|
| Members and ids | `Member`, `ROLES`, `ASSEMBLIES` | `src/core/member.ts` | 1 |
| Shared geometry | `planeMember`, `profileOf`, `idMaker` | `src/core/gen/section.ts` | 2 |
| Build order | `buildModel` | `src/core/model.ts` | 3 |
| Foundation and floor | `frameFloor`, `gradeOf`, `supportLines` | `src/core/gen/floor.ts`, `supports.ts` | 4 |
| Walls | `frameWalls`, `splitPlate` | `src/core/gen/walls.ts` | 5 |
| Wall openings | `fitOpening`, `openingBoards` | `src/core/gen/walls.ts` | 6 |
| Roofs | `frameRoof`, `gambrelBreak` | `src/core/gen/roof.ts` | 7 |
| Gable ends | `frameGableEnds`, `fitGableOpening` | `src/core/gen/roof.ts` | 8 |
| Ties, loft, knee walls | `frameAttic`, `frameLoft`, `frameKneeWalls` | `src/core/gen/attic.ts` | 9 |

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
| Roof profile | One roof side in the drawn section: its slopes from the eave up. The `Profile` type (2.4). |
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

### 1.1 Members

`Member` (`src/core/member.ts`) is one piece of lumber in model coordinates. Its doc comment gives
the fields. A member has one of two shapes:

| Shape | Axes |
|---|---|
| Box (no `profile`) | `axes.thick` points to the side where the board lies. The axes can be left-handed: the front floor rim has `length` +x, `width` +z, and `thick` +y. |
| Profiled | Right-handed: `thick = length × width`. `planeMember` sets them (2.3). |

The plane of a profile sets which lumber dimension each profile coordinate holds. A profile is never
wider across than its lumber width.

| Members | Profile across extent | `profile.depth` |
|---|---|---|
| Rafters, upper rafters, fly rafters, ladder rails, ties, loft joists | Lumber width | Lumber thickness |
| Skids | Lumber width (the skid stands on edge) | Lumber thickness |
| Gable-end members (section 8) | 1-1/2 in, the lumber thickness | Wall depth, the lumber width |

| PT members | Rule |
|---|---|
| `skid`, `girder`, `post`, `plate.sill` | Always PT. |
| `joist.end`, `joist.floor`, `rim.floor`, `blocking` | `floor.treated`. |
| All other members | Not PT. |

### 1.2 Ids and roles

- `idMaker(prefix)` (`section.ts`) counts each code and returns ids such as `RF-R01`. `frameWall`
  has its own `nextId` with the same scheme.
- Ids are unique in a model. Each id uses its assembly's prefix from `ASSEMBLIES`.
- An id is a position in its counter. It changes when a member before it in the same counter
  appears or goes.
- Counters that share a prefix must use different codes. Three counters use `RF`: the members of
  `frameRoof`, the gussets of `frameRoof`, and the ties of `frameAttic`.
- The cut list does not show ids. It groups members into lines and gives each line a mark
  ([outputs.md](outputs.md) "1.2 Steps"). With `front: 'gable'`, `wall.left` keeps ids `LW-...`,
  but its marks are `FW-...` ([design-model.md](design-model.md) "3.3 Cut-list order and marks").
- `ROLES` and `ASSEMBLIES` define each role, assembly, id prefix, and 3D layer. To add a role,
  follow "Add a member role" in DEVELOPER.md.

## 2. Coordinates and planes

### 2.1 Model axes

| Axis | Direction | Range of the footprint |
|---|---|---|
| x | Along the length, left to right | 0 to `length` |
| y | Front to back | 0 to `width` |
| z | Up from the floor surface: the subfloor top, or the slab top | Floor surface at 0 |

The axes are right-handed. The footprint is the outside faces of the framing. The model's front
and back are always the eave walls, and left and right are the gable ends. The framing uses model
sides for both values of `front` ([design-model.md](design-model.md) "3. Sides and naming").

### 2.2 Wall frames

`wallFrames(width, length)` gives each wall a `Frame`. The origin is the building corner at the
wall's left end, viewed from outside. `u` runs along the wall to the right, `v` runs inward, and z
is up.

### 2.3 `planeMember`

`planeMember(base, plane, outline, dir, depth)` makes a profiled member from its outline in a
vertical `Plane`. Every angled member comes from it:

- `length` is the outline's extent along `dir`. So the cut length runs long point to long point,
  the rule in [outputs.md](outputs.md) "1.4 Cut length".
- The axes are right-handed. The member extrudes `depth` along `h × up`.
- It sets `treated: false`. A caller that needs PT sets it after the call, as `frameFloor` does for
  skids.

### 2.4 Roof section and profile

The roof math works in a section across the building. The section is drawn for one side: its eave
wall's outside face is at y = 0, and the roof rises toward +y. `Side.map` moves the section onto a
real side: `y` for the front, `width − y` for the back. A side's `map` is its own inverse.

A `Slope` is one straight rafter line in the section. Its bottom edge passes through (seat, plate):
the inner end of the birdsmouth seat, on the plate top. Its top edge is the plumb depth,
`depth / cos`, above the bottom edge.

`profileOf(slopes)` builds a `Profile`: one side's slopes, eave slope first. A gable or a lean-to
has one slope, and a gambrel has two. The profile is convex, so each of its lines is the lowest of
the slopes' lines. The schema keeps it convex: a gambrel's lower slope must be the steeper one
([design-model.md](design-model.md) "1.5 Cross-field rules").

## 3. Build order

`buildModel(config)` (`src/core/model.ts`) runs the generators in this order:

| Step | Call | Reads |
|---|---|---|
| 1 | `frameFloor` | config |
| 2 | `frameWalls` | config |
| 3 | `frameRoof`, which calls `frameAttic` and `frameGableEnds` | config |
| 4 | `frameAdditions` | config, the roof's `soffit` and `eave`, the floor, wall, and roof members |
| 5 | `frameRamps` | config, the floor, wall, and roof members, for grade |
| 6 | `frameSheathing` | all members, all ROs, all roof planes, the loft deck |

Steps 1 to 3 read only the config. They share geometry through pure functions of `walls.ts`, such
as `wallTops` and `splitPlate`, not through each other's outputs.

The heights chain through z = 0:

1. `frameFloor` puts all its parts below z = 0.
2. `frameWalls` stands every wall on z = 0. `wallTops` gives each wall's top.
3. `frameRoof` seats the rafters on `wallTops`, or on the knee walls (7.2).

## 4. Foundation and floor

`frameFloor` builds the foundation and the floor framing, all below z = 0. It gives no warnings. On
a slab it builds only concrete, and the walls stand on PT plates (5.6). Its `unbuilt` sides keep the
skids or girders from running out under a continued deck that `frameAdditions` left out.

### 4.1 Floor framing

Floor joists run front to back between two full-length rims. Floor joists and rafters share one
layout rule: one flush with each end, the rest centered on o.c. multiples from x = 0. A layout
position that overlaps an end member gets no member. So at the same o.c., floor joists and rafters
land on the same x.

### 4.2 Skids

Skids stand on edge under the joists and rims. The outer skids are flush with the floor edges, and
the rest are evenly spaced (`supportLines`). Under a gable-end deck that continues the shed's lines,
each run goes on out to the deck's beam ([additions-and-finishes.md](additions-and-finishes.md)
"On the shed's foundation").

Decision: `skidOutline` cuts each outer end of a run 45° across the bottom third, as on a sled
runner. The shed then rides up over the ground when you drag it, and does not dig in. A splice in a
long run stays square.

### 4.3 Piers

- Girder plies stand on edge under the joists. All plies of a girder line splice over the same
  piers.
- Each girder run has one pier flush with each end. The other piers are evenly spaced, at most
  `pier.maxSpacing` apart.
- A post, when chosen, stands centered on each pier, under the girder.

Decision: the widest of girder, post, and pier sets the spacing of the lines, so no part passes the
floor edge.

### 4.4 Grade

`gradeOf(config, framing)` returns the z of the ground. `frameAdditions` and `frameRamps` call it
with the shed members.

| Foundation | Grade |
|---|---|
| `slab` | 0, the slab top. |
| `skid` | The lowest corner of the `foundation` members: the skid bottoms. |
| `pier` | The lowest corner of the `foundation` members, less `aboveGrade`. |

### 4.5 Change it safely

- Keep every floor part below z = 0. The walls, the roof, and `gradeOf` assume the floor surface at
  z = 0.
- A new `foundation` member lower than the skids or posts moves grade for lean-to decks and ramps.
- Rims, skids, and girders splice through `splitPlate`. Give it the centers of the members that
  bear on the run.
- `supportLines` divides by `count − 1`. The schema keeps `skid.count` and `pier.girderCount` at 2
  or more.

## 5. Walls

### 5.1 Through walls and butted walls

A through wall runs from u = 0 to the span. A butted wall stops one wall depth short of each end.
Plates, layout studs, and openings stay between a wall's ends.

| Roof | `walls.through` | Through walls | Butted walls |
|---|---|---|---|
| gable, gambrel | `ends` | left, right | front, back |
| gable, gambrel | `eaves` | front, back | left, right |
| lean-to | any | front, back | left, right |

| Decision | Reason |
|---|---|
| A gable or gambrel roof's end walls run through by default. | Each gable end is one full-width frame. |
| A lean-to's eave walls always run through. | The lean-to's end walls stop below the high wall. |

### 5.2 Heights

The plate stack is 1-1/2 in for each ply: the bottom plate, the top plate, the cap plate with
`walls.capPlate`, and a mud sill (5.6). The wall top is the stud length plus the plate stack.
`wallTops` gives it: the rafter bearing height.

| Decision | Reason |
|---|---|
| A precut stud keeps its length. A mud sill makes the wall 1-1/2 in taller. | The stud stays a stock precut. |
| A custom height keeps the wall top. The stud is shorter by the plate stack. | The user sets the wall top. |
| The lean-to high wall rises by `pitch / 12 * (width - wall depth)`. | Full-width seats: the rafter underside meets the low wall's inside top corner and the high wall's outside top corner. These corners are `width − wall depth` apart. |

### 5.3 Corners

A butted wall has one end stud at each end, at u = wall depth. A through wall carries the corner:

| `walls.corner` | Through wall, at each end |
|---|---|
| `four-stud` | End, middle, and backing studs, face-nailed into a solid post. |
| `three-stud` | End stud, and a backing stud with its face in line with the butted wall's inside face. |
| `california` | End stud, and a flat backing stud on the inside edge. |
| `two-stud` | End stud only. |

### 5.4 Layout studs

Decision: the layout starts at the building corner, u = 0, also on a butted wall. Reason: sheet
edges land on stud centers.

A layout position that overlaps a corner, king, or jack gets no stud. Inside an opening's zone it
takes cripples (6.4).

The back wall's u runs from x = `length`, but rafters lay out from x = 0. So back-wall studs line up
with rafters only when `length` is a multiple of the o.c.

### 5.5 Plates and splices

Each plate lies flat across the wall depth, from the outside face.

Decision: at a level corner, the butted wall's cap laps over the through wall's top plate, and the
through wall's cap stops short. At a step in height, neither cap laps.

`splitPlate` splits each run into stock-length pieces:

- Each splice lands on the center of a member that bears on the run: a stud on a wall plate.
- No piece at a run end is shorter than 24 in.
- A cap splice stays 24 in or more from each top-plate splice.
- No piece is longer than the longest stock length within `catalog.maxLength`
  ([design-model.md](design-model.md) "5.2 `maxLength` and `maxOnePiece`").
- The farthest legal splice wins, so each piece is as long as it can be.

### 5.6 Mud sills

On a slab, the lowest plate is PT:

| `walls.mudSill` | Members at the wall bottom |
|---|---|
| `none` | The bottom plate itself is PT, with role `plate.sill`. |
| `match` or a 2x size | A PT `plate.sill` under the bottom plate. |

The mud sill is flush with the outside face. A sill wider than the stud runs past the inside face. A
narrower sill is built, with a warning.

### 5.7 Anchor bolts and doorways

Decision: the bottom plate runs through doorways, so the wall goes up in one piece. You cut out the
doorway part after you anchor the wall. A doorway is a fitted opening with `sill` 0. Each
bottom-plate piece over a doorway, and its mud sill, has a note that gives the cut-out from the
piece's left end.

On a slab, anchor bolts go on the sill centerline, in each part of each bottom-plate piece clear of
doorways. Each part takes one bolt `anchorEndDistance` in from each end, and the rest evenly spaced
at most `anchorSpacing` apart. A part no longer than two end distances takes one bolt at its middle.

### 5.8 Change it safely

- `studLengths` and `wallTops` are the only source of wall heights. `frameRoof`, the gable ends, and
  the loft read them.
- A member that blocks openings and layout studs goes into `occupied`: corners, kings, and jacks. A
  member that a plate splice may land on goes into `centers`: corners, kings, and studs. The flat
  California stud is not in `centers`.
- At fit time, `occupied` holds only the corners. Kings and jacks go in after the fit (6.1).
- `capInset` compares stud lengths with `===`. Two walls that differ by any amount make a step.

## 6. Openings in walls

`frameWall` fits each opening, then frames the fitted ones. Gable openings share the fit functions
(8.3). For opening rows, positions, and labels, see [design-model.md](design-model.md) "4. Opening
placement".

### 6.1 Fit order and checks

`frameWall` fits the openings one at a time, in config order. The corners and the zones of the
openings fitted before block each new zone. So the first opening in the list wins a conflict. The
zone runs from the outside face of the left king to the outside face of the right king.

The checks run in this order. A left-out opening stops at its first failed check.

| Check | Outcome |
|---|---|
| The zone passes the wall's ends (5.1). | Left out |
| The zone overlaps a corner or an earlier zone. | Left out |
| The header stack reaches above the top plate's underside. | Left out |
| The gap above the header stack is under 3 in. | Adjusted: tight header (6.3) |
| The rough sill is below the top of the bottom plate. | Left out |
| The header plies are thicker than the wall. | Built, with a warning (6.2) |
| A flat header is on the front or back wall, a bearing wall. | Built, with a warning |
| An overhead door has less than `headroom` from the RO top to the wall top. | Built, with a warning |

The checks with a built outcome run after all left-out checks. So a left-out opening never carries
their warnings.

### 6.2 Headers

- The header spans between the kings and bears on the jacks. Its length is the RO width plus the
  jacks.
- Header plies stand on edge from the outside face. When the plies fit the wall depth, the last of
  two or more plies moves to the inside face, so both faces are flush.
- A spacer fills the gap between the plies. The model has no spacer member, so the cut list and the
  BOM do not list one.

Decision: the app does not limit the user. A header thicker than the wall is built. Its plies stand
proud of the inside face, and a warning gives by how much.

### 6.3 Tight header

Decision: a gap under 3 in above a wall header closes, so no cripple above a wall header is shorter
than 3 in. The header goes tight under the top plate. The RO and the jacks grow by the gap, with a
warning. `RoughOpening.top` is the raised RO top, and the sheathing and the span checks read it.

### 6.4 Rough sill and cripples

An opening with `sill` above 0 gets a rough sill of `walls.sillPlies` flat plies under the RO. Each
layout position in the zone and clear of the kings and jacks takes cripples. They run above the
header up to the top plate, and below the rough sill down to the bottom plate.

A lower cripple has no minimum length: a 4 in sill on a framed floor gives 1 in cripples. Gable
cripples differ (8.3).

### 6.5 Left-out openings

A left-out opening emits no members. Its warning outlines the RO on the wall's outside face
(`leftOut`). It does not block later openings or the layout, so layout studs fill its place. It has
no entry in `Model.openings`, so the sheathing cuts no hole for it. `Model.openings` holds the fitted
wall ROs, then the fitted gable ROs.

### 6.6 Change it safely

- Every fit check runs before the opening emits a member. A leave-out returns null and emits
  nothing.
- `openingZone`, `resolveHeader`, `warnThickHeader`, `openingBoards`, and `leftOut` also frame gable
  openings. Check section 8 after a change.
- To add a left-out case, follow "Leave out a part that cannot be framed" in DEVELOPER.md.

## 7. Roofs

### 7.1 Roof styles

In `frameRoof`, the local `gable` is `ridged(roof)`: true for a gable or a gambrel roof.

| Item | Gable | Gambrel | Lean-to |
|---|---|---|---|
| Slopes in the roof profile | 1, at `roof.pitch` | 2: lower at `gambrel.lowerPitch`, upper at `roof.pitch` (7.8) | 1, at `roof.pitch` |
| Sides framed | Front and back | Front and back | The low side only, eave to eave |
| High end of a rafter | Plumb cut at the ridge | Plumb cut at the ridge, on the upper rafter | `roof.tailCut` |
| Birdsmouths | At the eave wall | At the eave wall, on the lower rafter | At both walls |
| Ridge board, ties, loft | Yes | Yes. The ridge board only with `gambrel.ridgeBoard`. | No |
| Knee walls | Yes | No (7.2) | No |
| Fascia | Each eave | Each eave | Low eave and high end |
| Gable framing (section 8) | Up to the ridge post | Up to the ridge post | Up to the high wall's inside face |

On a lean-to, the high wall is taller by the roof rise (5.2). The high birdsmouth has its heel at
the high wall's inside face, and its seat runs outward over that wall.

### 7.2 Bearing and raised roof

The rafters bear on the eave wall's plates (`wallTops`), across the wall depth. A gable roof with a
loft and knee walls is raised (`raised`). Its rafters bear on the knee walls (9.7), across the
knee-wall stud width.

Decision: a gambrel takes no knee walls, so it is never raised. Its steep lower slope gives the
headroom.

### 7.3 Birdsmouth seat

Decision: the seat bears on the full bearing depth when it can. It shortens so the notch is no
deeper than 1/3 of the rafter depth, measured square to the edge: notch depth = seat × sin. The seat
rounds down to 1/16 in. The bearing stays at least 1-1/2 in: a shorter seat becomes 1-1/2 in, with a
warning. The heel height is `rise × seat`.

### 7.4 Rafter layout and tails

- `rafterStarts` lays out rafters as floor joists (4.1). Each start gets one rafter on each framed
  side.
- The heel of the eave birdsmouth is at the eave wall's outside face. The seat runs inward from
  there, on the plate top.
- The tail runs `roof.eaveOverhang` out from the wall's outside face, horizontal.
- A square tail cut needs an eave of `depth × sin` or more, so the cut's lower corner stays outside
  the wall face. On a shorter eave the tails are plumb cut, with a warning.
- A plumb-and-level tail is plumb only as deep as the fascia hangs below the roof line (its drop plus
  its depth), then level back to the bottom edge, so no rafter end shows below the fascia. It needs a
  fascia, and an eave as long as the level cut; else the tails are plumb cut, with a warning. A
  member whose plumb end is no deeper than the fascia hangs, such as a ladder rail, is plumb cut. A
  lean-to roof's high end stays plumb.
- A roof extension takes over a side's low eave ([additions-and-finishes.md](additions-and-finishes.md)
  "1. Lean-tos"). There the rafters stop at the wall's outside face, plumb cut, with no tail and no
  fascia.

### 7.5 Ridge board

- A gable roof has a ridge board. A gambrel has one with `gambrel.ridgeBoard` (`hasRidgeBoard`).
- The ridge top is at the rafter top at the ridge face. With `rakeLadder.ridgeExtends`, the ridge
  runs out to the fly rafters. Else it stops at the end walls.
- A ridge board shallower than the rafter plumb cut at the ridge, `depth / cos`, is built, with a
  warning.
- Without a ridge board, a gambrel's upper rafters butt at the ridge line, plumb cut. Peak gussets
  join them (7.8).

### 7.6 Rake ladders

Each end of each side has one rake ladder for each slope of the roof profile. Lookouts stand on
edge, with their tops flush with the rafter tops. They are evenly spaced, at most
`rakeLadder.spacing` apart. The last one stops where a lookout's lower corner meets the plumb line
at the ladder's high end.

| Decision | Reason |
|---|---|
| A rake ladder goes up in one piece: fly rafter, lookouts, and a rail face-nailed to the gable-end rafter. With `onEndRafter`, the gable-end rafter is the rail. | Builders assemble it on the ground. |
| No lookout at a fascia end unless `fasciaLookouts` is on. | The fascia ties the ladder's eave ends. |
| No lookout at the top of a gable ladder. | The ridge board, run out to the fly rafters, is the top rung. Without it, a plumb block at the peak meets the block on the other slope. |
| A gambrel's upper ladder has a lookout at the break. | The lower and upper fly rafters meet there. |

### 7.7 Purlins and fascia

- With `roof.roofing` other than `shingles`, purlins lie flat across the rafters. Each slope gets its
  own purlins, evenly spaced at most `purlinSpacing` apart.
- The lowest purlin starts at the tail. The highest ends at the ridge face, the high end, or the
  break. On a gambrel, one purlin ends at the break and the next starts there.
- With `metal-over-sheathing`, the purlins lie on the sheathing.
- On plumb and plumb-and-level tails the fascia hangs plumb. At a low eave, `roof.fasciaTop` sets
  how its top meets the roof plane. The plane falls thickness × rise across the board: 3/4 in for a
  2x fascia at 6/12, 3-5/8 in at 29/12.

  | `fasciaTop` | Fascia | Plumb-and-level depth |
  |---|---|---|
  | `set-down` (default) | Set down by that fall, so the roof plane passes over its outer top edge. | Fall + fascia depth |
  | `beveled` | Top at the rafter top, its top edge ripped to the pitch (`Member.bevel`). The note gives the outer face height. | Fascia depth |
  | `flush` | Top at the rafter top. Its outer top edge stands above the roof plane. | Fascia depth |

  The sheathing and drip edge run over a set-down or beveled fascia. Lean-to fascia follow the same
  setting. A lean-to roof's high-end fascia stays at the rafter top.
- On square tails the fascia is square to the roof, its top in the roof plane.

### 7.8 Gambrel break, miter, and gussets

A gambrel side has two slopes. The lower slope is the eave slope, at `gambrel.lowerPitch`. The upper
slope rises from the break at `roof.pitch`. The two top lines meet at the break.

Decision: the break stays at least 1 ft from the ridge line, measured horizontally. A `breakRun`
closer than that moves to 1 ft from the ridge line, with a warning. `gambrelBreak(config)` gives the
break run and height for the form.

The lower and upper rafters meet in a miter on the bisector of the two slopes: M = (lower angle −
upper angle) / 2 from square. Fly rafters, rails, and gable top plates miter at the break in the same
way. The lower rafter (`rafter`) has the tail and the birdsmouth. The upper rafter (`rafter.upper`)
has no birdsmouth.

Plywood gussets join each lower and upper rafter at the break. Each gusset reaches 12 in along each
rafter's top edge from the break, then square across the rafter.

| Rafter | Gussets | Shape |
|---|---|---|
| Common | One on each face. | The lower edge runs straight across, under the miter's inside corner, so the gusset is a web. 5 corners. |
| Gable-end | One, on the inside face. The outside face carries the rake ladder. | It stays within the rafter depth, because the gable top plate is under it. 6 corners. |

Without a ridge board, peak gussets join the upper rafters across the ridge line in the same way. The
ties then stay under the peak gussets (9.3).

### 7.9 Facts for later steps

`frameRoof` returns facts that later steps read. `roof.ts` gives their fields.

| Fact | Read by | Contract |
|---|---|---|
| `planes` | `frameSheathing`, `buildFinishes`, the BOM roofing lines | One `RoofPlane` for each slope of each framed side. A gambrel side gives the lower plane first. |
| `rafterSpans` | `checkSpans` | The horizontal clear span of each rafter member ([outputs.md](outputs.md) "8.6 The checks"). |
| `deck` | `frameSheathing` | The loft deck (9.8). |
| `soffit`, `eave` | `frameAdditions` | The main roof's underside outside each wall, and the facts at a downhill eave ([additions-and-finishes.md](additions-and-finishes.md) "Main roof facts"). |

### 7.10 Change it safely

- Rafters, upper rafters, fly rafters, and rails go through `planeMember` with `dir` = (cos, sin) of
  their slope. Keep new angled roof members on `planeMember`, so their length stays long point to
  long point.
- `rafterStarts` puts the gable-end rafters first and last. `frameAttic` relies on that order for
  `commons`. The gussets rely on it to find the gable-end rafters.
- The ridge bottom is `profile.top(width / 2 − 0.75)` less the ridge width. `frameRoof` computes it
  from `peak.top(to)` and passes it to `frameAttic`. `frameGableEnds` computes the same value. Change
  both together.
- With one slope, each `Profile` function must give the value of the slope's own formula. Gable and
  lean-to output depends on it.
- `frameRoof` and `frameGableEnds` each build the text `Cut M° from square at the break.` Change both
  together.
- `gambrelBreak` repeats the seat and the break height of `frameRoof`. Change both together.
- A change to `soffit` or `eave` changes every lean-to. Run `tests/additions.test.ts` too.

## 8. Gable ends

`frameGableEnds` frames the area above each end wall, under the end rafters, for every roof style. On
a lean-to, the area is the slope above each end wall, up to the high wall.

Each end wall has its own plane, assembly (`gable.left`, `gable.right`), and id prefix (`GL`, `GR`).
The plane's a coordinate is the end wall's u (2.2), so gable studs and openings follow the end wall's
layout. Plates, studs, kings, jacks, cripples, and posts are profiled, and fill the end wall's depth
(1.1). Headers, header plates, and rough sills are box members from `openingBoards`.

The gable framing stands on the end wall's top plate. With `roof.gablePanel`, each gable end is a
panel on its own bottom plate, nailed down to the end wall's top plate. Every gable stud is then
1-1/2 in shorter.

### 8.1 Gable top plate

The gable top plate (`plate.gable`) lies under each end rafter, with its top against the rafter's
underside. The gable studs are cut to its underside.

- Low end: a level cut on the plate below, where the top plate's underside meets it. When that point
  is within the bearing depth, the low end is a plumb cut at the eave wall's inside face. On a raised
  roof, the low end is at the knee wall.
- High end: a plumb cut at the ridge post, at the peak with no ridge post, or at the high wall on a
  lean-to.
- On a gambrel, each side has two top plates, mitered at the break as the rafters are (7.8).
- No layout stud or gable opening goes within `clear` of each eave. `clear` is the larger of the wall
  depth and the bearing depth, or the corner plate length on a raised roof.

### 8.2 Studs and ridge post

- A gable stud stands at each layout position of the end wall. It skips positions within `clear` of
  an eave, at the ridge post, and in an opening's zone. Inside an RO, a position takes cripples
  (8.3).
- Each stud runs from the plate top to the gable top plate. Its top cut follows the slope above it.
- The ridge post stands under the ridge board, square cut. Inside an RO, it runs from the header top
  to the ridge board.

Decision: on a roof raised by knee walls, the gable end runs through to the corners. A level corner
plate at each eave lines up with the knee wall's top plate. The knee wall's cap plate laps over it,
as at a wall corner, and the end rafter seats on the lap. Two corner studs carry each corner plate:
an end stud, and a stud at the knee wall's inside face.

### 8.3 Gable openings

A gable opening is a row on an end wall with its sill at or above the end-wall top
([design-model.md](design-model.md) "4. Opening placement"). `frameWalls` skips it.
`frameGableEnds` fits it with `fitGableOpening`, in config order.

| Rule | Wall (`fitOpening`) | Gable (`fitGableOpening`) |
|---|---|---|
| Ends | `zone` within the wall's ends | `zone` outside `clear` of each eave. Else left out. |
| Overlap | Corners and earlier zones: left out | Earlier gable zones: left out |
| Ridge post | — | Left out when the post overlaps the zone but is not inside the RO |
| Header top limit | The top plate's underside | The lower of the gable top plate's underside over the header's two outer ends. Else left out. |
| Gap under 3 in above the header | Tight header: the RO grows (6.3) | No cripple. The RO stays. No warning. |
| Rough sill | When `sill > 0` | When `sill` is above the plate top |
| Rough sill too low | Below the bottom plate's top: left out | Below the plate top: left out |
| Cripples | Above the header: 3 in or more. Below the sill: any length. | 3 in or more, above and below |
| Thick header | Built, with a warning | Built, with a warning |
| Flat header on a bearing wall | Warning on front and back | No check |
| Overhead headroom | Warning | No check |

On a gambrel, `top` follows both slopes. Its lowest point over a header is still at an outer end.

### 8.4 Change it safely

- The gable studs and gable openings use the end wall's u. Keep `toY` and `wallFrames` in step.
- The gable top plate cases depend on `raised`, `capPlate`, `gablePanel`, and the roof style. Test
  each one.
- `under` and `topCut` take the lowest of all slopes. A gable member that follows the roof must use
  `top(u)`, not one slope's line.

## 9. Attic

`frameAttic` frames rafter ties, collar ties, the loft, and knee walls on gable and gambrel roofs.
`commons` is the rafters less the first and last.

Decision: the gable-end rafter pairs stand on the gable framing and get no ties.

### 9.1 Level pieces

Ties and loft joists run front to back between the slopes. `clipBelow` trims each end past the
roof line, and the note gives the cut angle.

- A tie sits at x = rafter start + 1-1/2, beside the rafter's +x face. It laps the rafter side, so
  it can reach out to the roof's top line.
- A loft joist keeps its own `loft.oc` layout, centered on each layout mark. When the joists lap
  the rafters (on the plates, and not raised), a joist that would hit a rafter moves past it in +x.

On a gambrel, a tie at the height of the gussets laps the gusset face. It sits `gussets.thick`
farther along x.

### 9.2 Rafter ties

Decision: loft joists take the place of rafter ties. With the loft on, `frameAttic` builds no rafter
ties.

Rafter ties belong in the lower third of the roof height, from the plate to the ridge top. A tie
above the lower third is built, with a warning.

### 9.3 Collar ties

Collar ties exist with or without a loft. With `collarTies.height` `auto`, a gable roof's ties sit at
the bottom of the upper third of the roof height. On a gambrel, the tie top is at the miter's inside
corner. Both stay under the ridge board.

Collar ties that would hit the ridge board, or the peak gussets, are left out. Their outline is level
at the tie bottom, across the commons.

### 9.4 Loft floor

| `loft.support` | Joists | Along the eaves |
|---|---|---|
| `plates`, no knee walls | On the wall plates, ends cut to the roof line | Nothing |
| `plates`, knee walls | On the wall plates, inside the rims | `rim.loft` (9.6) |
| `hung` | In hangers between ledgers, tops flush with the wall tops | `ledger.loft` on each eave wall's inside face (9.6) |

Decision: joists on the plates with no knee walls lap the rafters, as rafter ties do. They sit at the
rafters' bearing level, so a joist on a rafter's position collides with it. `clear` moves such a
joist, or a pair, beside the rafter. Hung joists and joists under knee walls do not move.

Loft joists lay out on `loft.oc` from x = 0. A closed end has one joist inside the gable studs. An
open end (`loft.open`) has a doubled edge joist, and no joists across the open part. When the open
end leaves no loft floor, `frameLoft` warns. It then builds no loft members and no deck. The rafter
ties stay off, because the loft is on.

### 9.5 Hatches

Each hatch gets doubled trimmers outside its x edges and doubled headers across its y ends, in
hangers. Tail joists run from each header to the eave.

| Check | Outcome |
|---|---|
| The trimmers pass the ends of the loft floor. | Left out |
| The headers reach past the ends of the loft joists. | Left out |
| The trimmers overlap an earlier hatch's trimmers. | Left out |
| With `lapping` joists, a header is above the rafter underside. | Left out |
| The shortest tail joist is under 3 in. | Built, with a warning |
| The headers are longer than 4 ft. | Built, with a warning to check their size |

A left-out hatch has its outline at the joist tops.

### 9.6 Ledgers and rims

Hung joists hang from a ledger on each eave wall's inside face, under the loft floor only. Knee walls
on the plates stand on a rim on each eave wall's top, between the end walls. Ledgers and rims splice
on the loft members that run front to back.

Decision: across an open end, no joists carry the knee wall's inside edge. More rim plies fill the
knee wall's depth to within 1-1/2 in.

### 9.7 Knee walls

A raised roof (7.2) has a knee wall at each eave, between the gable-end walls. Its outside face is
flush with the wall below. It stands on the deck over the rim, or on the eave-wall top with hung
joists. Its height runs from its base to the top of its plates, where the rafters bear. Its studs
follow the wall layout from each wall's left corner, viewed from outside. Its cap runs to the
building corners and laps over the gable-end corner plates (8.2).

### 9.8 Loft deck

`frameLoft` returns the loft deck for `frameSheathing`. The deck runs over the rims to the outside
faces under knee walls, and to the walls' inside faces over ledgers. Else it stops where the rafter
undersides meet its top. Each hatch is a hole. An open end is a hole, less a strip under each knee
wall.

### 9.9 Change it safely

- A new member that laps the rafter sides near a gambrel's break must sit on the gusset face, as the
  ties do (9.1).
- `clear` moves a member only when `lapping` is true. On the plates with no knee walls, send each new
  front-to-back loft member through `clear`. Else it can collide with a rafter.
- Ledgers and rims splice on members with `axes.length[1] === 1`. A new front-to-back loft member
  must use +y as its length axis to count.
- A new loft part that collides goes through `leaveOut` with assembly `loft`. The loft plan draws it.

## 10. Warnings and left-out parts

The warning and left-out conventions are in DEVELOPER.md "Conventions". The sheet that draws each
left-out assembly is in [drawings.md](drawings.md) "Labels, outlines, and `missing`". Each section
above gives its warnings and their outcomes. The framing leaves out only wall openings, gable
openings, collar ties, and loft hatches.

### 10.1 Silent rules

These rules skip a part, or keep a long piece, with no warning:

| Rule | Function |
|---|---|
| A rake under 1-1/2 in counts as 0: no rake ladder. The ridge, fascia, and purlins stop at the end walls. | `frameRoof` |
| A rake under 3 in, or `onEndRafter`, has no rail. The rail and the fly rafter need 3 in. | `frameRoof` |
| A lookout shorter than 1-1/2 in is not built. | `frameRoof` |
| A gable stud, gable cripple, or ridge post shorter than 3 in is not built. | `frameGableEnds` |
| No ridge post when the ridge bottom is less than 3 in above the gable plate top, or with no ridge board. The top plates then meet at the peak. | `frameGableEnds` |
| Ties with an extent under 1-1/2 in are not built. | `frameAttic` |
| A run with no legal splice stays one piece, longer than stock. | `splitPlate` |
| No loft deck when the rafter undersides leave no deck area. | `frameLoft` |
