#!/usr/bin/env node
/**
 * score.mjs — recompute every benchmark figure in this repository from its released data, and check each one
 * against the published results. No dependencies; Node.js 18 or newer.
 *
 *   node benchmark/score.mjs            print the tables, check them, exit 1 on any difference
 *
 * FOUR CHECKS
 *   1. Graded relevance, 86 questions × 8 systems: Hit@1, Hit@10, MRR@10, Precision@10, nDCG@10, their
 *      bootstrap intervals, and every paired significance test, against results/graded-relevance-v2.json (the
 *      published values: a paper that appears twice in one ranked list is counted once).
 *   2. Retrieval depth: Hit@1/10/20/50 and MRR@50 of the target paper in the top 50, against
 *      results/depth50-summary.json.
 *   3. Known-item retrieval, 240 queries: Hit@1/5/10, MRR@10 with intervals and the Holm-corrected tests,
 *      against results/known-item-240.json.
 *   4. Short identifier queries, keyword against meaning-based search, against results/identifier-86.json.
 *
 * The statistics are the analysis scripts' own, unchanged: the same seeded generator, resampling order and
 * rounding, so a check passes only on an exact match (4 decimal places as published), not an approximate one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const RESULTS = path.join(HERE, 'results');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readJsonl = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

let checks = 0;
const failures = [];
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
function same(label, got, want) {
    checks += 1;
    if (canon(got) !== canon(want)) failures.push(`${label}\n      recomputed ${canon(got).slice(0, 300)}\n      published  ${canon(want).slice(0, 300)}`);
}
function close(label, got, want, tol = 1e-12) {
    checks += 1;
    if (!(Math.abs(got - want) <= tol)) failures.push(`${label}: recomputed ${got}, published ${want}`);
}
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

// ══ 1. GRADED RELEVANCE (port of score-graded-relevance.mjs) ═══════════════════════════════════════════════
const questions = readJson(path.join(DATA, 'questions.json')).questions;
const runs = readJsonl(path.join(DATA, 'runs-top10.jsonl'));
const judgements = readJsonl(path.join(DATA, 'judgements.jsonl'));
const publishedGraded = readJson(path.join(RESULTS, 'graded-relevance-v2.json'));

const TOP_K = 10;
const RELEVANT = 2;
const BOOTSTRAP = 10000;
const PERMUTATIONS = 20000;
const SEED = 20260908;

const gradeByQueryDoc = new Map();
const poolGradesByQuery = new Map();
for (const j of judgements) {
    gradeByQueryDoc.set(`${j.question_id}\u0000${j.doc_key}`, j.grade);
    if (!poolGradesByQuery.has(j.question_id)) poolGradesByQuery.set(j.question_id, []);
    poolGradesByQuery.get(j.question_id).push(j.grade);
}
const runOf = new Map(runs.map((r) => [`${r.question_id}\u0000${r.system}`, r]));

const gain = (g) => (2 ** g) - 1;
const discount = (rank) => 1 / Math.log2(rank + 1);
function dcgAt(grades, k = TOP_K) {
    let s = 0;
    for (let i = 0; i < Math.min(k, grades.length); i += 1) s += gain(grades[i]) * discount(i + 1);
    return s;
}
const idealDcg = (qid) => dcgAt((poolGradesByQuery.get(qid) || []).slice().sort((a, b) => b - a));
function scoreList(qid, run) {
    const hits = (run?.hits || []).slice(0, TOP_K);
    const keys = hits.map((h) => h.doc_key);
    // A paper's second and later appearances in one list earn nothing (graded-relevance-v2.json, duplicate_rule).
    const seen = new Set();
    const grades = keys.map((k) => {
        const g = k == null ? null : gradeByQueryDoc.get(`${qid}\u0000${k}`);
        if (k != null && seen.has(k)) return 0;
        if (k != null) seen.add(k);
        return g == null ? 0 : g;
    });
    const ungraded = keys.filter((k) => k == null || gradeByQueryDoc.get(`${qid}\u0000${k}`) == null).length;
    const idcg = idealDcg(qid);
    const relevantCount = grades.filter((g) => g >= RELEVANT).length;
    const rank = run?.target_rank ?? null;
    return {
        n_returned: hits.length,
        ungraded_in_top_k: ungraded,
        target_rank: rank,
        hit_at_1: rank === 1 ? 1 : 0,
        hit_at_10: rank != null && rank <= TOP_K ? 1 : 0,
        rr_at_10: rank != null && rank <= TOP_K ? 1 / rank : 0,
        precision_at_10: relevantCount / TOP_K,
        precision_of_returned: hits.length ? relevantCount / hits.length : 0,
        relevant_in_top_10: relevantCount,
        dcg_at_10: dcgAt(grades),
        idcg_at_10: idcg,
        ndcg_at_10: idcg > 0 ? dcgAt(grades) / idcg : null,
        grades,
    };
}
const REAL_ARMS = ['rbai_semantic', 'rbai_keyword', 'rbai_hybrid', 'openalex_semantic', 'openalex_keyword', 'pubmed_keyword'];
const ORACLES = {
    openalex_best_of_both: ['openalex_combined_semantic', 'openalex_combined_keyword'],
    openalex_oracle_any: ['openalex_combined_semantic', 'openalex_combined_keyword', 'openalex_keyword'],
};
const RAW_ARMS = ['openalex_combined_semantic', 'openalex_combined_keyword'];
const ALL = [...REAL_ARMS, ...RAW_ARMS, ...Object.keys(ORACLES)];
const per = new Map(ALL.map((a) => [a, []]));
const questionIds = [];
for (const q of questions) {
    const qid = q.question_id;
    questionIds.push(qid);
    const scored = {};
    for (const a of [...REAL_ARMS, ...RAW_ARMS]) scored[a] = scoreList(qid, runOf.get(`${qid}\u0000${a}`));
    for (const [name, inputs] of Object.entries(ORACLES)) {
        // An oracle takes, per question and per metric, whichever of its inputs did best: an upper bound.
        const cands = inputs.map((i) => scored[i]).filter(Boolean);
        const best = (key, cmp = (x, y) => y - x) => {
            const vals = cands.map((c) => c[key]).filter((v) => v != null);
            return vals.length ? vals.sort(cmp)[0] : null;
        };
        const bestRank = cands.map((c) => c.target_rank).filter((r) => r != null);
        scored[name] = {
            n_returned: Math.max(...cands.map((c) => c.n_returned), 0),
            ungraded_in_top_k: 0,
            target_rank: bestRank.length ? Math.min(...bestRank) : null,
            hit_at_1: best('hit_at_1'), hit_at_10: best('hit_at_10'), rr_at_10: best('rr_at_10'),
            precision_at_10: best('precision_at_10'), precision_of_returned: best('precision_of_returned'),
            relevant_in_top_10: best('relevant_in_top_10'),
            dcg_at_10: best('dcg_at_10'), idcg_at_10: cands[0]?.idcg_at_10 ?? 0,
            ndcg_at_10: best('ndcg_at_10'),
            oracle_over: inputs,
        };
    }
    for (const a of ALL) per.get(a).push(scored[a]);
}
const N = questionIds.length;
function makeRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const vals = (arm, key) => per.get(arm).map((m) => m[key]).filter((x) => x != null);
function bootstrapCi(series, seed = SEED) {
    if (series.length < 2) return null;
    const rng = makeRng(seed);
    const ms = [];
    for (let b = 0; b < BOOTSTRAP; b += 1) {
        let acc = 0;
        for (let i = 0; i < series.length; i += 1) acc += series[Math.floor(rng() * series.length)];
        ms.push(acc / series.length);
    }
    ms.sort((a, b) => a - b);
    return [Number(ms[Math.floor(0.025 * BOOTSTRAP)].toFixed(4)), Number(ms[Math.floor(0.975 * BOOTSTRAP)].toFixed(4))];
}
function mcnemar(a, b) {
    const A = per.get(a); const B = per.get(b);
    let ab = 0; let ba = 0;
    for (let i = 0; i < N; i += 1) {
        const ha = A[i].hit_at_10 === 1; const hb = B[i].hit_at_10 === 1;
        if (ha && !hb) ab += 1; else if (hb && !ha) ba += 1;
    }
    const nd = ab + ba;
    if (nd === 0) return { wins: ab, losses: ba, p: 1 };
    const lc = (n, k) => { let s = 0; for (let j = 1; j <= k; j += 1) s += Math.log(n - k + j) - Math.log(j); return s; };
    const pmf = (k) => Math.exp(lc(nd, k) + nd * Math.log(0.5));
    const obs = pmf(Math.min(ab, ba));
    let p = 0;
    for (let k = 0; k <= nd; k += 1) { const q = pmf(k); if (q <= obs * (1 + 1e-9)) p += q; }
    return { wins: ab, losses: ba, p: Math.min(1, Number(p.toFixed(8))) };
}
function permutationTest(a, b, key, seed = SEED + 11) {
    const A = per.get(a); const B = per.get(b);
    const diffs = [];
    for (let i = 0; i < N; i += 1) {
        const x = A[i][key]; const y = B[i][key];
        if (x == null || y == null) continue;
        diffs.push(x - y);
    }
    const n = diffs.length;
    if (!n) return null;
    const observed = mean(diffs);
    const rng = makeRng(seed);
    let atLeastAsExtreme = 0;
    for (let p = 0; p < PERMUTATIONS; p += 1) {
        let acc = 0;
        for (let i = 0; i < n; i += 1) acc += rng() < 0.5 ? -diffs[i] : diffs[i];
        if (Math.abs(acc / n) >= Math.abs(observed) - 1e-12) atLeastAsExtreme += 1;
    }
    const wins = diffs.filter((d) => d > 0).length;
    const losses = diffs.filter((d) => d < 0).length;
    return { n_compared: n, wins, losses, ties: n - wins - losses, mean_difference: Number(observed.toFixed(4)), p: Number(((atLeastAsExtreme + 1) / (PERMUTATIONS + 1)).toFixed(6)) };
}
const gradedArms = {};
for (const a of ALL) {
    const m = per.get(a);
    const ndcg = vals(a, 'ndcg_at_10');
    gradedArms[a] = {
        is_oracle: a in ORACLES,
        oracle_over: ORACLES[a] || null,
        n_questions: N,
        n_questions_with_ndcg: ndcg.length,
        mean_results_returned: Number(mean(m.map((x) => x.n_returned)).toFixed(2)),
        hit_at_1: Number(mean(m.map((x) => x.hit_at_1)).toFixed(4)),
        hit_at_10: Number(mean(m.map((x) => x.hit_at_10)).toFixed(4)),
        hit_at_10_ci95: bootstrapCi(m.map((x) => x.hit_at_10)),
        mrr_at_10: Number(mean(m.map((x) => x.rr_at_10)).toFixed(4)),
        precision_at_10: Number(mean(m.map((x) => x.precision_at_10)).toFixed(4)),
        precision_at_10_ci95: bootstrapCi(m.map((x) => x.precision_at_10)),
        precision_of_returned: Number(mean(m.map((x) => x.precision_of_returned)).toFixed(4)),
        mean_relevant_in_top_10: Number(mean(m.map((x) => x.relevant_in_top_10)).toFixed(2)),
        ndcg_at_10: Number(mean(ndcg).toFixed(4)),
        ndcg_at_10_ci95: bootstrapCi(ndcg),
        ungraded_documents_in_top_k: m.reduce((s, x) => s + x.ungraded_in_top_k, 0),
    };
    same(`graded: ${a}`, gradedArms[a], publishedGraded.arms[a]);
}
for (const [key, published] of Object.entries(publishedGraded.comparisons)) {
    const [a, b] = key.split('__vs__');
    same(`graded test: ${key}`, {
        label: published.label,
        hit_at_10_mcnemar: mcnemar(a, b),
        ndcg_at_10_permutation: permutationTest(a, b, 'ndcg_at_10'),
        precision_at_10_permutation: permutationTest(a, b, 'precision_at_10'),
        precision_of_returned_permutation: permutationTest(a, b, 'precision_of_returned'),
    }, published);
}
same('graded: per-question values', questionIds.map((qid, i) => ({
    question_id: qid,
    idcg_at_10: Number((per.get('rbai_semantic')[i].idcg_at_10 || 0).toFixed(4)),
    pool_size: (poolGradesByQuery.get(qid) || []).length,
    arms: Object.fromEntries(ALL.map((a) => [a, {
        target_rank: per.get(a)[i].target_rank,
        precision_at_10: Number((per.get(a)[i].precision_at_10 ?? 0).toFixed(4)),
        ndcg_at_10: per.get(a)[i].ndcg_at_10 == null ? null : Number(per.get(a)[i].ndcg_at_10.toFixed(4)),
    }])),
})), publishedGraded.per_question);
same('graded: judged pairs', judgements.length, publishedGraded.pool_stats.pairs_to_judge);

// The judging protocol's gates (JUDGING-PROTOCOL.md), checked again on the released judgements.
{
    const ids = new Set(judgements.map((j) => j.pair_id));
    same('judgements: one grade per pooled pair', ids.size, judgements.length);
    same('judgements: every grade is 0, 1, 2 or 3', judgements.filter((j) => ![0, 1, 2, 3].includes(j.grade)).length, 0);
    same('judgements: every grade has a reason of at least 25 characters', judgements.filter((j) => String(j.reason || '').trim().length < 25).length, 0);
    checks += 1;
    const levels = new Set(judgements.map((j) => j.grade)).size;
    if (levels < 3) failures.push(`judgements: only ${levels} grade levels used`);
    const sources = judgements.filter((j) => j.is_source_paper);
    const share = sources.filter((j) => j.grade >= RELEVANT).length / sources.length;
    checks += 1;
    if (!(share >= 0.8)) failures.push(`judgements: source papers graded relevant ${share.toFixed(3)}, below 0.80`);
    console.log(`Judgements: ${judgements.length} pairs, ${levels} grade levels, source paper graded relevant in ${sources.filter((j) => j.grade >= RELEVANT).length} of ${sources.length}`);
}

// ══ 2. DEPTH 50 (port of repair-depth50-retrieval.mjs's summary) ═══════════════════════════════════════════
const depthRows = readJsonl(path.join(DATA, 'depth50.jsonl'));
const publishedDepth = readJson(path.join(RESULTS, 'depth50-summary.json'));
const depthQuestions = new Set(depthRows.map((r) => r.question_id)).size;
const depthSummary = {};
for (const arm of publishedDepth.arms) {
    const s = { arm, ok: 0, declined: 0, errored: 0, mean_returned: 0 };
    const ranks = [];
    for (const r of depthRows.filter((x) => x.system === arm)) {
        if (r.status === 'declined') s.declined += 1; else if (r.status === 'ok') s.ok += 1; else s.errored += 1;
        s.mean_returned += r.n_returned || 0;
        ranks.push(r.target_rank);
    }
    s.mean_returned = Number((s.mean_returned / depthQuestions).toFixed(2));
    for (const d of [1, 10, 20, 50]) s[`hit_at_${d}`] = Number((ranks.filter((x) => x != null && x <= d).length / depthQuestions).toFixed(4));
    s.mrr_at_50 = Number((ranks.reduce((acc, x) => acc + (x != null && x <= 50 ? 1 / x : 0), 0) / depthQuestions).toFixed(4));
    s.recovered_between_11_and_50 = ranks.filter((x) => x != null && x > 10 && x <= 50).length;
    depthSummary[arm] = s;
    same(`depth 50: ${arm}`, s, publishedDepth.summary[arm]);
}

// ══ 3. KNOWN-ITEM, 240 QUERIES (port of analyze.mjs) ═══════════════════════════════════════════════════════
const known = readJsonl(path.join(DATA, 'known-item-240.jsonl'));
const publishedKnown = readJson(path.join(RESULTS, 'known-item-240.json'));
const SYSTEMS = ['rbai', 'openalex', 'pubmed'];
const rr = (rank) => (rank && rank > 0 ? 1 / rank : 0);
const hitAt = (rank, k) => (rank && rank <= k ? 1 : 0);
function makePrng(seed = 12345) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; }
function bootstrapCI(values, iterations = 10000, seed = 12345) {
    if (values.length === 0) return [0, 0];
    const rand = makePrng(seed);
    const means = [];
    for (let i = 0; i < iterations; i += 1) {
        let acc = 0;
        for (let j = 0; j < values.length; j += 1) acc += values[Math.floor(rand() * values.length)];
        means.push(acc / values.length);
    }
    means.sort((a, b) => a - b);
    const q = (p) => { const idx = (means.length - 1) * p; const lo = Math.floor(idx); const hi = Math.ceil(idx); return means[lo] + (means[hi] - means[lo]) * (idx - lo); };
    return [Number(q(0.025).toFixed(4)), Number(q(0.975).toFixed(4))];
}
function mcnemarExact(aWins, bWins) {
    const n = aWins + bWins;
    if (n === 0) return { n_discordant: 0, p_value: 1 };
    const logFact = (k) => { let s = 0; for (let i = 2; i <= k; i += 1) s += Math.log(i); return s; };
    const binomPmf = (k) => Math.exp(logFact(n) - logFact(k) - logFact(n - k) + n * Math.log(0.5));
    let tail = 0;
    for (let k = 0; k <= Math.min(aWins, bWins); k += 1) tail += binomPmf(k);
    return { n_discordant: n, p_value: Number(Math.min(1, 2 * tail).toFixed(6)) };
}
function pairedPermutation(x, y, iterations = 20000, seed = 999) {
    const diffs = x.map((v, i) => v - y[i]).filter((d) => Number.isFinite(d));
    const observed = Math.abs(mean(diffs));
    const rand = makePrng(seed);
    let extreme = 0;
    for (let i = 0; i < iterations; i += 1) {
        let acc = 0;
        for (const d of diffs) acc += (rand() < 0.5 ? -d : d);
        if (Math.abs(acc / diffs.length) >= observed - 1e-12) extreme += 1;
    }
    return { mean_difference: Number(mean(diffs).toFixed(4)), p_value: Number(((extreme + 1) / (iterations + 1)).toFixed(6)) };
}
function holm(tests) {
    const sorted = [...tests].sort((a, b) => a.p_value - b.p_value);
    const m = sorted.length;
    let prev = 0;
    sorted.forEach((t, i) => { prev = Math.max(prev, Math.min(1, (m - i) * t.p_value)); t.p_holm = Number(prev.toFixed(6)); });
    return tests;
}
const rankOf = (r, s) => (r[s].ok ? r[s].rank : null);
function metricsFor(subset, s) {
    const ranks = subset.map((r) => rankOf(r, s));
    const h1 = ranks.map((x) => hitAt(x, 1)); const h5 = ranks.map((x) => hitAt(x, 5)); const h10 = ranks.map((x) => hitAt(x, 10));
    const rrs = ranks.map(rr);
    const found = ranks.filter((x) => x && x > 0);
    return {
        n: subset.length,
        hit_at_1: Number(mean(h1).toFixed(4)), hit_at_1_ci: bootstrapCI(h1),
        hit_at_5: Number(mean(h5).toFixed(4)), hit_at_5_ci: bootstrapCI(h5),
        hit_at_10: Number(mean(h10).toFixed(4)), hit_at_10_ci: bootstrapCI(h10),
        mrr_at_10: Number(mean(rrs).toFixed(4)), mrr_at_10_ci: bootstrapCI(rrs),
        n_found: found.length,
        mean_rank_when_found: found.length ? Number(mean(found).toFixed(2)) : null,
        errors: subset.filter((r) => !r[s].ok).length,
        zero_result_responses: subset.filter((r) => r[s].ok && r[s].n_returned === 0).length,
    };
}
function comparisons(subset, label) {
    const tests = [];
    for (const [a, b] of [['rbai', 'openalex'], ['rbai', 'pubmed'], ['openalex', 'pubmed']]) {
        const aHit = subset.map((r) => hitAt(rankOf(r, a), 10));
        const bHit = subset.map((r) => hitAt(rankOf(r, b), 10));
        let aOnly = 0; let bOnly = 0;
        for (let i = 0; i < subset.length; i += 1) { if (aHit[i] === 1 && bHit[i] === 0) aOnly += 1; if (aHit[i] === 0 && bHit[i] === 1) bOnly += 1; }
        const mc = mcnemarExact(aOnly, bOnly);
        const perm = pairedPermutation(subset.map((r) => rr(rankOf(r, a))), subset.map((r) => rr(rankOf(r, b))));
        tests.push({
            scope: label, comparison: `${a}_vs_${b}`, hit10_wins_a_only: aOnly, hit10_wins_b_only: bOnly,
            mcnemar_exact_p: mc.p_value, n_discordant: mc.n_discordant, mrr_mean_difference: perm.mean_difference,
            permutation_p: perm.p_value, p_value: mc.p_value,
        });
    }
    return tests;
}
const withoutLatency = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'latency_ms'));
const knownModes = [...new Set(known.map((r) => r.mode))];
const knownByMode = {};
for (const s of SYSTEMS) same(`known-item: overall ${s}`, metricsFor(known, s), withoutLatency(publishedKnown.overall[s]));
for (const m of knownModes) {
    const subset = known.filter((r) => r.mode === m);
    knownByMode[m] = {};
    for (const s of SYSTEMS) {
        knownByMode[m][s] = metricsFor(subset, s);
        same(`known-item: ${m} ${s}`, knownByMode[m][s], withoutLatency(publishedKnown.by_mode[m][s]));
    }
}
let tests = comparisons(known, 'overall');
for (const m of knownModes) tests = tests.concat(comparisons(known.filter((r) => r.mode === m), m));
same('known-item: significance (Holm-corrected)', holm(tests), publishedKnown.significance);

// ══ 4. IDENTIFIER QUERIES (port of probe-identifier-queries-v2.mjs) ════════════════════════════════════════
const ident = readJsonl(path.join(DATA, 'identifier-86.jsonl'));
const publishedIdent = readJson(path.join(RESULTS, 'identifier-86.json'));
const nI = ident.length;
const hitAtI = (k, kk) => ident.filter((r) => r[k].rank != null && r[k].rank <= kk).length / nI;
const mrrI = (k) => ident.reduce((a, r) => a + (r[k].rank != null && r[k].rank <= TOP_K ? 1 / r[k].rank : 0), 0) / nI;
const hitI = (r, k) => r[k].rank != null && r[k].rank <= TOP_K;
function mcnemarI(a, b) {
    let ab = 0; let ba = 0;
    for (const r of ident) { const ha = hitI(r, a); const hb = hitI(r, b); if (ha && !hb) ab += 1; else if (hb && !ha) ba += 1; }
    const nd = ab + ba;
    if (nd === 0) return { wins_a: ab, wins_b: ba, n_discordant: 0, p: 1 };
    const logC = (nn, kk) => { let s = 0; for (let j = 1; j <= kk; j += 1) s += Math.log(nn - kk + j) - Math.log(j); return s; };
    const pmf = (kk) => Math.exp(logC(nd, kk) + nd * Math.log(0.5));
    const obs = pmf(Math.min(ab, ba));
    let p = 0;
    for (let kk = 0; kk <= nd; kk += 1) { const q = pmf(kk); if (q <= obs * (1 + 1e-9)) p += q; }
    return { wins_a: ab, wins_b: ba, n_discordant: nd, p: Math.min(1, Number(p.toFixed(8))) };
}
same('identifier: queries', nI, publishedIdent.summary.n_queries);
for (const arm of ['dense', 'lexical', 'union_rrf']) {
    close(`identifier: ${arm} Hit@1`, hitAtI(arm, 1), publishedIdent.summary.arms[arm].hit_at_1);
    close(`identifier: ${arm} Hit@10`, hitAtI(arm, 10), publishedIdent.summary.arms[arm].hit_at_10);
    close(`identifier: ${arm} MRR@10`, mrrI(arm), publishedIdent.summary.arms[arm].mrr_at_10);
}
same('identifier: keyword vs meaning-based', mcnemarI('lexical', 'dense'), publishedIdent.summary.comparisons.lexical_vs_dense);
same('identifier: union vs meaning-based', mcnemarI('union_rrf', 'dense'), publishedIdent.summary.comparisons.union_vs_dense);
same('identifier: union vs keyword', mcnemarI('union_rrf', 'lexical'), publishedIdent.summary.comparisons.union_vs_lexical);
const complementarity = {
    both: ident.filter((r) => hitI(r, 'dense') && hitI(r, 'lexical')).length,
    dense_only: ident.filter((r) => hitI(r, 'dense') && !hitI(r, 'lexical')).length,
    lexical_only: ident.filter((r) => !hitI(r, 'dense') && hitI(r, 'lexical')).length,
    neither: ident.filter((r) => !hitI(r, 'dense') && !hitI(r, 'lexical')).length,
};
same('identifier: which mode found the paper', complementarity, publishedIdent.summary.complementarity);

// ══ DATA INTEGRITY: every released file is byte-for-byte the one MANIFEST.json describes ═══════════════════
{
    const { createHash } = await import('node:crypto');
    const manifest = readJson(path.join(HERE, 'MANIFEST.json'));
    for (const f of manifest.files) {
        const buf = fs.readFileSync(path.join(HERE, '..', f.path));
        same(`manifest: ${f.path} unchanged`, createHash('sha256').update(buf).digest('hex'), f.sha256);
    }
}

// ══ OTHER EXPERIMENTS: every file in results/figures is rebuilt from the released files ════════════════════
{
    const { buildFigures } = await import('./figures.mjs');
    const figures = buildFigures(HERE);
    const dir = path.join(RESULTS, 'figures');
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    same('figures: the same experiments as released', onDisk, Object.keys(figures).map((k) => `${k}.json`).sort());
    for (const [name, value] of Object.entries(figures)) {
        checks += 1;
        const file = path.join(dir, `${name}.json`);
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== `${JSON.stringify(value, null, 2)}\n`) {
            failures.push(`results/figures/${name}.json differs from what figures.mjs builds from the released files`);
        }
    }
    console.log(`\nOther experiments: ${Object.keys(figures).length} figure files rebuilt from the released files`);
}

// ══ README TABLES ══════════════════════════════════════════════════════════════════════════════════════════
const f3 = (x) => x.toFixed(3);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
/** A Markdown table. The best value is bold per column (rows are systems) or per row (columns are systems). */
function table(header, rows, cols, fmt, bestBy = 'column') {
    const fmtOf = (i) => (Array.isArray(fmt) ? fmt[i] : fmt);
    const colBest = cols.map((c) => Math.max(...rows.map((r) => r.values[c])));
    const lines = [`| ${header.join(' | ')} |`, `|---|${cols.map(() => '---:').join('|')}|`];
    for (const r of rows) {
        const rowBest = Math.max(...cols.map((c) => r.values[c]));
        lines.push(`| ${r.label} | ${cols.map((c, i) => {
            const v = r.values[c];
            const best = bestBy === 'row' ? v === rowBest : v === colBest[i];
            return best ? `**${fmtOf(i)(v)}**` : fmtOf(i)(v);
        }).join(' | ')} |`);
    }
    return lines;
}
const LABEL = {
    rbai_semantic: 'RBAi Scholar, meaning-based', rbai_hybrid: 'RBAi Scholar, hybrid', rbai_keyword: 'RBAi Scholar, keyword',
    openalex_semantic: 'OpenAlex, meaning-based', openalex_keyword: 'OpenAlex, keyword', pubmed_keyword: 'PubMed',
};
const gradedTable = table(['System', 'Hit@1', 'MRR@10', 'P@10', 'nDCG@10'],
    ['rbai_semantic', 'rbai_hybrid', 'rbai_keyword', 'openalex_semantic', 'openalex_keyword', 'pubmed_keyword'].map((a) => ({ label: LABEL[a], values: gradedArms[a] })),
    ['hit_at_1', 'mrr_at_10', 'precision_at_10', 'ndcg_at_10'], f3);
