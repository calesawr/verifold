;; Gear 6e: the query driver -- the top-level verify() gluing schedule-derived challenges to
;; per-query Merkle bindings and the circle DEEP + FRI fold algebra, now over a REAL circle AIR
;; (cair.clar) with the LIVE Stwo quotients (cdeep.clar). Every challenge is re-derived
;; (.schedule), every opening is position-bound to a committed root, every fold input is
;; verifier-derived, and every check rejects by ABORT (tests treat abort as reject).
;;
;; LAYER MAP (Stwo dev @ cca98119; rate 1/2, FriConfig{log_blowup:1, fold_step:1,
;; log_last_layer_degree_bound:0, n_queries:4}):
;;   fri-roots[0] = FIRST-layer commitment: the DEEP column on the 16-point circle domain
;;                  (bit-reversed, qm31-leaf leaves; committed BEFORE any folding alpha exists).
;;   betas[0]     = the circle-fold challenge (fold_circle_into_line, twiddle 1/y).
;;   fri-roots[1..2] = inner line layers of sizes 8/4, committed PRE-fold; betas[k] folds layer k.
;;   last layer   = the size-2 evaluation is NEVER committed: the prover transmits a DEGREE-0
;;                  LinePoly (the `final` constant, absorbed pre-nonce -- the Plonky3-CVE
;;                  ordering); each query's folded v3 must equal it (position-independent at
;;                  degree 0; Stwo decommit_last_layer).
;;   Per-layer consistency is Stwo verify_and_fold: the carried fold value is hashed INTO the next
;;   committed tree; the only explicit equality is the last-layer one. fri-fold-step is AFFINE IN
;;   THE SIBLING, so every layer is Merkle-bound.
;;
;; REAL CIRCLE AIR, TOY PARAMETERS (read before trusting verify()==true): the rate-1 vacuity is
;; DEAD -- honest conjugate leaves differ (beta0/1-over-y/orientation LIVE on every honest path)
;; and FRI genuinely rejects conjugate-symmetric garbage. What remains toy is the
;; PARAMETERIZATION (DRIVER-9): ~2^-4 FRI error per query set at rate 1/2 with 4 drawn-not-deduped
;; queries, and query positions depend on the ground nonce, so a far-column forgery costs ~2^12
;; hashes total. verify()==true is still not security.
;;
;; COUPLED TOY CONSTANTS (red-team): DEPTH-4 paths, parent-path lengths 3/2/1, the multipliers
;; 2/4 in line-x1/x2, PARAMS, N=4/L=3 are functions of DOMAIN_SIZE=16 and must change together
;; with query.clar's BITREV4/HALF block, schedule.clar's N/L/DOMAIN_SIZE, and cair/cdeep's step
;; constants. A partial edit silently breaks completeness; the all-16-q differential is the tripwire.
;;
;; NOT PROVER-CONFIRMED: bit-reversal/coset conventions (QUERY-1/2/6), the even-position twiddle
;; selection and fold orientation (QUERY-3), the CM31 denominator normalization (CDEEP-1), the
;; gamma flatten order (CDEEP-3), and the felt->point map position follow the panel's reading of
;; Stwo source; only a live prover vector confirms (a mismatch is a COMPLETENESS break).
;;
;; Reuses UNCHANGED: .schedule .query .cair .cdeep .fri .commit .merkle .qm31. air.clar/deep.clar
;; are DEPRECATED (kept for their green suites; omitted from the canonical deployment). Deploy
;; driver LAST (acyclic).

(define-constant DOMAIN_LABEL 0x76657269666f6c642d66732d7631) ;; "verifold-fs-v1", 14 bytes
(define-constant VERSION 0x01)
;; N=4, L=3 (1 first + 2 inner roots), blowup=2 (LOAD-BEARING since gear 6e: rate 1/2),
;; pow_bits=8, air_id=10 (u32 BE; "size-8 circle Fibonacci v1" -- air_ids are a MONOTONIC
;; registry: never reuse a retired id; the multiplicative toy was 9). MUST agree with .schedule
;; get-params; pinned by a driver test.
(define-constant PARAMS 0x040302080000000a)

;; the house reject-by-abort idiom: a failed check ABORTS the whole call -- ONE reject channel.
(define-private (require! (pass bool))
  (unwrap-panic (if pass (some true) none)))

;; clear the low bit: the EVEN member of a sibling pair, whose point supplies the twiddle.
(define-private (even-of (m uint))
  (- m (mod m u2)))

