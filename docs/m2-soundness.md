# M2 soundness memo: the pinned point and both accountings

Status: self assessed by the implementers, open to expert challenge
(docs/expert-review-questions.md item 3 and DRIVER-9 reference this memo).
Every number below is reproduced by the commands shown; the verbatim tool
output is in the appendix.

## The pinned point

`tools/params.py` PRODUCTION_POINT (pinned in Stage 0, Task 3, from measured
cost spikes with receipts in docs/m2-cost-receipts.md), CAND_A: `log_trace`
13, `log_blowup` 4, `n_queries` 23, `pow_bits` 8, `air_id` 11. The derived
constants, `python3 tools/params.py --json PRODUCTION_POINT`, verbatim:

    {"B01": {"A": 1934003464, "B": 931230206, "C": 2023238517}, "BLOWUP": 16,
    "DOMAIN_SIZE": 131072, "H": {"im": 838891026, "re": 1389168750},
    "LOG_DOMAIN": 17, "N_LAYERS": 16, "OFF": {"im": 343598868, "re":
    1799120754}, "PARAMS": "171010080000000b", "POW_THRESHOLD":
    1329227995784915872903807060280344576, "SEL": {"A": 1934003464, "B":
    1216253441, "C": 2023238517}, "SX": 1420207432, "SY": 2023238517,
    "TRACE_ROWS": 8192}

The named fallback (FALLBACK_POINT: `log_trace` 12, `log_blowup` 4,
`n_queries` 23, `pow_bits` 8, `air_id` 11) is kept in params.py; the last
section states what changes under it.

## Conjectured accounting, term by term

Model: ethSTARK Conjecture 1 style capacity accounting, as pinned with
citations inside tools/params.py and tools/soundness.py. The conjecture is
named plainly: it is STANDARD PRACTICE in deployed STARK systems and it is
UNPROVEN. Terms from `tools/soundness.py bits(PRODUCTION_POINT)`:

| term | bits | meaning |
| --- | --- | --- |
| query_term | 92 | `n_queries * log_blowup` = 23 * 4, each FRI query's rate contribution before grinding |
| proven_query_term | 46.0 | `query_term / 2`, the Johnson bound halving; not part of the conjectured headline, listed here because it is a `bits()` return field |
| grinding_term | 8 | `pow_bits`, the proof of work grinding contribution |
| ood_term | 123.99999999731277 | `4 * log2(2^31 - 1)`, the QM31 out of domain challenge space ceiling |
| transcript_term | 128.0 | the sha256 transcript squeeze and PoW check ceiling (16 bytes read) |
| applied_cap | none | the additive sum (query_term + grinding_term = 100) is below both ceilings, so neither caps the accounting |

Headline: 100 conjectured bits (target: at least 96). The dominant term is
n_queries * log2(blowup) + pow_bits = 23 * 4 + 8 = 100; the QM31
out of domain sampling terms (~2^-124 each) and the sha256 collision terms
(~2^-128) cap the accounting far above the target and do not bind.

Note on the cap itself: the terms are combined as a minimum rather than as
an error sum. A full error-sum combination (2^-100 + 2^-124 + 2^-128) lowers
the headline by about 0.0000001 bits (roughly (2^-24 + 2^-28) / ln 2), far
below the target margin and not enough to change any figure stated in this
memo.

## Proven (Johnson bound) accounting

Formula, as implemented in tools/soundness.py, citing the ethSTARK
provable versus conjectured discussion (StarkWare, "ethSTARK Documentation",
IACR ePrint 2021/582):

    proven = n_queries * log_blowup / 2 + pow_bits = 23 * 4 / 2 + 8 = 54.0

capped by the same ood_term/transcript_term ceilings (neither binds here
either). Result: 54.0 proven bits. It is lower than the conjectured figure
because the Johnson bound only certifies list decoding up to the Johnson
radius, so each query contributes fewer certified bits at the same blowup;
the conjectured accounting assumes capacity achieving behavior beyond that
radius. Both figures are always published together; no public claim states
the conjectured number alone.

## Drawn, not deduplicated: the quantified disclosure

Query indices are drawn independently and NOT deduplicated (the DRIVER-3
pin, contracts/driver.clar and expert-review-questions.md DRIVER-3/CAIR-7).
At the production domain:

    n_queries=23 DOMAIN_SIZE=131072 log_blowup=4
    expected duplicates per proof = q^2/(2*DOMAIN_SIZE) = 0.002018
    expected conjectured bits lost ~= dupes * log2(blowup) = 0.008072

