;; contracts/full/driver.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/driver.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
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
(define-constant VERSION 0x02)
;; N=4, L=3 (1 first + 2 inner roots), blowup=2 (LOAD-BEARING since gear 6e: rate 1/2),
;; pow_bits=8, air_id=10 (u32 BE; "size-8 circle Fibonacci v1" -- air_ids are a MONOTONIC
;; registry: never reuse a retired id; the multiplicative toy was 9). MUST agree with .schedule
;; get-params; pinned by a driver test.
(define-constant PARAMS 0x171010080000000b)

;; the house reject-by-abort idiom: a failed check ABORTS the whole call -- ONE reject channel.
(define-private (require! (pass bool))
  (unwrap-panic (if pass (some true) none)))

;; clear the low bit: the EVEN member of a sibling pair, whose point supplies the twiddle.
(define-private (even-of (m uint))
  (- m (mod m u2)))

;; ONE canonical leaf encoder for all five trees (trace, comp, fri layers 0..2); inherits
;; commit.clar's >= p canonicalization abort.
(define-private (qleaf (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (contract-call? .commit-full qm31-leaf v))

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
    (contract-call? .merkle-full merkle-verify (qleaf v) (path-from-pos sibs pos) root)))

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
    (contract-call? .merkle-full merkle-verify
      (contract-call? .merkle-full merkle-root (qleaf self)
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
  (contract-call? .fri-full fri-fold-down v
    (list { sibling: sib, x: t, beta: beta, v-is-right: (is-eq (mod pos u2) u1) })))

;; the circle-fold twiddle: Im of the EVEN FS position of q's conjugate pair. LIVE on every
;; honest path since gear 6e (conjugate leaves differ).
(define-read-only (y-twiddle (q uint))
  (get im (contract-call? .query-full query-point (even-of q))))

;; the derived line-fold twiddles X_k(even-of(q >> k)) -- KAT-pinned closed forms.
(define-read-only (line-x1 (q uint))
  (contract-call? .query-full query-x (* u2 (even-of (/ q u2)))))
(define-read-only (line-x2 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u4 (even-of (/ q u4))))))

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
(define-read-only (fold-one-hint
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (t uint)
    (h uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint))
  (contract-call? .fri-full fri-fold-down-hint v
    (list { sibling: sib, x: t, hint: h, beta: beta, v-is-right: (is-eq (mod pos u2) u1) })))
(define-private (path-step-full
    (sib (buff 32))
    (st { path: (list 17 { sibling: (buff 32), node-is-right: bool }), pos: uint }))
  { path: (unwrap-panic (as-max-len? (append (get path st)
            { sibling: sib, node-is-right: (is-eq (mod (get pos st) u2) u1) }) u17)),
    pos: (/ (get pos st) u2) })
(define-read-only (path-from-pos-full (sibs (list 17 (buff 32))) (pos uint))
  (get path (fold path-step-full sibs { path: (list), pos: pos })))
(define-read-only (bound-at-pos-full
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sibs (list 17 (buff 32)))
    (pos uint)
    (depth uint)
    (root (buff 32)))
  (begin
    (require! (is-eq (len sibs) depth))
    (contract-call? .merkle-full merkle-verify (qleaf v) (path-from-pos-full sibs pos) root)))
(define-read-only (pair-bound-full
    (self { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint)
    (parent-sibs (list 16 (buff 32)))
    (parent-depth uint)
    (root (buff 32)))
  (begin
    (require! (is-eq (len parent-sibs) parent-depth))
    (contract-call? .merkle-full merkle-verify
      (contract-call? .merkle-full merkle-root (qleaf self)
        (list { sibling: (qleaf sib), node-is-right: (is-eq (mod pos u2) u1) }))
      (path-from-pos-full parent-sibs (/ pos u2))
      root)))
(define-read-only (line-x3 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u8 (even-of (/ q u8)))))))
(define-read-only (line-x4 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u16 (even-of (/ q u16))))))))
(define-read-only (line-x5 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u32 (even-of (/ q u32)))))))))
(define-read-only (line-x6 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u64 (even-of (/ q u64))))))))))
(define-read-only (line-x7 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u128 (even-of (/ q u128)))))))))))
(define-read-only (line-x8 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u256 (even-of (/ q u256))))))))))))
(define-read-only (line-x9 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u512 (even-of (/ q u512)))))))))))))
(define-read-only (line-x10 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u1024 (even-of (/ q u1024))))))))))))))
(define-read-only (line-x11 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u2048 (even-of (/ q u2048)))))))))))))))
(define-read-only (line-x12 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u4096 (even-of (/ q u4096))))))))))))))))
(define-read-only (line-x13 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u8192 (even-of (/ q u8192)))))))))))))))))
(define-read-only (line-x14 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u16384 (even-of (/ q u16384))))))))))))))))))
(define-read-only (line-x15 (q uint))
  (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .fri-full pi-x (contract-call? .query-full query-x (* u32768 (even-of (/ q u32768)))))))))))))))))))
