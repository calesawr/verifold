# Clarity request: native `uint`/`int` → big-endian `buff` serialization

> **Filed 2026-06-11 as [stacks-network/stacks-core#7312](https://github.com/stacks-network/stacks-core/issues/7312).**
> The text below is the issue as filed.

---

**Is your feature request related to a problem? Please describe.**

Clarity can turn bytes into an integer (`buff-to-uint-be`, `buff-to-uint-le`, `buff-to-int-be`, `buff-to-int-le`) but has no clean way to turn an integer back into a fixed-width big-endian byte string. Any contract that hashes structured data — Merkle trees, Fiat-Shamir transcripts, proof verifiers, commitment schemes — has to lay numbers out as raw bytes before feeding them to `sha256`, and right now there is no direct tool for that step.

The closest workaround is `to-consensus-buff?`, which returns a type-tagged 16-byte encoding, so recovering a clean 4-byte big-endian limb means serializing the whole value and slicing bytes back out:

```clarity
;; 4-byte big-endian of one M31 limb (p = 2^31 - 1), as actually shipped today.
;; to-consensus-buff?(uint) => 0x01 (type tag) || 16-byte big-endian value,
;; so bytes [13,17) are the low 4 big-endian bytes.
(define-private (m31-to-be4 (v uint))
  (unwrap-panic (if (< v P)
    (as-max-len? (unwrap-panic (slice? (unwrap-panic (to-consensus-buff? v)) u13 u17)) u4)
    none)))
```

Three problems, each independently annoying:

1. **Cost.** Every limb pays for a full 16-byte consensus serialization, a `slice?`, an `as-max-len?` re-type, and two `unwrap-panic`s — just to obtain four bytes. In a STARK verifier this runs on every opened field element and every transcript absorption, so it is squarely on the hot path.
2. **Fragility.** The code depends on the internal byte layout of `to-consensus-buff?` (a `0x01` tag followed by a 16-byte big-endian value). That is an implementation detail, not a documented interface, so the workaround is brittle against any future change to consensus serialization.
3. **Aliasing footgun.** Because the slice keeps only the low 4 bytes, any value `>= 2^32` whose low four bytes match a canonical limb serializes identically to that limb. We have to add an explicit `(< v P)` guard to reject non-canonical inputs; a less careful contract would silently accept an aliased value. For soundness-critical code this is exactly the class of bug the language could make impossible.

**Describe the solution you'd like**

A native inverse of the existing `buff-to-{u}int-{be,le}` family — integer to fixed-width byte string, no type tag:

```clarity
;; proposed; names/signature open to the maintainers' preference
(uint-to-buff-be  (value uint) (width uint))  ;; => (buff width)
(uint-to-buff-le  (value uint) (width uint))
(int-to-buff-be   (value int)  (width uint))
(int-to-buff-le   (value int)  (width uint))
```

Suggested semantics:

- Big-/little-endian variants, matching the existing `*-be` / `*-le` reads.
- A `width` argument (e.g. `u4`, `u16`) returning exactly that many bytes.
- Abort if the value does not fit in `width` bytes (reject rather than truncate). This closes the aliasing footgun above for free — `u4` would reject anything `>= 2^32` without the caller needing a manual guard.

**Describe alternatives you've considered**

- A fixed 16-byte output (no `width` parameter) that callers slice themselves. Still a large improvement over routing through `to-consensus-buff?`, because it drops the type tag and the layout dependency, though callers would re-inherit the aliasing concern.
- The status quo: keep slicing `to-consensus-buff?`. It works, but every cryptographic contract re-derives the same fragile idiom and pays the serialization overhead on every hash.

**Additional context**

Clarity already ships the read direction (`buff-to-uint-be`, `buff-to-uint-le`, `buff-to-int-be`, `buff-to-int-le`); this request is the missing write direction of that same family, so the surface area and mental model are already established.

Concrete usage: in [Verifold](https://github.com/calesawr/verifold), a Circle-STARK proof verifier written entirely in Clarity, the number-to-bytes step appears in at least:

- [`contracts/commit.clar`](https://github.com/calesawr/verifold/blob/main/contracts/commit.clar) — `m31-to-be4` / `qm31-enc16`: encoding field elements into the canonical 16-byte form that serves both as the Merkle-leaf preimage and as the absorb message for opened values (shown above).
- The Fiat-Shamir transcript ([`contracts/transcript.clar`](https://github.com/calesawr/verifold/blob/main/contracts/transcript.clar)) requires every absorbed message to be canonically encoded by the caller (M31 = 4-byte BE, QM31 = 16 bytes), so this conversion sits in front of every transcript absorption as well as every Merkle leaf.

This runs on every query and every transcript step, so a native primitive is a direct, recurring saving on the verifier's hot path — not a one-off.

Impact summary:

- **Cheaper:** removes a 16-byte serialize + slice + retype on every encoded integer.
- **Safer:** an abort-on-overflow `width` argument eliminates the low-bytes aliasing class of bug at the language level.
- **Cleaner:** completes an existing, well-understood function family instead of depending on the internal layout of `to-consensus-buff?`.

Related: #3056 (variadic `concat`) addresses the adjacent cost in the same byte-assembly-then-hash pattern. Understood that new built-ins are consensus-breaking and can only activate with a new Clarity version at an epoch boundary; filing this so it can be considered for the next Clarity release window.
