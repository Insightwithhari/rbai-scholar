/**
 * figures.mjs — the values each figure of the benchmark would plot, with 95% intervals, built from the released
 * files alone. No dependencies; Node.js 18 or newer.
 *
 *   import { buildFigures } from './figures.mjs';  buildFigures('<path to benchmark/>')  ->  { <experiment>: {...} }
 *
 * The export writes results/figures/<experiment>.json with this function, and score.mjs calls it again on the
 * released files and requires a byte-for-byte match, so every plotted value traces to released rows.
 *
 * WHERE THE INTERVALS COME FROM. An interval published with the experiment is used as published. Where the
 * experiment published none, it is computed here from the released rows with the percentile bootstrap the
 * benchmark's scripts share (stats.mjs: 10,000 resamples of questions, a fixed linear congruential generator
 * seeded at 8191, linear interpolation between order statistics), or, for the 240-query known-item analysis,
 * with that analysis's own bootstrap (seed 12345, same interpolation). Each figure names its method in ci_method.
 */
import fs from 'node:fs';
import path from 'node:path';

const r4 = (x) => Number(Number(x).toFixed(4));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Percentile bootstrap of a mean: 10,000 resamples, LCG seeded at `seed`, interpolated quantiles, 4 dp. */
export function bootstrapInterpolated(v, seed = 8191, iters = 10000) {
    if (!v.length) return [0, 0];
    let s = seed >>> 0;
    const n = v.length;
    const ms = new Float64Array(iters);
    for (let i = 0; i < iters; i += 1) {
        let a = 0;
        for (let j = 0; j < n; j += 1) { s = (s * 1664525 + 1013904223) >>> 0; a += v[Math.floor((s / 0x100000000) * n)]; }
        ms[i] = a / n;
    }
    ms.sort();
    const q = (p) => { const x = (ms.length - 1) * p; const lo = Math.floor(x); const hi = Math.ceil(x); return ms[lo] + (ms[hi] - ms[lo]) * (x - lo); };
    return [Number(q(0.025).toFixed(4)), Number(q(0.975).toFixed(4))];
}
const ci = (v) => bootstrapInterpolated(v, 8191);
const STATS_CI = 'percentile bootstrap over questions, 10,000 resamples, LCG seed 8191, interpolated quantiles (stats.mjs)';

const hitVec = (ranks, k) => ranks.map((x) => (x != null && x <= k ? 1 : 0));
const rrVec = (ranks, k) => ranks.map((x) => (x != null && x <= k ? 1 / x : 0));
/** A proportion or mean with its interval: { value, ci95 }. */
const withCi = (value, vec) => ({ value, ci95: ci(vec) });
const hitWithCi = (ranks, k) => withCi(r4(mean(hitVec(ranks, k))), hitVec(ranks, k));
const mrrWithCi = (ranks, k) => withCi(r4(mean(rrVec(ranks, k))), rrVec(ranks, k));

