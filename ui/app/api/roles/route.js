import { NextResponse } from 'next/server';
import { getRoles, rejectEvaluated, rejectPending } from '../../../lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getRoles());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (body.action === 'reject') {
      if (body.kind === 'evaluated') await rejectEvaluated(body.num);
      else await rejectPending(body.url);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
