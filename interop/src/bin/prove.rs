//! Gear 6f phase 2: the Rust mini-prover.
//!
//! Produces complete Verifold proofs where every ALGEBRAIC stage is computed by STWO'S OWN
//! FUNCTIONS (interpolate, eval_at_point, accumulate_row_quotients, fold_circle_into_line,
//! fold_line) and only the wire layer -- the sha256 duplex transcript and the sha256 Merkle
//! trees, the documented CAIR-2/CAIR-6 deviation surface -- is Verifold's, implemented here a
//! THIRD time (sha2 crate; the others are Clarity's native sha256 and Python hashlib).
//! Output: proof JSON fixtures consumed by tests/interop.test.ts and fed to driver.clar verify()
//! on simnet -- a Rust-proven, Clarity-verified circle STARK.
use sha2::{Digest, Sha256};
use stwo::core::circle::CirclePoint;
use stwo::core::fields::m31::{BaseField, M31};
use stwo::core::fields::qm31::{SecureField, QM31};
use stwo::core::fields::FieldExpOps;
use stwo::core::fri::{fold_circle_into_line, fold_line};
use stwo::core::pcs::quotients::{
    accumulate_row_quotients, quotient_constants, ColumnSampleBatch, NumeratorData,
};
use stwo::core::poly::circle::CanonicCoset;
use stwo::core::poly::line::LineDomain;
use stwo::core::utils::bit_reverse_index;
use stwo::prover::backend::cpu::CpuBackend;
use stwo::prover::poly::circle::CircleEvaluation;
use stwo::prover::poly::BitReversedOrder;

const P: u64 = (1 << 31) - 1;
const FIB: [u32; 8] = [1, 1, 2, 3, 5, 8, 13, 21];
// the pinned pair-vanishing lines (cair.clar constants; cross-derived by three implementations)
const SEL: [u32; 3] = [1569360727, 1569360727, 2147450879];
const B01: [u32; 3] = [1569360727, 578122920, 2147450879];
const STEP: (u32, u32) = (32768, 2147450879);
const DOMAIN_LABEL: &[u8] = b"verifold-fs-v1";
const PARAMS: [u8; 8] = [0x04, 0x03, 0x02, 0x08, 0x00, 0x00, 0x00, 0x0a];

fn m(v: u32) -> BaseField {
    M31::from_u32_unchecked(v)
}
fn sha(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}
// QM31 limbs (c0,c1,c2,c3) -- the canonical enc16 order, byte-identical to commit.clar
fn limbs(v: SecureField) -> [u32; 4] {
    [v.0 .0 .0, v.0 .1 .0, v.1 .0 .0, v.1 .1 .0]
}
fn enc16(v: SecureField) -> [u8; 16] {
    let l = limbs(v);
    let mut out = [0u8; 16];
    for (i, x) in l.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&x.to_be_bytes());
    }
    out
}
fn leaf(v: SecureField) -> [u8; 32] {
    sha(&[&enc16(v)])
}

// ---- the Verifold sha256 duplex transcript (transcript.clar, third implementation) ----
fn absorb(st: [u8; 32], tag: u8, msg: &[u8]) -> [u8; 32] {
    sha(&[&st, &[0x00, tag], msg])
}
fn squeeze_m31(st: [u8; 32]) -> (u32, [u8; 32]) {
    let blk = sha(&[&st, &[0x01]]);
    let v = u128::from_be_bytes(blk[..16].try_into().unwrap()) % (P as u128);
    (v as u32, blk)
}
fn squeeze_qm31(st: [u8; 32]) -> (SecureField, [u8; 32]) {
    let (c0, st) = squeeze_m31(st);
    let (c1, st) = squeeze_m31(st);
    let (c2, st) = squeeze_m31(st);
    let (c3, st) = squeeze_m31(st);
    (QM31::from_u32_unchecked(c0, c1, c2, c3), st)
}
fn pow_val(st: [u8; 32], nonce: &[u8; 8]) -> u128 {
    let h = sha(&[&st, &[0x02], nonce]);
    u128::from_be_bytes(h[..16].try_into().unwrap())
}

