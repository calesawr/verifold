;; verifold-flat.clar: GENERATED FILE. DO NOT EDIT.
;; One-contract emission of the 11-gear circle-STARK verifier.
;; Generator: tools/flatten.py v1.0 (separator '/')
;; Regenerate: python3 tools/flatten.py
;; Verify:     python3 tools/flatten_check.py
;; Inputs (sha256):
;;   10bb8933ae55925c929a16e57242dfbfee98c20bd1d82a7bf96be1f586b80fce  contracts/field.clar
;;   d1f1d51e831680fd8481d6a5d12ff5b5315a0dfdbd3b1e8f527c3e00bc179e34  contracts/qm31.clar
;;   244da0015dedfeb9f7cdd8634548562549a8cbb1687f36f08ea8d4d1ec1b23a2  contracts/cair.clar
;;   842c7c1348d576b7fb2267bd9e09a23b55021123ee4425e827248415b17faa66  contracts/cdeep.clar
;;   78c462c191b997d4027221fd9191bab1910ca5eb6fbeba97ff16d40d895bfec5  contracts/merkle.clar
;;   3026a073df4adc7ed590c0e1437d1dda15b7451e27e6785931de74003a3126c6  contracts/commit.clar
;;   72be4f5c0738034adc78b80686df76ce5b2a7f0cc66f7b56bec8118120781f38  contracts/fri.clar
;;   084ca5ba836c304a40d26458b2eee07bcbb761fd50b21531040503cba7c7ca38  contracts/query.clar
;;   77070c00254c1acc8546cc020f87c4bbe037a50768c192ee351c2883b1d726f4  contracts/transcript.clar
;;   abc7158b532d66b54e6a6d2afcc82882e2ecb37e6f3945bf28fbb15c893229ac  contracts/schedule.clar
;;   db5bdb90b5d790f5645400303c8fd55709ad22fd9b241f8c397ced9f8b576757  contracts/driver.clar
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
;; ========================= gear: cair (contracts/cair.clar) =========================
(define-constant cair/SX u32768)
(define-constant cair/SY u2147450879)
(define-constant cair/SEL_A u1569360727)
(define-constant cair/SEL_B u1569360727)
(define-constant cair/SEL_C u2147450879)
(define-constant cair/B01_A u1569360727)
(define-constant cair/B01_B u578122920)
(define-constant cair/B01_C u2147450879)
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
  (cair/qpi (cair/qpi zx)))
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
;; ========================= gear: cdeep (contracts/cdeep.clar) =========================
(define-constant cdeep/P u2147483647)
(define-constant cdeep/SX u32768)
(define-constant cdeep/SY u2147450879)
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
;; ========================= gear: merkle (contracts/merkle.clar) =========================
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
;; ========================= gear: commit (contracts/commit.clar) =========================
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
;; ========================= gear: fri (contracts/fri.clar) =========================
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
;; ========================= gear: query (contracts/query.clar) =========================
(define-constant query/P u2147483647)
(define-constant query/DOMAIN_SIZE u16)
(define-constant query/HALF u8)
(define-constant query/CM_POW_BOUND u8)
(define-constant query/CM_STEPS (list u0 u1 u2))
(define-constant query/OFF { re: u1179735656, im: u1241207368 })
(define-constant query/H   { re: u32768,      im: u2147450879 })
(define-constant query/BITREV4 (list u0 u8 u4 u12 u2 u10 u6 u14 u1 u9 u5 u13 u3 u11 u7 u15))
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
(define-read-only (query/bitrev (q uint))
  (unwrap-panic (element-at? query/BITREV4 q)))
(define-read-only (query/query-point (q uint))
  (query/domain-point (query/bitrev q)))
(define-read-only (query/query-x (q uint))
  (get re (query/query-point q)))
