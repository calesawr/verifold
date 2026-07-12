;; verifold-attest.clar: the minimal public consumer of the production
;; verifier (M3a). attest calls verifold-flat-full-production
;; driver/verify inside the transaction: a proof failing ANY verifier
;; gate aborts the whole transaction (reject-by-abort), so a recorded
;; attestation exists only for a proof the verifier accepted; asserts!
;; covers the residual false-return channel. Duplicate attestations of
;; the same pub overwrite at their new height; attest-count counts
;; calls, not unique pubs. No admin functions, no upgrade path, no
;; token logic.
(define-constant ERR-VERIFY-FAILED (err u100))

(define-map attestations (buff 32) { attester: principal, height: uint })
(define-data-var attest-count uint u0)

(define-read-only (get-attestation (pub-hash (buff 32)))
  (map-get? attestations pub-hash))

(define-read-only (get-count)
  (var-get attest-count))

(define-public (attest
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
  (let ((pub-hash (sha256 pub)))
    (asserts! (contract-call? .verifold-flat-full-production driver/verify
                pub trace-root comp-root t-z t-gz t-g2z c0-z c1-z c2-z c3-z
                fri-roots final nonce queries)
              ERR-VERIFY-FAILED)
    (map-set attestations pub-hash
             { attester: tx-sender, height: burn-block-height })
    (var-set attest-count (+ (var-get attest-count) u1))
    (print { topic: "verifold-attest", pub-hash: pub-hash,
             attester: tx-sender, height: burn-block-height })
    (ok true)))
