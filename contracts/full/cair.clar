;; contracts/full/cair.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/cair.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; Circle AIR core, gear 6e. Replaces air.clar's x-only order-9 multiplicative toy (the rate-1
;; wart, QUERY-4/DRIVER-2) with a REAL circle AIR: single-column additive Fibonacci, 8 rows on the
;; canonic circle coset odds(3) (initial G^(2^27), step S = G^(2^28)), LDE on query.clar's FROZEN
;; 16-point domain -- blowup 2, rate 1/2. Trace coset and LDE are point-disjoint (2-adic 27 vs 26),
;; so no honest constraint denominator vanishes at a query point.
;;
;; FORMULAS (Stwo dev @ cca98119): pair_vanishing = constraints.rs:68-83, specialized to two pinned
;; M31 points -> an M31-coefficient line A*x + B*y + C; coset_vanishing = constraints.rs:12-35,
;; where the canonic coset's rotation cancels EXACTLY (initial = step/2), so V(z) = pi(pi(z.x)) --
;; two lifted 2x^2-1 maps. felt-to-point = circle.rs:163-182 get_random_point (stereographic
;; x=(1-t^2)/(1+t^2), y=2t/(1+t^2)); the schedule's frozen z-squeeze IS Stwo's draw_secure_felt
;; (verifier.rs:88), mapped to a point HERE, once per proof, by the driver -- the proof carries no
;; point, so an off-circle z is UNREPRESENTABLE. recomb = qm31.rs:51-57 from_partial_evals with NO
;; left/right split term (we omit COMPOSITION_LOG_SPLIT because the degree-1 transition keeps the
;; composition bound at log_size 3 -- CAIR-1; Stwo at degree 2 splits into 2*4 base columns).
;;
;; BOUNDARY (CAIR-4): q_b = (T(z)-1) / pair_vanishing(P0,P1,z) -- ONE constraint pinning both seed
;; rows because both seeds equal 1 (the constant interpolant degenerates). A point_vanishing
;; boundary would BREAK dim-8 membership (+1 dimension; replay-proven trap -- the failure mode is
;; invisible until FRI rejects honest proofs; re-run the replay's membership gate on ANY edit here).
;;
;; MASK-STEP COINCIDENCE (CAIR-3): the lifted-model trace step (component.rs:220-232) EQUALS the
;; trace coset step S here BECAUSE the composition bound == log_size == 3 for this degree-1 AIR;
;; re-pin before any AIR where they diverge.
;;
;; STRUCTURAL INVARIANT (the conjugate-coefficient trap): any column fed to cdeep's pair-vanishing
;; quotients MUST have base-field (CM31-fixed) coefficients; that is WHY the composition is sampled
;; as 4 coordinate openings c0-z..c3-z and recombined here -- the alpha-weighted QM31 composition
;; form would break COMPLETENESS (the honest DEEP column falls out of the low-degree space;
;; replay-proven, the gear-6e seam-4 finding). cair-compose-check is the hoisted query-independent
;; OOD-consistency check (Stwo OodsNotMatching, verifier.rs:105-120).
;;
;; Constraint quotient denominators abort via qm31-inv on an in-domain z (safe reject); so does
;; felt-to-point at 1+t^2=0 (~2^-124 honest). Deviations from Stwo flagged CAIR-1..8 in the gear-6e
;; spec. Reuses .qm31 UNCHANGED; deploy after qm31 (acyclic).

;; trace step S = G^(2^28); numerically == query.clar's H (there the size-16 half-coset step, here
;; the size-8 coset step -- same point by construction; documented to prevent coupled-constant
;; confusion). Pinned row points (KATs): P0=(590768354,978592373) P1=(1168891274,1556715293)
;; P6=conj(P1)=(1168891274,590768354) P7=conj(P0)=(590768354,1168891274).
(define-constant SX u1420207432)
(define-constant SY u2023238517)
;; pair-vanishing line A*x + B*y + C through P6,P7 (the transition SELECTOR numerator: excludes
;; wrap rows 6,7 -- the historical Stwo fibonacci step_constraint shape)
(define-constant SEL_A u1934003464)
(define-constant SEL_B u1216253441)
(define-constant SEL_C u2023238517)
;; pair-vanishing line through P0,P1 (the boundary DENOMINATOR: vanishes on seed rows 0,1)
(define-constant B01_A u1934003464)
(define-constant B01_B u931230206)
(define-constant B01_C u2023238517)
;; QM31 basis elements for from_partial_evals: i, u, iu
(define-constant Q_I  { c0: u0, c1: u1, c2: u0, c3: u0 })
(define-constant Q_U  { c0: u0, c1: u0, c2: u1, c3: u0 })
(define-constant Q_IU { c0: u0, c1: u0, c2: u0, c3: u1 })

