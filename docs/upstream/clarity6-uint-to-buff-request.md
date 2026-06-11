# Clarity 6 request: native `uint`/`int` → big-endian `buff` serialization

> Draft of a stacks-core issue. Goal: get a cheap, native integer-to-bytes
> primitive into the Clarity 6 window, so on-chain hashing code stops paying for
> a `to-consensus-buff?` workaround. Plain-language summary first, technical
> detail below.

---

## In one sentence

Clarity can turn bytes into an integer (`buff-to-uint-be`) but has **no clean way
to turn an integer back into a fixed-width big-endian byte string**. Today we fake
it with `to-consensus-buff?` plus a slice, which costs more, is easy to get wrong,
and has a silent aliasing footgun. We'd like the inverse function added natively.

## Why this matters (the plain version)

Any contract that hashes structured data — Merkle trees, Fiat-Shamir transcripts,
proof verifiers, commitment schemes — has to lay numbers out as raw bytes before
feeding them to `sha256`. That "number → bytes" step is one of the most common
operations in cryptographic Clarity code, and right now there is no direct tool
for it. The workaround works, but it is paid for on every single hash, and it is a
known source of subtle bugs.

## The current workaround

There is no `uint -> buff`. The closest tool, `to-consensus-buff?`, returns a
**type-tagged, 16-byte** encoding, so to recover a clean 4-byte big-endian limb we
serialize the whole thing and slice the bytes back out:

```clarity
;; 4-byte big-endian of one M31 limb (p = 2^31 - 1), as actually shipped today.
;; to-consensus-buff?(uint) => 0x01 (type tag) || 16-byte big-endian value,
;; so bytes [13,17) are the low 4 big-endian bytes.
(define-private (m31-to-be4 (v uint))
  (unwrap-panic (if (< v P)
    (as-max-len? (unwrap-panic (slice? (unwrap-panic (to-consensus-buff? v)) u13 u17)) u4)
    none)))
```

Three problems with this, each one independently annoying:

1. **Cost.** Every limb pays for a full 16-byte consensus serialization, a
   `slice?`, an `as-max-len?` re-type, and two `unwrap-panic`s — just to obtain
   four bytes. In a STARK verifier this runs on every opened field element and
   every transcript absorption, so it is squarely on the hot path.
2. **Fragility.** The code depends on the *internal byte layout* of
   `to-consensus-buff?` (a `0x01` tag followed by a 16-byte big-endian value).
   That is an implementation detail, not a documented interface, so the
   workaround is brittle against any future change to consensus serialization.
3. **Aliasing footgun.** Because we slice only the low 4 bytes, any value
   `>= 2^32` whose low four bytes match a canonical limb would serialize
   **identically** to that limb. We have to add an explicit `(< v P)` guard to
   reject non-canonical inputs; a less careful contract would silently accept an
   aliased value. For a soundness-critical verifier this is exactly the class of
   bug we most want the language to make impossible.

## What we'd like

A native inverse of the existing `buff-to-{u}int-{be,le}` family — integer to
fixed-width byte string, no type tag:

```clarity
;; proposed; names/signature open to the maintainers' preference
(uint-to-buff-be  (value uint) (width uint))  ;; => (buff width)
(uint-to-buff-le  (value uint) (width uint))
(int-to-buff-be   (value int)  (width uint))
(int-to-buff-le   (value int)  (width uint))
```

Suggested semantics:

- **Big-/little-endian** variants, matching the existing `*-be` / `*-le` reads.
- A **`width`** argument (e.g. `u4`, `u16`) returning exactly that many bytes.
- **Abort if the value does not fit in `width` bytes** (i.e. reject rather than
  truncate). This is the property that closes the aliasing footgun above for
  free — `u4` would reject anything `>= 2^32` without the caller needing a manual
  guard.

If a `width` parameter is undesirable, a fixed 16-byte (for `uint`) / typed-width
output that callers slice is still a large improvement over routing through
`to-consensus-buff?`, because it drops the type tag and the layout dependency.

## Prior art / symmetry

Clarity already ships the read direction:

- `buff-to-uint-be`, `buff-to-uint-le`
- `buff-to-int-be`, `buff-to-int-le`

The request is simply the missing **write** direction of that same family, so the
surface area and mental model are already established.

## Where this is used (concrete)

In Verifold (a Circle-STARK proof verifier written entirely in Clarity), the
number→bytes step appears in at least:

- `contracts/commit.clar` — `m31-to-be4` / `qm31-enc16`: encoding field elements
  into the canonical 16-byte Merkle-leaf preimage. (Shown above.)
- `contracts/transcript.clar` — assembling the Fiat-Shamir absorb/squeeze
  preimages that get hashed.

These run on every query and every transcript step, so a native primitive is a
direct, recurring cost saving on the verifier's hot path — not a one-off.

## Impact summary

- **Cheaper:** removes a 16-byte serialize + slice + retype on every encoded
  integer.
- **Safer:** an abort-on-overflow `width` argument eliminates the low-bytes
  aliasing class of bug at the language level.
- **Cleaner:** completes an existing, well-understood function family instead of
  depending on the internal layout of `to-consensus-buff?`.
