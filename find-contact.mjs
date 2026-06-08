// find-contact.mjs — ENGINE 3: find decision-makers for a company.
// Uses TinyFish Search (free) to surface founders / hiring managers / recruiters
// / eng leads on LinkedIn, so you can reach out warm. Drafting the actual
// message is done by the AI via the career-ops `contacto` mode.
//
// Usage:
//   node find-contact.mjs "Company Name"
//   node find-contact.mjs "Company Name" --role "Founding Engineer"
import { tfSearch, hasKey } from './tinyfish.mjs';

const args = process.argv.slice(2);
const company = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--role');
const roleIdx = args.indexOf('--role');
const role = roleIdx >= 0 ? args[roleIdx + 1] : '';

const GROUPS = [
  { label: 'Founders / Execs', q: (c) => `site:linkedin.com/in "${c}" (founder OR "co-founder" OR CEO OR CTO)` },
  { label: 'Eng leaders', q: (c) => `site:linkedin.com/in "${c}" ("engineering manager" OR "head of engineering" OR "VP Engineering" OR "tech lead")` },
  { label: 'Recruiting / People', q: (c) => `site:linkedin.com/in "${c}" (recruiter OR "talent" OR "technical sourcer" OR "people ops")` },
];

// Parse a LinkedIn search result title → { name, role }.
function parsePerson(title) {
  const clean = (title || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  return { name: parts[0]?.trim() || clean, role: parts.slice(1).join(' – ').trim() };
}

async function main() {
  if (!hasKey()) { console.error('TINYFISH_API_KEY missing in .env'); process.exit(1); }
  if (!company) { console.error('Usage: node find-contact.mjs "Company Name" [--role "..."]'); process.exit(1); }

  console.log(`\n🤝 Decision-makers at ${company}${role ? ` (for: ${role})` : ''}\n`);
  const seen = new Set();
  for (const g of GROUPS) {
    let res;
    try { res = await tfSearch(g.q(company), { page: 0 }); } catch (e) { console.error(`  ! ${e.message}`); continue; }
    const rows = (res.results || [])
      .filter((r) => /linkedin\.com\/in\//i.test(r.url || ''))
      .filter((r) => (seen.has(r.url) ? false : seen.add(r.url)));
    if (!rows.length) continue;
    console.log(`▸ ${g.label}`);
    for (const r of rows.slice(0, 5)) {
      const p = parsePerson(r.title);
      console.log(`   • ${p.name}${p.role ? ` — ${p.role}` : ''}`);
      console.log(`     ${r.url}`);
    }
    console.log('');
  }
  console.log('Next: ask me to "draft outreach to <name> at ' + company + '" — I\'ll write it from your CV via the contacto mode (you review before sending).');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
