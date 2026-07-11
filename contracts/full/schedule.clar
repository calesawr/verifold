;; contracts/full/schedule.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/schedule.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; Fiat-Shamir schedule, gear 6d-ii. Re-derives EVERY challenge (alpha, z, gamma, the FRI betas, the query
;; indices) from the proof transcript in the LOCKED absorb/squeeze order, so the verifier uses challenges it
;; computed itself, never proof-supplied values. This is what makes Fiat-Shamir sound.
;;
;; ORDER (each squeeze advances the state, so absorb-before-squeeze is structural):
;;   init(ctx) -> absorb trace-root -> squeeze ALPHA -> absorb comp-root -> squeeze Z
;;   -> absorb the four OOD openings (via .commit qm31-enc16, the SAME canonical encoder as the Merkle leaf,
;;      so the absorbed bytes equal the committed-leaf preimage -- no Frozen-Heart) -> squeeze GAMMA.
;;      GAMMA is drawn strictly AFTER the openings -> this CLOSES the gear-6c obligation (a prover cannot
;;      precompute the Tz<->Cz cancellation because gamma is unknown until the openings are committed).
;;   -> per FRI layer: absorb fri-root_i -> squeeze BETA_i  (interleaved; each beta hashes only roots 0..i)
;;   -> absorb the final FRI poly -> grinding gate pow-ok -> absorb the nonce -> draw N QUERY INDICES last.
;;
;; ctx = DOMAIN_LABEL || VERSION || PARAMS || sha256(public_inputs); PARAMS binds N,L,blowup,pow_bits,air_id.
;;
;; NOT STANDALONE-SOUND: DERIVES challenges only. The 6d-iv driver MUST: (a) assert (len fri-roots)==L and the
;; query-counter length == N against the PARAMS-bound values (the type system cannot enforce list lengths);
;; (b) REJECT the proof when pow-ok is false (this returns the bool, it does not abort on a grinding miss);
;; (c) bind every opening to its committed root and feed ONLY these derived challenges (never proof-supplied
;; ones) into deep-fri-ok. Reuses .transcript + .commit unchanged; deploy field -> qm31 -> merkle ->
;; transcript -> commit -> schedule (acyclic).

(define-constant N u23)             ;; query count        (must equal the query-counter length below + PARAMS)
(define-constant L u16)             ;; FRI commitment count (gear 6e, rate 1/2): 1 FIRST-layer root (the
                                   ;; committed DEEP column, Stwo commit_first_layer) + 2 inner line-layer
                                   ;; roots (sizes 8/4). The size-2 last layer is a transmitted degree-0
                                   ;; LinePoly (the `final` constant), COMPARED per query, never committed
                                   ;; (Stwo decommit_last_layer at log_last_layer_degree_bound = 0).
                                   ;; Informational here; the driver asserts (len fri-roots) == L via
                                   ;; get-params and bakes L into its PARAMS.
(define-constant DOMAIN_SIZE u131072)  ;; query-index modulus (DOCUMENTED DEFAULT; the real LDE coset size + the
                                   ;; index->x map are the gear-6d-iii / human-cryptographer boundary)
(define-constant POW_THRESHOLD u1329227995784915872903807060280344576) ;; 2^120  (pow_bits = 8)
(define-constant QUERY_COUNTER (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20 u21 u22))  ;; length N; the values are ignored, only the LENGTH matters

;; one FRI layer of the commit phase: absorb the layer root, squeeze the layer challenge beta, append it.
;; Interleaved (one absorb, one squeeze per layer) -- absorb-roots (batch) would give one post-batch state,
;; but each beta_i must hash only roots 0..i.
(define-private (fri-beta-step
    (root (buff 32))
    (acc { state: (buff 32), betas: (list 32 { c0: uint, c1: uint, c2: uint, c3: uint }) }))
  (let ((b (contract-call? .transcript-full squeeze-qm31 (contract-call? .transcript-full absorb-root (get state acc) root))))
    { state: (get state b),
      betas: (unwrap-panic (as-max-len? (append (get betas acc)
                { c0: (get c0 b), c1: (get c1 b), c2: (get c2 b), c3: (get c3 b) }) u32)) }))

