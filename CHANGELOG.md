# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

### Changed

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

[0.1.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v0.1.0
