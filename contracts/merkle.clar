;; sha256 binary Merkle-path verification.
;; Re-hashes a leaf up its authentication path and checks it lands on the root.
;; Differential-tested against a plain node:crypto sha256 tree in tests/merkle.test.ts.

;; One level of the climb. `acc` is the hash we've built so far (starts as the leaf);
;; `step` carries the sibling hash and which side OUR node is on at this level.
;;   node-is-right => our node is the right child  -> hash(sibling ++ acc)
;;   node-is-right is false => our node is the left child -> hash(acc ++ sibling)
;; Getting this concat order wrong is the classic Merkle bug, so the order is pinned
;; by the direction bit and exercised in both directions by the tests.
(define-private (merkle-step
    (step { sibling: (buff 32), node-is-right: bool })
    (acc (buff 32)))
  (if (get node-is-right step)
      (sha256 (concat (get sibling step) acc))
      (sha256 (concat acc (get sibling step)))))

;; Fold the leaf up through every level of the path to recompute the root.
;; An empty path (single-leaf tree) returns the leaf unchanged.
(define-read-only (merkle-root
    (leaf (buff 32))
    (path (list 32 { sibling: (buff 32), node-is-right: bool })))
  (fold merkle-step path leaf))

;; The proof is valid iff the recomputed root matches the claimed root.
(define-read-only (merkle-verify
    (leaf (buff 32))
    (path (list 32 { sibling: (buff 32), node-is-right: bool }))
    (root (buff 32)))
  (is-eq (merkle-root leaf path) root))
