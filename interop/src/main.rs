//! Gear 6f phase 1: the Stwo cross-check harness.
//!
//! Recomputes every stage of the gear-6e toy proof with STWO'S OWN FUNCTIONS (pinned to dev @
//! cca98119 -- the commit the design panel extracted) and compares byte-for-byte against the
//! production KATs from tools/gear6e_replay.py. Any mismatch is a REAL convention divergence
//! (bit-reversal, coset, basis, twiddle, quotient normalization, gamma order) -- exactly the
//! QUERY-1/2 / CDEEP-1/3 / CAIR-6 questions, settled empirically instead of by source-reading.
mod kats;
mod params;

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

const P_M31: u64 = (1 << 31) - 1;

fn point_checks(label: &str, p: &params::Point) {
    let log_d = p.log_domain();
    let lde = CanonicCoset::new(log_d).circle_domain();
    let trace_coset = CanonicCoset::new(p.log_trace).coset();
    let rows = p.trace_rows();
    let is_id = |q: CirclePoint<BaseField>| q.x.0 == 1 && q.y.0 == 0;

    // S1/S2: generator orders of the two step points. At the toy point they coincide
    // numerically; at production they DIVERGE (S has order 2^log_trace, H has order
    // DOMAIN_SIZE/2). This is the derivation subtlety the plan header pins.
    let s_pt = trace_coset.step;
    let h_pt = lde.half_coset.step;
    check(
        &format!("{label} S1 trace step S has order 2^log_trace = {rows}"),
        is_id(s_pt.mul(1u128 << p.log_trace)) && !is_id(s_pt.mul(1u128 << (p.log_trace - 1))),
        String::new(),
    );
    check(
        &format!("{label} S2 half-coset step H has order DOMAIN_SIZE/2 = {}", p.domain_size() / 2),
        is_id(h_pt.mul(1u128 << (log_d - 1))) && !is_id(h_pt.mul(1u128 << (log_d - 2))),
        String::new(),
    );
    // S3: our G-exponent reading of both steps matches Stwo's coset structs
    let sg = M31_CIRCLE_GEN.mul(1u128 << (31 - p.log_trace));
    let hg = M31_CIRCLE_GEN.mul(1u128 << (32 - log_d));
    check(
        &format!("{label} S3 S == G^(2^(31-log_trace)) and H == G^(2^(32-LOG_DOMAIN))"),
        s_pt.x == sg.x && s_pt.y == sg.y && h_pt.x == hg.x && h_pt.y == hg.y,
        String::new(),
    );
    // S4: conjugate-pair adjacency in FS order across the WHOLE domain
    let half = p.domain_size() / 2;
    let adj = (0..half).all(|k| {
        let e = lde.at(bit_reverse_index(2 * k, log_d));
        let o = lde.at(bit_reverse_index(2 * k + 1, log_d));
        e.x == o.x && e.y == -o.y
    });
    check(&format!("{label} S4 FS adjacency = conjugate pairs (all {half} pairs)"), adj, String::new());

    // S5: the derived Fibonacci column obeys the recurrence at every row
    let t = params::fib_column(rows);
    let rec = (2..rows).all(|k| (t[k] as u64) == ((t[k - 1] as u64) + (t[k - 2] as u64)) % P_M31);
    check(&format!("{label} S5 trace recurrence holds on all {rows} rows"), rec, String::new());

    // S6: coset-row placement + interpolate/eval round-trip at sampled rows
    let tdom = CanonicCoset::new(p.log_trace).circle_domain();
    let mut vals = vec![m(0); rows];
    for k in 0..rows {
        let i = params::coset_index_to_domain_index(k, p.log_trace);
        vals[bit_reverse_index(i, p.log_trace)] = m(t[k]);
    }
    let tpoly = CircleEvaluation::<CpuBackend, BaseField, BitReversedOrder>::new(tdom, vals)
        .interpolate();
    let sample = [0usize, 1, 2, rows / 2, rows - 2, rows - 1];
    let rows_ok = sample
        .iter()
        .all(|&k| tpoly.eval_at_point(trace_coset.at(k).into_ef()) == SecureField::from(m(t[k])));
    check(&format!("{label} S6 interpolate/eval round-trip on sampled trace rows"), rows_ok, String::new());

    // S7: evaluate on the LDE, interpolate back: coefficients equal the zero-extension
    // (degree membership at scale: everything above 2^log_trace vanishes)
    let lde_eval = tpoly.evaluate(lde);
    let colv: Vec<SecureField> = lde_eval.values.iter().map(|&v| SecureField::from(v)).collect();
    let back = lde_eval.interpolate();
    check(
        &format!("{label} S7 LDE round-trip: interpolated coeffs == extend(tpoly, LOG_DOMAIN)"),
        back.coeffs == tpoly.extend(log_d).coeffs,
        String::new(),
    );

    // S8: the fold chain takes DOMAIN_SIZE to the size-2 terminal in exactly N_LAYERS folds
    let beta = QM31::from_u32_unchecked(2, 3, 5, 7);
    let mut cur = fold_circle_into_line(&colv, lde, beta);
    let mut ldom = LineDomain::new(lde.half_coset);
    let mut n_folds = 1u32;
    while cur.len() > 2 {
        let (nldom, next) = fold_line(&cur, ldom, beta);
        ldom = nldom;
        cur = next;
        n_folds += 1;
    }
    check(
        &format!("{label} S8 fold chain: {} folds to the size-2 terminal", p.n_layers()),
        n_folds == p.n_layers() && cur.len() == 2,
        format!("folds {n_folds}, len {}", cur.len()),
    );
}

