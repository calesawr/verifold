# M2 cost exhibit: one production verify() on simnet

Measured on Linux 6.6.114.1-microsoft-standard-WSL2 (11th Gen Intel(R)
Core(TM) i7-11700K @ 3.60GHz, WSL2), 2026-07-11, via cost instrumented
vitest runs (@stacks/clarinet-sdk 3.19.0 simnet, the real Stacks cost
model). Raw receipts: docs/m2-cost-receipts.md (Task 18 section). Every
number below is a measurement from those runs; the one projection quoted
below is quoted as a projection and retired.

## verifold-flat-full "driver/verify": all five dimensions

One verify() of a real Rust proven fixture at the pinned production point
(tools/params.py PRODUCTION_POINT), from run B of the receipts:

| dimension | measured | per-block limit | fraction of block |
| --- | --- | --- | --- |
| runtime | 739929603 | 5000000000 | 14.80% |
| read_count | 3 | 15000 | 0.02% |
| read_length | 54929 | 100000000 | 0.055% |
| write_count | 0 | 15000 | 0% |
| write_length | 0 | 15000000 | 0% |

Proof size on the wire: 194585 bytes for the largest argument (the
bundles list; measured in Task 7, receipt in docs/m2-cost-receipts.md),
which is 81.4% headroom under the 1,048,576 byte Clarity value cap.
Simnet wall time for one verify(): 2340 ms (informational; the cost
snapshot test in tests/full/fixtures-full.test.ts).

It fits one transaction: a single Stacks transaction may consume up to
the full block budget, and 14.80% of the runtime budget leaves about
6.8x headroom. No stronger claim is made.

## Toy comparison (continuity with the M1 exhibit) and the enforced gate

From run A of the receipts (VERIFOLD_DIFF=1 over the whole toy suite,
249 of 249 tests passing, both pipelines measured in one run):

| entry point | gear pipeline (toy) | verifold-flat (toy) |
| --- | --- | --- |
| driver verify max totals | {"write_length": 0, "write_count": 0, "read_length": 5561419, "read_count": 2556, "runtime": 50669226} | {"write_length": 0, "write_count": 0, "read_length": 38748, "read_count": 3, "runtime": 44965292} |

Gate, enforced by `python3 tools/check_cost_gate.py` on every exhibit
regeneration (the run A and run B reports merged into one file): toy
flat runtime at or below gear runtime, and full flat runtime within the
receipts baseline plus 10 percent. Output from this run, verbatim:

    cost gate PASSED: toy flat 44965292 <= gear 50669226; full flat 739929603 within the receipts baseline plus 10 percent

## The impossibility receipt: the measured case for flattening

Run C of the receipts executed the gear versus flat differential
(tests/full/differential-full.test.ts) under real cost enforcement. The
flattened artifact returned normally; the unflattened 11 contract gear
pipeline aborted mid verify() on the block read_count limit. Verbatim:

    Error: RuntimeCheck(CostBalanceExceeded(ExecutionCost { write_length: 0, write_count: 0, read_length: 29963833, read_count: 15003, runtime: 186855474 }, ExecutionCost { write_length: 15000000, write_count: 15000, read_length: 100000000, read_count: 15000, runtime: 5000000000 }))

read_count 15003 of 15000: the reference gear pipeline cannot complete
one production size verify() inside a real Stacks block's read_count
budget at all, while the flattened artifact spends read_count 3 on the
same call. This is the measured confirmation of the flattening
architecture's premise. The differential suite failure under enforcement
is expected by construction and is documented in the receipts, never
published as green.

## Against the old projection, honestly

The M1 exhibit projected "4 to 10% of a block" at full parameters. The
measured figure is 14.80% of the block runtime budget (739929603 of
5000000000), ABOVE that band. The projection came from a cost shape
spike (CAND_A, runtime 117168277) that missed real verifier work: the
per query Merkle rebuilds, the DEEP row, and the 23 query, 16 beta
transcript are all absent from the synthetic shape contract. The
receipts carry both numbers and the deviation is stated as a lesson,
never blended. The binding dimension at full size is runtime, at 14.80%
of its limit. The projection is retired; this table supersedes it
wherever the two disagree.
