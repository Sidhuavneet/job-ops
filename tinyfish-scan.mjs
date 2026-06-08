// tinyfish-scan.mjs — board discovery via TinyFish's free Search + Fetch.
// Higher coverage than the built-in WebSearch tool (paginated, real-browser fetch).
//
// Usage:
//   node tinyfish-scan.mjs "<query>"          dry-run: search + print results
//   node tinyfish-scan.mjs "<query>" --write  also append new roles to pipeline.md
//   node tinyfish-scan.mjs --all              run all enabled portals.yml queries (dry-run)
//   node tinyfish-scan.mjs --all --write      run them and persist
//   node tinyfish-scan.mjs --fetch <url>      demo: fetch clean markdown of a URL
//   [--pages N]                               search depth per query (default 2, max 11)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';
import { tfSearch, tfFetch, hasKey } from './tinyfish.mjs';

const PORTALS = 'portals.yml';
const PIPELINE = 'data/pipeline.md';
const HISTORY = 'data/scan-history.tsv';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const write = flag('--write');
const verify = flag('--verify');   // Playwright liveness gate → drop stale/dead board results
const pages = Math.min(Number(opt('--pages', '2')) || 2, 11);

// Work-authorization markers (board results carry these in title/snippet). Used to
// drop e.g. "US citizens only" roles a global-remote candidate can't take.
const US_AUTH = /(u\.?s\.?\s*citizens?|us[-\s]?only|u\.?s\.?\s*based\b|must (be|reside)[^,.]{0,25}(u\.?s\.?|united states)|authoriz\w+ to work in (the )?(u\.?s\.?|us|united states)|green\s?card|requires? us work|us work authorization)/i;

function loadConfig() {
  const c = yaml.load(readFileSync(PORTALS, 'utf-8')) || {};
  const tf = c.title_filter || {};
  return {
    queries: (c.search_queries || []).filter((q) => q.enabled !== false),
    pos: (tf.positive || []).map((s) => s.toLowerCase()),
    neg: (tf.negative || []).map((s) => s.toLowerCase()),
  };
}

function titleOk(title, { pos, neg }) {
  const t = (title || '').toLowerCase();
  const hasPos = pos.length === 0 || pos.some((k) => t.includes(k));
  const hasNeg = neg.some((k) => t.includes(k));
  return hasPos && !hasNeg;
}

