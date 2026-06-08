// enrich-companies.mjs — attach a LinkedIn page + short profile to each company,
// so the roles you generate carry company context. Uses TinyFish Search (free).
// Writes data/company-profiles.json keyed by normalized company name; the UI
// reads it and shows a LinkedIn link + blurb next to each role's company.
//
// Usage:
//   node enrich-companies.mjs            enrich all tracked_companies (skips already-done)
//   node enrich-companies.mjs --all      re-enrich even cached ones
//   node enrich-companies.mjs "Acme"     enrich a single company
import { readFileSync, writeFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { tfSearch, hasKey } from './tinyfish.mjs';

const STORE = 'data/company-profiles.json';
const args = process.argv.slice(2);
const force = args.includes('--all');
const single = args.find((a) => !a.startsWith('--'));
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function loadStore() { try { return JSON.parse(readFileSync(STORE, 'utf-8')); } catch { return {}; } }

async function enrich(name, website) {
  const res = await tfSearch(`"${name}" site:linkedin.com/company`, { page: 0 });
  const hit = (res.results || []).find((r) => /linkedin\.com\/company\//i.test(r.url || ''));
  const blurb = (hit?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  return { name, linkedin: hit?.url || '', website: website || '', blurb };
}

async function main() {
  if (!hasKey()) { console.error('TINYFISH_API_KEY missing in .env'); process.exit(1); }
  const store = loadStore();

  let targets;
  if (single) {
    targets = [{ name: single, careers_url: '' }];
  } else {
    const cfg = yaml.load(readFileSync('portals.yml', 'utf-8')) || {};
    targets = (cfg.tracked_companies || []).map((c) => ({ name: c.name, careers_url: c.careers_url }));
  }

  let done = 0;
  for (const t of targets) {
    const key = norm(t.name);
    if (!force && store[key]?.linkedin) { continue; }
    try {
      const p = await enrich(t.name, t.careers_url);
      store[key] = p;
      done++;
      console.log(`  • ${t.name}  →  ${p.linkedin || '(no LinkedIn found)'}`);
    } catch (e) { console.error(`  ! ${t.name}: ${e.message}`); }
  }
  writeFileSync(STORE, JSON.stringify(store, null, 2), 'utf-8');
  console.log(`\n✓ enriched ${done} companies → ${STORE} (${Object.keys(store).length} total)`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
