#!/usr/bin/env bash
# M2 mutation smoke at the production point: flip one generated constant in
# the FULL artifact, prove the tests/full suite fails, then prove a clean
# regeneration restores byte identity. Mirrors the ci.yml toy mutation-smoke
# idiom (flatten --mutate, then an inverted vitest exit check) at --point full.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/flatten.py --point full --mutate qm31/P=u2147483646
if npx vitest run tests/full/; then
  echo "MUTATION NOT DETECTED: tests/full/ does not exercise the full artifact"
  python3 tools/flatten.py --point full   # restore before failing
  exit 1
fi
echo "mutation detected: tests/full/ failed as required"

python3 tools/flatten.py --point full
git diff --exit-code contracts/full contracts/verifold-flat-full.clar tools/flat-manifest-full.json
echo "clean regeneration is byte-identical: mutation smoke PASSED"
