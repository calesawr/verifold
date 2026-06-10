;; DEPRECATED (gear 6e): superseded by cair.clar / cdeep.clar -- the real circle AIR + the live
;; Stwo pair-vanishing DEEP quotients. NOT referenced by driver.clar since gear 6e; OMITTED from
;; the canonical deployment manifest. Kept (with its byte-green test suite) as the tested
;; gear-6b/6c record of the retired multiplicative-domain conventions. PLANNED DELETION: a future
;; cleanup gear deletes this contract AND its tests as a pair -- a decision, not drift.
;; AIR composition-evaluation core, gear 6b. The verifier's algebraic check: from OPENED trace values
;; at an out-of-domain point z (and its g- and g^2-shifts) plus a transcript challenge alpha, evaluate
;; the toy AIR's constraints, divide each by its vanishing-polynomial value at z to form a quotient,
;; and random-linear-combine the quotients with powers of alpha into ONE composition value.
;;
;; TOY AIR (a stand-in for the real constraint system; see the gear-6b spec + the expert-review doc):
;; a single-column Fibonacci trace T over the order-9 multiplicative subgroup H of M31 (rows
;; [1,1,2,3,5,8,13,21,34] on H[k] = g^k). Constraints:
;;   transition C_t = T(g^2 z) - T(g z) - T(z),  vanishing Z_t(x) = (x^9 - 1)/((x - g^7)(x - g^8))
;;   boundary0  C_0 = T(z) - 1,                  vanishing Z_0(x) = x - 1     (row 0, H[0] = 1)
;;   boundary1  C_1 = T(z) - 1,                  vanishing Z_1(x) = x - g     (row 1, H[1] = g)
;; (Both boundaries use the CURRENT-row opening T(z): they share the numerator T(z)-1 over different
;;  single-point vanishers (z-1) and (z-g). Pairing the next-row opening T(g z)-1 with (z-g) would NOT
;;  be a polynomial -- red-team fix; the honest-composition low-degree test now guards this.)
;; composition = q_t + alpha*q_0 + alpha^2*q_1, with q_i = C_i(z) * Z_i(z)^{-1}.
;;
;; NOT STANDALONE-SOUND: gear 6b checks only the ALGEBRA on opened values. Binding the openings to the
;; committed trace roots (obligation C, gear 6d), the DEEP (x - z) quotients that feed FRI (gear 6c),
;; and deriving z / alpha from the transcript (6d) are what make it sound -- a prover can otherwise pick
;; openings to satisfy this in isolation. Reuses .qm31 (extension arithmetic + inverse) via read-only
;; contract-call?. qm31-inv aborts on a zero denominator, so an in-domain z is REJECTED (the safe
;; direction, matching fri-fold-step's x=0 guard). Differential-, KAT-, and honest-trace-tested vs tests/air.ts.

(define-constant G u309107220)    ;; generator of the order-9 subgroup of M31*
(define-constant G7 u1072993205)  ;; g^7  (excluded "wrap" row 7)
(define-constant G8 u864490562)   ;; g^8  (excluded "wrap" row 8)

;; transition constraint evaluated from the three openings: C_t = T(g^2 z) - T(g z) - T(z)
(define-read-only (eval-transition
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31 qm31-sub (contract-call? .qm31 qm31-sub t-g2z t-gz) t-z))

;; a boundary constraint: opening minus the expected seed value. C = T(point) - expected.
(define-read-only (eval-boundary
    (t-open { c0: uint, c1: uint, c2: uint, c3: uint })
    (expected { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31 qm31-sub t-open expected))

;; z^9 by square-and-multiply (z2 = z^2, z4 = z^4, z8 = z^8, z9 = z8 * z).
(define-private (z-pow9 (z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((z2 (contract-call? .qm31 qm31-mul z z)))
    (let ((z4 (contract-call? .qm31 qm31-mul z2 z2)))
      (let ((z8 (contract-call? .qm31 qm31-mul z4 z4)))
        (contract-call? .qm31 qm31-mul z8 z)))))

;; transition vanishing value Z_t(z) = (z^9 - 1) / ((z - g^7)(z - g^8)). ABORTS if z = g^7 or g^8.
(define-read-only (vanish-trans (z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((one (contract-call? .qm31 qm31-from-m31 u1)))
    (let ((num (contract-call? .qm31 qm31-sub (z-pow9 z) one))
          (den (contract-call? .qm31 qm31-mul
                 (contract-call? .qm31 qm31-sub z (contract-call? .qm31 qm31-from-m31 G7))
                 (contract-call? .qm31 qm31-sub z (contract-call? .qm31 qm31-from-m31 G8)))))
      (contract-call? .qm31 qm31-mul num (contract-call? .qm31 qm31-inv den)))))

;; the three constraint quotients q_i = C_i(z) * Z_i(z)^{-1}. Each qm31-inv aborts on an in-domain z.
(define-read-only (air-quotients
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((one (contract-call? .qm31 qm31-from-m31 u1)))
    { q-trans: (contract-call? .qm31 qm31-mul
                 (eval-transition t-z t-gz t-g2z)
                 (contract-call? .qm31 qm31-inv (vanish-trans z))),
      q-b0: (contract-call? .qm31 qm31-mul
              (eval-boundary t-z one)
              (contract-call? .qm31 qm31-inv (contract-call? .qm31 qm31-sub z one))),
      q-b1: (contract-call? .qm31 qm31-mul
              (eval-boundary t-z one)
              (contract-call? .qm31 qm31-inv
                (contract-call? .qm31 qm31-sub z (contract-call? .qm31 qm31-from-m31 G)))) }))

;; the gear-6b deliverable: the composition value = q_trans + alpha*q_b0 + alpha^2*q_b1.
(define-read-only (air-compose
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (z { c0: uint, c1: uint, c2: uint, c3: uint })
    (alpha { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((q (air-quotients t-z t-gz t-g2z z)))
    (contract-call? .qm31 qm31-add
      (contract-call? .qm31 qm31-add
        (get q-trans q)
        (contract-call? .qm31 qm31-mul alpha (get q-b0 q)))
      (contract-call? .qm31 qm31-mul (contract-call? .qm31 qm31-mul alpha alpha) (get q-b1 q)))))

;; obligation wrapper: the recomputed composition must equal the claimed value (the 6c/6d driver calls this).
(define-read-only (air-compose-check
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (z { c0: uint, c1: uint, c2: uint, c3: uint })
    (alpha { c0: uint, c1: uint, c2: uint, c3: uint })
    (claimed { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31 qm31-eq (air-compose t-z t-gz t-g2z z alpha) claimed))
