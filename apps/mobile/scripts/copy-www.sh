#!/usr/bin/env bash
# Populate www/ (the Capacitor webDir) from the web app's SPA build.
# Run via `pnpm --filter @biblestdy/mobile sync`, which builds web first.
set -euo pipefail
cd "$(dirname "$0")/.."
src=../web/build/client
[ -f "$src/index.html" ] || { echo "missing $src/index.html — build @biblestdy/web first" >&2; exit 1; }
rm -rf www
cp -r "$src" www
echo "copied $src -> www"
