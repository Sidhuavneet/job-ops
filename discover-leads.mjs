// discover-leads.mjs — multi-source COMPANY discovery (Engine 2, wider sources).
// Sources: F6S, Wellfound, YC directory, Product Hunt, LinkedIn, Crunchbase
// (recent seed rounds + VC-portfolio cross-reference). These expose company
// NAMES (not job feeds), so to stay ZERO-NOISE:
//   • verified (ATS board found + name-matched) → added to tracked_companies
//   • everything else → written to data/company-leads.md for review (NOT scraped)
//
// Usage:
//   node discover-leads.mjs                dry-run: show leads
//   node discover-leads.mjs --write        write leads file + add verified companies
//   [--pages N]  search depth (default 1)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';
import { tfSearch, hasKey } from './tinyfish.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const pages = Number(args[args.indexOf('--pages') + 1]) || 1;

// Each source has a regex that matches ONLY a real company/product page URL
// (captures the slug) — this drops category/index/funding-list pages = zero noise.
const SOURCES = [
  { src: 'YC', q: 'site:ycombinator.com/companies (AI OR software OR "developer tools") (W26 OR S25 OR F25)', re: /ycombinator\.com\/companies\/(?!industry\b)([a-z0-9-]+)/i },
  { src: 'Wellfound', q: 'site:wellfound.com/company (AI OR software) (seed OR "series a") remote -funding', re: /wellfound\.com\/company\/([a-z0-9-]+?)(?:\/jobs|\/?$|\?)/i },
  { src: 'ProductHunt', q: 'site:producthunt.com/products (AI agent OR "developer tool") startup', re: /producthunt\.com\/products\/([a-z0-9-]+)/i },
  { src: 'F6S', q: 'site:f6s.com (AI OR software) startup (raised OR seed) -jobs', re: /f6s\.com\/(?!jobs\b|about\b|search\b|programs\b)([a-z0-9-]{3,})(?:\/?$|\?)/i },
  { src: 'LinkedIn', q: 'site:linkedin.com/company (AI OR software) startup (seed OR "series a") hiring', re: /linkedin\.com\/company\/([a-z0-9-]+)/i },
  // Crunchbase /organization/<slug> pages are per-company + indexed (the fund
  // sites themselves are JS portfolio grids with no per-company URLs, so they
  // can't be mined by site: search). Two angles:
  //   1. recently-funded seed/pre-seed startups (funding-recency tracker)
  //   2. VC-portfolio cross-reference — CB org pages name their investors, so
  //      querying a fund's name surfaces its portfolio companies.
  { src: 'Crunchbase', q: 'site:crunchbase.com/organization ("AI agents" OR "applied AI" OR "developer tools" OR "LLM" OR "AI infrastructure" OR "agentic") ("seed" OR "pre-seed")', re: /crunchbase\.com\/organization\/([a-z0-9-]+)/i },
  { src: 'VC-Portfolio', q: 'site:crunchbase.com/organization (AI OR software) ("First Round" OR "Founder Collective" OR "Sequoia" OR "Y Combinator" OR "a16z" OR "Initialized") seed', re: /crunchbase\.com\/organization\/([a-z0-9-]+)/i },
];

const NOISE_TITLE = /(jobs in |best |top \d|funding rounds|valuation|categories|leaderboard|vacancies|opportunities|^f6s$|^product hunt$|startup ideas)/i;
// Investor/fund entities (Crunchbase lists funds as orgs too). A company name
// ending in one of these is the investor, not a hiring target — drop it.
const INVESTOR_NAME = /\b(capital|ventures?|partners|fund|holdings|equity|advisors|vc)\s*$/i;

// Pull a company name from the title; fall back to the URL slug.
function nameFrom(title, slug) {
  let t = (title || '').replace(/\s*\|\s*(F6S|Wellfound|Product Hunt|LinkedIn|Y Combinator|Crunchbase).*$/i, '');
  t = t.split(/\s+[-–—:]\s+/)[0].replace(/\s+(jobs|careers|hiring)$/i, '').trim();
  if (!t || t.length > 40) t = (slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return t;
}
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Try to find a name-matched ATS board (so it's actually scrapable).
function slugMatch(name, slug) {
  const n = norm(name.split(/\s+/)[0]); const s = norm(slug);
  return n.length >= 3 && (s.includes(n) || n.includes(s));
}
async function resolveAts(name) {
  const res = await tfSearch(`"${name}" careers jobs ashbyhq.com OR greenhouse.io OR lever.co`, { page: 0 });
  for (const r of res.results || []) {
    const u = r.url || ''; let m, slug, board;
    if ((m = u.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i))) { slug = m[1]; board = `https://jobs.ashbyhq.com/${m[1]}`; }
    else if ((m = u.match(/(job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/i))) { slug = m[2]; board = `https://${m[1]}.greenhouse.io/${m[2]}`; }
    else if ((m = u.match(/jobs\.lever\.co\/([^/?#]+)/i))) { slug = m[1]; board = `https://jobs.lever.co/${m[1]}`; }
    else continue;
    if (slugMatch(name, slug)) return board;
  }
  return null;
}

async function main() {
  if (!hasKey()) { console.error('TINYFISH_API_KEY missing'); process.exit(1); }
  const seen = new Set();
  const leads = [];
  for (const s of SOURCES) {
    process.stdout.write(`\n🔎 ${s.src}\n`);
    for (let p = 0; p < pages; p++) {
      let res; try { res = await tfSearch(s.q, { page: p }); } catch (e) { console.error('  !', e.message); break; }
      for (const r of res.results || []) {
        const m = (r.url || '').match(s.re);
        if (!m) continue;                          // not a real company page → drop (noise)
        if (NOISE_TITLE.test(r.title || '')) continue;
        const name = nameFrom(r.title, m[1]);
        if (INVESTOR_NAME.test(name)) continue;    // fund/investor entity → drop
        const key = norm(name);
        if (!name || key.length < 3 || seen.has(key)) continue;
        seen.add(key);
        leads.push({ name, source: s.src, url: r.url });
        console.log(`  • ${name}  (${r.url.replace(/^https?:\/\//, '').slice(0, 45)})`);
      }
    }
  }
  console.log(`\n— ${leads.length} unique company leads`);

  if (!write) { console.log('(dry-run — pass --write to save leads + add ATS-verified ones)'); return; }

  // ATS-resolve (guarded) → add verified to tracked_companies.
  const cfg = yaml.load(readFileSync('portals.yml', 'utf-8')) || {};
  const existing = new Set((cfg.tracked_companies || []).map((c) => norm(c.careers_url)));
  const verified = [];
  for (const l of leads) {
    let board = null; try { board = await resolveAts(l.name); } catch {}
    if (board && !existing.has(norm(board))) { verified.push({ ...l, board }); existing.add(norm(board)); }
  }
  if (verified.length) {
    appendFileSync('portals.yml', '\n' + verified.map((v) =>
      `  - name: "${v.name.replace(/"/g, '')}"\n    careers_url: ${v.board}\n    enabled: true\n    notes: "lead via ${v.source}"`).join('\n') + '\n');
  }
  const md = `# Company Leads (multi-source) — ${new Date().toISOString().slice(0, 10)}\n\n` +
    `Verified (added to companies): ${verified.length}\n\n` +
    leads.map((l) => `- **${l.name}** — ${l.source} — ${l.url}${verified.find((v) => v.name === l.name) ? '  ✅ ATS verified' : ''}`).join('\n');
  writeFileSync('data/company-leads.md', md);
  console.log(`\n✓ ${leads.length} leads → data/company-leads.md; ${verified.length} ATS-verified added to tracked_companies`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
