# verifold-flat: regeneration and verification

`contracts/verifold-flat.clar` is a GENERATED build artifact. The 11 gears in
`contracts/*.clar` are the only human-edited source of truth. Never edit the
artifact; CI regenerates and diffs it on every push.

## Regenerate (after any gear edit)

    python3 tools/flatten.py

Deterministic: no timestamps, byte-identical across runs, hard-asserted under
80 KB. Also rewrites `tools/flat-manifest.json` (the rename map the test
adapter consumes) and prints emit-stats (bytes, function and constant counts,
max let depth); CI copies the emit-stats line into each build's job summary
so artifact size is trended per push.

## Verify

    python3 tools/test_params.py          # math anchor unit tests
    python3 tools/test_flatten.py         # all flattener unit tests
    python3 tools/test_flatten_check.py   # Layer 0 unit tests
    python3 tools/flatten_check.py        # Layer 0: token identity, 11 gears
    clarinet check                        # 12 contracts, strict check_checker
    npm test                              # 240 baseline (gears)
    VERIFOLD_FLAT=1 npx vitest run        # 240 against verifold-flat
    VERIFOLD_DIFF=1 npx vitest run        # gear vs flat at every call (~2x)

Mutation smoke (proves the redirect is live; CI runs it on every push):

    python3 tools/flatten.py --mutate qm31/P=u2147483646
    VERIFOLD_FLAT=1 npx vitest run tests/qm31.test.ts   # MUST fail
    python3 tools/flatten.py                            # restore

## Naming scheme

Every top-level name is `<gear>/<name>` (`field/m31-add`, `qm31/P`,
`driver/verify`). `/` cannot appear in a gear identifier, so prefixed names
cannot collide with each other or any local by construction, and Layer 0's
inversion (split on the first `/`) is exact. Fallback if a downstream
consumer rejects `/`: set `SEPARATOR = "--"` in tools/flatten.py, regenerate;
the adapter follows the manifest automatically. The devnet smoke test exists
to surface such a consumer inside M1.

DEFERRAL (2026-07-10): Devnet smoke test deferred. Docker is unavailable in
the WSL2 environment and cannot be provisioned at this time. The `/` separator
is verified by `clarinet check` (Task 18) and simnet tests (Tasks 17 and 19).
Smoke must run on a provisioned Docker environment before any M2 deploy
decision. Follow-up task required: re-run Task 20 devnet smoke after Docker
is available.

## Production profile (deploy time only)

    python3 tools/flatten.py --production

Writes `contracts/verifold-flat-production.clar` (gitignored) with the
NOT-STANDALONE-SOUND test entry point `driver/verify-query` demoted to
private. Only this profile is ever proposed for testnet, and testnet waits
for M2 full parameters (founder decision 2026-07-10). Re-validate against
interop.test.ts and the driver verify tests before any deploy.

## Cost evidence

See docs/m1-cost-exhibit.md: flat `driver/verify` read_count ~3 versus 2496
through the gear pipeline, runtime at or below the gear baseline.
