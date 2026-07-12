# Verifold: a neutral on-chain proof-verification layer for Stacks

### Litepaper · draft v0.1 · 2026-06-09 · for community feedback

> **Working title "Verifold"** (*verify* plus the *fold* at the heart of a STARK verifier). Name not finalized.
> **Neutral, open-source infrastructure. No token.**
>
> **Status (read first).** Three things are true today. First, a complete circle-STARK proof is verified
> end to end by a Clarity contract on a simulated network, and a proof produced by an independent Rust
> prover (built on StarkWare's Stwo library) is accepted by that contract. Second, the verifier's
> conventions were checked directly against the Stwo prover's own code, value for value, rather than
> assumed. Third, this now runs at production security parameters: the pinned point carries about 100
> bits of soundness under the standard, unproven capacity conjecture, and 54 proven bits under the
> Johnson bound (docs/m2-soundness.md), and one verification by the generated single contract measures
> 14.80% of a block's compute budget (docs/m2-cost-exhibit.md). This is an engineering spike. It
> demonstrates the verifier is buildable and, at production parameters, working, with high self-tested
> confidence. It is **not** audited. It is deployed to Stacks testnet with five real proofs verified on-chain
> (docs/m3-testnet-receipts.md); testnet liveness is not a security result. No "secure" claim
> is made until an independent expert reviews the open questions and a professional audit is completed.

---

## 1. Abstract

Verifold is a Clarity smart contract that verifies a zero-knowledge **STARK** proof on Stacks and returns
`true` or `false`. It uses only the cryptographic primitives Stacks already exposes, hashing and integer
arithmetic, so it needs **no consensus change and no protocol upgrade** (no SIP). Verification runs as
ordinary contract code that every node re-executes, so a verified result inherits full Stacks consensus and
Bitcoin-anchored settlement, with no off-chain verifier and no new honest-majority or liveness assumption
beyond Stacks itself, conditional, as always, on the verifier code being correct (§8).

It is **neutral, unopinionated public infrastructure with no token.** Once any contract can verify a proof,
a class of applications becomes buildable on Stacks: validity-proof scaling, verifiable off-chain compute,
trust-minimized bridges and light clients, verifiable AI, and (as one of several possibilities, pursued as a
separate effort) compliance-ready private payments.

---

## 2. The problem: Clarity cannot verify proofs today

A blockchain's value is that participants verify rather than trust. A zero-knowledge proof extends this to
computation: a contract can confirm that a large computation was performed correctly without re-executing
it, by checking a short proof. Clarity, the Stacks contract language, has no way to do this.

Clarity exposes hashing (`sha256`, `keccak256`) and signature verification (`secp256k1`, `secp256r1`), but
no pairing-friendly elliptic-curve operations and no native proof-verification opcode. The pairing-based
proof systems most chains use (Groth16, PLONK) therefore cannot be verified on-chain at all. The only
"official" path to add them is a consensus-breaking upgrade: a Clarity-version hard fork via a SIP and a
community vote. That path is not on the Stacks roadmap, is governed by a vote no single team controls, and
(§8) concentrates new cryptographic risk in every node rather than isolating it.

The consequence is a quiet ceiling: privacy, validity-proof scaling, bridges, and verifiable computation on
Stacks all require on-chain proof verification, and none of it is possible without it.

---

## 3. Where Verifold sits in the stack

Verifold is not a new chain, rollup, or token. It is a **verification primitive**, a thin on-chain layer
that lets Stacks contracts anchor trust in off-chain computation:

```
   Bitcoin        settlement / final ordering and security
      ▲
   Stacks         Bitcoin layer: Clarity smart contracts + consensus
      ▲
   Verifold       a Clarity contract that VERIFIES a succinct proof  ──►  true / false
      ▲
   Applications   rollups · bridges · coprocessors · verifiable AI · compliance-ready private payments
```

The heavy work, running the computation and producing the proof, happens **off-chain**, where compute is
cheap and scalable. The only on-chain component is the verifier: small, deterministic, and re-run by every
Stacks node. Results settle to Bitcoin through Stacks. Verifold supplies the verification edge of this
diagram; everything above it is built by others.

---

## 4. How it works

Verifold is a Clarity implementation of a **hash-based STARK verifier** (Scalable Transparent ARgument of
Knowledge), specifically a **Circle-STARK** in the Stwo design family. The design is fixed for simplicity
and auditability:

- **Proof system: a transparent STARK.** No trusted setup. Security rests on collision-resistant hashing,
  the FRI low-degree test, and a sound Fiat-Shamir transcript. No pairings, no exotic curves.
- **Field: Mersenne-31 (`p = 2³¹ − 1`), Circle-STARK construction.** Base elements are about 31 bits, so even
  degree-4 secure-field (QM31) products stay within Clarity's native 128-bit integers with no big-number
  emulation, which eliminates a class of implementation bugs. Because `p − 1` has no large power-of-two
  factor, the evaluation domain uses the circle group (the Stwo design family).
- **Commitment hash: `sha256`**, a native Clarity opcode and cheap as a commitment hash.
- **Off-chain aggregation.** Many proofs are recursively aggregated off-chain into one small proof, so the
  on-chain verifier does minimal, bounded work.

The verifier re-derives the protocol's random challenges from the transcript (Fiat-Shamir), checks the
Merkle openings (`sha256`), evaluates the computation's algebraic constraints (AIR) on the circle domain,
binds those openings to the committed data (DEEP), checks the FRI folding, and outputs `true` or `false`. A
valid result means the underlying statement holds with overwhelming probability, conditional on a correct
verifier implementation and adequate security parameters (§8). The verifier asserts nothing beyond validity.

It is assembled from small, independently tested **"gears,"** each a standalone Clarity contract: M31 field
arithmetic; sha256 Merkle verification; the Fiat-Shamir transcript; the QM31 secure field and the FRI fold;
the QM31 inverse; the AIR constraint-evaluation core; the DEEP out-of-domain binding; the QM31-leaf encoding
for committed openings; the Fiat-Shamir schedule that re-derives every challenge in a locked order; the
query-to-domain map on the circle; and the top-level driver that ties them into a single `verify()`.

---

## 5. What is built and measured

**An end-to-end verification works.** A complete Circle-STARK proof, over a real (if small) constraint
system, is verified by the Clarity `verify()` on a simulated network running Stacks' real cost model. The
proof is generated by an independent prover written in Rust on top of StarkWare's open-source Stwo library;
the Clarity verifier accepts it. The two were developed separately and a cross-check harness confirms they
agree on every algebraic convention, the evaluation domain and its ordering, the interpolation, the quotient
arithmetic, and the folding, value for value, against Stwo's own functions.

**Measured cost.** Using Clarinet, which evaluates against Stacks' real on-chain cost model (per-block
runtime budget 5,000,000,000 units), one `verify()` of the demonstration proof consumes about **1.0%** of a
block's runtime budget. At production security parameters, one `verify()` of a real proof by the generated
single contract measures **14.80%** of the block runtime budget on the same simulated network, with the
internal call count reduced to a handful; the raw measurements are committed in the repository
(docs/m2-cost-exhibit.md) (§7).