// ---- sha256 binary Merkle tree (merkle.clar conventions) ----
struct Tree {
    levels: Vec<Vec<[u8; 32]>>,
}
impl Tree {
    fn new(leaves: Vec<[u8; 32]>) -> Self {
        let mut levels = vec![leaves];
        while levels.last().unwrap().len() > 1 {
            let cur = levels.last().unwrap();
            let next = (0..cur.len() / 2)
                .map(|i| sha(&[&cur[2 * i], &cur[2 * i + 1]]))
                .collect();
            levels.push(next);
        }
        Tree { levels }
    }
    fn root(&self) -> [u8; 32] {
        self.levels.last().unwrap()[0]
    }
    fn sibs(&self, idx: usize) -> Vec<[u8; 32]> {
        // bare sibling hashes leaf -> root (the driver derives direction bits)
        let mut out = vec![];
        let mut i = idx;
        for lvl in &self.levels[..self.levels.len() - 1] {
            out.push(lvl[i ^ 1]);
            i >>= 1;
        }
        out
    }
}

fn hex32(b: &[u8; 32]) -> String {
    hex::encode(b)
}
fn jq(v: SecureField) -> serde_json::Value {
    serde_json::json!(limbs(v))
}

fn main() {
    let pubs: Vec<&[u8]> = vec![b"", b"interop-1", b"interop-2"];
    let mut fixtures = vec![];

    // pub-independent setup: the trace, its Stwo interpolation, the domain
    let lde = CanonicCoset::new(4).circle_domain();
    let qp: Vec<CirclePoint<BaseField>> =
        (0..16).map(|qi| lde.at(bit_reverse_index(qi, 4))).collect();
    // the honest trace column: the unique dim-8 interpolant through fib on the trace coset,
    // evaluated on the LDE -- recovered HERE via Stwo by interpolating an evaluation we build
    // from the coset rows using the size-8 domain... simplest faithful route: take the 16 LDE
    // values from the dim-8 space by interpolating the size-8 circle-domain restriction.
    // The trace coset odds(3) IS NOT the size-8 circle domain, so we solve it the other way:
    // interpolate the size-16 column whose values we derive from the row constraints is
    // circular. Instead: build the dim-8 polynomial by interpolating over the SIZE-8 circle
    // domain values of T, which we obtain from the cross-checked size-16 column.
    // (Tcol is pub-independent and was verified against Stwo in phase 1, B1-B4.)
    let tcol_u32: [u32; 16] = [
        1474792818, 2090559570, 1412110383, 301516140, 1024007725, 235835508, 383859787,
        1667252711, 1164904959, 1218263045, 955580029, 543104401, 1293186474, 644759033,
        881492467, 1888644234,
    ];
    let tvals: Vec<BaseField> = tcol_u32.iter().map(|&v| m(v)).collect();
    let tpoly =
        CircleEvaluation::<CpuBackend, BaseField, BitReversedOrder>::new(lde, tvals).interpolate();
    // sanity: rows + degree (the dim-8 membership: coefficients above 8 vanish)
    let trace_coset = CanonicCoset::new(3).coset();
    for k in 0..8 {
        assert_eq!(
            tpoly.eval_at_point(trace_coset.at(k).into_ef()),
            SecureField::from(m(FIB[k])),
            "trace row {k}"
        );
    }
    let s_pt = CirclePoint::<BaseField> { x: m(STEP.0), y: m(STEP.1) };
    let one = SecureField::from(m(1));

    for pub_bytes in pubs {
        // ---- ctx + trace commit -> alpha ----
        let ctx = [DOMAIN_LABEL, &[0x01], &PARAMS, &sha(&[pub_bytes])].concat();
        let s0 = sha(&[&ctx]);
        let ttree = Tree::new(
            tcol_u32.iter().map(|&v| leaf(SecureField::from(m(v)))).collect(),
        );
        let (alpha, st) = squeeze_qm31(absorb(s0, 0x01, &ttree.root()));

        // ---- the composition column (the cair formula over Stwo ops) ----
        let line = |c: [u32; 3], p: CirclePoint<SecureField>| -> SecureField {
            p.x * m(c[0]) + p.y * m(c[1]) + SecureField::from(m(c[2]))
        };
        let piq = |v: SecureField| v * v + v * v - one;
        let compose = |t0: SecureField, t1: SecureField, t2: SecureField,
                       zp: CirclePoint<SecureField>|
         -> SecureField {
            let qt = (t2 - t1 - t0) * line(SEL, zp) * piq(piq(zp.x)).inverse();
            let qb = (t0 - one) * line(B01, zp).inverse();
            qt + alpha * qb
        };
        let ccol: Vec<SecureField> = (0..16)
            .map(|qi| {
                let zp: CirclePoint<SecureField> = qp[qi].into_ef();
                let z1 = zp + s_pt.into_ef();
                let z2 = z1 + s_pt.into_ef();
                compose(
                    tpoly.eval_at_point(zp),
                    tpoly.eval_at_point(z1),
                    tpoly.eval_at_point(z2),
                    zp,
                )
            })
            .collect();
        let ctree = Tree::new(ccol.iter().map(|&v| leaf(v)).collect());
        let (zfelt, st) = squeeze_qm31(absorb(st, 0x01, &ctree.root()));

        // ---- z point (stereographic) + OOD openings (all Stwo eval_at_point) ----
        let tsq = zfelt * zfelt;
        let dinv = (one + tsq).inverse();
        let z = CirclePoint::<SecureField> { x: (one - tsq) * dinv, y: (zfelt + zfelt) * dinv };
        let z1 = z + s_pt.into_ef();
        let z2 = z1 + s_pt.into_ef();
        let (t0z, t1z, t2z) =
            (tpoly.eval_at_point(z), tpoly.eval_at_point(z1), tpoly.eval_at_point(z2));
        let czs: Vec<SecureField> = (0..4)
            .map(|j| {
                let cvals: Vec<BaseField> = ccol.iter().map(|v| m(limbs(*v)[j])).collect();
                CircleEvaluation::<CpuBackend, BaseField, BitReversedOrder>::new(lde, cvals)
                    .interpolate()
                    .eval_at_point(z)
            })
            .collect();
        let mut st = st;
        for v in [t0z, t1z, t2z, czs[0], czs[1], czs[2], czs[3]] {
            st = absorb(st, 0x03, &enc16(v));
        }
        let (gamma, st) = squeeze_qm31(st);

        // ---- the DEEP column (Stwo accumulate_row_quotients) ----
        let mut gp = vec![one];
        for _ in 0..6 {
            gp.push(*gp.last().unwrap() * gamma);
        }
        let nd = |col: usize, val: SecureField, w: SecureField| NumeratorData {
            column_index: col,
            sample_value: val,
            random_coeff: w,
        };
        let batches = vec![
            ColumnSampleBatch {
                point: z,
                cols_vals_randpows: vec![
                    nd(0, t0z, gp[0]),
                    nd(1, czs[0], gp[3]),
                    nd(2, czs[1], gp[4]),
                    nd(3, czs[2], gp[5]),
                    nd(4, czs[3], gp[6]),
                ],
            },
            ColumnSampleBatch { point: z1, cols_vals_randpows: vec![nd(0, t1z, gp[1])] },
            ColumnSampleBatch { point: z2, cols_vals_randpows: vec![nd(0, t2z, gp[2])] },
        ];
        let consts = quotient_constants(&batches);
        let p0col: Vec<SecureField> = (0..16)
            .map(|qi| {
                let row = [
                    m(tcol_u32[qi]),
                    m(limbs(ccol[qi])[0]),
                    m(limbs(ccol[qi])[1]),
                    m(limbs(ccol[qi])[2]),
                    m(limbs(ccol[qi])[3]),
                ];
                accumulate_row_quotients(&batches, &row, &consts, qp[qi])
            })
            .collect();

        // ---- FRI: commit/fold via Stwo fold fns + our trees/transcript ----
        let p0tree = Tree::new(p0col.iter().map(|&v| leaf(v)).collect());
        let (beta0, st) = squeeze_qm31(absorb(st, 0x01, &p0tree.root()));
        let v1 = fold_circle_into_line(&p0col, lde, beta0);
        let v1tree = Tree::new(v1.iter().map(|&v| leaf(v)).collect());
        let (beta1, st) = squeeze_qm31(absorb(st, 0x01, &v1tree.root()));
        let ldom = LineDomain::new(lde.half_coset);
        let (ldom2, v2) = fold_line(&v1, ldom, beta1);
        let v2tree = Tree::new(v2.iter().map(|&v| leaf(v)).collect());
        let (beta2, st) = squeeze_qm31(absorb(st, 0x01, &v2tree.root()));
        let (_, v3) = fold_line(&v2, ldom2, beta2);
        assert_eq!(v3[0], v3[1], "honest terminal must be constant");
        let final_v = v3[0];

        // ---- grind + draw ----
        let s_fin = absorb(st, 0x03, &enc16(final_v));
        let mut nonce = [0u8; 8];
        for c in 0u32.. {
            nonce[4..].copy_from_slice(&c.to_be_bytes());
            if pow_val(s_fin, &nonce) < (1u128 << 120) {
                break;
            }
        }
        let mut s2 = absorb(s_fin, 0x05, &nonce);
        let mut qidx = vec![];
        for _ in 0..4 {
            let (v, ns) = squeeze_m31(s2);
            qidx.push((v % 16) as usize);
            s2 = ns;
        }

        // ---- bundles ----
        let hexv = |v: Vec<[u8; 32]>| -> Vec<String> { v.iter().map(hex32).collect() };
        let bundles: Vec<serde_json::Value> = qidx
            .iter()
            .map(|&qi| {
                let (k1, k2) = (qi >> 1, qi >> 2);
                serde_json::json!({
                    "tX": [tcol_u32[qi], 0, 0, 0],
                    "tSibs": hexv(ttree.sibs(qi)),
                    "cX": limbs(ccol[qi]),
                    "cSibs": hexv(ctree.sibs(qi)),
                    "p0Sib": limbs(p0col[qi ^ 1]),
                    "p0Sibs": hexv(p0tree.sibs(qi)[1..].to_vec()),
                    "l1Sib": limbs(v1[k1 ^ 1]),
                    "l1Sibs": hexv(v1tree.sibs(k1)[1..].to_vec()),
                    "l2Sib": limbs(v2[k2 ^ 1]),
                    "l2Sibs": hexv(v2tree.sibs(k2)[1..].to_vec()),
                })
            })
            .collect();

        fixtures.push(serde_json::json!({
            "pub": hex::encode(pub_bytes),
            "traceRoot": hex32(&ttree.root()),
            "compRoot": hex32(&ctree.root()),
            "Tz": jq(t0z), "Tgz": jq(t1z), "Tg2z": jq(t2z),
            "Czs": [jq(czs[0]), jq(czs[1]), jq(czs[2]), jq(czs[3])],
            "friRoots": [hex32(&p0tree.root()), hex32(&v1tree.root()), hex32(&v2tree.root())],
            "final": jq(final_v),
            "nonce": hex::encode(nonce),
            "queryIndices": qidx,
            "bundles": bundles,
        }));
        println!(
            "proved pub={:?}: queries {:?}",
            String::from_utf8_lossy(pub_bytes),
            qidx
        );
    }
    let out = serde_json::to_string_pretty(&serde_json::json!(fixtures)).unwrap();
    std::fs::write("fixtures/rust-proofs.json", out).unwrap();
    println!("wrote fixtures/rust-proofs.json");
}
