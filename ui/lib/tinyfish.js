import { promises as fs } from 'fs';
import path from 'path';
import { ROOT } from './repo';

// Read the TinyFish key from the repo's .env (Next doesn't auto-load the parent .env).
let cached;
async function getKey() {
  const fromEnv = process.env.TINYFISH_API_KEY;
  if (fromEnv && fromEnv !== 'your_tinyfish_api_key_here') return fromEnv;
  if (cached !== undefined) return cached;
  try {
    const env = await fs.readFile(path.join(ROOT, '.env'), 'utf-8');
    const m = env.match(/^TINYFISH_API_KEY=(.+)$/m);
    cached = m ? m[1].trim() : null;
  } catch { cached = null; }
  return cached;
}

async function requireKey() {
  const k = await getKey();
  if (!k || k === 'your_tinyfish_api_key_here') {
    throw new Error('TINYFISH_API_KEY missing in .env (get a free key at agent.tinyfish.ai)');
  }
  return k;
}

export async function tfSearch(query, { page = 0 } = {}) {
  const key = await requireKey();
  const u = new URL('https://api.search.tinyfish.ai');
  u.searchParams.set('query', query);
  u.searchParams.set('page', String(page));
  const r = await fetch(u, { headers: { 'X-API-Key': key } });
  if (!r.ok) throw new Error(`Search ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function tfFetch(urls, { format = 'markdown', links = false } = {}) {
  const key = await requireKey();
  const list = (Array.isArray(urls) ? urls : [urls]).slice(0, 10);
  const body = { urls: list, format };
  if (links) body.links = true;
  const r = await fetch('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Fetch ${r.status}: ${await r.text()}`);
  return r.json();
}

// Best-effort company emails: resolve domain → scrape homepage/contact for
// mailto/emails → plus common role-pattern guesses. Honest: partial accuracy.
export async function findEmails(company, website) {
  let domain = '';
  const setDomain = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); if (!/ashbyhq|greenhouse|lever|workatastartup|wellfound|linkedin|crunchbase|wikipedia|twitter|x\.com|facebook|github/i.test(h)) domain = h; } catch {} };
  if (website) setDomain(website);
  if (!domain) {
    try {
      const res = await tfSearch(`${company} official website`, { page: 0 });
      const hit = (res.results || []).find((r) => { try { return !/ashbyhq|greenhouse|lever|linkedin|wellfound|crunchbase|wikipedia|twitter|facebook|github|producthunt/i.test(r.url); } catch { return false; } });
      if (hit) setDomain(hit.url);
    } catch {}
  }
  const found = new Set();
  if (domain) {
    try {
      const d = await tfFetch([`https://${domain}`, `https://${domain}/contact`], { format: 'markdown', links: true });
      for (const r of d.results || []) {
        const blob = (r.text || '') + ' ' + (r.links || []).join(' ');
        for (const m of blob.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
          const e = m[0].toLowerCase();
          if (/\.(png|jpe?g|gif|svg|webp|woff2?)$/.test(e)) continue;
          if (/@(yourcompany|example|yourdomain|domain|email|company|sentry|wixpress|test)\./.test(e)) continue; // placeholders
          if (e.endsWith('@' + domain)) found.add(e);
        }
      }
    } catch {}
  }
  const guessed = domain ? ['careers', 'jobs', 'hello', 'contact', 'team'].map((p) => `${p}@${domain}`) : [];
  return { domain, found: [...found].slice(0, 8), guessed };
}

// Engine 3 — find decision-makers at a company via LinkedIn search.
export async function findContacts(company) {
  const groups = [
    { label: 'Founders / Execs', q: `site:linkedin.com/in "${company}" (founder OR "co-founder" OR CEO OR CTO)` },
    { label: 'Eng leaders', q: `site:linkedin.com/in "${company}" ("engineering manager" OR "head of engineering" OR "VP Engineering" OR "tech lead")` },
    { label: 'Recruiting / People', q: `site:linkedin.com/in "${company}" (recruiter OR "talent" OR "people ops" OR "technical sourcer")` },
  ];
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    let res;
    try { res = await tfSearch(g.q, { page: 0 }); } catch { continue; }
    const people = (res.results || [])
      .filter((r) => /linkedin\.com\/in\//i.test(r.url || ''))
      .filter((r) => (seen.has(r.url) ? false : seen.add(r.url)))
      .slice(0, 5)
      .map((r) => {
        const clean = (r.title || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
        const parts = clean.split(/\s+[-–—]\s+/);
        return { name: parts[0] || clean, role: parts.slice(1).join(' – '), url: r.url };
      });
    out.push({ group: g.label, people });
  }
  return out;
}

export function guessCompany(title, siteName) {
  const m = (title || '').match(/(?:\bat|@|–|—|-|\|)\s+([A-Z][\w .&'/-]{1,40})\s*$/);
  if (m) return m[1].trim();
  return (siteName || 'unknown').replace(/\.(com|io|co|ai|app|net)$/i, '');
}

// Aggregator boards (RemoteOK, WeWorkRemotely, Himalayas, Remote Rocketship)
// were removed as scan sources — they resurface stale/reposted listings — so
// their patterns are intentionally gone. A stray aggregator URL now reads as
// a non-posting.
const POSTING_PATTERNS = [
  /jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{8,}/i,
  /greenhouse\.io\/[^/]+\/jobs\/\d+/i,
  /wellfound\.com\/jobs\/\d+/i,
  /workatastartup\.com\/jobs\/\d+(?:$|[?#])/i,
  /jobs\.lever\.co\/[^/]+\/[0-9a-f-]{8,}/i,
];
const isPosting = (url) => POSTING_PATTERNS.some((re) => re.test(url));

export async function expandListing(url) {
  const data = await tfFetch([url], { format: 'markdown', links: true });
  const res = data.results?.[0];
  if (!res) throw new Error(data.errors?.[0]?.error || 'could not fetch listing');
  const labels = new Map();
  for (const m of (res.text || '').matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (!labels.has(m[2])) labels.set(m[2], m[1].trim());
  }
  const seen = new Set();
  const out = [];
  for (const u of new Set([...(res.links || []), ...labels.keys()])) {
    if (!isPosting(u)) continue;
    const clean = u.split('?')[0].split('#')[0];
    if (seen.has(clean)) continue;
    seen.add(clean);
    const title = (labels.get(u) || clean.split('/').filter(Boolean).pop().replace(/[-_]/g, ' ')).trim();
    out.push({ url: clean, company: guessCompany(title, new URL(u).hostname), title });
  }
  return out;
}
