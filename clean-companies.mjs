// clean-companies.mjs — STRICT cleanup of tracked_companies in portals.yml.
// Keeps ONLY small/early-stage startups realistic for an early-career (~1yr)
// candidate. Drops frontier labs, big tech, public cos, unicorns, hyped/
// well-funded scale-ups, government, and large corporates. Removed names are
// archived to data/companies-archive.md. Preserves the rest of the YAML file
// (comments intact) by removing whole entry blocks textually.
//
// Usage: node clean-companies.mjs           (dry-run)
//        node clean-companies.mjs --write    (apply)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const write = process.argv.includes('--write');
const PORTALS = 'portals.yml';
const ARCHIVE = 'data/companies-archive.md';

// KEEP — small/early-stage startups (best-effort by signal; verify size before applying).
const KEEP = new Set([
  'glacis ai', 'safari ai', 'reedsy', 'lavendo', 'mostest', 'concentrate ai', 'clera',
  'neuroscale', 'honey homes', 'kombo', 'plain', 'clove', 'hipeople official', 'muttdata',
  'altura', 'eloquentai', 'maxim ai', 'zep ai', 'infinity constellation',
  'superset', 'canary', 'chamber',
].map((s) => s.toLowerCase()));

const norm = (s) => (s || '').replace(/^["']|["']$/g, '').trim().toLowerCase();

const text = readFileSync(PORTALS, 'utf-8');
const tcIdx = text.indexOf('\ntracked_companies:');
if (tcIdx === -1) { console.error('tracked_companies not found'); process.exit(1); }
const headEnd = text.indexOf('\n', tcIdx + 1) + 1; // include the "tracked_companies:" line
const head = text.slice(0, headEnd);
const region = text.slice(headEnd);

// Split region into entry blocks (each starts with "  - name:").
const lines = region.split('\n');
const preamble = []; // comments before first entry
const blocks = [];
let cur = null;
for (const line of lines) {
  if (/^\s*-\s+name:/.test(line)) { if (cur) blocks.push(cur); cur = [line]; }
  else if (cur) cur.push(line);
  else preamble.push(line);
}
if (cur) blocks.push(cur);

const kept = [], dropped = [];
for (const b of blocks) {
  const m = b[0].match(/name:\s*(.+)$/);
  const name = norm(m ? m[1] : '');
  if (KEEP.has(name)) kept.push({ b, name });
  else dropped.push(name);
}

console.log(`tracked_companies: ${blocks.length} → KEEP ${kept.length}, DROP ${dropped.length}\n`);
console.log('KEPT:', kept.map((k) => k.name).join(', ') || '(none)');
console.log('\nDROPPED (sample):', dropped.slice(0, 30).join(', '), dropped.length > 30 ? `… +${dropped.length - 30}` : '');

if (write) {
  // Trim trailing blank lines from kept blocks, rejoin cleanly.
  const body = kept.map((k) => k.b.join('\n').replace(/\s+$/, '')).join('\n');
  writeFileSync(PORTALS, head + preamble.join('\n').replace(/\s+$/, '') + '\n' + body + '\n', 'utf-8');
  let arc = existsSync(ARCHIVE) ? readFileSync(ARCHIVE, 'utf-8') : '# Companies Archive (removed by clean-companies — too big/competitive for early-career)\n';
  arc += `\n## Removed ${new Date().toISOString().slice(0, 10)}\n` + dropped.map((d) => `- ${d}`).join('\n') + '\n';
  writeFileSync(ARCHIVE, arc, 'utf-8');
  console.log(`\n✓ kept ${kept.length}, archived ${dropped.length} to ${ARCHIVE}`);
} else {
  console.log('\n(dry-run — pass --write to apply)');
}
