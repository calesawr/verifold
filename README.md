# Verifold

**A zero-knowledge proof verifier for Stacks, written entirely in Clarity.**

Verifold checks a Circle-STARK proof on-chain and returns `true` or `false`. It uses only the
primitives Stacks already exposes (sha256 hashing and native integer arithmetic), so it requires
no consensus change, no protocol upgrade, and no SIP. Verification runs as ordinary contract code
that every node re-executes.

> **Status: working prototype at demonstration parameters. Not audited. Not production-secure.**
> A complete proof, produced by an independent Rust prover built on StarkWare's open-source
> [Stwo](https://github.com/starkware-libs/stwo) library, is verified end to end by the Clarity
> contract on simnet at about 1% of a block's compute budget. Full-security parameters are the
> next milestone; a measured cost model shows they fit a single transaction in the planned
> single-contract form. No security claim is made before raised parameters, independent expert
> review, and a professional audit. See the litepapers for the honest detail.

## Read first

- [`docs/litepaper-plain.md`](docs/litepaper-plain.md), the plain-language edition
- [`docs/litepaper.md`](docs/litepaper.md), the technical edition
- [`docs/expert-review-questions.md`](docs/expert-review-questions.md), every design decision
  awaiting a STARK cryptographer's confirmation, with what has already been resolved empirically

## What is in this repository

| Path | Contents |
|---|---|
| `contracts/` | The verifier, as independently tested Clarity contracts: M31/QM31 field arithmetic, sha256 Merkle verification, the Fiat-Shamir transcript and challenge schedule, the FRI fold, the circle AIR and DEEP quotients, the query-to-domain map, and the top-level `driver.verify()` |
| `tests/` | 240+ automated tests: differential tests against independent TypeScript reference implementations, Python-verified known-answer vectors, oracle-independent structural properties, and a large adversarial negative matrix (every lie class must abort) |
| `interop/` | A Rust harness pinned to a specific Stwo commit: a 16-check cross-validation that the verifier's conventions match Stwo's own functions value for value, plus a mini-prover whose proofs the Clarity contract accepts |
| `tools/` | The from-scratch Python replay that pins the known-answer vectors, and the full-parameter cost-shape generator |

## Running the tests

```sh
npm ci
npm test          # the full suite (requires the Clarinet toolchain via @stacks/clarinet-sdk)
```

The Rust cross-check (requires the nightly toolchain pinned in `interop/rust-toolchain.toml`):

```sh
cd interop
cargo run               # the 16-check Stwo cross-validation harness
cargo run --bin prove   # regenerate the Rust-proven fixtures verified by the Clarity contract
```

## Design in one paragraph

STARK proofs are built from hashing and small-field arithmetic, which are exactly the tools Clarity
has. The field is Mersenne-31 (`p = 2^31 - 1`), so all arithmetic fits Clarity's native 128-bit
integers with no big-number emulation; the evaluation domain is the circle group (the Stwo
Circle-STARK construction); the commitment hash is Clarity-native sha256. The expensive work,
proving, happens off-chain. The on-chain verifier re-derives every challenge from a Fiat-Shamir
transcript, binds every opened value to its committed Merkle root by position, evaluates the
constraint system at an out-of-domain point, and runs the FRI low-degree test. Every reject path
aborts; the only `true` is the sound one, conditional on the verifier's own correctness and
adequate security parameters, which is precisely what the open review process is for.

## Contributing and review

The most valuable contribution right now is expert eyes on
[`docs/expert-review-questions.md`](docs/expert-review-questions.md). Issues and pull requests are
welcome. If you are building on Stacks and would use a proof-verification primitive, opening an
issue describing your use case and the interface you would want is genuinely helpful.

## License

Dual-licensed under [Apache-2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at your option. Neutral
public infrastructure: no token, not tied to any single application.
