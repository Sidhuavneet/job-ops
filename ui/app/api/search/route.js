import { NextResponse } from 'next/server';
import { tfSearch, tfFetch, expandListing, guessCompany } from '../../../lib/tinyfish';
import { addRoles } from '../../../lib/repo';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req) {
  try {
    const body = await req.json();
    const action = body.action || 'search';

    if (action === 'search') {
      const pages = Math.min(Number(body.pages) || 1, 3);
      const all = [];
      for (let p = 0; p < pages; p++) {
        const res = await tfSearch(body.query, { page: p });
        for (const r of res.results || []) {
          all.push({
            title: r.title, url: r.url, snippet: r.snippet || '',
            source: (r.site_name || '').replace(/^www\./, ''),
            company: guessCompany(r.title, r.site_name),
          });
        }
        if (!(res.results || []).length) break;
      }
      // de-dup by url
      const seen = new Set();
      const results = all.filter((r) => (seen.has(r.url) ? false : seen.add(r.url)));
      return NextResponse.json({ results });
    }

    if (action === 'fetch') {
      const data = await tfFetch([body.url], { format: 'markdown' });
      const r = data.results?.[0];
      if (!r) return NextResponse.json({ error: data.errors?.[0]?.error || 'fetch failed' }, { status: 502 });
      return NextResponse.json({ title: r.title, url: r.final_url || r.url, text: (r.text || '').slice(0, 6000) });
    }

    if (action === 'expand') {
      const results = await expandListing(body.url);
      return NextResponse.json({ results });
    }

    if (action === 'add') {
      const out = await addRoles(body.rows || []);
      return NextResponse.json(out);
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
