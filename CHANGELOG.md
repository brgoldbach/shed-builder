# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Setting help:** a mouse resting for 1 s on a setting (its name, its box, or the `?` beside it)
  shows what it does in a floating box, and for a list with less plain choices, what each choice
  does. A click or tap on the `?` or on the name keeps the box open until the next click.

### Changed

- **Blocking:** the floor switch "Mid-span blocking" is now "Blocking". The row stays at half the
  joist length. With an odd number of skids or girders, such as the default 3, that is over the
  middle one, where it holds the joists upright. The floor plan note now says where the row goes.
- Development only: `npm run test:ui` runs a browser test of the built app in Chromium: the load,
  the 3D view, an edit, both downloads, and a stored design that does not load. A GitHub workflow
  job runs it on each pull request.

### Fixed

- A wood ramp on a slab got lag screws into floor framing in the BOM. It now gets concrete anchors
  into the slab edge, two at each stringer, at the anchor bolt price.

## [0.9.0] - 2026-11-12

### Added

- **Fascia top:** a roof setting for how each eave fascia meets the roof: set down under it (the
  default), bevel ripped to the pitch, or flush with the rafter tops, where 0.8.2 placed it. The cut
  list gives a beveled fascia's rip angle and outer face height. Lean-tos follow the same setting.
- **Red barn preset:** a 12x16 classic red barn. It has a gambrel roof at 29/12 and 5/12, barn
  doors with a ramp, a hay door in the front gable, attic windows in the back gable, a loft, and
  red board and batten siding with white trim.
- **Plumb and level tail cut:** a roof option that cuts each rafter tail plumb only as deep as the
  fascia hangs, then level back, so no rafter end shows below the fascia. The red barn uses it.

### Fixed

- Each eave fascia is set down so the roof plane passes over its top, as the sheathing and drip edge
  do on a real roof. Before, its top edge stood above the roof surface: 3-5/8 in at 29/12.
- The rafter sheet of a lean-to roof drew a dimension of zero length, which showed errors in the
  browser console.
- "New from preset…" and a shared link ask in the app's own dialog. Some browsers, such as an
  editor's preview pane, do not show the browser's confirm box, so a preset could not be picked.

- The lean-to deck note on the Decks and ramps sheet names the deck boards the design uses. It
  said "2x6 deck boards" also for 5/4x6 boards.
- The BOM gives each form-tube length when lean-to piers under a deck are shorter than the shed's
  piers. It gave the first pier's length for all of them.
- The BOM counts a sheathing panel larger than a 48 × 96 in sheet as a sheet of its own. It could
  add no sheet for it.

### Changed

- **Gambrel roof:** a switch to Gambrel sets the classic barn pitches, 29/12 lower and 5/12 upper.
  The auto break now makes the lower and upper rafters the same length, so with these pitches the
  four rafters lie on a half circle. Before, the break sat 1/4 of the width in from the wall, and
  the upper rafters came out short. A saved gambrel on the auto break gets the new break.

- Development only: the `/release` reply says to approve the held `gate` run before the merge.
  The extra manual `gate` run is gone: GitHub did not count it for the pull request.
- Development only: tests load the preset and test-design files of every release, and build 300
  random designs on each run. A search of 5,000 random designs found no design that breaks a rule.
- Development only: the developer documents are about half as long (7,647 to 4,024 lines). Each
  states rules, contracts, and reasons, and each fact lives in one document. Text that repeated
  the code or another document is cut, and several statements that the code contradicted are
  corrected.

## [0.8.2] - 2026-11-12

### Fixed

- A design saved in the browser that no longer loads is kept, not lost. The app opens the first
  preset, shows why the saved design did not load, and offers it as a download. Before, the first
  autosave wrote over it with no message.
- An error in the app shows a recovery page, not a blank page. It offers the design as a download,
  a reload, which opens the last design that worked, and a new design.

### Changed

