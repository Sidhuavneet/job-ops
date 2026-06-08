import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';

// Repo root = parent of the ui/ dir. Everything stays inside temp/career-ops.
export const ROOT = process.env.CAREER_OPS_ROOT || path.resolve(process.cwd(), '..');
const P = (rel) => path.join(ROOT, rel);

const APPLICATIONS = P('data/applications.md');
const PIPELINE = P('data/pipeline.md');
const HISTORY = P('data/scan-history.tsv');
const PROFILES = P('data/company-profiles.json');
const ACCEPTED = P('data/accepted.md');
const OUTPUT = P('output');
const PORTALS = P('portals.yml');

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Accept a role → add to the application queue (data/accepted.md) and remove
// it from Pending. The queue is what Claude processes to tailor CVs.
export async function acceptRole({ url, company, role, kind }) {
  let md = await readSafe(ACCEPTED);
  if (!md) md = '# Accepted — application queue\n\nEach line is a role to build an application kit for (tailored CV, contacts, outreach).\n\n';
  if (!(url && md.includes(url))) {
    const date = new Date().toISOString().slice(0, 10);
    md += `- [ ] ${url || ''} | ${company} | ${role || ''}   <!-- accepted ${date}; kind:${kind}; cv:${slugify(company + '-' + (role || ''))}.pdf -->\n`;
    await fs.writeFile(ACCEPTED, md, 'utf-8');
  }
  if (kind === 'pending' && url) {
    const pipe = await readSafe(PIPELINE);
    await fs.writeFile(PIPELINE, pipe.split('\n').filter((l) => !(l.startsWith('- [') && l.includes(url))).join('\n'), 'utf-8');
  }
  return { ok: true, cv: await cvFor(company, role) };
}

// List the accepted application queue (data/accepted.md), with CV status.
export async function getAccepted() {
  const md = await readSafe(ACCEPTED);
  const out = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^- \[[ x]\]\s*(\S*)\s*\|\s*([^|]*)\|\s*([^<]*?)\s*(?:<!--\s*accepted\s*(\S+).*?(?:kind:(\w+))?)?\s*(?:-->)?\s*$/);
    if (!m) continue;
    const company = (m[2] || '').trim();
    const role = (m[3] || '').trim();
    if (!company) continue;
    out.push({ url: m[1] || '', company, role, date: m[4] || '', kind: m[5] || '', cv: await cvFor(company, role) });
  }
  return out;
}

// Save re-tailor feedback for an accepted role (appended to its accepted.md comment).
export async function saveFeedback(url, feedback) {
  let md = await readSafe(ACCEPTED);
  const clean = (feedback || '').replace(/;/g, ',').replace(/-->/g, '->');
  const lines = md.split('\n').map(line => {
    if (!line.startsWith('- [') || !url || !line.includes(url)) return line;
    let updated = line.replace(/;\s*feedback:[^<>]*(?=\s*-->)/, '');
    if (updated.includes('-->')) {
      updated = updated.replace(/\s*-->/, `; feedback: ${clean} -->`);
    } else {
      updated = `${updated}  <!-- feedback: ${clean} -->`;
    }
    return updated;
  });
  await fs.writeFile(ACCEPTED, lines.join('\n'), 'utf-8');
  return { ok: true };
}

// Remove an entry from the accepted queue.
export async function unaccept(url) {
  const md = await readSafe(ACCEPTED);
  await fs.writeFile(ACCEPTED, md.split('\n').filter((l) => !(l.startsWith('- [') && url && l.includes(url))).join('\n'), 'utf-8');
  return { ok: true };
}

// Is there a tailored CV PDF for this role yet? (Claude generates it into output/.)
export async function cvFor(company, role) {
  try {
    const files = await fs.readdir(OUTPUT);
    const want = slugify(company);
    const exact = `${slugify(company + '-' + (role || ''))}.pdf`;
    return files.find((f) => f === exact) || files.find((f) => f.endsWith('.pdf') && want && f.toLowerCase().includes(want)) || null;
  } catch { return null; }
}

