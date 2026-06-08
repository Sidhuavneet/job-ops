import { NextResponse } from 'next/server';
import { acceptRole, unaccept } from '../../../lib/repo';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const out = body.action === 'remove' ? await unaccept(body.url) : await acceptRole(body);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
