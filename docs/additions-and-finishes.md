# Lean-tos, ramps, sheathing, and finishes

This document covers the parts outside the main shed frame: lean-tos and their decks, ramps, sheet
goods, and the 3D finishes. Read [DEVELOPER.md](DEVELOPER.md) first for the conventions and the
build order. `config.ts` gives each field, its default, and its range. The cross-field rules and
the prune rules are in [design-model.md](design-model.md) "Cross-field rules" and "Prune".
All lengths are inches.

| File | Builds | Called by |
|---|---|---|
| `src/core/gen/additions.ts` | Lean-tos: ledger or roof extension, rafters, beam, posts, piers or slab, fascia, purlins, roof planes, and the `LeanTo` facts. | `buildModel`, after `frameRoof` |
| `src/core/gen/deck.ts` | Lean-to decks: `deckHeights`, `frameDeck`, and the facts the floor and prune share: `onShed`, `deckReach`, `continuedDecks`. | `frameLeanTo`. `frameFloor` reads `continuedDecks`; `pruneConfig` and `AdditionsEditor` read `onShed`. |
| `src/core/gen/ramps.ts` | Ramps: placement, wood stringers and boards, or a concrete wedge. | `buildModel`, after `frameAdditions`. `RampsEditor` and `pruneConfig` call `rampPlace`. `OpeningsEditor` calls `withOpeningRow` and `withoutOpeningRow`. |
| `src/core/gen/sheathing.ts` | Wall, roof, subfloor, and loft deck sheets. | `buildModel`, last |
| `src/core/gen/finishes.ts` | Siding, trim, roofing, doors, and windows, for the 3D view only. | `App.tsx` (`useMemo`), then `FramingScene` |

## Terms

