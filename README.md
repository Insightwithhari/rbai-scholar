# RBAi Scholar

**Find biomedical papers by what they mean, not only by the words they use.**

Ask in plain language from ChatGPT, Claude, Cursor, VS Code or your own code, and get back real papers from
over 24 million biomedical journal abstracts (more than 20 million of them in PubMed), each with its DOI, authors,
journal, year, citation count and abstract.

[Get a free key](https://thedreamlabinnovations.com/rbai-scholar#quickstart) ·
[Website](https://thedreamlabinnovations.com/rbai-scholar) ·
[Setup for every app](docs/mcp.md) · [REST API](docs/api.md) · [How we tested it](benchmark/README.md)

## Why use it

- **Your words don't have to match the paper's.** Ask *"which protein stops neurons dying after a stroke"*
  and it finds papers that never use those words.
- **Exact terms when you need them.** Gene symbols, variants and accessions (`TP53`, `p.Gly12Asp`, `rs334`),
  `"quoted phrases"`, `AND` / `OR` / `NOT`.
- **Both at once.** Put the term that must appear in quotes inside a question, and only papers that contain
  it come back, ranked by meaning: *role of "MDM2" in stabilising mutant p53*.
- **Filters:** year, journal, author, open access, citation count, language, and study type: trials, meta-analyses,
  reviews, guidelines, case reports, observational studies. Or look up one paper by its
  DOI, PubMed ID or title words.
- **Real papers only.** Every result is a published paper with its DOI, and its PubMed ID when it has one, so your
  assistant points you to papers that exist.
- **Check, expand, save.** Hand it a reference list and it says which PubMed IDs and DOIs are real papers (up to 50
  in one search). Give it one paper and it finds the papers closest to it. Ask which papers in RBAi Scholar it cites,
  or which of them cite it. Ask for the results as RIS or BibTeX and import them into Zotero, Mendeley or EndNote.
- **Free to start:** 20 searches a day with a free key.

## Start in two minutes

### 1. Get a free key

Enter your email at [thedreamlabinnovations.com/rbai-scholar](https://thedreamlabinnovations.com/rbai-scholar#quickstart),
type the code we email you, and copy your key. It starts with `rbai_sk_` and works about a minute later.
ChatGPT and Claude don't need a key: they sign you in with the same email code (step 2).

### 2. Add RBAi Scholar to your app

**ChatGPT or Claude (website, desktop app or phone).** Add a custom connector with this address:

```
https://scholar.thedreamlabinnovations.com/v1/mcp
```

- **Claude:** Customize → Connectors → Add → Add custom connector. Paste the address, choose
  **Sign in when needed**, click Add, then **Connect**. The Free plan allows one custom connector.
- **ChatGPT** (where your plan allows custom MCP servers): Plugins → + → Add custom MCP server. Paste the
  address, choose **OAuth**, then Create as a plugin.

An RBAi Scholar page opens: enter your email, type the 6-digit code we email you, and click **Allow**. Your
searches then use your own account's daily allowance (a new email gets a free account).

Prefer a key? Put it at the end of the address (`…/v1/mcp?key=rbai_sk_your_key_here`) and choose **No sign-in**
in Claude or **No authentication** in ChatGPT. Keep that address to yourself: anyone who has it can spend your
searches.

**Claude Code**

```bash
claude mcp add --transport http rbai-scholar https://scholar.thedreamlabinnovations.com/v1/mcp \
  --header "x-api-key: rbai_sk_your_key_here"
```

**Cursor, Kiro, Windsurf and most other apps** (`mcp.json`):

```json
{
  "mcpServers": {
    "rbai-scholar": {
      "url": "https://scholar.thedreamlabinnovations.com/v1/mcp",
      "headers": { "x-api-key": "rbai_sk_your_key_here" }
    }
  }
}
```

VS Code, Claude Desktop's configuration file and other apps: [docs/mcp.md](docs/mcp.md).

### 3. Ask

Your assistant decides when to search. Try:

- *Find recent papers on how alpha-synuclein spreads between neurons in Parkinson's disease.*
- *What has been found since 2020 about off-target effects of CRISPR base editors?*
- *Papers by Jennifer Doudna on genome editing, 2020 onwards.*
- *Open-access studies on the TP53 R273H mutation.*
- *Highly cited papers on antibiotic resistance in Klebsiella pneumoniae.*
- *Are these real papers: PMID 21376230, 10.1038/s41586-021-03819-2?*
- *Find papers like PMID 21376230 from 2022 onwards, as a RIS file for Zotero.*
- *Which papers cite PMID 21376230, and what does it cite?*
- *Meta-analyses since 2020 on SGLT2 inhibitors in heart failure.*

## Free and Pro

| | Searches | Price |
|---|---|---|
| No key (the website and the REST API) | 10 a day | free |
| Free key | 20 a day | free |
| Pro key | 500 a day | ₹49 a month or ₹490 a year |

One key works in your apps and in the REST API, with one allowance for both. Only searches count: connecting an
app and listing its tools need no key and never use the allowance. Allowances reset at 00:00 UTC (5:30 am in India).

## For programmers: the REST API

```bash
curl -s https://scholar.thedreamlabinnovations.com/v1/corpus/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "how do chaperones prevent protein aggregation", "topK": 3}'
```

That works without a key, 10 searches a day. With a key, add `-H "x-api-key: rbai_sk_your_key_here"`. The
answer is JSON: the ranked papers with their abstracts, and how your query was read.

| Mode | Use it for | Example |
|---|---|---|
| `semantic` (default) | a question in plain language | `which protein stops neurons dying after a stroke` |
| `keyword` | gene symbols, variants, accessions, exact phrases, `AND` / `OR` / `NOT` | `BRCA1 AND "homologous recombination" NOT mouse` |
| hybrid: `semantic` with a term in quotes | a question where one gene, drug or method must be mentioned | `role of "MDM2" in stabilising mutant p53` |

`POST /v1/corpus/papers` looks up to 50 PubMed IDs or DOIs, `POST /v1/corpus/similar` finds the papers closest to one
paper, and `POST /v1/corpus/references` and `POST /v1/corpus/citing` list the papers in RBAi Scholar that a paper cites
or that cite it; all four need a key. Every route takes `format` (`ris` or `bibtex` for a citation file), the searches
and lists take `offset` for the next page, and `/search` and `/similar` take `studyType`.

Every field, filter and error: [docs/api.md](docs/api.md). Python and Node.js examples, no packages needed:
[examples/](examples).

## How well does it work?

We tested it against PubMed, OpenAlex and NIH's LitSense 2.0. Every number can be recomputed from the files in
this repository with one command.

The tests ran on the corpus as it stood on 14 October 2026 (11.26 million records). The live service keeps
adding papers (24.6 million records on 16 November 2026), so the same question asked later can bring back a
slightly different list. On that day we re-sent the same questions to the live service: questions in your own
words found their paper in the top 10 for 63.8% (65.0% on the tested version), questions with one required term
for 93.3% (93.9%), and short identifier queries in keyword mode for 77.9% (79.1%):
[benchmark/results/live-24m-2026-11-16.json](benchmark/results/live-24m-2026-11-16.json). The published numbers
don't change with it: they are recomputed from the saved results in this repository, not from new searches.
Results on newer versions of the corpus will be added as new, dated files next to these, never in their place.

No single mode serves every need, so each was tested on the need it serves:

- **Questions in your own words.** 500 questions were each written about one paper, the way a researcher would ask, without
  reusing the phrases of its abstract. The paper a question came from was in RBAi Scholar's top 10 for 65% of them, against 28% for
  OpenAlex (46% when we asked it again in November 2026, after it moved to the same embedding model), 19% for LitSense 2.0 and
  under 1% for PubMed, and the lead held on the 380 targets kept out of development.
- **A question with one required term.** With the term marked in quotes, hybrid search found the paper in the
  top 10 for 94% of 328 questions, against 42% for LitSense 2.0 given the same term.
- **Short exact queries** (a gene symbol, a compound, an acronym) are what keyword mode is for: it found the
  paper in the top 10 for 79% of 86 such queries, against 35% for meaning-based search.
- **A first page worth reading.** In 4,389 blinded relevance grades, meaning-based search gave the most relevant
  first page, while hybrid search most often put the paper you have in mind first. A second blinded round of 5,752 grades,
  with OpenAlex's lists fetched again in November 2026, confirmed both. In that round our keyword mode's first page scored
  below OpenAlex's current keyword search (nDCG@10 0.384 against 0.449).
- **Expert labels.** On RELISH, ordering candidates labelled by scientists, RBAi Scholar's ranking scored above
  MedCPT's article encoder (nDCG@10 0.843 against 0.796).

Retrieval depth, the comparisons with MedCPT, the three index implementations and the statistics:
[benchmark/README.md](benchmark/README.md). To recompute everything: `node benchmark/score.mjs`
(Node.js 18 or newer, nothing to install).

## Good to know

- It searches titles and abstracts, not full texts.
- It finds papers; it does not judge them. Read the papers your assistant cites before you rely on them.

## When something goes wrong

| You see | What to do |
|---|---|
| a message that searching needs you to sign in or a key | sign in (ChatGPT, Claude) or add your key (step 2) |
| 403, `invalid_api_key` | a new key needs about a minute; after regenerating a key, use the new one |
| "You've used today's 20 free RBAi Scholar searches" in an app, or 429 `quota_exceeded` from the REST API | the day's searches are used up; they come back at 00:00 UTC (5:30 am in India), or upgrade to Pro |

More: [docs/mcp.md](docs/mcp.md#when-it-does-not-work).

## What's in this repository

```
docs/api.md     REST API reference: fields, filters, errors, limits
docs/mcp.md     setup for ChatGPT, Claude, Claude Code, Cursor, VS Code and others
mcp/            those app configurations as files
examples/       Python and Node.js search examples
benchmark/      the evaluation: questions, every system's results, the grades, and the scorer
server.json     the MCP Registry entry
plugin.json, mcp.json   the Agent Plugins package that plugin directories such as cursor.directory read
```

The search service's own code is not published. The benchmark contains no abstract text, because abstracts
belong to their publishers and authors; it has DOIs, PubMed IDs, titles, years and journals instead.

## Cite and licence

If you use RBAi Scholar or its benchmark in your work, please cite this repository: [CITATION.cff](CITATION.cff)
(GitHub's "Cite this repository" button gives ready formats). A paper describing the benchmark is in preparation.

Code (the scorer, examples and configurations) is MIT. The benchmark data, results, figures and documentation
are CC BY 4.0. Bibliographic metadata comes from OpenAlex (CC0) and PubMed. See [LICENSE](LICENSE).

Made by [The Dream Lab Innovations](https://thedreamlabinnovations.com).