(define-read-only (verify-query
    (q uint)
    (prf { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 17 (buff 32)),
           c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 17 (buff 32)),
           p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 16 (buff 32)),
           l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 15 (buff 32)),
           l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 14 (buff 32)),
           l3-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l3-sibs: (list 13 (buff 32)),
           l4-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l4-sibs: (list 12 (buff 32)),
           l5-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l5-sibs: (list 11 (buff 32)),
           l6-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l6-sibs: (list 10 (buff 32)),
           l7-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l7-sibs: (list 9 (buff 32)),
           l8-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l8-sibs: (list 8 (buff 32)),
           l9-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l9-sibs: (list 7 (buff 32)),
           l10-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l10-sibs: (list 6 (buff 32)),
           l11-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l11-sibs: (list 5 (buff 32)),
           l12-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l12-sibs: (list 4 (buff 32)),
           l13-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l13-sibs: (list 3 (buff 32)),
           l14-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l14-sibs: (list 2 (buff 32)),
           l15-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l15-sibs: (list 1 (buff 32)),
           hints: (list 16 uint) })
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
           b3: { c0: uint, c1: uint, c2: uint, c3: uint },
           b4: { c0: uint, c1: uint, c2: uint, c3: uint },
           b5: { c0: uint, c1: uint, c2: uint, c3: uint },
           b6: { c0: uint, c1: uint, c2: uint, c3: uint },
           b7: { c0: uint, c1: uint, c2: uint, c3: uint },
           b8: { c0: uint, c1: uint, c2: uint, c3: uint },
           b9: { c0: uint, c1: uint, c2: uint, c3: uint },
           b10: { c0: uint, c1: uint, c2: uint, c3: uint },
           b11: { c0: uint, c1: uint, c2: uint, c3: uint },
           b12: { c0: uint, c1: uint, c2: uint, c3: uint },
           b13: { c0: uint, c1: uint, c2: uint, c3: uint },
           b14: { c0: uint, c1: uint, c2: uint, c3: uint },
           b15: { c0: uint, c1: uint, c2: uint, c3: uint },
           troot: (buff 32), croot: (buff 32),
           fr0: (buff 32), fr1: (buff 32), fr2: (buff 32), fr3: (buff 32), fr4: (buff 32), fr5: (buff 32), fr6: (buff 32), fr7: (buff 32), fr8: (buff 32), fr9: (buff 32), fr10: (buff 32), fr11: (buff 32), fr12: (buff 32), fr13: (buff 32), fr14: (buff 32), fr15: (buff 32),
           final: { c0: uint, c1: uint, c2: uint, c3: uint } }))
  (let ((pt (contract-call? .query-full query-point q))
        (k1 (/ q u2))
        (k2 (/ q u4))
        (k3 (/ q u8))
        (k4 (/ q u16))
        (k5 (/ q u32))
        (k6 (/ q u64))
        (k7 (/ q u128))
        (k8 (/ q u256))
        (k9 (/ q u512))
        (k10 (/ q u1024))
        (k11 (/ q u2048))
        (k12 (/ q u4096))
        (k13 (/ q u8192))
        (k14 (/ q u16384))
        (k15 (/ q u32768))
        (g-base (require! (and (is-eq (get c1 (get t-x prf)) u0) (is-eq (get c2 (get t-x prf)) u0) (is-eq (get c3 (get t-x prf)) u0))))
        (g-t (require! (bound-at-pos-full (get t-x prf) (get t-sibs prf) q u17 (get troot env))))
        (g-c (require! (bound-at-pos-full (get c-x prf) (get c-sibs prf) q u17 (get croot env))))
        (p0 (contract-call? .cdeep-full deep-row (get t-x prf) (get c-x prf) (get t-z env) (get t-gz env) (get t-g2z env) (get c0-z env) (get c1-z env) (get c2-z env) (get c3-z env) (get re pt) (get im pt) (get zx env) (get zy env) (get gamma env)))
        (g-p0 (require! (pair-bound-full p0 (get p0-sib prf) q (get p0-sibs prf) u16 (get fr0 env))))
        (v1 (fold-one-hint p0 (get p0-sib prf) (y-twiddle q) (unwrap-panic (element-at? (get hints prf) u0)) (get b0 env) q))
        (g-l1 (require! (pair-bound-full v1 (get l1-sib prf) k1 (get l1-sibs prf) u15 (get fr1 env))))
        (v2 (fold-one-hint v1 (get l1-sib prf) (line-x1 q) (unwrap-panic (element-at? (get hints prf) u1)) (get b1 env) k1))
        (g-l2 (require! (pair-bound-full v2 (get l2-sib prf) k2 (get l2-sibs prf) u14 (get fr2 env))))
        (v3 (fold-one-hint v2 (get l2-sib prf) (line-x2 q) (unwrap-panic (element-at? (get hints prf) u2)) (get b2 env) k2))
        (g-l3 (require! (pair-bound-full v3 (get l3-sib prf) k3 (get l3-sibs prf) u13 (get fr3 env))))
        (v4 (fold-one-hint v3 (get l3-sib prf) (line-x3 q) (unwrap-panic (element-at? (get hints prf) u3)) (get b3 env) k3))
        (g-l4 (require! (pair-bound-full v4 (get l4-sib prf) k4 (get l4-sibs prf) u12 (get fr4 env))))
        (v5 (fold-one-hint v4 (get l4-sib prf) (line-x4 q) (unwrap-panic (element-at? (get hints prf) u4)) (get b4 env) k4))
        (g-l5 (require! (pair-bound-full v5 (get l5-sib prf) k5 (get l5-sibs prf) u11 (get fr5 env))))
        (v6 (fold-one-hint v5 (get l5-sib prf) (line-x5 q) (unwrap-panic (element-at? (get hints prf) u5)) (get b5 env) k5))
        (g-l6 (require! (pair-bound-full v6 (get l6-sib prf) k6 (get l6-sibs prf) u10 (get fr6 env))))
        (v7 (fold-one-hint v6 (get l6-sib prf) (line-x6 q) (unwrap-panic (element-at? (get hints prf) u6)) (get b6 env) k6))
        (g-l7 (require! (pair-bound-full v7 (get l7-sib prf) k7 (get l7-sibs prf) u9 (get fr7 env))))
        (v8 (fold-one-hint v7 (get l7-sib prf) (line-x7 q) (unwrap-panic (element-at? (get hints prf) u7)) (get b7 env) k7))
        (g-l8 (require! (pair-bound-full v8 (get l8-sib prf) k8 (get l8-sibs prf) u8 (get fr8 env))))
        (v9 (fold-one-hint v8 (get l8-sib prf) (line-x8 q) (unwrap-panic (element-at? (get hints prf) u8)) (get b8 env) k8))
        (g-l9 (require! (pair-bound-full v9 (get l9-sib prf) k9 (get l9-sibs prf) u7 (get fr9 env))))
        (v10 (fold-one-hint v9 (get l9-sib prf) (line-x9 q) (unwrap-panic (element-at? (get hints prf) u9)) (get b9 env) k9))
        (g-l10 (require! (pair-bound-full v10 (get l10-sib prf) k10 (get l10-sibs prf) u6 (get fr10 env))))
        (v11 (fold-one-hint v10 (get l10-sib prf) (line-x10 q) (unwrap-panic (element-at? (get hints prf) u10)) (get b10 env) k10))
        (g-l11 (require! (pair-bound-full v11 (get l11-sib prf) k11 (get l11-sibs prf) u5 (get fr11 env))))
        (v12 (fold-one-hint v11 (get l11-sib prf) (line-x11 q) (unwrap-panic (element-at? (get hints prf) u11)) (get b11 env) k11))
        (g-l12 (require! (pair-bound-full v12 (get l12-sib prf) k12 (get l12-sibs prf) u4 (get fr12 env))))
        (v13 (fold-one-hint v12 (get l12-sib prf) (line-x12 q) (unwrap-panic (element-at? (get hints prf) u12)) (get b12 env) k12))
        (g-l13 (require! (pair-bound-full v13 (get l13-sib prf) k13 (get l13-sibs prf) u3 (get fr13 env))))
        (v14 (fold-one-hint v13 (get l13-sib prf) (line-x13 q) (unwrap-panic (element-at? (get hints prf) u13)) (get b13 env) k13))
        (g-l14 (require! (pair-bound-full v14 (get l14-sib prf) k14 (get l14-sibs prf) u2 (get fr14 env))))
        (v15 (fold-one-hint v14 (get l14-sib prf) (line-x14 q) (unwrap-panic (element-at? (get hints prf) u14)) (get b14 env) k14))
        (g-l15 (require! (pair-bound-full v15 (get l15-sib prf) k15 (get l15-sibs prf) u1 (get fr15 env))))
        (v16 (fold-one-hint v15 (get l15-sib prf) (line-x15 q) (unwrap-panic (element-at? (get hints prf) u15)) (get b15 env) k15))
        (g-fin (require! (contract-call? .qm31-full qm31-eq v16 (get final env)))))
    true))

