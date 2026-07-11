# M2 cost receipts

Raw measurement receipts behind the M2 parameter decision. Stage 0
cost-shape spike numbers live here; Task 18 appends the full-artifact
measurements. Every number below is pasted verbatim from tool output on
a real run. A summary never replaces its raw JSON. The M1 exhibit's
"4 to 10% of a block" projection kept no raw numbers; this file exists
so M2 never repeats that mistake.

## Environment

- Date of spike runs: 2026-07-11
- Machine: Linux 6.6.114.1-microsoft-standard-WSL2, 11th Gen Intel(R)
  Core(TM) i7-11700K @ 3.60GHz
- Toolchain: @stacks/clarinet-sdk 3.19.0, vitest 4.1.8, clarinet 3.19.0,
  Node v24.16.0
- Repo rev at measurement: 363571b
- Command per candidate: `python3 tools/measure_spike.py <NAME>`
- Generator: `tools/gen_fullsize.py` (cost-shape prototype; measures COST
  SHAPE only, not correctness; entry point `run`)

## Stage 0 spike measurements

`run_total` is the clarinet-sdk `cost_result.total` for one `run` call on
the generated shape contract; `block_limits` is `cost_result.limit` from
the same entry; `artifact_bytes` counts the generated .clar bytes (a
shape signal only; the real production artifact meets the 80 KB assert
in Task 12).

### CAND_A (depth 17, 23 queries, 16 layers)

```json
{
  "point": "CAND_A",
  "depth": 17,
  "queries": 23,
  "layers": 16,
  "artifact_bytes": 22147,
  "run_total": {
    "write_length": 0,
    "write_count": 0,
    "read_length": 22148,
    "read_count": 3,
    "runtime": 117168277
  },
  "block_limits": {
    "write_length": 15000000,
    "write_count": 15000,
    "read_length": 100000000,
    "read_count": 15000,
    "runtime": 5000000000
  }
}
```

### CAND_B (depth 17, 31 queries, 16 layers)

```json
{
  "point": "CAND_B",
  "depth": 17,
  "queries": 31,
  "layers": 16,
  "artifact_bytes": 22683,
  "run_total": {
    "write_length": 0,
    "write_count": 0,
    "read_length": 22684,
    "read_count": 3,
    "runtime": 157896893
  },
  "block_limits": {
    "write_length": 15000000,
    "write_count": 15000,
    "read_length": 100000000,
    "read_count": 15000,
    "runtime": 5000000000
  }
}
```

### CAND_C (depth 17, 46 queries, 16 layers)

```json
{
  "point": "CAND_C",
  "depth": 17,
  "queries": 46,
  "layers": 16,
  "artifact_bytes": 23688,
  "run_total": {
    "write_length": 0,
    "write_count": 0,
    "read_length": 23689,
    "read_count": 3,
    "runtime": 234263048
  },
  "block_limits": {
    "write_length": 15000000,
    "write_count": 15000,
    "read_length": 100000000,
    "read_count": 15000,
    "runtime": 5000000000
  }
}
```

### FALLBACK_POINT (depth 16, 23 queries, 15 layers)

```json
{
  "point": "FALLBACK_POINT",
  "depth": 16,
  "queries": 23,
  "layers": 15,
  "artifact_bytes": 20989,
  "run_total": {
    "write_length": 0,
    "write_count": 0,
    "read_length": 20990,
    "read_count": 3,
    "runtime": 112929300
  },
  "block_limits": {
    "write_length": 15000000,
    "write_count": 15000,
    "read_length": 100000000,
    "read_count": 15000,
    "runtime": 5000000000
  }
}
```

## Selection

Winner: **CAND_A**.

### Framing: CAND_A, CAND_B, and CAND_C target the same domain

