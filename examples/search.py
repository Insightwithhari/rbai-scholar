"""Search RBAi Scholar from Python 3.8 or newer. No packages needed.

    python search.py how do chaperones prevent protein aggregation
    python search.py --keyword 'BRCA1 AND "homologous recombination"'

Set RBAI_SCHOLAR_KEY to search with your key (20 a day free); without it, 10 searches a day.
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://scholar.thedreamlabinnovations.com/v1/corpus/search"


def search(query, mode="semantic", top_k=5, **filters):
    """POST /v1/corpus/search. Filters: yearFrom, yearTo, isOpenAccess, minCitations, journal, author, ..."""
    body = json.dumps({"query": query, "mode": mode, "topK": top_k, **filters}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("RBAI_SCHOLAR_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    request = urllib.request.Request(API, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        try:
            detail = json.loads(err.read() or b"{}")
        except ValueError:
            detail = {}
        message = detail.get("error") or detail.get("message") or err.reason
        raise SystemExit(f"HTTP {err.code} {detail.get('code', '')}: {message}") from None


def main(argv):
    mode = "keyword" if "--keyword" in argv else "semantic"
    query = " ".join(a for a in argv if a != "--keyword").strip()
    if not query:
        raise SystemExit(__doc__)
    data = search(query, mode=mode)
    print(f"{data['count']} papers, {data['tookMs']} ms ({mode})")
    for paper in data["results"]:
        print(f"{paper.get('year') or '----'}  {paper['title']}")
        if paper.get("doi"):
            print(f"      https://doi.org/{paper['doi']}")


if __name__ == "__main__":
    main(sys.argv[1:])
