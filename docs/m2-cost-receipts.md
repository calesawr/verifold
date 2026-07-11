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
