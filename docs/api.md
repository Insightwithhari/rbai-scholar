# REST API

Base URL: `https://scholar.thedreamlabinnovations.com/v1/corpus`

## Keys

Send the key in either header:

```
Authorization: Bearer rbai_sk_…
x-api-key: rbai_sk_…
```

Keys are free at <https://thedreamlabinnovations.com/rbai-scholar#quickstart>, after an emailed code. A new
key starts working about a minute after it is issued (two at most); regenerating a key retires the old one.
`POST /search` also answers without a key, 10 searches a day per address (they come back at 00:00 UTC, 5:30 am IST).

| | Searches | Rate |
|---|---|---|
| No key | 10 a day per address | |
| Free key | 20 a day | 1 a second, bursts of 5 |
| Pro key (₹49 a month) | 500 a day | 2 a second, bursts of 10 |

Daily allowances count searches only and reset at 00:00 UTC (5:30 am IST). A search is one request to
`POST /search`, `POST /papers`, `POST /similar`, `POST /references` or `POST /citing`, or one call of any of the six
MCP tools: a `/papers` request of up to 50 identifiers is one search, a later page (`offset`) is a search, and `format`
costs nothing extra. MCP searches with the same key share the allowance. Connecting an MCP client and listing its tools
never count, and neither does a request refused before it searched: a `400` (a malformed request, or an `offset` past
the end), a `404` (a paper that is not in the collection) or a `422` (a `/similar` paper without a stored embedding, or
a `/references` or `/citing` paper whose list is not available). When the allowance is used up, these routes answer
`429` with `code` `quota_exceeded` and a `Retry-After` header: the seconds until 00:00 UTC. `/papers`, `/similar`,
`/references` and `/citing` need a key; only `/search` answers without one.

## POST /search

```bash
curl -s https://scholar.thedreamlabinnovations.com/v1/corpus/search \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $RBAI_SCHOLAR_KEY" \
  -d '{"query": "BRCA1 \"homologous recombination\"", "mode": "keyword", "topK": 5, "yearFrom": 2015}'
```

