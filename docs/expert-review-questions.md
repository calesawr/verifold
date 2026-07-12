# Verifold -- Request for Expert Review (STARK cryptographer)

Date started: 2026-06-08
Purpose: a self-contained explainer + question list for an external STARK cryptographer. It is written
so someone who has never seen this project can understand it and answer. This document is the living
source for any email we send; pull the relevant section into the email and keep the project context.

Refreshed: 2026-07-12 (M3b). Background sections now state the shipped M2/M3a reality with receipt
citations; items answered by receipts carry the resolved marker and live in Appendix R with in-place
stubs; the open asks are triaged in Section 0. The living-document protocol above still governs.

---

## 0. Start here: the open asks (2026-07-12 triage)

The build shipped: production parameters, one flattened contract, live on Stacks testnet with five
attested proofs (docs/m3-testnet-receipts.md). The empirical questions below are closed by receipts and
cross-checks (resolution markers inline; the items this refresh closed are in Appendix R). What remains
for an expert is judgment, not measurement. The twelve asks, in priority order, each linking to its full
item below:

1. Item 3 plus DRIVER-9: bless the soundness accounting. 100 conjectured bits (ethSTARK Conjecture 1
   capacity accounting, which is unproven) alongside 54.0 proven bits at the pinned point, including the
   drawn-not-deduped query disclosure (docs/m2-soundness.md).
2. Item 5: is the sha256 duplex Fiat-Shamir construction (one 32 byte state, tagged absorbs, squeeze
   advances the state) adequate at this soundness target, and is the locked challenge order sound?
3. Item 10 with DRIVER-1, CAIR-2, and the tagging half of item 4: Merkle leaf versus node domain
   separation. Leaf preimages are 16 bytes and node preimages are 64, length disjoint; is explicit
   tagging required for the soundness argument, and if so which tags?
4. Item 8: the 16 byte big endian reduce for challenges carries total variation bias of about 2^-124;
   acceptable, or is rejection sampling wanted?
5. Item 9: the grinding accounting, threshold form 2^(128 - pow_bits) with pow_bits at least 1; any
   objection?
6. Item 6: confirm the zero denominator guarantees are structural (the FRI line domain never contains
   x = 0; the DEEP denominators never vanish for an honest proof).
7. CAIR-1: the composition is four unsplit coordinate columns (no COMPOSITION_LOG_SPLIT); the first AIR
   of degree 2 or higher reopens the wire format; confirm the deferral is safe for the shipped statement.
8. CAIR-3: the lifted model mask step coincidence is proven for THIS AIR only (bound equals log_size);
   what breaks first for a general AIR?
9. CAIR-4: the equal seed boundary idiom; unequal seeds need a line interpolant or public input boundary
   values; confirm the shipped special case is sound.
10. CAIR-5: quotient accumulation order (ours ascending, Stwo Horner reversed); harness D1 shows numeric
    agreement for this AIR; confirm the order is soundness neutral in general.
11. CAIR-6: our Fiat-Shamir absorbs the seven OOD openings as seven tagged 16 byte absorbs where Stwo
    mixes one flattened felt list; a deliberate deviation; confirm it costs nothing in the FS argument.
12. CDEEP-2: periodicity samples are skipped (unlifted full size columns); confirm the reading.

Quick yes or no confirmations that remain open: DRIVER-3 and CAIR-7 (drawn not deduped queries; the
quantified disclosure is in docs/m2-soundness.md), DRIVER-5 (fold_step 1 scope), DRIVER-6 (per query
independent decommitment), DRIVER-8 (wire format conjugate choice).

Previously resolved empirically (gear 6e and 6f markers inline, kept in place): QUERY-1, QUERY-2,
QUERY-3, QUERY-4, QUERY-6, CAIR-8/CDEEP-1, CDEEP-3.

## 1. What this is, in one paragraph

We are building **Verifold**: an on-chain verifier for **STARK proofs**, written entirely in **Clarity**
(the smart-contract language of the **Stacks** blockchain, a Bitcoin layer). As of 2026-07-12 the
verifier is complete at a pinned production parameter point and live on Stacks testnet: real proofs from
an independent Rust prover built on Stwo verify on-chain, with five recorded attestations (receipts in
docs/m3-testnet-receipts.md). It remains a prototype, not a production system. **We do not have a STARK
cryptographer on the team**, so before we make any "secure" claim or ship to mainnet we want expert eyes
on the design decisions where we chose a sensible default and tested it empirically but cannot ourselves
bless it against the intended soundness argument.

## 2. Background you may need (we don't assume Stacks/Clarity knowledge)

