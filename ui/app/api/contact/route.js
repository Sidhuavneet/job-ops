import { NextResponse } from 'next/server';
import { findContacts, findEmails } from '../../../lib/tinyfish';
import { buildDM, buildEmail } from '../../../lib/outreach';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req) {
  try {
    const { company, role, website } = await req.json();
    if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 });
    const [groups, emails] = await Promise.all([findContacts(company), findEmails(company, website)]);
    const dm = buildDM(company);
    const email = buildEmail(company, role);
    return NextResponse.json({ groups, emails, dm, email });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
