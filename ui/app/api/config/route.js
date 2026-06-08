import { NextResponse } from 'next/server';
import { getConfig, saveQueries, saveTargeting, saveCompanies } from '../../../lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getConfig());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (body.type === 'queries') await saveQueries(body.queries);
    else if (body.type === 'targeting') await saveTargeting(body);
    else if (body.type === 'companies') await saveCompanies(body.companies);
    else return NextResponse.json({ error: 'unknown type' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
