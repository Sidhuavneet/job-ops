import { NextResponse } from 'next/server';
import { saveFeedback } from '../../../lib/repo';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { url, feedback } = await req.json();
    if (!url || !feedback) return NextResponse.json({ error: 'url and feedback required' }, { status: 400 });
    return NextResponse.json(await saveFeedback(url, feedback));
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
