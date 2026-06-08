#!/usr/bin/env node

// verify-cv.mjs — the missing verifier. A generator (CV tailoring) without a
// discriminator ships confidently-wrong CVs. This is a deterministic pass over
// every output/*-cv.pdf that checks:
//   1. Page count (pdfinfo)        — early-career CV should be 1, warn at >2.
//   2. Selectable text (pdftotext) — fail if empty (rasterized / broken render).
//   3. Claim integrity             — "impact metrics" (12%, 3x, 25+) that appear
//      in the CV but NOT in cv.md are flagged as possible fabrications to review.
//      (cv.md is the source of truth; tailoring must never invent numbers.)
//
// Exit 0 if all clean/flag-only, 1 if any hard failure.
//
// Usage: node verify-cv.mjs
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const OUT = 'output', CVSRC = 'cv.md';
const norm = (s) => s.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '');

// Impact metrics = a number immediately followed by % / x / × / + (the kind of
// quantified claim most likely to be fabricated). Plain years/counts are ignored.
function impactMetrics(text) {
  const set = new Set();
  for (const m of (text || '').matchAll(/\b\d+(?:\.\d+)?\s*(?:%|x|×|\+)/gi)) set.add(norm(m[0]));
  return set;
}
const run = (cmd, a) => { try { return execFileSync(cmd, a, { encoding: 'utf8' }); } catch { return ''; } };
const pageCount = (pdf) => { const m = run('pdfinfo', [pdf]).match(/Pages:\s*(\d+)/); return m ? +m[1] : null; };

function main() {
  if (!existsSync(CVSRC)) { console.error(`${CVSRC} not found`); process.exit(1); }
  const cvMetrics = impactMetrics(readFileSync(CVSRC, 'utf-8'));
  const cvs = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('-cv.pdf')).sort() : [];
  if (!cvs.length) { console.log('No output/*-cv.pdf to verify.'); return; }

  console.log(`Verifying ${cvs.length} CVs against ${CVSRC} (${cvMetrics.size} known impact metrics)\n`);
  let ok = 0, warn = 0, bad = 0;
  for (const f of cvs) {
    const p = `${OUT}/${f}`;
    const np = pageCount(p);
    const txt = run('pdftotext', [p, '-']);
    const issues = [];
    let hard = false;
    if (txt.replace(/\s/g, '').length < 200) { issues.push('NO TEXT (rasterized/broken)'); hard = true; }
    if (np && np > 2) { issues.push(`${np} pages (>2)`); hard = true; }
    const extra = [...impactMetrics(txt)].filter((m) => !cvMetrics.has(m));
    if (extra.length) issues.push(`unverified metrics: ${extra.join(', ')}`);
    const status = hard ? '❌' : issues.length ? '⚠️ ' : '✅';
    if (hard) bad++; else if (issues.length) warn++; else ok++;
    console.log(`  ${status} ${f}${np ? ` (${np}p)` : ''}${issues.length ? ' — ' + issues.join('; ') : ''}`);
  }
  console.log(`\n— ${ok} clean, ${warn} flagged for review, ${bad} hard-fail`);
  if (warn) console.log('  (flagged = a quantified claim not found in cv.md; eyeball it, it may just be reworded)');
  process.exit(bad ? 1 : 0);
}

main();
