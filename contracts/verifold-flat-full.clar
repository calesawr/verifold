;; verifold-flat-full.clar: GENERATED FILE. DO NOT EDIT.
;; One-contract emission of the 11-gear circle-STARK verifier.
;; Generator: tools/flatten.py v1.0 (separator '/')
;; Regenerate: python3 tools/flatten.py --point full
;; Verify:     python3 tools/flatten_check.py --point full
;; Inputs (sha256):
;;   b2bce5f54585f5603e33860a1bcf0d303aa875173fbd7d8fe8450ac6cca0d37b  contracts/full/field.clar
;;   3f5cd53fff7daec502c5f3985821e63219b82fb3e8c84c5908a7b2998aa3ef8f  contracts/full/qm31.clar
;;   614343349d0dd4c943970b9af8cf6eca769e02001a81433cee18f09b4118373b  contracts/full/cair.clar
;;   11e59184e1ff493f85427fecf74309d924457c3c9ef13b1836776dd45015eb4c  contracts/full/cdeep.clar
;;   590ea6b06e1a44233aabd38849a1743a19c50b06ce6d76570fa1f6f357ba93a5  contracts/full/merkle.clar
;;   5cd241400e834154919102d526ff3dcd33a532800534896671beaa60e556bb15  contracts/full/commit.clar
;;   10ae1d54dd7755aba020ae2c9fe5943174c3725aac63859d8c4640822dd7456a  contracts/full/fri.clar
;;   c60a53f3da020028e62e1ea9cc06ff495a7796ad9ecdc1320666935bcf9313df  contracts/full/query.clar
;;   5ed0983ac8f4f151837b2950c3c6bbd7561c31278d953ef3be5b81a6a6c0fa45  contracts/full/transcript.clar
;;   88eb24c5d19f3b6b27c4579028e10f2705a7bbd706fbccdac4e8cde046d03169  contracts/full/schedule.clar
;;   9a81b403035bdda8e869493bec3f9d8d57a6ae91351dca6476eae4f2187ffabf  contracts/full/driver.clar
;; ========================= gear: field (contracts/full/field.clar) =========================
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
;; ========================= gear: qm31 (contracts/full/qm31.clar) =========================
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
;; ========================= gear: cair (contracts/full/cair.clar) =========================
(define-constant cair/SX u1420207432)
(define-constant cair/SY u2023238517)
(define-constant cair/SEL_A u1934003464)
(define-constant cair/SEL_B u1216253441)
(define-constant cair/SEL_C u2023238517)
(define-constant cair/B01_A u1934003464)
(define-constant cair/B01_B u931230206)
(define-constant cair/B01_C u2023238517)
(define-constant cair/Q_I  { c0: u0, c1: u1, c2: u0, c3: u0 })
(define-constant cair/Q_U  { c0: u0, c1: u0, c2: u1, c3: u0 })
(define-constant cair/Q_IU { c0: u0, c1: u0, c2: u0, c3: u1 })
(define-read-only (cair/felt-to-point (t { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((one (qm31/qm31-from-m31 u1))
        (tsq (qm31/qm31-mul t t)))
    (let ((dinv (qm31/qm31-inv (qm31/qm31-add one tsq))))
      { x: (qm31/qm31-mul (qm31/qm31-sub one tsq) dinv),
        y: (qm31/qm31-mul (qm31/qm31-add t t) dinv) })))
(define-read-only (cair/point-add-base
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (bx uint) (by uint))
  { x: (qm31/qm31-sub
         (qm31/qm31-mul-m31 zx bx)
         (qm31/qm31-mul-m31 zy by)),
    y: (qm31/qm31-add
         (qm31/qm31-mul-m31 zx by)
         (qm31/qm31-mul-m31 zy bx)) })
(define-read-only (cair/mask-point
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (k uint))
  (unwrap-panic
    (if (is-eq k u0) (some { x: zx, y: zy })
    (if (is-eq k u1) (some (cair/point-add-base zx zy cair/SX cair/SY))
    (if (is-eq k u2) (some (let ((p1 (cair/point-add-base zx zy cair/SX cair/SY)))
                             (cair/point-add-base (get x p1) (get y p1) cair/SX cair/SY)))
        none)))))
(define-read-only (cair/qpi (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((vv (qm31/qm31-mul v v)))
    (qm31/qm31-sub
      (qm31/qm31-add vv vv)
      (qm31/qm31-from-m31 u1))))
(define-read-only (cair/coset-vanish (zx { c0: uint, c1: uint, c2: uint, c3: uint }))
  (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi (cair/qpi zx)))))))))))))
(define-read-only (cair/line-sel
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qm31/qm31-add
    (qm31/qm31-add
      (qm31/qm31-mul-m31 zx cair/SEL_A)
      (qm31/qm31-mul-m31 zy cair/SEL_B))
    (qm31/qm31-from-m31 cair/SEL_C)))