;; ONE canonical leaf encoder for all five trees (trace, comp, fri layers 0..2); inherits
;; commit.clar's >= p canonicalization abort.
(define-private (qleaf (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .commit qm31-leaf v))

;; one level of path reconstruction: the direction bit is DERIVED from the expected position
;; (LSB-first). The ONLY source of direction bits -- the proof carries bare sibling hashes.
(define-private (path-step
    (sib (buff 32))
    (st { path: (list 4 { sibling: (buff 32), node-is-right: bool }), pos: uint }))
  { path: (unwrap-panic (as-max-len? (append (get path st)
            { sibling: sib, node-is-right: (is-eq (mod (get pos st) u2) u1) }) u4)),
    pos: (/ (get pos st) u2) })

;; rebuild a merkle.clar-shaped path from bare sibling hashes + the expected position.
(define-read-only (path-from-pos (sibs (list 4 (buff 32))) (pos uint))
  (get path (fold path-step sibs { path: (list), pos: pos })))

;; full-path positional opening (T(x) / C(x), depth 4). Exact-length assert closes the
;; short/empty-path footgun. Returns bool; call sites require!.
(define-read-only (bound-at-pos
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sibs (list 4 (buff 32)))
    (pos uint)
    (depth uint)
    (root (buff 32)))
  (begin
    (require! (is-eq (len sibs) depth))
    (contract-call? .merkle merkle-verify (qleaf v) (path-from-pos sibs pos) root)))

