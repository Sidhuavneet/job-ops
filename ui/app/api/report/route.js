import { promises as fs } from 'fs';
import path from 'path';
import { ROOT } from '../../../lib/repo';

export const dynamic = 'force-dynamic';

// Serve an evaluation report file as readable HTML. Path is validated to stay
// inside the repo's reports/ directory.
export async function GET(req) {
  const rel = new URL(req.url).searchParams.get('path') || '';
  const full = path.resolve(ROOT, rel);
  const reportsDir = path.join(ROOT, 'reports');
  if (!full.startsWith(reportsDir)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const md = await fs.readFile(full, 'utf-8');
    const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${path.basename(rel)}</title>
<style>body{background:#0d1117;color:#e6edf3;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:860px;margin:0 auto;padding:32px}pre{white-space:pre-wrap;word-wrap:break-word}a{color:#58a6ff}</style>
</head><body><pre>${esc}</pre></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
