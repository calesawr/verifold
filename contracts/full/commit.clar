;; contracts/full/commit.clar: GENERATED FILE. DO NOT EDIT.
;; Emitted from contracts/commit.clar by the M2 span templates at
;; params.PRODUCTION_POINT. Comments are inherited from the toy gear
;; and may describe toy values; the code is the production point.
;; Regenerate: python3 tools/flatten.py --point full
;; QM31-leaf encoding + Merkle-bound opening, gear 6d-i. The missing piece of obligation C: a canonical
;; map from a QM31 field value to a sha256 leaf, so an opened value can be bound to a committed Merkle root
;; via the shipped merkle-verify. The 16-byte form (c0 || c1 || c2 || c3, each 4-byte big-endian, low-limb
;; first) is byte-IDENTICAL to transcript.clar's absorb-qm31 -- ONE encoder, so the bytes that commit into
;; the tree are the same bytes the transcript absorbs (no Frozen-Heart ambiguity).
;;
;; CANONICALIZATION (the soundness boundary): m31-to-be4 ABORTS on a non-reduced limb (v >= p), the reject
;; direction (matching qm31-inv's zero-norm and fri-fold-step's x=0). So 0 is the ONLY encoding of the zero
;; element; [p,0,0,0] aborts -- otherwise a non-reduced opening would bind to a different leaf than committed.
;;
;; NOT STANDALONE-SOUND: binds a value to a root but does NOT derive the root/challenges from the transcript
;; (gear 6d-ii), does NOT tie opened T(x)/C(x) into deep-fri-ok (6d-iv), and does NOT run multiple queries
;; (6d-iv). An attacker who controls the root can still open anything; soundness closes when 6d-ii/iii/iv land.
;; Leaf is UNTAGGED sha256(16B) -- leaf/node domain separation is a DOCUMENTED DEFAULT for the human.
;; Reuses .merkle (merkle-verify) unchanged; deploy order field -> qm31 -> merkle -> commit (acyclic).

(define-constant P u2147483647) ;; 2^31 - 1, shared with field / qm31 / transcript

;; 4-byte big-endian of one canonical M31 limb. Clarity 3 has no uint->buff4, so use the consensus
;; serialization: to-consensus-buff?(uint) yields 0x01 (type tag) || 16-byte big-endian value, so bytes
;; [13,17) are the low 4 big-endian bytes -- exactly the limb, since it is < 2^31 < 2^32. ABORTS on a
;; non-reduced limb (v >= p) via the unwrap-panic(if ...) reject idiom (same shape as fri-fold-step's x=0).
(define-private (m31-to-be4 (v uint))
  (unwrap-panic (if (< v P)
    (as-max-len? (unwrap-panic (slice? (unwrap-panic (to-consensus-buff? v)) u13 u17)) u4)
    none)))

;; canonical 16-byte QM31 form: c0||c1||c2||c3, each 4-byte big-endian. The ONE encoder shared by the
;; Merkle leaf (below) AND the gear 6d Fiat-Shamir schedule (which absorbs the OOD openings via this exact
;; function), so the absorbed bytes are byte-identical to the committed-leaf preimage -- no Frozen-Heart
;; ambiguity. Aborts on any non-canonical limb (>= p) via m31-to-be4.
(define-read-only (qm31-enc16 (q { c0: uint, c1: uint, c2: uint, c3: uint }))
  (concat (m31-to-be4 (get c0 q))
  (concat (m31-to-be4 (get c1 q))
  (concat (m31-to-be4 (get c2 q)) (m31-to-be4 (get c3 q))))))

;; the 32-byte Merkle leaf = sha256 of the canonical 16-byte form.
(define-read-only (qm31-leaf (q { c0: uint, c1: uint, c2: uint, c3: uint }))
  (sha256 (qm31-enc16 q)))

;; bind an opened QM31 value to a committed Merkle root: hash it to a leaf, then check the auth path.
;; Reuses the SHIPPED merkle-verify (gear 3) with ZERO change to merkle.clar.
(define-read-only (opening-bound
    (q { c0: uint, c1: uint, c2: uint, c3: uint })
    (path (list 32 { sibling: (buff 32), node-is-right: bool }))
    (root (buff 32)))
  (contract-call? .merkle-full merkle-verify (qm31-leaf q) path root))