**Testing.** The verifier passes over **270 automated tests**. Each gear is built test-first against an
independent reference implementation, pinned by known-answer vectors computed by a third independent
implementation in Python, and red-teamed. Deliberate code mutations confirm the tests catch them. The
Fiat-Shamir transcript, historically the most common source of proof-forging bugs, is isolated into one
small, heavily tested module that enforces the absorb-before-squeeze discipline.

---

## 6. The trade-offs of this approach

STARKs are the right tool for Clarity, since they need only hashing and arithmetic, but they are not free.
The main costs:

- **Prover cost is high, and asymmetric, by design.** STARK proving is computationally heavy: FFTs, Merkle
  commitments, and FRI over an evaluation domain several times larger than the execution trace. The flip
  side is the whole point: proving is expensive but verification is cheap and bounded. Verifold places the
  expensive prover off-chain (where it scales) and only the cheap verifier on-chain. For the small circuits
  a privacy application needs, modern Circle-STARK proving is fast, often under a second on a laptop and a
  few seconds on a phone, **provided** the application's commitment structures use a prover-friendly hash;
  using a verifier-friendly hash like sha256 inside the proven circuit is far more expensive and must be
  avoided in the proving path (the on-chain commitment hash and the in-circuit hash are separate choices).
- **Proofs are larger than SNARKs.** A hash-based STARK proof is typically tens to low hundreds of
  kilobytes, versus a few hundred bytes for a pairing-based SNARK. On-chain this matters: the proof must fit
  a Stacks transaction and costs to transmit and process. Off-chain recursive aggregation keeps the on-chain
  proof small, but the size premium is intrinsic to the transparent, hash-only design. It is the price paid
  for no trusted setup and no exotic cryptography.
- **Timing and finality.** End-to-end latency is the sum of off-chain proving (sub-second to seconds for
  small circuits), on-chain verification (within a single Stacks block, roughly five seconds since
  Nakamoto), and Bitcoin-anchored settlement. Verifold affects only the middle stage.
