;; DEPRECATED (gear 6e): superseded by cair.clar / cdeep.clar -- the real circle AIR + the live
;; Stwo pair-vanishing DEEP quotients. NOT referenced by driver.clar since gear 6e; OMITTED from
;; the canonical deployment manifest. Kept (with its byte-green test suite) as the tested
;; gear-6b/6c record of the retired multiplicative-domain conventions. PLANNED DELETION: a future
;; cleanup gear deletes this contract AND its tests as a pair -- a decision, not drift.
;; DEEP / out-of-domain quotient binding, gear 6c. The step that ties the gear-6b AIR composition
;; (checked at the OOD point z) to the gear-5 FRI low-degree test -- it is what makes the openings MEAN
;; something. For one FRI query point x, the verifier forms quotients (P(x) - P(m)) / (x - m) for the
;; trace mask points {z, g.z, g^2.z} and the composition {z}, gamma-combines them into the first FRI
;; value p0(x), and hands p0 to the EXISTING fri-fold-down as v0. p0 is low-degree IFF every opening is
;; the TRUE evaluation of the committed polynomial, so honest openings fold to a constant (accept) and
;; any lie leaves a pole (reject).
;;
;; Each mask quotient divides by ITS OWN shifted point ((x-z), (x-g.z), (x-g^2.z)) -- pairing a shifted
;; numerator with a different denominator is not a polynomial (the gear-6b boundary-bug class); the
;; oracle-independent low-degree test guards it. qm31-inv ABORTS on a zero denominator, so a query point
;; that lands on a mask point is REJECTED (safe direction).
;;
;; NOT STANDALONE-SOUND: the openings are unbound here. Binding T(x),C(x),T(z),... to the committed roots
;; (obligation C, gear 6d), deriving z/alpha/gamma from the transcript (6d), and the multi-query loop are
;; what close it.
;;
;; SOUNDNESS PRECONDITIONS ((1) is now ENFORCED inside deep-fri-ok; (2)-(4) are caller / 6d-driver):
;;   (1) ENFORCED by deep-fri-ok (it calls .air air-compose-check on t-z,t-gz,t-g2z,z,alpha,c-z), forcing
;;       C(z) = air-compose(the OOD trace openings). deep-p0 ALONE does NOT do this (it is the raw algebra).
;;       Without it, d0 and dC share the (x - z) denominator and enter p0 as d0 + gamma^3*dC, so a
;;       COORDINATED lie T(z)'=T(z)+e, C(z)'=C(z)-e*gamma^-3 makes the combined (x-z) pole residue
;;       (-e - gamma^3*f) cancel to 0: p0 stays exactly degree-7 and deep-fri-ok ACCEPTS though BOTH
;;       openings are wrong. (T(g.z)/T(g^2.z) poles at x=g.z / g^2.z are unique, so this Tz<->Cz pair --
;;       the only quotients sharing z -- is the sole exploitable seam. red-team lens-edge finding.)
;;   (2) gamma is TRANSCRIPT-DERIVED *after* the openings are committed, so the attacker cannot compute
;;       f = -e*gamma^-3 before fixing T(z)/C(z). With the documented placeholder gamma known to the
;;       caller, precondition (1) is what blocks the lie.
;; This is the ALGEBRAIC C(z)<->T(z) consistency obligation -- distinct from the Merkle "unbound roots"
;; note above; air-compose-check (gear 6b) is the defense, NOT anything inside deep-p0.
;;
;; Reuses .qm31 (arithmetic + inverse), .air (air-compose-check), and .fri (fri-final-ok) via read-only
;; contract-call?; NO change to fri.clar / air.clar. Deploy order field -> qm31 -> {air, fri} -> deep (acyclic).
;; CALLER OBLIGATION: z is a QM31 out-of-domain point (nonzero u-part, off the base field); x is a canonical
;; reduced base-field FRI point disjoint from the masks (an x on a mask aborts, safe). red-team findings #1/#3.
;; Differential-, KAT-, low-degree-, and fold-tested vs tests/deep.ts.