Other terms (ledger, birdsmouth, seat, heel, purlin, PT, RO, o.c.) are in
[framing.md Terms](framing.md#terms).

| Term | Meaning |
|---|---|
| Soffit | The underside of the main roof's overhang outside a wall: the rafter undersides, then the fascia's bottom edge. |
| Flush beam | A beam whose top is level with the joist tops. The joists hang from it in hangers. |
| Stringer | A sloped board that carries the ramp boards. |
| Broken pitch | A lean-to extension at a pitch different from the main roof's. |
| Tributary width | The width of roof or deck that one beam carries per unit of its length. |
| Grade | The ground level, from `gradeOf` ([framing.md](framing.md) "Grade"). |

## Common rules

| Topic | Rule |
|---|---|
| Wall coordinates | Lean-tos and ramps place points with `at(u, x, z)`: `u` along the wall's `Frame` ([framing.md](framing.md) "Wall frames"), `x` out from the wall's framing face, `z` up from the floor surface. |
| Wall sheet face | `x = wallSheet`: the `walls.sheathing` thickness, or 0 for `none`. The lean-to ledger stands on it. The deck ledger and ramps bear on the floor framing at `x = 0`, which the wall sheathing does not cover. |
| Sloped members | `planeMember` ([framing.md](framing.md) "`planeMember`") builds rafters and stringers from an outline in the vertical plane square to the wall, with `dir = [cos, -sin]`: down the slope, outward. |
| O.c. layout | Soffit lean-to rafters, deck joists that run out from the wall, and ramp stringers share one rule. One piece is flush with each end (`u0` and `u1 − 1.5`). One more piece centers on each multiple of `oc` from `u0` where it does not overlap an end piece. |
| Splices | `splitPlate` ([framing.md](framing.md) "Plates and splices") splices each long run over a support: the ledger, fascia, and purlins at rafter centers; the beams at post centers, or at joist or line centers on the shed's foundation; the deck ledger and boards at joist centers; the ramp boards at stringer centers. |
| Ids and layers | `idMaker` with the assembly prefix: `AF`, `AB`, `AL`, `AR` for the lean-tos (`addition.<side>`, layer `additions`), `RP` for ramps (`ramp`, layer `ramps`). Example: `AF-R01`. |
| Warnings | `source` is the user's side name plus "lean-to", for example "Front lean-to", or "Ramp N". A left-out part follows "Left out" in [DEVELOPER.md](DEVELOPER.md#conventions). |

## Main roof facts

`frameRoof` (`roof.ts`) returns three facts that this document's generators read. `roof.ts` gives
the `RoofPlane` fields.

| Fact | Content | Read by |
|---|---|---|
| `soffit` | `under(wall, u, x)`: the height of the main roof's underside `x` out from the wall's framing face, at `u` along it, or `null` past the roof edge. `breaks(wall)`: the `x` values where `under` changes course, nearest first. | `frameAdditions`: the ledger height of a soffit lean-to |
| `eave` | At a downhill eave's wall: `top`, the rafter top over the framing face; `plate`, the bearing plate's top; `bearing`, the wall stud depth, or the knee-wall stud depth on a raised roof; `pitch`, `eavePitch(roof)`; `lap`, how far in from the framing face the main rafter sides are clear. On a gambrel, `lap` is `run − 12 × cos(lower)`, where the gussets start, with `run` the break's run in from the framing face; else `Infinity`. | `frameAdditions`: an extension, and `pitch: 'main'` on any lean-to |
| `planes` | One `RoofPlane` per slope of each roof side. `frameAdditions` adds one per lean-to. | `frameSheathing`, `buildFinishes`, the BOM roofing lines |

| Wall | `x` range | `Soffit.under` |
|---|---|---|
| Eave wall | 0 to `roof.eaveOverhang` | The main rafter underside at that point, or a plumb-and-level tail's level cut where it is higher. |
| Eave wall | To `eaveOverhang` + fascia thickness | The fascia's bottom edge: the rafter top at the tail less the fascia drop and depth ([framing.md](framing.md) "Purlins and fascia"). |
| Gable end | 0 to `rake` | The rafter underside over that point along the wall, level across the rake. Of the end rafter, lookouts, and fly rafter, the rafter line is the lowest. |
| Any | Past the last break | `null` |

`rake` is `roof.rakeOverhang`, or 0 under 1-1/2 in ([framing.md](framing.md) "Silent
rules"). The breaks are `[0, eave, eave + fasciaThick]` on an eave wall, with the level cut's start
before `eave` on a plumb-and-level tail, and `[0, rake]` on a gable
end. `under` reads the profile's underside, so on a gambrel it follows the lower slope at an eave
wall and both slopes across a gable end.

## 1. Lean-tos

`frameAdditions(config, main, framing)` builds each `additions` entry against one wall. With
`mirror`, it builds a second copy on `OPPOSITE[side]` at `100 − center`. The `u` axis runs the other
way on the opposite wall, so the copy stands at the same x (or y) as the first. Each copy is open on
its three outer sides and stands on its own posts.

| `attach` | Roof support at the wall | Where |
|---|---|---|
| `soffit` | Own rafters from a ledger below the main roof's soffit. | Any side, full or partial length. |
| `extension` | Rafters lap the main rafters at a downhill eave and continue the main roof's top line. The main eave overhang on that side goes. | A downhill eave, full length only ([design-model.md](design-model.md) "Cross-field rules"). |

### Extent along the wall

- `span` is the wall length: `config.length` for front and back, `config.width` for left and right.
- A full lean-to runs from `u0 = 0` to `u1 = span`. A partial lean-to is `length` long, centered at
  `center` % of `span`.
- An extent that passes a corner by more than 0.01 in stops at the corner, with a warning.

### Roof line

The rafter top is `top(x) = anchorZ − rise × (x − anchorX)`, with `rise = pitch / 12`. The underside
is `bottom(x) = top(x) − plumb`. `plumb = rafter depth / cos` is the rafter's vertical depth.

Below the soffit (`attach: 'soffit'`):

| Quantity | Rule |
|---|---|
| `start` | `wallSheet + 1.5`: the ledger's outer face, where the rafters' plumb ends bear. |
| `roofSheet` | The layer under the roofing: the `purlin` thickness for metal, else the `roof.sheathing` thickness (0 for `none`). |
| Limit | At each break `x` in `soffit.breaks(side)` and each end `u` in `[u0, u1]`: `under − CLEARANCE − roofSheet + rise × (point − start)`, with `point = max(x, wallSheet)` and `under = soffit.under(side, u, point)`. A `null` `under` gives no limit. |
| `ledgerTop` | `min(limits) − drop`. `anchorX = start` and `anchorZ = ledgerTop`: the ledger top is flush with the rafter tops at their plumb ends. |

The limit keeps the lean-to roof surface (rafter top plus `roofSheet`) `CLEARANCE`, 1-1/2 in, under
the main roof's underside. Both roofs are straight between the soffit breaks, so the breaks and the
lean-to's two ends hold the lowest limit.

The ledger is the smallest 2x (2x4 to 2x12) at least as deep as `plumb`, so the hanger takes the
full plumb cut. A plumb end deeper than 11-1/4 in gets a 2x12 and a warning.

Extension (`attach: 'extension'`):

| Quantity | Rule |
|---|---|
| Top line | Through `eave.top` over the wall's framing face: `anchorX = 0`, `anchorZ = eave.top`. At the eave pitch, `eave.pitch`, the lean-to roof is the main roof plane. |
| `start` | The upper end, inside the wall line. In the main plane: `−min(LAP, eave.lap)`, 24 in, or less on a gambrel, where the lap stops at the gussets. At a broken pitch: `−eave.bearing`, the bearing wall's inside face. |
| Ledger | None. |

### Beam, seat, and posts

| Quantity | Rule |
|---|---|
| Post line (post center) | `line = depth − post / 2`. `depth` runs to the outside of the posts. |
| Beam width | `beamPlies × 1.5`, centered on `line`. |
| Heel (the beam's outer face) | `heel = line + beamWidth / 2` |
| Seat, horizontal | `min(beamWidth, ⌊16 × rafterDepth / (3 × sin)⌋ / 16)`. The seat takes the beam width, but the notch stays no deeper than 1/3 of the rafter, square to its edge. The main roof uses the same rule ([framing.md](framing.md) "Birdsmouth seat"). A seat under 1-1/2 in stays at 1-1/2 in, with a warning. |
| Beam top | `beamTop = bottom(heel − seat)` |
| Rafter tail | `tail = max(depth + eaveOverhang, heel)`, plumb cut. |
| Post base | `postBottom`: grade on a slab; the deck beam top with a deck (section 2); else the pier top, `grade + pier.aboveGrade`. |
| Post length | `beamTop − beamDepth − postBottom` |
| Clear height | `beamTop − beamDepth −` the deck surface, or grade without a deck. |
| Posts | `count = max(2, ⌈(run − post) / maxSpacing⌉ + 1)`, with `run = u1 − u0`. The end posts are flush with the lean-to's ends; the rest are evenly spaced between. |

### Rafters

Each rafter has a plumb upper end at `start`, a birdsmouth on the beam (heel at `heel`, seat at
`beamTop`), and a plumb tail cut at `tail`.

| | Below the soffit | Extension |
|---|---|---|
| Layout | The o.c. rule over `[u0, u1]` at `oc`. | One rafter beside each main `rafter` (`roof` assembly): on its −x face, or the +x face for the rafter at x = 0. The other face carries the ties. `checkSpans` still reads `oc`. |
| Upper end | In a joist hanger on the ledger. | Nailed to the main rafter. |
| Main-wall birdsmouth | None. | Heel at the wall's framing face (x = 0), from `bottom(0)` up to `eave.plate`. The seat runs in on the plate to `seatEnd`, and stops at `start` when it would pass the upper end. |

`seatEnd = (eave.top − plumb − eave.plate) / rise`: where the underside meets the plate top. It is
negative, inside the wall line, unless the underside passes over the plate. That happens under a
steep main eave, such as a gambrel's, at a shallower lean-to pitch. `gap = rise × seatEnd` is the
underside's height over the plate at the framing face. When `gap > −0.01`, the rafter has no
main-wall birdsmouth. Over 0.01 in, its note and a warning say to block under it.

The rafter note gives the beam birdsmouth along the top edge: the heel line from the upper end, the
seat, the heel height, and the tail past the heel line. An extension note adds the lap, `−start`,
and the main-wall seat.

`frameRoof` cuts back the main roof on each side in `extensionSides`. The main rafters stop at the
wall line, plumb cut, with no tail and no fascia ([framing.md](framing.md) "Rafter layout and
tails"). That side's fly rafters, ladder rails, and purlins start at the wall line. The main roof
plane starts at the wall line, with one eave fewer; the lean-to plane covers the rest.

### Members and solids

| Role | Code | PT | Rule |
|---|---|---|---|
| `rafter` | `R` | no | As above. One piece. |
| `ledger` | `L` | no | Soffit only. `x` from `wallSheet` to `start`, top at `ledgerTop`, over `u0..u1`. |
| `beam` | `B` | no | `beamPlies` plies of `beam`, centered on `line`, top at `beamTop`. |
| `post` | `P` | yes | Centered on `line` and on each post center, from `postBottom` to the beam bottom. |
| `fascia` | `FA` | no | On the rafter tails, its top set by `roof.fasciaTop` as on the main roof ([framing.md](framing.md) "Purlins and fascia"). |
| `purlin` | `PU` | no | Metal only. Flat on the rafter tops. |

Both solids are on layer `foundation`, material `concrete`:

| Code | Shape | When |
|---|---|---|
| `PR` | A cylinder at each post, `pier.diameter` wide, up to the pier top: `grade + pier.aboveGrade`, or the deck beam bottom (section 2). The base is `min(grade, pier top) − pier.depth`. | `floor` is `none`, or `deck` on piers. A deck on the shed's foundation (`onShed`) has no lean-to piers. |
| `SL` | A box from the wall framing face out to `depth`, over `u0..u1`, `slab.thickness` thick, top at grade. | `floor` is `slab`. |

The BOM counts both with the shed's concrete ([outputs.md](outputs.md) "Concrete").

### Roofing

The lean-to's `RoofPlane` has `assembly` `addition.<side>`, `eaves: 1`, `ridge: false`, and
`sheathed` true unless `roofing` is `metal`. It runs from over the fascia,
`low = tail + fascia thickness`, up to the wall sheet face. An extension's plane runs up to the wall
line, where the main plane starts. With `roofing: 'sheathing'`, `frameSheathing` lays
`roof.sheathing` sheets on the plane (section 4).

With `roofing: 'metal'`, `gaps + 1` purlins stand evenly along the rafter top, with
`slope = (tail − start) / cos` and `gaps = max(1, ⌈(slope − purlinWidth) / purlinSpacing⌉)`. The
lowest has its lower edge at the tail, the highest its upper edge at `start`. On an extension,
`start` is inside the wall line, so the highest purlins stand over the main roof.

### Lags

Two 1/2 in lag screws go into each main-wall stud behind the ledger. The count takes each vertical
member of `wall.<side>` or `gable.<side>` whose center along the wall lies strictly between `u0` and
`u1`, and whose height range overlaps the ledger. An extension has no lags.

### `LeanTo` facts

`frameAdditions` returns one `LeanTo` per built copy, in `Model.leanTos`. `checkSpans` reads only
these facts ([outputs.md](outputs.md) "The checks"). `buildBom` reads them, and counts the
rafters, posts, and deck joists from the members ([outputs.md](outputs.md) "Hardware").

| Field | Value |
|---|---|
| `side`, `addition` | The wall of this copy, and its config entry. |
| `rafterSpan` | Horizontal, from the ledger face, or the wall's framing face for an extension, to the inner end of the seat: `heel − seat − start`, or `heel − seat`. |
| `postSpacing` | `(run − post) / (count − 1)` |
| `beamTributary` | Soffit: `(line − start) / 2 + (tail − line)`. Extension: `line / 2 + (tail − line)`. |
| `lags` | 2 per stud behind the ledger; 0 for an extension. |
| `seats` | Rafter seats per rafter: 1 on the beam, plus 1 for an extension rafter with a birdsmouth on the main wall. |
| `deck` | `DeckFacts` (section 2), or `null`. |
| `floor` | `LeanToFloor`, for ramps and stairs at the deck or slab (section 3), or `null` with no floor or a deck left out: its kind, extent `u0..u1`, `face` (the deck beam's outer face, or the slab edge), `edge` (the outer deck board's edge, or the slab edge), `top` (`deckTop`, or grade), `under` (the deck board underside, or grade), `bottom` (the deck beam's underside, or the slab's), and `inner` (the posts' inner face). |
| `posts` | The post line out from the wall, the post width, and the post centers along it. |

### Decisions

| Decision | Reason |
|---|---|
| The ledger goes as high as the main roof allows, less `drop`. | The lean-to gets the most clear height under its beam. `drop` lets the user lower it. |
| Extension rafters sit beside the main rafters, on the face away from the ties. | They lap the main rafter with no clash with the ties. |
| An extension laps 24 in in the main plane, but only to the bearing wall's inside face at a broken pitch. | At a broken pitch the two top lines meet only at the wall line, and the gap grows inward. The `stand` warning gives that gap at the upper end. |
| On a gambrel, the lap stops where the gussets start. | The gussets cover the main rafter's sides from there to the break. |
| An extension rafter that passes over the main wall's plate gets no birdsmouth there, and a warning to block under it. | A birdsmouth there would need a negative seat. |
| Lean-to piers and a lean-to slab use the main foundation's pier and slab settings, on every foundation type. | One set of pier and slab settings for the design. The form shows them on a skid or slab shed too. |

### Change it safely

- Keep `LeanTo` in step with the members. `checkSpans` reads only the facts.
- A change to the main eave or rake in `roof.ts` must keep `Soffit.under` and `breaks` true. Else the
  ledger rises into the main roof.
- An extension spans two generators. `extensionSides` drives the main roof's cut-back in
  `frameRoof`, and `frameLeanTo` adds the lap. Change both together.
- Call `leaveOut` before any member of the copy, then `return`.

## 2. Lean-to deck

`floor: 'deck'` adds a deck between the shed wall and the posts. `frameLeanTo` takes the deck's
heights from `deckHeights` and builds it with `frameDeck`. A deck stands on piers
(`deck.support: 'piers'`), or on the shed's own skids or girders (`'shed'`, see
[On the shed's foundation](#on-the-sheds-foundation)). A slab shed's deck stands on piers.
Every deck member is PT.

### Heights and supports

| Quantity | Rule |
|---|---|
| Deck surface | `deckTop = −drop` |
| Joist and beam tops | `deckJoistTop = deckTop −` the board thickness. |
| Joist and beam bottoms | `deckBeamBottom = deckJoistTop − joist depth` |
| Pier top | `natural = grade + pier.aboveGrade` when the beam bottom is at least `MIN_POST` (12 in) above it; else `deckBeamBottom`. |

The load path from the roof to the ground:

1. The lean-to posts stand on the deck beam over each pier, from the beam top to the roof beam.
2. The deck beam bears on the piers directly when the piers rise, or stop, to meet it (`seated`).
3. When 12 in or more of post fits between the natural pier top and the beam, the piers keep their
   height. A deck post then stands on each pier under the beam.

### Framing

| Part | Role, code | Rule |
|---|---|---|
| Ledger | `ledger.deck`, `DL` | `x` from 0 to `ledgerFace = 1.5`, on the floor framing. Two lags at each joist. |
| Joists | `joist.deck`, `DJ` | The o.c. rule over `[u0, u1]`, from `ledgerFace` out to `beamInner`, in hangers at both ends. |
| Beam | `beam.deck`, `DB` | A flush beam on the post line: `plies = max(2, ⌈post / 1.5 − 0.01⌉)`, enough plies to bear the post's full width (4x4: 3, 6x6: 4). It runs from `beamInner` to `beamOuter`, tops level with the joists. |
| Deck posts | `post`, `DP` | Not seated only. From the pier top to the beam bottom. |
| Boards | `decking`, `DK` | Rows along the wall, 1/4 in apart, from the framing face out until they pass `beamOuter`. |

Each board piece that crosses the post line meets the posts in one of three ways:

| Posts in the board's width | Board |
|---|---|
| None | A plain board. |
| The posts reach one edge only | One board with a notch at each post, as deep as the post reaches in (`notchedOutline`). |
| The posts cover the full width, or stand inside it | Pieces cut between the posts, none under `MIN_PIECE`. |

`notchedOutline` drops the points on a straight run, so a notch at a board end leaves no sliver.

### On the shed's foundation

With `deck.support: 'shed'` on a skid or pier shed (`onShed`), the deck joists sit on skids or
girders at the shed's own height: their top is the shed's joist bottom (`supportLines` in
`supports.ts`). Set on them, the deck surface is that top plus the deck joist depth plus the board:
`onSupports`. The deck surface is the lower of that and `−drop`. Where `onSupports` is higher, each
joist and beam is notched `deckNotch = onSupports − deckTop` up from its bottom at each bearing. A
piece that rests on a line all along, the eave side's beam or a rim over a line, is ripped by
`deckNotch` instead. A notch deeper than 1/4 of the joist depth, the usual limit at a bearing, gets
a warning. A notch as deep as the joist would cut it through: `frameLeanTo` then leaves the deck out
in red, with a warning, and the lean-to stands on piers as one with no floor. `buildModel` then
frames the floor again without that side's continued runs (`frameFloor(config, unbuilt)`), so the
shed's skids or girders keep their own length.

A gable-end deck is a box: a rim joist (`rim.deck`, `DR`) at each end runs from the wall out past
the beam, and the joists and beam run between them.

| Side | Skids or girders | Joists | Beam and posts |
|---|---|---|---|
| Eave (front or back) | The deck's own lines along the wall, the shed's size: one under the post line, the rest no farther apart than the shed's lines. Skids get both ends cut. Girders get the shed's piers, posts, and pier spacing. | Out from a ledger on the floor framing, in hangers at both ends, bearing on the lines between. | The flush beam bears on the outer line. The posts stand on it. No lean-to piers. |
| Gable (left or right), `join: 'continue'` | `frameFloor` runs each shed line under the deck on out to the beam's outer face (`continuedDecks`, `deckReach`). The run's piers spread evenly over its new length. | Along the wall, on the lines, from the wall out to the beam at `deck.oc`, spliced over the lines. No ledger and no hangers. | The beam runs along the wall on the lines, the posts on it. |
| Gable, `join: 'separate'` | The deck's own lines in line with the shed's: the inner end square against the shed's, the outer end cut. | As above. | As above. |

A gable-end deck with no shed line under it gets its own lines at its two ends, with a warning. The
boards on a gable end run out from the wall, across the joists, notched around the posts.

### `DeckFacts`

`LeanTo.deck`, a `DeckFacts`, gives the deck span checks and BOM lines ([outputs.md](outputs.md)
"The checks" and "Hardware"):

| Field | Value |
|---|---|
| `joist`, `plies` | `deck.joist`, and the deck beam plies. |
| `joistSpan` | The longest bay between bearings: ledger, lines, beam. |
| `beamSpan` | On piers: the post spacing. On a gable end: the longest bay between lines. On an eave side's outer line: 0, no check. |
| `beamTributary` | `joistSpan / 2 + (beamOuter − beamInner)`; on a gable end `oc / 2 + (beamOuter − beamInner)` |
| `seats` | The post count when the beam sits on the piers, else 0. |
| `hangers`, `ledgerLags` | 2 per joist with a ledger; 0 on a gable end on the shed's foundation. |
| `face`, `edge` | `beamOuter`, and the outer deck board's edge: the board rows on an eave side end past the beam by up to one board width. On a gable end the boards stop at `beamOuter`. |

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

## 3. Ramps and stairs

`frameRamps(config, framing, leanTos)` builds each `ramps` entry, a ramp or stairs (`kind`), down
from an upper level at a wall to a lower one. A ramp is wood or concrete, at `slope`, the run per
unit of rise. Stairs are wood, at a fixed step. The editor is in [ui.md](ui.md) "List editors".

### Placement

`rampPlace(config, ramp)` returns `RampPlace`: `wall`, `left` and `right` (from the wall's left
corner, seen from outside), `opening` (a label from `openingLabel`, or `null`), and `lost`.
`frameRamps`, `withOpeningRow`, `withoutOpeningRow`, `pruneConfig`, and `RampsEditor` all place
ramps through it.

| Mode | Condition | Wall | Edges |
|---|---|---|---|
| Follows an opening | `opening` is set. The row, the position, and the row's opening type exist. | The row's `wall` | RO left − `margin` to RO right + `margin`. RO left is `roOffset(row.along, position, wallSpan, type.width)` ([design-model.md](design-model.md) "Opening placement"). |
| Free | `opening` is `null`. | `wall` | `left = roOffset(along, at, wallSpan, width)`, `right = left + width` |
| Lost | `opening` is set, but the row, the position, or the type is gone. | `wall` | As free. `lost: true`, and a warning. |

`rampPlace` reads the opening at each build. A ramp that follows an opening thus moves and resizes
with it, and goes with it to another wall. `rampPlace` does not read the row's `enabled` or `sill`,
so a ramp can follow a row that is not framed. `RampsEditor` labels that choice ", not framed". A
new ramp follows the first position of the first row with `sill` 0, if one exists. A ramp may run
past a wall corner.

### Opening row edits

A ramp stores a reference, so the opening row edits must keep it true. `OpeningsEditor` sends each
row edit through one of two functions. Each frees a ramp that loses its opening at the place where it
stood: `rampPlace` on the old design gives `opening: null`, that `wall`, `along: 'left'`,
`at: left`, and `width: right − left`.

`withOpeningRow(config, index, next)` replaces row `index` with `next`. For a ramp that follows that
row:

1. When `next` has as many positions as the old row, the ramp keeps its index. A moved position
   takes the ramp with it.
2. Else, when the old position's value is in `next.at`, the ramp follows that value's index.
3. Else, when its index is still in `next.at`, it keeps the index.
4. Else, the ramp becomes free.

`withoutOpeningRow(config, index)` removes opening row `index`:

1. A free ramp, or a ramp that follows an earlier row, does not change.
2. A ramp that follows a later row gets `row − 1`, so it follows the same opening.
3. A ramp that follows row `index` becomes free.

A ramp freed at a corner can get a negative `at`.

### Levels

`LeanTo.floor` (section 1) gives a lean-to's deck or slab. It meets an entry when it covers part of
the entry's span on the same wall; `rampLeanToFloor` answers that from the design alone, for the
editor. Only the model knows whether that lean-to was built, so prune drops `from` only on a wall
with no lean-to deck or slab, and never drops `belowGrade`. `x` is out from the wall's outside face; `z = 0` is the shed floor surface.

| `from` | A lean-to floor meets it | Upper level: `face`, `edge`, `top` | Down to |
|---|---|---|---|
| `floor` | No | 0, 0, 0: the floor framing, or the slab edge | The foot, `grade − belowGrade` |
| `floor` | Yes | 0, 0, 0 | The lean-to floor's `top`. It must end short of the posts (`inner`), else it is left out. |
| `lean-to` | Yes | The beam's outer face, the outer deck board's edge, `deckTop`; or the slab edge twice, at grade | The foot |
| `lean-to` | No | As `floor`, with a warning | The foot |

The stringers fasten at `face`; the surface starts at `edge`. Between them, under an outer deck
board that runs past the beam, a ramp stringer's top is cut level at the board's underside
(`under`). `rise = top − foot`. On a slab shed, or from a lean-to slab, the upper level is at grade,
so the rise comes only from `belowGrade`. An entry with too little rise is left out in red, and so
is a wood ramp too short for one whole board down the slope. One that runs past the end of the
lean-to floor, or meets an open lean-to's post, gets a warning.

### Wood

| Part | Role, code | Rule |
|---|---|---|
| Stringers | `stringer`, `S`, PT | The ramp surface falls 1 in `slope` from `top` at `edge`. The stringer top lies one board thickness, square to the slope, under it: `top(x) = top − (x − edge) / slope − 1.5 / cos`. Plumb cut at `face`: lagged to the floor framing or a deck beam, or anchored to a slab edge. Level cut at the foot (`clipBelow`). The o.c. rule across `[left, right]` at `oc`. |
| Boards | `decking`, `B`, 2x6, PT | `rows = ⌊(slopeLength + 0.25) / 5.75⌋`, 1/4 in apart, with `slopeLength = slope × rise / cos`. Row `r` starts `r × 5.75` down the slope from `edge`. Each row runs from `left` to `right`. The gap at the foot is less than one board and one gap. |

### Stairs

The step is fixed, with no settings:

| Part | Role, code | Rule |
|---|---|---|
| Risers | | `n = ⌈rise / 7-1/2⌉`, each `rise / n`. Open. Under 2 risers, no stairs and a warning. |
| Treads | `tread`, `T`, 5/4x6, PT | `n − 1` treads of two boards, 1/4 in apart: 11-1/4 in, the unit run. Tread `k` tops at `top − k × riser`, from `edge + (k − 1) × 11-1/4`. |
| Stringers | `stringer.stair`, `S`, 2x12, PT | Cut: seats under the treads, the board's top edge through each seat's outer corner. Seat 1 runs back to `face`. Plumb cut at `face`, in a sloped hanger on wood, or anchored to a slab edge. Level cut at the foot. The hanger needs wood behind the whole plumb cut: where the cut reaches below `low`, the underside of the floor framing or deck beam (`LeanToFloor.bottom`), the note names a PT 2x12 hanger board under it, as wide as the stairs, and `RampFacts.hangerBoard` gives its length to the BOM. The app does not draw the board. Below a slab, a warning says to set the tops on a block or footing. At least three, flush with each side, evenly spaced no more than 18 in apart. |

| Warning | Source |
|---|---|
| Narrower than 36 in | IRC R311.7.1 |
| 4 or more risers: a handrail | IRC R311.7.8 |
| A total rise of 30 in or more: a stair guard | DCA6 Figure 30, IRC R312.1 |
| Open risers more than 30 in above the ground below: a 4 in sphere must not pass | IRC R311.7.5.1 |
| A stringer span over 6 ft | DCA6 Figure 28 |
| A stringer under 5 in deep at its top, square to the stringer, under a deck board that runs past the beam | DCA6 Figure 28 |
| The plumb cuts reach below the floor framing or deck beam: a hanger board; or below a slab | DCA6 Figure 31 |

### Concrete

One panel solid ("Concrete ramp", code `C`, layer `ramps`, material `concrete`) lies in the vertical
plane square to the wall, from the framing face at floor level, as wide as the ramp. Its outline is
`[[0, 0], [run, foot], [run, base], [0, base]]`, with `run = rise × slope` and
`base = foot − thickness`. The surface falls from the floor to the foot, over a flat base
`thickness` under the foot. The wedge starts at the framing face, as a wood ramp does.

Between `face` and `edge` the wedge top stays at `under`, then rises to `top` at `edge`, so the
concrete meets the deck surface at the outer board.

`frameRamps` returns one `RampFacts` per built entry, in `Model.ramps`: its kind, its stringer
count, what the stringer tops fasten to, and a summary line. The BOM counts the concrete and the
fasteners from them ([outputs.md](outputs.md) "Concrete" and "Hardware"). The "Decks, ramps, and
stairs" sheet draws them ([drawings.md](drawings.md) "Decks, ramps, and stairs").

### Decisions

| Decision | Reason |
|---|---|
| A ramp that follows an opening stores a reference: the row index, and the position index in that row's `at` list. | It follows moves, resizes, and wall changes. No copy of the opening's numbers goes stale. |
| When the user removes the opening row, or the position it follows, the ramp stays where it stood, as a free ramp. | The user keeps the ramp in its place. |
| A ramp may run past a wall corner. | The app never limits the user. |
| A ramp can run below grade to a foot, and it can be concrete. | Lower ground beside the shed, such as a drive beside a slab. |
| A ramp with too little rise is left out in red. | Its stringers would collide with its boards. Concrete needs some rise. |
| Whole boards only, from the top down. | The top board is level with the floor at the wall. |
| An entry picks its upper level (`from`); the lower level follows. | Two entries cover both cases the user asked for: steps from the door down to a dropped deck, and a ramp from the deck edge to the drive. |
| Stairs take the standard step, not a setting. | The user asked for it. A riser of 7-1/2 in, under the IRC 7-3/4 in, keeps the 5 in throat of a 2x12 cut stringer at an 11-1/4 in run. |
| Stairs: 5/4x6 treads, open risers, and no pad, handrail, or guard members. | The user's choice. DCA6 Table 6 and Figure 29 allow 5/4 treads on cut stringers 18 in apart. The warnings name what the app leaves out. |

### Change it safely

- Place every ramp through `rampPlace`. Do not read `ramp.wall` or `ramp.at` directly.
- Keep `LeanTo.floor` in step with the deck and slab, and `rampLeanToFloor` in step with it: the
  editor shows `from` where a lean-to floor is on the wall.
- Send every opening row edit through `withOpeningRow` or `withoutOpeningRow`. A new edit that
  reorders rows must remap `ramp.opening` the same way.
- A ramp becomes lost only when its opening changes outside those two functions, for example in a
  hand-edited file.

## 4. Sheathing

`frameSheathing(config, members, openings, planes, deck)` returns sheet solids. Each solid is one
piece of one 48 × 96 in sheet, cut to fit. `buildModel` calls it last, so it sees the lean-to
members and roof planes. The BOM sheet count is in [outputs.md](outputs.md) "Sheets".

### Faces

| Surface | When | Region | Joints land on | Sheet along `u` × `v` | Half-sheet stagger | Ids, label | Layer |
|---|---|---|---|---|---|---|---|
| Each wall | `walls.sheathing` is not `none` | `wallFace` | Centers of the vertical flush members, jacks left out | 48 × 96 | no | The `wall.<side>` prefix, for example `FW-SH01`. "Wall sheathing, 7/16" OSB" | `sheathing` |
| Each roof plane with `sheathed` | `roof.sheathing` is not `none` | The plane, `length × width` | Rafter centers of the plane's `assembly` | 96 × 48 | yes | `RF-SH01`, … "Roof sheathing, …" | `sheathing` |
| Subfloor | Any `joist.floor` or `joist.end` | `config.length × config.width`, top at z = 0 | Joist centers along x | 96 × 48 | yes | `FL-SF01`, … "Subfloor, …" (`floor.subfloor`) | `floor` |
| Loft deck | `frameRoof` returns a `deck` | `deck.min` to `deck.max`, at `deck.bottom` | Centers of the `loft` members that run front to back | 96 × 48 | yes | `LF-DK01`, … "Loft deck, …" (`roof.loft.deck`) | `loft` |

Holes: each wall takes the ROs on it, gable openings included. The loft deck takes `deck.holes`:
the hatches and the open end. The roof and subfloor have none.

All roof planes share one `RF` id counter, so lean-to roof sheets are `RF-SH` too. Each panel
extrudes `thick` along `u × v`: outward from the wall framing, up from the floor and loft, and out
of the roof.

### `wallFace`

`wallFace(config, wall, frame, members, openings, thick)` returns the `Face` of one wall.
`finishes.ts` calls it too, for the siding.

- The flush members are the members of a `wall`, `gable`, `knee`, or `loft` assembly whose outer
  face is at the wall's framing face and whose inner face is within the stud depth.
- The region is the convex hull of their corners in `(u, z)`, plus the corner points below.
- An eave wall reaches `thick` past each corner, at the bottom and the top of its framing.
- An end wall reaches each corner, from its bottom up to the top of the eave wall there.
- The bottom is the flush framing's bottom, at the wall's base (z = 0). The wall sheets do not reach
  down over the floor framing.

### Layout

`panels` lays rows from the bottom of the region's box, one sheet `across` tall, and the last row
ends at the top. On odd rows of a staggered face, the first piece is half a sheet long. A hole across
the full row height at a row end moves that end to the hole's edge. Each piece is its rectangle less
the holes, clipped to the region. A loop of 1 sq in or less, or lower than the face's `minRow`, is
left off.

`sheetJoints` puts each joint on the farthest support in reach of the last joint: the first
piece's length, then one sheet. It prefers a support that leaves at least `MIN_PIECE` (12 in) to
the row end. With no support in reach, the joint goes at the limit, off framing.

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
- `subtract` returns outer loops counterclockwise and hole loops clockwise. `panels` tells them
  apart by the sign of their area.
- The BOM groups uses by the label text before the first comma. Keep labels as "Use, sheet label".
- A change to `wallFace` also moves the siding in `finishes.ts`.

## 5. Finishes

`buildFinishes(config, model)` returns `FinishPart[]` for the 3D view only. It reads the config and
the model and writes nothing back. The parts are simple shapes, with no fasteners or furring. The
only flashing is at a gambrel's break.

Finishes skip the lean-to and ramp framing. They read `model.leanTos` only for a lean-to roof's
purlin size. In 3D the siding takes the same space as a lean-to ledger, a deck ledger, or the top of
a ramp stringer.

| Type | Content |
|---|---|
| `FinishPart` | `layer` (`siding`, `roofing`, or `openings`), `look`, `color`, an optional `tile`, and a `shape`. |
| `Look` | `lap`, `t1-11`, `board-batten`, `shingles`, `planks`, `garage` (textures), and `plain`, `glass`, `metal`. |
| `tile` | The texture's repeat along `u` and `v`, in inches (`TILES`). |
| `shape` | A `Panel`, an axis-aligned box, or a `Corrugated` panel: `origin`, `u` (across the waves), `v`, `length`, `width`. |

### Siding and trim

`siding: 'none'` also removes the corner boards and casings.

- Siding: one panel per wall, `SIDING` (1/2 in) thick, outside the sheathing. `wallFace` at the
  siding face, the sheet plus the siding, gives the region and holes. The eave walls thus reach past
  each corner by the full siding face. The siding laps down over the floor framing, to the lowest
  `floor` member.
- Corner boards: two `TRIM` boards at each corner, from the siding bottom to the top of the eave
  wall there. The end wall's board is the narrower; the eave wall's board laps its edge (`CORNER`).
- Casings: `CASING` wide and `TRIM` thick, on the siding face, around each RO. A window or custom
  opening gets a full frame. A door or overhead door gets the sides and head only, down to the RO
  bottom.

### Roofing

Each `RoofPlane` gets roofing:

| Plane | Metal when | Roofing sits on |
|---|---|---|
| Main roof | `roof.roofing` is not `shingles` | The sheets when `sheathed`, plus the `roof.purlin` thickness when metal. |
| Lean-to | `sheathed` is `false` | The lean-to `purlin` thickness. |

- Shingles: one panel over the whole plane, `SHINGLE` thick, with the `shingles` tile.
- Metal: `Corrugated` panels. Columns run from the plane's `u` origin along the eave, `COVER`
  (24 in) each. A panel is `PANEL` (26 in) wide for the side lap; the last is cut to fit. Rows run up
  the slope from `metalOverhang` below the low edge, or from the low edge when `plane.eaves` is 0.
  Each panel is at most `panelLength` long. The next row starts `END_LAP` (6 in) below the top of the
  panel under it. Each lap sits a little higher, so the laps show.
- Ridge cap, on the planes with `ridge`: a gable roof's two planes, a gambrel's two upper planes.
  Metal gets one vented cap (`RIDGE`) along the ridge, above the panel crests, at `roof.pitch`: the
  upper pitch on a gambrel. Shingles get a `CAP` strip at the top of each plane. Lean-tos, lean-to
  main roofs, and a gambrel's lower planes get no ridge cap.
- Break flashing, on each plane with `breakEdge`: a `plain` strip in `roofColor` across the plane,
  over its top `FLASH` on a `high` edge and its bottom `FLASH` on a `low` edge. It lies on the
  roofing: on the metal crests, or on the shingles. The BOM has no line for it.

### Doors and windows

Layer `openings`. The kind comes from the opening type by name; an unknown name counts as `custom`.

| Kind | Parts |
|---|---|
| `window`, `custom` | A `SASH` frame through the wall, from its inside face to the sheathing face. Glass, and a meeting rail at mid height. |
| `door` | `JAMB` jambs at the sides and head, through the wall. One `SLAB` leaf with the `planks` look, or a pair when the RO is wider than `PAIR`. A knob by each latch edge. |
| `overhead` | The same jambs. One `SLAB` with the `garage` look. Its tile is a quarter of its width and height: four sections each way. |

### 3D view

`FramingScene` (`scene.ts`) draws each part. The lumber materials, trim paint, and layers are in
[ui.md](ui.md) "The 3D view".

- `drawLook` paints one tile of each texture in grays, at `PX` (8) px per inch. The material tints
  it with the part's color and uses it as a bump map too, at scale 1.5.
- Glass is transparent at 0.35 opacity. Metal has metalness 0.55 and shows both sides.
- A `Corrugated` panel is a cosine wave mesh, 9 waves per 24 in cover (`WAVE`), `DEPTH` (1/2 in)
  deep, with an outline along its crests.

### Decisions

| Decision | Reason |
|---|---|
| Finishes are visual only. They never change the framing, cut list, BOM, drawings, or span checks. | The user wants the look. Finishes need not be engineered. |
| Siding follows `wallFace`, the same face as the wall sheets. | The siding matches the walls, gables, and openings with no second outline. |

### Change it safely

- Never let `src/core/out` or `src/drawings` read `FinishPart`.
- A new look needs a `Look` value, a `TILES` entry when it repeats, and a `drawLook` case in
  `scene.ts`.

## 6. Warnings and left-out parts

Sheathing and finishes give no warnings. A left-out lean-to or ramp draws its outline in red in 3D
and on the sheets that [drawings.md](drawings.md) "Labels, outlines, and `missing`" lists for its
assembly.

| Source | Trigger | Message (start) | Result |
|---|---|---|---|
| Lean-to | The extent passes a wall corner. | The lean-to runs past the ends of the wall. | Built, cut to the corners. |
| Lean-to, soffit | The plumb end is deeper than a 2x12. | A 2x12 ledger is shallower than the rafter's P plumb end. | Built on a 2x12. |
| Lean-to | The 1/3 notch limit gives a seat under 1-1/2 in. | A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 of the R rafter. | Built with a 1-1/2 in seat. |
| Lean-to, soffit | No soffit limit: the main roof does not reach past the wall sheet face, so `ledgerTop` is not finite. | The main roof does not reach past the wall here, so the ledger has no height. | Left out: red footprint at grade. |
| Lean-to | `heel − seat ≤ max(start, 0)`: the seat reaches the rafter's upper end or the wall. | The lean-to is too shallow for its beam. | Left out: red footprint at grade. |
| Lean-to | Post length under 0.01 in. | The beam is at or below the post bases. | Left out: red footprint at grade. |
| Lean-to | Post length under `MIN_POST` (12 in). | The posts are only L long. | Built. |
| Lean-to | Clear height under the beam under `HEADROOM` (80 in). | The clear height under the beam is H, less than 6' 8". | Built. |
| Lean-to, extension | The main-wall notch is deeper than the 1/3 limit. | The birdsmouth on the main wall cuts deeper than 1/3 of the R rafter. | Built. |
| Lean-to, extension | A steeper lean-to pitch lifts the upper ends over the main roof plane by `stand = (rise − eave.pitch / 12) × (−start)`, more than 1/8 in. | At the steeper pitch the lean-to rafters stand S over the main roof plane at their upper ends. | Built. |
| Lean-to, extension | `gap` over 0.01 in: the underside passes over the main wall's plate. | The lean-to rafters pass G over the main wall's plate. | Built, with no main-wall birdsmouth. |
| Lean-to deck | `deckBeamBottom < grade` | The deck framing runs D below grade. | Built. |
| Lean-to deck | On the shed's foundation, a notch deeper than 1/4 of the joist depth. | The deck joists are notched D at their bearings, more than 1/4 of their depth. | Built. |
| Lean-to deck | 5/4 boards on joists more than 16 in apart (2x6 boards: 24 in), per IRC R507.7. | 5/4x6 deck boards span 16" at most; the joists are N" apart. | Built. |
| Lean-to deck | A gable-end deck on the shed's foundation with no shed line under it. | No shed skids (or girders) run under the deck. | Built, with its own lines at its ends. |
| Ramp N | The opening it follows is gone. | The opening it follows is gone. | Built at its own `wall`, `along`, `at`, and `width`. |
| Ramp N, wood | `rise < 1.5 / cos + 0.01`: no room for a stringer under the boards. | The floor is R above the ramp's foot, too low for stringers under the boards. | Left out: red outline at floor level, from the framing face out 24 in, across the ramp's width. |
| Ramp N, concrete | `rise < 0.01` | The floor is R above the ramp's foot, so the ramp has no rise. | Left out, as wood. |
