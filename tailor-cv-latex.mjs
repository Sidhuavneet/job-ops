// tailor-cv-latex.mjs — compile a (possibly Claude-edited) cv.tex to a tailored PDF.
//
// Workflow:
//   1. Claude reads the JD, decides which bullets to emphasise / reorder.
//   2. Claude writes the modified .tex to a temp path (e.g. output/_draft_<slug>.tex),
//      OR passes edits directly via --src pointing to that file.
//   3. This script injects hidden ATS keywords and compiles to output/<slug>.pdf.
//
// Usage:
//   node tailor-cv-latex.mjs --company "Acme" --role "AI Engineer"
//   node tailor-cv-latex.mjs --company "Acme" --role "AI Engineer" \
//       --src output/_draft_acme-ai-engineer.tex \
//       --keywords "AWS,Terraform,Docker,Kubernetes"
//
// Default source: cv.tex (project root — your canonical LaTeX CV).
// Output:         output/<company-role>.pdf
//
// Requires tectonic or pdflatex on PATH.
// Install tectonic (recommended, self-contained): brew install tectonic

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { renameSync, copyFileSync } from 'fs';
import { execFileSync } from 'child_process';

const args = process.argv.slice(2);
const opt = (n, d = '') => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const company  = opt('--company');
const role     = opt('--role');
const keywords = opt('--keywords');  // comma-separated — injected as hidden white text for ATS
const src      = opt('--src', 'cv.tex');

if (!company) {
  console.error('Usage: node tailor-cv-latex.mjs --company "X" --role "Y" [--src file.tex] [--keywords "a,b,c"]');
  process.exit(1);
}

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const slug    = slugify(company + '-' + (role || ''));
// --out lets callers control the PDF path (e.g. output/<company>-cv.pdf to match
// the dashboard's cvFor() lookup). Defaults to output/<company-role>.pdf.
const outPdf  = opt('--out') || `output/${slug}.pdf`;
const tmpBase = `output/_tailor_${slug}`;
const tmpTex  = `${tmpBase}.tex`;

mkdirSync('output', { recursive: true });

if (!existsSync(src)) {
  console.error(`Source not found: ${src}\nCreate cv.tex in the project root or pass --src <path>.`);
  process.exit(1);
}

let tex = readFileSync(src, 'utf-8');

// --- Hidden ATS keyword injection ---
// Invisible to the human eye (0.5pt white text) but readable by text-extraction
// tools used in ATS keyword-scanning.  Placed at the very end so it can never
// shift layout.  NOTE: some sophisticated ATS systems flag invisible text as
// manipulation — use only for legacy/simple keyword-scanning portals, not for
// companies that read CVs manually (those deserve the real content anyway).
if (keywords) {
  const kw = keywords.split(',').map(k => k.trim()).filter(Boolean).join(' ');
  const hidden = `\n{\\color{white}\\fontsize{0.5pt}{0.5pt}\\selectfont ${kw}}\n`;
  tex = tex.replace(/\\end\{document\}/, hidden + '\\end{document}');
}

// --- Detect LaTeX engine ---
let engine = null;
for (const c of ['tectonic', 'pdflatex']) {
  try { execFileSync(c, ['--version'], { stdio: 'pipe' }); engine = c; break; } catch {}
}
if (!engine) {
  console.error(
    'No LaTeX engine found.\n' +
    '  Install tectonic (recommended): brew install tectonic\n' +
    '  Or full TeX Live:               brew install --cask mactex-no-gui'
  );
  process.exit(1);
}

// --- Compile ---
try {
  let compileTex = tex;
  if (engine === 'tectonic') {
    // Strip pdflatex-only primitives that crash tectonic
    compileTex = tex
      .replace(/\\pdfgentounicode\s*=\s*\d+[^\n]*\n?/g, '')
      .replace(/\\input\{glyphtounicode\}[^\n]*\n?/g, '');
  }

  writeFileSync(tmpTex, compileTex, 'utf-8');

  if (engine === 'tectonic') {
    execFileSync('tectonic', ['--outdir', 'output', tmpTex], { stdio: 'pipe', timeout: 300_000 });
    // tectonic names the output PDF after the input filename
    const tecOut = `${tmpBase}.pdf`;
    if (existsSync(tecOut)) renameSync(tecOut, outPdf);
  } else {
    const pdfArgs = [
      '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error',
      `-output-directory=output`, tmpTex,
    ];
    execFileSync('pdflatex', pdfArgs, { stdio: 'pipe', timeout: 300_000 });
    execFileSync('pdflatex', pdfArgs, { stdio: 'pipe', timeout: 300_000 }); // second pass
    const pdflatexOut = `${tmpBase}.pdf`;
    if (existsSync(pdflatexOut) && pdflatexOut !== outPdf) renameSync(pdflatexOut, outPdf);
  }

  console.log(`✓ tailored CV → ${outPdf}  (engine: ${engine})`);
  console.log(JSON.stringify({ pdf: outPdf, engine, keywords: keywords || null }));
} catch (e) {
  const msg = e.stderr ? e.stderr.toString().split('\n').filter(l => l.startsWith('!')).join('\n') || e.message : e.message;
  console.error('LaTeX compilation failed:', msg);
  process.exit(1);
} finally {
  for (const ext of ['.tex', '.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex.gz']) {
    try { unlinkSync(`${tmpBase}${ext}`); } catch {}
  }
}