| Field | Type | | |
|---|---|---|---|
| `query` | string | required | up to 2,000 characters; longer is cut |
| `mode` | string | `semantic` (default) or `keyword` | |
| `topK` | integer | 1–100, default 20 | |
| `offset` | integer | 0 (default) to 199 | skip this many ranked results: the next page of 20 is `offset` 20. `offset` + `topK` is at most 200, and pages of one query and `topK` never repeat a paper |
| `format` | string | `json` (default), `ris`, `bibtex` | `ris` and `bibtex` return the papers as a citation file instead of JSON ([below](#citation-files-format)) |
| `yearFrom`, `yearTo` | integer | | publication years, inclusive |
| `isOpenAccess` | boolean | | |
| `oaStatus` | string | | open-access status as OpenAlex records it, e.g. `gold`, `green`, `bronze`, `closed` |
| `minCitations` | integer | | |
| `type` | string | | e.g. `article`, which nearly every paper is; to find reviews or trials, use `studyType` |
| `studyType` | string or array | one or more of `randomized controlled trial`, `clinical trial`, `meta-analysis`, `systematic review`, `review`, `practice guideline`, `case report`, `observational study` | papers of any of these PubMed publication types. A type includes its narrower ones, as in PubMed: `clinical trial` also finds randomized controlled trials, `review` also finds systematic reviews. Only papers with a PubMed ID have types |
| `journal` | string | | whole words, case-insensitive |
| `author` | string | | whole words, case-insensitive |
| `language` | string | | e.g. `en` |
| `doi` | string | | exact |
| `pmid` | string | | exact |
| `titleSearch` | string | | whole words, case-insensitive |

**Semantic mode** matches by meaning: write the question as you would ask it. **Keyword mode** matches exact
terms: they are combined with AND unless you write `OR`; `NOT` or `-term` excludes; `"quoted words"` must be
adjacent. A keyword query that matches too many papers to rank in time is declined with a suggestion
(`query_too_broad`, `quoted_term_too_common`); add a more specific term.

### Response

Trimmed, from a real request:

```json
{
  "query": "BRCA1 \"homologous recombination\"",
  "mode": "keyword",
  "topK": 2,
  "count": 2,
  "results": [
    {
      "doi": "10.3791/2468",
      "pmid": "21372787",
      "title": "Identifying the Effects of BRCA1 Mutations on Homologous Recombination using Cells that Express Endogenous Wild-type BRCA1",
      "authors": "Jeffrey D. Parvin, Natsuko Chiba, Derek J.R. Ransburgh",
      "year": "2011",
      "journal": "Journal of Visualized Experiments",
      "abstract": "…",
      "citations": 15,
      "isOpenAccess": true,
      "oaStatus": "bronze",
      "type": "article",
      "language": "en",
      "similarity": null,
      "textRelevance": 27.888,
      "signals": { "semantic": null, "lexical": 1, "citation": 0.4757, "recency": 0.75 },
      "rawScore": 1.0681,
      "relevance": 0.9536
    }
  ],
  "tookMs": 2146,
  "corpusSize": 24610186,
  "keywordExpression": "'BRCA1' & ('homologous' <-> 'recombination')"
}
```

| Field | |
|---|---|
| `results` | ordered by `rawScore`, highest first |
| `similarity` | semantic mode: cosine similarity between the question and the abstract |
| `textRelevance` | keyword mode: the text-match score |
| `signals` | the parts of the ranking, each 0–1: `semantic`, `lexical` (term overlap), `citation`, `recency` |
| `relevance` | `rawScore` divided by the highest score the mode can give, 0–1 |
| `studyTypes` | the paper's PubMed publication types among the eight `studyType` values (left out when it has none) |
| `keywordExpression` | keyword mode: how the query was parsed |
| `corpusSize` | papers in the collection now, as `GET /stats` reports them (left out in the rare answer given before the service has counted them) |

Titles, abstracts and journal names are plain text: publisher markup such as `<scp>` or `<sup>` is removed
(`Ca<sup>2+</sup>` reads `Ca2+`) and HTML entities are decoded.

## POST /papers

Look up papers by PubMed ID or DOI, up to 50 a request: to check that a reference is real, or to read a paper
someone names.

```bash
curl -s https://scholar.thedreamlabinnovations.com/v1/corpus/papers \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $RBAI_SCHOLAR_KEY" \
  -d '{"ids": ["21376230", "https://doi.org/10.1038/S41586-021-03819-2", "10.9999/not-a-doi"]}'
```

| Field | Type | | |
|---|---|---|---|
| `ids` | array of strings | required, 1–50 | PubMed IDs (`21376230`, `PMID: 21376230`, a pubmed.ncbi.nlm.nih.gov link) or DOIs, in any case, with or without `https://doi.org/` or `doi:` |
| `format` | string | `json` (default), `ris`, `bibtex` | |

The answer lists each paper found with the same fields as a search result (no scores), in the order asked, and the
identifiers it could not use:

```json
{
  "requested": 3,
  "count": 2,
  "results": [
    { "requested": "21376230", "matchedBy": "pmid", "doi": "10.1016/j.cell.2011.02.013", "pmid": "21376230",
      "title": "Hallmarks of Cancer: The Next Generation", "authors": "Douglas Hanahan, Robert A. Weinberg",
      "year": "2011", "journal": "Cell", "abstract": "…", "citations": 67073, "isOpenAccess": true,
      "oaStatus": "bronze", "type": "article", "language": "en" }
  ],
  "notFound": ["10.9999/not-a-doi"],
  "unrecognized": [],
  "tookMs": 612
}
```

`notFound`: valid identifiers that are not in RBAi Scholar. That alone does not mean the reference is wrong: RBAi
Scholar holds biomedical journal abstracts, not every publication, so check it at doi.org or PubMed. `unrecognized`:
entries that are neither a PubMed ID nor a DOI. A request whose identifiers are all missing still counts as a search.

## POST /similar

The papers closest in meaning to one paper in the collection, by that paper's own stored embedding.

```bash
curl -s https://scholar.thedreamlabinnovations.com/v1/corpus/similar \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $RBAI_SCHOLAR_KEY" \
  -d '{"id": "21376230", "topK": 10, "yearFrom": 2020}'
```

| Field | Type | | |
|---|---|---|---|
| `id` | string | required | one PubMed ID or DOI |
| `topK`, `offset`, `format` | | as in `POST /search` | |
| `yearFrom`, `yearTo`, `isOpenAccess`, `oaStatus`, `minCitations`, `type`, `studyType`, `journal`, `author`, `language`, `titleSearch` | | as in `POST /search` | `doi` and `pmid` are not taken: `id` names the paper |

The answer has `seed` (the paper you named), `results` in the search result shape, and `ranking`. Papers are
ranked by similarity to the seed plus small citation and recency adjustments (the ranking our RELISH test
measured), and the seed itself is left out. A paper that is not in the collection answers `404`
`paper_not_found`; one in it without a stored embedding (its abstract is too short) answers `422`
`paper_not_searchable`. Neither counts as a search.

## POST /references and POST /citing

A paper's references, or the papers that cite it, among the papers in RBAi Scholar, most cited first. Citation links
come from OpenAlex.

```bash
curl -s https://scholar.thedreamlabinnovations.com/v1/corpus/references \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $RBAI_SCHOLAR_KEY" \
  -d '{"id": "21376230", "topK": 20}'
```

| Field | Type | | |
|---|---|---|---|
| `id` | string | required | one PubMed ID or DOI |
| `topK` | integer | 1–100, default 20 | |
| `offset` | integer | 0 (default) | the next page; `offset` + `topK` is at most 500 |
| `format` | string | `json` (default), `ris`, `bibtex` | as for `/papers` |

```json
{
  "paper": { "requested": "21376230", "doi": "10.1016/j.cell.2011.02.013", "pmid": "21376230",
             "title": "Hallmarks of Cancer: The Next Generation", "year": "2011", "journal": "Cell", "…": "…" },
  "total": 255,
  "inCorpus": 71,
  "listed": 71,
  "topK": 20,
  "count": 20,
  "results": [
    { "rank": 1, "doi": "10.1126/science.1160809", "pmid": "19460998",
      "title": "Understanding the Warburg Effect: The Metabolic Requirements of Cell Proliferation",
      "year": "2009", "journal": "Science", "citations": 16285, "…": "…" }
  ],
  "tookMs": 614,
  "order": "most cited first",
  "source": "OpenAlex referenced_works: the works this paper cites that are papers in the corpus"
}
```

| Field | |
|---|---|
| `paper` | the paper you named, with the `/papers` fields |
| `total` | `/references`: the works it cites, as OpenAlex lists them; `/citing`: its citation count |
| `inCorpus` | how many of those are papers in RBAi Scholar |
| `listed` | how many of them can be paged through: a paper keeps its 500 most cited |
| `results` | each with `rank` and the `/papers` fields, most cited first |

A paper that is not in RBAi Scholar answers `404` `paper_not_found`. When the list is not available, the answer is
`422` `no_citation_data`, never an empty list: for `/references`, when OpenAlex lists no references for the paper; for
both, when the paper has no DOI or is not in the OpenAlex data the citation links were built from (it may be newer).
Neither counts as a search. A paper whose references or citing papers are all outside RBAi Scholar answers `200` with
no `results` and says so in `inCorpus`.

## Citation files (`format`)

`ris` (`application/x-research-info-systems`) imports into Zotero, Mendeley and EndNote. `bibtex`
(`application/x-bibtex`) imports into Zotero, Mendeley and JabRef and works with LaTeX; EndNote has no BibTeX import
of its own, so use RIS there. The file holds the papers of that request (for `/papers`, each paper once; for
`/references` and `/citing`, the page asked for), with title, authors, year, journal, abstract, DOI, link and PMID
(RIS: `AN` with `DB PubMed`; BibTeX: `pmid`, which Zotero puts in Extra), and the study types (RIS `KW`, BibTeX
`keywords`). Headers: `Content-Disposition` with a file name, and `X-RBAi-Count` (for `/papers`, `X-RBAi-Found` and
`X-RBAi-Not-Found`; for `/references` and `/citing`, `X-RBAi-In-Corpus`). Save it with `curl -OJ`.

## GET /stats

Public, no key.

```json
{ "papersIndexed": 24610186, "embeddingModel": "qwen3-embedding-0.6b", "dimensions": 1024, "status": "operational" }
```

## Errors

Every error is JSON with `error` (a sentence) and usually `code`.

| HTTP | `code` | Meaning | What to do |
|---|---|---|---|
| 400 | (none) | the request is malformed: no `query`, an unknown `mode`, `yearFrom` after `yearTo`, an `offset` with `offset` + `topK` over 200, an unknown `format`, more than 50 `ids`, an unknown `studyType`, `offset` + `topK` over 500 on `/references` or `/citing` | fix the request |
| 400 | `query_too_broad`, `quoted_term_too_common` | a keyword query, or an author, journal or title filter, matches too many papers to rank in time | add a more specific term or narrow the filter, as the message suggests |
| 401 | `missing_api_key` | no key, on a route that needs one | send a key |
| 404 | `paper_not_found` | `/similar`, `/references`, `/citing`: the paper is not in RBAi Scholar | check the identifier; not counted |
| 422 | `paper_not_searchable` | `/similar`: the paper is in RBAi Scholar but has no stored embedding | start from another paper; not counted |
| 422 | `no_citation_data` | `/references`, `/citing`: the paper is in RBAi Scholar, but its reference list (or its citing papers) is not available | try the paper's DOI if you used its PMID, or another paper; not counted |
| 403 | `invalid_api_key` | the key is unknown, revoked, or a minute or two old | wait, or use the current key |
| 429 | `anonymous_limit` | the 10 searches a day without a key are used up | they come back at 00:00 UTC (5:30 am IST); the body's `retryAfterSeconds` and `resetsAt` say when (no `Retry-After` header). Or use a free key: 20 a day |
| 429 | `rate_limited` | over the key's per-second rate | wait a moment and retry |
| 429 | `quota_exceeded` | the day's searches are used up | wait for `Retry-After` (00:00 UTC), or upgrade |
| 503 | `busy`, `embedding_unavailable`, `index_unavailable` | temporarily unavailable | retry after `Retry-After` |
| 502 | `worker_error` | an unexpected failure | retry after a few seconds |

Examples in Python and Node.js, no packages needed: [`examples/`](../examples).