(define-read-only (cair/line-b01
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qm31/qm31-add
    (qm31/qm31-add
      (qm31/qm31-mul-m31 zx cair/B01_A)
      (qm31/qm31-mul-m31 zy cair/B01_B))
    (qm31/qm31-from-m31 cair/B01_C)))
(define-read-only (cair/eval-transition
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qm31/qm31-sub (qm31/qm31-sub t-g2z t-gz) t-z))
(define-read-only (cair/cair-quotients
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  { q-trans: (qm31/qm31-mul
               (qm31/qm31-mul (cair/eval-transition t-z t-gz t-g2z) (cair/line-sel zx zy))
               (qm31/qm31-inv (cair/coset-vanish zx))),
    q-b: (qm31/qm31-mul
           (qm31/qm31-sub t-z (qm31/qm31-from-m31 u1))
           (qm31/qm31-inv (cair/line-b01 zx zy))) })
(define-read-only (cair/cair-compose
    (t-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-gz { c0: uint, c1: uint, c2: uint, c3: uint })
    (t-g2z { c0: uint, c1: uint, c2: uint, c3: uint })
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (alpha { c0: uint, c1: uint, c2: uint, c3: uint }))
  (let ((q (cair/cair-quotients t-z t-gz t-g2z zx zy)))
    (qm31/qm31-add (get q-trans q)
      (qm31/qm31-mul alpha (get q-b q)))))
(define-read-only (cair/recomb
    (c0-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c1-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c2-z { c0: uint, c1: uint, c2: uint, c3: uint })
    (c3-z { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qm31/qm31-add
    (qm31/qm31-add c0-z (qm31/qm31-mul cair/Q_I c1-z))
    (qm31/qm31-add
      (qm31/qm31-mul cair/Q_U c2-z)
      (qm31/qm31-mul cair/Q_IU c3-z))))
(define-read-only (cair/cair-compose-check
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
  (qm31/qm31-eq
    (cair/cair-compose t-z t-gz t-g2z zx zy alpha)
    (cair/recomb c0-z c1-z c2-z c3-z)))
;; ========================= gear: cdeep (contracts/full/cdeep.clar) =========================
(define-constant cdeep/P u2147483647)
(define-constant cdeep/SX u1420207432)
(define-constant cdeep/SY u2023238517)
(define-read-only (cdeep/conj-u (a { c0: uint, c1: uint, c2: uint, c3: uint }))
  { c0: (get c0 a), c1: (get c1 a),
    c2: (mod (- (+ u0 cdeep/P) (get c2 a)) cdeep/P), c3: (mod (- (+ u0 cdeep/P) (get c3 a)) cdeep/P) })
(define-read-only (cdeep/line-coeffs
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (w { c0: uint, c1: uint, c2: uint, c3: uint }))
  (begin
    (unwrap-panic (if (and (is-eq (get c2 zy) u0) (is-eq (get c3 zy) u0)) none (some true)))
    (let ((araw (qm31/qm31-sub (cdeep/conj-u v) v))
          (craw (qm31/qm31-sub (cdeep/conj-u zy) zy)))
      { a: (qm31/qm31-mul w araw),
        b: (qm31/qm31-mul w
             (qm31/qm31-sub
               (qm31/qm31-mul v craw)
               (qm31/qm31-mul araw zy))),
        c: (qm31/qm31-mul w craw) })))
(define-read-only (cdeep/denom-inv
    (zx { c0: uint, c1: uint, c2: uint, c3: uint })
    (zy { c0: uint, c1: uint, c2: uint, c3: uint })
    (px uint) (py uint))
  (let ((t1 (qm31/cm-mul
              (mod (- (+ (get c0 zx) cdeep/P) px) cdeep/P) (get c1 zx)
              (get c2 zy) (get c3 zy)))
        (t2 (qm31/cm-mul
              (mod (- (+ (get c0 zy) cdeep/P) py) cdeep/P) (get c1 zy)
              (get c2 zx) (get c3 zx))))
    (qm31/qm31-inv
      { c0: (mod (- (+ (get re t1) cdeep/P) (get re t2)) cdeep/P),
        c1: (mod (- (+ (get im t1) cdeep/P) (get im t2)) cdeep/P),
        c2: u0, c3: u0 })))
(define-read-only (cdeep/quot-term
    (f { c0: uint, c1: uint, c2: uint, c3: uint })
    (py uint)
    (lc { a: { c0: uint, c1: uint, c2: uint, c3: uint },
          b: { c0: uint, c1: uint, c2: uint, c3: uint },
          c: { c0: uint, c1: uint, c2: uint, c3: uint } }))
  (qm31/qm31-sub
    (qm31/qm31-mul (get c lc) f)
    (qm31/qm31-add
      (qm31/qm31-mul-m31 (get a lc) py)
      (get b lc))))
(define-private (cdeep/rot-s (zx { c0: uint, c1: uint, c2: uint, c3: uint })
                       (zy { c0: uint, c1: uint, c2: uint, c3: uint }))
  { x: (qm31/qm31-sub
         (qm31/qm31-mul-m31 zx cdeep/SX)
         (qm31/qm31-mul-m31 zy cdeep/SY)),
    y: (qm31/qm31-add
         (qm31/qm31-mul-m31 zx cdeep/SY)
         (qm31/qm31-mul-m31 zy cdeep/SX)) })
(define-private (cdeep/limb (v uint)) { c0: v, c1: u0, c2: u0, c3: u0 })
(define-read-only (cdeep/deep-row
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
  (let ((g2 (qm31/qm31-mul gamma gamma)))
  (let ((g3 (qm31/qm31-mul g2 gamma)))
  (let ((g4 (qm31/qm31-mul g3 gamma)))
  (let ((g5 (qm31/qm31-mul g4 gamma)))
  (let ((g6 (qm31/qm31-mul g5 gamma))
        (z1 (cdeep/rot-s zx zy)))
  (let ((z2 (cdeep/rot-s (get x z1) (get y z1)))
        (one { c0: u1, c1: u0, c2: u0, c3: u0 }))
    (let ((num0 (qm31/qm31-add
                  (cdeep/quot-term t-x py (cdeep/line-coeffs zy t-z one))
                  (qm31/qm31-add
                    (qm31/qm31-add
                      (cdeep/quot-term (cdeep/limb (get c0 c-x)) py (cdeep/line-coeffs zy c0-z g3))
                      (cdeep/quot-term (cdeep/limb (get c1 c-x)) py (cdeep/line-coeffs zy c1-z g4)))
                    (qm31/qm31-add
                      (cdeep/quot-term (cdeep/limb (get c2 c-x)) py (cdeep/line-coeffs zy c2-z g5))
                      (cdeep/quot-term (cdeep/limb (get c3 c-x)) py (cdeep/line-coeffs zy c3-z g6))))))
          (num1 (cdeep/quot-term t-x py (cdeep/line-coeffs (get y z1) t-gz gamma)))
          (num2 (cdeep/quot-term t-x py (cdeep/line-coeffs (get y z2) t-g2z g2))))
      (qm31/qm31-add
        (qm31/qm31-add
          (qm31/qm31-mul num0 (cdeep/denom-inv zx zy px py))
          (qm31/qm31-mul num1 (cdeep/denom-inv (get x z1) (get y z1) px py)))
        (qm31/qm31-mul num2 (cdeep/denom-inv (get x z2) (get y z2) px py)))))))))))
;; ========================= gear: merkle (contracts/full/merkle.clar) =========================
(define-private (merkle/merkle-step
    (step { sibling: (buff 32), node-is-right: bool })
    (acc (buff 32)))
  (if (get node-is-right step)
      (sha256 (concat (get sibling step) acc))
      (sha256 (concat acc (get sibling step)))))
(define-read-only (merkle/merkle-root
    (leaf (buff 32))
    (path (list 32 { sibling: (buff 32), node-is-right: bool })))
  (fold merkle/merkle-step path leaf))
(define-read-only (merkle/merkle-verify
    (leaf (buff 32))
    (path (list 32 { sibling: (buff 32), node-is-right: bool }))
    (root (buff 32)))
  (is-eq (merkle/merkle-root leaf path) root))
;; ========================= gear: commit (contracts/full/commit.clar) =========================
(define-constant commit/P u2147483647)
(define-private (commit/m31-to-be4 (v uint))
  (unwrap-panic (if (< v commit/P)
    (as-max-len? (unwrap-panic (slice? (unwrap-panic (to-consensus-buff? v)) u13 u17)) u4)
    none)))
(define-read-only (commit/qm31-enc16 (q { c0: uint, c1: uint, c2: uint, c3: uint }))
  (concat (commit/m31-to-be4 (get c0 q))
  (concat (commit/m31-to-be4 (get c1 q))
  (concat (commit/m31-to-be4 (get c2 q)) (commit/m31-to-be4 (get c3 q))))))
(define-read-only (commit/qm31-leaf (q { c0: uint, c1: uint, c2: uint, c3: uint }))
  (sha256 (commit/qm31-enc16 q)))
(define-read-only (commit/opening-bound
    (q { c0: uint, c1: uint, c2: uint, c3: uint })
    (path (list 32 { sibling: (buff 32), node-is-right: bool }))
    (root (buff 32)))
  (merkle/merkle-verify (commit/qm31-leaf q) path root))
;; ========================= gear: fri (contracts/full/fri.clar) =========================
(define-read-only (fri/pi-x (x uint))
  (field/m31-sub
    (field/m31-mul u2 (field/m31-mul x x))
    u1))
(define-read-only (fri/fri-fold-step
    (a { c0: uint, c1: uint, c2: uint, c3: uint })
    (b { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint }))
  (unwrap-panic (if (is-eq x u0)
    none
    (some
      (let ((f0 (qm31/qm31-add a b))
            (f1 (qm31/qm31-mul-m31
                  (qm31/qm31-sub a b)
                  (field/m31-inv x))))
        (qm31/qm31-add f0 (qm31/qm31-mul beta f1)))))))
(define-read-only (fri/fri-fold-check
    (a { c0: uint, c1: uint, c2: uint, c3: uint })
    (b { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (claimed { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qm31/qm31-eq (fri/fri-fold-step a b x beta) claimed))
(define-private (fri/fold-layer-step
    (lyr { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
           beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })
    (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (if (get v-is-right lyr)
      (fri/fri-fold-step (get sibling lyr) v (get x lyr) (get beta lyr))
      (fri/fri-fold-step v (get sibling lyr) (get x lyr) (get beta lyr))))
(define-read-only (fri/fri-fold-down
    (v0 { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })))
  (fold fri/fold-layer-step layers v0))
(define-read-only (fri/fri-final-ok
    (v0 { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool }))
    (final { c0: uint, c1: uint, c2: uint, c3: uint }))
  (qm31/qm31-eq (fri/fri-fold-down v0 layers) final))
(define-read-only (fri/fri-fold-step-hint
    (a { c0: uint, c1: uint, c2: uint, c3: uint })
    (b { c0: uint, c1: uint, c2: uint, c3: uint })
    (x uint)
    (hint uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint }))
  (begin
    (unwrap-panic (if (is-eq (field/m31-mul x hint) u1) (some true) none))
    (let ((f0 (qm31/qm31-add a b))
          (f1 (qm31/qm31-mul-m31 (qm31/qm31-sub a b) hint)))
      (qm31/qm31-add f0 (qm31/qm31-mul beta f1)))))
(define-private (fri/fold-layer-step-hint
    (lyr { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint, hint: uint,
           beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })
    (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (if (get v-is-right lyr)
      (fri/fri-fold-step-hint (get sibling lyr) v (get x lyr) (get hint lyr) (get beta lyr))
      (fri/fri-fold-step-hint v (get sibling lyr) (get x lyr) (get hint lyr) (get beta lyr))))
(define-read-only (fri/fri-fold-down-hint
    (v0 { c0: uint, c1: uint, c2: uint, c3: uint })
    (layers (list 32 { sibling: { c0: uint, c1: uint, c2: uint, c3: uint }, x: uint, hint: uint,
                       beta: { c0: uint, c1: uint, c2: uint, c3: uint }, v-is-right: bool })))
  (fold fri/fold-layer-step-hint layers v0))
;; ========================= gear: query (contracts/full/query.clar) =========================
(define-constant query/P u2147483647)
(define-constant query/DOMAIN_SIZE u131072)
(define-constant query/HALF u65536)
(define-constant query/CM_POW_BOUND u65536)
(define-constant query/CM_STEPS (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15))
(define-constant query/OFF { re: u1799120754, im: u343598868 })
(define-constant query/H   { re: u1389168750, im: u838891026 })
(define-private (query/cm (a { re: uint, im: uint }) (b { re: uint, im: uint }))
  (qm31/cm-mul (get re a) (get im a) (get re b) (get im b)))
(define-private (query/cm-pow-step (i uint) (st { r: { re: uint, im: uint }, b: { re: uint, im: uint }, e: uint }))
  (let ((r (get r st)) (b (get b st)) (e (get e st)))
    { r: (if (is-eq (mod e u2) u1) (query/cm r b) r),
      b: (query/cm b b),
      e: (/ e u2) }))
(define-private (query/cm-pow (base { re: uint, im: uint }) (exp uint))
  (unwrap-panic (if (< exp query/CM_POW_BOUND)
    (some (get r (fold query/cm-pow-step query/CM_STEPS { r: { re: u1, im: u0 }, b: base, e: exp })))
    none)))
(define-private (query/conj (pt { re: uint, im: uint }))
  { re: (get re pt), im: (mod (- query/P (get im pt)) query/P) })
(define-read-only (query/domain-point (i uint))
  (unwrap-panic (if (< i query/DOMAIN_SIZE)
    (some (let ((base (query/cm query/OFF (query/cm-pow query/H (if (< i query/HALF) i (- i query/HALF))))))
            (if (< i query/HALF) base (query/conj base))))
    none)))
(define-read-only (query/domain-x (i uint))
  (get re (query/domain-point i)))
(define-private (query/bitrev-step (i uint) (st { q: uint, r: uint }))
  { q: (/ (get q st) u2),
    r: (+ (* (get r st) u2) (mod (get q st) u2)) })
(define-read-only (query/bitrev (q uint))
  (begin
    (unwrap-panic (if (< q query/DOMAIN_SIZE) (some true) none))
    (get r (fold query/bitrev-step (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16) { q: q, r: u0 }))))
(define-read-only (query/query-point (q uint))
  (query/domain-point (query/bitrev q)))
(define-read-only (query/query-x (q uint))
  (get re (query/query-point q)))
;; ========================= gear: transcript (contracts/full/transcript.clar) =========================
(define-constant transcript/P u2147483647)
(define-constant transcript/OP_ABSORB 0x00)
(define-constant transcript/OP_SQUEEZE 0x01)
(define-constant transcript/OP_POW 0x02)
(define-constant transcript/T_ROOT 0x01)
(define-constant transcript/T_QM31 0x03)
(define-constant transcript/T_NONCE 0x05)
(define-read-only (transcript/transcript-init (ctx (buff 1024)))
  (sha256 ctx))
(define-private (transcript/absorb (state (buff 32)) (type-tag (buff 1)) (msg (buff 64)))
  (sha256 (concat state (concat transcript/OP_ABSORB (concat type-tag msg)))))
(define-read-only (transcript/absorb-root (state (buff 32)) (root (buff 32)))
  (transcript/absorb state transcript/T_ROOT root))
(define-read-only (transcript/absorb-qm31 (state (buff 32)) (q (buff 16)))
  (transcript/absorb state transcript/T_QM31 q))
(define-read-only (transcript/absorb-nonce (state (buff 32)) (nonce (buff 8)))
  (transcript/absorb state transcript/T_NONCE nonce))
(define-private (transcript/absorb-root-step (root (buff 32)) (state (buff 32)))
  (transcript/absorb-root state root))
(define-read-only (transcript/absorb-roots (state (buff 32)) (roots (list 32 (buff 32))))
  (fold transcript/absorb-root-step roots state))
(define-private (transcript/read-u128-be (h (buff 32)))
  (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? h u0 u16)) u16))))
(define-read-only (transcript/squeeze-m31 (state (buff 32)))
  (let ((blk (sha256 (concat state transcript/OP_SQUEEZE))))
    { v: (mod (transcript/read-u128-be blk) transcript/P), state: blk }))
(define-read-only (transcript/squeeze-qm31 (state (buff 32)))
  (let ((r0 (transcript/squeeze-m31 state)))
  (let ((r1 (transcript/squeeze-m31 (get state r0))))
  (let ((r2 (transcript/squeeze-m31 (get state r1))))
  (let ((r3 (transcript/squeeze-m31 (get state r2))))
    { c0: (get v r0), c1: (get v r1), c2: (get v r2), c3: (get v r3),
      state: (get state r3) })))))
(define-read-only (transcript/pow-ok (state (buff 32)) (nonce (buff 8)) (threshold uint))
  (< (transcript/read-u128-be (sha256 (concat state (concat transcript/OP_POW nonce)))) threshold))
;; ========================= gear: schedule (contracts/full/schedule.clar) =========================
(define-constant schedule/N u23)
(define-constant schedule/L u16)
(define-constant schedule/DOMAIN_SIZE u131072)
(define-constant schedule/POW_THRESHOLD u1329227995784915872903807060280344576)
(define-constant schedule/QUERY_COUNTER (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20 u21 u22))
(define-private (schedule/fri-beta-step
    (root (buff 32))
    (acc { state: (buff 32), betas: (list 32 { c0: uint, c1: uint, c2: uint, c3: uint }) }))
  (let ((b (transcript/squeeze-qm31 (transcript/absorb-root (get state acc) root))))
    { state: (get state b),
      betas: (unwrap-panic (as-max-len? (append (get betas acc)
                { c0: (get c0 b), c1: (get c1 b), c2: (get c2 b), c3: (get c3 b) }) u32)) }))
(define-private (schedule/query-idx-step
    (i uint)
    (acc { state: (buff 32), idx: (list 32 uint) }))
  (let ((r (transcript/squeeze-m31 (get state acc))))
    { state: (get state r),
      idx: (unwrap-panic (as-max-len? (append (get idx acc) (mod (get v r) schedule/DOMAIN_SIZE)) u32)) }))
(define-read-only (schedule/derive-challenges
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
  (let ((a (transcript/squeeze-qm31
             (transcript/absorb-root (transcript/transcript-init ctx) trace-root))))
  (let ((z (transcript/squeeze-qm31
             (transcript/absorb-root (get state a) comp-root))))
  (let ((s-open (transcript/absorb-qm31
                  (transcript/absorb-qm31
                    (transcript/absorb-qm31
                      (transcript/absorb-qm31
                        (transcript/absorb-qm31
                          (transcript/absorb-qm31
                            (transcript/absorb-qm31 (get state z) (commit/qm31-enc16 t-z))
                            (commit/qm31-enc16 t-gz))
                          (commit/qm31-enc16 t-g2z))
                        (commit/qm31-enc16 c0-z))
                      (commit/qm31-enc16 c1-z))
                    (commit/qm31-enc16 c2-z))
                  (commit/qm31-enc16 c3-z))))
  (let ((g (transcript/squeeze-qm31 s-open)))
  (let ((fr (fold schedule/fri-beta-step fri-roots { state: (get state g), betas: (list) })))
  (let ((s-fin (transcript/absorb-qm31 (get state fr) (commit/qm31-enc16 final))))
  (let ((pass (transcript/pow-ok s-fin nonce schedule/POW_THRESHOLD)))
  (let ((s-n (transcript/absorb-nonce s-fin nonce)))
  (let ((qr (fold schedule/query-idx-step schedule/QUERY_COUNTER { state: s-n, idx: (list) })))
    { alpha: { c0: (get c0 a), c1: (get c1 a), c2: (get c2 a), c3: (get c3 a) },
      z: { c0: (get c0 z), c1: (get c1 z), c2: (get c2 z), c3: (get c3 z) },
      gamma: { c0: (get c0 g), c1: (get c1 g), c2: (get c2 g), c3: (get c3 g) },
      betas: (get betas fr),
      query-indices: (get idx qr),
      pow-ok: pass }))))))))))
(define-read-only (schedule/get-params)
  { n: schedule/N, l: schedule/L, domain-size: schedule/DOMAIN_SIZE })
;; ========================= gear: driver (contracts/full/driver.clar) =========================
(define-constant driver/DOMAIN_LABEL 0x76657269666f6c642d66732d7631)
(define-constant driver/VERSION 0x02)
(define-constant driver/PARAMS 0x171010080000000b)
(define-private (driver/require! (pass bool))
  (unwrap-panic (if pass (some true) none)))
(define-private (driver/even-of (m uint))
  (- m (mod m u2)))
(define-private (driver/qleaf (v { c0: uint, c1: uint, c2: uint, c3: uint }))
  (commit/qm31-leaf v))
(define-private (driver/path-step
    (sib (buff 32))
    (st { path: (list 4 { sibling: (buff 32), node-is-right: bool }), pos: uint }))
  { path: (unwrap-panic (as-max-len? (append (get path st)
            { sibling: sib, node-is-right: (is-eq (mod (get pos st) u2) u1) }) u4)),
    pos: (/ (get pos st) u2) })
(define-read-only (driver/path-from-pos (sibs (list 4 (buff 32))) (pos uint))
  (get path (fold driver/path-step sibs { path: (list), pos: pos })))
(define-read-only (driver/bound-at-pos
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sibs (list 4 (buff 32)))
    (pos uint)
    (depth uint)
    (root (buff 32)))
  (begin
    (driver/require! (is-eq (len sibs) depth))
    (merkle/merkle-verify (driver/qleaf v) (driver/path-from-pos sibs pos) root)))
(define-read-only (driver/pair-bound
    (self { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint)
    (parent-sibs (list 3 (buff 32)))
    (parent-depth uint)
    (root (buff 32)))
  (begin
    (driver/require! (is-eq (len parent-sibs) parent-depth))
    (merkle/merkle-verify
      (merkle/merkle-root (driver/qleaf self)
        (list { sibling: (driver/qleaf sib), node-is-right: (is-eq (mod pos u2) u1) }))
      (driver/path-from-pos parent-sibs (/ pos u2))
      root)))
(define-read-only (driver/fold-one
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (t uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint))
  (fri/fri-fold-down v
    (list { sibling: sib, x: t, beta: beta, v-is-right: (is-eq (mod pos u2) u1) })))
(define-read-only (driver/y-twiddle (q uint))
  (get im (query/query-point (driver/even-of q))))
(define-read-only (driver/line-x1 (q uint))
  (query/query-x (* u2 (driver/even-of (/ q u2)))))
(define-read-only (driver/line-x2 (q uint))
  (fri/pi-x (query/query-x (* u4 (driver/even-of (/ q u4))))))
(define-read-only (driver/make-ctx (pub (buff 256)))
  (concat driver/DOMAIN_LABEL (concat driver/VERSION (concat driver/PARAMS (sha256 pub)))))
(define-read-only (driver/fold-one-hint
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (t uint)
    (h uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint))
  (fri/fri-fold-down-hint v
    (list { sibling: sib, x: t, hint: h, beta: beta, v-is-right: (is-eq (mod pos u2) u1) })))
(define-private (driver/path-step-full
    (sib (buff 32))
    (st { path: (list 17 { sibling: (buff 32), node-is-right: bool }), pos: uint }))
  { path: (unwrap-panic (as-max-len? (append (get path st)
            { sibling: sib, node-is-right: (is-eq (mod (get pos st) u2) u1) }) u17)),
    pos: (/ (get pos st) u2) })
(define-read-only (driver/path-from-pos-full (sibs (list 17 (buff 32))) (pos uint))
  (get path (fold driver/path-step-full sibs { path: (list), pos: pos })))
(define-read-only (driver/bound-at-pos-full
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sibs (list 17 (buff 32)))
    (pos uint)
    (depth uint)
    (root (buff 32)))
  (begin
    (driver/require! (is-eq (len sibs) depth))
    (merkle/merkle-verify (driver/qleaf v) (driver/path-from-pos-full sibs pos) root)))
(define-read-only (driver/pair-bound-full
    (self { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint)
    (parent-sibs (list 16 (buff 32)))
    (parent-depth uint)
    (root (buff 32)))
  (begin
    (driver/require! (is-eq (len parent-sibs) parent-depth))
    (merkle/merkle-verify
      (merkle/merkle-root (driver/qleaf self)
        (list { sibling: (driver/qleaf sib), node-is-right: (is-eq (mod pos u2) u1) }))
      (driver/path-from-pos-full parent-sibs (/ pos u2))
      root)))
(define-read-only (driver/line-x3 (q uint))
  (fri/pi-x (fri/pi-x (query/query-x (* u8 (driver/even-of (/ q u8)))))))
(define-read-only (driver/line-x4 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u16 (driver/even-of (/ q u16))))))))
(define-read-only (driver/line-x5 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u32 (driver/even-of (/ q u32)))))))))
(define-read-only (driver/line-x6 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u64 (driver/even-of (/ q u64))))))))))
(define-read-only (driver/line-x7 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u128 (driver/even-of (/ q u128)))))))))))
(define-read-only (driver/line-x8 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u256 (driver/even-of (/ q u256))))))))))))
(define-read-only (driver/line-x9 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u512 (driver/even-of (/ q u512)))))))))))))
(define-read-only (driver/line-x10 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u1024 (driver/even-of (/ q u1024))))))))))))))
(define-read-only (driver/line-x11 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u2048 (driver/even-of (/ q u2048)))))))))))))))
(define-read-only (driver/line-x12 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u4096 (driver/even-of (/ q u4096))))))))))))))))
(define-read-only (driver/line-x13 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u8192 (driver/even-of (/ q u8192)))))))))))))))))
(define-read-only (driver/line-x14 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u16384 (driver/even-of (/ q u16384))))))))))))))))))
(define-read-only (driver/line-x15 (q uint))
  (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (fri/pi-x (query/query-x (* u32768 (driver/even-of (/ q u32768)))))))))))))))))))
