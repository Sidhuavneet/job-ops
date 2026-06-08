#!/usr/bin/env node

// materialize-jds.mjs — capture the full JD text for accepted/pipeline roles into
// jds/<company-slug>.md, so CV tailoring reads a LOCAL file instead of re-fetching
// a (often gated) job page at tailor-time. This is the "cache the dereference" fix:
// the scan only stores a pointer (title, url); tailoring needs the object (the JD).
// Materialize it once, here.
//
// Idempotent: skips JDs already saved (use --force to refetch).
//
// Usage:
//   node materialize-jds.mjs              # from data/accepted.md (default)
//   node materialize-jds.mjs --pipeline   # from data/pipeline.md pending instead
//   node materialize-jds.mjs --force      # refetch even if jds/<slug>.md exists
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { tfFetch, hasKey } from './tinyfish.mjs';

const args = process.argv.slice(2);
const SRC = args.includes('--pipeline') ? 'data/pipeline.md' : 'data/accepted.md';
const force = args.includes('--force');
const JDS = 'jds';

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function parseRoles(md) {
  const out = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^- \[[ x]\]\s*(\S+)\s*\|\s*([^|]+?)\s*\|\s*([^<]+?)\s*(?:<!--|$)/);
    if (m) out.push({ url: m[1], company: m[2].trim(), role: m[3].trim() });
  }
  return out;
}

async function main() {
  if (!existsSync(SRC)) { console.error(`${SRC} not found`); process.exit(1); }
  if (!hasKey()) { console.error('TINYFISH_API_KEY missing (needed to fetch JD pages)'); process.exit(1); }
  mkdirSync(JDS, { recursive: true });
  const roles = parseRoles(readFileSync(SRC, 'utf-8'));
  const today = new Date().toISOString().slice(0, 10);
  console.log(`${roles.length} roles in ${SRC} → ${JDS}/\n`);

  let saved = 0, skipped = 0, gated = 0;
  for (const r of roles) {
    const slug = slugify(r.company);
    const out = `${JDS}/${slug}.md`;
    if (!force && existsSync(out)) { skipped++; console.log(`  · skip (have it): ${slug}`); continue; }
    let text = '';
    try {
      const data = await tfFetch([r.url], { format: 'markdown' });
      text = (data.results?.[0]?.text || '').trim();
    } catch (e) { console.log(`  ✗ ${r.company}: ${e.message}`); }
    // Login-gated boards (e.g. workatastartup) return a near-empty shell.
    if (!text || text.replace(/\s/g, '').length < 200) { gated++; console.log(`  ✗ gated/empty: ${r.company} (${r.url.replace(/^https?:\/\//, '').slice(0, 40)})`); continue; }
    writeFileSync(out, `# ${r.company} — ${r.role}\n\n- URL: ${r.url}\n- Captured: ${today}\n\n---\n\n${text}\n`, 'utf-8');
    saved++; console.log(`  ✓ ${slug}.md (${text.length} chars)`);
  }
  console.log(`\n— saved ${saved}, skipped ${skipped} (already local), gated/failed ${gated}`);
  if (gated) console.log(`  (gated boards have no public JD — those roles stay title-only)`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
