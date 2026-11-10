# Shed Builder

A parametric shed framing planner that runs in the browser. You enter the size, foundation, walls,
openings, roof, loft, and lean-tos. The app frames the shed in 3D, draws the framing, and makes a
cut list, a bill of materials, and span checks.

> **Planning aid only, not a validated engineering tool.** Have a licensed engineer or your building
> department check all drawings, span checks, and material lists before you build. The tool does not
> check wind, seismic, or local code requirements.

## Setup

You need Git and Node.js with npm. Node must be 22.12 or later in the 22 line, any 24, or 26 and
later.

```sh
git clone git@github.com:brgoldbach/shed-builder.git
cd shed-builder
npm run setup
npm run dev
```

Then open http://localhost:5173.

`npm run setup` checks the Node version, installs the locked dependencies with `npm ci`, and runs
the tests and a production build. It runs in any shell. To set up by hand, run `npm ci`.

## Scripts

| Command | Result |
|---|---|
| `npm run setup` | Checks Node, installs, tests, and builds |
| `npm run dev` | Starts the development server at http://localhost:5173 |
| `npm run build` | Type-checks and builds the app into `dist/` |
| `npm run preview` | Serves the `dist/` build |
| `npm test` | Runs the unit and golden-file tests |
| `npm run lint` | Runs ESLint |

## What it does

| Tab | Content |
|---|---|
| Form (left) | Size, front (eave wall or gable end), precut stud height, foundation, floor, walls, openings, roof, loft, knee walls, lean-tos, loads, species, and stock lengths |
| 3D | Each member and sheet, by layer. A click on a member selects its cut-list line. |
| Framing | Foundation plan, wall elevations, loft and roof plans, a building section, and a rafter detail. Dimensioned, one drawing per printed page. |
| Cut list | Each part by mark, with its cut notes. Print or CSV. |
| BOM | Lumber by stock length with a cutting plan, sheets, concrete, hardware, and roofing. Print or CSV. |
| Warnings | Framing problems, and span checks from the AWC span equations with NDS 2018 values for No. 2 lumber |

## Design files

Save writes the design as a JSON file, and Open loads one. The app also keeps the last design in
the browser's storage. The `presets/` folder holds the examples that "New from preset" loads,
among them the 16x16 "B and B shed".

| Field | Meaning |
|---|---|
| `schemaVersion` | The file format, an integer. It goes up only when an older file needs an upgrade step to load. A new setting with a default does not change it. The app rejects a file with a different schema version. |
| `appVersion` | The version of the app that saved the file. For information only. |

## Versioning

The app follows [Semantic Versioning](https://semver.org/). `package.json` holds the version, and
the header shows it. [CHANGELOG.md](CHANGELOG.md) lists the changes in each release. Each release
has a `vX.Y.Z` tag on `main`.

## Project layout

| Path | Content |
|---|---|
| `src/core` | Config schema, lumber catalog, framing generators (`gen/`), and outputs (`out/`): cut list, BOM, span checks, CSV |
| `src/drawings` | Framing drawings, in inches |
| `src/ui` | React user interface |
| `src/view3d` | Three.js scene |
| `presets` | Example designs |
| `tests` | Unit tests. `tests/golden` holds each preset's expected cut list, BOM, warnings, and span checks. |
| `scripts` | Setup script |

When a change alters a preset's output on purpose, review the golden-file diff, then update the
files with `npx vitest run -u`.
