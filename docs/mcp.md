# RBAi Scholar in your AI assistant (MCP)

| | |
|---|---|
| Endpoint | `https://scholar.thedreamlabinnovations.com/v1/mcp` (Streamable HTTP) |
| Sign in (OAuth) | clients with OAuth (claude.ai, Claude Desktop, ChatGPT) need only the URL: on the first search they open the RBAi Scholar sign-in page, you enter your email and the one-time code, and click Allow. Searches then use your own account's daily allowance. No key to copy |
| Key | still works everywhere: `Authorization: Bearer rbai_sk_…` or `x-api-key: rbai_sk_…`, or, for a client that cannot set headers, in the URL: `…/v1/mcp?key=rbai_sk_…` |
| Without a key or sign-in | a client can connect and list the tools, so you can check the setup; a search answers HTTP 401, which tells an OAuth client to sign you in |
| Get a key | free at <https://thedreamlabinnovations.com/rbai-scholar#quickstart> (20 searches a day); signing in with a new email creates the same free account |

Your assistant decides when to search; you ask in plain language, for example *"find recent papers on
alpha-synuclein aggregation in Parkinson's"* or *"papers on BRCA1 and homologous recombination, 2020 onwards,
open access only"*.

## Tools

| Tool | Use it for |
|---|---|
| `search_corpus` | a question in plain language: matched by meaning, ranked with similarity, term overlap, citations and recency. Put a term in quotes to require it (hybrid): `role of "MDM2" in stabilising mutant p53` |
| `search_corpus_keyword` | exact terms: gene symbols (`TP53`), variants (`p.Gly12Asp`, `rs334`), accessions, `"quoted phrases"`, `AND` / `OR` / `NOT` |
| `get_papers` | up to 50 PubMed IDs or DOIs at once: each paper's record, and which identifiers are not in RBAi Scholar. Your assistant can check that a reference exists, or read a paper you name |
| `find_similar_papers` | one paper (PMID or DOI) in, the papers closest to it in meaning out, the paper itself left out |
| `get_references` | one paper (PMID or DOI) in, the papers it cites that are in RBAi Scholar out, most cited first, with how many works it cites in all |
| `get_citing_papers` | one paper in, the papers in RBAi Scholar that cite it out, most cited first (up to the 500 most cited), with how often it is cited in all |

The two search tools take `query` (required, up to 2,000 characters) and `topK` (default 20, at most 100), and these
optional filters: `yearFrom`, `yearTo`, `isOpenAccess`, `minCitations`, `type`, `oaStatus`, `journal`, `language`,
`author`, and `doi`, `pmid` and `titleSearch` for looking up a known paper (`author`, `journal` and `titleSearch` match
whole words). `find_similar_papers` takes `id` and the same `topK` and filters (not `doi` or `pmid`). Nearly every
paper has the type `article`; to find trials, reviews or guidelines, use `studyType`: one or more of randomized
controlled trial, clinical trial, meta-analysis, systematic review, review, practice guideline, case report and
observational study (PubMed's publication types, so only papers with a PubMed ID have them; clinical trial includes the
randomized ones, review the systematic ones). `find_similar_papers` takes it too. Try: *"Meta-analyses since 2020 on
SGLT2 inhibitors in heart failure."* `get_references` and `get_citing_papers` take `id`, `topK`, `offset` and
`format`; their citation links come from OpenAlex. When a paper's reference list or citing papers are not available
(OpenAlex lists no references for it, or the paper has no DOI or is newer than the links), the tool says so instead of
answering an empty list.

Every tool except `get_papers` takes `offset` for the next page (0, then `topK`, then 2 × `topK`; `offset` + `topK` at
most 200, or 500 for `get_references` and `get_citing_papers`). Every tool takes `format`: leave it out for the
readable list, or ask for `ris` (Zotero, Mendeley, EndNote) or `bibtex` (Zotero, Mendeley, LaTeX) to get a citation
file your assistant can hand you to save, or `json`.
Try: *"Find 20 recent papers on ferroptosis in liver cancer and give me them as RIS for Zotero."*

