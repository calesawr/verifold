;; contracts/full/cdeep.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/cdeep.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; Circle DEEP quotients, gear 6e -- the LIVE Stwo verifier path (dev @ cca98119), replacing
;; deep.clar's x-only (x - m) quotients. Per sample batch at QM31 circle point Z, evaluated at the
;; M31 query point (px, py):
;;   line coeffs [constraints.rs:119-134 complex_conjugate_line_coeffs, batching power w folded in]:
;;     a = w*(conj_u(v) - v);  c = w*(conj_u(Z.y) - Z.y);  b = w*(v*(conj_u(Z.y)-Z.y) - (conj_u(v)-v)*Z.y)
;;   numerator term [quotients.rs:162-195]:  c*f(p) - (a*py + b)
;;   denominator [quotients.rs:253-276, a CM31 value]:
;;     D = (Re_u(Z.x) - px)*Im_u(Z.y) - (Re_u(Z.y) - py)*Im_u(Z.x)
;;   row = sum over batches of (sum of terms) * D^-1
;; CONJUGATION: u-conjugation w.r.t. the CM31 subfield: {c0,c1,c2,c3} -> {c0,c1,-c2,-c3}.
;; CM31 values ride the QM31 ops on {re,im,0,0} embeddings (subfield-closed); qm31-inv on the zero
;; bracket ABORTS = safe reject.
;;
;; PINNED IDENTITIES (cross-formula tests in cdeep.test.ts; judge-mandated -- a candidate design
;; got the sign wrong, so the tests make the error class unrepresentable):
;;   pair_vanishing(Z, conj_u Z, p) == -2u * D     and, per batch,
;;   live quotient == 4R*Im_u(Z.y) * classic complex_conjugate_line/pair_vanishing quotient.
;;
;; DEGENERATE-LINE GUARD: line-coeffs ABORTS when the u-part of the sample point's y is zero
;; (Stwo's assert_ne); otherwise c = 0 silently deletes the committed value from the numerator --
;; an accept-direction channel. Honest mask points never trip it (replay Phase E).
;;
;; BATCHING [quotients.rs:73-100 + 291-336]: ONE running gamma sequence in flatten order -- batch
;; z: {trace g^0, comp coords 0..3 g^3..g^6}; batch z+S: {trace g^1}; batch z+2S: {trace g^2}.
;; NO periodicity samples: they fire only for the lifted model's smaller-than-max columns; every
;; toy column is committed natively at size 16 (CDEEP-2).
;;
;; OWN STEP CONSTANTS (the deep.clar own-G precedent; KAT-pinned == cair's SX/SY): mask rotations
;; are computed HERE so no per-query cross-contract hop to .cair/.query is needed (read_count is
;; the binding budget -- DRIVER-7). The driver passes px/py from its single query-point call and
;; the z point from env (felt-to-point runs once per proof, not per query).
;;
;; STRUCTURAL INVARIANT (the conjugate-coefficient trap): every f fed here must be a BASE-FIELD
;; column value -- the driver asserts t-x's limbs 1..3 are zero; c-x's four limbs ARE the four
;; composition coordinate-column values (the gear-6e seam-4 decomposition).
;; Reuses .qm31 UNCHANGED; deploy after qm31 (acyclic).

(define-constant P u2147483647)
(define-constant SX u1420207432)         ;; own copy of the trace step (KAT-pinned == cair's)
(define-constant SY u2023238517)

;; u-conjugation: negate the CM31-high half (limbwise m31 negation via qm31-sub from zero-high)
(define-read-only (conj-u (a { c0: uint, c1: uint, c2: uint, c3: uint }))
  { c0: (get c0 a), c1: (get c1 a),
    c2: (mod (- (+ u0 P) (get c2 a)) P), c3: (mod (- (+ u0 P) (get c3 a)) P) })

;; line coefficients for one (sample point y-coord zy, sample value v, batching power w).
;; ABORTS when the u-part of zy is zero (degenerate conjugate line -- reject direction).
(define-read-only (line-coeffs
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (w { c0: uint, c1: uint, c2: uint, c3: uint }))
  (begin
    (unwrap-panic (if (and (is-eq (get c2 zy) u0) (is-eq (get c3 zy) u0)) none (some true)))
    (let ((araw (contract-call? .qm31-full qm31-sub (conj-u v) v))
          (craw (contract-call? .qm31-full qm31-sub (conj-u zy) zy)))
      { a: (contract-call? .qm31-full qm31-mul w araw),
        b: (contract-call? .qm31-full qm31-mul w
             (contract-call? .qm31-full qm31-sub
               (contract-call? .qm31-full qm31-mul v craw)
               (contract-call? .qm31-full qm31-mul araw zy))),
        c: (contract-call? .qm31-full qm31-mul w craw) })))

;; CM31 pair-line denominator INVERSE at the M31 point (px,py), embedded {re,im,0,0}:
;; D = (Re_u(zx) - px)*Im_u(zy) - (Re_u(zy) - py)*Im_u(zx); qm31-inv ABORTS on the zero bracket
;; (the query point on the projected pair line -- reject direction).
(define-read-only (denom-inv
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (px uint) (py uint))
  (let ((t1 (contract-call? .qm31-full cm-mul
              (mod (- (+ (get c0 zx) P) px) P) (get c1 zx)
              (get c2 zy) (get c3 zy)))
        (t2 (contract-call? .qm31-full cm-mul
              (mod (- (+ (get c0 zy) P) py) P) (get c1 zy)
              (get c2 zx) (get c3 zx))))
    (contract-call? .qm31-full qm31-inv
      { c0: (mod (- (+ (get re t1) P) (get re t2)) P),
        c1: (mod (- (+ (get im t1) P) (get im t2)) P),
        c2: u0, c3: u0 })))

;; one numerator term: c*f - (a*py + b)   (a*py via qm31-mul-m31; f is a committed column value)
(define-read-only (quot-term
    (f { c0: uint, c1: uint, c2: uint, c3: uint })
    (py uint)
    (lc { a: { c0: uint, c1: uint, c2: uint, c3: uint },
          b: { c0: uint, c1: uint, c2: uint, c3: uint },
          c: { c0: uint, c1: uint, c2: uint, c3: uint } }))
  (contract-call? .qm31-full qm31-sub
    (contract-call? .qm31-full qm31-mul (get c lc) f)
    (contract-call? .qm31-full qm31-add
      (contract-call? .qm31-full qm31-mul-m31 (get a lc) py)
      (get b lc))))

;; local circle rotation by the step (the cair point-add-base shape, duplicated by the own-G
;; precedent so deep-row makes ZERO cross-contract hops beyond .qm31)
(define-private (rot-s (zx { c0: uint, c1: uint, c2: uint, c3: uint })
                       (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  { x: (contract-call? .qm31-full qm31-sub
         (contract-call? .qm31-full qm31-mul-m31 zx SX)
         (contract-call? .qm31-full qm31-mul-m31 zy SY)),
    y: (contract-call? .qm31-full qm31-add
         (contract-call? .qm31-full qm31-mul-m31 zx SY)
         (contract-call? .qm31-full qm31-mul-m31 zy SX)) })

;; one base-field limb of the committed comp leaf, as a QM31 column value
(define-private (limb (v uint)) { c0: v, c1: u0, c2: u0, c3: u0 })

;; THE row value replacing deep-p0. t-x = the bound trace leaf (base-field; driver-asserted);
;; c-x = the bound comp leaf whose 4 limbs ARE the coordinate-column openings at this row;
;; (zx,zy) = the felt-to-point OOD point from env; gamma powers g^0..g^6 computed locally.
(define-read-only (deep-row
    (t-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (c-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c0-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c1-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c2-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c3-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (px uint) (py uint)
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (gamma { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((g2 (contract-call? .qm31-full qm31-mul gamma gamma)))
  (let ((g3 (contract-call? .qm31-full qm31-mul g2 gamma)))
  (let ((g4 (contract-call? .qm31-full qm31-mul g3 gamma)))
  (let ((g5 (contract-call? .qm31-full qm31-mul g4 gamma)))
  (let ((g6 (contract-call? .qm31-full qm31-mul g5 gamma))
        (z1 (rot-s zx zy)))
  (let ((z2 (rot-s (get x z1) (get y z1)))
        (one { c0: u1, c1: u0, c2: u0, c3: u0 }))
    (let ((num0 (contract-call? .qm31-full qm31-add
                  (quot-term t-x py (line-coeffs zy t-z one))
                  (contract-call? .qm31-full qm31-add
                    (contract-call? .qm31-full qm31-add
                      (quot-term (limb (get c0 c-x)) py (line-coeffs zy c0-z g3))
                      (quot-term (limb (get c1 c-x)) py (line-coeffs zy c1-z g4)))
                    (contract-call? .qm31-full qm31-add
                      (quot-term (limb (get c2 c-x)) py (line-coeffs zy c2-z g5))
                      (quot-term (limb (get c3 c-x)) py (line-coeffs zy c3-z g6))))))
          (num1 (quot-term t-x py (line-coeffs (get y z1) t-gz gamma)))
          (num2 (quot-term t-x py (line-coeffs (get y z2) t-g2z g2))))
      (contract-call? .qm31-full qm31-add
        (contract-call? .qm31-full qm31-add
          (contract-call? .qm31-full qm31-mul num0 (denom-inv zx zy px py))
          (contract-call? .qm31-full qm31-mul num1 (denom-inv (get x z1) (get y z1) px py)))
        (contract-call? .qm31-full qm31-mul num2 (denom-inv (get x z2) (get y z2) px py)))))))))))
