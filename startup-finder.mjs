// startup-finder.mjs — ENGINE 2: find fresh, newly-funded, tiny startups.
// Source: "Launch HN" posts (HN Algolia API, free, no key). A Launch HN = a YC
// company launching → by definition just-funded + tiny team (usually 2-6).
// Parses company, YC batch, funding + team-size signals, site, description.
//
// Usage:
//   node startup-finder.mjs                 dry-run: print fresh startups
//   node startup-finder.mjs --write         write leads to data/fresh-startups.md
//   node startup-finder.mjs --resolve --write   also find each one's ATS board
//                                               (TinyFish) and add to tracked_companies
//   [--days N]   how far back (default 120)   [--max N] max posts (default 60)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const optn = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const write = flag('--write');
const resolve = flag('--resolve');
const days = optn('--days', 120);
const max = optn('--max', 60);

const stripTags = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

function parsePost(hit) {
  const title = hit.title || '';
  const name = title.replace(/^Launch HN:\s*/i, '').split(/\s*[–—\-(]/)[0].trim();
  const batch = (title.match(/\(YC\s*([WSF]\d{2})\)/i) || [])[1] || '';
  const desc = (title.split(/[–—]/).slice(1).join('–') || '').trim();
  const body = stripTags(hit.story_text);
  const fundM = body.match(/(?:raised|raising|seed|pre-seed|series\s*[a-c]|backed)[^.]{0,40}?\$[\d.]+\s*(?:k|m|million|bn|billion)?/i)
    || body.match(/\$[\d.]+\s*(?:k|m|million)\b[^.]{0,30}?(?:seed|round|raised|funding)/i);
  const sizeM = body.match(/team of (\d+)/i) || body.match(/we(?:'re| are)\s+(?:a\s+team\s+of\s+)?(\d+)/i) || body.match(/(\d+)\s+(?:people|employees|engineers|of us|founders)/i);
  return {
    name, batch, desc: desc.slice(0, 140),
    funding: fundM ? fundM[0].replace(/\s+/g, ' ').trim().slice(0, 60) : '',
    size: sizeM ? sizeM[1] : '',
    site: hit.url || '',
    hn: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    date: (hit.created_at || '').slice(0, 10),
  };
}

async function fetchLaunchHN() {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=%22Launch%20HN%22&tags=story&hitsPerPage=${max}&numericFilters=created_at_i>${cutoff}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HN ${r.status}`);
  const j = await r.json();
  return (j.hits || []).filter((h) => /^Launch HN:/i.test(h.title || '')).map(parsePost).filter((p) => p.name);
}

// --resolve: find a company's ATS board via TinyFish search.
// Only accept a board whose slug actually matches the startup name (avoids
// generic names like "Hyper"/"Vela" matching an unrelated company's board).
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function slugMatches(name, slug) {
  const n = norm(name.split(/\s+/)[0]); // first token
  const s = norm(slug);
  if (n.length < 3) return false;
  return s.includes(n) || n.includes(s);
}
async function resolveAts(name) {
  const { tfSearch } = await import('./tinyfish.mjs');
  const res = await tfSearch(`"${name}" careers jobs ashbyhq.com OR greenhouse.io OR lever.co`, { page: 0 });
  for (const r of res.results || []) {
    const u = r.url || '';
    let m, slug, board;
    if ((m = u.match(/https:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i))) { slug = m[1]; board = `https://jobs.ashbyhq.com/${m[1]}`; }
    else if ((m = u.match(/https:\/\/(job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/i))) { slug = m[2]; board = `https://${m[1]}.greenhouse.io/${m[2]}`; }
    else if ((m = u.match(/https:\/\/jobs\.lever\.co\/([^/?#]+)/i))) { slug = m[1]; board = `https://jobs.lever.co/${m[1]}`; }
    else continue;
    if (slugMatches(name, slug)) return board;
  }
  return null;
}

async function main() {
  const startups = await fetchLaunchHN();
  console.log(`\nFound ${startups.length} Launch HN startups (last ${days}d):\n`);
  for (const s of startups) {
    console.log(`• ${s.name}${s.batch ? ` (YC ${s.batch})` : ''}${s.size ? ` · team ${s.size}` : ''}${s.funding ? ` · ${s.funding}` : ''}`);
    console.log(`    ${s.desc}`);
    console.log(`    ${s.site}  |  ${s.hn}`);
  }

  if (write) {
    const md = `# Fresh Startups (Launch HN) — updated ${new Date().toISOString().slice(0, 10)}\n\n` +
      startups.map((s) =>
        `- **${s.name}**${s.batch ? ` (YC ${s.batch})` : ''}${s.size ? ` · team ${s.size}` : ''}${s.funding ? ` · ${s.funding}` : ''}\n  - ${s.desc}\n  - [site](${s.site}) · [HN](${s.hn}) · ${s.date}`
      ).join('\n');
    writeFileSync('data/fresh-startups.md', md, 'utf-8');
    console.log(`\n✓ wrote ${startups.length} leads to data/fresh-startups.md`);
  }

  if (resolve) {
    console.log(`\nResolving ATS boards via TinyFish…`);
    const cfg = (await import('js-yaml')).default.load(readFileSync('portals.yml', 'utf-8')) || {};
    const existing = new Set((cfg.tracked_companies || []).map((c) => (c.careers_url || '').replace(/\/+$/, '').toLowerCase()));
    const adds = [];
    for (const s of startups) {
      let board = null;
      try { board = await resolveAts(s.name); } catch (e) { /* skip */ }
      if (board && !existing.has(board.replace(/\/+$/, '').toLowerCase())) {
        adds.push({ ...s, board });
        existing.add(board.replace(/\/+$/, '').toLowerCase());
        console.log(`   + ${s.name} → ${board}`);
      }
    }
    if (write && adds.length) {
      const block = '\n' + adds.map((a) => {
        const note = `Launch HN ${a.batch || ''}${a.size ? ` team ${a.size}` : ''}${a.funding ? ` ${a.funding}` : ''}`.replace(/\s+/g, ' ').trim();
        const safeName = a.name.replace(/"/g, '');
        return `  - name: "${safeName}"\n    careers_url: ${a.board}\n    enabled: true\n    notes: "${note.replace(/"/g, '')}"`;
      }).join('\n') + '\n';
      appendFileSync('portals.yml', block, 'utf-8');
      console.log(`\n✓ added ${adds.length} startups to portals.yml tracked_companies`);
    } else {
      console.log(`\n— ${adds.length} resolvable${write ? '' : ' (dry-run)'}`);
    }
  }
  if (!write && !resolve) console.log(`\n(dry-run — pass --write to save leads, --resolve --write to add scrapable ones to companies)`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
