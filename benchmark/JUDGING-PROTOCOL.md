# Relevance judging protocol

This is the procedure used to produce the graded relevance judgements behind Precision@10 and
nDCG@10. It is written out in full because the judgements are the one part of the benchmark that
cannot be recomputed from a database — they have to be trusted, so the conditions under which they
were made have to be inspectable.

## What is being judged

A **judging item** is a pair: one question, and one candidate document described by its title and
abstract. The judge assigns the pair a grade from 0 to 3 and writes a reason for that grade.

## What the judge can and cannot see

Visible:

- the question, exactly as it was sent to the search systems
- the document's title
- the document's abstract, when one is available

Withheld:

- which system returned the document, or whether more than one did
- the position the document was ranked at
- the DOI, PubMed identifier, journal, publication year and citation count
- whether the document is the paper the question was originally written from

The withholding is the point. Every one of those fields would let a grade be inferred from
something other than whether the document answers the question. Rank and system name would leak
the result being measured; journal and citation count would substitute prestige for relevance;
knowing which paper the question came from would turn one item per question into a giveaway.

## Grading scale

| Grade | Meaning |
|---|---|
| **3** | Directly answers the question. The paper's own subject and findings address exactly what was asked. A researcher would cite this as the answer. |
| **2** | Substantially relevant. Addresses the question and supplies a real part of the answer, or answers it for a closely related system, organism or condition. |
| **1** | Marginally relevant. Same general subject area. Useful background or context, but does not address what was asked. |
| **0** | Not relevant. A different subject, or shares only generic vocabulary with the question. |

**Relevant** means grade 2 or 3. That threshold is what Precision@10 counts.

The scale is graded rather than yes/no on purpose. nDCG exists to reward *how* relevant a result
is and *how near the top* it sits; collapsing the scale to a binary throws away the first half of
that and makes the metric a more expensive way of computing Precision@10.

## Gain and discount

A document at rank *i* with grade *g* contributes

```
gain(g) / log2(i + 1)        where gain(g) = 2^g − 1  →  0, 1, 3, 7
```

The exponential gain means a grade 3 is worth more than two grade 2s, which matches how a reader
values one exactly-right paper over two nearly-right ones. The logarithmic discount means rank 1
is worth about 2.6 times rank 10.

## Reasons are mandatory

Every grade carries a written reason naming what in the abstract justified it. Two purposes:

1. It makes the judgement auditable. A grade alone is an assertion; a grade with a reason can be
   disagreed with specifically.
2. It forces the abstract to be read. A judge that skims and pattern-matches on shared vocabulary
   produces reasons that do not survive being read back, which is detectable.

## Order and grouping

Documents are grouped by question, so one information need is held in mind while its candidates
are compared. This mirrors standard assessor practice and applies the scale more consistently than
re-presenting the same question hundreds of times in isolation.

Within each question, document order is shuffled with a fixed seed (20260908). Without the
shuffle, grouping would reintroduce exactly what blinding removes: the first documents listed
would tend to be the highest-ranked ones, and position would leak rank.

## Which documents get judged, and what that leaves out

The judged set is the **pool**: the union of the top 10 from every system, plus the paper each
question was written from, deduplicated so one paper is one item.

Deduplication matches on DOI, then PubMed identifier, then a normalised title with punctuation,
case and spacing removed. Three services do not supply the same identifiers for the same paper, so
matching on DOI alone would grade some papers twice and score two systems against two different
grades for the same document.

Anything outside the pool is scored as grade 0. This is the standard consequence of pooling and it
is a genuine limitation: a relevant paper that no system returned is never discovered, so it never
enters the ideal ranking that nDCG divides by. Every nDCG figure here is therefore measured against
the best of what was collectively found, not against the best that exists. The limitation applies
identically to every system compared, which is what keeps the comparison fair even though the
absolute values are optimistic.

## Documents with no abstract

OpenAlex returns records for which it holds no abstract text, usually because the publisher does
not permit redistribution. Those documents are kept in the pool, flagged, counted, and judged on
their title alone.

Discarding them was rejected. It would quietly delete the weakest results of one system only, and
the title is genuinely all a reader would receive, so grading on the title is not a handicap
imposed by the experiment — it is the experience being measured.

## Checks applied before any score is computed

Scoring was refused unless all of the following held (`score.mjs` checks them again on the released
judgements):

- every pooled document has exactly one grade, with no gaps and no duplicates
- no grade refers to a document that is not in the pool
- every grade is 0, 1, 2 or 3
- every grade carries a reason of at least 25 characters
- at least three of the four grade levels are used, so a judge that graded everything the same is
  caught rather than averaged
- **the paper each question was written from is graded relevant at least 80% of the time.** These
  papers answer their question by construction, so this is the check on the judge rather than on
  the systems. Failing it means the task was misread and every other grade is suspect.

## Who judged

The assessor was Claude Opus 5 (Anthropic) at maximum thinking effort, as recorded by the authors on 3 Oct 2026. The grades
were given by separate, blinded instances of the model, not by the instance that ran the benchmark, and not by a system
belonging to any of the organisations whose search services are being compared. Each batch was judged independently, with
no access to any other batch's grades, to the retrieval results, or to the metric definitions.

A second judging round on 17 November 2026 graded the whole pool again, with OpenAlex's re-queried lists added, under this
rubric and blinding, with Claude Haiku 5.5 as the assessor (`data/round2-2026-11-17.jsonl.gz`).