- **Stacks / Clarity.** Stacks is a Bitcoin layer-2. Clarity is its smart-contract language: it is
  *decidable* and deliberately limited -- **no loops, no recursion, no dynamic dispatch**. We iterate by
  folding over fixed-length lists (loop unrolling). Integers are **128-bit unsigned**; subtraction
  underflow aborts the transaction. We have `sha256`, `keccak256`, buffer ops, and `buff-to-uint-be`
  (max 16 bytes). There is no native field arithmetic and no big-integer type.
- **Why Mersenne-31 + Circle STARKs.** We use the field **M31**, `p = 2^31 - 1`. A product of two
  reduced elements is `< 2^62`, so it fits a 128-bit uint with no big-integer library. Because
  `p - 1 = 2 * 3^2 * 7 * 11 * 31 * 151 * 331` has 2-adicity exactly 1, there is no `2^k` smooth subgroup
  for classical FRI -- but `p + 1 = 2^31`, so we target **Circle STARKs** (Stwo family). The secure
  field for challenges is **QM31**, a degree-4 extension (~124-bit), built as a tower
  `CM31 = M31[i]/(i^2+1)`, `QM31 = CM31[u]/(u^2 - (2+i))`.
- **The pieces of a STARK verifier** we are implementing: finite-field arithmetic, a Merkle commitment
  check, a **Fiat-Shamir transcript** (turns the interactive challenge protocol non-interactive by
  hashing), the **FRI low-degree test** (folds a committed codeword in half against a random challenge
  per layer), and **AIR** (the constraint system that says what computation the proof proves). A real
  proof produced by a Stwo-based Rust prover is verified end to end by the deployed contract (interop/
  pins the cross-checks at both the toy and the production parameter points; docs/m3-testnet-receipts.md
  records the on-chain runs).

## 3. What is built today (and how it is tested)

The verifier is complete and deployed to Stacks testnet at production parameters. Eleven gears (M31
field, QM31 tower, sha256 Merkle, Fiat-Shamir transcript, challenge schedule, FRI fold, circle AIR, DEEP
quotients, query map, commit, driver), all built test-first, are flattened into one generated Clarity
contract (contracts/verifold-flat-full-production.clar, 54926 bytes; docs/m3-testnet-receipts.md) that CI
regenerates and diffs on every push.

| layer | evidence |
|---|---|
| vitest suites | 244 baseline tests plus the full-parameter suite in tests/full; commands and counts in docs/flatten.md |
| independent provers | an independent Rust prover built on Stwo (interop/) and a from-scratch Python replay (tools/gear6e_replay.py) pin the known-answer vectors; the committed production fixtures are real Rust proofs |
| interop harness | a 16-check cross-validation against Stwo's own functions, run at both the toy and the production points (interop/) |
| measured cost | one production verify() = runtime 739929603 of the 5000000000 block limit, 14.80 percent of a block (docs/m2-cost-exhibit.md) |
| soundness accounting | 100 conjectured bits (capacity conjecture, unproven) and 54.0 proven bits, both itemized (docs/m2-soundness.md, tools/soundness.py) |
| testnet liveness | deployed at block 4040277 by ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F, five proofs attested on-chain; liveness only, not a security claim (docs/m3-testnet-receipts.md) |

We also ran self-audits and mutation campaigns (inject a wrong operation, confirm a test fails; the
full-artifact mutation smoke runs in CI). **None of this substitutes for expert review of the
protocol-level decisions below.**

## 4. What we are NOT claiming

We are not claiming the verifier is sound or production-ready, and no security claim is made before
independent expert review and a professional audit. Empirical prover agreement is now established (the
interop harness cross-checks the conventions against Stwo's own functions at both parameter points, and
real Rust proofs verify on-chain), so the open risk has moved: we tested internal consistency and
empirical agreement; we cannot ourselves confirm that the composed protocol achieves the intended
soundness target. That is exactly what we are asking about.

## 5. The questions (prioritized)

### A. Soundness-critical -- a wrong default here breaks security

1. **FRI fold normalization + tower constants must match the real prover.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
   Full text and citation: Appendix R.

2. **Classical vs circle inner-line map.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
   Full text and citation: Appendix R.

3. **Soundness parameters.** We have not fixed: number of FRI queries, blowup/rate, grinding bits, and
   whether to target conjectured (capacity) or proven (Johnson-bound) soundness. **Ask:** for a
   ~100-bit security target on a trace of size ~2^n (we can specify n), what query count / blowup /
   grinding do you recommend, and does the ~124-bit QM31 make the commit-phase error negligible?

   **Resolved 2026 M2 (self-answered, still open to expert challenge):** pinned at
   PRODUCTION_POINT in tools/params.py: log_trace 13, blowup 2^4, 23 queries,
   8 grinding bits, giving 100 conjectured bits (capacity accounting,
   ethSTARK Conjecture 1 style) and 54.0 proven (Johnson-bound) bits, both
   itemized term by term in docs/m2-soundness.md and computed by tools/soundness.py.
   We target the conjectured figure and always publish the proven figure alongside.
   On the sub-question: yes by our arithmetic, the ~2^-124 QM31 commit-phase terms
   and the 2^-128 sha256 terms sit far above the 96-bit target and do not bind; the
   query/grinding terms dominate (the memo shows every term).

