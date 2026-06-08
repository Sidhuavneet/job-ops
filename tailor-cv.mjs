// tailor-cv.mjs — render an ATS-friendly tailored CV PDF from cv.md.
// The DEEP tailoring (which bullets/keywords matter for a JD) is decided by
// Claude and passed in via --summary / --keywords; this script renders it to
// output/<company-role>.pdf so the UI Application Kit can show a Download link.
//
// Usage:
//   node tailor-cv.mjs --company "Glacis AI" --role "Founding SWE" \
//        --summary "Agentic-AI + full-stack engineer …" \
//        --keywords "Python,LangGraph,RAG,Next.js,Postgres"
import { readFileSync, mkdirSync } from 'fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d = '') => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const company = opt('--company');
const role = opt('--role');
const summary = opt('--summary');
const keywords = opt('--keywords');
if (!company) { console.error('Usage: node tailor-cv.mjs --company "X" --role "Y" [--summary "..."] [--keywords "a,b,c"]'); process.exit(1); }

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const out = `output/${slugify(company + '-' + role)}.pdf`;

// Minimal, safe markdown → HTML for the CV body.
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = md.split('\n'); const html = []; let inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    if (/^####?\s+/.test(l)) { closeList(); html.push(`<h3>${inline(l.replace(/^#+\s+/, ''))}</h3>`); }
    else if (/^###\s+/.test(l)) { closeList(); html.push(`<h3>${inline(l.replace(/^#+\s+/, ''))}</h3>`); }
    else if (/^##\s+/.test(l)) { closeList(); html.push(`<h2>${inline(l.replace(/^#+\s+/, ''))}</h2>`); }
    else if (/^#\s+/.test(l)) { closeList(); html.push(`<h1>${inline(l.replace(/^#+\s+/, ''))}</h1>`); }
    else if (/^\s*[-*]\s+/.test(l)) { if (!inList) { html.push('<ul>'); inList = true; } html.push(`<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`); }
    else if (/^\s*---\s*$/.test(l)) { closeList(); html.push('<hr/>'); }
    else if (l.trim() === '') { closeList(); }
    else { closeList(); html.push(`<p>${inline(l)}</p>`); }
  }
  closeList();
  return html.join('\n');
}

const cv = readFileSync('cv.md', 'utf-8');
const banner = (summary || keywords)
  ? `<div class="tailor"><strong>Tailored for ${esc(role || company)}${role ? ' @ ' + esc(company) : ''}.</strong>${summary ? ' ' + esc(summary) : ''}${keywords ? `<div class="kw"><em>Keywords:</em> ${esc(keywords)}</div>` : ''}</div>`
  : '';
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm; }
  body { font: 11pt/1.45 'Helvetica Neue', Arial, sans-serif; color: #111; }
  h1 { font-size: 20pt; margin: 0 0 2px; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1.5px solid #111; padding-bottom: 2px; margin: 14px 0 6px; }
  h3 { font-size: 11pt; margin: 8px 0 2px; }
  p { margin: 3px 0; } ul { margin: 3px 0 6px 18px; padding: 0; } li { margin: 2px 0; }
  a { color: #111; text-decoration: none; } code { font-family: inherit; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 8px 0; }
  .tailor { background: #f3f6fb; border-left: 3px solid #2563eb; padding: 7px 10px; margin: 0 0 10px; font-size: 10pt; }
  .tailor .kw { margin-top: 3px; color: #333; }
</style></head><body>${banner}${mdToHtml(cv)}</body></html>`;

mkdirSync('output', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(doc, { waitUntil: 'networkidle' });
await page.pdf({ path: out, format: 'A4', printBackground: true });
await browser.close();
console.log(`✓ tailored CV → ${out}`);