Each result gives the title, authors, year, journal, DOI, PMID, citations, open-access status, article type, PubMed
study types when it has any, and abstract. With many results the abstracts are shortened (about 160 characters at
100 results), and the answer says so. Titles, abstracts and journal names are plain text: publisher markup such as
`<scp>` or `<sup>` is removed (`Ca<sup>2+</sup>` reads `Ca2+`) and HTML entities are decoded.

Only searches count against your key's daily allowance (20 a day free, 500 with Pro): each call of any of the six
tools. A `get_papers` call of up to 50 identifiers is one search, so checking a whole reference list costs one; a
later page is a search; `format` costs nothing extra. Connecting, listing the tools and the other requests a client
sends never count, and neither does a call that could not run (a missing query or other invalid input, a paper that
is not in RBAi Scholar, a paper whose reference list or citing papers are not available, or an `offset` past the
end). REST searches with the same key share the allowance. When it is used up, a tool answers with a message saying
when the searches come back, and connecting and listing the tools keep working.

A key in the URL works exactly like the header: same allowance, and a header wins if both are sent. Treat that
URL like a password: anyone who has it can search on your allowance. If it leaks, regenerate the key on the key
page and update the URL.

## Claude Code

```bash
claude mcp add --transport http rbai-scholar https://scholar.thedreamlabinnovations.com/v1/mcp \
  --header "Authorization: Bearer rbai_sk_your_key_here"
```

Add `--scope user` to make it available in every project. `claude mcp list` should show it connected.

## claude.ai and Claude Desktop: custom connector

A connector added on claude.ai also appears in Claude Desktop and the mobile apps.

**With sign-in (no key to copy):**

1. Customize → Connectors → Add → **Add custom connector**.
2. Name: `RBAi Scholar`. Remote MCP server URL: `https://scholar.thedreamlabinnovations.com/v1/mcp`
   (nothing after it), then Continue.
3. Authentication: **Sign in when needed** (or *Register automatically*; leave the client ID and secret
   empty). Click Add, then **Connect**.
4. The RBAi Scholar page opens: enter your email, then the 6-digit code from the email, then **Allow**.

To disconnect every app at once, regenerate or delete your key on the RBAi Scholar page; the apps then ask
you to sign in again.

**With a key instead:** use the URL `https://scholar.thedreamlabinnovations.com/v1/mcp?key=rbai_sk_your_key_here`
and Authentication **No sign-in**. If your dialog has a **Request headers** section (in beta for some
organizations), you can leave the key out of the URL: use the bare URL, choose **No sign-in**, and add the
header `x-api-key` with your key as the value (or `authorization` with `Bearer rbai_sk_…`).

## Claude Desktop: configuration file