4. **Opening binding (obligation C) + final layer.** We built the fold-consistency and final low-degree
   checks and, in gear 6d-i, a Merkle-bound opening with a **default** QM31-leaf encoding: the canonical
   16-byte form (`c0` first, each limb 4-byte big-endian, byte-identical to our transcript `absorb-qm31`),
   then a single **untagged** `sha256`; a non-reduced limb (`>= p`) is rejected. **Ask:** does the target
   prover use this leaf encoding (byte layout, limb order, and whether leaves vs internal nodes are
   domain-separated/tagged), does it commit the trace and composition under separate roots or batched,
   how is the final FRI layer conveyed (a single constant vs a coefficient list vs evaluations), and what
   is the exact degree bound `deg_final = deg / 2^L`?

5. **Fiat-Shamir construction + challenge order.** Our transcript is a sha256 "duplex": state is one
   32-byte digest; `absorb = sha256(state || 0x00 || type_tag || msg)`, `squeeze = sha256(state ||
   0x01)` reduced mod p over the first 16 bytes (we accept a ~2^-124 bias from `2^128 mod p = 16`, no
   rejection sampling); the seed is `sha256(domain_label || version || params || sha256(public_inputs))`
   (strong FS). Squeezing advances the state, so "absorb-before-squeeze" is structural. **Ask:** is this
   construction adequate for the soundness target (vs a sponge/Poseidon transcript), and is our intended
   challenge order correct -- absorb each FRI layer root, derive that layer's `beta`, and sample query
   indices only after all roots + the final layer are absorbed and grinding passes?

6. **Zero-denominator domain guarantees.** We abort (reject) rather than return a silent zero in two
   places: the FRI fold aborts if the source point `x = 0`, and the QM31 inverse aborts on a zero norm
   (`a = 0`). **Ask:** confirm the FRI line-domain coset never contains `x = 0` (the order-4 circle
   point's x-coordinate), and that the AIR DEEP-quotient denominators (out-of-domain point minus domain
   point) are structurally nonzero -- so an honest proof never triggers these aborts.

### A2. AIR constraint system (gear 6b -- just built)

We built the AIR composition-evaluation core against a TOY: a single-column Fibonacci trace over an
order-9 multiplicative subgroup of M31, with vanisher `Z = x^9 - 1` and composition
`= q_trans + alpha*q_b0 + alpha^2*q_b1`. We validated the evaluation MACHINERY (constraint eval ->
quotient -> random-linear-combination); the protocol-specific shape below is a documented default.

- **AIR-1. Circle-domain vanishing polynomial.** Our `Z(x) = x^9 - 1` is the multiplicative-subgroup
  vanisher. The real circle-STARK domain is a coset of the order-`2^k` circle group, with a vanisher
  built from the `pi(x) = 2x^2 - 1` doubling map (we confirmed `x^n - 1` does NOT vanish on the circle
  domain). What is the correct circle-domain vanishing polynomial and the half-coset structure?
- **AIR-2. Real constraint set.** The toy has one column and a 3-term recurrence. For the target
  computation: what columns, what transition/boundary constraints, what constraint degrees (mixed
  degrees need degree-adjustment factors), and which rows does each hold on?
- **AIR-3. Composition combination convention.** We use a single challenge with powers
  (`q_t + alpha*q_b0 + alpha^2*q_b1`) and next-row `= g.z`. Does the target prover use independent
  per-constraint challenges, and does it split the composition into multiple degree-bounded columns
  `C^(k)` (Stwo does), each separately opened out-of-domain? What is the exact constraint ordering?
- **AIR-4. Composition degree + scaling.** The real composition often exceeds the trace degree and is
  split as `C(x) = sum_k x^{n*k} C^(k)(x)`. What is `deg(C)`, the split, and any constant the prover
  scales the composition by (the analog of the FRI `2^L` factor) that our quotient normalization must match?
- **AIR-5. AIR Fiat-Shamir order (gear 6d-ii built a default).** We locked a default schedule:
  `init(ctx) -> absorb trace-root -> squeeze alpha -> absorb comp-root -> squeeze z (QM31) -> absorb the four
  OOD openings T(z),T(g.z),T(g^2.z),C(z) -> squeeze gamma -> per layer (absorb fri-root -> squeeze beta) ->
  absorb final -> grinding (pow_bits) -> absorb nonce -> draw N query indices`. **Ask:** does the target
  prover use this order — especially the OOD openings absorbed *before* `gamma` (our gear-6c soundness closure
  depends on it) — this `ctx/PARAMS` byte layout (`DOMAIN_LABEL||VERSION||N,L,blowup,pow_bits,air_id||
  sha256(pub)`), this domain-size for the query modulus, and this query-index reduction (raw `squeeze mod
  domain-size` vs a low-bit slice)? A query-reduction mismatch is a completeness break, not a soundness hole.