;; stereographic felt->point: x=(1-t^2)/(1+t^2), y=2t/(1+t^2). ABORTS when 1+t^2=0 (qm31-inv zero
;; norm; reject direction). On-circle BY CONSTRUCTION.
(define-read-only (felt-to-point (t { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((one (contract-call? .qm31-full qm31-from-m31 u1))
        (tsq (contract-call? .qm31-full qm31-mul t t)))
    (let ((dinv (contract-call? .qm31-full qm31-inv (contract-call? .qm31-full qm31-add one tsq))))
      { x: (contract-call? .qm31-full qm31-mul (contract-call? .qm31-full qm31-sub one tsq) dinv),
        y: (contract-call? .qm31-full qm31-mul (contract-call? .qm31-full qm31-add t t) dinv) })))

;; circle group law, QM31 point + M31 constant point (circle.rs:122-132):
;; x' = zx*bx - zy*by ; y' = zx*by + zy*bx   (qm31-mul-m31 only -- no full QM31 muls)
(define-read-only (point-add-base
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (bx uint) (by uint))
  { x: (contract-call? .qm31-full qm31-sub
         (contract-call? .qm31-full qm31-mul-m31 zx bx)
         (contract-call? .qm31-full qm31-mul-m31 zy by)),
    y: (contract-call? .qm31-full qm31-add
         (contract-call? .qm31-full qm31-mul-m31 zx by)
         (contract-call? .qm31-full qm31-mul-m31 zy bx)) })

;; mask point z + k*S for k in {0,1,2}; ABORTS for k >= 3 (reject direction).
(define-read-only (mask-point
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (k uint))
  (unwrap-panic
    (if (is-eq k u0) (some { x: zx, y: zy })
    (if (is-eq k u1) (some (point-add-base zx zy SX SY))
    (if (is-eq k u2) (some (let ((p1 (point-add-base zx zy SX SY)))
                             (point-add-base (get x p1) (get y p1) SX SY)))
        none)))))

;; lifted doubling-map x-coordinate: pi(v) = 2v^2 - 1 over QM31 (circle.rs:40 double_x)
(define-read-only (qpi (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((vv (contract-call? .qm31-full qm31-mul v v)))
    (contract-call? .qm31-full qm31-sub
      (contract-call? .qm31-full qm31-add vv vv)
      (contract-call? .qm31-full qm31-from-m31 u1))))

;; coset_vanishing of the size-8 canonic coset: V(z) = pi(pi(z.x)) (the canonic shift cancels)
(define-read-only (coset-vanish (zx { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qpi (qpi (qpi (qpi (qpi (qpi (qpi (qpi (qpi (qpi (qpi (qpi zx)))))))))))))

;; the two pinned pair-vanishing lines at a QM31 point: A*zx + B*zy + C
(define-read-only (line-sel
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31-full qm31-add
    (contract-call? .qm31-full qm31-add
      (contract-call? .qm31-full qm31-mul-m31 zx SEL_A)
      (contract-call? .qm31-full qm31-mul-m31 zy SEL_B))
    (contract-call? .qm31-full qm31-from-m31 SEL_C)))
(define-read-only (line-b01
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31-full qm31-add
    (contract-call? .qm31-full qm31-add
      (contract-call? .qm31-full qm31-mul-m31 zx B01_A)
      (contract-call? .qm31-full qm31-mul-m31 zy B01_B))
    (contract-call? .qm31-full qm31-from-m31 B01_C)))

;; transition numerator from the three mask openings: T(z+2S) - T(z+S) - T(z)
(define-read-only (eval-transition
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31-full qm31-sub (contract-call? .qm31-full qm31-sub t-g2z t-gz) t-z))

;; the two constraint quotients; each qm31-inv ABORTS on an in-domain z (safe reject)
(define-read-only (cair-quotients
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  { q-trans: (contract-call? .qm31-full qm31-mul
               (contract-call? .qm31-full qm31-mul (eval-transition t-z t-gz t-g2z) (line-sel zx zy))
               (contract-call? .qm31-full qm31-inv (coset-vanish zx))),
    q-b: (contract-call? .qm31-full qm31-mul
           (contract-call? .qm31-full qm31-sub t-z (contract-call? .qm31-full qm31-from-m31 u1))
           (contract-call? .qm31-full qm31-inv (line-b01 zx zy))) })

;; composition value: q-trans + alpha*q-b (toy ascending powers -- CAIR-5; Stwo's Horner
;; accumulator acc*alpha + eval reverses the powers; flip at prover interop)
(define-read-only (cair-compose
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (alpha { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((q (cair-quotients t-z t-gz t-g2z zx zy)))
    (contract-call? .qm31-full qm31-add (get q-trans q)
      (contract-call? .qm31-full qm31-mul alpha (get q-b q)))))

;; from_partial_evals (no split): C(z) = c0z + i*c1z + u*c2z + iu*c3z
(define-read-only (recomb
    (c0-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c1-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c2-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c3-z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31-full qm31-add
    (contract-call? .qm31-full qm31-add c0-z (contract-call? .qm31-full qm31-mul Q_I c1-z))
    (contract-call? .qm31-full qm31-add
      (contract-call? .qm31-full qm31-mul Q_U c2-z)
      (contract-call? .qm31-full qm31-mul Q_IU c3-z))))

;; THE hoisted query-independent OOD-consistency check (Stwo OodsNotMatching, verifier.rs:105-120).
;; FROZEN-HEART NOTE: all four coordinate openings are absorbed INDIVIDUALLY pre-gamma by the
;; schedule (binding only the recombined value would leave 3 QM31 degrees of freedom in the DEEP
;; quotient inputs unbound at challenge time); this check then closes the algebra.
(define-read-only (cair-compose-check
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (alpha { c0: uint, c1: uint, c2: uint, c3: uint })
    (c0-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c1-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c2-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c3-z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31-full qm31-eq
    (cair-compose t-z t-gz t-g2z zx zy alpha)
    (recomb c0-z c1-z c2-z c3-z)))
