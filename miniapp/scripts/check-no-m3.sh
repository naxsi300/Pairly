#!/usr/bin/env bash
# Fail if any M3 reference remains in the miniapp source or CSS.
set -euo pipefail
cd "$(dirname "$0")/.."
# Recurse src/ for .tsx/.ts/.css; skip the guard's own test file (its regex
# literal would otherwise self-match).
hits="$(grep -rnE --include="*.tsx" --include="*.ts" --include="*.css" \
  --exclude="no-m3.guard.test.ts" \
  "(--m3-|card-m3|card-m3-low|input-m3|surface-m3|navbar-m3|btn-m3-|text-m3-|text-red-[0-9]+)" src || true)"
if [[ -n "$hits" ]]; then
  echo "$hits"
  echo "M3 / raw-red reference found - purge it (see R-warm consolidation plan)."
  exit 1
fi
echo "no M3 references, no raw reds."