// Patterns that identify an INDIVIDUAL job posting (not a category/index page).
// Aggregator boards (RemoteOK, WeWorkRemotely, Himalayas, Remote Rocketship,
// Remotive, Working Nomads, NoDesk) were removed as scan sources — they
// resurface stale/reposted listings — so their patterns are intentionally
// gone. Any stray aggregator URL now reads as a non-posting and is skipped.
const POSTING_PATTERNS = [
  /jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{8,}/i,
  /greenhouse\.io\/[^/]+\/jobs\/\d+/i,
  /wellfound\.com\/jobs\/\d+/i,
  /workatastartup\.com\/jobs\/\d+(?:$|[?#])/i,
  /jobs\.lever\.co\/[^/]+\/[0-9a-f-]{8,}/i,
];
const isPosting = (url) => POSTING_PATTERNS.some((re) => re.test(url));

// Expand a listing/index page into the individual postings linked from it.
// Applies the title filter so only relevant, in-band roles are kept.
async function expand(url, cfg) {
  const data = await tfFetch([url], { format: 'markdown', links: true });
  const res = data.results?.[0];
  if (!res) { console.error(`   ! could not fetch (${data.errors?.[0]?.error || 'error'})`); return []; }
  const labels = new Map();
  for (const m of (res.text || '').matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (!labels.has(m[2])) labels.set(m[2], m[1].trim());
  }
  const candidates = new Set([...(res.links || []), ...labels.keys()]);
  const out = [];
  const seenUrl = new Set();
  for (const u of candidates) {
    if (!isPosting(u)) continue;
    const clean = u.split('?')[0].split('#')[0];
    if (seenUrl.has(clean)) continue;
    seenUrl.add(clean);
    const title = (labels.get(u) || clean.split('/').filter(Boolean).pop().replace(/[-_]/g, ' ')).trim();
    if (cfg && !titleOk(title, cfg)) continue; // respect early-career + relevance filter
    out.push({ url: clean, company: guessCompany(title, new URL(u).hostname), title });
  }
  return out;
}

// Best-effort employer name from a result title; falls back to the board name.
function guessCompany(title, siteName) {
  const m = (title || '').match(/(?:\bat|@|–|—|-|\|)\s+([A-Z][\w .&'/-]{1,40})\s*$/);
  if (m) return m[1].trim();
  return (siteName || 'unknown').replace(/\.(com|io|co|ai|app|net)$/i, '');
}

function loadSeen() {
  const seen = new Set();
  if (existsSync(HISTORY)) {
    for (const line of readFileSync(HISTORY, 'utf-8').split('\n')) {
      const u = line.split('\t')[0]?.trim();
      if (u) seen.add(u);
    }
  }
  if (existsSync(PIPELINE)) {
    for (const m of readFileSync(PIPELINE, 'utf-8').matchAll(/^- \[[ x]\] (\S+)/gm)) seen.add(m[1]);
  }
  return seen;
}

function persist(rows) {
  // pipeline.md — insert under "## Pendientes"
  let md = readFileSync(PIPELINE, 'utf-8');
  const procIdx = md.indexOf('## Procesadas');
  const block = '\n' + rows.map((r) => `- [ ] ${r.url} | ${r.company} | ${r.title}`).join('\n') + '\n';
  md = procIdx === -1 ? md + block : md.slice(0, procIdx) + block + '\n' + md.slice(procIdx);
  writeFileSync(PIPELINE, md, 'utf-8');
  // scan-history.tsv — append (create header if missing)
  if (!existsSync(HISTORY)) writeFileSync(HISTORY, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n', 'utf-8');
  const today = new Date().toISOString().slice(0, 10);
  appendFileSync(HISTORY, rows.map((r) => `${r.url}\t${today}\ttinyfish\t${r.title}\t${r.company}\tNew\t`).join('\n') + '\n', 'utf-8');
}

async function runQueries(queries, cfg) {
  const seen = loadSeen();
  const fresh = [];
  const collected = [];
  for (const q of queries) {
    const label = q.name || q.query;
    process.stdout.write(`\n🔎 ${label}\n`);
    for (let p = 0; p < pages; p++) {
      let res;
      try { res = await tfSearch(q.query, { page: p }); }
      catch (e) { console.error(`   ! ${e.message}`); break; }
      const results = res.results || [];
      if (results.length === 0) break;
      for (const r of results) {
        if (!titleOk(r.title, cfg)) continue;
        if (US_AUTH.test(`${r.title} ${r.snippet || ''}`)) { console.log(`   ⛔ us-auth ${r.title}`); continue; }
        const company = guessCompany(r.title, r.site_name);
        collected.push({ ...r, company });
        const isNew = !seen.has(r.url);
        console.log(`   ${isNew ? '+' : '·'} ${company} | ${r.title}`);
        if (isNew) { seen.add(r.url); fresh.push({ url: r.url, company, title: r.title }); }
      }
    }
  }
  console.log(`\n— ${collected.length} matched, ${fresh.length} new${write ? '' : ' (dry-run; pass --write to save)'}`);
  const toSave = verify && fresh.length ? await verifyLive(fresh) : fresh;
  if (write && toSave.length) { persist(toSave); console.log(`✓ wrote ${toSave.length} to ${PIPELINE}`); }
}

// Liveness gate (opt-in via --verify): board/search results are cached and go
// stale (the "months-old Wellfound" problem). Visit each NEW url with Playwright
// and drop the ones the classifier confirms are expired/dead. 'uncertain'
// (timeout / no-apply) is kept — we only drop confirmed-dead postings.
async function verifyLive(rows) {
  let chromium, checkUrlLiveness;
  try {
    ({ chromium } = await import('playwright'));
    ({ checkUrlLiveness } = await import('./liveness-browser.mjs'));
  } catch (e) {
    console.error(`   ! --verify needs Playwright (run with PLAYWRIGHT_BROWSERS_PATH=0): ${e.message}`);
    return rows; // setup failure → don't silently drop everything
  }
  const browser = await chromium.launch({ headless: true });
  const live = [];
  try {
    const page = await browser.newPage();
    console.log(`\nVerifying liveness of ${rows.length} board result(s) with Playwright (sequential)…`);
    for (const r of rows) {
      let res;
      try { res = await checkUrlLiveness(page, r.url); } catch { res = { result: 'uncertain' }; }
      if (res.result === 'expired') { console.log(`   ❌ stale   ${r.company} | ${r.title}`); continue; }
      console.log(`   ${res.result === 'active' ? '✅ live  ' : '⚠️ keep  '} ${r.company} | ${r.title}`);
      live.push(r);
    }
  } finally { await browser.close(); }
  console.log(`   → ${live.length}/${rows.length} kept (${rows.length - live.length} stale dropped)`);
  return live;
}

async function main() {
  if (!hasKey()) {
    console.error('TINYFISH_API_KEY missing. Get a free key (no card) at https://agent.tinyfish.ai → add to .env');
    process.exit(1);
  }
  if (flag('--fetch')) {
    const url = opt('--fetch');
    const data = await tfFetch([url], { format: 'markdown' });
    const r = data.results?.[0];
    if (!r) { console.error('no content; errors:', JSON.stringify(data.errors)); process.exit(1); }
    console.log(`Title: ${r.title}\nURL: ${r.final_url || r.url}\n--- clean markdown (first 1800 chars) ---\n${(r.text || '').slice(0, 1800)}`);
    return;
  }
  if (flag('--expand')) {
    const cfg = loadConfig();
    const url = opt('--expand');
    const seen = loadSeen();
    const found = await expand(url, cfg);
    const fresh = found.filter((r) => !seen.has(r.url));
    console.log(`\n📄 ${url}\n   ${found.length} relevant postings, ${fresh.length} new${write ? '' : ' (dry-run; pass --write to save)'}`);
    for (const r of found) console.log(`   ${seen.has(r.url) ? '·' : '+'} ${r.company} | ${r.title}`);
    if (write && fresh.length) { persist(fresh); console.log(`✓ wrote ${fresh.length} to ${PIPELINE}`); }
    return;
  }
  if (flag('--expand-all')) {
    const cfg = loadConfig();
    const seen = loadSeen();
    // Listing pages = pipeline URLs that are NOT individual postings.
    const md = readFileSync(PIPELINE, 'utf-8');
    const urls = [...md.matchAll(/^- \[[ x]\] (\S+)/gm)].map((m) => m[1]);
    const listings = [...new Set(urls.filter((u) => !isPosting(u)))];
    console.log(`Expanding ${listings.length} listing pages…`);
    const fresh = [];
    for (const url of listings) {
      let found = [];
      try { found = await expand(url, cfg); } catch (e) { console.log(`   ! ${url}: ${e.message}`); continue; }
      const nu = found.filter((r) => !seen.has(r.url));
      nu.forEach((r) => seen.add(r.url));
      fresh.push(...nu);
      console.log(`   ${url.replace(/^https?:\/\//, '').slice(0, 60)} → +${nu.length}`);
    }
    console.log(`\n— ${fresh.length} new postings from listings${write ? '' : ' (dry-run; pass --write to save)'}`);
    if (write && fresh.length) { persist(fresh); console.log(`✓ wrote ${fresh.length} to ${PIPELINE}`); }
    return;
  }
  const cfg = loadConfig();
  if (flag('--all')) return runQueries(cfg.queries, cfg);
  const query = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--pages');
  if (!query) { console.error('Provide a "query", or --all, or --fetch <url>'); process.exit(1); }
  return runQueries([{ name: query, query }], cfg);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
