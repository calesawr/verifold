# Verifold: a proof-verification layer for Stacks

### Litepaper · draft v0.1 · 2026-06-09 · for feedback

> **Working title "Verifold"** (*verify* plus the *folding* step at the heart of the proof check). Name not finalized.
> **Neutral, open-source infrastructure. No token.**
>
> Three things are true today. First, a complete proof is checked end to end
> by a Clarity contract on Simnet, and a proof produced by a separate, independently
> written prover is accepted by that contract. Second, the verifier was checked value by value against
> the reference proving software it is meant to match, rather than assumed to match it. Third, this all
> now runs at production security settings: the pinned point carries about 100 bits under the standard,
> unproven conjecture (54 proven bits; docs/m2-soundness.md), and checking one real proof costs about
> 14.80% of a block's compute budget (docs/m2-cost-exhibit.md). This is an engineering prototype. It
> shows the verifier is buildable and, at production strength, working. It is **not** audited. It now
> runs on the Stacks test network with five real proofs checked on-chain (docs/m3-testnet-receipts.md);
> running on a test network is not a safety guarantee. No security claim is made until independent
> experts review the open questions and a professional audit is completed.

---

## 1. Abstract

Verifold is a Clarity smart contract that checks a zero-knowledge **STARK** proof on Stacks and returns
`true` or `false`. It uses only the tools Stacks already has, hashing and ordinary integer math, so it
needs **no change to the blockchain itself and no protocol upgrade.** The check runs as normal contract
code that every node re-executes, so a verified result carries the full weight of Stacks consensus and
settles to Bitcoin, with no outside party to trust, on the condition that the verifier code itself is
correct (§8).

It is **neutral, open-source public infrastructure with no token.** Once any contract can check a proof,
a new class of applications becomes possible on Stacks: scaling through proofs, verifiable off-chain
computation, trust-minimized bridges, verifiable AI, and, as one of several possibilities pursued as a
separate effort, privacy with built-in accountability.

---

## 2. The problem: Stacks cannot check proofs today

A blockchain is valuable because participants verify rather than trust. A zero-knowledge proof extends
that idea to computation itself: a contract can confirm that a large piece of work was done correctly
without redoing it, by checking a short proof instead. Clarity, the Stacks contract language, has no way
to do this.

Clarity can hash data and verify signatures, but it does not have the special curve mathematics that the
common proof systems on other chains depend on. Those systems simply cannot be checked on Stacks. The
only official way to add that capability would be a hard fork: a change to the blockchain itself,
requiring a community vote that no single team controls, and putting new and risky cryptographic code
into every node on the network.

The result is a quiet ceiling. Privacy, proof-based scaling, bridges, and verifiable computation all
need on-chain proof checking, and none of it has been possible on Stacks.

---

## 3. Where Verifold sits

Verifold is not a new chain, a rollup, or a token. It is a **verification layer**, one thin piece that
lets Stacks contracts anchor trust in work done elsewhere:

```
   Bitcoin        final settlement and security
      ▲
   Stacks         smart contracts and consensus
      ▲
   Verifold       a Clarity contract that CHECKS a proof  ──►  true / false
      ▲
   Applications   scaling · bridges · verifiable compute · verifiable AI · accountable privacy
```

The heavy work, running the computation and producing the proof, happens **off-chain**, where computing
power is cheap. The only on-chain piece is the verifier: small, predictable, and re-run by every Stacks
node. Verifold supplies the checking layer of this picture; everything above it is built by others.

---

## 4. How it works

Verifold checks a family of proofs called **STARKs**. STARKs matter here for one reason: they are built
entirely out of hashing and basic arithmetic, which are exactly the two things Clarity can already do.
No new cryptography has to be added to the chain.

A few design choices, fixed on purpose to keep the system simple and reviewable:

- **No trusted setup.** Some proof systems require a one-time secret ceremony, and if that ceremony is
  ever compromised, the whole system is. STARKs need nothing of the kind. Security rests on hashing,
  which is already battle-tested.
- **Numbers sized to fit Clarity.** The math is done over numbers small enough that everything fits
  inside Clarity's native integers. There is no oversized-number emulation, which removes a whole
  category of potential bugs.
- **A standard, open design.** The verifier follows the same construction used by StarkWare's open-source
  proving software, so proofs can be produced by established tools rather than by something invented here.
- **Off-chain aggregation.** Many proofs can be combined off-chain into one small proof, so the
  on-chain verifier always does a small, bounded amount of work.