(define-constant G u309107220)   ;; generator of the order-9 trace domain
(define-constant G2 u809695498)  ;; g^2 mod p, the second trace mask shift (KAT-checked vs field m31-mul)

;; the ONE new primitive: (P(x) - P(m)) / (x - m). x is a base-field FRI point (lifted into QM31);
;; m is a QM31 mask point. qm31-inv ABORTS if x lands on m (zero denominator = safe reject).
(define-read-only (deep-quotient
    (p-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (p-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (m { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .qm31 qm31-mul
    (contract-call? .qm31 qm31-sub p-x p-z)
    (contract-call? .qm31 qm31-inv
      (contract-call? .qm31 qm31-sub (contract-call? .qm31 qm31-from-m31 x) m))))

;; the gamma-powers combine into p0(x) = the first FRI value.
;;   d0 = (T(x)-T(z))/(x-z)          d1 = (T(x)-T(g.z))/(x-g.z)
;;   d2 = (T(x)-T(g^2.z))/(x-g^2.z)  dC = (C(x)-C(z))/(x-z)
;;   p0 = d0 + gamma*d1 + gamma^2*d2 + gamma^3*dC
;; T(z),T(g.z),T(g^2.z) are the OOD openings; T(x),C(x) the query openings; C(z) the OOD composition
;; (= air-compose on the OOD openings, supplied by the caller so deep stays decoupled from alpha).
(define-read-only (deep-p0
    (t-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (c-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (z { c0: uint, c1: uint, c2: uint, c3: uint })
    (gamma { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((gz (contract-call? .qm31 qm31-mul z (contract-call? .qm31 qm31-from-m31 G)))
        (g2z (contract-call? .qm31 qm31-mul z (contract-call? .qm31 qm31-from-m31 G2))))
    (let ((d0 (deep-quotient t-x t-z x z))
          (d1 (deep-quotient t-x t-gz x gz))
          (d2 (deep-quotient t-x t-g2z x g2z))
          (dc (deep-quotient c-x c-z x z))
          (gg (contract-call? .qm31 qm31-mul gamma gamma)))
      (contract-call? .qm31 qm31-add
        (contract-call? .qm31 qm31-add
          (contract-call? .qm31 qm31-add d0 (contract-call? .qm31 qm31-mul gamma d1))
          (contract-call? .qm31 qm31-mul gg d2))
        (contract-call? .qm31 qm31-mul (contract-call? .qm31 qm31-mul gg gamma) dc)))))

;; the gear-6c obligation wrapper. Two checks in one call:
;;   (1) ENFORCE the cross-binding: C(z) MUST equal air-compose of the SAME trace OOD openings. Without
;;       it, the shared (x-z) pole of d0 and dC admits a coordinated lie T(z)'=T(z)+e, C(z)'=C(z)-e*gamma^-3
;;       whose residue cancels, so p0 stays degree-7 and FRI cannot see it (red-team). air-compose-check
;;       (gear 6b) closes it -- so deep-fri-ok calls it here rather than leaving it to the 6d driver.
;;   (2) p0 (as v0) must fold down to the transmitted final FRI poly (the gear-5 low-degree test).
;; ZERO change to fri.clar / air.clar. (deep-p0 alone does NOT do check (1) -- it is the raw algebra;
;; this wrapper is the sound entry point. gamma must still be transcript-derived by the 6d driver.)
(define-read-only (deep-fri-ok
    (t-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (c-x { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (z { c0: uint, c1: uint, c2: uint, c3: uint })
    (alpha { c0: uint, c1: uint, c2: uint, c3: uint })
    (gamma { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool }))
    (final { c0: uint, c1: uint, c2: uint, c3: uint }))
  (and
    (contract-call? .air air-compose-check t-z t-gz t-g2z z alpha c-z)
    (contract-call? .fri fri-final-ok
      (deep-p0 t-x c-x t-z t-gz t-g2z c-z x z gamma) layers final)))