const depthTable = table(['System', 'Hit@10', 'Hit@20', 'Hit@50'],
    ['rbai_hybrid', 'rbai_keyword', 'rbai_semantic', 'openalex_keyword', 'openalex_semantic', 'pubmed_keyword'].map((a) => ({ label: LABEL[a], values: depthSummary[a] })),
    ['hit_at_10', 'hit_at_20', 'hit_at_50'], f3);
const knownTable = table(['Query', 'RBAi Scholar', 'OpenAlex', 'PubMed'],
    [['paraphrase', 'A question in the researcher\'s own words (120)'], ['verbatim-control', 'The first 350 characters of the abstract (120)']]
        .map(([m, label]) => ({ label, values: Object.fromEntries(SYSTEMS.map((s) => [s, knownByMode[m][s].hit_at_10])) })),
    SYSTEMS, pct, 'row');
const identTable = table(['Mode', 'Hit@1', 'Hit@10', 'Papers found only by this mode'],
    [['lexical', 'Keyword', 'lexical_only'], ['dense', 'Meaning-based', 'dense_only']].map(([arm, label, only]) => ({
        label, values: { h1: hitAtI(arm, 1), h10: hitAtI(arm, 10), only: complementarity[only] },
    })), ['h1', 'h10', 'only'], [pct, pct, String]);

console.log(`\nGraded relevance: ${N} questions, top ${TOP_K}, ${judgements.length.toLocaleString('en-US')} judged pairs\n`);
console.log(gradedTable.join('\n'));
console.log(`\nRetrieval depth: is the paper the question was written from in the top N? (${depthQuestions} questions)\n`);
console.log(depthTable.join('\n'));
console.log(`\nKnown-item retrieval: Hit@10 (${known.length} queries)\n`);
console.log(knownTable.join('\n'));
console.log(`\nShort identifier queries (${nI})\n`);
console.log(identTable.join('\n'));

console.log(`\n${failures.length ? `✗ ${failures.length} of ${checks} checks FAILED` : `✓ all ${checks} checks passed: every figure above was recomputed from benchmark/data and matches the published results`}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