- Development only: a comment `/release X.Y.Z` (or `patch`, `minor`, `major`) on a pull request
  adds its release commit, and the merge releases it. This replaces the "prepare release"
  workflow, which opened a second pull request.

## [0.8.1] - 2026-11-12

### Changed

- Development only: `npm run gate` runs the tests, lint, the type check, and the build. A GitHub
  workflow runs it on each pull request, and lint keeps React, the DOM, and Three.js out of the
  model and the drawings.
- Development only: `wrangler.jsonc` sets up the Cloudflare Worker, so each pull request gets a
  preview address. Before, the deploy set itself up on each build.
- Development only: the live site deploys from the `release` branch, not from `main`. A release
  moves `release` to its tag, so merged changes wait on `main` for the next release.
- Development only: a release is one workflow run and one pull request merge. "prepare release"
  opens the pull request "Release X.Y.Z"; its merge tags the release, deploys it, and publishes
  the GitHub release. The site serves its version at `/version.txt`.

## [0.8.0] - 2026-11-11

### Added

- **Download 3D:** the 3D tab saves the shown layers as a glTF model (`.glb`) in meters, for
  Blender or another 3D program. Each piece keeps its id and color, in one group per layer.

### Fixed

- A select or checkbox that the design rejects now shows the reason under it. Before, it snapped
  back with no message: for example, a switch to Gambrel with a pitch as steep as the lower pitch.
  That message now gives both pitches.
- The BOM counts one hurricane tie, not two, for a lean-to extension rafter that passes over the
  main wall's plate with no birdsmouth there.
- Two openings of one type in one wall no longer give the span-check rows the same React key.

## [0.7.0] - 2026-11-11

### Added

- **Gambrel roof:** a third roof style, the barn roof. Each side has a steep lower slope from the
  eave wall to a break and a shallow upper slope from the break to the ridge. Set the lower pitch
  (20/12 by default), the upper pitch, and the break's distance in from the wall (1/4 of the width
  by default); the form shows the break's height. The lower and upper rafters meet at the break in a
  miter, joined by a 1/2 in plywood gusset on each face. The gussets run straight across under the
  joint, as a web; the gable-end rafters take one inside, over the gable framing. A Gussets sheet
  gives each shape with its edge lengths, and the BOM counts them with the sheet goods. A gambrel
  can go without a ridge board: the upper rafters then butt at the peak, joined by peak gussets.
  The gable ends, rake ladders, purlins, sheathing, and roofing follow the five-sided profile, with
  a flashing strip over the break in 3D. Collar ties go just under the break by default. A loft
  works as on a gable roof; knee walls are a gable-roof option only. Span checks cover the lower and
  upper rafters. The rafter detail draws both rafters and the gusset.

### Fixed

- **Roof extension under a steep eave:** where a lean-to rafter at a lower pitch passes over the
  main wall's plate, the cut list gave it a negative birdsmouth seat. It now has no birdsmouth
  there, and a warning says to block under each rafter.
- **Drawings:** a panel seen square to its face draws its exact outline, not its convex hull.

## [0.6.0] - 2026-11-11

### Added

- **Developer documents:** `docs/DEVELOPER.md` describes the structure, conventions, decisions,
  recipes for common changes, tests, and releases. It links a detailed document for each subsystem:
  the design model, framing, lean-tos and finishes, outputs, drawings, and the user interface.
  `AGENTS.md` holds the short rules for coding agents.
- **Undo and redo:** buttons in the header, or Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac). Each change
  to the design is a step, a loaded file or link too. In a text box, the keys undo the typing.
- **Ramps:** a Ramps list in the form. A ramp runs from the floor down to its foot, at grade or a
  set depth below it, for lower ground beside the shed. Wood: PT 2x6 deck boards on sloped PT
  stringers that butt the floor framing, with a stringer size and spacing. Concrete: a wedge from
  the foundation's edge over a base under the foot, with its concrete in the BOM. A ramp can follow
  an opening: it centers on that opening's RO, wider by a margin on each side, and moves and resizes
  when the opening changes, to another wall too. Or place it freely by wall, position, and width.
  The cut list, BOM, 3D, and a new "Decks and ramps" sheet show it. A ramp with too little rise is
  left out in red.