;; the no-zip iteration idiom: fold over the per-query proof list, reading the k-th
;; SCHEDULE-DRAWN index from the accumulator.
(define-private (query-step
    (prf { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 17 (buff 32)),
           c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 17 (buff 32)),
           p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 16 (buff 32)),
           l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 15 (buff 32)),
           l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 14 (buff 32)),
           l3-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l3-sibs: (list 13 (buff 32)),
           l4-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l4-sibs: (list 12 (buff 32)),
           l5-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l5-sibs: (list 11 (buff 32)),
           l6-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l6-sibs: (list 10 (buff 32)),
           l7-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l7-sibs: (list 9 (buff 32)),
           l8-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l8-sibs: (list 8 (buff 32)),
           l9-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l9-sibs: (list 7 (buff 32)),
           l10-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l10-sibs: (list 6 (buff 32)),
           l11-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l11-sibs: (list 5 (buff 32)),
           l12-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l12-sibs: (list 4 (buff 32)),
           l13-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l13-sibs: (list 3 (buff 32)),
           l14-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l14-sibs: (list 2 (buff 32)),
           l15-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l15-sibs: (list 1 (buff 32)),
           hints: (list 16 uint) })
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
                b3: { c0: uint, c1: uint, c2: uint, c3: uint },
                b4: { c0: uint, c1: uint, c2: uint, c3: uint },
                b5: { c0: uint, c1: uint, c2: uint, c3: uint },
                b6: { c0: uint, c1: uint, c2: uint, c3: uint },
                b7: { c0: uint, c1: uint, c2: uint, c3: uint },
                b8: { c0: uint, c1: uint, c2: uint, c3: uint },
                b9: { c0: uint, c1: uint, c2: uint, c3: uint },
                b10: { c0: uint, c1: uint, c2: uint, c3: uint },
                b11: { c0: uint, c1: uint, c2: uint, c3: uint },
                b12: { c0: uint, c1: uint, c2: uint, c3: uint },
                b13: { c0: uint, c1: uint, c2: uint, c3: uint },
                b14: { c0: uint, c1: uint, c2: uint, c3: uint },
                b15: { c0: uint, c1: uint, c2: uint, c3: uint },
                troot: (buff 32), croot: (buff 32),
                fr0: (buff 32), fr1: (buff 32), fr2: (buff 32), fr3: (buff 32), fr4: (buff 32), fr5: (buff 32), fr6: (buff 32), fr7: (buff 32), fr8: (buff 32), fr9: (buff 32), fr10: (buff 32), fr11: (buff 32), fr12: (buff 32), fr13: (buff 32), fr14: (buff 32), fr15: (buff 32),
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
    (fri-roots (list 16 (buff 32)))
    (final { c0: uint, c1: uint, c2: uint, c3: uint })
    (nonce (buff 8))
    (queries (list 23 { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 17 (buff 32)),
                     c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 17 (buff 32)),
                     p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 16 (buff 32)),
                     l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 15 (buff 32)),
                     l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 14 (buff 32)),
                     l3-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l3-sibs: (list 13 (buff 32)),
                     l4-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l4-sibs: (list 12 (buff 32)),
                     l5-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l5-sibs: (list 11 (buff 32)),
                     l6-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l6-sibs: (list 10 (buff 32)),
                     l7-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l7-sibs: (list 9 (buff 32)),
                     l8-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l8-sibs: (list 8 (buff 32)),
                     l9-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l9-sibs: (list 7 (buff 32)),
                     l10-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l10-sibs: (list 6 (buff 32)),
                     l11-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l11-sibs: (list 5 (buff 32)),
                     l12-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l12-sibs: (list 4 (buff 32)),
                     l13-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l13-sibs: (list 3 (buff 32)),
                     l14-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l14-sibs: (list 2 (buff 32)),
                     l15-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l15-sibs: (list 1 (buff 32)),
                     hints: (list 16 uint) })))
  (let ((params (contract-call? .schedule-full get-params))
        (g-lr (require! (is-eq (len fri-roots) (get l params))))
        (g-nq (require! (is-eq (len queries) (get n params))))
        (ch (contract-call? .schedule-full derive-challenges (make-ctx pub)
             trace-root comp-root t-z t-gz t-g2z c0-z c1-z c2-z c3-z fri-roots final nonce))
        (g-pow (require! (get pow-ok ch)))
        (g-bl (require! (is-eq (len (get betas ch)) (get l params))))
        (g-ql (require! (is-eq (len (get query-indices ch)) (get n params))))
        (zp (contract-call? .cair-full felt-to-point (get z ch)))
        (g-ood (require! (contract-call? .cair-full cair-compose-check
                 t-z t-gz t-g2z (get x zp) (get y zp) (get alpha ch)
                 c0-z c1-z c2-z c3-z)))
        (done (fold query-step queries
                { k: u0, idx: (get query-indices ch),
                  env: { t-z: t-z, t-gz: t-gz, t-g2z: t-g2z,
                         c0-z: c0-z, c1-z: c1-z, c2-z: c2-z, c3-z: c3-z,
                         zx: (get x zp), zy: (get y zp),
                         gamma: (get gamma ch),
                         b0: (unwrap-panic (element-at? (get betas ch) u0)),
                         b1: (unwrap-panic (element-at? (get betas ch) u1)),
                         b2: (unwrap-panic (element-at? (get betas ch) u2)),
                         b3: (unwrap-panic (element-at? (get betas ch) u3)),
                         b4: (unwrap-panic (element-at? (get betas ch) u4)),
                         b5: (unwrap-panic (element-at? (get betas ch) u5)),
                         b6: (unwrap-panic (element-at? (get betas ch) u6)),
                         b7: (unwrap-panic (element-at? (get betas ch) u7)),
                         b8: (unwrap-panic (element-at? (get betas ch) u8)),
                         b9: (unwrap-panic (element-at? (get betas ch) u9)),
                         b10: (unwrap-panic (element-at? (get betas ch) u10)),
                         b11: (unwrap-panic (element-at? (get betas ch) u11)),
                         b12: (unwrap-panic (element-at? (get betas ch) u12)),
                         b13: (unwrap-panic (element-at? (get betas ch) u13)),
                         b14: (unwrap-panic (element-at? (get betas ch) u14)),
                         b15: (unwrap-panic (element-at? (get betas ch) u15)),
                         troot: trace-root, croot: comp-root,
                         fr0: (unwrap-panic (element-at? fri-roots u0)),
                         fr1: (unwrap-panic (element-at? fri-roots u1)),
                         fr2: (unwrap-panic (element-at? fri-roots u2)),
                         fr3: (unwrap-panic (element-at? fri-roots u3)),
                         fr4: (unwrap-panic (element-at? fri-roots u4)),
                         fr5: (unwrap-panic (element-at? fri-roots u5)),
                         fr6: (unwrap-panic (element-at? fri-roots u6)),
                         fr7: (unwrap-panic (element-at? fri-roots u7)),
                         fr8: (unwrap-panic (element-at? fri-roots u8)),
                         fr9: (unwrap-panic (element-at? fri-roots u9)),
                         fr10: (unwrap-panic (element-at? fri-roots u10)),
                         fr11: (unwrap-panic (element-at? fri-roots u11)),
                         fr12: (unwrap-panic (element-at? fri-roots u12)),
                         fr13: (unwrap-panic (element-at? fri-roots u13)),
                         fr14: (unwrap-panic (element-at? fri-roots u14)),
                         fr15: (unwrap-panic (element-at? fri-roots u15)),
                         final: final } })))
    true))
