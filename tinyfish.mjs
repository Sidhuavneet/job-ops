// tinyfish.mjs — thin helpers around TinyFish's free Search + Fetch APIs.
// Search: ranked web results for a query. Fetch: renders a URL in a real
// browser and returns clean markdown. Both free (X-API-Key auth, no card).
// Docs: https://docs.tinyfish.ai
import 'dotenv/config';

const KEY = process.env.TINYFISH_API_KEY;
const SEARCH_URL = 'https://api.search.tinyfish.ai';
const FETCH_URL = 'https://api.fetch.tinyfish.ai';

export function hasKey() {
  return Boolean(KEY && KEY !== 'your_tinyfish_api_key_here');
}

function requireKey() {
  if (!hasKey()) {
    throw new Error('TINYFISH_API_KEY missing. Get a free key (no card) at https://agent.tinyfish.ai and add it to .env');
  }
}

// Search → { query, results: [{position, site_name, title, snippet, url}], total_results, page }
export async function tfSearch(query, { location, language, page = 0 } = {}) {
  requireKey();
  const u = new URL(SEARCH_URL);
  u.searchParams.set('query', query);
  if (location) u.searchParams.set('location', location);
  if (language) u.searchParams.set('language', language);
  u.searchParams.set('page', String(page));
  const r = await fetch(u, { headers: { 'X-API-Key': KEY } });
  if (!r.ok) throw new Error(`Search ${r.status}: ${await r.text()}`);
  return r.json();
}

// Fetch → { results: [{url, final_url, title, text, links, ...}], errors: [...] }
export async function tfFetch(urls, { format = 'markdown', links = false, ttl } = {}) {
  requireKey();
  const list = (Array.isArray(urls) ? urls : [urls]).slice(0, 10);
  const body = { urls: list, format };
  if (links) body.links = true;
  if (ttl != null) body.ttl = ttl;
  const r = await fetch(FETCH_URL, {
    method: 'POST',
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Fetch ${r.status}: ${await r.text()}`);
  return r.json();
}
