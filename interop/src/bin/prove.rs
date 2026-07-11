//! Gear 6f phase 2: the Rust mini-prover, parametric over the params.rs points (M2).
//!
//! Produces complete Verifold proofs where every ALGEBRAIC stage is computed by STWO'S OWN
//! FUNCTIONS (interpolate, evaluate, eval_at_point, accumulate_row_quotients,
//! fold_circle_into_line, fold_line) and only the wire layer (the sha256 duplex transcript
//! and the sha256 Merkle trees) is Verifold's, implemented here a THIRD time.
//!
//! --point toy  (default): the frozen M1 wire (VERSION 0x01), byte-identical output to
//!                         fixtures/rust-proofs.json. The regression gate for this refactor.
//! --point full          : the pinned PRODUCTION_POINT, fixtures/rust-proofs-full.json.
#[path = "../params.rs"]
mod params;

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
const DOMAIN_LABEL: &[u8] = b"verifold-fs-v1";
// TEST-ONLY regression anchors. The proving path derives everything from the point; at
// the toy point the derivations must reproduce these pinned values exactly (asserted in
// main) or the refactor changed the math.
const TCOL_TOY_PINNED: [u32; 16] = [
    1474792818, 2090559570, 1412110383, 301516140, 1024007725, 235835508, 383859787,
    1667252711, 1164904959, 1218263045, 955580029, 543104401, 1293186474, 644759033,
    881492467, 1888644234,
];
const SEL_TOY: [u32; 3] = [1569360727, 1569360727, 2147450879];
const B01_TOY: [u32; 3] = [1569360727, 578122920, 2147450879];
const STEP_TOY: (u32, u32) = (32768, 2147450879);

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

fn parse_point() -> params::Point {
    let args: Vec<String> = std::env::args().collect();
    match args.iter().position(|a| a == "--point") {
        None => params::TOY,
        Some(i) => match args.get(i + 1).map(|s| s.as_str()) {
            Some("toy") => params::TOY,
            Some("full") => params::FULL,
            other => panic!("--point takes toy or full, got {other:?}"),
        },
    }
}