`depth` in `measure_spike.py` is `log_trace + log_blowup` (the LDE
domain's `log2` size). CAND_A (13+4), CAND_B (14+3), and CAND_C (15+2)
all land on depth 17, i.e. the same `2^17`-element domain, the same
proof target; only the trace/blowup split and the resulting query count
differ. FALLBACK_POINT has `log_trace = 12`, one bit smaller, landing
on depth 16, a `2^16`-element domain: half the size. Its lower measured
cost is a smaller-domain effect, not a cheaper way to prove the same
thing, so it is not a like-for-like competitor to CAND_A/B/C in this
round; the PRODUCTION_POINT pin comment records it as the escape hatch
for later stages, per the spec's own framing ("FALLBACK_POINT stays
named as the escape hatch if Stage 1 measurement invalidates this
choice").

### Fractions of block_limits, all four measured points

| Point | conjectured bits | runtime | runtime / limit | read_length | read_length / limit | queries |
|---|---|---|---|---|---|---|
| CAND_A | 100 | 117,168,277 | 2.343% | 22,148 | 0.0221% | 23 |
| CAND_B | 101 | 157,896,893 | 3.158% | 22,684 | 0.0227% | 31 |
| CAND_C | 100 | 234,263,048 | 4.685% | 23,689 | 0.0237% | 46 |
| FALLBACK_POINT | 100 | 112,929,300 | 2.259% | 20,990 | 0.0210% | 23 |

(`python3 tools/soundness.py` confirms all four clear 96 conjectured
bits, matching `test_candidates_clear_96_conjectured`.) `artifact_bytes`
for all four (20,989 to 23,688) sit far under the flattener's 80 KB
assert (Task 12), and none of these synthetic-value contracts touch the
1 MB Clarity value cap; at this cost-shape stage the query count is the
proxy for eventual proof wire size (Task 7 measures the real bundle),
and CAND_A ties FALLBACK_POINT for fewest queries (23) among all four.

### Rule and result

Rule (verbatim from the brief): the cheapest candidate that clears 96
conjectured bits with headroom on every ceiling (block runtime,
read_length, the flattener's 80 KB artifact assert, and Clarity's 1 MB
value cap), ties toward fewer queries. Applied to the three points that
actually compete for the same 2^17 domain: CAND_A, CAND_B, and CAND_C
all clear 96 conjectured bits (100, 101, 100) with enormous headroom
(under 5% of the runtime limit, under 0.03% of the read_length limit,
for all three). Among them, CAND_A has the smallest measured runtime
(117,168,277 vs 157,896,893 for CAND_B and 234,263,048 for CAND_C) and
the fewest queries (23 vs 31 and 46), so it wins outright, with no tie
to break. This matches the plan's expectation: highest blowup
(log_blowup 4) buys the fewest queries at fixed domain size, and the
measured runtime falls monotonically with query count in the order
CAND_A, then CAND_B, then CAND_C, exactly as the per-query cost model
predicts.

CAND_B is rejected: 35% higher measured runtime than CAND_A (157.9M vs
117.2M) and 8 more queries, for one extra conjectured bit (101 vs 100),
neither of which the rule rewards once 96 bits is already cleared.

CAND_C is rejected: double CAND_A's measured runtime (234.3M vs 117.2M)
and double its query count (46 vs 23), the most expensive of the three
same-domain candidates by every measured field.

FALLBACK_POINT is not selected. It measures marginally cheaper than
CAND_A (112.9M vs 117.2M runtime, about 3.6% lower) but at a strictly
smaller LDE domain (2^16 vs 2^17, from `log_trace = 12` instead of 13):
it is not proving the same-sized target, so its lower cost is not a
same-shape win over CAND_A under this rule. It stays named as
`params.FALLBACK_POINT`, registered and gate-tested, as the Stage 1
escape hatch the spec calls for.

No candidate failed a ceiling, so the founder-decision-gate fallback
(Step 12's last sentence) does not apply; PRODUCTION_POINT is pinned to
CAND_A below.

## Task 7: production proving run (rust-proofs-full.json)

Command: cargo run --release --bin prove -- --point full (in interop/; prebuilt with cargo build --release so the timing excludes compilation).
Wall time is the bash time builtin; the fixture is byte-identical across reruns (cmp verified).

```
    Finished `release` profile [optimized] target(s) in 0.03s
     Running `target/release/prove --point full`
point: log_trace=13 log_blowup=4 n_queries=23 pow_bits=8 air_id=11
proved pub="": queries [87052, 70246, 10410, 2908, 33123, 124508, 44054, 23295, 102630, 1893, 95648, 80431, 43873, 94558, 25192, 17821, 905, 39815, 26421, 57841, 12724, 61472, 101719]
proved pub="interop-1": queries [92876, 62260, 111913, 51244, 102525, 46893, 40718, 15570, 117242, 107818, 83089, 106504, 28175, 14247, 89327, 100477, 46046, 26959, 66746, 130297, 40182, 29697, 65959]
proved pub="interop-2": queries [119697, 43562, 68091, 20291, 45804, 71185, 101618, 24987, 17248, 47730, 53149, 99490, 116618, 11487, 44961, 71065, 7171, 94965, 32286, 3914, 130271, 13672, 42265]
wrote fixtures/rust-proofs-full.json

real	0m0.618s
user	0m0.595s
sys	0m0.024s
```

Fixture size on disk:

```
1216179 interop/fixtures/rust-proofs-full.json
```

Per-proof Clarity serialized-argument estimate (tools/proof_size.py; kebab-case name model):

```
pub=''                       total-args=  195954 bytes; largest arg bundles = 194585 bytes; margin to 1MB cap = 853991 bytes
pub='696e7465726f702d31'     total-args=  195963 bytes; largest arg bundles = 194585 bytes; margin to 1MB cap = 853991 bytes
pub='696e7465726f702d32'     total-args=  195963 bytes; largest arg bundles = 194585 bytes; margin to 1MB cap = 853991 bytes
OK: every argument sits under the 1048576 byte Clarity value cap
```

## Full artifact emission (Task 12, raw)

Command: `python3 tools/flatten.py --point full` (repo root). Complete
stdout, verbatim:

```
call-census (full, informational): {'field': 6, 'qm31': 95, 'merkle': 7, 'transcript': 19, 'commit': 9, 'fri': 107, 'query': 17, 'cdeep': 1, 'schedule': 2, 'cair': 2}
list-covariance: checked=6 deferred-to-clarinet=4
wrote /home/calesawr/verifold/contracts/full/field.clar
wrote /home/calesawr/verifold/contracts/full/qm31.clar
wrote /home/calesawr/verifold/contracts/full/cair.clar
wrote /home/calesawr/verifold/contracts/full/cdeep.clar
wrote /home/calesawr/verifold/contracts/full/merkle.clar
wrote /home/calesawr/verifold/contracts/full/commit.clar
wrote /home/calesawr/verifold/contracts/full/fri.clar
wrote /home/calesawr/verifold/contracts/full/query.clar
wrote /home/calesawr/verifold/contracts/full/transcript.clar
wrote /home/calesawr/verifold/contracts/full/schedule.clar
wrote /home/calesawr/verifold/contracts/full/driver.clar
emit-stats: bytes=54928 functions=114 constants=41 gears=11 max-let-depth=9
wrote /home/calesawr/verifold/tools/flat-manifest-full.json
wrote /home/calesawr/verifold/contracts/verifold-flat-full.clar
```

Byte size on disk, verbatim:

```
54928 contracts/verifold-flat-full.clar
```

Comparison to the Task 3 receipts: the CAND_A cost shape spike predicted
`artifact_bytes: 22147` (a shape signal from the synthetic value
generator, explicitly not the real artifact); the real emitted flat full
artifact measures 54,928 bytes, 2.48x the shape proxy and 67.0% of the
80 KB assert (81,920 bytes), leaving 26,992 bytes of headroom. The Task 3
prediction that the real artifact lands comfortably under 80 KB holds.

## Task 18: full-artifact measurements (the exhibit's raw receipts)

Date: 2026-07-11. Machine: Linux 6.6.114.1-microsoft-standard-WSL2,
11th Gen Intel(R) Core(TM) i7-11700K @ 3.60GHz, WSL2.
Toolchain: @stacks/clarinet-sdk 3.19.0 simnet, vitest 4.1.8, Node v24.16.0.
Repo rev at measurement: 490b240.

The original Task 18 Step 1 (one plain `npm run test:report` over the
whole suite) cannot produce these receipts: the toy flat entry only
exists when the tests-support/flat-adapter.ts redirect is armed with
VERIFOLD_DIFF=1, and under real cost enforcement (`--costs` switches
clarinet-sdk to the enforcing LimitedCostTracker) the unflattened
gear-full pipeline aborts on the block read_count limit, which reds the
differential test by construction (run C below). The adjudicated
measurement recipe replaces that step with three runs. Every line below
is pasted verbatim from the raw logs.

### Run A: toy suite, both pipelines in one run

Command: `VERIFOLD_DIFF=1 npx vitest run --exclude "tests/full/**" -- --coverage --costs`

```
 Test Files  15 passed (15)
      Tests  249 passed (249)
   Duration  204.67s (transform 302ms, setup 186ms, import 353ms, tests 202.70s, environment 1.05s)
```

(No fri fuzz timeout on this run: diff mode raises the test timeout to
180 s, so the WSL2 5 s flake the M1 exhibit documented cannot fire here.)

Extraction (the Task 18 Step 2 script), toy lines verbatim:

```
.driver verify calls=18 max_total={"write_length": 0, "write_count": 0, "read_length": 5561419, "read_count": 2556, "runtime": 50669226}
.verifold-flat driver/verify calls=18 max_total={"write_length": 0, "write_count": 0, "read_length": 38748, "read_count": 3, "runtime": 44965292}
```

### Run B: tests/full without the differential file (the headline measurement)

Command: `npx vitest run tests/full/fixtures-full.test.ts tests/full/kats-full.test.ts tests/full/guard-full.test.ts --reporter=verbose -- --coverage --costs`

```
 Test Files  3 passed (3)
      Tests  21 passed (21)
   Duration  14.29s (transform 71ms, setup 60ms, import 40ms, tests 12.99s, environment 1.05s)
```

Extraction, verbatim:

```
.verifold-flat-full driver/verify calls=5 max_total={"write_length": 0, "write_count": 0, "read_length": 54929, "read_count": 3, "runtime": 739929603}
```

Simnet wall time for one full verify() (the cost snapshot console line,
verbatim):

```
full driver/verify simnet wall time: 2340ms
```

### Run C: the impossibility receipt (an expected failure, not a green claim)

Command: `npx vitest run tests/full/differential-full.test.ts --reporter=verbose -- --costs`
Result: 1 failed | 10 passed (11). The one failure is "every fixture
verify agrees: accept parity on all sides", and it fails on the GEAR side
only: one driver-full verify() call at PRODUCTION_POINT exceeds the real
Stacks block read_count budget when cost limits are enforced. Verbatim
error from the raw log (raised at fri-full:117:46 inside the driver-full
verify call):

```
Error: RuntimeCheck(CostBalanceExceeded(ExecutionCost { write_length: 0, write_count: 0, read_length: 29963833, read_count: 15003, runtime: 186855474 }, ExecutionCost { write_length: 15000000, write_count: 15000, read_length: 100000000, read_count: 15000, runtime: 5000000000 }))
```

The harness assertion it reds, verbatim:

```
AssertionError: abort parity on (driver, verify): gear aborted, flat returned: expected false to be true
```

This failure IS the measurement: the unflattened 11 contract gear
pipeline cannot fit one production size verify() inside a block's
read_count budget (15003 needed, 15000 available), while the flattened
artifact spends read_count 3 on the same call (run B). The suite failure
is expected under cost enforcement and is not published anywhere as
green.

### Spike versus real: the deviation note

The Stage 0 cost shape spike measured CAND_A run runtime 117,168,277
(2.343% of the block limit; raw JSON above in this file), and the M1
exhibit projected "4 to 10% of a block" at full parameters. The real
measured verifier runtime is 739,929,603 (14.80% of the block limit),
6.3x the spike number and above the projected band. The spike missed
real verifier work: the per query Merkle rebuilds, the DEEP row, and the
23 query, 16 beta transcript are all absent from the synthetic shape
contract. Both numbers stay recorded here; the deviation is the lesson,
and the two are never blended.

cost-gate: full-flat driver/verify runtime 739929603 of 5000000000

Gate proof, after the line above was appended. The run A and run B
reports were merged into one temporary file (scratch, uncommitted;
`costs-reports.json` itself is gitignored and never committed) and the
gate ran against it, output verbatim:

```
$ python3 tools/check_cost_gate.py <merged run A + run B costs-reports.json>
cost gate PASSED: toy flat 44965292 <= gear 50669226; full flat 739929603 within the receipts baseline plus 10 percent
exit: 0
```