// Company LinkedIn/profile lookup (from enrich-companies.mjs).
let _profiles = null;
async function loadProfiles() {
  if (_profiles) return _profiles;
  try { _profiles = JSON.parse(await fs.readFile(PROFILES, 'utf-8')); } catch { _profiles = {}; }
  return _profiles;
}
function matchProfile(profiles, company) {
  const c = (company || '').toLowerCase().replace(/\s*[-–|].*$/, '').replace(/\s+/g, ' ').trim();
  if (!c) return null;
  if (profiles[c]) return profiles[c];
  for (const [k, v] of Object.entries(profiles)) {
    if (k.length >= 4 && (c.includes(k) || k.includes(c))) return v;
  }
  return null;
}

async function readSafe(file) {
  try { return await fs.readFile(file, 'utf-8'); }
  catch { return ''; }
}

// ---------- ROLES ----------

// Parse the applications.md markdown table into evaluated role objects.
function parseApplications(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells: ['', num, date, company, role, score, status, pdf, report, notes, '']
    if (cells.length < 10) continue;
    const num = cells[1];
    if (!/^\d+$/.test(num)) continue; // skip header / separator
    const reportMatch = cells[8].match(/\(([^)]+)\)/);
    rows.push({
      num: Number(num),
      date: cells[2],
      company: cells[3],
      role: cells[4],
      score: cells[5],
      scoreNum: parseFloat(cells[5]) || 0,
      status: cells[6],
      report: reportMatch ? reportMatch[1] : null,
      notes: cells[9] || '',
    });
  }
  return rows;
}

// Pull "**URL:**" out of a report file (so evaluated roles get an apply link).
async function reportUrl(reportRel) {
  if (!reportRel) return null;
  const txt = await readSafe(P(reportRel));
  const m = txt.match(/\*\*URL:\*\*\s*(\S+)/);
  return m ? m[1] : null;
}

// Parse the "Pendientes" section of pipeline.md → [{url, company, title}]
function parsePipeline(md) {
  const out = [];
  const start = md.indexOf('## Pendientes');
  const end = md.indexOf('## Procesadas');
  const slice = md.slice(start === -1 ? 0 : start, end === -1 ? md.length : end);
  for (const line of slice.split('\n')) {
    const m = line.match(/^- \[[ x]\]\s*(\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/);
    if (m) out.push({ url: m[1], company: m[2].trim(), title: m[3].trim() });
  }
  return out;
}

export async function getRoles() {
  const [appsMd, pipeMd, profiles] = await Promise.all([readSafe(APPLICATIONS), readSafe(PIPELINE), loadProfiles()]);
  const evaluated = parseApplications(appsMd);
  for (const r of evaluated) { r.url = await reportUrl(r.report); r.profile = matchProfile(profiles, r.company); }
  const evalUrls = new Set(evaluated.map((r) => r.url).filter(Boolean));
  const pending = parsePipeline(pipeMd).filter((p) => !evalUrls.has(p.url));
  for (const p of pending) p.profile = matchProfile(profiles, p.company);
  evaluated.sort((a, b) => b.scoreNum - a.scoreNum);
  const accepted = await getAccepted();
  return { evaluated, pending, accepted };
}

// Reject an evaluated role → set its status to "Discarded".
export async function rejectEvaluated(num) {
  let md = await readSafe(APPLICATIONS);
  const lines = md.split('\n').map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length >= 10 && cells[1] === String(num)) {
      cells[6] = 'Discarded';
      return '| ' + cells.slice(1, -1).join(' | ') + ' |';
    }
    return line;
  });
  await fs.writeFile(APPLICATIONS, lines.join('\n'), 'utf-8');
  return true;
}

// Reject a pending role → remove its line from pipeline.md.
export async function rejectPending(url) {
  let md = await readSafe(PIPELINE);
  const lines = md.split('\n').filter((line) => !(line.startsWith('- [') && line.includes(url)));
  await fs.writeFile(PIPELINE, lines.join('\n'), 'utf-8');
  return true;
}

