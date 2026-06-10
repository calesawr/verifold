//! Gear 6f phase 1: the Stwo cross-check harness.
//!
//! Recomputes every stage of the gear-6e toy proof with STWO'S OWN FUNCTIONS (pinned to dev @
//! cca98119 -- the commit the design panel extracted) and compares byte-for-byte against the
//! production KATs from tools/gear6e_replay.py. Any mismatch is a REAL convention divergence
//! (bit-reversal, coset, basis, twiddle, quotient normalization, gamma order) -- exactly the
//! QUERY-1/2 / CDEEP-1/3 / CAIR-6 questions, settled empirically instead of by source-reading.
mod kats;

use stwo::core::circle::{CirclePoint, M31_CIRCLE_GEN};
use stwo::core::fields::m31::{BaseField, M31};
use stwo::core::fields::FieldExpOps;
use stwo::core::fields::qm31::{SecureField, QM31};
use stwo::core::fri::{fold_circle_into_line, fold_line};
use stwo::core::pcs::quotients::{
    accumulate_row_quotients, quotient_constants, ColumnSampleBatch, NumeratorData,
};
use stwo::core::poly::circle::CanonicCoset;
use stwo::core::poly::line::LineDomain;
use stwo::core::utils::bit_reverse_index;
use stwo::prover::poly::BitReversedOrder;
use stwo::prover::backend::cpu::CpuBackend;
use stwo::prover::poly::circle::CircleEvaluation;

fn q(l: [u32; 4]) -> SecureField {
    QM31::from_u32_unchecked(l[0], l[1], l[2], l[3])
}
fn m(v: u32) -> BaseField {
    M31::from_u32_unchecked(v)
}

static mut FAILURES: u32 = 0;
fn check(name: &str, ok: bool, detail: String) {
    if ok {
        println!("PASS  {name}");
    } else {
        println!("FAIL  {name}: {detail}");
        unsafe { FAILURES += 1 };
    }
}

