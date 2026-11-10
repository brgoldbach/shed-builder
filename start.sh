#!/usr/bin/env sh
# Starts Shed Builder at http://localhost:5173 and opens it in the browser. Stop it with Ctrl+C.
set -eu
cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. Run ./setup.sh first." >&2
  exit 1
fi

# npm writes node_modules/.package-lock.json at each install, so a newer lock file means a pull
# changed the dependencies.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi

exec npm run dev -- --open
