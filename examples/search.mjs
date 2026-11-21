// Search RBAi Scholar from Node.js 18 or newer (built-in fetch). No packages needed.
//
//   node search.mjs how do chaperones prevent protein aggregation
//   node search.mjs --keyword 'BRCA1 AND "homologous recombination"'
//
// Set RBAI_SCHOLAR_KEY to search with your key (20 a day free); without it, 10 searches a day.
import { pathToFileURL } from 'node:url';

const API = 'https://scholar.thedreamlabinnovations.com/v1/corpus/search';

/** POST /v1/corpus/search. Filters: yearFrom, yearTo, isOpenAccess, minCitations, journal, author, ... */
export async function search(query, { mode = 'semantic', topK = 5, ...filters } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.RBAI_SCHOLAR_KEY) headers.Authorization = `Bearer ${process.env.RBAI_SCHOLAR_KEY}`;
  const res = await fetch(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, mode, topK, ...filters }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${data.code ?? ''}: ${data.error ?? data.message ?? 'request failed'}`);
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const mode = args.includes('--keyword') ? 'keyword' : 'semantic';
  const query = args.filter((a) => a !== '--keyword').join(' ').trim();
  if (!query) {
    console.error('usage: node search.mjs [--keyword] <query>');
    process.exit(2);
  }
  try {
    const data = await search(query, { mode });
    console.log(`${data.count} papers, ${data.tookMs} ms (${mode})`);
    for (const paper of data.results) {
      console.log(`${paper.year || '----'}  ${paper.title}`);
      if (paper.doi) console.log(`      https://doi.org/${paper.doi}`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