;; bind BOTH members of an adjacent sibling pair AND their position with one climb (the Stwo
;; rebuild_evals splice: the verifier-computed value is hashed INTO the committed tree).
(define-read-only (pair-bound
    (self { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint)
    (parent-sibs (list 3 (buff 32)))
    (parent-depth uint)
    (root (buff 32)))
  (begin
    (require! (is-eq (len parent-sibs) parent-depth))
    (contract-call? .merkle merkle-verify
      (contract-call? .merkle merkle-root (qleaf self)
        (list { sibling: (qleaf sib), node-is-right: (is-eq (mod pos u2) u1) }))
      (path-from-pos parent-sibs (/ pos u2))
      root)))

;; one fold step as a single-layer fri-fold-down call (REUSES fri.clar's test-pinned orientation
;; routing): v-is-right = position parity. At the circle fold the `x` slot carries y.
(define-read-only (fold-one
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (t uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint))
  (contract-call? .fri fri-fold-down v
    (list { sibling: sib, x: t, beta: beta, v-is-right: (is-eq (mod pos u2) u1) })))

;; the circle-fold twiddle: Im of the EVEN FS position of q's conjugate pair. LIVE on every
;; honest path since gear 6e (conjugate leaves differ).
(define-read-only (y-twiddle (q uint))
  (get im (contract-call? .query query-point (even-of q))))

;; the derived line-fold twiddles X_k(even-of(q >> k)) -- KAT-pinned closed forms.
(define-read-only (line-x1 (q uint))
  (contract-call? .query query-x (* u2 (even-of (/ q u2)))))
(define-read-only (line-x2 (q uint))
  (contract-call? .fri pi-x (contract-call? .query query-x (* u4 (even-of (/ q u4))))))

;; ctx = DOMAIN_LABEL || VERSION || PARAMS || sha256(pub) -- strong Fiat-Shamir, in-contract.
(define-read-only (make-ctx (pub (buff 256)))
  (concat DOMAIN_LABEL (concat VERSION (concat PARAMS (sha256 pub)))))

;; ---------------------------------------------------------------------------------------------
;; NOT STANDALONE-SOUND: verify-query accepts a caller-supplied env for testability ONLY (the
;; all-16-q differential). The challenges MUST come from .schedule; verify() below is the ONLY
;; sound entry point.
;; ---------------------------------------------------------------------------------------------
;; Per query q: (0) t-x must be a BASE-FIELD leaf (the trace is one base column; i-limb garbage
;; is closed deterministically by the AIR, u-limb garbage probabilistically by FRI -- this require
;; upgrades both to a deterministic per-leaf abort); (1-2) bind T/C at POSITION q; (3) the full
;; query point -- y is now LOAD-BEARING inside the quotient (the N2 resurrection at the source);
;; (4) the live circle DEEP row (3 conjugate-pair batches, CM31 denominators, gamma^0..gamma^6);
;; (5) splice the verifier-computed row into fri-roots[0] with the conjugate witness; (6) circle
;; fold (1/y, betas[0]); (7-8) line layers vs fri-roots[1..2]; (9) v3 == the transmitted final.
(define-read-only (verify-query
    (q uint)
    (prf { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 4 (buff 32)),
           c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 4 (buff 32)),
           p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 3 (buff 32)),
           l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 2 (buff 32)),
           l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 1 (buff 32)) })
    (env { t-z: { c0: uint, c1: uint, c2: uint, c3: uint },
           t-gz: { c0: uint, c1: uint, c2: uint, c3: uint },
           t-g2z: { c0: uint, c1: uint, c2: uint, c3: uint },
           c0-z: { c0: uint, c1: uint, c2: uint, c3: uint },
           c1-z: { c0: uint, c1: uint, c2: uint, c3: uint },
           c2-z: { c0: uint, c1: uint, c2: uint, c3: uint },
           c3-z: { c0: uint, c1: uint, c2: uint, c3: uint },
           zx: { c0: uint, c1: uint, c2: uint, c3: uint },
           zy: { c0: uint, c1: uint, c2: uint, c3: uint },
           gamma: { c0: uint, c1: uint, c2: uint, c3: uint },
           b0: { c0: uint, c1: uint, c2: uint, c3: uint },
           b1: { c0: uint, c1: uint, c2: uint, c3: uint },
           b2: { c0: uint, c1: uint, c2: uint, c3: uint },
           troot: (buff 32), croot: (buff 32),
           fr0: (buff 32), fr1: (buff 32), fr2: (buff 32),
           final: { c0: uint, c1: uint, c2: uint, c3: uint } }))
  (let ((pt (contract-call? .query query-point q)) ;; aborts for q >= 16 (backstop)
        (k1 (/ q u2)) (k2 (/ q u4)))
    (begin
      (require! (and (is-eq (get c1 (get t-x prf)) u0)
                     (is-eq (get c2 (get t-x prf)) u0)
                     (is-eq (get c3 (get t-x prf)) u0)))
      (require! (bound-at-pos (get t-x prf) (get t-sibs prf) q u4 (get troot env)))
      (require! (bound-at-pos (get c-x prf) (get c-sibs prf) q u4 (get croot env)))
      (let ((p0 (contract-call? .cdeep deep-row
                  (get t-x prf) (get c-x prf)
                  (get t-z env) (get t-gz env) (get t-g2z env)
                  (get c0-z env) (get c1-z env) (get c2-z env) (get c3-z env)
                  (get re pt) (get im pt)
                  (get zx env) (get zy env) (get gamma env))))
        (begin
          (require! (pair-bound p0 (get p0-sib prf) q (get p0-sibs prf) u3 (get fr0 env)))
          ;; the circle fold: fold-one's `t` carries y here (fold_circle_into_line, twiddle 1/y)
          (let ((v1 (fold-one p0 (get p0-sib prf) (y-twiddle q) (get b0 env) q)))
            (begin
              (require! (pair-bound v1 (get l1-sib prf) k1 (get l1-sibs prf) u2 (get fr1 env)))
              (let ((v2 (fold-one v1 (get l1-sib prf) (line-x1 q) (get b1 env) k1)))
                (begin
                  (require! (pair-bound v2 (get l2-sib prf) k2 (get l2-sibs prf) u1 (get fr2 env)))
                  (let ((v3 (fold-one v2 (get l2-sib prf) (line-x2 q) (get b2 env) k2)))
                    (begin
                      ;; Stwo decommit_last_layer at degree 0: the transmitted constant (absorbed
                      ;; pre-nonce) is the last-layer evaluation, position-independent.
                      (require! (contract-call? .qm31 qm31-eq v3 (get final env)))
                      true)))))))))))

