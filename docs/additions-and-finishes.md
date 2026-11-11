# Lean-tos, ramps, sheathing, and finishes

This document covers the parts outside the main shed frame: lean-tos and their decks, ramps, sheet
goods, and the 3D finishes. Read [DEVELOPER.md](DEVELOPER.md) first for the model, the conventions,
and the build order. All lengths are inches.

| File | Builds | Called by |
|---|---|---|
| `src/core/gen/additions.ts` | Lean-tos: ledger or roof extension, rafters, beam, posts, piers or slab, deck, fascia, purlins, roof planes, and the `LeanTo` facts. | `buildModel`, after `frameRoof` |
| `src/core/gen/ramps.ts` | Ramps: placement, wood stringers and boards, or a concrete wedge. | `buildModel`, after `frameAdditions`. `RampsEditor` and `pruneConfig` call `rampPlace`. `OpeningsEditor` calls `withOpeningRow` and `withoutOpeningRow`. |
| `src/core/gen/sheathing.ts` | Wall, roof, subfloor, and loft deck sheets. | `buildModel`, last |
| `src/core/gen/finishes.ts` | Siding, trim, roofing, doors, and windows, for the 3D view only. | `App.tsx` (`useMemo`), then `FramingScene` |

## Terms

| Term | Meaning |
|---|---|
| Lean-to | An open, single-slope roof on posts against one side of the shed. One `additions` entry in the config. |
| Soffit | The underside of the main roof's overhang outside a wall: the rafter undersides, then the fascia's bottom edge. |
| Ledger | A board fastened flat to a wall or to the floor framing. It carries the ends of rafters or joists. |
| Birdsmouth | A notch in a rafter's lower edge where the rafter sits on a support: a level seat and a plumb heel. |
| Flush beam | A beam whose top is level with the joist tops. The joists hang from it in hangers. |
| Stringer | A sloped board that carries the ramp boards. |
| PT | Pressure-treated lumber. Its `Member.treated` is `true`. |
| Purlin | A board laid flat across the rafters that carries metal roofing. |
| RO | Rough opening: the framed hole for a door or window. |
| o.c. | On center: the distance from the center of one piece to the center of the next. |
| Grade | The ground level, from `gradeOf` (`floor.ts`): the slab top, the skid bottoms, or the pier tops less `pier.aboveGrade`. |
| Broken pitch | A lean-to extension at a pitch different from the main roof's. |
| Tributary width | The width of roof or deck that one beam carries per unit of its length. |

## Common rules

| Topic | Rule |
|---|---|
| Wall coordinates | `wallFrames` gives each wall an `origin`, a `u` axis along the wall from its left corner seen from outside, and a `v` axis inward. Lean-tos and ramps place points with `at(u, x, z)`: `x` out from the wall's framing face, `z` up from the floor surface. |
| Wall sheet face | `x = wallSheet`: the `walls.sheathing` thickness, or 0 for `none`. |
| Sloped members | `planeMember` builds rafters and stringers from an outline in the vertical plane square to the wall. The length direction is `[cos, -sin]`: down the slope, outward. The cut length runs long point to long point. |
| O.c. layout | Lean-to rafters, deck joists, and ramp stringers share one rule. One piece is flush with each end (`u0` and `u1 − 1.5`). One more piece centers on each multiple of `oc` from `u0` where it does not overlap an end piece. |
| Splices | `splitPlate` splits each long run at supports, in pieces no longer than `maxStock`: the longest stock length within `catalog.maxLength` (`stockFor`). Each splice leaves at least 24 in on each side. With no legal splice, the run stays one piece. |
| Ids | `idMaker` with the assembly prefix: `AF`, `AB`, `AL`, `AR` for the lean-tos (`addition.<side>`), `RP` for ramps (`ramp`). Example: `AF-R01`. |
| Warnings | `source` is the user's side name plus "lean-to", for example "Front lean-to", or "Ramp N". A left-out part carries `missing` and ends with `LEFT_OUT`: "It is left out: red in 3D and on the drawings." |

## Main roof facts

`frameRoof` (`roof.ts`) returns three facts that this document's generators read.

| Fact | Type | Content | Read by |
|---|---|---|---|
| `soffit` | `Soffit` | `under(wall, u, x)`: the height of the main roof's underside `x` out from the wall's framing face, at `u` along it. It is `null` past the roof edge. `breaks(wall)`: the `x` values where `under` changes course, nearest first. | `frameAdditions` (soffit attach) |
| `eave` | `{ top, plate, bearing, pitch, lap }` | At a downhill eave's wall: the rafter top over the framing face, the bearing plate's top, and the bearing depth. The bearing depth is the wall stud depth, or the knee-wall stud depth when knee walls raise the roof. `pitch`: the eave pitch per 12, `eavePitch(roof)`: a gambrel's lower pitch, else `roof.pitch`. `lap`: how far in from the framing face the main rafter sides are clear. On a gambrel it is `run − 12 × cos(lower)`, where the gussets start; else `Infinity`. `run` is the break's run in from the framing face (`gambrelBreak`). | `frameAdditions` (extension; `pitch` for any lean-to) |
| `planes` | `RoofPlane[]` | One per roof side, or two per side on a gambrel (lower, then upper): the rafter-top plane where the sheets lie. `frameAdditions` adds one per lean-to. | `frameSheathing`, `buildFinishes`, the BOM roofing lines |

`Soffit.under` by wall:

| Wall | `x` range | Height |
|---|---|---|
| Eave wall | 0 to `roof.eaveOverhang` | The main rafter underside at that point. |
| Eave wall | to `eaveOverhang` + fascia thickness | The fascia's bottom edge: the rafter top at the tail less the fascia depth. |
| Gable end | 0 to `rake` | The rafter underside over that point along the wall. It is level across the rake. |
| Any | Past the last break | `null` |

`rake` is `roof.rakeOverhang`, or 0 when the overhang is less than 1-1/2 in. The breaks are
`[0, eave, eave + fasciaThick]` on an eave wall, and `[0, rake]` on a gable end. `under` reads the
profile's underside, so on a gambrel it follows the lower slope at an eave wall and both slopes
across a gable end.

`RoofPlane` fields:

| Field | Meaning |
|---|---|
| `assembly` | Whose rafters carry the plane: `roof`, or `addition.<side>`. |
| `origin`, `u`, `v` | The low corner; `u` along the eave, `v` up the slope. `u × v` points out of the roof. |
| `length`, `width` | Along `u`; along `v`, from over the fascia, or from the break, up to the break, the ridge line, or the high edge. |
| `eaves` | The number of edges along `u` that take drip edge. |
| `sheathed` | `false`: metal roofing on purlins, with no sheets. Main roof: `roof.roofing !== 'metal'`. Lean-to: `roofing !== 'metal'`. |
| `ridge` | Its upper edge is on the ridge line. `true` on a gable plane and a gambrel's upper plane. `false` on a gambrel's lower plane, a lean-to main roof, and a lean-to. |
| `breakEdge` | Its edge on a gambrel's break: `high` on a lower plane, `low` on an upper plane. Else `null`. |

A gambrel plane pair, per side:

| Plane | `origin` | `width` | `eaves` |
|---|---|---|---|
| Lower | Over the fascia, or at the wall line on an extended side. | Up the lower slope to the break. | 1, or 0 on an extended side |
| Upper | At the break, on the top line. `v` at the upper pitch. | `(width / 2 − run) / cos(upper)`: up to the ridge line. | 0 |

## 1. Lean-tos

`frameAdditions(config, main, framing)` builds each `additions` entry against one wall. With
`mirror`, it builds a second copy on the opposite wall. Each copy is open on its three outer sides
and stands on its own posts. The roof attaches to the shed in one of two ways:

| `attach` | Roof support at the wall | Where |
|---|---|---|
| `soffit` | Own rafters from a ledger below the main roof's soffit. | Any side, full or partial length. |
| `extension` | Rafters lap the main rafters at a downhill eave and continue the main roof's top line. The main eave overhang on that side goes. | A downhill eave, full length only. |

### Config

`additions[]` (the zod `addition` in `config.ts`). Lengths are horizontal.

