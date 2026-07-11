;; contracts/full/query.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/query.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; Gear 6d-iii: the query-index -> evaluation-domain point map.
;;
;; Gear 6d-ii draws a query INDEX q in [0, DOMAIN_SIZE) (squeeze mod DOMAIN_SIZE). This contract turns q into
;; the base-field M31 point x_q at which the Merkle leaf was opened (6d-i), the DEEP denominators (x - z) are
;; formed (6c), and the FRI line-fold consumes x (gear 5).
;;
;; WHY THE CIRCLE: M31 has 2-adicity 1 (p-1 = 2*odd), so there is NO multiplicative subgroup of size 4,8,16...
;; The evaluation domain lives on the CIRCLE GROUP: the norm-1 elements of CM31 = M31[i]/(i^2+1)
;; (norm = x^2+y^2), cyclic of order p+1 = 2^31, which HAS power-of-two subgroups. A circle point (x,y) is the
;; norm-1 element x+y*i; circle-group ADD == CM31 MUL (.qm31 cm-mul); the x-coord of DOUBLING is 2x^2-1 ==
;; gear-5 pi-x. So index -> P_i = OFF * H^i on the circle, x_i = Re(P_i), and pi-x halves the domain.
;;
;; CONSTRUCTION (Stwo canonic coset, faithfully reproduced; verified vs Stwo's generator in Python):
;;   G = (2, 1268011823) = Stwo M31_CIRCLE_GEN, order 2^31.  Toy DOMAIN_SIZE = 16 (log_size L = 4).
;;   The CircleDomain is the half-coset of size 8 UNION its conjugate half. Factored (tiny exponent):
;;     OFF = G^(2^26) (order 32, canonic coset shift),  H = G^(2^28) (order 8, half-coset step).
;;     domain-point(i) = OFF*H^i        for i < 8     (verified == Stwo G^{index_at(i)})
;;                     = conj(OFF*H^(i-8)) for 8<=i<16  (conjugate (x,y)->(x,-y) = circle inverse = G^{-idx})
;;   The Fiat-Shamir index q is a BIT-REVERSED position into the eval array (Stwo commits bit-reversed), so
;;   query-point(q) = domain-point(bitrev(q)).
;;
;; The coset shift is LOAD-BEARING: the raw subgroup contains (0,+-1) whose x=0 (at i=4,12) and fri-fold-step
;; aborts on x=0. The canonic coset makes every x_q and y_q nonzero. NOTE (red-team): fri-fold-step aborts on
;; the per-layer SOURCE x it is handed, which is the pi-iterated point pix^k(x), NOT the layer-0 x_q -- and a
;; nonzero x_q can still pi-iterate to 0 (pix(32768)=0, 32768=sqrt(1/2) mod p). The real safety property,
;; tested here, is that no pi-iterated fold-SOURCE layer (size > 1) contains 0; the only 0 is the size-1
;; TERMINAL value, which the driver compares but never folds. So honest queries never hit the x=0 abort.
;;
;; NOT PROVER-CONFIRMED: the coset/offset, the bit-reversal direction, the circle FIRST-fold 1/y twiddle, and
;; the circle mask-shift semantics are documented defaults matching Stwo's source as read by the design panel,
;; NOT differentially tested against a live prover. A mismatch is a COMPLETENESS break (honest proofs
;; rejected), NOT a soundness hole. See QUERY-1..6 in the expert-review-request doc. Deploy: field -> qm31 ->
;; query (reuses .qm31 cm-mul, the one CM31 group law).

;; COUPLED TOY CONSTANTS (red-team): for L = log2(DOMAIN_SIZE) these four MUST change together, or a partial
;; edit silently breaks completeness: HALF = DOMAIN_SIZE/2; CM_POW_BOUND >= HALF (cm-pow's max exponent is
;; HALF-1); CM_STEPS must have ceil(log2(HALF)) bits; BITREV4 must be a width-L bit-reversal of length
;; DOMAIN_SIZE. DOMAIN_SIZE must also equal schedule.clar's DOMAIN_SIZE (the query-index modulus) -- if
;; schedule's modulus drops below this, the query space shrinks (a soundness-margin loss); if it rises above,
;; q >= DOMAIN_SIZE aborts (completeness). The full-range KATs (all 16 indices) catch a same-file partial edit.
(define-constant P u2147483647)         ;; 2^31 - 1
(define-constant DOMAIN_SIZE u131072)       ;; toy LDE coset size (= 2^L); the real size is a human question (QUERY-5)
(define-constant HALF u65536)               ;; DOMAIN_SIZE / 2 (the half-coset size)
(define-constant CM_POW_BOUND u65536)       ;; >= HALF: H has order 8, so the factored exponent is always < 8
(define-constant CM_STEPS (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15)) ;; 3 unrolled square-and-multiply bits (exponent < 8)

;; canonic-coset constants (CM31 points), verified against Stwo's generator
(define-constant OFF { re: u1799120754, im: u343598868 }) ;; G^(2^26), order 32
(define-constant H   { re: u1389168750, im: u838891026 }) ;; G^(2^28), order 8

;; bit-reversal of the low L=4 bits, pinned as a lookup. element-at? returns none for q >= 16 -> the natural
;; range guard for query-x (out-of-range index aborts via unwrap-panic).
;; BITREV4 lookup absorbed at this point: bitrev is computed over LOG_DOMAIN bits (see bitrev)

;; circle-group addition == CM31 multiply: reuse qm31.clar's ONE tested CM31 product (read-only).
(define-private (cm (a { re: uint, im: uint }) (b { re: uint, im: uint }))
  (contract-call? .qm31-full cm-mul (get re a) (get im a) (get re b) (get im b)))

;; one square-and-multiply step over { r: result, b: running square, e: remaining exponent } (CM31 points).
(define-private (cm-pow-step (i uint) (st { r: { re: uint, im: uint }, b: { re: uint, im: uint }, e: uint }))
  (let ((r (get r st)) (b (get b st)) (e (get e st)))
    { r: (if (is-eq (mod e u2) u1) (cm r b) r),
      b: (cm b b),
      e: (/ e u2) }))

;; base^exp on the circle (exp < CM_POW_BOUND = 8). ABORTS if exp >= bound (the reject/safe direction,
;; mirroring field.clar's m31-pow guard); the factored form only ever passes i mod 8, so this never rejects.
(define-private (cm-pow (base { re: uint, im: uint }) (exp uint))
  (unwrap-panic (if (< exp CM_POW_BOUND)
    (some (get r (fold cm-pow-step CM_STEPS { r: { re: u1, im: u0 }, b: base, e: exp })))
    none)))

;; circle conjugate (x,y) -> (x,-y), i.e. the circle inverse. im < p (cm-mul outputs are reduced), so -im = p-im.
(define-private (conj (pt { re: uint, im: uint }))
  { re: (get re pt), im: (mod (- P (get im pt)) P) })

;; geometric circle point at index i (Stwo CircleDomain order): first half = the half-coset OFF*H^i, second
;; half = its conjugate. ABORTS for i >= DOMAIN_SIZE (reject direction).
(define-read-only (domain-point (i uint))
  (unwrap-panic (if (< i DOMAIN_SIZE)
    (some (let ((base (cm OFF (cm-pow H (if (< i HALF) i (- i HALF))))))
            (if (< i HALF) base (conj base))))
    none)))

;; the base-field x-coordinate Re(P_i) -- what deep.clar (x - z) and gear-5 FRI consume.
(define-read-only (domain-x (i uint))
  (get re (domain-point i)))

;; bit-reversal of the low L bits; aborts (via the lookup) for q >= DOMAIN_SIZE.
(define-private (bitrev-step (i uint) (st { q: uint, r: uint }))
  { q: (/ (get q st) u2),
    r: (+ (* (get r st) u2) (mod (get q st) u2)) })
(define-read-only (bitrev (q uint))
  (begin
    (unwrap-panic (if (< q DOMAIN_SIZE) (some true) none))
    (get r (fold bitrev-step (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16) { q: q, r: u0 }))))

;; the Fiat-Shamir index q is a bit-reversed position; the geometric point is domain-point(bitrev(q)).
;; Exposes im (= y) for the deferred circle first-fold (fold_circle_into_line divides by y), gear 6d-iv+.
(define-read-only (query-point (q uint))
  (domain-point (bitrev q)))

;; the base-field x for FS index q. CAUTION (red-team): query-x is 2-to-1 -- a circle point and its conjugate
;; share x, so adjacent FS indices (2k, 2k+1) return the SAME x (see KAT_QUERY_X). x ALONE does NOT bind a
;; query: the 6d-iv driver MUST bind the Merkle leaf by its POSITION bitrev(q) (not by x), and use
;; query-point's im (= y) to disambiguate a point from its conjugate. Prefer query-point downstream; treat
;; query-x as the x-only (conjugate-ambiguous) projection that deep's (x - z) and the line-FRI fold consume.
(define-read-only (query-x (q uint))
  (get re (query-point q)))
