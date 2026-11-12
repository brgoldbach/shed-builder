# Working in this repo

Read [docs/DEVELOPER.md](docs/DEVELOPER.md) first: structure, conventions, recipes, tests, and
release. It links a detailed document for each subsystem in `docs/`.

- Keep `src/core` and `src/drawings` free of React, the DOM, and Three.js. Lint enforces it.
- A valid design never throws. Build what you can, and warn about the rest.
- With each change, update the tests, the golden files after review, CHANGELOG `[Unreleased]`,
  and any of README.md and the documents in `docs/` that describe it.
- Gate: `npm run gate` (tests, lint, type check, build). `main` takes pull requests only, and the
  `gate` workflow must pass.
- `release` is the live site. Push to it only in a release, as DEVELOPER.md "Release" says.