- **AIR-6. DEEP quotient + combination convention (gear 6c just built).** We bind the openings to the
  committed trace/composition by forming DEEP quotients `(P(x) - P(m))/(x - m)` at each mask point
  (`m` in `{z, g.z, g^2.z}` for the trace, `{z}` for the composition) and combining them as
  `d0 + gamma*d1 + gamma^2*d2 + gamma^3*dC` (a single `gamma` with powers). Does the target prover use
  independent per-quotient challenges instead, batch per composition-column, and what exact mask set /
  next-row offsets does it use? Also confirm the DEEP point `z` (and its shifts) and `0` are structurally
  disjoint from the FRI evaluation domain, so an honest proof never hits our zero-denominator abort.

### A3. Circle evaluation domain + query map (gear 6d-iii -- just built)

We map a Fiat-Shamir query index `q` to the base-field point `x_q` the verifier opens at. M31 has no
power-of-two multiplicative subgroup, so the domain is on the circle group (norm-1 elements of CM31, order
`2^31`): a point is `OFF * H^i`, `x_q = Re(point)`, and we reproduce Stwo's canonic coset with generator
`G = (2, 1268011823)`, `OFF = G^(2^26)`, `H = G^(2^28)`, for the toy `DOMAIN_SIZE = 16`. These are
**completeness** questions (a wrong default makes honest proofs fail, it does not break soundness), but each
must match the real prover bit-for-bit before interop. The single most useful answer is a known-answer vector:
the prover's committed `x` for a few query indices at a known `log_size`.

- **QUERY-1. Index ordering / bit-reversal.** **[EMPIRICALLY RESOLVED, gear 6f]** -- Stwo's own `domain.at(bit_reverse_index(q, log))` reproduces our committed order (interop harness A2/A3). Original text: Stwo commits the evaluation array in bit-reversed order and
  indexes it with `domain.at(bit_reverse_index(query, log_size))`. We default to `query-point(q) =
  domain-point(bitrev_L(q))`. Is `q` a bit-reversed position, and does the committed Merkle leaf at index `i`
  sit at the bit-reversed or the natural geometric position? (Our highest completeness risk.)
- **QUERY-2. Coset offset.** **[EMPIRICALLY RESOLVED, gear 6f]** -- `CanonicCoset::new(4).circle_domain()` IS our domain. Original text: Do you use exactly Stwo's canonic "odds" coset (`OFF = G^(2^(31-L-1))`,
  half-coset step `G^(2^(31-L+1))`), or another standard-position offset? The `x_q` values depend on it.
- **QUERY-3. Circle first-fold twiddle.** **[EMPIRICALLY RESOLVED, gear 6f]** -- Stwo's `fold_circle_into_line`/`fold_line` reproduce our V1/V2/V3/final exactly (harness E1-E3). Original text: Stwo's `fold_circle_into_line` (layer 0) divides by the point's
  `y`, while line layers `>= 1` use `1/x` (our `fri-fold-step`). We expose `Im(P)`/y for the deferred circle
  first-fold. Confirm layer 0 uses `1/y` (or `1/(2y)`) and that the alpha/alpha^2 accumulation and any `1/2`
  normalization match.