fn main() {
    let point = parse_point();
    let is_toy = point == params::TOY;
    let log_d = point.log_domain();
    let n = point.domain_size();
    let rows = point.trace_rows();
    let n_layers = point.n_layers() as usize;
    println!(
        "point: log_trace={} log_blowup={} n_queries={} pow_bits={} air_id={}",
        point.log_trace, point.log_blowup, point.n_queries, point.pow_bits, point.air_id
    );

    let pubs: Vec<&[u8]> = vec![b"", b"interop-1", b"interop-2"];
    let mut fixtures = vec![];

    // pub-independent setup: the LDE domain, FS-ordered points, the trace coset
    let lde = CanonicCoset::new(log_d).circle_domain();
    let qp: Vec<CirclePoint<BaseField>> =
        (0..n).map(|qi| lde.at(bit_reverse_index(qi, log_d))).collect();
    let trace_coset = CanonicCoset::new(point.log_trace).coset();
    let tdom = CanonicCoset::new(point.log_trace).circle_domain();
    let s_pt = trace_coset.step;

    // the honest trace: t[0]=t[1]=1, t[k]=t[k-1]+t[k-2] mod p over 2^log_trace rows.
    // interp_rot(r) interpolates the rows rotated by r; rotation by the coset step maps
    // the circle FFT space to itself, so this IS the shifted polynomial T(. + rS).
    let t = params::fib_column(rows);
    let interp_rot = |r: usize| {
        let mut vals = vec![m(0); rows];
        for k in 0..rows {
            let i = params::coset_index_to_domain_index(k, point.log_trace);
            vals[bit_reverse_index(i, point.log_trace)] = m(t[(k + r) % rows]);
        }
        CircleEvaluation::<CpuBackend, BaseField, BitReversedOrder>::new(tdom, vals).interpolate()
    };
    let tpoly = interp_rot(0);
    let t1poly = interp_rot(1);
    let t2poly = interp_rot(2);
    // sanity: sampled rows carry the recurrence values, and the rotation identity holds
    // at an OFF-COSET probe (a wrong shifted column would also break the honest-terminal
    // assert below, since the DEEP quotient would leave the low-degree space)
    for k in [0usize, 1, 2, rows / 2, rows - 2, rows - 1] {
        assert_eq!(
            tpoly.eval_at_point(trace_coset.at(k).into_ef()),
            SecureField::from(m(t[k])),
            "trace row {k}"
        );
    }
    let probe = lde.at(0).into_ef();
    assert_eq!(
        t1poly.eval_at_point(probe),
        tpoly.eval_at_point(probe + s_pt.into_ef()),
        "rotation identity T1 == T(.+S) off the coset"
    );
    assert_eq!(
        t2poly.eval_at_point(probe),
        tpoly.eval_at_point(probe + s_pt.into_ef() + s_pt.into_ef()),
        "rotation identity T2 == T(.+2S) off the coset"
    );
    // FS-ordered LDE columns (BitReversedOrder storage == FS order)
    let tcol: Vec<BaseField> = tpoly.evaluate(lde).values;
    let t1col: Vec<BaseField> = t1poly.evaluate(lde).values;
    let t2col: Vec<BaseField> = t2poly.evaluate(lde).values;
    if is_toy {
        let got: Vec<u32> = tcol.iter().map(|v| v.0).collect();
        assert_eq!(got, TCOL_TOY_PINNED.to_vec(), "derived toy trace column == the 16 pinned values");
        assert_eq!((s_pt.x.0, s_pt.y.0), STEP_TOY, "derived S == the pinned STEP");
    }

    // the pair-vanishing lines, derived from the trace coset: SEL kills the transition
    // constraint on the last two rows, B01 divides the boundary constraint on rows 0, 1
    let lc = |e0: CirclePoint<BaseField>, e1: CirclePoint<BaseField>| -> [u32; 3] {
        [(e0.y - e1.y).0, (e1.x - e0.x).0, (e0.x * e1.y - e1.x * e0.y).0]
    };
    let sel = lc(trace_coset.at(rows - 2), trace_coset.at(rows - 1));
    let b01 = lc(trace_coset.at(0), trace_coset.at(1));
    if is_toy {
        assert_eq!(sel, SEL_TOY, "derived SEL == the cair.clar pin");
        assert_eq!(b01, B01_TOY, "derived B01 == the cair.clar pin");
    }
    let one = SecureField::from(m(1));

    for pub_bytes in pubs {
        // ---- ctx + trace commit -> alpha ----
        let ctx = [DOMAIN_LABEL, &[point.version()], &point.params_bytes()[..], &sha(&[pub_bytes])]
            .concat();
        let s0 = sha(&[&ctx]);
        let ttree = Tree::new(tcol.iter().map(|&v| leaf(SecureField::from(v))).collect());
        let (alpha, st) = squeeze_qm31(absorb(s0, 0x01, &ttree.root()));

        // ---- the composition column (the cair formula, base-field ops per FS index) ----
        let line_m = |c: [u32; 3], p: CirclePoint<BaseField>| -> BaseField {
            p.x * m(c[0]) + p.y * m(c[1]) + m(c[2])
        };
        let pim = |x: BaseField| x * x + x * x - m(1);
        let vanish = |x: BaseField| {
            let mut v = x;
            for _ in 0..(point.log_trace - 1) {
                v = pim(v);
            }
            v
        };
        let ccol: Vec<SecureField> = (0..n)
            .map(|qi| {
                let p = qp[qi];
                let (t0, t1, t2) = (tcol[qi], t1col[qi], t2col[qi]);
                let qt = (t2 - t1 - t0) * line_m(sel, p) * vanish(p.x).inverse();
                let qb = (t0 - m(1)) * line_m(b01, p).inverse();
                SecureField::from(qt) + alpha * SecureField::from(qb)
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
        let mut gpow = vec![one];
        for _ in 0..6 {
            gpow.push(*gpow.last().unwrap() * gamma);
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
                    nd(0, t0z, gpow[0]),
                    nd(1, czs[0], gpow[3]),
                    nd(2, czs[1], gpow[4]),
                    nd(3, czs[2], gpow[5]),
                    nd(4, czs[3], gpow[6]),
                ],
            },
            ColumnSampleBatch { point: z1, cols_vals_randpows: vec![nd(0, t1z, gpow[1])] },
            ColumnSampleBatch { point: z2, cols_vals_randpows: vec![nd(0, t2z, gpow[2])] },
        ];
        let consts = quotient_constants(&batches);
        let p0col: Vec<SecureField> = (0..n)
            .map(|qi| {
                let row = [
                    tcol[qi],
                    m(limbs(ccol[qi])[0]),
                    m(limbs(ccol[qi])[1]),
                    m(limbs(ccol[qi])[2]),
                    m(limbs(ccol[qi])[3]),
                ];
                accumulate_row_quotients(&batches, &row, &consts, qp[qi])
            })
            .collect();

        // ---- FRI: p0 commit, then N_LAYERS-1 committed line layers, size-2 terminal ----
        let p0tree = Tree::new(p0col.iter().map(|&v| leaf(v)).collect());
        let (beta0, st_after_p0) = squeeze_qm31(absorb(st, 0x01, &p0tree.root()));
        let mut st = st_after_p0;
        let mut betas = vec![beta0];
        let mut line_layers: Vec<Vec<SecureField>> = vec![];
        let mut line_trees: Vec<Tree> = vec![];
        let mut cur = fold_circle_into_line(&p0col, lde, beta0);
        let mut ldom = LineDomain::new(lde.half_coset);
        while cur.len() > 2 {
            let tree = Tree::new(cur.iter().map(|&v| leaf(v)).collect());
            let (beta, ns) = squeeze_qm31(absorb(st, 0x01, &tree.root()));
            st = ns;
            betas.push(beta);
            let (nldom, next) = fold_line(&cur, ldom, beta);
            line_layers.push(cur);
            line_trees.push(tree);
            ldom = nldom;
            cur = next;
        }
        assert_eq!(cur.len(), 2, "terminal layer size 2");
        assert_eq!(cur[0], cur[1], "honest terminal must be constant");
        assert_eq!(betas.len(), n_layers, "one beta per FRI commitment");
        let final_v = cur[0];

        // ---- grind + draw ----
        let s_fin = absorb(st, 0x03, &enc16(final_v));
        let mut nonce = [0u8; 8];
        for c in 0u32.. {
            nonce[4..].copy_from_slice(&c.to_be_bytes());
            if pow_val(s_fin, &nonce) < point.pow_threshold() {
                break;
            }
        }
        let mut s2 = absorb(s_fin, 0x05, &nonce);
        let mut qidx = vec![];
        for _ in 0..point.n_queries {
            let (v, ns) = squeeze_m31(s2);
            qidx.push((v as u64 % n as u64) as usize);
            s2 = ns;
        }

        // ---- bundles ----
        let hexv = |v: Vec<[u8; 32]>| -> Vec<String> { v.iter().map(hex32).collect() };
        let bundles: Vec<serde_json::Value> = qidx
            .iter()
            .map(|&qi| {
                let base = serde_json::json!({
                    "tX": [tcol[qi].0, 0, 0, 0],
                    "tSibs": hexv(ttree.sibs(qi)),
                    "cX": limbs(ccol[qi]),
                    "cSibs": hexv(ctree.sibs(qi)),
                    "p0Sib": limbs(p0col[qi ^ 1]),
                    "p0Sibs": hexv(p0tree.sibs(qi)[1..].to_vec()),
                });
                let mut obj = base.as_object().unwrap().clone();
                if is_toy {
                    // the frozen v1 wire shape (byte-identical to the M1 fixtures;
                    // serde_json serializes keys sorted, same as before)
                    let (k1, k2) = (qi >> 1, qi >> 2);
                    obj.insert("l1Sib".into(), serde_json::json!(limbs(line_layers[0][k1 ^ 1])));
                    obj.insert(
                        "l1Sibs".into(),
                        serde_json::json!(hexv(line_trees[0].sibs(k1)[1..].to_vec())),
                    );
                    obj.insert("l2Sib".into(), serde_json::json!(limbs(line_layers[1][k2 ^ 1])));
                    obj.insert(
                        "l2Sibs".into(),
                        serde_json::json!(hexv(line_trees[1].sibs(k2)[1..].to_vec())),
                    );
                } else {
                    // v2 generalized line-layer openings: entry j opens layer j+1 at
                    // pair index q >> (j+1); sibs drop the first hash (the sib value
                    // is hashed into the tree by the verifier, the toy p0/l1/l2 idiom)
                    let layers: Vec<serde_json::Value> = (0..n_layers - 1)
                        .map(|j| {
                            let k = qi >> (j + 1);
                            serde_json::json!({
                                "sib": limbs(line_layers[j][k ^ 1]),
                                "sibs": hexv(line_trees[j].sibs(k)[1..].to_vec()),
                            })
                        })
                        .collect();
                    obj.insert("lineSibs".into(), serde_json::json!(layers));

                    // v2 hints: N_LAYERS twiddle inverses (circle fold first, then the
                    // line layers), each checked (t * h == 1) at emission. The twiddles
                    // are exactly what driver.clar derives: y-twiddle(q) and the
                    // line-x_k(q) closed forms, generalized.
                    let mut hints: Vec<u32> = vec![];
                    let y_q = qp[qi & !1usize].y;
                    let h0 = y_q.inverse();
                    assert_eq!(y_q * h0, m(1), "hint 0 inverse check q={qi}");
                    hints.push(h0.0);
                    for l in 1..n_layers {
                        let idx = ((qi >> l) & !1usize) << l;
                        let mut x = qp[idx].x;
                        for _ in 0..(l - 1) {
                            x = x * x + x * x - m(1);
                        }
                        let h = x.inverse();
                        assert_eq!(x * h, m(1), "hint {l} inverse check q={qi}");
                        hints.push(h.0);
                    }
                    obj.insert("hints".into(), serde_json::json!(hints));
                }
                serde_json::Value::Object(obj)
            })
            .collect();

        let mut froots: Vec<String> = vec![hex32(&p0tree.root())];
        froots.extend(line_trees.iter().map(|t| hex32(&t.root())));
        fixtures.push(serde_json::json!({
            "pub": hex::encode(pub_bytes),
            "traceRoot": hex32(&ttree.root()),
            "compRoot": hex32(&ctree.root()),
            "Tz": jq(t0z), "Tgz": jq(t1z), "Tg2z": jq(t2z),
            "Czs": [jq(czs[0]), jq(czs[1]), jq(czs[2]), jq(czs[3])],
            "friRoots": froots,
            "final": jq(final_v),
            "nonce": hex::encode(nonce),
            "queryIndices": qidx,
            "bundles": bundles,
        }));
        println!("proved pub={:?}: queries {:?}", String::from_utf8_lossy(pub_bytes), qidx);
    }
    let dest =
        if is_toy { "fixtures/rust-proofs.json" } else { "fixtures/rust-proofs-full.json" };
    let out = serde_json::to_string_pretty(&serde_json::json!(fixtures)).unwrap();
    std::fs::write(dest, out).unwrap();
    println!("wrote {dest}");
}
