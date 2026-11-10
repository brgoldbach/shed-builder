# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Rake ladders:** on a gable roof the ridge board, which runs out to the fly rafters, is the top
  rung. No lookout goes against the ridge, so each ladder has one lookout fewer, and the top
  lookout sits one space down the slope.

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