- **QUERY-4. Mask shifts on the circle.** **[RESOLVED BY GEAR 6e]** -- the AIR is now a real
  circle AIR (cair.clar): the mask is circle rotation by the trace-coset step, exactly as asked.
  The remaining mask question is CAIR-3 (the lifted-model coincidence), section A5. Original text: `deep.clar` uses multiplicative trace shifts `g, g^2` for
  `{z, g.z, g^2.z}`. On the circle, "shift by one trace row" is circle rotation (CM31 mul by the step point),
  not base-field multiplication. Which does the prover use? (Affects DEEP's gz/g2z, not just the domain.)
- **QUERY-5. Real LDE size / blowup.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
  Full text and citation: Appendix R.
- **QUERY-6. Generator / source pin.** **[EMPIRICALLY RESOLVED, gear 6f]** -- pinned by rev cca98119; harness A1. Original text: We use `M31_CIRCLE_GEN = (2, 1268011823)`. Stwo is pre-1.0; please
  confirm the generator and `index_at` against the exact prover commit, in case of source drift.

### A4. The query driver / whole-verifier glue (gear 6d-iv -- just built)

`driver.clar` is the top-level `verify()`: it re-derives every challenge from the schedule, binds every
opening (trace, composition, the DEEP/p0 first layer, and all inner FRI layers) to its committed root
*by position* (Merkle direction bits derived from the expected position; exact path lengths asserted),
constructs every fold input itself (the proof carries only values and sibling hashes), runs the circle
fold (1/y) plus three line folds per query, and compares the size-1 terminal to the transmitted final.
Layer map: `fri-roots[0]` commits the p0 circle column (Stwo `commit_first_layer`); `betas[0]` (drawn
right after) is the circle-fold challenge; `fri-roots[1..3]` commit the line layers pre-fold; per-layer
consistency is the Stwo `verify_and_fold` splice (the carried fold value is hashed into the next
committed tree), with the only explicit equality at the terminal.

- **DRIVER-1. Leaf/commitment encoding.** We commit FRI first and inner layers with one-QM31-per-leaf
  `sha256(enc16)` leaves and untagged `sha256(l || r)` nodes (the 6d-i default, now backing FIVE trees).
  Stwo (dev, cca98119) commits `SecureColumnByCoords` (4 base-field columns) with optional leaf packing.
  Confirm the target prover's exact first/inner-layer leaf layout, and whether leaf/node domain
  separation is required for the soundness argument (leaf preimages are 16 bytes, node preimages 64 --
  length-disjoint -- but tagging remains the open 6d-i TODO).
- **DRIVER-2. Toy degeneracy (QUERY-4's consequence), two parts.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
  Full text and citation: Appendix R.
- **DRIVER-3. Query multiset.** Stwo sorts + dedups query positions (`Queries::new` BTreeSet); our
  schedule emits N raw indices and the driver verifies each independently -- duplicates silently reduce
  the effective unique-query count (~33% chance of >= 1 collision at toy size). Should the driver dedup,
  and is PARAMS-N "drawn" or "unique"?
- **DRIVER-4. Last-layer mapping / the L bump.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
  Full text and citation: Appendix R.
- **DRIVER-5. First-layer alpha scope / fold_step.** Stwo's first `folding_alpha` also batches multiple
  first-layer columns (alpha^2 accumulation), and `fold_step > 1` uses squared alpha powers. The toy has
  one secure column and fold_step = 1. Confirm `FriConfig.fold_step = 1` for the target, and that
  multi-column accumulation is an accumulator-over-columns change only, not a proof-shape rework.
- **DRIVER-6. Per-query independent decommitment.** We re-transmit overlapping witness hashes per query;
  Stwo merges sorted-deduped subsets into one witness stream. We believe this is byte-redundancy only
  (each query independently bound to the same roots). Confirm no soundness requirement forces witness
  sharing across queries.
- **DRIVER-7. Cost envelope.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
  Full text and citation: Appendix R.
- **DRIVER-8. Wire format.** Confirm the target prover emits the DEEP-quotient column commitment as our
  `fri-roots[0]`, and that trace/composition decommitments are queried-positions-only (no conjugate
  trace openings) -- i.e. that our witness-sourced conjugate choice matches the wire format.

### A5. The real circle AIR + live DEEP quotients (gear 6e -- just built)

Gear 6e killed the rate-1 wart flagged in DRIVER-2: the trace is now a single-column additive
Fibonacci on the size-8 canonic circle coset at blowup 2 (rate 1/2), the DEEP quotients are the
LIVE Stwo path (complex_conjugate_line_coeffs + CM31 denominator_inverses), the composition is
sampled as FOUR coordinate openings absorbed individually pre-gamma (a single recombined opening
is a proven completeness break -- pair-vanishing needs base-field columns), and L = 3 with a
transmitted degree-0 LinePoly last layer (partially resolving DRIVER-4: now a Stwo-electable
config). FRI is demonstrably load-bearing: conjugate-symmetric garbage, compose-consistent OOD
lies, and fully-self-consistent wrong-trace provers are all rejected ONLY at the FRI terminal
(searched fixtures in driver.test.ts), and a 9-mutant campaign kills every soundness line.
Open questions (each is also flagged inline in the relevant contract's header comments):

- **CAIR-1**: no COMPOSITION_LOG_SPLIT at the degree-1 transition (4 unsplit coordinate columns
  vs Stwo's 2x4) -- the first degree->=2 AIR reopens the wire format.
- **CAIR-2**: leaf layout vs Stwo's lifted/packed vcs + leaf/node domain tags -- blocks interop.
- **CAIR-3**: the lifted-model mask-step coincidence is proven for THIS AIR only (bound == log_size).
- **CAIR-4**: the equal-seed boundary idiom; unequal seeds need a line interpolant or public-input
  boundary values.
- **CAIR-5**: quotient accumulation order (ours ascending; Stwo Horner-reversed).
- **CAIR-6**: FS byte mapping -- 7 tagged enc16 absorbs vs Stwo's one mix_felts of the flattened
  sampled values; flatten ORDER per TreeVec wanted.
- **CAIR-7** (= DRIVER-3 carried): drawn-not-deduped queries now cost real FRI bits at rate 1/2.
- **CAIR-8 / CDEEP-1**: **[EMPIRICALLY RESOLVED, gear 6f]** -- Stwo's own `accumulate_row_quotients` equals our DEEP column at all 16 positions (harness D1).
- **CDEEP-2**: periodicity samples skipped (unlifted full-size columns) -- confirm the reading.
- **CDEEP-3**: **[EMPIRICALLY RESOLVED, gear 6f]** -- the flatten-order power assignment reproduces Stwo's quotient output bit-for-bit (harness D1).
- **DRIVER-9**: toy soundness arithmetic: ~2^-4 FRI error per query set; queries depend on the
  ground nonce, so a far-column forgery costs ~2^12 hashes. What (n_queries, pow_bits, dedup)
  do you want for even a testnet demo? Should PARAMS grow a min-queries field?

  **Resolved 2026 M2 (self-answered, still open to expert challenge):** the production
  point is pinned in tools/params.py (PRODUCTION_POINT: log_trace 13, log_blowup 4,
  n_queries 23, pow_bits 8, air_id 11), chosen from measured cost spikes with
  committed receipts (docs/m2-cost-receipts.md); the toy stays air_id 10 on wire v1.
  Soundness: 100 conjectured / 54.0 proven bits (docs/m2-soundness.md).
  Queries stay drawn-not-deduped: the expected duplicate rate at the production domain
  is n_queries^2 / (2 * DOMAIN_SIZE) ~= 0.002018 per proof (~0.008072 bits), a
  quantified disclosure in the memo rather than dedup machinery. PARAMS did not grow a
  min-queries field: PARAMS already carries N, the verifier hard-asserts the query-list
  length against it, and the air_id registry pins the statement.
- **DRIVER-10**: [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
  Full text and citation: Appendix R.

Measured cost after 6e (simnet, real cost model): one verify() = runtime 50.2M of 5e9 (1.00% of a
block), read_count 2,496 of 15,000 (16.6% -- the binding dimension), zero writes. The live
quotients cost ~45% more than the 6d-iv x-only path; still comfortably in budget.

### B. Architecture / feasibility (correctness-adjacent, cost-driven)

7. **On-chain cost.** [RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
   Full text and citation: Appendix R.

### C. Confirmations (we believe these are fine; a quick yes/no helps)

8. The 16-byte big-endian reduce for challenges has total-variation bias ~2^-124 -- acceptable, or do
   you want rejection sampling?
9. Grinding requires `pow_bits >= 1` (threshold `2^(128 - pow_bits)`; `pow_bits = 0` is unrepresentable).
   Any objection?
10. Merkle currently has **no leaf/node domain separation** (a known TODO). Is per-node tagging required
    for your soundness argument, and if so what tags?

## 6. What an answer looks like (and what helps most)

The original headline ask here (a known-answer vector from Stwo's own test suite for fold_line and the
QM31 tower) is delivered: the interop harness (interop/) runs Stwo's own functions against this
implementation value for value at both parameter points, and three committed real proofs verify end to
end on testnet. What helps most now:

1. A blessing or a correction of the soundness accounting (Section 0, ask 1): does the capacity
   conjecture transfer to this exact construction, and is publishing 100 conjectured with 54.0 proven
   alongside the right posture?
2. A verdict on the sha256 duplex Fiat-Shamir construction (Section 0, ask 2): adequate at this target,
   or replace before any security claim?
3. A ruling on Merkle domain separation (Section 0, ask 3): is length disjointness enough, or are leaf
   and node tags required, and which?

Short directional answers to the remaining Section 0 asks close the packet. Sections 1 to 4 are
background; Section 0 is the triage; Section 5 holds the full context for every ask.

## 7. Where to look for detail

This repository (Clarity contracts in `contracts/`, the reference oracles and tests in `tests/`,
the Rust cross-check harness in `interop/`). Each contract carries a dense header comment documenting its design decisions and flagged defaults.
We can extract or expand any detail on request.

The consolidated protocol specification is docs/protocol-spec.md: one document, rebuild-grade, every
number generated from the repository's own tools and drift-gated in CI; it is the fastest path to the
exact byte formats and the transcript schedule. The deployed contracts are live on Stacks testnet:
ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production (the verifier) and
ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-attest (the consumer), deploy block 4040277, receipts
and txids in docs/m3-testnet-receipts.md.

---

## Appendix R: resolved items (full text preserved)

Items below were answered by shipped artifacts or committed receipts during M2 and M3a. Nothing is
deleted: each item's stub remains in its original section, and its full original text is preserved here
under its citation. Every resolution is self-assessed and stays open to expert challenge.

### R.1: 1. FRI fold normalization + tower constants must match the real prover.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: delivered in the strongest form the item asked for: the interop harness runs Stwo's own
fold_line and fold_circle_into_line against this implementation value for value at both parameter points
(interop/, checks E1 to E3; QUERY-3 resolution), the tower and limb order are exercised by the same
harness and by three committed real Rust proofs verifying end to end
(interop/fixtures/rust-proofs-full.json), and the deployed contract accepted those proofs on testnet
(docs/m3-testnet-receipts.md).

Original text, preserved verbatim:

1. **FRI fold normalization + tower constants must match the real prover.** We implemented the Stwo
   "no-1/2" line fold `folded = (a + b) + beta * (a - b) * x^{-1}` (values in QM31; source point `x` and
   `x^{-1}` in the base field). Textbook FRI uses `(a+b)/2 + beta*(a-b)/(2x)`. Both are sound *iff* prover
   and verifier agree, and the folded value carries a `2^L` factor after L layers. We also fixed the
   tower as `QM31 = CM31[u]/(u^2 - (2+i))`, `R = 2 + i`, with a specific 4-limb ordering.
   **Ask:** does our chosen normalization and tower (R = 2+i, limb order) match Stwo's `fold_line` /
   `qm31`? The cleanest resolver is a single known-answer vector (a `fold_line` input/output and a
   `qm31` multiply/inverse triple) lifted from Stwo's own test suite that we can assert against.

### R.2: 2. Classical vs circle inner-line map.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: the inner line map is pi(x) = 2x^2 - 1, wired end to end at the production point (16 layers);
tools/test_hints.py re-derives every committed hint from params.py circle math using pi, and the harness
E1 to E3 checks pin layer 0 as Stwo's fold_circle_into_line (the 1/y form) with line folds after it
(QUERY-3 resolution above; interop/).

Original text, preserved verbatim:

2. **Classical vs circle inner-line map.** Our fold atom is identical for classical line-FRI (next
   point `x^2`) and circle-FRI (next point `pi(x) = 2x^2 - 1`); we implemented and tested the fold, and
   provided `pi(x)` but did not yet wire it into the point chain. **Ask:** for the target proof, is the
   inner-line point map `x^2` or `2x^2 - 1`, and is the first step the circle-specific
   `fold_circle_into_line` (odd part divided by `y`, the `alpha^2` mixed-degree column batching, and an
   exotic normalization constant we have flagged as MUST-CONFIRM)?

### R.3: 7. On-chain cost.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: measured, not estimated. One production verify() costs runtime 739929603 of the 5000000000
block limit, 14.80 percent of a block, read_count 3 (docs/m2-cost-exhibit.md). The hint and check
pattern shipped as wire v2: the prover supplies every inverse twiddle and the verifier checks
t * t^-1 = 1 (tools/test_hints.py re-derives every twiddle from circle math and verifies all committed
hints). The deployed contract also runs the full verify through the public node's read only endpoint
(docs/m3-testnet-receipts.md, DRIVER-7 resolution).

Original text, preserved verbatim:

7. **On-chain cost.** Each base-field inverse is a 31-step square-and-multiply; a 32-layer FRI
   fold-down is ~190 cross-contract calls plus ~1000 field multiplies per query, times the query count;
   the QM31 inverse adds more in the DEEP path. This likely exceeds Stacks per-transaction limits.
   Our planned mitigation: the prover supplies `x^{-1}` as a hint and the verifier checks `x * x^{-1} =
   1` (1 multiply vs 31). **Ask:** is the hint-and-check pattern sound here, and are there other
   standard ways to shrink verifier work (e.g. fewer/larger FRI layers, batching openings) we should
   adopt before measuring real cost?

### R.4: QUERY-5. Real LDE size / blowup.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: pinned at PRODUCTION_POINT (tools/params.py): log_size = 13 + 4 = 17, DOMAIN_SIZE 131072, 16
layers; docs/m2-soundness.md reproduces the derived constants and CI drift-gates them on every push.

Original text, preserved verbatim:

- **QUERY-5. Real LDE size / blowup.** `DOMAIN_SIZE = 16` is a toy. What is `log_size = trace_log +
  blowup_log` (hence the `bitrev` width and the FRI layer count `L`)? We keep `DOMAIN_SIZE = 2^L` tied to `L`.

### R.5: DRIVER-7. Cost envelope.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: part (a) was resolved in the 2026 M3a note preserved below (read only call-read of the full
production verify, HTTP 200, okay true, result 0x03; docs/m3-testnet-receipts.md). Part (b) is measured
rather than scaled: one full production verify() = runtime 739929603, 14.80 percent of a block
(docs/m2-cost-exhibit.md). Part (c) shipped as wire v2: the prover supplies the 1/y hint and the 15 line
1/x hints per query and the verifier multiplies and compares to 1; tools/test_hints.py verifies every
committed hint against independently recomputed twiddles.

Original text, preserved verbatim:

- **DRIVER-7. Cost envelope.** Measured on simnet: one `verify()` (4 queries) = runtime 34.5M of the
  5e9 block limit (0.69%), read_count 1,758 of 15,000 (11.7% -- the binding dimension; it counts
  cross-contract calls), read_length 3.4MB, writes 0. A public on-chain wrapper therefore fits a block
  comfortably at toy size; the open questions are (a) whether the node's *read-only call* cost limit
  also admits it (or consumption must be a public wrapper), (b) how the per-query cost scales to a real
  `log_size` (~linear in queries x layers), and (c) whether prover-hinted `t^{-1}` with a
  `t * t^{-1} == 1` check is the sanctioned mitigation for BOTH the 1/y circle twiddle and the 1/x line
  twiddles (all verifier-derived domain constants).

  **Resolved 2026 M3a for part (a) only (measured on testnet, still open to expert
  challenge):** the node's read only call-read executed the full production
  driver/verify (call-read body 392,597 bytes, HTTP 200, okay true; probe tool
  tools/callread-verify.mjs) against the deployed
  ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production and
  returned Clarity true (result 0x03); the verbatim response and body size are
  in docs/m3-testnet-receipts.md. Read only consumption is therefore admitted
  at production size on the public node endpoint. On-chain consumption used
  the public verifold-attest wrapper: five recorded transactions from the
  deployer address, txids in the receipts. Parts (b) and (c) remain as stated.

### R.6: DRIVER-2. Toy degeneracy (QUERY-4's consequence), two parts.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: the rate 1 wart is gone twice over: gear 6e rebuilt the AIR at blowup 2 with the live Stwo
DEEP quotient path (section A5 header), and the deployed point runs blowup 16 (tools/params.py
PRODUCTION_POINT). The real circle DEEP quotient form part (b) asked for is delivered and pinned bit for
bit against Stwo's own accumulate_row_quotients (harness D1; CAIR-8/CDEEP-1 resolution).

Original text, preserved verbatim:

- **DRIVER-2. Toy degeneracy (QUERY-4's consequence), two parts.** (a) Honest p0 is conjugate-symmetric,
  so `betas[0]`, the 1/y twiddle, and the pair orientation vanish from every honest accept path (kept
  live only by a synthetic asymmetric-first-layer fixture). (b) **Rate 1**: degree-7 p0 over 8 distinct
  line x's means toy-FRI accepts ANY conjugate-symmetric column -- against a fully-rebuilt adversary all
  OOD soundness rests on `air-compose-check` + the FS ordering. Confirm this is an acceptable spike
  artifact, and give us the real circle DEEP quotient form (conjugate-pair quotients over the full
  point, y-dependent) so the next gear can replace deep's x-only quotients and restore blowup >= 2.

### R.7: DRIVER-4. Last-layer mapping / the L bump.

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: the toy-forced config is retired. The deployed point folds 16 layers to a size 2 last layer
with a transmitted degree 0 final, a config Stwo itself elects (the committed fixtures carry the final
field; interop/fixtures/rust-proofs-full.json), and the PARAMS blowup byte is re-pinned at 0x10
(tools/params.py derived PARAMS 171010080000000b; docs/m2-soundness.md).

Original text, preserved verbatim:

- **DRIVER-4. Last-layer mapping / the L bump.** L=4 with a size-1 terminal and a single transmitted
  constant is **toy-forced by rate 1**, not Stwo-electable: real Stwo (`log_blowup >= 1`) stops at a
  last-layer domain of size >= 2 and evaluates a transmitted `LinePoly` there. Confirm the intended real
  config (a degree > 0 last layer needs the coefficient list + eval-at-x; one inner layer drops; L
  returns to 3); the PARAMS blowup byte (0x02) is documentation-only today and must be re-pinned then.

### R.8: DRIVER-10

[RESOLVED 2026 M2/M3a, receipt-cited, open to expert challenge]
Citation: the registry convention is pinned in tools/params.py (monotonic, never reuse a retired id; toy
air_id 10, production air_id 11) and docs/m2-soundness.md records the rule applied: adopting the
fallback point would take air_id 12 rather than reuse 11.

Original text, preserved verbatim:

- **DRIVER-10**: the air_id registry convention (monotonic; the multiplicative toy was 9, the
  circle AIR is 10).