fn main() {
    // ---- A. the generator + the LDE domain ordering (QUERY-1/2/6) ----
    check(
        "A1 M31_CIRCLE_GEN == (2, 1268011823)",
        M31_CIRCLE_GEN.x.0 == 2 && M31_CIRCLE_GEN.y.0 == 1268011823,
        format!("got ({}, {})", M31_CIRCLE_GEN.x.0, M31_CIRCLE_GEN.y.0),
    );
    let lde = CanonicCoset::new(4).circle_domain();
    // our committed array order: FS index q -> geometric domain.at(bit_reverse_index(q, 4))
    let qp: Vec<CirclePoint<BaseField>> = (0..16)
        .map(|qi| lde.at(bit_reverse_index(qi, 4)))
        .collect();
    // pinned spot KATs (query.clar): q=2 -> (967747991, 906276279); q=0 -> (1179735656, 1241207368)
    check(
        "A2 LDE domain at bit-reversed FS indices matches query.clar (q=0, q=2)",
        qp[0].x.0 == 1179735656 && qp[0].y.0 == 1241207368
            && qp[2].x.0 == 967747991 && qp[2].y.0 == 906276279,
        format!("q0=({},{}) q2=({},{})", qp[0].x.0, qp[0].y.0, qp[2].x.0, qp[2].y.0),
    );
    // conjugate-pair adjacency: FS (2k, 2k+1) share x, negate y -- the whole binding architecture
    let adj = (0..8).all(|k| {
        qp[2 * k].x == qp[2 * k + 1].x && qp[2 * k].y == -qp[2 * k + 1].y
    });
    check("A3 FS adjacency = conjugate pairs (Stwo domain)", adj, String::new());

    // ---- B. trace interpolation + OOD openings (the basis/ordering cross-check) ----
    let tvals: Vec<BaseField> = kats::TCOL.iter().map(|&v| m(v)).collect();
    let tev = CircleEvaluation::<CpuBackend, BaseField, BitReversedOrder>::new(lde, tvals);
    let tpoly = tev.interpolate();
    let z = CirclePoint::<SecureField> { x: q(kats::ZX), y: q(kats::ZY) };
    let s_pt = CirclePoint::<BaseField> { x: m(32768), y: m(2147450879) };
    let z1 = z + s_pt.into_ef();
    let z2 = z1 + s_pt.into_ef();
    check(
        "B1 Stwo interpolate(Tcol).eval_at_point(z) == T(z)",
        tpoly.eval_at_point(z) == q(kats::TZ),
        format!("got {:?}", tpoly.eval_at_point(z)),
    );
    check(
        "B2 eval at z+S == T(z+S)",
        tpoly.eval_at_point(z1) == q(kats::TGZ),
        format!("got {:?}", tpoly.eval_at_point(z1)),
    );
    check(
        "B3 eval at z+2S == T(z+2S)",
        tpoly.eval_at_point(z2) == q(kats::TG2Z),
        format!("got {:?}", tpoly.eval_at_point(z2)),
    );
    // the trace rows: coset odds(3) row k carries fib[k]
    let trace_coset = CanonicCoset::new(3).coset();
    let fib = [1u32, 1, 2, 3, 5, 8, 13, 21];
    let rows_ok = (0..8).all(|k| {
        tpoly.eval_at_point(trace_coset.at(k).into_ef()) == q([fib[k], 0, 0, 0])
    });
    check("B4 trace rows on CanonicCoset::new(3).coset() == fib (our odds(3) reading)", rows_ok, String::new());

    // ---- C. composition coordinate openings ----
    for j in 0..4 {
        let cvals: Vec<BaseField> = kats::CCOL.iter().map(|l| m(l[j])).collect();
        let cpoly =
            CircleEvaluation::<CpuBackend, BaseField, BitReversedOrder>::new(lde, cvals).interpolate();
        check(
            &format!("C{} comp coordinate column {} eval at z == c{}-z", j + 1, j, j),
            cpoly.eval_at_point(z) == q(kats::CZS[j]),
            format!("got {:?}", cpoly.eval_at_point(z)),
        );
    }

    // ---- D. the DEEP column via Stwo's accumulate_row_quotients (CDEEP-1/3) ----
    // flatten order: batch z = {T: g^0, C0..C3: g^3..g^6}; batch z+S = {T: g^1}; batch z+2S = {T: g^2}
    let gamma = q(kats::GAMMA);
    let mut gp = vec![SecureField::from(m(1))];
    for _ in 0..6 {
        gp.push(*gp.last().unwrap() * gamma);
    }
    let nd = |col: usize, val: [u32; 4], w: SecureField| NumeratorData {
        column_index: col,
        sample_value: q(val),
        random_coeff: w,
    };
    let batches = vec![
        ColumnSampleBatch {
            point: z,
            cols_vals_randpows: vec![
                nd(0, kats::TZ, gp[0]),
                nd(1, kats::CZS[0], gp[3]),
                nd(2, kats::CZS[1], gp[4]),
                nd(3, kats::CZS[2], gp[5]),
                nd(4, kats::CZS[3], gp[6]),
            ],
        },
        ColumnSampleBatch { point: z1, cols_vals_randpows: vec![nd(0, kats::TGZ, gp[1])] },
        ColumnSampleBatch { point: z2, cols_vals_randpows: vec![nd(0, kats::TG2Z, gp[2])] },
    ];
    let consts = quotient_constants(&batches);
    let deep_ok = (0..16).all(|qi| {
        let row = [
            m(kats::TCOL[qi]),
            m(kats::CCOL[qi][0]),
            m(kats::CCOL[qi][1]),
            m(kats::CCOL[qi][2]),
            m(kats::CCOL[qi][3]),
        ];
        let got = accumulate_row_quotients(&batches, &row, &consts, qp[qi]);
        let want = q(kats::P0COL[qi]);
        if got != want {
            println!("      q={qi}: stwo={got:?} ours={want:?}");
        }
        got == want
    });
    check("D1 Stwo accumulate_row_quotients == our DEEP column (all 16 q)", deep_ok, String::new());

    // ---- E. the FRI chain via Stwo's fold functions ----
    let p0: Vec<SecureField> = kats::P0COL.iter().map(|&l| q(l)).collect();
    let v1 = fold_circle_into_line(&p0, lde, q(kats::BETAS[0]));
    let v1_ok = v1.len() == 8 && (0..8).all(|k| v1[k] == q(kats::V1[k]));
    check("E1 Stwo fold_circle_into_line(P0, beta0) == our V1", v1_ok, format!("{:?}", &v1[..2.min(v1.len())]));
    let ldom = LineDomain::new(lde.half_coset);
    let (ldom2, v2) = fold_line(&v1, ldom, q(kats::BETAS[1]));
    let v2_ok = v2.len() == 4 && (0..4).all(|k| v2[k] == q(kats::V2[k]));
    check("E2 Stwo fold_line(V1, beta1) == our V2", v2_ok, format!("{:?}", &v2[..2.min(v2.len())]));
    let (_, v3) = fold_line(&v2, ldom2, q(kats::BETAS[2]));
    let v3_ok = v3.len() == 2 && v3[0] == q(kats::V3[0]) && v3[1] == q(kats::V3[1]) && v3[0] == q(kats::FINAL);
    check("E3 Stwo fold_line(V2, beta2) == our V3 == the transmitted final", v3_ok, format!("{v3:?}"));

    // ---- F. the stereographic map in Stwo field ops (the felt->point formula) ----
    let one = SecureField::from(m(1));
    let t = q([1855804402, 1279339926, 785511081, 1204387820]); // the production z-felt
    let tsq = t * t;
    let dinv = (one + tsq).inverse();
    check(
        "F1 stereographic (1-t^2)/(1+t^2), 2t/(1+t^2) == the z point",
        (one - tsq) * dinv == q(kats::ZX) && (t + t) * dinv == q(kats::ZY),
        String::new(),
    );

    let f = unsafe { FAILURES };
    if f == 0 {
        println!("\nALL STWO CROSS-CHECKS PASS -- the gear-6e conventions match Stwo dev@cca98119");
    } else {
        println!("\n{f} CHECK(S) FAILED -- each is a real convention divergence (completeness break)");
        std::process::exit(1);
    }
}