Reading: about 0.002018 expected duplicate draws per proof, costing about
0.008072 conjectured bits in the worst reading (a duplicate contributes its
log2(blowup) bits only once). The conjectured headroom above the 96 bit
target is 100 minus 96, 4 bits; 0.008072 bits is about 0.2 percent of that
margin, so dedup machinery is deliberately not added. This memo is the
disclosure.

## Wire layer independence scope (from Stage 1, Task 8)

The from scratch Python replay (tools/gear6e_replay.py) independently
reproduces the transcript, Merkle, and fold layers AT FULL SIZE (the
production KAT export, tools/kats-full.json, pins them against the Rust
fixtures backing tests/full/kats-full.test.ts; 3730 assert statements
across the three fixture proofs per the Task 8 report, zero divergence).
Its interpolation layer independence remains TOY ONLY: at the production
trace size the replay consumes the same evaluation strategy as the prover
(it reads the Rust fixture's committed trace/composition columns) rather
than an independent Gaussian solve reconstruction; only the toy-size
membership gate (PHASE B, 10 random draws, module level code, reruns on
every invocation) exercises a from scratch interpolation check. Consequence,
stated plainly: cross-prover equality at full size certifies the wire and
fold conventions; the interpolation convention at full size rests on the
Stwo cross-checks (interop harness, both points). Task 17 measured a
from-scratch TypeScript prover build at the production point (naive
trace-LDE evaluation: 22 of 131072 points in 300 seconds) and dropped it by
the keep threshold rule, so tests/full relies on two independent provers,
the Rust fixtures and the Python replay KATs, not three, per the note
appended to docs/flatten.md.

## Under the fallback point

FALLBACK_POINT (`log_trace` 12, `log_blowup` 4, `n_queries` 23, `pow_bits`
8, `air_id` 11): 100 conjectured bits, 54.0 proven bits (appendix JSON),
identical to PRODUCTION_POINT because the soundness formula depends only on
`n_queries`, `log_blowup`, and `pow_bits`, none of which differ between the
two points. Operationally the difference is domain size, not soundness:
FALLBACK_POINT's `log_trace` of 12 lands on a 2^16 element LDE domain (15
FRI layers, 4096 trace rows) versus PRODUCTION_POINT's 2^17 element domain
(16 FRI layers, 8192 trace rows), so it proves a computation with half the
trace capacity. The Stage 0 spike (docs/m2-cost-receipts.md) measured
FALLBACK_POINT about 3.6 percent cheaper in runtime than CAND_A (112,929,300
against 117,168,277) but the receipts record that comparison as not a
same-shape win, since the two points do not target the same domain size;
that is why CAND_A, not FALLBACK_POINT, was pinned as PRODUCTION_POINT.
Switching to it is a params.py pin change plus full regeneration and a
fixture re-run; no verifier logic changes. Adopting FALLBACK_POINT would
also require assigning it a new air_id (12): air_id 11 now names the size
2^13 statement pinned as PRODUCTION_POINT, and the registry is monotonic,
so an id already in use is never reassigned to a different statement.

## Appendix: verbatim tool output

`python3 -c "...bits(PRODUCTION_POINT)/bits(FALLBACK_POINT)..."` (the Task 19
Step 1 command):

```json
{
  "PRODUCTION_POINT": {
    "point": {
      "log_trace": 13,
      "log_blowup": 4,
      "n_queries": 23,
      "pow_bits": 8,
      "air_id": 11
    },
    "bits": {
      "conjectured": 100,
      "proven": 54.0,
      "terms": {
        "query_term": 92,
        "proven_query_term": 46.0,
        "grinding_term": 8,
        "ood_term": 123.99999999731277,
        "transcript_term": 128.0,
        "applied_cap": "none"
      }
    }
  },
  "FALLBACK_POINT": {
    "point": {
      "log_trace": 12,
      "log_blowup": 4,
      "n_queries": 23,
      "pow_bits": 8,
      "air_id": 11
    },
    "bits": {
      "conjectured": 100,
      "proven": 54.0,
      "terms": {
        "query_term": 92,
        "proven_query_term": 46.0,
        "grinding_term": 8,
        "ood_term": 123.99999999731277,
        "transcript_term": 128.0,
        "applied_cap": "none"
      }
    }
  }
}
```
