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
./setup.sh
./start.sh
```

| Script | Result |
|---|---|
| `./setup.sh` | Checks that Node.js and npm are installed, and tells you how to install them if not. Then it checks the Node version, installs the locked dependencies with `npm ci`, and runs the tests and a production build. |
| `./start.sh` | Starts the app at http://localhost:5173, or the next free port when that one is in use, and opens it in the browser. When `package-lock.json` changed since the last install, as after a pull, it runs `npm ci` first. Stop it with Ctrl+C. |

Both are POSIX `sh` scripts, so they run the same from fish, bash, or zsh. On Windows, run
`npm run setup` and `npm run dev`, then open http://localhost:5173.

## Scripts

| Command | Result |
|---|---|
| `npm run setup` | Checks Node, installs, tests, and builds |
| `npm run dev` | Starts the development server at http://localhost:5173 |
| `npm run build` | Type-checks and builds the app into `dist/` |
| `npm run preview` | Serves the `dist/` build |
| `npm test` | Runs the unit and golden-file tests |
| `npm run lint` | Runs ESLint |
| `npm run gate` | Runs the tests, lint, the type check, and the build |
| `npm run test:ui` | Runs the browser test in Chromium. First run `npx playwright install chromium`. |

## Hosting

The build is a static site in `dist/`: no server, and each visitor's designs stay in their own
browser. Cloudflare Workers hosts it free from the GitHub repo.

| Branch | Cloudflare builds |
|---|---|
| `release` | The live site. Only the release workflow moves this branch ([docs/DEVELOPER.md](docs/DEVELOPER.md#release)). |
| `main`, and each other branch | A preview copy with its own address. The live site does not change. The `main` preview shows the next release. |

The app runs at https://shed-builder.brgoldbach73.workers.dev/.

`wrangler.jsonc` holds the Worker name, the assets directory, and the preview settings. The
Cloudflare dashboard holds the commands:

1. Make a free Cloudflare account, and sign in to https://dash.cloudflare.com.
2. Open Workers & Pages, then Create application, and import the GitHub repo `shed-builder`. In
   the GitHub app install, pick "Only select repositories" and `shed-builder`.
3. Open the Worker's Settings, then Builds, and enter:

   | Setting | Production tab | Previews Base tab |
   |---|---|---|
   | Branch | `release` | Every other branch, with "Builds for Preview branches" on |
   | Build command | `npm run gate` | `npm run gate` |
   | Deploy command | `npx wrangler deploy` | Preview command: `npx wrangler preview` |
   | Root directory | `/` | `/` |

   Cloudflare installs with `npm ci` from `package-lock.json`, with the Node version in `.nvmrc`.
4. If the site address does not open, open the Worker's Domains settings and turn on its
   `workers.dev` address.
5. On GitHub, protect `release` against force pushes and deletion. Do not require a pull request
   on it: the release workflow pushes to it directly.

A failed build, test, or lint check leaves the last good deployment live. The build check on a
pull request links to its preview address.

## What it does

| Tab | Content |
|---|---|
| Form (left) | Size, front (eave wall or gable end), precut stud height, foundation, floor, walls, openings, roof (gable, gambrel, or lean-to), loft, knee walls, lean-tos and their decks, ramps, finishes, loads, species, and stock lengths. Undo and Redo in the header step back and forward through changes. Each section, group, and list card folds closed to a one-line summary. The loft, knee walls, and ties show their fields only when switched on. |
| 3D | Each member and sheet, by layer: foundation, floor, walls, gable ends, loft, knee walls, roof, rake ladders, lean-tos, ramps, sheathing, siding, roofing, and doors and windows. A part left out because its framing would collide shows as a red outline. Framing and Finished switch between the bare frame and the finished look, in the colors under Finishes. A click on a member selects its cut-list line and shows the piece laid flat, with its cut dimensions. Download 3D saves the shown layers as a glTF model (`.glb`) in meters, for Blender or another 3D program. |
| Framing | Foundation plan, a plan of lean-to decks and ramps, an elevation of each wall, gable end, and knee wall, loft and roof plans, a building section, a rafter detail, and a sheet that shows how cut lengths are measured, dimensioned. Zoom opens a drawing to pan and zoom. Download PDF writes the set to scale on Letter or Tabloid sheets, with title blocks. |
| Cut list | Each part by mark, with its cut notes. Lengths run long point to long point along the board. A click on a line shows the piece laid flat, with its cut dimensions. Print or CSV. |
| BOM | Lumber by stock length with a cutting plan, sheets, concrete, hardware, and roofing, each with a cost from the unit prices under Lumber catalog in the form, and a total. Print or CSV. |
| Warnings | Framing problems, and span checks from the AWC span equations with NDS 2018 values for No. 2 lumber |

On a phone the form is the Design tab, beside the others, and each tab takes the whole screen. The
3D layer list folds behind a Layers button, and the cut list shows a line's notes with its piece
drawing when you tap it.

## Design files

Save writes the design as a JSON file, and Open loads one. The app also keeps the last design in
the browser's storage, whole, so a setting you switch away from and back keeps its value. The
`presets/` folder holds the examples that "New from preset" loads.

A saved file and a link hold only the settings the design uses, such as the active foundation type's
settings, and of those only the ones that differ from the defaults. Opening fills every missing
setting with its default, so older, fuller files and links still load.

Copy link puts the whole design in a link: the part after `#design=` holds it, compressed. Nothing
is stored on a server, and the part after
`#` never leaves the browser. Opening the link loads the design; when the browser already has one,
the app asks first. A link is a copy of the design at the time it was made. The PDF plans end with
an "Open this design" sheet: the same link as a QR code, up to 5 in across, for a phone camera.

| Field | Meaning |
|---|---|
| `schemaVersion` | The file format, an integer. It goes up only when an older file needs an upgrade step to load. A new setting with a default does not change it. The app rejects a file with a different schema version. |
| `appVersion` | The version of the app that saved the file. For information only. |

## Versioning

The app follows [Semantic Versioning](https://semver.org/). `package.json` holds the version, and
the header shows it. Click it to read the changelog. [CHANGELOG.md](CHANGELOG.md) lists the changes
in each release. Each release has a `vX.Y.Z` tag on `main`.

## Development

[docs/DEVELOPER.md](docs/DEVELOPER.md) describes the structure, conventions, recipes for common
changes, tests, and the release steps. [AGENTS.md](AGENTS.md) holds the short rules for coding agents.