The check itself walks through the proof step by step: it re-derives the random challenges the proof
must answer (so the prover cannot choose them), checks that every opened value really belongs to the
committed data, checks the algebraic rules of the computation, and runs a repeated folding test that
exposes any cheating. At the end it returns `true` or `false`. A `true` means the underlying statement
holds with overwhelming probability, on the condition that the verifier code is correct and its security
settings are adequate (§8). The verifier asserts nothing beyond validity.

It is assembled from small, independently tested pieces, each its own Clarity contract: the arithmetic,
the commitment checking, the challenge transcript, the folding test, the constraint checking, and the
top-level driver that ties them into a single `verify()`.

---

## 5. What is built and measured

**An end-to-end check works.** A complete proof, over a real if small computation, is verified by the
Clarity `verify()` on a simulated network that uses Stacks' real cost rules. The proof is generated by a
separate prover written in Rust on top of StarkWare's open-source library. The two were developed
independently, and a cross-check harness confirms they agree on every convention, value for value,
against the reference software's own functions.

**Measured cost.** One `verify()` of the demonstration proof consumes about **1.0%** of a single block's
compute budget. The full-strength check now exists and is measured directly: one `verify()` of a real
full-strength proof by the combined single contract runs at about **14.80%** of a block's compute budget,
with the raw measurements published in the repository (§7).

**Testing.** The verifier passes over **270 automated tests**. Each piece is built test-first against an
independent reference implementation and pinned by known-answer values computed by a third
implementation. Deliberate bugs are injected to confirm the tests catch them. The challenge transcript,
historically the most common source of proof-checker exploits, is isolated in one small, heavily tested
module.

---

## 6. The trade-offs of this approach

STARKs are the right tool for Clarity, but they are not free. The honest costs:

- **Producing a proof is the expensive side, by design.** Making a STARK proof takes real computing
  work. The flip side is the whole point: proving is expensive, checking is cheap. Verifold puts the
  expensive part off-chain, where it scales, and only the cheap check on-chain. For the small
  computations a privacy application needs, modern proving is fast, often under a second on a laptop and
  a few seconds on a phone, provided the application is designed with proving in mind.
- **Proofs are larger than the alternatives.** A STARK proof is typically tens of kilobytes, against a
  few hundred bytes for the curve-based proofs other chains use. The proof must fit in a Stacks
  transaction and costs more to transmit. That size premium is the price of needing no trusted setup and
  no new cryptography.
- **Timing.** End-to-end, a user waits on three stages: making the proof off-chain (seconds), the
  on-chain check (within one Stacks block, roughly five seconds), and Bitcoin-anchored settlement.
  Verifold only affects the middle stage.
- **Why STARKs anyway.** The smaller, faster-to-check proof systems require mathematics Clarity does not
  have, so they cannot be checked on Stacks at all without a hard fork, and many require a trusted
  setup. STARKs trade size and proving cost for three things: no trusted setup, checkability on Stacks
  today, and resilience against future quantum computers. For Stacks specifically, that trade is what
  makes on-chain verification possible at all.

---

## 7. From demonstration to production

The working demonstration runs at reduced security settings: a small domain and only a few of the random
spot-checks a production proof requires. Raising the settings to full strength multiplies the verifier's
work, and the original thirteen-contract structure, which keeps every piece independently testable,
would exceed the per-transaction limit on internal calls at full strength.

The fix is built and measured: a single combined contract, generated automatically from the same tested
pieces, with the arithmetic written inline instead of passing through many internal calls. Checking a
real full-strength proof with it costs about **14.80% of one block** and reduces the internal-call count
to almost nothing, comfortably inside a single transaction. The combined contract is checked to behave
identically to the tested pieces by an automated equivalence pipeline that runs on every change. At the
production settings, that evidence is a byte-for-byte match between the generated pieces and the combined
contract, plus a full run of the end-to-end and tamper tests against the combined contract; the exhaustive
check that compares every single call between the pieces and the combined contract runs at the reduced
settings.

The combined contract is the main cost lever, but not the only one. Language changes under discussion for
the next Clarity upgrade would make exactly the kind of "assemble bytes, then hash" work a proof checker
does most a little cheaper, and we are asking the Stacks core developers to add one small built-in we
currently have to work around. None of that is committed to a release yet. These are extra headroom on top
of the combined contract, not a replacement for it; the savings are not measured, so the cost figures above
stand on their own under today's rules.

---

## 8. Security and trust

