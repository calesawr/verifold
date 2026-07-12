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
    npm test                              # 244 baseline (240 suite + 4 guard)
    VERIFOLD_FLAT=1 npx vitest run        # 244 against verifold-flat
    VERIFOLD_DIFF=1 npx vitest run        # gear vs flat at every call (~2x)

`tests/flat-guard.test.ts` is the 4-test adapter guard: it proves read-only
traffic stays live in every mode and that the `callPrivateFn`, `execute`, and
`mineBlock` entry points throw under flat mode instead of silently running
gear code (`callPublicFn` and `deployContract` are forbidden by the same
trap).

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

DEVNET SMOKE PASSED (2026-07-11, Docker provisioned): all 12 contracts
published to a local clarinet devnet (verifold-flat at block height 40), the
node's `/v2/contracts/interface` endpoint serves all 92 functions with their
`/` names, and a read-only call through the node RPC
(`POST /v2/contracts/call-read/<deployer>/verifold-flat/field%2Fm31-add`
with u2 and u3) returned `{"okay":true,"result":"0x01..05"}` (u5). The `/`
separator survives a real node on the wire; the `--` fallback is not needed.
Scope note, historical (2026-07-11): the Hiro stacks-blockchain-api could not
run in this environment (with clarinet 3.19, api 9.0.0 crashes during the
snapshot event import and api 8.15.4 cannot ingest the snapshot chain; see the
comment in settings/Devnet.toml), so at devnet time indexer-side handling of
`/` names remained unverified. The node, clarinet check, the sdk simnet, and
the RPC wire format all accept them. CLOSED on 2026-07-12 by the testnet
deployment: the Hiro indexer ingested the deployed production verifier with
all 114 slash-named functions present in its ABI and the contract canonical
(receipts in docs/m3-testnet-receipts.md). Indexer-side `/` handling is
verified; no separator change is needed.

## Production profile (deploy time only)

    python3 tools/flatten.py --production

Writes `contracts/verifold-flat-production.clar` (gitignored) with the
NOT-STANDALONE-SOUND test entry point `driver/verify-query` demoted to
private. Only this profile is ever proposed for testnet, and testnet waits
for M2 full parameters (founder decision 2026-07-10). Re-validate against
interop.test.ts and the driver verify tests before any deploy.

At the full point the same flag emits the deployable artifact:

    python3 tools/flatten.py --point full --production

Writes `contracts/verifold-flat-full-production.clar` (COMMITTED and CI
drift-guarded, unlike the gitignored toy profile): identical to
`contracts/verifold-flat-full.clar` except the one `driver/verify-query`
head keyword, `define-read-only` demoted to `define-private`
(tools/test_flatten.py pins the diff to exactly that line). The run
writes nothing else: gear sources, manifest, and the equivalence
artifact are untouched. This is one of the exactly two contracts M3a
deploys to testnet, next to `contracts/verifold-attest.clar`.

## Full parameters (--point full)

`contracts/full/*.clar`, `contracts/verifold-flat-full.clar`, and
`tools/flat-manifest-full.json` are GENERATED at the pinned production point
(tools/params.py PRODUCTION_POINT, wire format v2 with prover-supplied
inverse hints). Never edit them; CI regenerates and diffs all of them on
every push. Regenerate after any gear, span, or params edit:

    python3 tools/flatten.py                # toy (default): byte-identity gate
    python3 tools/flatten.py --point full   # the production artifacts

Verify:

    python3 tools/test_spans.py                  # spans: toy byte-equal, full parses
    python3 tools/flatten_check.py --point full  # Layer 0 on the full artifact
    clarinet check                               # all registered contracts, strict checker
    npx vitest run tests/full/                   # fixtures, tampers, KATs, differential, guards
    bash tools/mutation_smoke_full.sh            # redirect liveness + byte-identical regen

Production fixtures are committed (interop/fixtures/rust-proofs-full.json);
regenerate them only with a local `cargo run --release --bin prove -- --point full`
(cargo stays out of CI by design; CI consumes the committed fixtures). The
enforced cost gate runs whenever the exhibit regenerates:

    npm run test:report
    python3 tools/check_cost_gate.py costs-reports.json

## Cost evidence

See docs/m1-cost-exhibit.md: flat `driver/verify` read_count ~3 versus 2496
through the gear pipeline, runtime at or below the gear baseline.

M2 note: the TS mini-prover stays toy-only. At the production point one naive buildHonestProof measured {"completed":false,"phase":"trace-lde","elapsedMs":300063.26269199996,"done":22,"total":131072} (Task 17, ledger in .superpowers/sdd/progress.md), so tests/full relies on the Rust fixtures plus the Python replay KATs, two independent provers.