;; one query index: squeeze a bare M31 (cheap, for an index, not a security challenge) and reduce mod
;; DOMAIN_SIZE. The counter element i is ignored -- only the QUERY_COUNTER length N matters (no loops).
(define-private (query-idx-step
    (i uint)
    (acc { state: (buff 32), idx: (list 32 uint) }))
  (let ((r (contract-call? .transcript-full squeeze-m31 (get state acc))))
    { state: (get state r),
      idx: (unwrap-panic (as-max-len? (append (get idx acc) (mod (get v r) DOMAIN_SIZE)) u32)) }))

;; Gear 6e: the four fixed OOD opening params became SEVEN -- T at the three mask points plus the
;; FOUR composition COORDINATE openings c0-z..c3-z, each absorbed INDIVIDUALLY before gamma.
;; WHY (Frozen-Heart class): binding only the recombined composition value would leave 3 QM31
;; degrees of freedom in the DEEP quotient inputs unbound at challenge time. NAMED params (not a
;; list) make the closure TYPE-enforced: a caller cannot pass a short openings vector and draw
;; gamma early. Order = Stwo verify_values: mix sampled values (flatten order: trace tree then
;; composition tree, samples in mask order -- CAIR-6), THEN draw the random coefficient.
(define-read-only (derive-challenges
    (ctx (buff 1024))
    (trace-root (buff 32))
    (comp-root (buff 32))
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c0-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c1-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c2-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c3-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (fri-roots (list 32 (buff 32)))
    (final { c0: uint, c1: uint, c2: uint, c3: uint })
    (nonce (buff 8)))
  (let ((a (contract-call? .transcript-full squeeze-qm31
             (contract-call? .transcript-full absorb-root (contract-call? .transcript-full transcript-init ctx) trace-root))))
  (let ((z (contract-call? .transcript-full squeeze-qm31
             (contract-call? .transcript-full absorb-root (get state a) comp-root))))
  (let ((s-open (contract-call? .transcript-full absorb-qm31
                  (contract-call? .transcript-full absorb-qm31
                    (contract-call? .transcript-full absorb-qm31
                      (contract-call? .transcript-full absorb-qm31
                        (contract-call? .transcript-full absorb-qm31
                          (contract-call? .transcript-full absorb-qm31
                            (contract-call? .transcript-full absorb-qm31 (get state z) (contract-call? .commit-full qm31-enc16 t-z))
                            (contract-call? .commit-full qm31-enc16 t-gz))
                          (contract-call? .commit-full qm31-enc16 t-g2z))
                        (contract-call? .commit-full qm31-enc16 c0-z))
                      (contract-call? .commit-full qm31-enc16 c1-z))
                    (contract-call? .commit-full qm31-enc16 c2-z))
                  (contract-call? .commit-full qm31-enc16 c3-z))))
  (let ((g (contract-call? .transcript-full squeeze-qm31 s-open)))
  (let ((fr (fold fri-beta-step fri-roots { state: (get state g), betas: (list) })))
  (let ((s-fin (contract-call? .transcript-full absorb-qm31 (get state fr) (contract-call? .commit-full qm31-enc16 final))))
  (let ((pass (contract-call? .transcript-full pow-ok s-fin nonce POW_THRESHOLD)))
  (let ((s-n (contract-call? .transcript-full absorb-nonce s-fin nonce)))
  (let ((qr (fold query-idx-step QUERY_COUNTER { state: s-n, idx: (list) })))
    { alpha: { c0: (get c0 a), c1: (get c1 a), c2: (get c2 a), c3: (get c3 a) },
      z: { c0: (get c0 z), c1: (get c1 z), c2: (get c2 z), c3: (get c3 z) },
      gamma: { c0: (get c0 g), c1: (get c1 g), c2: (get c2 g), c3: (get c3 g) },
      betas: (get betas fr),
      query-indices: (get idx qr),
      pow-ok: pass }))))))))))

;; PARAMS-bound constants for the 6d-iv driver's length asserts (obligation (a)) -- ONE source of
;; truth, so the driver's N/L cannot silently drift from the schedule's QUERY_COUNTER length /
;; query-index modulus (the coupled-constants injury class).
(define-read-only (get-params)
  { n: N, l: L, domain-size: DOMAIN_SIZE })
