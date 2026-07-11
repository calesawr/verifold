;; contracts/full/transcript.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/transcript.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; Fiat-Shamir transcript ("channel") for a Mersenne-31 STARK verifier, gear 4.
;; Turns an interactive "verifier sends random challenges" protocol into a
;; non-interactive proof: each challenge is derived by hashing the transcript so far,
;; so the verifier re-derives the same challenges the prover used.
;;
;; Design (locked for the spike; see docs/expert-review-questions.md for the full
;; rationale and the open questions a human STARK cryptographer must still sign off on):
;;   - state is ONE evolving (buff 32) sha256 digest -- absorb/squeeze thread it forward
;;     (same shape as merkle.clar's `acc`); buffers never grow.
;;   - absorb:  state' = sha256(state || OP_ABSORB || type-tag || msg)   (bind a commitment)
;;   - squeeze: blk = sha256(state || OP_SQUEEZE); value = BE(blk[0..16]) mod p; state' = blk
;;     squeezing ADVANCES the state, so "absorb-before-squeeze" is structural: a challenge
;;     can only ever hash a state that already folded in every prior commitment.
;;   - pow:     BE(sha256(state || OP_POW || nonce)[0..16]) < threshold
;; Choices: sha256, big-endian, 16-byte reduce (no rejection sampling -- bias ~2^-124 thanks
;; to the Mersenne structure 2^128 = 16 mod p), advance-on-squeeze. Domain separation: a 1-byte
;; op tag on every hash (absorb 0x00 / squeeze 0x01 / pow 0x02), plus a 1-byte field-type tag on
;; absorb ONLY -- squeeze and pow need no field tag because the fixed 32-byte state makes their op
;; inputs length-disjoint. `absorb` is PRIVATE, so the "tag is exactly 1 byte" invariant is
;; unconditional (the only public entry points are the typed wrappers below).
;; Differential- and known-answer-tested byte-for-byte against tests/transcript.ts.

(define-constant P u2147483647) ;; 2^31 - 1, shared with field.clar

;; op tags keep absorb / squeeze / proof-of-work in disjoint hash-input spaces
(define-constant OP_ABSORB 0x00)
(define-constant OP_SQUEEZE 0x01)
(define-constant OP_POW 0x02)

;; field-kind tags (absorb only) so a root can never be reinterpreted as a qm31, etc.
(define-constant T_ROOT 0x01)
(define-constant T_QM31 0x03)
(define-constant T_NONCE 0x05)

;; Seed the transcript from the caller-assembled context
;; (DOMAIN_LABEL || VERSION || PARAMS || sha256(public_inputs)) -- strong Fiat-Shamir:
;; the full public statement is bound BEFORE any prover message is absorbed.
(define-read-only (transcript-init (ctx (buff 1024)))
  (sha256 ctx))

;; Stir one tagged, fixed-width message into the running state. msg must be canonically
;; encoded by the caller (M31=4B BE, QM31=16B, root=32B, ...) so the preimage is unambiguous.
;; PRIVATE on purpose: exposing it would let a caller pass a non-1-byte type-tag, which could
;; shift the tag byte into msg and collide a ROOT absorb with a QM31 absorb (a Frozen-Heart-class
;; ambiguity). Keeping it private means type-tag is always one of the constant 1-byte wrappers.
(define-private (absorb (state (buff 32)) (type-tag (buff 1)) (msg (buff 64)))
  (sha256 (concat state (concat OP_ABSORB (concat type-tag msg)))))

(define-read-only (absorb-root (state (buff 32)) (root (buff 32)))
  (absorb state T_ROOT root))

(define-read-only (absorb-qm31 (state (buff 32)) (q (buff 16)))
  (absorb state T_QM31 q))

;; Bind the 8-byte grinding nonce in its OWN tag space (T_NONCE), so it can never be reinterpreted as a
;; root or a qm31. Used by the gear 6d Fiat-Shamir schedule to make the query indices depend on the
;; proof-of-work nonce (queries are drawn only after the nonce is absorbed).
(define-read-only (absorb-nonce (state (buff 32)) (nonce (buff 8)))
  (absorb state T_NONCE nonce))

;; Absorb a fixed-length list of roots (e.g. the FRI layer roots), threading the state --
;; same fold-over-a-list shape as merkle-step, since Clarity has no loops.
(define-private (absorb-root-step (root (buff 32)) (state (buff 32)))
  (absorb-root state root))
(define-read-only (absorb-roots (state (buff 32)) (roots (list 32 (buff 32))))
  (fold absorb-root-step roots state))

;; Read the first 16 bytes of a 32-byte hash as a big-endian uint.
;; slice? takes [0,16); as-max-len? re-types the result to (buff 16) so buff-to-uint-be
;; (which is capped at 16 bytes) accepts it. Both unwraps are infallible here by construction.
(define-private (read-u128-be (h (buff 32)))
  (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? h u0 u16)) u16))))

;; Squeeze one Mersenne-31 challenge, advancing the state.
;; Returns { v: field element in [0,p), state: the new 32-byte state }.
(define-read-only (squeeze-m31 (state (buff 32)))
  (let ((blk (sha256 (concat state OP_SQUEEZE))))
    { v: (mod (read-u128-be blk) P), state: blk }))

;; Squeeze a QM31 (~124-bit) challenge = 4 independent M31 limbs, threading the state.
;; Use this for every security-critical challenge; bare M31 only for query indices.
(define-read-only (squeeze-qm31 (state (buff 32)))
  (let ((r0 (squeeze-m31 state)))
  (let ((r1 (squeeze-m31 (get state r0))))
  (let ((r2 (squeeze-m31 (get state r1))))
  (let ((r3 (squeeze-m31 (get state r2))))
    { c0: (get v r0), c1: (get v r1), c2: (get v r2), c3: (get v r3),
      state: (get state r3) })))))

;; Grinding / proof-of-work check: the leading 16 bytes of sha256(state || OP_POW || nonce),
;; read big-endian, must be below `threshold` (= 2^(128 - pow_bits)). pow_bits leading zero bits.
(define-read-only (pow-ok (state (buff 32)) (nonce (buff 8)) (threshold uint))
  (< (read-u128-be (sha256 (concat state (concat OP_POW nonce)))) threshold))