(define-read-only (driver/verify-query
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
  (let ((pt (query/query-point q))
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
        (g-base (driver/require! (and (is-eq (get c1 (get t-x prf)) u0) (is-eq (get c2 (get t-x prf)) u0) (is-eq (get c3 (get t-x prf)) u0))))
        (g-t (driver/require! (driver/bound-at-pos-full (get t-x prf) (get t-sibs prf) q u17 (get troot env))))
        (g-c (driver/require! (driver/bound-at-pos-full (get c-x prf) (get c-sibs prf) q u17 (get croot env))))
        (p0 (cdeep/deep-row (get t-x prf) (get c-x prf) (get t-z env) (get t-gz env) (get t-g2z env) (get c0-z env) (get c1-z env) (get c2-z env) (get c3-z env) (get re pt) (get im pt) (get zx env) (get zy env) (get gamma env)))
        (g-p0 (driver/require! (driver/pair-bound-full p0 (get p0-sib prf) q (get p0-sibs prf) u16 (get fr0 env))))
        (v1 (driver/fold-one-hint p0 (get p0-sib prf) (driver/y-twiddle q) (unwrap-panic (element-at? (get hints prf) u0)) (get b0 env) q))
        (g-l1 (driver/require! (driver/pair-bound-full v1 (get l1-sib prf) k1 (get l1-sibs prf) u15 (get fr1 env))))
        (v2 (driver/fold-one-hint v1 (get l1-sib prf) (driver/line-x1 q) (unwrap-panic (element-at? (get hints prf) u1)) (get b1 env) k1))
        (g-l2 (driver/require! (driver/pair-bound-full v2 (get l2-sib prf) k2 (get l2-sibs prf) u14 (get fr2 env))))
        (v3 (driver/fold-one-hint v2 (get l2-sib prf) (driver/line-x2 q) (unwrap-panic (element-at? (get hints prf) u2)) (get b2 env) k2))
        (g-l3 (driver/require! (driver/pair-bound-full v3 (get l3-sib prf) k3 (get l3-sibs prf) u13 (get fr3 env))))
        (v4 (driver/fold-one-hint v3 (get l3-sib prf) (driver/line-x3 q) (unwrap-panic (element-at? (get hints prf) u3)) (get b3 env) k3))
        (g-l4 (driver/require! (driver/pair-bound-full v4 (get l4-sib prf) k4 (get l4-sibs prf) u12 (get fr4 env))))
        (v5 (driver/fold-one-hint v4 (get l4-sib prf) (driver/line-x4 q) (unwrap-panic (element-at? (get hints prf) u4)) (get b4 env) k4))
        (g-l5 (driver/require! (driver/pair-bound-full v5 (get l5-sib prf) k5 (get l5-sibs prf) u11 (get fr5 env))))
        (v6 (driver/fold-one-hint v5 (get l5-sib prf) (driver/line-x5 q) (unwrap-panic (element-at? (get hints prf) u5)) (get b5 env) k5))
        (g-l6 (driver/require! (driver/pair-bound-full v6 (get l6-sib prf) k6 (get l6-sibs prf) u10 (get fr6 env))))
        (v7 (driver/fold-one-hint v6 (get l6-sib prf) (driver/line-x6 q) (unwrap-panic (element-at? (get hints prf) u6)) (get b6 env) k6))
        (g-l7 (driver/require! (driver/pair-bound-full v7 (get l7-sib prf) k7 (get l7-sibs prf) u9 (get fr7 env))))
        (v8 (driver/fold-one-hint v7 (get l7-sib prf) (driver/line-x7 q) (unwrap-panic (element-at? (get hints prf) u7)) (get b7 env) k7))
        (g-l8 (driver/require! (driver/pair-bound-full v8 (get l8-sib prf) k8 (get l8-sibs prf) u8 (get fr8 env))))
        (v9 (driver/fold-one-hint v8 (get l8-sib prf) (driver/line-x8 q) (unwrap-panic (element-at? (get hints prf) u8)) (get b8 env) k8))
        (g-l9 (driver/require! (driver/pair-bound-full v9 (get l9-sib prf) k9 (get l9-sibs prf) u7 (get fr9 env))))
        (v10 (driver/fold-one-hint v9 (get l9-sib prf) (driver/line-x9 q) (unwrap-panic (element-at? (get hints prf) u9)) (get b9 env) k9))
        (g-l10 (driver/require! (driver/pair-bound-full v10 (get l10-sib prf) k10 (get l10-sibs prf) u6 (get fr10 env))))
        (v11 (driver/fold-one-hint v10 (get l10-sib prf) (driver/line-x10 q) (unwrap-panic (element-at? (get hints prf) u10)) (get b10 env) k10))
        (g-l11 (driver/require! (driver/pair-bound-full v11 (get l11-sib prf) k11 (get l11-sibs prf) u5 (get fr11 env))))
        (v12 (driver/fold-one-hint v11 (get l11-sib prf) (driver/line-x11 q) (unwrap-panic (element-at? (get hints prf) u11)) (get b11 env) k11))
        (g-l12 (driver/require! (driver/pair-bound-full v12 (get l12-sib prf) k12 (get l12-sibs prf) u4 (get fr12 env))))
        (v13 (driver/fold-one-hint v12 (get l12-sib prf) (driver/line-x12 q) (unwrap-panic (element-at? (get hints prf) u12)) (get b12 env) k12))
        (g-l13 (driver/require! (driver/pair-bound-full v13 (get l13-sib prf) k13 (get l13-sibs prf) u3 (get fr13 env))))
        (v14 (driver/fold-one-hint v13 (get l13-sib prf) (driver/line-x13 q) (unwrap-panic (element-at? (get hints prf) u13)) (get b13 env) k13))
        (g-l14 (driver/require! (driver/pair-bound-full v14 (get l14-sib prf) k14 (get l14-sibs prf) u2 (get fr14 env))))
        (v15 (driver/fold-one-hint v14 (get l14-sib prf) (driver/line-x14 q) (unwrap-panic (element-at? (get hints prf) u14)) (get b14 env) k14))
        (g-l15 (driver/require! (driver/pair-bound-full v15 (get l15-sib prf) k15 (get l15-sibs prf) u1 (get fr15 env))))
        (v16 (driver/fold-one-hint v15 (get l15-sib prf) (driver/line-x15 q) (unwrap-panic (element-at? (get hints prf) u15)) (get b15 env) k15))
        (g-fin (driver/require! (qm31/qm31-eq v16 (get final env)))))
    true))
(define-private (driver/query-step
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
    (driver/require! (driver/verify-query (unwrap-panic (element-at? (get idx st) (get k st))) prf (get env st)))
    { k: (+ (get k st) u1), idx: (get idx st), env: (get env st) }))
(define-read-only (driver/verify
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
  (let ((params (schedule/get-params))
        (g-lr (driver/require! (is-eq (len fri-roots) (get l params))))
        (g-nq (driver/require! (is-eq (len queries) (get n params))))
        (ch (schedule/derive-challenges (driver/make-ctx pub)
             trace-root comp-root t-z t-gz t-g2z c0-z c1-z c2-z c3-z fri-roots final nonce))
        (g-pow (driver/require! (get pow-ok ch)))
        (g-bl (driver/require! (is-eq (len (get betas ch)) (get l params))))
        (g-ql (driver/require! (is-eq (len (get query-indices ch)) (get n params))))
        (zp (cair/felt-to-point (get z ch)))
        (g-ood (driver/require! (cair/cair-compose-check
                 t-z t-gz t-g2z (get x zp) (get y zp) (get alpha ch)
                 c0-z c1-z c2-z c3-z)))
        (done (fold driver/query-step queries
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