**Trust model.** Because the verifier is ordinary contract code re-run by every node, a verification
result is backed by full Stacks consensus. No committee, no operator, and no off-chain service has to be
trusted or even exist. Compared with adding a verification feature to the blockchain itself, this
approach adds no new code to the nodes, confines any bug to one contract rather than the whole chain,
and requires no governance vote. Clarity contracts cannot be edited after deployment, so a fix means
deploying a corrected version and having applications point to it deliberately.

**The one irreducible risk: the verifier's own correctness.** A proof checker is only as sound as its
code and its security settings, and even mature, professionally audited proof checkers on other chains
have shipped serious bugs. The development method here is built around that risk:

- Every piece is written test-first against a second, independent implementation, and pinned by
  known-answer values from a third. A bug must appear identically in all three to slip through.
- Properties of the mathematics itself are tested directly, which catches the dangerous case where the
  contract and its reference share the same mistake. This case is not hypothetical; it happened during
  development and was caught by exactly this kind of test.
- The verifier's conventions were confirmed against the reference proving software's own code, so the
  claim "we compute what the prover computes" is an executable fact rather than an assumption.
- Deliberate bugs are routinely injected to confirm the test suite catches them.

**Working without a cryptographer.** This project does not yet have a STARK cryptographer on the team.
Every open design question has a documented default and a place on a self-contained list awaiting expert
review. Many of those questions have now been closed by the cross-checks; the remaining ones concern the
final security settings and details of the commitment format. No security claim and no mainnet
deployment until independent expert review, raised settings, a professional audit, and a bug bounty.

**Current limitations.** This is an early prototype. The end-to-end check now works at production
security settings, but the headline 100-bit soundness number rests on a standard conjecture that is not
proven; the proven number is 54 bits (docs/m2-soundness.md). The code is not audited. The statement it
proves, a Fibonacci sequence, is a demonstration example, not a real application. The verifier now runs
on the Stacks test network (docs/m3-testnet-receipts.md); it has not been put on the main network. The
Hiro indexer correctly served the verifier's slash-separated contract names on testnet (recorded in
docs/m3-testnet-receipts.md). Cost figures are point-in-time under the current
Stacks cost rules.

---

## 9. What becomes possible

1. **Scaling:** compress many transactions into one proof and verify them all at once.
2. **Verifiable off-chain computation:** prove a heavy computation ran correctly, check it cheaply
   on-chain.
3. **Trust-minimized bridges and light clients.**
4. **Verifiable AI:** prove a model or data feed produced an honest result.
5. **Accountable privacy:** for example, a wrapped STX where balances and transfers stay confidential,
   incoming funds are screened against known illicit sources, and each user holds keys that can reveal
   their own history, and only their own, to an auditor on demand. One of several use cases, pursued as
   a separate effort with its own legal review.

---

## 10. Roadmap

- **M0: cost benchmark.** Done.
- **M1: the verifier core in Clarity.** Done at demonstration strength: a complete `verify()` accepts a
  real proof from an independent prover, with 270+ tests and the conventions cross-checked against the
  reference software.
- **M2: production security settings in the combined single contract.** Done. The security settings
  are pinned with the arithmetic shown, the separate prover makes real proofs at those settings, and the
  combined contract checks them with measured, published costs.
- **M3: testnet deployment, a consolidated specification, and expert review.** The deployment half is
  done: the verifier and a small public recording contract run on the test network, with five real
  proofs checked on-chain and the real fees measured (docs/m3-testnet-receipts.md). The consolidated
  specification and the expert review round come next.
- **M4: an independent audit, first external integration, and first mainnet proof.**

---

## 11. Governance, licensing, neutrality

Verifold is intended as a public good: permissively open-source, neutral, not tied to any single
application, with no token. It requires no change to Stacks itself to ship. There is precedent for this on
Stacks: a shared library for checking Bitcoin transactions on-chain (`clarity-bitcoin-lib`) is already used
by several projects, so a reusable proof-checking primitive in plain Clarity is a pattern the ecosystem
already welcomes. A future shared standard for verifier interfaces could make verifiers interchangeable
across the ecosystem, a later, community-led step rather than a precondition.

---

*Draft for discussion. An end-to-end proof check works at production security settings, about 100 bits
under a standard conjecture that is not proven (54 proven bits), with measured costs published. The code
is unaudited and runs on the test network only (docs/m3-testnet-receipts.md); no security claim is made pending independent expert
review and audit. A more technical edition of this litepaper is available separately.*