- **Lean-to deck:** a third lean-to floor choice. PT deck boards, notched around the posts, on
  joists that hang from a ledger on the shed's floor framing and from a flush beam on the post line.
  The beam bears on the piers, which rise to meet it, or on deck posts where the floor is high. The
  lean-to posts stand on the beam over each pier, so each load runs straight down. Set the joist
  size, spacing, boards, and a drop below the shed floor. The boards are 5/4 decking, 1 in thick, by
  default, or 2x6; a warning names boards on joists farther apart than they span. Span checks cover
  the deck joists and beam, and the BOM counts the hangers, ledger lags, and beam seats. A new
  5/4x6 size and price are under Lumber catalog.
- **Deck on the shed's foundation:** a deck can stand on the shed's own skids or pier girders
  instead of piers. On an eave side the deck gets skids or girders of its own along the wall, the
  outer one under the beam. On a gable end the shed's skids or girders run on out under the deck,
  or the deck gets its own in line with them: your choice. The joists sit on them, notched at their
  bearings where that sets the deck to the drop you choose, flush with the floor by default; a
  warning names a notch deeper than 1/4 of the joist. A gable-end deck is boxed with a rim joist at
  each end.
- **Lean-to piers on other foundations:** on a skid or slab shed, the Foundation section now shows
  the pier settings that lean-to posts use, and the slab thickness for a lean-to slab.

### Changed

- **Parts that do not fit:** the app builds what you enter wherever the parts can exist, with a
  warning. A header thicker than the wall now stands proud of the wall's inside face. A short hatch
  tail joist and a short lean-to post are now built. An opening, hatch, collar ties, or lean-to
  whose framing would collide is still left out, and now shows as a red outline in 3D and on its
  drawings.

- **Lean-to and ramp cards:** each card folds its settings into groups with a one-line summary:
  Size, Roof, Posts and beam, and Floor for a lean-to; Place, Slope, and Build for a ramp.

### Fixed

- **Lean-to with no roof over its wall:** a below-soffit lean-to on a wall that the main roof does
  not reach past, such as a gable end with no rake overhang, got no ledger height and broken
  geometry. It is now left out in red, with a warning.
- **Long-piece warnings:** a cut line with pieces longer than the longest stock gave one warning
  for each piece. It now gives one warning for the line, with the piece count.

## [0.5.0] - 2026-11-10

### Added

- **Phone layout:** on a screen up to 760 px wide the form moves to a Design tab and each tab takes
  the whole screen. The header wraps, the 3D layer list folds behind a Layers button, the cut list
  drops its notes column (a tap on a line shows them with the piece), and inputs use 16 px text so
  a phone does not zoom in on a tap. The piece drawing has a close button.

### Removed

- **Framing tab shortcuts:** the row of buttons that jumped to each drawing is gone; the drawings
  scroll in sheet order.

### Fixed

- **3D view on a tall screen:** the first view framed the shed as if the view were square, so on a
  phone it opened cut off at the sides. It now takes the view's shape first.

## [0.4.0] - 2026-11-10

### Added

- **Share links:** Copy link puts the whole design in a link, with nothing stored on a server.
  Opening the link loads the design, after asking when the browser already has one.
- **QR code on the plans:** the PDF plans end with an "Open this design" sheet that prints the
  design's link as a QR code up to 5 in across, so a phone camera opens the design from a printed
  set. The drawing sheets are unchanged.
- **Hosting:** the README explains how to host the app free on Cloudflare, with a rebuild on each
  push to `main`. `.nvmrc` pins Node 26 for the host's build.

### Changed

