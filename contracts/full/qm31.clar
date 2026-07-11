;; contracts/full/qm31.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/qm31.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; QM31 -- the degree-4 "secure field" extension of Mersenne-31, gear 5a.
;; FRI challenges and folded codeword values live here (~124-bit), not in the base field:
;; a base-field M31 challenge would collapse soundness to ~2^-31 per query.
;;
;; Tower (MUST match the prover -- flagged for the human cryptographer):
;;   CM31 = M31[i]/(i^2 + 1)        so i^2 = -1
;;   QM31 = CM31[u]/(u^2 - (2+i))   so u^2 = R = 2 + i
;; An element {c0,c1,c2,c3} means (c0 + c1*i) + (c2 + c3*i)*u -- the same 4-limb shape that
;; transcript.clar's squeeze-qm31 emits. Differential- and known-answer-tested vs tests/qm31.ts.
;;
;; The three CHEAP base-field ops (add/sub/mul) are defined locally to avoid cross-contract overhead.
;; The one EXPENSIVE op, m31-inv (added in gear 6a for the QM31 inverse norm), cross-calls .field
;; instead of re-duplicating the guarded 31-step Fermat machinery -- one source of truth for inverse
;; (deploy order field -> qm31 -> fri stays acyclic). The qm31<->field equivalence test pins the rest.

(define-constant P u2147483647) ;; 2^31 - 1

(define-private (m31-add (a uint) (b uint)) (mod (+ a b) P))
;; add P before subtracting so the unsigned intermediate never underflows (Clarity aborts on a < b)
(define-private (m31-sub (a uint) (b uint)) (mod (- (+ a P) b) P))
(define-private (m31-mul (a uint) (b uint)) (mod (* a b) P))

;; CM31 multiply: (x0 + x1*i)(y0 + y1*i) = (x0*y0 - x1*y1) + (x0*y1 + x1*y0)*i   (i^2 = -1)
;; READ-ONLY (gear 6d-iii enabling edit): the circle group law IS CM31 multiply, so query.clar reuses this
;; ONE tested definition (no third copy of the tower convention) instead of inlining its own. Internal
;; callers (qm31-mul, qm31-inv) still call it directly; exposing it adds capability, changes no behavior.
(define-read-only (cm-mul (x0 uint) (x1 uint) (y0 uint) (y1 uint))
  { re: (m31-sub (m31-mul x0 y0) (m31-mul x1 y1)),
    im: (m31-add (m31-mul x0 y1) (m31-mul x1 y0)) })

;; multiply a CM31 by R = 2 + i:  (e0 + e1*i)(2 + i) = (2*e0 - e1) + (e0 + 2*e1)*i
(define-private (cm-mul-r (e0 uint) (e1 uint))
  { re: (m31-sub (m31-add e0 e0) e1),
    im: (m31-add e0 (m31-add e1 e1)) })

;; CM31 subtract (limb-wise), used by the QM31 norm A^2 - R*B^2 in qm31-inv.
(define-private (cm-sub (x0 uint) (x1 uint) (y0 uint) (y1 uint))
  { re: (m31-sub x0 y0), im: (m31-sub x1 y1) })

;; CM31 inverse: for c = c0 + c1*i the conjugate is c0 - c1*i and the norm c*conj = c0^2 + c1^2 in
;; M31 (since i^2 = -1), so c^-1 = (c0 - c1*i) * (c0^2 + c1^2)^-1. The norm is 0 only for c = 0, where
;; m31-inv(0) = 0 makes this return 0 (the zero element has no inverse; callers must pass c != 0, the
;; same contract as m31-inv). Uses .field's guarded m31-inv (single source of truth for the inverse).
(define-private (cm-inv (c0 uint) (c1 uint))
  (let ((ninv (contract-call? .field-full m31-inv (m31-add (m31-mul c0 c0) (m31-mul c1 c1)))))
    { re: (m31-mul c0 ninv), im: (m31-mul (m31-sub u0 c1) ninv) }))

