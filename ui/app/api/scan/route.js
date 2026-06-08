import { spawn } from 'child_process';
import { ROOT } from '../../../lib/repo';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

// Runs the zero-token ATS scan (scan.mjs) and streams its live output to the UI.
// This is the runnable, automated part of discovery (Greenhouse/Ashby/Lever APIs).
// Board-based discovery (Wellfound/YC WebSearch) is AI-driven and runs separately.
export async function POST() {
  const child = spawn('node', ['scan.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
  });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (s) => { try { controller.enqueue(enc.encode(s)); } catch {} };
      child.stdout.on('data', (d) => send(d.toString()));
      child.stderr.on('data', (d) => send(d.toString()));
      child.on('close', (code) => { send(`\n[scan finished — exit ${code}]\n`); controller.close(); });
      child.on('error', (e) => { send(`\n[error: ${e}]\n`); controller.close(); });
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
  });
}