fn params_export_checks() {
    // R0: the toy PARAMS bytes are the frozen v1 pin
    check(
        "R0 TOY.params_bytes() == pinned [04 03 02 08 00 00 00 0a]",
        params::TOY.params_bytes() == [0x04, 0x03, 0x02, 0x08, 0x00, 0x00, 0x00, 0x0a],
        format!("{:02x?}", params::TOY.params_bytes()),
    );
    let p = params::FULL;
    let txt = std::fs::read_to_string("params-full.json").expect(
        "interop/params-full.json missing; regenerate with: \
         python3 tools/params.py --json PRODUCTION_POINT > interop/params-full.json",
    );
    // POW_THRESHOLD in the export is a bare JSON integer wider than 64 bits;
    // serde_json parses it into the Value tree as a lossy f64, which is harmless
    // because no check reads it: pow_threshold() derives from pow_bits (header pin).
    let j: serde_json::Value = serde_json::from_str(&txt).unwrap();
    check(
        "R1 PARAMS hex in params-full.json == FULL.params_bytes()",
        j["PARAMS"].as_str() == Some(hex::encode(p.params_bytes()).as_str()),
        format!("json {} rust {}", j["PARAMS"], hex::encode(p.params_bytes())),
    );
    check(
        "R2 DOMAIN_SIZE in params-full.json == FULL.domain_size()",
        j["DOMAIN_SIZE"].as_u64() == Some(p.domain_size() as u64),
        format!("json {}", j["DOMAIN_SIZE"]),
    );
    let trace_coset = CanonicCoset::new(p.log_trace).coset();
    let lde = CanonicCoset::new(p.log_domain()).circle_domain();
    check(
        "R3 SX/SY (python trace step) == Stwo trace coset step",
        j["SX"].as_u64() == Some(trace_coset.step.x.0 as u64)
            && j["SY"].as_u64() == Some(trace_coset.step.y.0 as u64),
        format!("json ({}, {})", j["SX"], j["SY"]),
    );
    check(
        "R4 H (python half-coset step) == Stwo lde.half_coset.step",
        j["H"]["re"].as_u64() == Some(lde.half_coset.step.x.0 as u64)
            && j["H"]["im"].as_u64() == Some(lde.half_coset.step.y.0 as u64),
        format!("json {}", j["H"]),
    );
    check(
        "R5 OFF (python coset shift) == Stwo lde.half_coset.initial",
        j["OFF"]["re"].as_u64() == Some(lde.half_coset.initial.x.0 as u64)
            && j["OFF"]["im"].as_u64() == Some(lde.half_coset.initial.y.0 as u64),
        format!("json {}", j["OFF"]),
    );
}

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

    // ---- M2 Stage 1 gate: the same conventions at BOTH parameter points ----
    point_checks("TOY", &params::TOY);
    point_checks("FULL", &params::FULL);
    params_export_checks();

    let f = unsafe { FAILURES };
    if f == 0 {
        println!("\nALL STWO CROSS-CHECKS PASS -- the gear-6e conventions match Stwo dev@cca98119");
    } else {
        println!("\n{f} CHECK(S) FAILED -- each is a real convention divergence (completeness break)");
        std::process::exit(1);
    }
}