;; the no-zip iteration idiom: fold over the per-query proof list, reading the k-th
;; SCHEDULE-DRAWN index from the accumulator.
(define-private (query-step
    (prf { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 4 (buff 32)),
           c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 4 (buff 32)),
           p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 3 (buff 32)),
           l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 2 (buff 32)),
           l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 1 (buff 32)) })
    (st { k: uint, idx: (list 32 uint),
          env: { t-z: { c0: uint, c1: uint, c2: uint, c3: uint },
                 t-gz: { c0: uint, c1: uint, c2: uint, c3: uint },
                 t-g2z: { c0: uint, c1: uint, c2: uint, c3: uint },
                 c0-z: { c0: uint, c1: uint, c2: uint, c3: uint },
                 c1-z: { c0: uint, c1: uint, c2: uint, c3: uint },
                 c2-z: { c0: uint, c1: uint, c2: uint, c3: uint },
                 c3-z: { c0: uint, c1: uint, c2: uint, c3: uint },
                 zx: { c0: uint, c1: uint, c2: uint, c3: uint },
                 zy: { c0: uint, c1: uint, c2: uint, c3: uint },
                 gamma: { c0: uint, c1: uint, c2: uint, c3: uint },
                 b0: { c0: uint, c1: uint, c2: uint, c3: uint },
                 b1: { c0: uint, c1: uint, c2: uint, c3: uint },
                 b2: { c0: uint, c1: uint, c2: uint, c3: uint },
                 troot: (buff 32), croot: (buff 32),
                 fr0: (buff 32), fr1: (buff 32), fr2: (buff 32),
                 final: { c0: uint, c1: uint, c2: uint, c3: uint } } }))
  (begin
    (require! (verify-query (unwrap-panic (element-at? (get idx st) (get k st))) prf (get env st)))
    { k: (+ (get k st) u1), idx: (get idx st), env: (get env st) }))

;; THE sound entry point. Re-derives every challenge (7 openings absorbed individually
;; pre-gamma), gates pow FIRST, asserts lengths vs the schedule's OWN constants, maps the z-felt
;; to its circle point ONCE, enforces the OOD-consistency closure (cair-compose-check, the
;; gear-6c successor -- DO NOT REMOVE: it is the only check binding the coordinate openings to
;; the AIR; mutation-pinned), then runs the N per-query pipelines. Returns true; ANY lie aborts.
(define-read-only (verify
    (pub (buff 256))
    (trace-root (buff 32))
    (comp-root (buff 32))
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c0-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c1-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c2-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c3-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (fri-roots (list 3 (buff 32)))
    (final { c0: uint, c1: uint, c2: uint, c3: uint })
    (nonce (buff 8))
    (queries (list 4 { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 4 (buff 32)),
                       c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 4 (buff 32)),
                       p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 3 (buff 32)),
                       l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 2 (buff 32)),
                       l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 1 (buff 32)) })))
  (let ((params (contract-call? .schedule get-params)))
    (begin
      ;; lengths vs the schedule's OWN PARAMS-bound constants (max-len covariance admits SHORT
      ;; lists, so len is a real check; the fri-roots assert is redundant with the betas assert
      ;; below -- kept as cheap defense-in-depth, survivor-by-design in the mutation campaign)
      (require! (is-eq (len fri-roots) (get l params)))
      (require! (is-eq (len queries) (get n params)))
      (let ((ch (contract-call? .schedule derive-challenges (make-ctx pub)
                  trace-root comp-root t-z t-gz t-g2z c0-z c1-z c2-z c3-z fri-roots final nonce)))
        (begin
          ;; REJECT a grinding miss FIRST, before any Merkle/algebra work
          (require! (get pow-ok ch))
          (require! (is-eq (len (get betas ch)) (get l params)))
          (require! (is-eq (len (get query-indices ch)) (get n params)))
          ;; the z-felt -> circle point map, ONCE per proof (an off-circle z is unrepresentable;
          ;; 1+t^2=0 aborts here -- ~2^-124 honest)
          (let ((zp (contract-call? .cair felt-to-point (get z ch))))
            (begin
              ;; the OOD-consistency closure (Stwo OodsNotMatching), query-independent, hoisted.
              (require! (contract-call? .cair cair-compose-check
                          t-z t-gz t-g2z (get x zp) (get y zp) (get alpha ch)
                          c0-z c1-z c2-z c3-z))
              (begin
                (fold query-step queries
                  { k: u0, idx: (get query-indices ch),
                    env: { t-z: t-z, t-gz: t-gz, t-g2z: t-g2z,
                           c0-z: c0-z, c1-z: c1-z, c2-z: c2-z, c3-z: c3-z,
                           zx: (get x zp), zy: (get y zp),
                           gamma: (get gamma ch),
                           b0: (unwrap-panic (element-at? (get betas ch) u0)),
                           b1: (unwrap-panic (element-at? (get betas ch) u1)),
                           b2: (unwrap-panic (element-at? (get betas ch) u2)),
                           troot: trace-root, croot: comp-root,
                           fr0: (unwrap-panic (element-at? fri-roots u0)),
                           fr1: (unwrap-panic (element-at? fri-roots u1)),
                           fr2: (unwrap-panic (element-at? fri-roots u2)),
                           final: final } })
                true))))))))
