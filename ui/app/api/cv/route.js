import { promises as fs } from 'fs';
import path from 'path';
import { ROOT } from '../../../lib/repo';

export const dynamic = 'force-dynamic';

// Serve a tailored CV PDF from output/ (validated to stay inside output/).
export async function GET(req) {
  const file = new URL(req.url).searchParams.get('file') || '';
  const full = path.resolve(ROOT, 'output', path.basename(file));
  const outDir = path.join(ROOT, 'output');
  if (!full.startsWith(outDir) || !full.endsWith('.pdf')) return new Response('Forbidden', { status: 403 });
  try {
    const buf = await fs.readFile(full);
    return new Response(buf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${path.basename(full)}"` } });
  } catch { return new Response('Not found', { status: 404 }); }
}