(define-read-only (qm31-add (a { c0: uint, c1: uint, c2: uint, c3: uint })
                            (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  { c0: (m31-add (get c0 a) (get c0 b)), c1: (m31-add (get c1 a) (get c1 b)),
    c2: (m31-add (get c2 a) (get c2 b)), c3: (m31-add (get c3 a) (get c3 b)) })

(define-read-only (qm31-sub (a { c0: uint, c1: uint, c2: uint, c3: uint })
                            (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  { c0: (m31-sub (get c0 a) (get c0 b)), c1: (m31-sub (get c1 a) (get c1 b)),
    c2: (m31-sub (get c2 a) (get c2 b)), c3: (m31-sub (get c3 a) (get c3 b)) })

;; scale a QM31 by a base-field M31 scalar (used for the FRI twiddle 1/x)
(define-read-only (qm31-mul-m31 (a { c0: uint, c1: uint, c2: uint, c3: uint }) (s uint))
  { c0: (m31-mul (get c0 a) s), c1: (m31-mul (get c1 a) s),
    c2: (m31-mul (get c2 a) s), c3: (m31-mul (get c3 a) s) })

;; embed a base-field scalar s as the QM31 element s + 0*i + 0*u + 0*iu
(define-read-only (qm31-from-m31 (s uint)) { c0: s, c1: u0, c2: u0, c3: u0 })

;; QM31 multiply: with A=(c0,c1), B=(c2,c3) so a = A + B*u (similarly C,D for b),
;; (A + B*u)(C + D*u) = (A*C + R*B*D) + (A*D + B*C)*u.
(define-read-only (qm31-mul (a { c0: uint, c1: uint, c2: uint, c3: uint })
                            (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((ac (cm-mul (get c0 a) (get c1 a) (get c0 b) (get c1 b)))
        (bd (cm-mul (get c2 a) (get c3 a) (get c2 b) (get c3 b)))
        (ad (cm-mul (get c0 a) (get c1 a) (get c2 b) (get c3 b)))
        (bc (cm-mul (get c2 a) (get c3 a) (get c0 b) (get c1 b))))
    (let ((rbd (cm-mul-r (get re bd) (get im bd))))
      { c0: (m31-add (get re ac) (get re rbd)), c1: (m31-add (get im ac) (get im rbd)), ;; low  = A*C + R*B*D
        c2: (m31-add (get re ad) (get re bc)), c3: (m31-add (get im ad) (get im bc)) }))) ;; high = A*D + B*C

;; QM31 inverse via the conjugate/norm tower. Write a = A + B*u with A=(c0,c1), B=(c2,c3) in CM31.
;; The conjugate over u is A - B*u, and the norm down to CM31 is N = a*conj = A^2 - R*B^2 (u^2 = R).
;; Then a^-1 = conj * N^-1 = (A - B*u) * Ninv, i.e. low limb = A*Ninv, high limb = -(B*Ninv).
;; REJECT (red-team): the norm N is 0 only for a = 0 (QM31 is a field), so qm31-inv ABORTS when N = 0
;; instead of returning a silent 0 -- the safe/reject direction, matching fri-fold-step's x=0 guard
;; (a silent 0 would be an accept-direction hole for the gear-6b DEEP quotient denominator).
;; PRECONDITION: input limbs must be canonical/reduced (each < p), the same obligation as qm31-eq.
(define-read-only (qm31-inv (a { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((a0 (get c0 a)) (a1 (get c1 a)) (b0 (get c2 a)) (b1 (get c3 a)))
    (let ((aa (cm-mul a0 a1 a0 a1))   ;; A^2
          (bb (cm-mul b0 b1 b0 b1)))  ;; B^2
      (let ((rbb (cm-mul-r (get re bb) (get im bb))))                              ;; R*B^2
        (let ((n (cm-sub (get re aa) (get im aa) (get re rbb) (get im rbb))))     ;; N = A^2 - R*B^2
          (unwrap-panic (if (and (is-eq (get re n) u0) (is-eq (get im n) u0))
            none                                                                  ;; a = 0 -> reject
            (some
              (let ((ni (cm-inv (get re n) (get im n))))                          ;; N^-1 in CM31
                (let ((lo (cm-mul a0 a1 (get re ni) (get im ni)))                 ;; A * Ninv
                      (hi (cm-mul b0 b1 (get re ni) (get im ni))))               ;; B * Ninv
                  { c0: (get re lo), c1: (get im lo),
                    c2: (m31-sub u0 (get re hi)), c3: (m31-sub u0 (get im hi)) })))))))))) ;; high = -(B*Ninv)

;; Limb-wise equality. PRECONDITION (ToB re-audit): both inputs must have canonical reduced limbs
;; (each < p). Everything this contract and transcript.clar's squeeze-qm31 produce is already reduced;
;; the gear-6 leaf decoder must canonicalize any externally-supplied QM31 opening before comparing,
;; or two encodings of the same field element could compare unequal.
(define-read-only (qm31-eq (a { c0: uint, c1: uint, c2: uint, c3: uint })
                           (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  (is-eq a b))