- **Saved files and links hold only what the design uses:** Save and Copy link leave out the
  settings the design does not use, such as a slab's skid, pier, and floor settings or a loft's
  details when there is no loft, and every value at its default. The B and B shed's file drops from
  5,754 to 2,110 bytes, and its link from 1,000 to 745 characters. Older files and links still load.
- **Skid ends:** each end of a skid run is cut 45° across its bottom third, as on a sled runner, so
  the shed drags without digging in. The cut list says so; a splice in a long run stays square.
- **8x10 preset:** a third skid in the center.

### Removed

- **B and B shed preset:** share its design by link or file instead. The tests keep it as a fixture.

## [0.3.0] - 2026-11-10

### Added

- **Finishes:** a Finished view in 3D shows siding (lap, T1-11, or board and batten), shingles or
  corrugated metal roofing, doors, garage doors, and windows, with corner boards, casings, and
  painted fascia. Pick the siding, trim, roof, and door colors under Finishes. Metal roofing shows
  each panel, with end laps where the slope is longer than the longest panel, an overhang past the
  eaves (2 in by default), and a vented metal ridge cap on a gable roof. Finishes are for the look
  only: they do not change the framing, cut list, or BOM.
- **Setup and start scripts:** `./setup.sh` checks for Node.js and npm, then installs, tests, and
  builds. `./start.sh` starts the app and opens it in the browser, and reinstalls the
  dependencies first when a pull changed them.

## [0.2.0] - 2026-11-10

### Added

- **Prices:** the BOM gives each line a cost, a total for each section, and a total for the shed.
  Set the unit prices under Lumber catalog: lumber per foot by size with a percent markup for
  pressure-treated, sheets, concrete, hardware, and roofing. The defaults are US home-center
  prices from November 2026, before tax and delivery. The BOM CSV adds price and cost columns and
  a total row.
- **Piece drawings:** a selected piece, in 3D, on a drawing, or in the cut list, shows one of its
  pieces laid flat: the cut length from long point to long point, each edge shorter than that,
  and the board width, with its cut notes.
- **Measuring cut lengths sheet:** the last framing sheet shows a piece of the design for each kind
  of end cut, dimensioned as the cut list measures it.
- **Cut length rule:** the cut list and its CSV say how lengths are measured: long point to long
  point, along the board, the shortest board each piece comes from. The common rafter sheet
  dimensions that length.
- **Gable panels:** "Build the gable ends as panels" puts each gable end on its own bottom plate,
  so you can frame it flat and stand it on the end wall. The gable studs are 1-1/2 in shorter.
- **Main roof roofing:** shingles on sheathing (as before), metal on purlins over open rafters,
  or metal on purlins over the sheathing. Purlins are 1x4 or 2x4 flat, evenly spaced up each
  slope at most the purlin spacing apart, rake to rake.
- **PDF plans:** "Download PDF" on the Framing tab writes every drawing as one sheet, on Letter or
  Tabloid paper, landscape. Each sheet gets the largest architectural scale that fits and a title
  block: design, sheet title and number, scale, date, app version, and the notice.
- **Drawing zoom:** "Zoom" opens a drawing over the whole window. The wheel or a pinch zooms about
  the pointer, a drag pans, and Esc closes it.
- **3D layers:** Gable ends, Knee walls, and Rake ladders each have their own toggle, apart from
  Roof and Loft.
- **Rake ladder options:** "Lookout at the fascia" puts a lookout at each fascia end of a ladder.
  "Ridge runs out to the fly rafters" (on by default) can be turned off: the ridge board then stops
  at the gable framing, the fly rafters and rails meet at the ridge line, and a plumb block at the
  peak of each ladder meets the one on the other slope. "Build the ladder on the gable-end rafter"
  makes that rafter the ladder's inner rail: no separate rail, and the ladder goes up with it.
- **Changelog:** the version in the header opens this changelog.

### Changed

- **Headers:** framing drawings and PDF plans draw headers like any other member, without a tint.
- **Roof area:** the BOM gives one line for shingles and one for metal panels, so each takes its own
  price.