export function buildFigures(benchDir) {
    const rd = (rel) => JSON.parse(fs.readFileSync(path.join(benchDir, rel), 'utf8'));
    const rdl = (rel) => fs.readFileSync(path.join(benchDir, rel), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const has = (rel) => fs.existsSync(path.join(benchDir, rel));
    const F = {};

    // ── graded relevance (Fig. 3; Tables 1–2), as published and corrected ──────────────────────────────
    if (has('results/graded-relevance-v2.json')) {
        const v1 = rd('results/graded-relevance.json');
        const v2 = rd('results/graded-relevance-v2.json');
        const pick = (a) => ({
            ndcg_at_10: { value: a.ndcg_at_10, ci95: a.ndcg_at_10_ci95 },
            precision_at_10: { value: a.precision_at_10, ci95: a.precision_at_10_ci95 },
            precision_of_returned: a.precision_of_returned,
            hit_at_1: a.hit_at_1,
            hit_at_10: { value: a.hit_at_10, ci95: a.hit_at_10_ci95 },
            mrr_at_10: a.mrr_at_10,
            mean_results_returned: a.mean_results_returned,
        });
        F['graded-relevance'] = {
            experiment: 'graded relevance, 86 questions, top 10 (Fig. 3, Tables 1 and 2)',
            sources: ['results/graded-relevance.json', 'results/graded-relevance-v2.json'],
            ci_method: 'as published: percentile bootstrap over questions, 10,000 resamples, seed 20260908',
            arms: Object.fromEntries(Object.keys(v2.arms).map((a) => [a, {
                is_oracle: v2.arms[a].is_oracle,
                published_every_slot_rule: pick(v1.arms[a]),
                corrected_once_per_list: pick(v2.arms[a]),
                title_only_documents_removed: (({ ndcg_at_10, ndcg_at_10_ci95, precision_at_10, precision_at_10_ci95, title_only_share }) => ({
                    ndcg_at_10: { value: ndcg_at_10, ci95: ndcg_at_10_ci95 }, precision_at_10: { value: precision_at_10, ci95: precision_at_10_ci95 }, title_only_share,
                }))(v2.title_only_sensitivity.arms[a]),
            }])),
        };
    }

    // ── retrieval depth, 86 questions (Fig. 4; Table 3) ─────────────────────────────────────────────────
    if (has('data/depth50.jsonl')) {
        const rows = rdl('data/depth50.jsonl');
        const pub = rd('results/depth50-summary.json');
        F.depth50 = {
            experiment: 'known-item retrieval at depth 50, 86 questions (Fig. 4, Table 3)',
            sources: ['data/depth50.jsonl', 'results/depth50-summary.json'],
            ci_method: STATS_CI,
            arms: Object.fromEntries(pub.arms.map((a) => {
                const ranks = rows.filter((r) => r.system === a).map((r) => r.target_rank);
                return [a, {
                    ...Object.fromEntries([1, 10, 20, 50].map((k) => [`hit_at_${k}`, hitWithCi(ranks, k)])),
                    mrr_at_50: mrrWithCi(ranks, 50),
                    recovered_between_11_and_50: pub.summary[a].recovered_between_11_and_50,
                }];
            })),
        };
    }

    // ── known-item, 240 queries (Fig. 1): overall, by mode, by citation band ────────────────────────────
    if (has('data/known-item-240.jsonl')) {
        const rows = rdl('data/known-item-240.jsonl');
        const pub = rd('results/known-item-240.json');
        const SYS = ['rbai', 'openalex', 'pubmed'];
        const rankOf = (r, s) => (r[s].ok ? r[s].rank : null);
        const bands = [...new Set(rows.map((r) => r.target.citation_band))];
        const m = (o) => ({
            hit_at_1: { value: o.hit_at_1, ci95: o.hit_at_1_ci }, hit_at_5: { value: o.hit_at_5, ci95: o.hit_at_5_ci },
            hit_at_10: { value: o.hit_at_10, ci95: o.hit_at_10_ci }, mrr_at_10: { value: o.mrr_at_10, ci95: o.mrr_at_10_ci },
        });
        F['known-item-240'] = {
            experiment: 'known-item retrieval, 240 queries over 120 targets (Fig. 1)',
            sources: ['data/known-item-240.jsonl', 'results/known-item-240.json'],
            ci_method: 'overall and by mode as published (percentile bootstrap, 10,000 resamples, seed 12345, interpolated); '
                + 'by citation band computed here with the same bootstrap',
            overall: Object.fromEntries(SYS.map((s) => [s, m(pub.overall[s])])),
            by_mode: Object.fromEntries(Object.keys(pub.by_mode).map((mode) => [mode, Object.fromEntries(SYS.map((s) => [s, m(pub.by_mode[mode][s])]))])),
            by_citation_band: Object.fromEntries(bands.map((b) => {
                const sub = rows.filter((r) => r.target.citation_band === b);
                return [b, { n: sub.length, ...Object.fromEntries(SYS.map((s) => {
                    const v = sub.map((r) => (rankOf(r, s) && rankOf(r, s) <= 10 ? 1 : 0));
                    return [s, { hit_at_10: { value: r4(mean(v)), ci95: bootstrapInterpolated(v, 12345) } }];
                })) }];
            })),
        };
    }

    // ── short identifier queries (Fig. 2a, 2b) ──────────────────────────────────────────────────────────
    if (has('data/identifier-86.jsonl')) {
        const rows = rdl('data/identifier-86.jsonl');
        const pub = rd('results/identifier-86.json');
        F['identifier-86'] = {
            experiment: 'short identifier queries, keyword against meaning-based search, 86 queries (Fig. 2a, 2b)',
            sources: ['data/identifier-86.jsonl', 'results/identifier-86.json'],
            ci_method: `${STATS_CI}; the published intervals were drawn with Math.random and cannot be reproduced, so they are not used`,
            arms: Object.fromEntries(['lexical', 'dense', 'union_rrf'].map((a) => {
                const ranks = rows.map((r) => r[a].rank);
                return [a, { hit_at_1: hitWithCi(ranks, 1), hit_at_10: hitWithCi(ranks, 10), mrr_at_10: mrrWithCi(ranks, 10) }];
            })),
            found_only_by: pub.summary.complementarity,
        };
    }

    // ── 500 questions, depth 50 (Table 5) ───────────────────────────────────────────────────────────────
    if (has('data/known-item-500.jsonl')) {
        const rows = rdl('data/known-item-500.jsonl');
        const pub = rd('results/known-item-500.json');
        const ranksOf = (sub, a) => sub.map((r) => r.systems[a].target_rank);
        const block = (sub) => Object.fromEntries(pub.arms.map((a) => {
            const ranks = ranksOf(sub, a);
            return [a, {
                ...Object.fromEntries([1, 5, 10, 20, 50].map((k) => [`hit_at_${k}`, hitWithCi(ranks, k)])),
                mrr_at_10: mrrWithCi(ranks, 10), mrr_at_50: mrrWithCi(ranks, 50),
            }];
        }));
        F['known-item-500'] = {
            experiment: 'known-item retrieval, 500 questions, depth 50 (Table 5)',
            sources: ['data/known-item-500.jsonl', 'results/known-item-500.json'],
            ci_method: STATS_CI,
            all_500: block(rows),
            by_half: Object.fromEntries(['published_120', 'new_380'].map((h) => [h, block(rows.filter((r) => r.half === h))])),
            by_citation_band: Object.fromEntries([...new Set(rows.map((r) => r.citation_band))].sort().map((b) => [b, block(rows.filter((r) => r.citation_band === b))])),
        };
    }

    // ── hybrid retrieval, 332 relevance-marked questions (Table 7) ─────────────────────────────────────
    if (has('data/hybrid-332.jsonl')) {
        const rows = rdl('data/hybrid-332.jsonl');
        const vs = rd('results/hybrid-332-vs-semantic.json');
        const block = (sub) => {
            const ranks = sub.map((r) => r.systems.rbai_hybrid.target_rank);
            return { n: sub.length, ...Object.fromEntries([1, 5, 10, 20, 50].map((k) => [`hit_at_${k}`, hitWithCi(ranks, k)])), mrr_at_10: mrrWithCi(ranks, 10), mrr_at_50: mrrWithCi(ranks, 50) };
        };
        F['hybrid-332'] = {
            experiment: 'hybrid retrieval over 332 relevance-marked questions, depth 50 (Table 7)',
            sources: ['data/hybrid-332.jsonl', 'results/hybrid-332.json', 'results/hybrid-332-vs-semantic.json'],
            ci_method: `${STATS_CI}; the paired MRR@50 intervals as published (same method)`,
            all_332: block(rows),
            by_citation_band: Object.fromEntries([...new Set(rows.map((r) => r.citation_band))].sort().map((b) => [b, block(rows.filter((r) => r.citation_band === b))])),
            paired_with_semantic: vs.paired_on_anchored.mrr_at_50,
            paired_hit_at_10: vs.paired_on_anchored.cutoffs.hit_at_10,
        };
    }

    // ── LitSense 2.0 on the 500 questions (Table 8) ─────────────────────────────────────────────────────
    if (has('data/litsense-500.jsonl') && has('data/known-item-500.jsonl')) {
        const lit = rdl('data/litsense-500.jsonl');
        const ours = new Map(rdl('data/known-item-500.jsonl').map((r) => [r.question_id, r.systems.rbai_semantic]));
        const an = rd('results/litsense-500-analysis.json');
        const theirs = lit.map((r) => (r.systems.litsense.status === 'ok' ? r.systems.litsense.target_rank : null));
        const mine = lit.map((r) => { const s = ours.get(r.question_id); return s && s.status === 'ok' ? s.target_rank : null; });
        F['litsense-500'] = {
            experiment: 'known-item retrieval against LitSense 2.0, the 500 questions of Table 5 (Table 8)',
            sources: ['data/litsense-500.jsonl', 'data/known-item-500.jsonl', 'results/litsense-500-analysis.json'],
            ci_method: `${STATS_CI}; MRR@50 intervals as published (same method)`,
            cutoffs: Object.fromEntries([1, 5, 10, 20, 50].map((k) => [`hit_at_${k}`, { rbai_semantic: hitWithCi(mine, k), litsense: hitWithCi(theirs, k), mcnemar_p: an.cutoffs[`hit_at_${k}`].mcnemar_p }])),
            mrr_at_50: an.mrr_at_50,
            hit_at_10_by_citation_band: an.by_stratum,
        };
    }

    // ── LitSense 2.0 given the marked term (Table 9) ───────────────────────────────────────────────────
    if (has('data/litsense-hybrid-332.jsonl')) {
        const rows = rdl('data/litsense-hybrid-332.jsonl').filter((r) => r.in_common_subset);
        const arms = ['litsense_plain_question', 'litsense_marked_term', 'rbai_semantic', 'rbai_hybrid'];
        F['litsense-hybrid-332'] = {
            experiment: 'LitSense 2.0 on the 332 marked questions, plain and with the term; common subset of 328 (Table 9)',
            sources: ['data/litsense-hybrid-332.jsonl', 'results/litsense-hybrid-332.json'],
            ci_method: STATS_CI,
            n: rows.length,
            arms: Object.fromEntries(arms.map((a) => {
                const ranks = rows.map((r) => (r.systems[a].status === 'ok' ? r.systems[a].target_rank : null));
                return [a, { ...Object.fromEntries([1, 5, 10, 20, 50].map((k) => [`hit_at_${k}`, hitWithCi(ranks, k)])), mrr_at_50: mrrWithCi(ranks, 50) }];
            })),
        };
    }

    // ── MedCPT over our pools (Table 11) ────────────────────────────────────────────────────────────────
    if (has('data/medcpt-500.jsonl') && has('data/medcpt-round2.jsonl')) {
        const r1 = rdl('data/medcpt-500.jsonl');
        const r2 = rdl('data/medcpt-round2.jsonl');
        const p1 = rd('results/medcpt-500.json');
        const p2 = rd('results/medcpt-round2.json');
        const cond = (rows, pubBlock) => {
            const out = {};
            for (const [label, sub, blk] of [['all_queries', rows, pubBlock.over_all_queries], ['target_in_pool', rows.filter((r) => r.target_in_pool), pubBlock.over_queries_with_target_in_pool]]) {
                const scorers = Object.keys(sub[0].systems);
                out[label] = {
                    n: sub.length,
                    mrr_at_50: Object.fromEntries(scorers.map((s) => [s, mrrWithCi(sub.map((r) => r.systems[s].target_rank), 50)])),
                    paired: Object.fromEntries(Object.entries(blk).filter(([k]) => k.startsWith('paired_')).map(([k, v]) => [k, v.mrr_at_50])),
                };
            }
            return out;
        };
        F.medcpt = {
            experiment: 'MedCPT bi-encoder and cross-encoder re-ranking our own candidate pools (Table 11)',
            sources: ['data/medcpt-500.jsonl', 'data/medcpt-round2.jsonl', 'results/medcpt-500.json', 'results/medcpt-round2.json'],
            ci_method: `${STATS_CI}; paired-difference intervals as published (same method)`,
            paraphrased_questions_500: cond(r1, p1),
            identifier_queries_86: cond(r2.filter((r) => r.condition === 'identifier'), p2.identifier),
            term_constrained_questions_328: cond(r2.filter((r) => r.condition === 'hybrid'), p2.hybrid),
        };
    }

    // ── RELISH, re-ranking protocol (Table 10) ─────────────────────────────────────────────────────────
    if (has('results/relish.json')) {
        const a = rd('results/relish.json');
        const b = rd('results/relish-medcpt.json');
        F.relish = {
            experiment: 'RELISH, 1,209 seeds, re-ranking each seed\'s labelled candidates (Table 10)',
            sources: ['results/relish.json', 'results/relish-medcpt.json'],
            ci_method: 'as published: percentile bootstrap over seeds, 10,000 resamples, seed 8191 (stats.mjs)',
            strict: {
                similarity_only: a.summary_similarity_only, deployed_ranker: a.summary_deployed_ranker,
                medcpt_article_encoder: b.summary_medcpt_article_encoder, medcpt_cross_encoder: b.summary_medcpt_cross_encoder,
            },
            map_lenient: {
                similarity_only: a.summary_map_lenient_partial_counts_as_relevant.similarity_only,
                deployed_ranker: a.summary_map_lenient_partial_counts_as_relevant.deployed_ranker,
                medcpt_article_encoder: b.map_convention_probe.lenient_summary,
            },
            litsense_quoted_not_measured: a.litsense_published_for_reference,
        };
    }

    // ── ablations: instruction prefix and depth (Fig. 2c); ranking priors (Table 4) ────────────────────
    if (has('results/ablation-prefix-depth.json')) {
        const a = rd('results/ablation-prefix-depth.json');
        F['ablation-prefix-depth'] = {
            experiment: 'query instruction prefix and candidate depth, 120 questions (Fig. 2c)',
            sources: ['results/ablation-prefix-depth.json'],
            ci_method: 'as published: percentile bootstrap, 10,000 resamples, seed 8191 (stats.mjs); latency recorded, not recomputable',
            arms: Object.fromEntries(Object.entries(a.summary).map(([k, s]) => [k, {
                label: s.label, hit_at_1: { value: s.hit_at_1, ci95: s.hit_at_1_ci }, hit_at_10: { value: s.hit_at_10, ci95: s.hit_at_10_ci },
                mrr_at_10: { value: s.mrr, ci95: s.mrr_ci }, recorded_latency_ms: s.latency_ms,
            }])),
            comparisons: a.comparisons,
        };
    }
    if (has('results/priors-ablation.json')) {
        const p = rd('results/priors-ablation.json');
        F['priors-ablation'] = {
            experiment: 'contribution of each ranking term, candidate pool 400 (Table 4)',
            sources: ['results/priors-ablation.json'],
            ci_method: 'as published: percentile bootstrap, 10,000 resamples, seed 8191 (stats.mjs)',
            modes: Object.fromEntries(Object.entries(p.summary).map(([mode, pools]) => [mode, Object.fromEntries(Object.entries(pools.pool_400).map(([arm, s]) => [arm, {
                n: s.n, hit_at_1: { value: s.hit_at_1, ci95: s.hit_at_1_ci }, hit_at_10: { value: s.hit_at_10, ci95: s.hit_at_10_ci },
                mrr_at_10: { value: s.mrr_at_10, ci95: s.mrr_at_10_ci }, questions_changed: s.queries_with_changed_rank,
            }]))])),
        };
    }

    // ── which term is marked (Table 6) ──────────────────────────────────────────────────────────────────
    if (has('data/hybrid-86-paired.jsonl')) {
        const rows = rdl('data/hybrid-86-paired.jsonl');
        const p = rd('results/hybrid-86-paired.json');
        const rel = rows.map((r) => r.systems.rbai_hybrid_relevance_selected.target_rank);
        const mech = rows.map((r) => r.systems.rbai_hybrid_rarity_selected.target_rank);
        F['hybrid-86-paired'] = {
            experiment: 'what the searcher marks, on identical questions, 86 questions, depth 50 (Table 6)',
            sources: ['data/hybrid-86-paired.jsonl', 'results/hybrid-86-paired.json'],
            ci_method: `${STATS_CI}; MRR@50 intervals as published (same method)`,
            cutoffs: Object.fromEntries([1, 5, 10, 20, 50].map((k) => [`hit_at_${k}`, {
                relevance_selected: hitWithCi(rel, k), rarity_selected: hitWithCi(mech, k), mcnemar_p: p.comparison.cutoffs[`hit_at_${k}`].mcnemar_p,
            }])),
            mrr_at_50: p.comparison.mrr_at_50,
        };
    }

    // ── coverage of the targets in the comparison indexes ───────────────────────────────────────────────
    if (has('data/coverage-120.jsonl')) {
        const c120 = rdl('data/coverage-120.jsonl');
        const c500 = rdl('data/coverage-500.jsonl');
        const one = (rows) => ({
            n: rows.length,
            openalex: { present: rows.filter((r) => r.coverage.openalex === true).length, absent: rows.filter((r) => r.coverage.openalex === false).length, unknown: rows.filter((r) => r.coverage.openalex == null).length },
            pubmed: { present: rows.filter((r) => r.coverage.pubmed === true).length, absent: rows.filter((r) => r.coverage.pubmed === false).length, unknown: rows.filter((r) => r.coverage.pubmed == null).length },
            informed_pubmed_hit_at_10: hitWithCi(rows.map((r) => r.systems.pubmed_informed.target_rank), 10),
        });
        F.coverage = {
            experiment: 'presence of every target in OpenAlex and PubMed, and the informed PubMed baseline',
            sources: ['data/coverage-120.jsonl', 'data/coverage-500.jsonl'],
            ci_method: STATS_CI,
            original_120: one(c120),
            new_380: one(c500),
        };
    }

    // ── term weighting and fusion (Fig. 2d); a marked term on identifier and fluent queries ────────────
    if (has('data/fusion-identifier-86.jsonl')) {
        const rows = rdl('data/fusion-identifier-86.jsonl').filter((r) => r.condition === 'identifier');
        F['fusion-identifier-86'] = {
            experiment: 'BM25, ts_rank, meaning-based and reciprocal rank fusion on 86 identifier queries (Fig. 2d)',
            sources: ['data/fusion-identifier-86.jsonl'],
            ci_method: STATS_CI,
            arms: Object.fromEntries(['vector', 'ts_rank', 'bm25', 'rrf_bm25', 'rrf_tsrank'].map((a) => {
                const ranks = rows.map((r) => r.systems[a].target_rank);
                return [a, { hit_at_1: hitWithCi(ranks, 1), hit_at_10: hitWithCi(ranks, 10), mrr_at_10: mrrWithCi(ranks, 10) }];
            })),
        };
    }
    if (has('data/marked-term-quality.jsonl')) {
        const rows = rdl('data/marked-term-quality.jsonl');
        F['marked-term-quality'] = {
            experiment: 'a marked exact term on identifier queries and on fluent questions, against plain meaning-based search',
            sources: ['data/marked-term-quality.jsonl'],
            ci_method: STATS_CI,
            conditions: Object.fromEntries([...new Set(rows.map((r) => r.condition))].map((c) => {
                const sub = rows.filter((r) => r.condition === c);
                return [c, { n: sub.length, ...Object.fromEntries(['vector', 'hybrid'].map((a) => {
                    const ranks = sub.map((r) => r.systems[a].target_rank);
                    return [a, { hit_at_1: hitWithCi(ranks, 1), hit_at_10: hitWithCi(ranks, 10), mrr_at_10: mrrWithCi(ranks, 10) }];
                })) }];
            })),
        };
    }

    // ── where the marked term sits ─────────────────────────────────────────────────────────────────────
    if (has('data/placement-86.jsonl')) {
        const rows = rdl('data/placement-86.jsonl');
        const hg = rd('results/handplaced-graded-relevance.json');
        const hand = has('data/hybrid-handplaced.jsonl') ? rdl('data/hybrid-handplaced.jsonl') : [];
        const arms = Object.keys(rows[0].systems);
        const handRanks = hand.map((r) => r.systems.rbai_hybrid_hand_placed.target_rank_depth_10);
        F['placement-86'] = {
            experiment: 'placement of the marked term in the question, 86 questions, depth 10',
            sources: ['data/placement-86.jsonl', 'data/hybrid-handplaced.jsonl', 'results/handplaced-graded-relevance.json'],
            ci_method: STATS_CI,
            placements: {
                ...Object.fromEntries(arms.map((a) => {
                    const ranks = rows.map((r) => r.systems[a].target_rank);
                    return [a, { hit_at_1: hitWithCi(ranks, 1), hit_at_10: hitWithCi(ranks, 10), mrr_at_10: mrrWithCi(ranks, 10) }];
                })),
                ...(hand.length ? { hand_placed: { hit_at_1: hitWithCi(handRanks, 1), hit_at_10: hitWithCi(handRanks, 10), mrr_at_10: mrrWithCi(handRanks, 10) } } : {}),
            },
            hand_placed_graded_relevance_as_published: { macro: hg.macro, comparison: hg.comparison, permutation_tests: hg.permutation_tests,
                note: 'scored with every slot earning its paper\'s grade; the hand-placed lists were not stored, so it is not rescored under the once-per-list rule' },
        };
    }

    // ── first-attempt cells only; HNSW ef_search; ranking weights ───────────────────────────────────────
    if (has('results/known-item-216-first-attempt.json')) {
        const a = rd('results/known-item-216-first-attempt.json');
        F['known-item-216-first-attempt'] = {
            experiment: 'the 240 known-item queries restricted to the 216 whose three systems all answered first time',
            sources: ['results/known-item-216-first-attempt.json'],
            ci_method: 'as published: percentile bootstrap, 10,000 resamples, seed 12345, interpolated',
            overall: Object.fromEntries(Object.entries(a.overall).map(([s, o]) => [s, { hit_at_10: { value: o.hit_at_10, ci95: o.hit_at_10_ci }, mrr_at_10: { value: o.mrr_at_10, ci95: o.mrr_at_10_ci } }])),
        };
    }
    if (has('data/efsearch-tuning.jsonl')) {
        const rows = rdl('data/efsearch-tuning.jsonl');
        const p = rd('results/efsearch-tuning.json');
        F['efsearch-tuning'] = {
            experiment: 'HNSW ef_search multiplier sweep, 20 queries',
            sources: ['data/efsearch-tuning.jsonl', 'results/efsearch-tuning.json'],
            ci_method: `${STATS_CI}; latency recorded, not recomputable`,
            multipliers: Object.fromEntries(p.multipliers.map((m) => {
                const ranks = rows.map((r) => r.systems[`ef_search_x${m}`].target_rank);
                return [m, { ef_search: p.summary[m].ef_search, hit_at_10: hitWithCi(ranks, 10), mrr_at_10: mrrWithCi(ranks, 10), recorded_search_ms: p.summary[m].search_ms }];
            })),
        };
    }
    if (has('results/ranking-weight-sensitivity.json')) {
        const w = rd('results/ranking-weight-sensitivity.json');
        F['ranking-weight-sensitivity'] = {
            experiment: 'MRR@50 against each ranking weight, 500 questions (Table 12)',
            sources: ['results/ranking-weight-sensitivity.json'],
            ci_method: 'none: only per-weight aggregates were recorded, so no interval can be drawn',
            deployed_weights: w.deployed_weights,
            sweeps: Object.fromEntries(Object.entries(w.sweeps).map(([k, v]) => [k, v.map((x) => ({ weight: x.weight, mrr_at_50: x.mrr, hit_at_1: x.hit1, hit_at_10: x.hit10 }))])),
        };
    }
    return F;
}
