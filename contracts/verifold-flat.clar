;; verifold-flat.clar: GENERATED FILE. DO NOT EDIT.
;; One-contract emission of the 11-gear circle-STARK verifier.
;; Generator: tools/flatten.py v1.0 (separator '/')
;; Regenerate: python3 tools/flatten.py
;; Verify:     python3 tools/flatten_check.py
;; Inputs (sha256):
;;   10bb8933ae55925c929a16e57242dfbfee98c20bd1d82a7bf96be1f586b80fce  contracts/field.clar
;;   d1f1d51e831680fd8481d6a5d12ff5b5315a0dfdbd3b1e8f527c3e00bc179e34  contracts/qm31.clar
;; ========================= gear: field (contracts/field.clar) =========================
(define-constant field/P u2147483647)
(define-read-only (field/m31-add (a uint) (b uint))
  (mod (+ a b) field/P))
(define-read-only (field/m31-sub (a uint) (b uint))
  (mod (- (+ a field/P) b) field/P))
(define-read-only (field/m31-mul (a uint) (b uint))
  (mod (* a b) field/P))
(define-constant field/STEPS (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15
                             u16 u17 u18 u19 u20 u21 u22 u23 u24 u25 u26 u27 u28 u29 u30))
(define-private (field/pow-step (i uint) (st { r: uint, b: uint, e: uint }))
  (let ((r (get r st)) (b (get b st)) (e (get e st)))
    {
      r: (if (is-eq (mod e u2) u1) (field/m31-mul r b) r),
      b: (field/m31-mul b b),
      e: (/ e u2)
    }))
(define-constant field/POW_EXP_BOUND u2147483648)
(define-read-only (field/m31-pow (base uint) (exp uint))
  (unwrap-panic (if (< exp field/POW_EXP_BOUND)
    (some (get r (fold field/pow-step field/STEPS { r: u1, b: base, e: exp })))
    none)))
(define-read-only (field/m31-inv (a uint))
  (field/m31-pow a (- field/P u2)))
(define-read-only (field/m31-div (a uint) (b uint))
  (field/m31-mul a (field/m31-inv b)))
;; ========================= gear: qm31 (contracts/qm31.clar) =========================
(define-constant qm31/P u2147483647)
(define-private (qm31/m31-add (a uint) (b uint)) (mod (+ a b) qm31/P))
(define-private (qm31/m31-sub (a uint) (b uint)) (mod (- (+ a qm31/P) b) qm31/P))
(define-private (qm31/m31-mul (a uint) (b uint)) (mod (* a b) qm31/P))
(define-read-only (qm31/cm-mul (x0 uint) (x1 uint) (y0 uint) (y1 uint))
  { re: (qm31/m31-sub (qm31/m31-mul x0 y0) (qm31/m31-mul x1 y1)),
    im: (qm31/m31-add (qm31/m31-mul x0 y1) (qm31/m31-mul x1 y0)) })
(define-private (qm31/cm-mul-r (e0 uint) (e1 uint))
  { re: (qm31/m31-sub (qm31/m31-add e0 e0) e1),
    im: (qm31/m31-add e0 (qm31/m31-add e1 e1)) })
(define-private (qm31/cm-sub (x0 uint) (x1 uint) (y0 uint) (y1 uint))
  { re: (qm31/m31-sub x0 y0), im: (qm31/m31-sub x1 y1) })
(define-private (qm31/cm-inv (c0 uint) (c1 uint))
  (let ((ninv (field/m31-inv (qm31/m31-add (qm31/m31-mul c0 c0) (qm31/m31-mul c1 c1)))))
    { re: (qm31/m31-mul c0 ninv), im: (qm31/m31-mul (qm31/m31-sub u0 c1) ninv) }))
(define-read-only (qm31/qm31-add (a { c0: uint, c1: uint, c2: uint, c3: uint })
                            (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  { c0: (qm31/m31-add (get c0 a) (get c0 b)), c1: (qm31/m31-add (get c1 a) (get c1 b)),
    c2: (qm31/m31-add (get c2 a) (get c2 b)), c3: (qm31/m31-add (get c3 a) (get c3 b)) })
(define-read-only (qm31/qm31-sub (a { c0: uint, c1: uint, c2: uint, c3: uint })
                            (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  { c0: (qm31/m31-sub (get c0 a) (get c0 b)), c1: (qm31/m31-sub (get c1 a) (get c1 b)),
    c2: (qm31/m31-sub (get c2 a) (get c2 b)), c3: (qm31/m31-sub (get c3 a) (get c3 b)) })
(define-read-only (qm31/qm31-mul-m31 (a { c0: uint, c1: uint, c2: uint, c3: uint }) (s uint))
  { c0: (qm31/m31-mul (get c0 a) s), c1: (qm31/m31-mul (get c1 a) s),
    c2: (qm31/m31-mul (get c2 a) s), c3: (qm31/m31-mul (get c3 a) s) })
(define-read-only (qm31/qm31-from-m31 (s uint)) { c0: s, c1: u0, c2: u0, c3: u0 })
(define-read-only (qm31/qm31-mul (a { c0: uint, c1: uint, c2: uint, c3: uint })
                            (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((ac (qm31/cm-mul (get c0 a) (get c1 a) (get c0 b) (get c1 b)))
        (bd (qm31/cm-mul (get c2 a) (get c3 a) (get c2 b) (get c3 b)))
        (ad (qm31/cm-mul (get c0 a) (get c1 a) (get c2 b) (get c3 b)))
        (bc (qm31/cm-mul (get c2 a) (get c3 a) (get c0 b) (get c1 b))))
    (let ((rbd (qm31/cm-mul-r (get re bd) (get im bd))))
      { c0: (qm31/m31-add (get re ac) (get re rbd)), c1: (qm31/m31-add (get im ac) (get im rbd)),
        c2: (qm31/m31-add (get re ad) (get re bc)), c3: (qm31/m31-add (get im ad) (get im bc)) })))
(define-read-only (qm31/qm31-inv (a { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((a0 (get c0 a)) (a1 (get c1 a)) (b0 (get c2 a)) (b1 (get c3 a)))
    (let ((aa (qm31/cm-mul a0 a1 a0 a1))
          (bb (qm31/cm-mul b0 b1 b0 b1)))
      (let ((rbb (qm31/cm-mul-r (get re bb) (get im bb))))
        (let ((n (qm31/cm-sub (get re aa) (get im aa) (get re rbb) (get im rbb))))
          (unwrap-panic (if (and (is-eq (get re n) u0) (is-eq (get im n) u0))
            none
            (some
              (let ((ni (qm31/cm-inv (get re n) (get im n))))
                (let ((lo (qm31/cm-mul a0 a1 (get re ni) (get im ni)))
                      (hi (qm31/cm-mul b0 b1 (get re ni) (get im ni))))
                  { c0: (get re lo), c1: (get im lo),
                    c2: (qm31/m31-sub u0 (get re hi)), c3: (qm31/m31-sub u0 (get im hi)) }))))))))))
(define-read-only (qm31/qm31-eq (a { c0: uint, c1: uint, c2: uint, c3: uint })
                           (b { c0: uint, c1: uint, c2: uint, c3: uint }))
  (is-eq a b))