- **Form layout:** each section folds closed to a one-line summary, and the Roof section splits
  into groups that fold: Overhangs, Rake ladder, Roofing, Rafter ties, and Collar ties. The loft
  has its own section after Roof. Loft, Knee walls, Rafter ties, and Collar ties have a switch in
  the header and show their fields only when on. Opening types and the header and jack defaults
  move into the Openings section. Opening types, lean-tos, and loft hatches are cards that fold
  closed to their name and size; a new card opens. A mirrored lean-to is titled "Front and back
  lean-tos".
- **One sheet per panel:** each wall elevation shows the wall alone. Each gable end and each knee
  wall has its own sheet, dimensioned from its own bottom plate, so the PDF has a page for each
  panel. The knee-wall sheet shows the loft rim and the deck edge under it.
- **Rake ladders go up in one piece:** a rail of the ladder size stands against the gable-end
  rafter, tops flush, and the lookouts run between it and the fly rafter. You build the ladder on
  the ground, then face-nail the rail to the gable-end rafter. Lookouts are 1-1/2 in shorter: 5 in on
  an 8 in rake.
- **Rake ladder ends:** no lookout goes at either end by default. On a gable roof the ridge board,
  which runs out to the fly rafters, is the top rung, and the fascia ties the tail.
- **Knee-wall corners tie into the gable end:** the knee wall's cap plate runs to the building
  corner and laps over a level gable corner plate, as at a wall corner. The gable top plate starts
  at the knee wall's inside face, and the gable-end rafters seat on the lap with the same birdsmouth
  as the others.

## [0.1.0] - 2026-11-09

First release.

### Added

- **Design:** width and length, an eave wall or a gable end in front, precut or custom stud heights,
  autosave, Save and Open as JSON, and four presets: 8x10 gable on skids, 10x12 lean-to on piers,
  12x20 garage on slab, and the 16x16 B and B shed.
- **Foundations:** skids; piers with posts and girders; a slab with a thickened edge and anchor
  bolts.
- **Floor:** joists, rims, blocking, and the subfloor.
- **Walls:** bottom, top, and cap plates with lapped corners; a mud sill on a slab; studs on layout
  from the building corner; 4-stud, 3-stud, California, or 2-stud corners. A setting picks the walls
  that run through to the corners on a gable roof.
- **Openings:** doors, windows, and garage doors with kings, jacks, headers, cripples, and rough
  sills; size presets; openings in the gable ends.
- **Roofs:** gable and lean-to, with birdsmouth seats, a ridge board, rake ladders, fascia, and
  rafter and collar ties.
- **Loft:** joists on the plates or hung from ledgers, hatches, an open end, and a sheet deck. Knee
  walls raise the roof; the gable end runs through to the corners, and rim plies carry the knee
  walls across an open end.
- **Lean-tos:** below the main soffit or as an extension of the main roof, on any side or mirrored,
  with metal roofing on purlins, and posts on piers or a slab.
- **Sheathing:** wall, roof, subfloor, and loft deck sheet layouts, with joints on framing.
- **Outputs:** a 3D view with layers; framing drawings with a print layout; a cut list and a BOM
  with CSV export; span checks for rafters, joists, headers, and girders; warnings.
- **Notice:** a statement that the app is a planning aid, not a validated engineering tool, on
  screen, in print, and in each export.
- **Versioning:** the header shows the app version, and each saved file records it as `appVersion`
  next to `schemaVersion` 1.
- **Setup:** `npm run setup` checks Node, installs, tests, and builds.

[0.9.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.9.0
[0.8.2]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.8.2
[0.8.1]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.8.1
[0.8.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.8.0
[0.7.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.7.0
[0.6.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.6.0
[0.5.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.5.0
[0.4.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.4.0
[0.3.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.3.0
[0.2.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.2.0
[0.1.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.1.0
