// discover-companies.mjs — find startups that post on Ashby/Greenhouse/Lever
// (incl. Europe), so they can be added to portals.yml `tracked_companies` and
// scanned directly (clean individual roles, zero-token, no listing-page noise).
//
// Usage:
//   node discover-companies.mjs           dry-run: print newly-discovered company boards
//   node discover-companies.mjs --write   append new companies to portals.yml
//   [--pages N]                           search depth per query (default 2)
import { readFileSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';
import { tfSearch, hasKey } from './tinyfish.mjs';

const PORTALS = 'portals.yml';
const args = process.argv.slice(2);
const write = args.includes('--write');
const pages = Number((args[args.indexOf('--pages') + 1]) || 2) || 2;

// Discovery queries — biased toward funded startups + Europe + remote, on ATSs.
const QUERIES = [
  'site:jobs.ashbyhq.com "AI Engineer" OR "Founding Engineer" remote',
  'site:jobs.ashbyhq.com "Software Engineer" Europe OR remote startup',
  'site:job-boards.eu.greenhouse.io "Software Engineer" OR "AI Engineer"',     // European companies
  'site:job-boards.greenhouse.io "Founding Engineer" OR "Applied AI" remote',
  'site:jobs.lever.co "AI Engineer" OR "Software Engineer" remote',
  'site:jobs.ashbyhq.com "Series A" OR seed AI engineer',                       // funding-stage hint
  'site:jobs.ashbyhq.com (Berlin OR London OR Amsterdam OR Paris) engineer',    // Europe hubs
];

// Extract an ATS *board root* (company) from any posting/listing URL.
function boardFromUrl(u) {
  let m;
  if ((m = u.match(/https:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i)))
    return { slug: decodeURIComponent(m[1]), careers_url: `https://jobs.ashbyhq.com/${m[1]}`, ats: 'ashby' };
  if ((m = u.match(/https:\/\/(job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/i)))
    return { slug: decodeURIComponent(m[2]), careers_url: `https://${m[1]}.greenhouse.io/${m[2]}`, ats: 'greenhouse' };
  if ((m = u.match(/https:\/\/jobs\.lever\.co\/([^/?#]+)/i)))
    return { slug: decodeURIComponent(m[1]), careers_url: `https://jobs.lever.co/${m[1]}`, ats: 'lever' };
  return null;
}

const prettyName = (slug) =>
  slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+(Inc|Ai|Hq|Io)\b/gi, (s) => s.toUpperCase()).trim();

// Skip ATS's own non-company slugs.
const SKIP = new Set(['jobs', 'careers', 'search', 'company', 'companies', 'app', 'www', 'api']);

async function main() {
  if (!hasKey()) { console.error('TINYFISH_API_KEY missing — add it to .env'); process.exit(1); }

  const cfg = yaml.load(readFileSync(PORTALS, 'utf-8')) || {};
  const existing = new Set(
    (cfg.tracked_companies || []).map((c) => (c.careers_url || '').replace(/\/+$/, '').toLowerCase())
  );

  const found = new Map(); // careers_url -> {name, careers_url, ats}
  for (const q of QUERIES) {
    process.stdout.write(`\n🔎 ${q}\n`);
    for (let p = 0; p < pages; p++) {
      let res;
      try { res = await tfSearch(q, { page: p }); } catch (e) { console.error(`   ! ${e.message}`); break; }
      const results = res.results || [];
      if (!results.length) break;
      for (const r of results) {
        const b = boardFromUrl(r.url || '');
        if (!b || SKIP.has(b.slug.toLowerCase())) continue;
        const key = b.careers_url.replace(/\/+$/, '').toLowerCase();
        if (existing.has(key) || found.has(key)) continue;
        const entry = { name: prettyName(b.slug), careers_url: b.careers_url, ats: b.ats };
        found.set(key, entry);
        console.log(`   + ${entry.name}  (${b.ats})  ${b.careers_url}`);
      }
    }
  }

  const list = [...found.values()];
  console.log(`\n— ${list.length} new companies discovered${write ? '' : ' (dry-run; pass --write to add to portals.yml)'}`);

  if (write && list.length) {
    // tracked_companies is the last top-level key → safe to append entries at EOF.
    const block = '\n' + list.map((c) =>
      `  - name: ${c.name}\n    careers_url: ${c.careers_url}\n    enabled: true\n    notes: "auto-discovered ${new Date().toISOString().slice(0, 10)} (${c.ats}); verify funding/stage"`
    ).join('\n') + '\n';
    appendFileSync(PORTALS, block, 'utf-8');
    console.log(`✓ appended ${list.length} companies to ${PORTALS}`);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