;; ========================= gear: transcript (contracts/transcript.clar) =========================
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
;; ========================= gear: schedule (contracts/schedule.clar) =========================
(define-constant schedule/N u4)
(define-constant schedule/L u3)
(define-constant schedule/DOMAIN_SIZE u16)
(define-constant schedule/POW_THRESHOLD u1329227995784915872903807060280344576)
(define-constant schedule/QUERY_COUNTER (list u0 u1 u2 u3))
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
;; ========================= gear: driver (contracts/driver.clar) =========================
(define-constant driver/DOMAIN_LABEL 0x76657269666f6c642d66732d7631)
(define-constant driver/VERSION 0x01)
(define-constant driver/PARAMS 0x040302080000000a)
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
(define-read-only (driver/verify-query
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
  (let ((pt (query/query-point q))
        (k1 (/ q u2)) (k2 (/ q u4)))
    (begin
      (driver/require! (and (is-eq (get c1 (get t-x prf)) u0)
                     (is-eq (get c2 (get t-x prf)) u0)
                     (is-eq (get c3 (get t-x prf)) u0)))
      (driver/require! (driver/bound-at-pos (get t-x prf) (get t-sibs prf) q u4 (get troot env)))
      (driver/require! (driver/bound-at-pos (get c-x prf) (get c-sibs prf) q u4 (get croot env)))
      (let ((p0 (cdeep/deep-row
                  (get t-x prf) (get c-x prf)
                  (get t-z env) (get t-gz env) (get t-g2z env)
                  (get c0-z env) (get c1-z env) (get c2-z env) (get c3-z env)
                  (get re pt) (get im pt)
                  (get zx env) (get zy env) (get gamma env))))
        (begin
          (driver/require! (driver/pair-bound p0 (get p0-sib prf) q (get p0-sibs prf) u3 (get fr0 env)))
          (let ((v1 (driver/fold-one p0 (get p0-sib prf) (driver/y-twiddle q) (get b0 env) q)))
            (begin
              (driver/require! (driver/pair-bound v1 (get l1-sib prf) k1 (get l1-sibs prf) u2 (get fr1 env)))
              (let ((v2 (driver/fold-one v1 (get l1-sib prf) (driver/line-x1 q) (get b1 env) k1)))
                (begin
                  (driver/require! (driver/pair-bound v2 (get l2-sib prf) k2 (get l2-sibs prf) u1 (get fr2 env)))
                  (let ((v3 (driver/fold-one v2 (get l2-sib prf) (driver/line-x2 q) (get b2 env) k2)))
                    (begin
                      (driver/require! (qm31/qm31-eq v3 (get final env)))
                      true)))))))))))
(define-private (driver/query-step
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
    (fri-roots (list 3 (buff 32)))
    (final { c0: uint, c1: uint, c2: uint, c3: uint })
    (nonce (buff 8))
    (queries (list 4 { t-x: { c0: uint, c1: uint, c2: uint, c3: uint }, t-sibs: (list 4 (buff 32)),
                       c-x: { c0: uint, c1: uint, c2: uint, c3: uint }, c-sibs: (list 4 (buff 32)),
                       p0-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, p0-sibs: (list 3 (buff 32)),
                       l1-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l1-sibs: (list 2 (buff 32)),
                       l2-sib: { c0: uint, c1: uint, c2: uint, c3: uint }, l2-sibs: (list 1 (buff 32)) })))
  (let ((params (schedule/get-params)))
    (begin
      (driver/require! (is-eq (len fri-roots) (get l params)))
      (driver/require! (is-eq (len queries) (get n params)))
      (let ((ch (schedule/derive-challenges (driver/make-ctx pub)
                  trace-root comp-root t-z t-gz t-g2z c0-z c1-z c2-z c3-z fri-roots final nonce)))
        (begin
          (driver/require! (get pow-ok ch))
          (driver/require! (is-eq (len (get betas ch)) (get l params)))
          (driver/require! (is-eq (len (get query-indices ch)) (get n params)))
          (let ((zp (cair/felt-to-point (get z ch))))
            (begin
              (driver/require! (cair/cair-compose-check
                          t-z t-gz t-g2z (get x zp) (get y zp) (get alpha ch)
                          c0-z c1-z c2-z c3-z))
              (begin
                (fold driver/query-step queries
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
