// clean-pipeline.mjs — STRICT cleanup of data/pipeline.md.
// Drops: listing/search pages, US-locked roles, mid/senior+ roles, and non-eng /
// data-labeling noise. Removed entries are archived to data/pipeline-archive.md
// (reversible). Keeps only individual, early-career-friendly, globally-remote postings.
//
// Usage: node clean-pipeline.mjs            (dry-run: show breakdown)
//        node clean-pipeline.mjs --write    (apply: rewrite pipeline.md + archive)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const PIPELINE = 'data/pipeline.md';
const HISTORY = 'data/scan-history.tsv';
const ARCHIVE = 'data/pipeline-archive.md';
const write = process.argv.includes('--write');

// Individual posting (vs listing/index/search page).
// Aggregator boards (RemoteOK, WeWorkRemotely, Himalayas, Remote Rocketship,
// Remotive, Working Nomads, NoDesk) were removed as scan sources — they
// resurface stale/reposted listings. They're intentionally NOT in this
// allowlist, so any stray aggregator URL is classified "listing/search page"
// and dropped.
const POSTING = [
  /jobs\.ashbyhq\.com\/[^/ ]+\/[0-9a-f-]{8,}/i,
  /greenhouse\.io\/[^/ ]+\/jobs\/\d+/i,
  /jobs\.lever\.co\/[^/ ]+\/[0-9a-f-]{8,}/i,
  /wellfound\.com\/jobs\/\d+/i,
  /workatastartup\.com\/jobs\/\d+/i,
];
const isPosting = (u) => POSTING.some((re) => re.test(u));

const SENIOR = /\b(senior|sr\.?|staff|principal|\blead\b|leadership|distinguished|director|head\s+of|\bvp\b|vice president|\bmanager\b|architect|mid[-\s]?level|\bmid\b|level\s*[2-9]|\bii\b|\biii\b|\biv\b|[5-9]\s*\+|10\s*\+|\d+\s*\+?\s*years|yoe)\b/i;
const NOISE = /\b(trainer|fluency|annotat|labell?ing|labell?er|sales|marketing|recruiter|account executive|designer|\banalyst\b|consultant|strategist|\bintern\b|internship)\b/i;
const GLOBAL = /(worldwide|anywhere|global|\bindia\b|europe|emea|\beu\b|united kingdom|\buk\b)/i;
const US_LOCK = /(united states|u\.s\.?a?\b|us[-\s]remote|\(us\)|\(est\)|\(pst\)|\(cst\)|\(mst\)|north america|texas|california|new york|san francisco|seattle|boston|austin|chicago|denver|atlanta|los angeles|washington|\bnyc\b)/i;
// Work-authorization restrictions (often in title/snippet, e.g. "US citizens only",
// "must reside in the US", "green card"). Title-level only — full coverage needs the
// JD body (caught at evaluation), but this kills the obvious ones.
const US_AUTH = /(u\.?s\.?\s*citizens?|us[-\s]?only|u\.?s\.?\s*based\b|must (be|reside)[^,.]{0,25}(u\.?s\.?|united states)|authoriz\w+ to work in (the )?(u\.?s\.?|us|united states)|green\s?card|gc\s*\/?\s*citizen|requires? us work|us work authorization)/i;

// url -> location (from scan-history company scans)
const loc = new Map();
if (existsSync(HISTORY)) {
  for (const line of readFileSync(HISTORY, 'utf-8').split('\n')) {
    const c = line.split('\t');
    if (c[0] && c[6]) loc.set(c[0].trim(), c[6].trim());
  }
}

function classify(url, title) {
  if (!isPosting(url)) return 'listing/search page';
  if (NOISE.test(title)) return 'non-eng / noise';
  if (SENIOR.test(title)) return 'mid/senior+';
  const where = `${title} ${loc.get(url) || ''}`;
  if (US_AUTH.test(where)) return 'US-auth-locked';
  if (US_LOCK.test(where) && !GLOBAL.test(where)) return 'US-locked';
  return 'KEEP';
}

const md = readFileSync(PIPELINE, 'utf-8');
const startIdx = md.indexOf('## Pendientes');
const endIdx = md.indexOf('## Procesadas');
const head = md.slice(0, startIdx + '## Pendientes'.length);
const pend = md.slice(startIdx + '## Pendientes'.length, endIdx === -1 ? md.length : endIdx);
const tail = endIdx === -1 ? '' : md.slice(endIdx);

const keep = [];
const drop = [];
const reasons = {};
for (const line of pend.split('\n')) {
  const m = line.match(/^- \[[ x]\]\s*(\S+)\s*\|\s*([^|]*)\|\s*(.*)$/);
  if (!m) continue;
  const [, url, company, title] = m;
  const verdict = classify(url, title);
  if (verdict === 'KEEP') keep.push(line);
  else { drop.push({ line, verdict }); reasons[verdict] = (reasons[verdict] || 0) + 1; }
}

console.log(`Pendientes: ${keep.length + drop.length} → KEEP ${keep.length}, DROP ${drop.length}`);
for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`   - ${r}: ${n}`);

if (write) {
  writeFileSync(PIPELINE, `${head}\n\n${keep.join('\n')}\n\n${tail}`, 'utf-8');
  const stamp = new Date().toISOString().slice(0, 10);
  let arc = existsSync(ARCHIVE) ? readFileSync(ARCHIVE, 'utf-8') : '# Pipeline Archive (removed by clean-pipeline)\n';
  arc += `\n## Removed ${stamp}\n` + drop.map((d) => `${d.line}   <!-- ${d.verdict} -->`).join('\n') + '\n';
  writeFileSync(ARCHIVE, arc, 'utf-8');
  console.log(`\n✓ pipeline.md → ${keep.length} kept; ${drop.length} archived to ${ARCHIVE}`);
} else {
  console.log('\n(dry-run — pass --write to apply)');
}