// Add discovered roles to pipeline.md (deduped vs pipeline + scan-history).
export async function addRoles(rows) {
  const pipeRaw = await readSafe(PIPELINE);
  const seen = new Set();
  for (const m of pipeRaw.matchAll(/^- \[[ x]\] (\S+)/gm)) seen.add(m[1]);
  const hist = await readSafe(HISTORY);
  for (const line of hist.split('\n')) { const u = line.split('\t')[0]?.trim(); if (u) seen.add(u); }

  const fresh = (rows || [])
    .filter((r) => r && r.url && !seen.has(r.url))
    .filter((r, i, a) => a.findIndex((x) => x.url === r.url) === i);
  if (!fresh.length) return { added: 0 };

  let md = pipeRaw;
  const procIdx = md.indexOf('## Procesadas');
  const block = '\n' + fresh.map((r) => `- [ ] ${r.url} | ${r.company || 'unknown'} | ${r.title || ''}`).join('\n') + '\n';
  md = procIdx === -1 ? md + block : md.slice(0, procIdx) + block + '\n' + md.slice(procIdx);
  await fs.writeFile(PIPELINE, md, 'utf-8');
  return { added: fresh.length };
}

// ---------- CONFIG (portals.yml) ----------

export async function getConfig() {
  const text = await readSafe(PORTALS);
  const doc = YAML.parse(text) || {};
  const tf = doc.title_filter || {};
  const lf = doc.location_filter || {};
  return {
    queries: (doc.search_queries || []).map((q) => ({
      name: q.name || '',
      query: q.query || '',
      enabled: q.enabled !== false,
    })),
    positive: tf.positive || [],
    negative: tf.negative || [],
    location: { allow: lf.allow || [], block: lf.block || [] },
    // Full company objects — hidden fields (api, scan_method, scan_query) are
    // carried through so the UI can edit name/url/notes without dropping them.
    companies: (doc.tracked_companies || []).map((c) => ({ ...c, enabled: c.enabled !== false })),
  };
}

// Write back while preserving the rest of the YAML file's comments/structure.
async function withDoc(mutate) {
  const text = await readSafe(PORTALS);
  const doc = YAML.parseDocument(text);
  mutate(doc);
  await fs.writeFile(PORTALS, String(doc), 'utf-8');
}

export async function saveQueries(queries) {
  await withDoc((doc) => {
    doc.set('search_queries', queries.map((q) => ({
      name: q.name, query: q.query, enabled: q.enabled !== false,
    })));
  });
  return true;
}

export async function saveCompanies(companies) {
  await withDoc((doc) => {
    // Strip empty rows; keep all provided fields (preserves api/scan_method/etc).
    const clean = companies
      .filter((c) => (c.name || '').trim() && (c.careers_url || '').trim())
      .map((c) => {
        const out = { name: c.name.trim(), careers_url: c.careers_url.trim() };
        if (c.api) out.api = c.api;
        if (c.scan_method) out.scan_method = c.scan_method;
        if (c.scan_query) out.scan_query = c.scan_query;
        out.enabled = c.enabled !== false;
        if (c.notes && c.notes.trim()) out.notes = c.notes.trim();
        return out;
      });
    doc.set('tracked_companies', clean);
  });
  return true;
}

export async function saveTargeting({ positive, negative, location }) {
  await withDoc((doc) => {
    if (!doc.has('title_filter')) doc.set('title_filter', {});
    doc.setIn(['title_filter', 'positive'], positive);
    doc.setIn(['title_filter', 'negative'], negative);
    if (location) {
      if (!doc.has('location_filter')) doc.set('location_filter', {});
      doc.setIn(['location_filter', 'allow'], location.allow || []);
      doc.setIn(['location_filter', 'block'], location.block || []);
    }
  });
  return true;
}
