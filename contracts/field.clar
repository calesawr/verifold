;; Mersenne-31 field arithmetic, p = 2^31 - 1.
;; Field elements are assumed reduced in [0, p). All results are reduced.
;; Differential-tested against the plain-JS reference in tests/m31.ts.
(define-constant P u2147483647) ;; 2^31 - 1

(define-read-only (m31-add (a uint) (b uint))
  (mod (+ a b) P))

;; Clarity uint subtraction aborts on underflow (a < b), so add P first:
;; for a,b in [0,p), (a + p - b) is in [1, 2p-1] -> never underflows, and (mod .. p) == (a - b) mod p.
(define-read-only (m31-sub (a uint) (b uint))
  (mod (- (+ a P) b) P))

;; for a,b in [0,p), a*b < p^2 ~= 2^62, well within Clarity's 128-bit uint -> no overflow, no bignum.
(define-read-only (m31-mul (a uint) (b uint))
  (mod (* a b) P))

;; --- gear 2: exponentiation, inverse, division ---

;; Clarity has no loops or recursion: we iterate with `fold` over a fixed-length list.
;; STEPS has 31 entries (exponent < p < 2^31 => at most 31 bits); the element values are ignored.
(define-constant STEPS (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15
                             u16 u17 u18 u19 u20 u21 u22 u23 u24 u25 u26 u27 u28 u29 u30))

;; One square-and-multiply step over the accumulator
;;   { r: result so far, b: running power of base, e: remaining exponent }.
(define-private (pow-step (i uint) (st { r: uint, b: uint, e: uint }))
  (let ((r (get r st)) (b (get b st)) (e (get e st)))
    {
      r: (if (is-eq (mod e u2) u1) (m31-mul r b) r), ;; if the lowest bit is set, fold b into r
      b: (m31-mul b b),                              ;; square b for the next bit
      e: (/ e u2)                                    ;; drop the lowest bit (shift right by 1)
    }))

;; base^exp mod p, via 31 unrolled square-and-multiply steps (exponent bits 0..30).
;; DOMAIN GUARD: the unroll only reads 31 bits, so an exponent >= 2^31 would be silently
;; truncated to its low 31 bits and return a wrong-but-plausible value. We abort instead --
;; the reject/safe direction, mirroring fri.clar's x=0 guard. Legitimate field exponents are
;; reduced mod (p-1) = 2^31-2 < 2^31 by Fermat, so this never rejects a correct computation
;; (m31-inv passes p-2 = 2^31-3, inside the bound).
(define-constant POW_EXP_BOUND u2147483648) ;; 2^31
(define-read-only (m31-pow (base uint) (exp uint))
  (unwrap-panic (if (< exp POW_EXP_BOUND)
    (some (get r (fold pow-step STEPS { r: u1, b: base, e: exp })))
    none)))

;; Multiplicative inverse via Fermat's little theorem: a^(p-2) = a^-1 (valid only for a != 0).
(define-read-only (m31-inv (a uint))
  (m31-pow a (- P u2)))

;; Division: a / b = a * b^-1 (requires b != 0).
(define-read-only (m31-div (a uint) (b uint))
  (m31-mul a (m31-inv b)))