- **Why STARKs anyway.** Pairing-based SNARKs are smaller and faster to verify, but they require pairing
  curves Clarity does not have (so they cannot be verified on-chain without a hard fork) and often a trusted
  setup. STARKs trade proof size and prover cost for transparency, verifiability in Clarity using only
  hashing and arithmetic, and plausible post-quantum security. For Stacks specifically, that trade is what
  makes on-chain verification possible at all.

---

## 7. From demonstration to production: how the gap was closed

The demonstration runs at toy security parameters (a small domain, few FRI queries, low grinding). Raising
these to production strength (more queries, a larger blow-up, more grinding bits) increases the verifier's
work, and the binding budget is the count of internal contract-to-contract calls, not runtime. The current
thirteen-contract structure, which keeps each gear independently testable, would exceed that call budget at
production parameters.

The fix shipped: a single flattened contract, generated automatically from the same verified gears, that
performs the arithmetic inline rather than through many small cross-contract calls. The
production-parameter artifact now exists and is measured rather than modeled: one `verify()` of a real
production-parameter proof runs at 14.80% of a block's runtime budget with the call count reduced to a
handful, comfortably within one transaction (docs/m2-cost-exhibit.md, raw receipts in
docs/m2-cost-receipts.md).

The flattening is the primary lever, but not the only one. Language changes under discussion for the next
Clarity release would reduce the cost of exactly the byte-assembly-and-hash work a STARK verifier does most:
a long-requested variadic `concat` would collapse the nested binary concatenations in the leaf encoder and
the Fiat-Shamir transcript, and we have filed an upstream request
([stacks-core #7312](https://github.com/stacks-network/stacks-core/issues/7312)) for a native
integer-to-bytes serialization to replace a `to-consensus-buff?` workaround on the verifier's hot path. Neither is committed
to a release yet. These are additional headroom on top of the flattening, not a substitute for it; the
savings are not yet measured and the cost figures in this document remain point-in-time under the current
cost model.

The measurement replaced the spike: the chosen parameter set fits one transaction with headroom. If a
future statement ever needs a larger parameter set, the established fallback remains splitting the
verification across several transactions, a pattern used by STARK verifiers on other chains.

---

## 8. Security, trust model, and mitigations

**Trust model.** Because the verifier is ordinary contract code re-run by every node, verification is backed
by full Stacks consensus, with no additional honest-majority or liveness assumption. This matches a native
node-level upgrade on trust and improves on it in three concrete ways: it adds no new cryptography to the
node, a bug stays confined to one contract instead of the whole chain, and it needs no governance vote.
(Clarity contracts are immutable, so "confined to one contract" means a fix is a redeploy plus a consumer
migration, not an in-place patch; consumers should pin a specific verifier version deliberately.) This is
not "trustless," but it adds no new trust assumptions beyond Stacks itself.

**The one irreducible risk: verifier correctness, and adequate parameters.** Soundness holds only if the
verifier code is bug-free and the security parameters are set high enough, and even mature, audited STARK
verifiers have shipped proof-forging bugs. The development methodology is built around catching such errors:

- **Test-first against an independent reference.** Each gear is checked against a second implementation that
  computes results a different way, plus known-answer vectors computed by a third. A bug must appear
  identically in all three to slip through.
- **Oracle-independent property tests.** The subtle failure is a contract and its reference making the same
  mistake and agreeing. This occurred during development: a constraint quotient was paired with the wrong
  divisor, and the differential tests missed it because the reference shared the error. It was caught by a
  test that checks a structural mathematical property directly, that an honest result is a low-degree
  polynomial, which needs no reference. This class of guard is now standard on every gear.
- **Cross-check against the reference prover.** The verifier's conventions are confirmed value-for-value
  against StarkWare's Stwo prover at a pinned version, so "we compute what the prover computes" is an
  executable fact rather than a reading of the source.
- **Adversarial red-teams and mutation testing.** Each gear is attacked by independent reviewers, every
  finding re-verified before action, and deliberate code mutations confirm the tests catch them.

**Operating without a cryptographer.** The project has no in-house STARK cryptographer. Rather than stall,
each open decision gets a documented default, tested, with the open question appended to a self-contained
expert-review document. The cross-check harness has now closed many of those questions empirically (the
domain ordering, the field and fold conventions, the quotient normalization); the ones that remain concern
the security parameters, the leaf/node hash tagging, and the conventions for non-toy constraint systems. No
"secure" claim and no mainnet until independent expert review, raised parameters, a professional audit, a
bug bounty, and continuous review.

**Current limitations.** This is an early spike. An end-to-end check now works at production security
parameters, but the headline 100-bit soundness figure rests on the standard, unproven capacity conjecture;
the proven figure is 54 bits (docs/m2-soundness.md). The code is not audited. The statement proved, a
Fibonacci trace, is a demonstration AIR chosen to exercise the machinery, not an application statement.
The verifier is deployed to Stacks testnet (docs/m3-testnet-receipts.md); mainnet deployment has not
happened. The Hiro stacks-blockchain-api served the verifier's `/` names on testnet (observation
recorded in docs/m3-testnet-receipts.md). The §5 cost figures are point-in-time under
the current cost model. There is no production precedent for a STARK verifier in Clarity; maturity is
emerging.

---

## 9. What becomes possible

1. **Validity-proof scaling / rollups:** compress many transactions into one verified proof.
2. **Verifiable off-chain compute and ZK coprocessors:** prove a heavy computation ran correctly, verify it
   cheaply on-chain.
3. **Trust-minimized bridges and light clients.**
4. **Verifiable AI / oracle computation:** prove a model or data feed produced a result honestly.
5. **Compliance-ready private payments:** for example a 1:1 STX wrapper where a holder can prove, on demand,
   that a transfer is not linked to sanctioned or illicit addresses without publishing their full history.
   One of several use cases, pursued as a separate effort, and subject to its own legal review.

---

## 10. Roadmap

- **M0: cost benchmark.** Done.
- **M1: the verifier core in Clarity.** Done at demonstration strength: a complete `verify()` accepts a real
  Circle-STARK proof from an independent Rust prover; 270+ tests; conventions cross-checked against Stwo.
- **M2: production security settings in the generated single contract.** Done: the parameter point is
  pinned with itemized soundness accounting (docs/m2-soundness.md), an independent Rust prover emits real
  proofs at that point, and the generated single contract verifies them on simnet with measured, receipted
  costs (docs/m2-cost-exhibit.md).
- **M3: testnet deployment, consolidated specification, and expert review.** Testnet half done
  2026-07-12: the production verifier and a minimal attest contract are live on Stacks testnet with
  five real proofs verified on-chain from the deployer address and measured fees
  (docs/m3-testnet-receipts.md, docs/testnet-walkthrough.md). The consolidated specification and the
  expert review packet are M3b, next.
- **M4: independent audit, first external integration, and first mainnet proof.**

Open questions for review (the full self-contained list is in the repo's expert-review document): the
production soundness parameters (query count, blow-up, grinding) and whether to target conjectured or proven
bounds; query deduplication; leaf/node hash domain separation; the conventions for non-toy constraint
systems; the prover-side adapter for a stock Stwo prover; the cleanest integration interface; and whether the
community wants a trait-level standard so verifiers are interoperable.

---

## 11. Governance, licensing, neutrality

Verifold is intended as a public good: permissively open-source (Apache-2.0 / MIT), neutral and unopinionated
(not tied to any single application), with no token. It requires no consensus change to ship. There is
precedent for this model on Stacks: `clarity-bitcoin-lib`, a shared on-chain proof-verification library for
Bitcoin transactions, is already relied on by multiple projects, so a reusable verification primitive in pure
Clarity is a pattern the ecosystem already welcomes and uses. A future trait-level standard (an "SRC"-style
interface) could make verifiers interoperable across the ecosystem, a later, community-led step, not a
precondition.

---

## Appendix: glossary

*Zero-knowledge proof:* a proof that a statement is true that reveals nothing else. *STARK:* a transparent
(no-trusted-setup), hash-based proof system. *Circle-STARK:* the Stwo-family STARK over the Mersenne-31 field,
whose evaluation domain is the circle group. *FRI:* the low-degree test at a STARK's core, which proceeds by
repeatedly folding a polynomial, the namesake of *Verifold*. *Fiat-Shamir:* the technique that makes an
interactive proof non-interactive by deriving the random challenges from a hash transcript; the most common
source of verifier bugs. *AIR:* the representation of a computation as a table of values plus algebraic
constraints. *DEEP:* the out-of-domain technique that binds the verifier's openings to the committed data.
*Soundness:* the guarantee that a false statement cannot produce a passing proof. *Trusted setup:* a one-time
secret-generating ceremony some proof systems require; STARKs do not. *Clarity:* Stacks' decidable
smart-contract language. *Stwo:* StarkWare's open-source Circle-STARK proving library, the reference prover
this verifier is checked against.

---

*Draft for discussion. An end-to-end proof check works at production security parameters, about 100 bits
under the standard, unproven capacity conjecture (54 proven; docs/m2-soundness.md), with measured costs
published (docs/m2-cost-exhibit.md). Unaudited; deployed to Stacks testnet only (docs/m3-testnet-receipts.md); no "secure" claim is
made pending independent expert review and audit. Cost figures are point-in-time under the current Stacks
cost model.*
