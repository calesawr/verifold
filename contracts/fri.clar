;; FRI low-degree-test fold core, gear 5b -- the heart of the STARK verifier.
;; FRI proves a committed codeword is close to a low-degree polynomial: each layer folds the
;; codeword in half against a random challenge beta, and the final layer must be a low-degree poly.
;; This contract is the per-query ALGEBRA: the fold butterfly, the multi-layer fold-down, and the
;; final low-degree check. It reuses .qm31 (extension arithmetic) and .field (base-field inverse).
;;
;; Convention (LOCKED for the spike; flagged for the human): Stwo "no-1/2" line fold
;;   folded = (a + b) + beta * (a - b) * x^{-1}
;; Values a,b,beta,folded are QM31 (~124-bit); the source point x and its inverse are base-field M31.
;; Next-layer source point uses the circle/Chebyshev map pi(x) = 2x^2 - 1 (built + tested here).
;;
;; SCOPE: this is structurally a Circle-STARK INNER-layer verifier (obligations B = fold consistency
;; and D = final low-degree check). DEFERRED to gear 6 + the human cryptographer: the circle FIRST
;; step (fold_circle_into_line), Merkle binding of openings (obligation C, needs the QM31-leaf encoding),
;; query-index/domain derivation, the multi-query loop, beta re-derivation from the transcript, and the
;; soundness parameters. Differential-, known-answer-, and strong-low-degree-polynomial-tested vs tests/fri.ts.

;; circle / Chebyshev next-layer source-point map: pi(x) = 2x^2 - 1.
;; PROVIDED for gear-6 domain derivation; fri-fold-down does NOT call it -- it takes the source
;; point x per layer as input, so the fold-down is map-agnostic. The single-step fold algebra is
;; identical for classical line FRI (next point x^2) and circle FRI (next point 2x^2-1); WHICH map
;; governs the inner-line x-sequence is a gear-6 / human decision still to be confirmed.
(define-read-only (pi-x (x uint))
  (contract-call? .field m31-sub
    (contract-call? .field m31-mul u2 (contract-call? .field m31-mul x x))
    u1))

;; one 2-to-1 FRI butterfly. a = f(x), b = f(-x) (the two opened siblings, QM31);
;; x = the SOURCE-layer domain point (base-field M31); beta = this layer's challenge (QM31).
;;   f0 = a + b                         (even part)
;;   f1 = (a - b) * x^{-1}              (odd part, scaled by the inverse source point)
;;   folded = f0 + beta * f1            (the only full QM31 x QM31 multiply per pair)
;; NOT symmetric in (a,b): orientation is handled by the caller's v-is-right bit.
;; x=0 is rejected by aborting: m31-inv(0) returns 0 (Fermat 0^(p-2)=0, not an abort), which would
;; silently null the odd part and make the fold beta-independent (an accept-direction soundness hole).
;; Aborting is the safe (reject) direction. The human must still confirm the domain never contains x=0.
(define-read-only (fri-fold-step
    (a { c0: uint, c1: uint, c2: uint, c3: uint })
    (b { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint }))
  (unwrap-panic (if (is-eq x u0)
    none
    (some
      (let ((f0 (contract-call? .qm31 qm31-add a b))
            (f1 (contract-call? .qm31 qm31-mul-m31
                  (contract-call? .qm31 qm31-sub a b)
                  (contract-call? .field m31-inv x))))
        (contract-call? .qm31 qm31-add f0 (contract-call? .qm31 qm31-mul beta f1)))))))

;; the verifier's per-layer consistency check (obligation B): the folded value must equal the
;; value claimed at the next layer's halved position (which is itself a Merkle-opened leaf in gear 6).
(define-read-only (fri-fold-check
    (a { c0: uint, c1: uint, c2: uint, c3: uint })
    (b { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (claimed { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31 qm31-eq (fri-fold-step a b x beta) claimed))

;; one layer of the fold-down. Mirrors merkle-step: ELEMENT first, ACCUMULATOR second.
;; v-is-right says whether the carried value v is the RIGHT sibling f(-x) (true) or the LEFT f(x).
(define-private (fold-layer-step
    (lyr { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
           beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })
    (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (if (get v-is-right lyr)
      (fri-fold-step (get sibling lyr) v (get x lyr) (get beta lyr))
      (fri-fold-step v (get sibling lyr) (get x lyr) (get beta lyr))))

;; fold an opened layer-0 value all the way down through every layer (loop-unrolled via fold).
;; REJECT CHANNEL (ToB re-audit): if any layer carries x=0, fri-fold-step aborts, so fri-fold-down
;; and fri-final-ok ABORT rather than return false. The gear-6 driver must treat such an abort as a
;; rejected proof, identically to a `false` from fri-fold-check / fri-final-ok.
(define-read-only (fri-fold-down
    (v0 { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })))
  (fold fold-layer-step layers v0))

;; final low-degree check (obligation D, the Plonky3-CVE class): the folded-down value must equal
;; the explicitly transmitted final polynomial. Spike form = a single committed degree-0 constant.
;; NOT STANDALONE-SOUND: until obligation C (Merkle binding of every opening), transcript-derived
;; beta, and the multi-query loop land in gear 6, a prover can pick (v0, final) jointly to satisfy
;; this trivially (final := fri-fold-down(v0, layers)). The caller must also bind layers.length to
;; the domain-derived layer count L (an empty list returns v0, so fri-final-ok(v0,(list),v0)=true).
(define-read-only (fri-final-ok
    (v0 { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool }))
    (final { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31 qm31-eq (fri-fold-down v0 layers) final))

;; ---- wire v2 (M2): hint-checked fold ----
;; The prover transmits hint = x^-1 mod p per layer; the verifier checks
;; x * hint == 1 mod p (one multiply plus one equality, replacing the 31-step
;; Fermat inversion) and multiplies by the hint. A wrong hint ABORTS via the
;; house reject-by-abort idiom. x = 0 can never satisfy the check, so the
;; fri-fold-step zero-twiddle abort property is preserved. A non-canonical
;; hint (hint + k*p) yields the same folded value (qm31-mul-m31 reduces), so
;; hint malleability cannot change any checked value.
(define-read-only (fri-fold-step-hint
    (a { c0: uint, c1: uint, c2: uint, c3: uint })
    (b { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (hint uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint }))
  (begin
    (unwrap-panic (if (is-eq (contract-call? .field m31-mul x hint) u1) (some true) none))
    (let ((f0 (contract-call? .qm31 qm31-add a b))
          (f1 (contract-call? .qm31 qm31-mul-m31 (contract-call? .qm31 qm31-sub a b) hint)))
      (contract-call? .qm31 qm31-add f0 (contract-call? .qm31 qm31-mul beta f1)))))

;; mirrors fold-layer-step with the hint field threaded through
(define-private (fold-layer-step-hint
    (lyr { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint, hint: uint,
           beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })
    (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (if (get v-is-right lyr)
      (fri-fold-step-hint (get sibling lyr) v (get x lyr) (get hint lyr) (get beta lyr))
      (fri-fold-step-hint v (get sibling lyr) (get x lyr) (get hint lyr) (get beta lyr))))

;; the same affine fold as fri-fold-down, twiddle inverses supplied as
;; checked hints (proof wire format v2; the M2 driver consumes this per layer)
(define-read-only (fri-fold-down-hint
    (v0 { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint, hint: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })))
  (fold fold-layer-step-hint layers v0))