| Field | Values (default) | Meaning |
|---|---|---|
| `side` | `front`, `back`, `left`, `right` (required) | Model side. |
| `mirror` | boolean (`false`) | Also on the opposite side. |
| `attach` | `soffit`, `extension` (`soffit`) | See above. |
| `depth` | 24–240 (96) | Main wall framing face to the outside of the posts. |
| `length` | `'full'` or 24–480 (`'full'`) | Along the main wall. |
| `center` | 0–100 % (50) | Center along the wall from its left corner. Partial length only. |
| `pitch` | `'main'` or 1–12 (3) | Rise per 12 of run. `main`: the main roof's eave pitch, `eave.pitch`. On a gambrel, that is the lower pitch. |
| `drop` | 0–48 (0) | Ledger below the highest height that clears the main roof. Soffit only. |
| `rafter` | 2x4–2x12 (2x6) | Rafter size. |
| `oc` | 12, 16, 19.2, 24 (24) | Rafter spacing. The soffit layout reads it. An extension's rafters follow the main rafters, but `checkSpans` still reads `oc` for them. |
| `eaveOverhang` | 0–36 (12) | Rafter tail past the outside of the posts. |
| `fascia` | `none`, 2x4–2x12 (2x6) | Fascia on the rafter tails. |
| `roofing` | `sheathing`, `metal` (`sheathing`) | `sheathing`: the main roof's sheet, `roof.sheathing`. `metal`: panels on purlins, no sheets. |
| `purlin` | 1x4, 2x4 (1x4) | Metal only. |
| `purlinSpacing` | 12–48 (24) | Center to center along the slope. Metal only. |
| `post` | 4x4, 6x6 (4x4) | Post size. |
| `maxSpacing` | 36–192 (96) | Largest post center-to-center distance. |
| `beam` | 2x4–2x12 (2x8) | Beam ply size. |
| `beamPlies` | 1–3 (2) | Beam plies. |
| `floor` | `none`, `slab`, `deck` (`none`) | Ground under the lean-to. |
| `deck` | object | See section 2. |

Other config that a lean-to reads:

| Field | Use |
|---|---|
| `walls.sheathing` | `wallSheet`. The roof ledger stands on the wall sheet face. The deck ledger and ramps bear on the floor framing, which the wall sheathing does not cover. |
| `roof.sheathing` | The roof sheet in the clearance and on the lean-to roof. |
| `foundation.pier.diameter`, `.depth`, `.aboveGrade` | Lean-to piers, on every foundation type. |
| `foundation.slab.thickness` | A lean-to slab, on every foundation type. |
| `catalog` | Stock lengths for the splices. |

`shedSchema.superRefine` rejects three designs. These errors stop the parse:

| Rule | Message | Path |
|---|---|---|
| One lean-to per side. Mirror copies count. The assembly is `addition.<side>`, one per side. | One lean-to per side | `additions.i.side` |
| An extension needs a side the roof slopes down to: either eave of a gable or gambrel roof, or the low eave of a lean-to roof. | A roof extension needs an eave the roof slopes down to | `additions.i.attach` |
| An extension runs the full wall length. | A roof extension runs the full wall length | `additions.i.length` |

`extensionSides(additions)` gives the model sides whose eave an extension takes over, mirror copies
included. `frameRoof` reads it.

`pruneConfig` drops these lean-to fields:

| Field | Dropped when |
|---|---|
| `purlin`, `purlinSpacing` | `roofing` is not `metal`. |
| `center` | `length` is `full`. |
| `drop` | `attach` is `extension`. |
| `deck` | `floor` is not `deck`. |

On the other foundation types, `pruneConfig` keeps the pier settings and the slab thickness that the
lean-tos use.

### Extent along the wall

1. `span` is the wall length: `config.length` for front and back, `config.width` for left and right.
2. A full lean-to runs `u0 = 0` to `u1 = span`. A partial lean-to is `length` long, centered at
   `center` % of `span`.
3. An extent that passes a corner by more than 0.01 in stops at the corner, with a warning.
4. `mirror` builds the copy on `OPPOSITE[side]` at `100 − center`. The `u` axis runs the other way
   on the opposite wall, so the copy stands at the same x (or y) as the first.

### Roof line

The rafter top is `top(x) = anchorZ − rise × (x − anchorX)`, with `rise = pitch / 12`. The underside
is `bottom(x) = top(x) − plumb`. `plumb = rafter depth / cos` is the rafter's vertical depth.

Below the soffit (`attach: 'soffit'`):

1. `start = wallSheet + 1.5`: the ledger's outer face, where the rafters' plumb ends bear.
2. `roofSheet` is the layer under the roofing: the `purlin` thickness for metal, else the
   `roof.sheathing` thickness (0 for `none`).
3. For each break `x` in `soffit.breaks(side)`, and each end `u` in `[u0, u1]`, set
   `point = max(x, wallSheet)`.
4. Each point where `under = soffit.under(side, u, point)` is not `null` gives a limit:
   `under − CLEARANCE − roofSheet + rise × (point − start)`.
5. `ledgerTop = min(limits) − drop`. Then `anchorX = start` and `anchorZ = ledgerTop`: the ledger
   top is flush with the rafter tops at their plumb ends.

The limit keeps the lean-to roof surface (rafter top plus `roofSheet`) `CLEARANCE`, 1-1/2 in, under
the main roof's underside. Both roofs are straight between the soffit breaks, so the breaks and the
lean-to's two ends hold the lowest limit. `drop` lowers the whole lean-to by that amount.

The ledger is the smallest 2x (2x4 to 2x12) at least as deep as `plumb`, so it takes the full plumb
cut in the hanger. A 2x6 rafter at 3/12 has a 5.67 in plumb end, so its ledger is a 2x8. A plumb end
deeper than 11-1/4 in gets a 2x12 and a warning.

Extension (`attach: 'extension'`):

1. The rafter top passes through `eave.top` over the wall's framing face: `anchorX = 0`,
   `anchorZ = eave.top`. At the eave pitch, `eave.pitch`, the lean-to roof is the main roof plane.
2. The upper end `start` is inside the wall line. In the main plane it is `−min(LAP, eave.lap)`:
   24 in, or less on a gambrel, where the lap stops at the gussets. At a broken pitch it is
   `−eave.bearing`, the bearing wall's inside face.
3. There is no ledger.

Example (`tests/additions.test.ts`): the 8x10 preset as a 2x6 gambrel has its break 24 in from the
wall. In the main plane the lap is 24 − 12 × cos 59.0° = 17-13/16 in.

### Beam, seat, and posts

