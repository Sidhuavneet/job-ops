#!/usr/bin/env node

// add-company.mjs — add companies to tracked_companies from LinkedIn URLs (or names).
//
// careers_url is OPTIONAL. Given a LinkedIn company URL (or a plain name), this
// tries to resolve a public Greenhouse/Ashby/Lever board via TinyFish search so
// scan.mjs can scrape it zero-token. If no board is found, the company is still
// tracked with just its `linkedin` link (scan.mjs skips it until you add a
// careers_url). This is for the "I'm browsing LinkedIn and want to add this
// company to my watchlist" workflow.
//
// Usage:
//   node add-company.mjs "https://www.linkedin.com/company/acme-ai"
//   node add-company.mjs "Acme AI" "https://linkedin.com/company/foo-labs"
//   node add-company.mjs --file companies.txt
//   node add-company.mjs "Acme AI" --careers https://jobs.ashbyhq.com/acme   (skip resolution)
//   add --write to append to portals.yml (default = dry-run preview)
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import yaml from 'js-yaml';
import { tfSearch, hasKey } from './tinyfish.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const optVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const forcedCareers = optVal('--careers');
const file = optVal('--file');
const FLAGS_WITH_VALUE = new Set(['--careers', '--file']);

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const linkedinSlug = (u) => { const m = (u || '').match(/linkedin\.com\/company\/([^/?#]+)/i); return m ? m[1] : null; };
function titleCase(slug) {
  return slug.replace(/-/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI').replace(/\bMl\b/g, 'ML').replace(/\bApi\b/g, 'API').replace(/\bHq\b/g, 'HQ');
}
const slugMatch = (name, slug) => { const n = norm(name.split(/\s+/)[0]); const s = norm(slug); return n.length >= 3 && (s.includes(n) || n.includes(s)); };

// Resolve a name-matched ATS board → { careers_url, api? } or null.
async function resolveAts(name) {
  let res;
  try { res = await tfSearch(`"${name}" careers jobs ashbyhq.com OR greenhouse.io OR lever.co`, { page: 0 }); }
  catch { return null; }
  for (const r of res.results || []) {
    const u = r.url || ''; let m;
    if ((m = u.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i)) && slugMatch(name, m[1]))
      return { careers_url: `https://jobs.ashbyhq.com/${m[1]}` };
    if ((m = u.match(/(job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/i)) && slugMatch(name, m[2]))
      return { careers_url: `https://${m[1]}.greenhouse.io/${m[2]}`, api: `https://boards-api.greenhouse.io/v1/boards/${m[2]}/jobs` };
    if ((m = u.match(/jobs\.lever\.co\/([^/?#]+)/i)) && slugMatch(name, m[1]))
      return { careers_url: `https://jobs.lever.co/${m[1]}` };
  }
  return null;
}

async function main() {
  // Collect positional inputs (skip flags and their values).
  const inputs = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) { if (FLAGS_WITH_VALUE.has(a)) i++; continue; }
    inputs.push(a);
  }
  if (file) {
    const t = await readFile(file, 'utf-8');
    inputs.push(...t.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
  }
  if (!inputs.length) {
    console.error('Usage: node add-company.mjs "<linkedin-url-or-name>" [more...] [--careers <url>] [--file f] [--write]');
    process.exit(1);
  }

  // Dedup against existing tracked_companies.
  const cfg = existsSync('portals.yml') ? (yaml.load(readFileSync('portals.yml', 'utf-8')) || {}) : {};
  const existing = cfg.tracked_companies || [];
  const seenLinked = new Set(existing.map((c) => norm(c.linkedin)).filter(Boolean));
  const seenCareers = new Set(existing.map((c) => norm(c.careers_url)).filter(Boolean));
  const seenNames = new Set(existing.map((c) => norm(c.name)).filter(Boolean));

  if (!hasKey()) console.log('(no TinyFish key — careers_url won\'t be auto-resolved; companies added with linkedin only)\n');

  const toAdd = [];
  for (const input of inputs) {
    const slug = linkedinSlug(input);
    const linkedin = slug ? `https://www.linkedin.com/company/${slug}` : '';
    const name = slug ? titleCase(slug) : input.trim();
    if (norm(name).length < 2) continue;
    if ((linkedin && seenLinked.has(norm(linkedin))) || seenNames.has(norm(name))) {
      console.log(`  ~ skip (already tracked): ${name}`); continue;
    }
    let ats = (forcedCareers && inputs.length === 1) ? { careers_url: forcedCareers } : null;
    if (!ats && hasKey()) { try { ats = await resolveAts(name); } catch {} }
    if (ats && seenCareers.has(norm(ats.careers_url))) {
      console.log(`  ~ skip (board already tracked): ${name}`); continue;
    }
    toAdd.push({ name, linkedin, ...(ats || {}) });
    seenNames.add(norm(name));
    if (linkedin) seenLinked.add(norm(linkedin));
    if (ats) seenCareers.add(norm(ats.careers_url));
    console.log(`  ${ats ? '✅' : '•'} ${name}${linkedin ? '  [' + linkedin.replace('https://www.', '') + ']' : ''}` +
      (ats ? `  → ${ats.careers_url}` : '  (no ATS board found — careers_url optional, add later)'));
  }

  const withBoard = toAdd.filter((e) => e.careers_url).length;
  console.log(`\n— ${toAdd.length} to add (${withBoard} with a scrapable ATS board, ${toAdd.length - withBoard} linkedin-only)`);
  if (!write) { console.log('(dry-run — pass --write to append to portals.yml)'); return; }
  if (!toAdd.length) { console.log('nothing new to add'); return; }

  const block = toAdd.map((e) => {
    const lines = [`  - name: "${e.name.replace(/"/g, '')}"`];
    if (e.linkedin) lines.push(`    linkedin: ${e.linkedin}`);
    if (e.careers_url) lines.push(`    careers_url: ${e.careers_url}`);
    if (e.api) lines.push(`    api: ${e.api}`);
    lines.push('    enabled: true');
    lines.push(`    notes: "added via LinkedIn${e.careers_url ? '' : '; no ATS board found — add careers_url to scan'}"`);
    return lines.join('\n');
  }).join('\n');
  appendFileSync('portals.yml', '\n' + block + '\n');
  console.log(`✓ appended ${toAdd.length} ${toAdd.length === 1 ? 'company' : 'companies'} to portals.yml → tracked_companies`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