The alternative to a connector. Claude Desktop's configuration file starts only local programs, so
[`mcp-remote`](https://github.com/geelen/mcp-remote) bridges the two: it runs locally and forwards to the
endpoint with your key. It needs [Node.js](https://nodejs.org) 18 or newer.

Settings → Developer → Edit Config, then add to `claude_desktop_config.json`
([file](../mcp/claude-desktop.json)):

```json
{
  "mcpServers": {
    "rbai-scholar": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.14.3",
        "https://scholar.thedreamlabinnovations.com/v1/mcp",
        "--header",
        "x-api-key:${RBAI_SCHOLAR_KEY}"
      ],
      "env": {
        "RBAI_SCHOLAR_KEY": "rbai_sk_your_key_here"
      }
    }
  }
}
```

Quit Claude Desktop completely and start it again. The header is written without a space on purpose: Claude
Desktop on Windows splits arguments at spaces, and `mcp-remote` fills in `${RBAI_SCHOLAR_KEY}` from `env`.

## ChatGPT

On chatgpt.com (web), where your plan or workspace allows custom MCP servers:

1. Open [Plugins](https://chatgpt.com/plugins), select the plus button, then **Add custom MCP server**.
2. Name: `RBAi Scholar`. Server URL: `https://scholar.thedreamlabinnovations.com/v1/mcp`.
3. Authentication: **OAuth** (ChatGPT registers itself; leave any client ID and secret empty). Accept the risk
   notice, then **Create as a plugin** and install it. The RBAi Scholar page opens: email, 6-digit code,
   **Allow**.

With a key instead: Server URL `https://scholar.thedreamlabinnovations.com/v1/mcp?key=rbai_sk_your_key_here`
and Authentication **No authentication**.

In a chat, type `@` and pick RBAi Scholar. ChatGPT asks before each search; you can let it remember your
answer for the conversation.

## Cursor

`~/.cursor/mcp.json` for every project, or `.cursor/mcp.json` in one ([file](../mcp/cursor.json)):

```json
{
  "mcpServers": {
    "rbai-scholar": {
      "url": "https://scholar.thedreamlabinnovations.com/v1/mcp",
      "headers": {
        "Authorization": "Bearer rbai_sk_your_key_here"
      }
    }
  }
}
```

## VS Code

`.vscode/mcp.json` ([file](../mcp/vscode.json)). VS Code asks for the key the first time the server starts, so
the key is not written into a file you might commit:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "rbai-scholar-key",
      "description": "RBAi Scholar API key (rbai_sk_...)",
      "password": true
    }
  ],
  "servers": {
    "rbai-scholar": {
      "type": "http",
      "url": "https://scholar.thedreamlabinnovations.com/v1/mcp",
      "headers": {
        "Authorization": "Bearer ${input:rbai-scholar-key}"
      }
    }
  }
}
```

## Other clients

Any client that connects to remote MCP servers over HTTP and lets you set a request header works with the
endpoint and one of the two headers above (Windsurf, Cline, Zed, Kiro and others). A client that takes only a
URL works with the `?key=` form. For a client that only starts local servers, use the `mcp-remote`
configuration from the Claude Desktop section.

## When it does not work

| You see | Meaning | Fix |
|---|---|---|
| The tools are listed, but a search answers 401 or "Searching needs you to sign in to RBAi Scholar" | neither a sign-in nor a key reached the server | in claude.ai or ChatGPT choose sign-in / OAuth and connect; otherwise check the header name, or the `?key=` at the end of the URL |
| The app asks you to sign in again | you regenerated or deleted your key, or did not use the app for 30 days | sign in again; it picks up your current key |
| 403, `invalid_api_key` | the key is unknown, revoked, or was issued in the last minute or two | wait two minutes after creating a key; after regenerating, use the new one |
| 404, `not_found` | the URL is wrong | use `https://scholar.thedreamlabinnovations.com/v1/mcp` exactly |
| 429, `mcp_discovery_limit` | over 120 requests in an hour without a key, from one address | add your key, or wait: it resets at the next full hour (the body's `retryAfterSeconds` and `resetsAt` say when) |
| A search answers that no paper close to the question matches the author, journal or title words | that filter is in too many papers to check one by one | add initials or the full name, a year range, or the subject to the question |
| A search answers "You've used today's 20 free RBAi Scholar searches" (or 500 Pro searches) | the day's searches are used up | they come back at 00:00 UTC (5:30 am IST); Pro gives 500 a day |
| 429, `quota_exceeded` | the key sent over 10 times its daily searches in requests of any kind (a client reconnecting in a loop) | it resets at 00:00 UTC (5:30 am IST); check the client's settings |
| 429, `rate_limited` | too many requests in a second | wait a moment and retry |
| Claude Desktop shows no RBAi tools | the bridge did not start | run `node -v` (18 or newer); on Windows, if `npx` is not found, use `"command": "cmd"` with `"/c", "npx"` at the start of `args` |