| Quantity | Formula |
|---|---|
| Post line (post center) | `line = depth − post / 2`, with the post width 3-1/2 or 5-1/2 in. |
| Beam width | `beamPlies × 1.5`, centered on `line`. |
| Heel (the beam's outer face) | `heel = line + beamWidth / 2` |
| Seat, horizontal | `min(beamWidth, ⌊16 × rafterDepth / (3 × sin)⌋ / 16)`. The seat takes the beam width, but the notch stays no deeper than 1/3 of the rafter, square to its edge. |
| Beam top | `beamTop = bottom(heel − seat)` |
| Rafter tail | `tail = max(depth + eaveOverhang, heel)`, plumb cut. |
| Post base | `postBottom`: grade on a slab; the deck beam top with a deck (section 2); else the pier top, `grade + pier.aboveGrade`. |
| Post length | `beamTop − beamDepth − postBottom` |
| Clear height | `beamTop − beamDepth −` the deck surface, or grade without a deck. |

A seat under 1-1/2 in stays at 1-1/2 in, with a warning. The main roof uses the same 1/3 rule in
`seatLength`.

Posts:

1. `count = max(2, ⌈(run − post) / maxSpacing⌉ + 1)`, with `run = u1 − u0`.
2. Post centers are at `u0 + post / 2 + i × (run − post) / (count − 1)`. The end posts are flush with
   the lean-to's ends.
3. Example: a 120 in run on 4x4 posts at 96 in maximum gives 3 posts, 58-1/4 in apart.

### Rafters

Both attachments share the outer part of the rafter outline. From the upper end's top, it runs along
the top edge to the tail and down the plumb tail cut. It returns along the underside to the heel,
goes up the heel to `beamTop`, and runs in along the seat.

| | Below the soffit | Extension |
|---|---|---|
| Layout | The o.c. rule over `[u0, u1]` at `oc`. | One rafter beside each main `rafter` (`roof` assembly): on its −x face, or the +x face for the rafter at x = 0. The other face carries the ties. |
| Upper end | Plumb cut at `start`, in a joist hanger on the ledger. | Plumb cut at `start`, nailed to the main rafter. |
| Main-wall birdsmouth | None. | Heel at the wall's framing face (x = 0), from `bottom(0)` up to `eave.plate`. The seat runs in on the plate to `seatEnd`, where the underside meets the plate top. It stops at `start` when it would pass the upper end. None when the underside passes over the plate (below). |
| Note | "Plumb cut θ at the ledger, in a joist hanger. Birdsmouth on the beam: …" | "Laps the main rafter L in from the wall line, nailed to it; upper end plumb cut θ. Birdsmouths on the main wall (heel at its outside face, seat S) and on the beam: …" |

`seatEnd = (eave.top − plumb − eave.plate) / rise`. It is negative, inside the wall line, unless
the underside passes over the plate.

The underside can pass over the main wall's plate under a steep main eave, such as a gambrel's,
at a shallower lean-to pitch. `gap = rise × seatEnd` is the underside's height over the plate at the
framing face. When `gap > −0.01`, the rafter has no main-wall birdsmouth. Its outline runs from the
beam part to a plumb upper end.

| `gap` | Note |
|---|---|
| −0.01 to 0.01 | "Laps the main rafter L in from the wall line, nailed to it; upper end plumb cut θ. No birdsmouth on the main wall. Birdsmouth on the beam: …" |
| Over 0.01 | "Laps the main rafter L in from the wall line, nailed to it; upper end plumb cut θ. No birdsmouth on the main wall: block under it, G at the wall's outside face. Birdsmouth on the beam: …", and a warning. |

Example (`tests/golden/12x16-gambrel-barn.txt`): the back extension, at 4/12 under the 20/12 lower
slope, passes 1-3/8 in over the plate.

The beam part of each note gives four values:

| Value | Formula |
|---|---|
| Heel line, from the upper end on the top edge | `(heel − start) / cos` |
| Seat | `seat` |
| Heel height | `rise × seat` |
| Tail, past the heel line on the top edge | `(tail − heel) / cos` |

In the extension note, `L = −start` and `S = min(−seatEnd, −start)`.

An extension gives three more warnings:

- The main-wall notch is deeper than the 1/3 limit. The warning asks for a rafter no deeper than
  the main rafters.
- A steeper lean-to pitch lifts the upper ends above the main roof plane by
  `stand = (rise − eave.pitch / 12) × (−start)`. Over 1/8 in, a warning says to trim them flush.
- The underside passes over the main wall's plate: `gap` over 0.01 in. The warning says to block
  under each rafter.

`frameRoof` changes the main roof on each side in `extensionSides`:

- The main rafters stop at the wall line, plumb cut. Note: "No tail: plumb cut at the wall line,
  under the lean-to rafter beside it."
- That side gets no main fascia. Its fly rafters, ladder rails, and purlins start at the wall line.
- The main roof plane starts at the wall line, with one eave fewer. The lean-to plane covers the
  rest.

### Members and solids

| Role | Code | Size | PT | Position | Splices at | Note |
|---|---|---|---|---|---|---|
| `rafter` | `R` | `rafter` | no | As above. | One piece | As above. |
| `ledger` | `L` | Smallest deep enough 2x | no | Soffit only. `x` from `wallSheet` to `start`, top at `ledgerTop`, over `u0..u1`. | Rafter centers | "Lag-bolt through the sheathing into each main-wall stud." |
| `beam` | `B` | `beam`, `beamPlies` plies | no | Centered on `line`, top at `beamTop`. | Post centers | — |
| `post` | `P` | `post` | yes | Centered on `line` and on each post center, from `postBottom` to the beam bottom. | One piece | With a deck: "Stands on the deck beam, over the pier." |
| `fascia` | `FA` | `fascia` | no | On the rafter tails, top at `top(tail)`. | Rafter centers | — |
| `purlin` | `PU` | `purlin` | no | Metal only. Flat on the rafter tops. | Rafter centers | — |

| Code | Label | Shape | When |
|---|---|---|---|
| `PR` | `Pier, D" diameter` | A cylinder at each post, `pier.diameter` wide, up to the pier top. The pier top is `grade + pier.aboveGrade`, or the deck beam bottom (section 2). The base is `min(grade, pier top) − pier.depth`. | `floor` is `none` or `deck`. |
| `SL` | `Slab` | A box from the wall framing face out to `depth`, over `u0..u1`, `slab.thickness` thick, top at grade. | `floor` is `slab`. |

Both solids are on layer `foundation`, material `concrete`.

### Roofing

The lean-to's `RoofPlane` has `assembly` `addition.<side>`, `eaves: 1`, and `sheathed` true unless
`roofing` is `metal`. It runs from the low edge over the fascia, `low = tail + fascia thickness`, up
to the wall sheet face. For an extension it runs up to the wall line, where the main plane starts.
Its `width` is `(low − wallSheet) / cos`, or `low / cos` for an extension.

With `roofing: 'sheathing'`, `frameSheathing` lays `roof.sheathing` sheets on the plane (section 4).
With `roof.sheathing: 'none'`, the plane gets no sheets.

With `roofing: 'metal'`:

1. `slope = (tail − start) / cos`: the length of the rafter top.
2. `gaps = max(1, ⌈(slope − purlinWidth) / purlinSpacing⌉)`.
3. `gaps + 1` purlins stand evenly along the slope. The lowest has its lower edge at the tail, the
   highest its upper edge at `start`.

Example: a tail at 108 in and a ledger face at 1-15/16 in give 106-1/16 in of run at 3/12. That is
109.33 in of slope. With 1x4 purlins at 24 in, it gives 5 gaps and 6 purlins. On an extension,
`start` is inside the wall line, so the highest purlins stand over the main roof.

### Lags

Two 1/2 in lag screws go into each main-wall stud behind the ledger. The count takes each vertical
member of `wall.<side>` or `gable.<side>` that meets two conditions:

- Its center along the wall lies strictly between `u0` and `u1`.
- Its height range overlaps the ledger.

An extension has no lags. Example: the 8x10 preset's front lean-to finds 2 corner studs, 5 studs,
2 kings, and 2 jacks: 22 lags.

### `LeanTo` facts

`frameAdditions` returns one `LeanTo` per built copy, in `Model.leanTos`. `checkSpans` reads only
these facts. `buildBom` reads them, and counts the rafters, posts, and deck joists from the members.

| Field | Value | Read by |
|---|---|---|
| `side`, `addition` | The wall of this copy, and its config entry. | All below |
| `rafterSpan` | Soffit: `heel − seat − start`. Extension: `heel − seat`. Horizontal, from the ledger face or the wall's framing face to the inner end of the seat. | `checkSpans`: lean-to rafters at `addition.oc`, roof live and dead load, L/180 |
| `postSpacing` | `(run − post) / (count − 1)` | `checkSpans`: beam and deck beam span |
| `beamTributary` | Soffit: `(line − start) / 2 + (tail − line)`. Extension: `line / 2 + (tail − line)`. | `checkSpans`: beam, `beamPlies`-ply, roof live and dead load, L/240 |
| `lags` | 2 per stud behind the ledger; 0 for an extension. | `buildBom`: "Ledger lag screw, 1/2"" |
| `deck` | See section 2, or `null`. | `checkSpans`, `buildBom` |

Example (`tests/additions.test.ts`): the 8x10 front lean-to's rafter span is
`95-3/4 − 3 − 1-15/16 = 90-13/16` in. Its beam check is "2-ply 2x8" over 58-1/4 in.

BOM hardware from lean-tos (`hardware` in `bom.ts`):

| Item | Quantity |
|---|---|
| Hurricane tie, rafter to plate | 1 per soffit rafter, on the beam. 2 per extension rafter: the beam and the main wall. |
| Joist hanger, `<rafter>` | 1 per soffit rafter, at the ledger. None for an extension. |
| Post base, Post cap | 1 each per post, deck posts too. The BOM groups lean-to posts and pier posts by size. The base note: "Set in the pier, or anchored to the slab or a deck beam." |
| Ledger lag screw, 1/2" | The sum of `lags`. |

Lean-to concrete joins the shed's lines in `concrete`: a slab joins "Concrete, slab", and piers join
"Concrete, N piers" and the form tubes.

### Decisions

| Decision | Reason |
|---|---|
| The app builds the lean-to the user enters, and warns about short posts, low headroom, and deep notches. It leaves out a lean-to in three cases only: no main roof over the wall for the ledger, too shallow for its beam, or a beam at or below the post bases. | The app never limits the user. A part is left out only when its framing would collide, and then it shows in red. |
| The ledger goes as high as the main roof allows, less `drop`. | The lean-to gets the most clear height under its beam. `drop` lets the user lower it. |
| The ledger is at least as deep as the rafter's plumb end. | The hanger then takes the full plumb cut. |
| Extension rafters sit beside the main rafters, on the face away from the ties. | They lap the main rafter with no clash with the ties. |
| An extension laps 24 in in the main plane, but only to the bearing wall's inside face at a broken pitch. | At a broken pitch the two top lines meet only at the wall line, and the gap grows inward. The `stand` warning gives that gap at the upper end. |
| On a gambrel, the lap stops where the gussets start. | The gussets cover the main rafter's sides from there to the break. |
| An extension rafter that passes over the main wall's plate gets no birdsmouth there, and a warning to block under it. | A birdsmouth there would need a negative seat. |
| A birdsmouth seat is never deeper than 1/3 of the rafter. | The same rule as the main roof's seats. |
| Lean-to piers and a lean-to slab use the main foundation's pier and slab settings, on every foundation type. | One set of pier and slab settings for the design. The form shows them on a skid or slab shed too. |

### Change it safely

- Keep `LeanTo` in step with the members. `checkSpans` reads only the facts.
- A change to the main eave or rake in `roof.ts` must keep `Soffit.under` and `breaks` true. Else the
  ledger rises into the main roof.
- An extension spans two generators. `extensionSides` drives the main roof's cut-back in
  `frameRoof`, and `frameLeanTo` adds the lap. Change both together.
- Call `leaveOut` before any member of the copy, then `return`.
- A new field that applies only with one choice needs a rule in `pruneConfig`.
- Tests: `tests/additions.test.ts` holds hand-checked values for the 8x10 preset, and the 8x10 as a
  gambrel (the lap stops at the gussets; the block over the plate). The fixtures
  `12x12-with-lean-tos` (extension, partial length, slab, metal, 6x6 posts, 3-ply beam),
  `16x16-b-and-b-shed` (mirror, metal), `10x16-loft-shed` (deck), and `12x16-gambrel-barn`
  (extension blocked over the plate, gable-end lean-to on a slab) cover the rest. Review the golden
  diffs before an update.

## 2. Lean-to deck

`floor: 'deck'` adds a deck between the shed wall and the posts. `frameLeanTo` takes the deck's
heights from `deckHeights` and builds it with `frameDeck`, both in `src/core/gen/deck.ts`. A deck stands on piers (`deck.support: 'piers'`, the subsections below up to
[On the shed's foundation](#on-the-sheds-foundation)), or on the shed's own skids or girders
(`'shed'`).

| Field | Values (default) | Meaning |
|---|---|---|
| `deck.joist` | 2x4–2x12 (2x8) | Joists, deck ledger, and deck beam plies. |
| `deck.oc` | 12, 16, 19.2, 24 (16) | Joist spacing. |
| `deck.boards` | `5/4x6`, `2x6` (`5/4x6`) | Deck boards: 5/4 radius-edge decking, 1 in thick, or 2x6, 1-1/2 in. Both 5-1/2 in wide. |
| `deck.drop` | 0–24 (0) | Shed floor surface to the deck surface. On the shed's foundation it is a target: see below. |
| `deck.support` | `piers`, `shed` (`piers`) | `shed`: on the shed's skids or girders. A slab shed's deck stands on piers. |
| `deck.join` | `continue`, `separate` (`continue`) | A gable-end deck on the shed's foundation: run the shed's skids or girders on out, or give the deck its own in line. |

### Heights and supports

| Quantity | Formula |
|---|---|
| Deck surface | `deckTop = −drop` |
| Joist and beam tops | `deckJoistTop = deckTop − board thickness`: 1 in for 5/4 decking, 1-1/2 in for 2x6 |
| Joist and beam bottoms | `deckBeamBottom = deckJoistTop − joist depth` |
| Natural pier top | `natural = grade + pier.aboveGrade` |
| Pier top | `natural` when the beam bottom is at least `MIN_POST` (12 in) above it; else `deckBeamBottom` |
| Pier base | `min(grade, pier top) − pier.depth` |

The load path from the roof to the ground:

1. The lean-to posts stand on the deck beam over each pier, from the beam top to the roof beam.
2. The deck beam bears on the piers directly when the piers rise, or stop, to meet it (`seated`).
3. When 12 in or more of post fits between the natural pier top and the beam, the piers keep their
   height. A deck post then stands on each pier under the beam.

### Framing

1. Ledger face: `ledgerFace = 1.5`. The ledger bears on the floor framing at `x = 0`: the wall
   sheathing starts above the floor.
2. Beam: `plies = max(2, ⌈post / 1.5 − 0.01⌉)`, enough plies to bear the post's full width. A 4x4
   gets 3 plies, 4-1/2 in. A 6x6 gets 4 plies, 6 in.
3. The beam is centered on the post line: `beamInner = line − plies × 1.5 / 2` and
   `beamOuter = line + plies × 1.5 / 2`.
4. Joists follow the o.c. rule over `[u0, u1]`. Each runs from the ledger face to the beam:
   `beamInner − ledgerFace`.
5. Boards run along the wall, 1/4 in apart. The rows go from the framing face (`x = 0`) outward
   until they pass `beamOuter`: `rows = ⌈(beamOuter + 0.25) / 5.75⌉`.

| Role | Code | Size | PT | Position | Splices at | Note |
|---|---|---|---|---|---|---|
| `ledger.deck` | `DL` | `deck.joist` | yes | `x` from 0 to `ledgerFace`, from the joist bottom to the joist top. | Joist centers | "Lag-bolt into the floor framing, two at each joist." |
| `joist.deck` | `DJ` | `deck.joist` | yes | From `ledgerFace` out to `beamInner`. | One piece | "Joist hangers at both ends." |
| `beam.deck` | `DB` | `deck.joist` | yes | `plies` plies from `beamInner` to `beamOuter`. Tops level with the joists. | Post centers | Seated: "Bears on the piers; the posts stand on it." Else: "Bears on the deck posts; the posts above stand on it." |
| `post` | `DP` | `post` | yes | Not seated only. From the pier top to the beam bottom. | One piece | "Under the deck beam." |
| `decking` | `DK` | 2x6 | yes | Top at `deckTop`. | Joist centers | See below. |

Each board piece that crosses the post line meets the posts in one of three ways:

| Posts in the board's width | Board | Note |
|---|---|---|
| None | A plain board. | — |
| The posts reach one edge only | One board with a notch at each post, as deep as the post reaches in. `notchedOutline` (`deck.ts`) gives the outline as a `profile`. | "Notch around the posts." |
| The posts cover the full width, or stand inside it | Pieces cut between the posts. | "Cut to fit between the posts." |

`notchedOutline` drops the points on a straight run, so a notch at a board end leaves no sliver.

### Example

From `tests/additions.test.ts`: a front lean-to 72 in deep on 4x4 posts, 2x8 joists at 16 in, on the
8x10 preset. Grade is the skid bottom, −11-23/32 in.

- 9 joists, each 66-1/16 in long. 3 beam plies, 68 to 72-1/2 in out.
- The natural pier top, −3-23/32 in, is over the beam bottom, −8-3/4 in. The 3 piers stop at the
  beam: 38-31/32 in tall from −47-23/32 in. The lean-to posts start at the beam top, −1-1/2 in.
- 13 board rows. The two rows over the posts are notched: one from each edge.
- On a pier foundation with 24 in pier posts, the natural pier tops are at −37-15/32 in. Each deck
  post is then 28-23/32 in long.

### On the shed's foundation

With `deck.support: 'shed'` on a skid or pier shed (`onShed` in `src/core/gen/deck.ts`), the deck
joists sit on skids or girders at the shed's own height: their top is the shed's joist bottom
(`supportLines` in `supports.ts`). Set on them, the deck surface is that top plus the deck joist depth
plus the board: `onSupports`. The deck surface is the lower of that and `−drop`. Where `onSupports`
is higher, each joist and beam is notched `deckNotch = onSupports − deckTop` up from its bottom at
each bearing (`onEdge` with `bearings`, in `frameDeck`). A piece that rests on a line all along, the eave
side's beam or a rim over a line, is ripped by `deckNotch` instead. Notes say "Notch D at each
bearing." or "Rip to W." A notch deeper than 1/4 of the joist depth, the usual limit at a bearing,
gets a warning. Example: 2x6 joists and 5/4 boards on the 8x10's 4x6 skids stand 9/32 in above the
floor; with `drop` 0 the joists are notched 9/32 in, shown rounded to 5/16 in.

A gable-end deck is a box: a rim joist (`rim.deck`) at each end runs from the wall out past the beam,
and the joists and beam run between them.

| Side | Skids or girders | Joists | Beam and posts |
|---|---|---|---|
| Eave (front or back) | The deck's own lines along the wall, the shed's size: one under the post line, the rest no farther apart than the shed's lines (`supportLine` along the wall). Skids get both ends cut. Girders get the shed's piers, posts, and pier spacing. | Out from a ledger on the floor framing, in hangers at both ends, bearing on the lines between. | The flush beam bears on the outer line. The posts stand on it. No lean-to piers. |
| Gable (left or right), `join: 'continue'` | `frameFloor` runs each shed line under the deck on out to the beam's outer face (`continuedDecks`, `deckReach`). The run's piers spread evenly over its new length. | Along the wall, on the lines, from the wall out to the beam at `deck.oc`, spliced over the lines. No ledger and no hangers. | The beam runs along the wall on the lines, the posts on it. |
| Gable, `join: 'separate'` | The deck's own lines in line with the shed's (`supportLine` out from the wall): the inner end square against the shed's, the outer end cut. | As above. | As above. |

A gable-end deck with no shed line under it gets its own lines at its two ends, with a warning. The
boards on a gable end run out from the wall, across the joists, notched around the posts.

### Facts and outputs

`LeanTo.deck` is `{ joist, plies, joistSpan, beamSpan, beamTributary, seats, hangers, ledgerLags }`:

| Field | Value | Read by |
|---|---|---|
| `plies` | Deck beam plies. | `checkSpans` |
| `joistSpan` | The longest bay between bearings: ledger, lines, beam. | `checkSpans`: deck joists at `deck.oc`, 40 psf live + 10 psf dead, L/360 |
| `beamSpan` | On piers: the post spacing. On a gable end: the longest bay between lines. On an eave side's outer line: 0, no check. | `checkSpans`: deck beam, "`plies`-ply `joist`", same loads, L/360 |
| `beamTributary` | `joistSpan / 2 + (beamOuter − beamInner)`; on a gable end `oc / 2 + (beamOuter − beamInner)` | `checkSpans` |
| `seats` | The post count when the beam sits on the piers, else 0. | `buildBom` |
| `hangers`, `ledgerLags` | 2 per joist with a ledger; 0 on a gable end on the shed's foundation. | `buildBom` |

| BOM item | Quantity |
|---|---|
| Joist hanger, `<joist>` | `hangers`. |
| Deck ledger lag screw, 1/2" | `ledgerLags`. |
| Beam seat, `<plies>`-ply `<joist>` | `seats`, at the post cap price. Note: "On each pier, under the deck beam." |
| Post base, Post cap | Deck posts count with the lean-to posts. |

The "Decks and ramps" sheet (`deckPlan` in `sheets.ts`) draws the deck framing and its posts in plan,
without the boards, with one note per deck. The clear height under the roof beam starts at the deck
surface, not at grade.

| Trigger | Warning | Result |
|---|---|---|
| `deckBeamBottom < grade` | "The deck framing runs D below grade." | Built. |
| On the shed's foundation, a notch deeper than 1/4 of the joist depth | "The deck joists are notched D at their bearings, more than 1/4 of their depth. A smaller deck joist needs less." | Built. |
| 5/4 boards on joists more than 16 in apart (2x6 boards: 24 in) | "5/4x6 deck boards span 16" at most; the joists are N" apart." | Built. |
| A gable-end deck with no shed line under it | "No shed skids run under the deck. It gets its own at its ends." | Built, with its own lines. |

### Decisions

| Decision | Reason |
|---|---|
| The deck beam is a flush beam. | The deck is one joist deep plus a board. A skid shed's floor is only about 12 in above grade: 11-23/32 in for the 8x10 preset on 4x6 skids. A beam under the joists would put the deck framing in the ground. |
| The beam lies on the post line, wide enough for the full post. The piers carry it, and the lean-to posts stand on it over each pier. | Each load runs straight down. |
| A deck post goes under the beam only when it is at least 12 in long. Else the pier rises or stops to meet the beam. | `MIN_POST` is the shortest post the lean-to builds with no warning. |
| A deck can stand on the shed's own foundation, continued. On a gable end the user picks a continued run or separate pieces. | The user asked for both. A continued skid makes one sled; separate pieces let the deck come off. |
| On the shed's foundation the deck keeps the chosen joist size. Its joists are notched at their bearings to reach the drop, with a warning past 1/4 of their depth. | The user asked for a flush or lower deck, with notched joists where needed. |
| Deck boards default to 5/4 decking. Ramps keep 2x6. | Thinner decking sets the deck lower; a ramp carries heavier loads, such as a mower. |

### Change it safely

- The deck joists, ledger, beam plies, and the beam seat share `deck.joist`. A separate beam size
  needs a config field, a span check change, a BOM label change, and a prune rule.
- The pier top and the post base depend on the deck heights. Compute them before the posts and
  piers, as `frameLeanTo` does.
- Keep `LeanTo.deck` in step with the members.

## 3. Ramps

`frameRamps(config, framing)` builds each `ramps` entry from the floor surface at a wall down to its
foot. The foot is at grade, or `belowGrade` under grade for lower ground beside the shed, such as a
drive beside a slab. A ramp is wood or concrete.

### Config

`ramps[]` (the zod `ramp` in `config.ts`).

| Field | Values (default) | Meaning |
|---|---|---|
| `opening` | `{ row, index }` (0–999 each), or `null` (`null`) | The opening to follow: `openings[row].at[index]`. `null`: a free ramp. |
| `margin` | 0–48 (6) | Ramp width past the RO on each side. Follows an opening only. |
| `wall` | `front`, `back`, `left`, `right` (`front`) | Free ramp only. |
| `along` | `percent`, `left`, `right` (`percent`) | As for an opening: the ramp center at a percent, or a corner to the near edge. Free ramp only. |
| `at` | 0–100 for `percent`; any number for `left` and `right` (50) | Position. A negative `at` puts the ramp past the corner. Free ramp only. |
| `width` | 12–480 (48) | Free ramp only. |
| `slope` | 1–12 (4) | Run per unit of rise. |
| `belowGrade` | 0–48 (0) | Grade to the ramp's foot. |
| `material` | `wood`, `concrete` (`wood`) | Wood: 2x6 boards on stringers. Concrete: a wedge over a base. |
| `stringer` | 2x4–2x12 (2x6) | Wood only. |
| `oc` | 12, 16, 19.2, 24 (16) | Stringer spacing. Wood only. |
| `thickness` | 3.5–12 (4) | Concrete base under the foot. Concrete only. |

`pruneConfig` drops these ramp fields:

| Ramp | Dropped |
|---|---|
| Follows an opening | `wall`, `along`, `at`, `width` |
| Lost (`rampPlace` gives `lost`) | `margin`. It keeps its own place, and `opening` for the warning. |
| Free | `opening`, `margin` |
| Concrete | `stringer`, `oc` |
| Wood | `thickness` |

`compactDesign` lists no key that a ramp must keep. A ramp at its defaults that follows an opening
saves as `{ "opening": { "row": 0, "index": 0 } }`.

### Placement

`rampPlace(config, ramp)` returns `RampPlace`: `wall`, `left` and `right` (from the wall's left
corner, seen from outside), `opening` (a label, or `null`), and `lost`. `frameRamps`,
`withOpeningRow`, `withoutOpeningRow`, `pruneConfig`, and `RampsEditor` all place ramps through it.

| Mode | Condition | Wall | Edges |
|---|---|---|---|
| Follows an opening | `opening` is set. The row, the position, and the row's opening type exist. | The row's `wall` | RO left − `margin` to RO right + `margin`. RO left is `roOffset(row.along, position, wallSpan, type.width)`. |
| Free | `opening` is `null`. | `wall` | `left = roOffset(along, at, wallSpan, width)`, `right = left + width` |
| Lost | `opening` is set, but the row, the position, or the type is gone. | `wall` | As free. `lost: true`, and a warning. |

The opening label comes from `openingLabel`, for example "shed door 64x76 (left 50%)". A free or
lost ramp has `opening: null`.

`rampPlace` reads the opening at each build. A ramp that follows an opening thus moves and resizes
with it, and goes with it to another wall. `rampPlace` does not read the row's `enabled` or `sill`.
A ramp can follow a row that is not framed; the editor labels that choice ", not framed". A ramp
may run past a wall corner.

A ramp stores a reference, so the opening row edits must keep it true. Two functions do this for
`OpeningsEditor`. Each frees a ramp that loses its opening at the place where it stood.

`withOpeningRow(config, index, next)` replaces row `index` with `next`. For a ramp that follows that
row:

1. When `next` has as many positions as the old row, the ramp keeps its index. It follows its
   position by place, so a moved position takes the ramp with it.
2. Else, when the old position's value is in `next.at`, the ramp follows that value's index.
3. Else, when its index is still in `next.at`, it keeps the index.
4. Else, `rampPlace` on the old design gives its place, and the ramp becomes free there.

Example (`tests/ramps.test.ts`): a ramp follows the door at 75 % of `[25, 75]`.

| New `at` | Result |
|---|---|
| `[75]` | Index 0: the same value. |
| `[25, 80]` | Index 1: the moved position. |
| `[20, 50, 80]` | Index 1: no value match, the index fits. |
| `[25]` | Free, `along: 'left'`, `at` 34, `width` 76: where it stood. |

`withoutOpeningRow(config, index)` removes opening row `index` and keeps every ramp where it stands:

1. A free ramp, or a ramp that follows an earlier row, does not change.
2. A ramp that follows a later row gets `row − 1`, so it follows the same opening.
3. For a ramp that follows row `index`, `rampPlace` on the old design gives its place. The ramp
   becomes free: `opening: null`, that `wall`, `along: 'left'`, `at: left`, `width: right − left`.

`OpeningsEditor` calls it when the user removes a row. In `RampsEditor`, the choice "No opening:
placed below" does step 3 for one ramp. A ramp freed at a corner can get a negative `at`. A new
ramp follows the first position of the first row with `sill` 0, if one exists.

### Height

- `foot = grade − belowGrade`, and `rise = −foot`: the floor surface to the foot.
- The slope angle is `atan(1 / slope)`.

### Wood

Stringers: role `stringer`, code `S`, size `stringer`, PT.

1. Stringer top: `top(x) = −(x − face) / slope − 1.5 / cos`, with `face = 0`: the floor framing, or
   the slab edge, which the wall sheathing does not cover. The
   ramp surface falls 1 in `slope` from the floor at `face`. The stringer top lies one board
   thickness, square to the slope, under it.
2. `toe = face + slope × (rise − 1.5 / cos)`: where the stringer top reaches the foot.
3. Vertical depth: `deep = stringer width / cos`.
4. The stringer shape has four corners: `[face, top(face)]`, `[toe, foot]`, `[toe, foot − deep]`,
   and `[face, top(face) − deep]`. `clipBelow` cuts it at `z = foot`: a level cut at the foot.
5. Layout: the o.c. rule across `[left, right]` at `oc`.
6. Cut length: `(rise − 1.5 / cos) × √(1 + slope²)`.
7. Note: "Plumb cut θ at the floor framing, lagged to it. Level cut on grade." On a slab, the first
   sentence is "Plumb cut θ at the slab edge, anchored to it." With `belowGrade` over 0, the last
   sentence is "Level cut on the foot, D below grade."

Boards: role `decking`, code `B`, 2x6, PT.

1. Surface length: `slopeLength = slope × rise / cos`.
2. `rows = ⌊(slopeLength + 0.25) / 5.75⌋`: whole boards only, 1/4 in apart.
3. Row `r` starts `r × 5.75` down the slope from the floor line at the framing face. The top
   board is level with the floor at the wall.
4. Each row runs along the wall from `left` to `right`, spliced at stringer centers.

The gap at the foot is less than one board and one gap.

Example (`tests/ramps.test.ts`): the 8x10 preset on 4x6 skids has its floor 11-23/32 in above grade.
A ramp that follows the 64 in left-wall door, with the 6 in margin, is 76 in wide. At 1 in 4 it has
6 stringers and 8 boards.

### Concrete

1. `run = rise × slope`, and `base = foot − thickness`.
2. One panel solid lies in the vertical plane square to the wall. Its origin is at the wall framing
   face (x = 0), at floor level. `u` points outward, `v` up, and `thick` is the ramp width.
3. Outline: `[[0, 0], [run, foot], [run, base], [0, base]]`. The surface falls from the floor to
   the foot, over a flat base `thickness` under the foot.
4. The wedge starts at the framing face, as a wood ramp does.
5. Label "Concrete ramp", layer `ramps`, material `concrete`, code `C`.

Example (`tests/ramps.test.ts`): 6 in of rise at 1 in 4 gives 24 in of run. On a 4 in base and
76 in wide, the ramp takes 7.4 cu ft: 13 bags of 80 lb mix.

### Left out

| Material | Trigger | Message |
|---|---|---|
| Wood | `rise < 1.5 / cos + 0.01`: no room for a stringer under the boards. | "The floor is R above the ramp's foot, too low for stringers under the boards." + `LEFT_OUT` |
| Concrete | `rise < 0.01` | "The floor is R above the ramp's foot, so the ramp has no rise." + `LEFT_OUT` |

The red outline lies at floor level, from the framing face out 24 in, across the ramp's width.
Example: a slab shed has its floor at grade, so a ramp with `belowGrade` 0 is left out. A foot 6 in
below grade gives it 6 in of rise.

### Outputs

| Output | Content |
|---|---|
| Cut list | Assembly `ramp`, marks `RP-n`. |
| BOM | "Ramp lag screw, 1/2"": 2 per stringer. "Concrete, ramp" or "Concrete, N ramps": the panel volume in cu yd, and 80 lb bags at 0.60 cu ft each. Under 1 cu yd it prices bags; above, ready-mix. |
| Drawings | "Decks and ramps" (`deckPlan`): stringers and concrete in plan, one note per ramp. That sheet and the foundation plan draw a left-out ramp in red. |
| 3D | Layer `ramps` ("Ramps"). |
| Span checks | None. |

### Decisions

| Decision | Reason |
|---|---|
| A ramp that follows an opening stores a reference: the row index, and the position index in that row's `at` list. | It follows moves, resizes, and wall changes. No copy of the opening's numbers goes stale. |
| When the user removes the opening row, or the position it follows, the ramp stays where it stood, as a free ramp. | The user keeps the ramp in its place. |
| A ramp may run past a wall corner. | The app never limits the user. |
| A ramp can run below grade to a foot, and it can be concrete. | Lower ground beside the shed, such as a drive beside a slab. |
| A ramp with too little rise is left out in red. | Its stringers would collide with its boards. Concrete needs some rise. |
| Whole boards only, from the top down. | The top board is level with the floor at the wall. |

### Change it safely

- Place every ramp through `rampPlace`. Do not read `ramp.wall` or `ramp.at` directly.
- Send every opening row edit through `withOpeningRow` or `withoutOpeningRow`. A new edit that
  reorders rows must remap `ramp.opening` the same way.
- A ramp becomes lost only when its opening changes outside those two functions, for example in a
  hand-edited file.
- Tests: `tests/ramps.test.ts`. The fixtures `8x12-odd-openings` (a free ramp, 2x8 stringers at
  12 in), `12x12-with-lean-tos` (concrete, below grade), `10x16-loft-shed`, `12x16-lean-to-studio`,
  and `20x24-heavy-snow` cover the rest.

## 4. Sheathing

`frameSheathing(config, members, openings, planes, deck)` returns sheet solids. Each solid is one
piece of one 48 × 96 in sheet, cut to fit. Its joints land on framing where framing is in reach.
`buildModel` calls it last, so it sees the lean-to members and roof planes.

### Faces

| Surface | When | Origin, `u`, `v` | Region | Supports (joint positions) | Sheet along `u` × `v` | Stagger | Smallest piece height | Ids, label | Layer |
|---|---|---|---|---|---|---|---|---|---|
| Each wall | `walls.sheathing` is not `none` | Wall frame origin, `frame.u`, up | `wallFace` | Centers of the vertical flush members, jacks left out | 48 × 96 | no | 3 in | The `wall.<side>` prefix, for example `FW-SH01`. "Wall sheathing, 7/16" OSB" | `sheathing` |
| Each roof plane with `sheathed` | `roof.sheathing` is not `none` | The plane's `origin`, `u`, `v` | `length × width` | Rafter centers of the plane's `assembly` | 96 × 48 | yes | 0 | `RF-SH01`, … "Roof sheathing, …" | `sheathing` |
| Subfloor | Any `joist.floor` or `joist.end` | `[0, 0, −thick]`, x, y | `config.length × config.width` | Joist centers along x | 96 × 48 | yes | 0 | `FL-SF01`, … "Subfloor, …" (`floor.subfloor`) | `floor` |
| Loft deck | `frameRoof` returns a `deck` | `[0, 0, deck.bottom]`, x, y | `deck.min` to `deck.max` | Centers of the `loft` members that run front to back | 96 × 48 | yes | 0 | `LF-DK01`, … "Loft deck, …" (`roof.loft.deck`) | `loft` |

Holes: each wall takes the ROs on it, gable openings included. The loft deck takes `deck.holes`:
the hatches and the open end. The roof and subfloor have none.

All roof planes share one `RF` id counter, so lean-to roof sheets are `RF-SH` too. A slab shed has
no floor joists, so it has no subfloor. Each panel extrudes `thick` along `u × v`: outward from the
wall framing, up from the floor and loft, and out of the roof.

### `wallFace`

`wallFace(config, wall, frame, members, openings, thick)` returns the `Face` of one wall:

1. Flush members are the members of a `wall`, `gable`, `knee`, or `loft` assembly that lie in the
   wall. Their outer face is at the wall's framing face (within 0.01 in). Their inner face is within
   the stud depth.
2. Their corners, projected to `(u, z)`, give `low` and `high`.
3. An eave wall adds a point at `−thick` and at `span + thick`, at `low` and at `high`. Its sheets
   reach `thick` past each corner to cover the end-wall sheet edges.
4. An end wall adds `(0, low)`, `(span, low)`, and the top of each eave wall at its corners.
5. The region is the convex hull of all these points.
6. The supports are the `u` centers of the vertical flush members, except `jack`.
7. The holes are the ROs on the wall.

`low` is the bottom of the flush framing, at the wall's base (z = 0). The wall sheets do not reach
down over the floor framing. `finishes.ts` calls `wallFace` too, for the siding.

### `panels`

`panels(face, sheet, nextId, code, label, layer)` lays the sheets on one face:

1. Take the smallest box that holds the region.
2. Lay rows from the bottom, each `across` tall. The last row ends at the top.
3. The first piece of a row is `along` long, or `along / 2` on odd rows when `stagger` is set.
4. A hole that spans the full row height and covers a row end moves that end to the hole's edge.
5. `sheetJoints` splits the row into pieces.
6. Each piece is its rectangle less the holes (`subtract`), clipped to the region (`clip`).
7. Keep each outer loop with an area over 1 sq in and a height of at least the face's `minRow`.
   A hole loop goes to the outer loop that holds its first point.
8. Each kept loop is one `Solid`: material `sheet`, the `sheet` key, and a `panel` shape with the
   sheet thickness.

`sheetJoints(start, end, first, max, supports)` gives the pieces of one row:

1. Start with `limit = first`.
2. While the rest of the row is longer than `limit`, find the supports within `limit` of the last
   joint.
3. Of those, prefer the supports that leave at least 12 in (`MIN_PIECE`) to the row end.
4. The joint goes on the farthest one. With no support in reach, it goes at `limit`, off framing.
5. After the first piece, `limit = max`.

Examples (`tests/sheathing.test.ts`):

- The 8x10 front wall has supports at the studs and the window kings. Its pieces run −7/16 to
  45-3/4, 45-3/4 to 80, and 80 to 120-7/16.
- A staggered roof row over rafter centers gives 0 to 32, 32 to 104, and 104 to 136. A joint at
  127-1/4 would leave 8-3/4 in, so it drops to 104.

`subtract(rect, holes)` cuts a rectangle on the grid of all hole edges. It returns outer loops
counterclockwise and hole loops clockwise, with in-line points dropped. `clip` keeps the part of a
loop inside the convex, counterclockwise region, one region edge at a time (`clipBelow`).

### Sheet count

`buildBom` (`sheetGroups`) counts sheets by sheet key. It cuts each panel from the rectangle around
it, then packs the rectangles onto 48 × 96 sheets by shelves, with `catalog.kerf` (`packSheets`).
It lists the uses by the label text before the first comma: "Wall sheathing", "Roof sheathing",
"Subfloor", "Loft deck", and "Break gusset" and "Peak gusset" for a gambrel's gussets from `frameRoof`. Each group gives the
count, the uses, the waste, and the cost.

### Decisions

| Decision | Reason |
|---|---|
| Each joint lands on framing when a support is in reach. | A sheet edge needs framing to nail to. |
| No wall joint on a jack. | A joint there leaves a sliver of sheet beside the RO. |
| Wall sheets stand 48 in wide and 96 in tall from the bottom of the wall. A piece under 3 in tall is left off. | The sheets end on the top plates. |
| Eave-wall sheets reach past the corners. End-wall sheets reach the eave walls' tops at the corners. | The eave-wall sheets cover the end-wall sheet edges. |
| Roof, subfloor, and loft deck sheets run their long edge across the framing. Odd rows start with a half sheet. | The end joints of two rows do not line up. |
| A lean-to roof uses `roof.sheathing`. | The config has one roof sheet field. |

### Change it safely

- `panels` needs a convex, counterclockwise region. `wallFace` takes the convex hull, so a concave
  wall outline fills in.
- The BOM groups uses by the label text before the first comma. Keep labels as "Use, sheet label".
- A change to `wallFace` also moves the siding in `finishes.ts`.
- `sheetJoints` and `subtract` have unit tests in `tests/sheathing.test.ts`.

## 5. Finishes

`buildFinishes(config, model)` returns `FinishPart[]` for the 3D view only. It reads the config and
the model and writes nothing back. The cut list, BOM, drawings, and span checks never read the
parts. The user decided that finishes are for looks and need not be engineered. The parts are
simple shapes, with no fasteners or furring. The only flashing is at a gambrel's break.

Finishes do not read the lean-tos or ramps. In 3D the siding takes the same space as a lean-to
ledger, a deck ledger, or the top of a ramp stringer.

### Config

`finishes` (the zod `finishes` in `config.ts`).

| Field | Values (default) | Meaning |
|---|---|---|
| `siding` | `none`, `lap`, `t1-11`, `board-batten` (`lap`) | Siding look. `none` also removes the corner boards and casings. |
| `sidingColor` | `#rrggbb` (`#b8a58a`) | Siding. |
| `trimColor` | `#rrggbb` (`#f4f1ea`) | Corner boards, casings, jambs, window frames. |
| `roofColor` | `#rrggbb` (`#4f5357`) | Shingles, metal panels, ridge caps. |
| `doorColor` | `#rrggbb` (`#7d3a2c`) | Doors and garage doors. |
| `panelLength` | 48–480 (120) | Longest metal roofing panel. |
| `metalOverhang` | 0–12 (2) | Metal roofing past the eave. |

Other config it reads: `walls.sheathing`, `walls.stud`, `roof.sheathing`, `roof.roofing`
(`shingles`, `metal`, `metal-over-sheathing`), `roof.purlin`, `roof.pitch`, each
lean-to's `purlin`, and each opening type's `kind`. `pruneConfig` drops `sidingColor` with no
siding, and `panelLength` and `metalOverhang` when no roof is metal.

### Types

| Type | Content |
|---|---|
| `FinishPart` | `layer` (`siding`, `roofing`, or `openings`), `look`, `color`, an optional `tile`, and a `shape`. |
| `Look` | `lap`, `t1-11`, `board-batten`, `shingles`, `planks`, `garage` (textures), and `plain`, `glass`, `metal`. |
| `tile` | The texture's repeat along `u` and `v`, in inches. |
| `shape` | A `Panel`, an axis-aligned box, or a `Corrugated` panel: `origin`, `u` (across the waves), `v`, `length`, `width`. |

### Siding and trim

Siding, one panel per wall:

1. The siding face is `sheath + SIDING`: the wall sheet thickness plus 1/2 in.
2. `wallFace` with that thickness gives the region and holes. The eave walls reach past each corner
   by the full siding face.
3. The bottom is the lowest `floor` member, or 0: the siding laps down over the floor framing.
4. The panel outline is the hull of the region and two points at the bottom. Its holes are the ROs.
5. The panel is 1/2 in thick, outside the sheathing, with the `siding` look and its tile.

Corner boards: at each corner, two 3/4 in boards run from the siding bottom to the top of the eave
wall there. A 3-1/2 in board lies on the end wall. A 4-1/4 in board on the eave wall laps its edge.

Casings: 3-1/2 in wide and 3/4 in thick, on the siding face, around each RO. A window or custom
opening gets a full frame. A door or overhead door gets the sides and head only, down to the RO
bottom.

### Roofing

Each `RoofPlane` gets roofing:

| Plane | Metal when | Roofing sits on |
|---|---|---|
| Main roof | `roof.roofing` is not `shingles` | The sheets when `sheathed`, plus the `roof.purlin` thickness when metal. |
| Lean-to | `sheathed` is `false` | The lean-to `purlin` thickness. |

Shingles: one panel over the whole plane, 0.3 in thick, tile 36 × 10 in.

Metal: `Corrugated` panels.

1. Columns run from the plane's `u` origin along the eave, 24 in of cover each. A panel is 26 in
   wide for the side lap; the last is cut to fit.
2. Rows run up the slope. The first starts `metalOverhang` below the low edge, or at it when
   `plane.eaves` is 0.
3. Each panel is at most `panelLength` long. The next row starts 6 in (`END_LAP`) below the top of
   the panel under it.
4. Each lap sits a little higher: 0.02 in on odd columns and 0.06 in per row, so the laps show.
5. The corrugation has 9 waves per 24 in cover (`WAVE` = 2-2/3 in), 1/2 in deep (`DEPTH`).

Example (`tests/finishes.test.ts`): a 136 in plane with `panelLength` 48 gets five 26 in panels and
one 16 in panel across. Up the slope it gets a 48 in panel, then the rest from 6 in below its top.

Ridge cap, on the planes with `ridge`: a gable roof's two planes, a gambrel's two upper planes.

- Metal: one vented cap along the ridge, above the panel crests, on the first plane with `ridge`.
  Its flanges reach 8 in down each slope, its risers stand at 3 in, and its peak is 1-1/4 in up. It
  is 1/8 in thick. A dark vent gap shows on each riser. Its slope is `roof.pitch`: the upper pitch
  on a gambrel.
- Shingles: a 6 in strip, 1/4 in thick, at the top of each plane.

Lean-tos, lean-to main roofs, and a gambrel's lower planes get no ridge cap.

Break flashing, on each plane with `breakEdge`:

- A `plain` strip in `roofColor`, 1/16 in thick, across the full plane `length`.
- It covers the plane's top 4 in (`FLASH`) on a `high` edge, and its bottom 4 in on a `low` edge.
- It lies on top of the roofing: on the metal crests (`DEPTH`, 1/2 in), or on the shingles (0.3 in).
- It is 3D only. The BOM has no line for it.

### Doors and windows

Layer `openings` ("Doors and windows"). The kind comes from the opening type by name; an unknown
name counts as `custom`.

| Kind | Parts |
|---|---|
| `window`, `custom` | A frame 2 in wide (`SASH`) through the wall, from its inside face to the sheathing face. Glass 1/8 in thick, 1 in inside the framing face. A 1-1/2 in meeting rail at mid height. |
| `door` | Jambs 3/4 in thick at the sides and head, through the wall. One leaf, or two leaves when the RO is wider than 50 in (`PAIR`), 1/8 in apart. Each leaf is 1-3/4 in thick, with the `planks` look and 1/8 in clearance in the jambs, 1/2 in above the RO bottom. A 1-1/2 in knob, 36 in above the RO bottom, 3 in from the latch edge. |
| `overhead` | The same jambs. One 1-3/4 in slab with the `garage` look. Its tile is a quarter of its width and height: four sections each way. |

### 3D view

`FramingScene` (`scene.ts`) draws each part:

- `drawLook` paints one tile of each texture in grays, at 8 px per inch. The material tints it with
  the part's color and uses it as a bump map too, at scale 1.5. The repeat is `1 / tile`.
- Glass is transparent at 0.35 opacity. Metal has metalness 0.55 and shows both sides.
- A `Corrugated` panel is a cosine wave mesh, with an outline along its crests.
- In the finished view, fascia and fly rafters take the trim color.

### Decisions

| Decision | Reason |
|---|---|
| Finishes are visual only. They never change the framing, cut list, BOM, drawings, or span checks. | The user wants the look. Finishes need not be engineered. |
| Siding follows `wallFace`, the same face as the wall sheets. | The siding matches the walls, gables, and openings with no second outline. |

### Change it safely

- Never let `src/core/out` or `src/drawings` read `FinishPart`.
- A new look needs a `Look` value, a `TILES` entry when it repeats, and a `drawLook` case in
  `scene.ts`.
- A new finish field needs a prune rule when it applies only with some choice.
- Tests: `tests/finishes.test.ts` counts the parts of the 8x10 preset and of a metal roof. It also
  checks the break flashing and the cap order on a metal gambrel.

## 6. Warnings and left-out parts

No warning stops the build. Sheathing and finishes give no warnings.

| Source | Trigger | Message | Result |
|---|---|---|---|
| Lean-to | The extent passes a wall corner. | The lean-to runs past the ends of the wall. It stops at the corners. | Built, cut to the corners. |
| Lean-to, soffit | The plumb end is deeper than a 2x12. | A 2x12 ledger is shallower than the rafter's P plumb end. | Built on a 2x12. |
| Lean-to | The 1/3 notch limit gives a seat under 1-1/2 in. | A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 of the R rafter. Use a deeper rafter or a lower pitch. | Built with a 1-1/2 in seat. |
| Lean-to, below the soffit | No soffit limit: the main roof does not reach past the wall sheet face, so `ledgerTop` is not finite. | The main roof does not reach past the wall here, so the ledger has no height. Give the main roof an overhang on this side. | Left out: red footprint at grade. |
| Lean-to | `heel − seat ≤ max(start, 0)`: the seat reaches the rafter's upper end or the wall. | The lean-to is too shallow for its beam. Make it deeper. | Left out: red footprint at grade. |
| Lean-to | Post length under 0.01 in. | The beam is at or below the post bases. Lower the pitch or the drop, or make the lean-to shallower. | Left out: red footprint at grade. |
| Lean-to | Post length under 12 in. | The posts are only L long. | Built. |
| Lean-to | Clear height under the beam under 80 in. | The clear height under the beam is H, less than 6' 8". | Built. |
| Lean-to, extension | The main-wall notch is deeper than the 1/3 limit. | The birdsmouth on the main wall cuts deeper than 1/3 of the R rafter. Use a rafter no deeper than the main rafters. | Built. |
| Lean-to, extension | The upper ends stand over 1/8 in above the main roof plane. | At the steeper pitch the lean-to rafters stand S over the main roof plane at their upper ends. Trim them flush. | Built. |
| Lean-to, extension | At the framing face, the underside is more than 0.01 in over the main wall's plate (`gap`). | The lean-to rafters pass G over the main wall's plate. Block under each one. | Built, with no main-wall birdsmouth. |
| Lean-to deck | The deck beam bottom is under grade. | The deck framing runs D below grade. | Built. |
| Ramp N | The opening it follows is gone. | The opening it follows is gone. It stands at its own position. | Built at its own `wall`, `along`, `at`, and `width`. |
| Ramp N, wood | `rise < 1.5 / cos + 0.01` | The floor is R above the ramp's foot, too low for stringers under the boards. + `LEFT_OUT` | Left out: red outline at floor level, 24 in deep. |
| Ramp N, concrete | `rise < 0.01` | The floor is R above the ramp's foot, so the ramp has no rise. + `LEFT_OUT` | Left out: red outline at floor level, 24 in deep. |

A left-out lean-to draws in red in 3D and on the roof framing plan. A left-out ramp draws in red in
3D, on the foundation plan, and on the "Decks and ramps" sheet.
