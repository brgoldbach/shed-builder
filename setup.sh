#!/usr/bin/env sh
# Checks for Node.js and npm, then installs the locked dependencies, runs the tests, and builds the
# app (scripts/setup.mjs). Run it again after a pull that changes the dependencies: ./setup.sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Shed Builder needs Node.js and npm. Install them, then run ./setup.sh again:" >&2
  if command -v pacman >/dev/null 2>&1; then
    echo "  sudo pacman -S nodejs npm" >&2
  elif command -v brew >/dev/null 2>&1; then
    echo "  brew install node" >&2
  else
    echo "  https://nodejs.org/en/download" >&2
  fi
  exit 1
fi

exec node scripts/setup.mjs
