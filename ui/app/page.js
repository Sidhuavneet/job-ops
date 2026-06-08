'use client';
import { useEffect, useState, useCallback } from 'react';

function scoreClass(n) { return n >= 4 ? 'hi' : n >= 3.5 ? 'mid' : 'lo'; }
function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

// Drag a tailored CV out as a real file (Chromium "DownloadURL" — drop onto your
// desktop, Finder, or a native file-picker without downloading first).
function dragCV(cvFile) {
  return (e) => {
    if (!cvFile) return;
    const url = `${window.location.origin}/api/cv?file=${encodeURIComponent(cvFile)}`;
    e.dataTransfer.setData('DownloadURL', `application/pdf:${cvFile}:${url}`);
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.effectAllowed = 'copy';
  };
}

export default function Page() {
  const [tab, setTab] = useState('roles');
  const [theme, setTheme] = useState('dark');
  const [toast, setToast] = useState('');

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t); document.documentElement.setAttribute('data-theme', t);
  };

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>🎯 Career-Ops Dashboard</h1>
          <p className="sub">Small, funded, remote startups · early-career AI/SWE roles</p>
        </div>
        <button className="btn" onClick={toggleTheme}>{theme === 'dark' ? '☀️ Light' : '🌙 Dark'}</button>
      </header>

      <div className="tabs">
        <button className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Roles</button>
        <button className={`tab ${tab === 'assistant' ? 'active' : ''}`} onClick={() => setTab('assistant')}>🔎 Search Assistant</button>
        <button className={`tab ${tab === 'companies' ? 'active' : ''}`} onClick={() => setTab('companies')}>Companies</button>
        <button className={`tab ${tab === 'boards' ? 'active' : ''}`} onClick={() => setTab('boards')}>Boards &amp; Queries</button>
        <button className={`tab ${tab === 'targeting' ? 'active' : ''}`} onClick={() => setTab('targeting')}>Targeting</button>
        <button className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>ℹ️ Info</button>
      </div>

      {tab === 'roles' && <Roles flash={flash} />}
      {tab === 'assistant' && <Assistant flash={flash} />}
      {tab === 'companies' && <Companies flash={flash} />}
      {tab === 'boards' && <Boards flash={flash} />}
      {tab === 'targeting' && <Targeting flash={flash} />}
      {tab === 'info' && <Info />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------------- ROLES ----------------
// Reusable kit content (apply, CV preview, re-tailor feedback, emails, outreach, contacts).
function KitBody({ kit }) {
  const [showPreview, setShowPreview] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fbSaved, setFbSaved] = useState(false);

  const submitFeedback = async () => {
    if (!feedback.trim()) return;
    await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: kit.url, feedback: feedback.trim() }) });
    setFbSaved(true);
    setTimeout(() => setFbSaved(false), 2500);
  };

  const d = kit.data;
  return (
    <div style={{ borderLeft: '3px solid var(--accent)', padding: '6px 10px', background: 'var(--panel-2)' }}>
      <div className="row" style={{ gap: 12, margin: '2px 0 6px', flexWrap: 'wrap' }}>
        <strong style={{ marginRight: 6 }}>{kit.accepted ? '📋 Application Kit' : '🤝 Contacts & outreach'}{kit.role ? ` · ${kit.role}` : ''}</strong>
        {kit.url && <a className="btn sm primary" href={kit.url} target="_blank" rel="noreferrer">{kit.role ? 'Apply ↗' : 'Careers ↗'}</a>}
        {kit.role && (kit.cv
          ? <>
              <a className="btn sm" href={`/api/cv?file=${encodeURIComponent(kit.cv)}`} target="_blank" rel="noreferrer">📄 Download CV</a>
              <span className="btn sm" draggable onDragStart={dragCV(kit.cv)} style={{ cursor: 'grab' }} title="Drag this CV straight to your desktop or a file-upload box — no download needed">⠿ Drag CV</span>
              <button className="btn sm" onClick={() => setShowPreview((p) => !p)}>{showPreview ? '↑ Hide preview' : '👁 Preview CV'}</button>
            </>
          : kit.accepted
            ? <span className="muted" style={{ fontSize: 12 }}>📄 CV pending — ask Claude to "process accepted queue"</span>
            : <span className="muted" style={{ fontSize: 12 }}>Accept to generate a tailored CV</span>)}
      </div>

      {showPreview && kit.cv && (
        <iframe
          src={`/api/cv?file=${encodeURIComponent(kit.cv)}`}
          title="Tailored CV preview"
          style={{ width: '100%', height: 540, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 10, display: 'block' }}
        />
      )}

      {kit.loading && <p className="muted">Finding contacts + emails…</p>}
      {d?.error && <p style={{ color: 'var(--red)' }}>⚠ {d.error}</p>}
      {d?.emails && (d.emails.found.length > 0 || d.emails.guessed.length > 0) ? (
        <div style={{ marginBottom: 6 }}>
          <span className="muted" style={{ fontSize: 11 }}>Emails ({d.emails.domain}): </span>
          <span className="chips">
            {d.emails.found.map((e) => <span className="chip" key={e}>{e} ✅</span>)}
            {d.emails.guessed.map((e) => <span className="chip muted" key={e}>{e}<span style={{ fontSize: 10 }}> guess</span></span>)}
          </span>
        </div>
      ) : null}
      {d?.dm && (
        <div className="grid2">
          <div><div className="row" style={{ justifyContent: 'space-between' }}><strong>LinkedIn DM</strong><button className="btn sm" onClick={() => navigator.clipboard?.writeText(d.dm)}>Copy</button></div><pre className="log" style={{ color: 'var(--text)', background: 'var(--bg)', maxHeight: 150 }}>{d.dm}</pre></div>
          <div><div className="row" style={{ justifyContent: 'space-between' }}><strong>Cold email</strong><button className="btn sm" onClick={() => navigator.clipboard?.writeText(`Subject: ${d.email.subject}\n\n${d.email.body}`)}>Copy</button></div><pre className="log" style={{ color: 'var(--text)', background: 'var(--bg)', maxHeight: 150 }}>{`Subject: ${d.email.subject}\n\n${d.email.body}`}</pre></div>
        </div>
      )}
      {d?.groups?.map((g) => g.people.length > 0 && (
        <div key={g.group} style={{ marginTop: 6 }}>
          <span className="muted" style={{ fontSize: 11 }}>{g.group}:</span>{' '}
          {g.people.map((p) => <span key={p.url} style={{ marginRight: 12 }}><a href={p.url} target="_blank" rel="noreferrer">{p.name}</a> <span className="muted" style={{ fontSize: 11 }}>{(p.role || '').slice(0, 30)}</span></span>)}
        </div>
      ))}

      {kit.accepted && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Re-tailor feedback — Claude reads this on next pass</div>
          <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder='e.g. "Lead with the RAG pipeline bullet, de-emphasize blockchain, add the p-limit parallelism detail"'
              style={{ flex: 1, minHeight: 52, fontSize: 12 }}
            />
            <button
              className="btn sm"
              style={{ alignSelf: 'flex-end', ...(fbSaved ? { color: 'var(--green)', borderColor: 'var(--green)' } : { background: 'var(--accent)', color: '#0d1117', borderColor: 'var(--accent)' }) }}
              onClick={submitFeedback}
              disabled={!feedback.trim()}
            >{fbSaved ? '✓ Saved' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Roles({ flash }) {
  const [data, setData] = useState({ evaluated: [], pending: [], accepted: [] });
  const [loading, setLoading] = useState(true);
  const [hideRejected, setHideRejected] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [log, setLog] = useState('');
  const [kits, setKits] = useState({}); // url -> kit (inline, multiple open)

  // Best employer name: board-scan roles put the board in `company`, the real
  // employer in the title ("... at VOYGR"). Prefer that.
  const employerOf = (company, title) => {
    const m = (title || '').match(/(?:\bat|@)\s+([A-Z][\w.&'/ -]+?)(?:\s*[|(@]|\(|$)/);
    const fromTitle = m ? m[1].trim() : '';
    const clean = (company || '').replace(/\s*[-–|@].*$/, '').trim();
    const looksBoardy = /work at a startup|greenhouse|ashby|jobs|wellfound|remote|y combinator/i.test(clean);
    return (looksBoardy && fromTitle) ? fromTitle : (clean || fromTitle);
  };

  const setKit = (url, patch) => setKits((k) => ({ ...k, [url]: { ...k[url], ...patch } }));
  const closeKit = (url) => setKits((k) => { const n = { ...k }; delete n[url]; return n; });

  // Open an inline kit under a row (multiple can be open).
  const openKit = async (company, title, url, accepted, cv) => {
    const co = employerOf(company, title);
    setKit(url, { company: co, role: title, url, accepted, cv, loading: true, data: null });
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: co, role: title }) });
      setKit(url, { loading: false, data: await r.json() });
    } catch (e) { setKit(url, { loading: false, data: { error: String(e) } }); }
  };
  const toggleContacts = (company, title, url) => (kits[url] ? closeKit(url) : openKit(company, title, url, false));

  // Accept → queue + open inline kit. Role moves to the Accepted section.
  const accept = async (company, title, url, kind) => {
    const co = employerOf(company, title);
    const r = await fetch('/api/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, company: co, role: title, kind }) });
    const res = await r.json();
    flash('Accepted → kit ready'); load();
    openKit(company, title, url, true, res.cv);
  };
  const removeAccepted = async (url) => {
    await fetch('/api/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', url }) });
    closeKit(url); flash('Removed'); load();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/roles', { cache: 'no-store' });
    setData(await r.json()); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    if (scanning) return;
    setScanning(true); setLog('▶ Starting ATS scan…\n');
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setLog((l) => l + dec.decode(value));
      }
      flash('Scan complete'); load();
    } catch (e) {
      setLog((l) => l + `\n[client error: ${e}]\n`);
    } finally {
      setScanning(false);
    }
  };

  const reject = async (payload) => {
    await fetch('/api/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', ...payload }) });
    flash('Rejected'); load();
  };

  if (loading) return <p className="muted">Loading…</p>;
  const evaluated = data.evaluated.filter((r) => !hideRejected || !/skip|discarded/i.test(r.status));
  const acceptedMap = new Map((data.accepted || []).filter(a => a.url).map(a => [a.url, a]));

  return (
    <>
      <div className="toolbar">
        <button className="btn primary" onClick={runScan} disabled={scanning}>{scanning ? '⏳ Scanning…' : '▶ Run scan (live)'}</button>
        <label className="row"><input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Hide rejected/skip</label>
        <button className="btn sm" onClick={load}>↻ Refresh</button>
      </div>

      {log && (
        <div className="card">
          <p className="section-title">Scan log {scanning && <span className="count">running…</span>}</p>
          <pre className="log">{log}</pre>
        </div>
      )}

      <div className="card">
        <p className="section-title">📋 Accepted — application kits <span className="count">({(data.accepted || []).length})</span></p>
        {(!data.accepted || data.accepted.length === 0)
          ? <p className="muted">No accepted roles yet. Accept a role below to queue a tailored CV + outreach kit.</p>
          : <table>
              <thead><tr><th>Company</th><th>Role</th><th>CV</th><th>Apply</th><th></th></tr></thead>
              <tbody>
                {data.accepted.flatMap((a) => [
                  <tr key={a.url || a.company}>
                    <td><strong>{a.company}</strong></td>
                    <td>{a.role}</td>
                    <td>{a.cv
                      ? <span draggable onDragStart={dragCV(a.cv)} style={{ color: 'var(--green)', cursor: 'grab' }} title="Drag this CV to your desktop or a file-upload box — no download needed">✓ ready ⠿</span>
                      : <span className="muted">pending</span>}</td>
                    <td>{a.url && <a href={a.url} target="_blank" rel="noreferrer">Open ↗</a>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" style={{ color: 'var(--green)', borderColor: 'var(--green)' }} onClick={() => (kits[a.url] ? closeKit(a.url) : openKit(a.company, a.role, a.url, true, a.cv))}>📋 Kit</button>{' '}
                      <button className="btn sm danger" onClick={() => removeAccepted(a.url)}>✕</button>
                    </td>
                  </tr>,
                  kits[a.url] ? <tr key={(a.url || a.company) + '-k'}><td colSpan={5}><KitBody kit={kits[a.url]} /></td></tr> : null,
                ])}
              </tbody>
            </table>}
      </div>

      <div className="card">
        <p className="section-title">Evaluated <span className="count">({evaluated.length})</span></p>
        <table>
          <thead><tr><th>#</th><th>Company</th><th>Role</th><th>Score</th><th>Status</th><th>Links</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {evaluated.flatMap((r) => [
              <tr key={r.num}>
                <td className="muted">{r.num}</td>
                <td>
                  <strong>{r.company}</strong>
                  {r.profile?.linkedin && <> · <a href={r.profile.linkedin} target="_blank" rel="noreferrer">in↗</a></>}
                  {r.profile?.blurb && <div className="muted" style={{ fontSize: 11 }}>{r.profile.blurb.slice(0, 90)}</div>}
                </td>
                <td>{r.role}</td>
                <td><span className={`score ${scoreClass(r.scoreNum)}`}>{r.score}</span></td>
                <td><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span></td>
                <td>
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer">Apply ↗</a>}
                  {r.url && r.report && ' · '}
                  {r.report && <a href={`/api/report?path=${encodeURIComponent(r.report)}`} target="_blank" rel="noreferrer">Report</a>}
                </td>
                <td className="muted">{r.notes}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {acceptedMap.has(r.url) ? (
                    <>
                      <button className="btn sm" style={{ color: 'var(--green)', borderColor: 'var(--green)' }} onClick={() => (kits[r.url] ? closeKit(r.url) : openKit(r.company, r.role, r.url, true, acceptedMap.get(r.url)?.cv))}>✅ Kit</button>{' '}
                      <button className="btn sm danger" onClick={() => removeAccepted(r.url)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn sm primary" onClick={() => accept(r.company, r.role, r.url, 'evaluated')}>✅ Accept</button>{' '}
                      <button className="btn sm" onClick={() => toggleContacts(r.company, r.role, r.url)}>🤝</button>{' '}
                      {!/skip|discarded/i.test(r.status) && <button className="btn sm danger" onClick={() => reject({ kind: 'evaluated', num: r.num })}>Reject</button>}
                    </>
                  )}
                </td>
              </tr>,
              kits[r.url] ? <tr key={r.num + '-k'}><td colSpan={8}><KitBody kit={kits[r.url]} /></td></tr> : null,
            ])}
          </tbody>
        </table>
      </div>

      <div className="card">
        <p className="section-title">Pending — not yet scored <span className="count">({data.pending.length})</span></p>
        <table>
          <thead><tr><th>Company</th><th>Role</th><th>Source</th><th>Link</th><th></th></tr></thead>
          <tbody>
            {data.pending.flatMap((p) => [
              <tr key={p.url}>
                <td>
                  <strong>{p.company}</strong>
                  {p.profile?.linkedin && <> · <a href={p.profile.linkedin} target="_blank" rel="noreferrer">in↗</a></>}
                </td>
                <td>{p.title}</td>
                <td className="muted">{host(p.url)}</td>
                <td><a href={p.url} target="_blank" rel="noreferrer">Open ↗</a></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {acceptedMap.has(p.url) ? (
                    <>
                      <button className="btn sm" style={{ color: 'var(--green)', borderColor: 'var(--green)' }} onClick={() => (kits[p.url] ? closeKit(p.url) : openKit(p.company, p.title, p.url, true, acceptedMap.get(p.url)?.cv))}>✅ Kit</button>{' '}
                      <button className="btn sm danger" onClick={() => removeAccepted(p.url)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn sm primary" onClick={() => accept(p.company, p.title, p.url, 'pending')}>✅ Accept</button>{' '}
                      <button className="btn sm" onClick={() => toggleContacts(p.company, p.title, p.url)}>🤝</button>{' '}
                      <button className="btn sm danger" onClick={() => reject({ kind: 'pending', url: p.url })}>Reject</button>
                    </>
                  )}
                </td>
              </tr>,
              kits[p.url] ? <tr key={p.url + '-k'}><td colSpan={5}><KitBody kit={kits[p.url]} /></td></tr> : null,
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------- SEARCH ASSISTANT (TinyFish playground) ----------------
const EXAMPLES = [
  'site:jobs.ashbyhq.com "AI Engineer" OR "Founding Engineer" remote',
  'site:job-boards.eu.greenhouse.io "Software Engineer" remote',
  'seed stage AI startups hiring remote engineers Europe 2026',
  'site:wellfound.com "Founding Engineer" remote',
];
function Assistant({ flash }) {
  const [mode, setMode] = useState('search'); // search | expand | fetch
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');

  const run = async () => {
    setLoading(true); setErr(''); setResults(null); setText(''); setContacts(null);
    try {
      if (mode === 'contacts') {
        const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: query.trim() }) });
        const data = await r.json();
        if (data.error) { setErr(data.error); return; }
        setContacts(data);
        return;
      }
      const action = mode;
      const payload = mode === 'search' ? { action, query, pages } : { action, url: query.trim() };
      const r = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();
      if (data.error) { setErr(data.error); return; }
      if (mode === 'fetch') setText(`# ${data.title || ''}\n${data.url || ''}\n\n${data.text || ''}`);
      else setResults(data.results || []);
    } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  };

  const addRows = async (rows) => {
    const r = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', rows }) });
    const d = await r.json();
    flash(d.added ? `Added ${d.added} to pipeline` : 'Nothing new to add');
  };

  return (
    <>
      <div className="card">
        <p className="section-title">Search Assistant <span className="count">— TinyFish Search / Expand / Fetch · try any prompt</span></p>
        <div className="toolbar">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="btn">
            <option value="search">Search (query → results)</option>
            <option value="expand">Expand (listing URL → roles)</option>
            <option value="fetch">Fetch (URL → clean text)</option>
            <option value="contacts">Contacts (company → decision-makers)</option>
          </select>
          {mode === 'search' && (
            <select value={pages} onChange={(e) => setPages(Number(e.target.value))} className="btn">
              <option value={1}>1 page</option><option value={2}>2 pages</option><option value={3}>3 pages</option>
            </select>
          )}
          <button className="btn primary" onClick={run} disabled={loading || !query.trim()}>{loading ? '…' : 'Run'}</button>
        </div>
        <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === 'search' ? 'Type a query (site: operators work)…' : mode === 'contacts' ? 'Type a company name…' : 'Paste a URL…'} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }} />
        {mode === 'search' && (
          <div className="chips" style={{ marginTop: 10 }}>
            {EXAMPLES.map((ex) => <span className="chip" key={ex} style={{ cursor: 'pointer' }} onClick={() => setQuery(ex)}>{ex.length > 48 ? ex.slice(0, 48) + '…' : ex}</span>)}
          </div>
        )}
        {err && <p style={{ color: 'var(--red)', marginTop: 10 }}>⚠ {err}</p>}
      </div>

      {text && <div className="card"><pre className="log" style={{ color: 'var(--text)', background: 'var(--bg)' }}>{text}</pre></div>}

      {contacts && (contacts.dm || contacts.email) && (
        <div className="card">
          <p className="section-title">Cold outreach <span className="count">— crisp, recruiter reads value in 3–5s · edit in ui/lib/outreach.js</span></p>
          <div className="grid2">
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><strong>LinkedIn DM</strong><button className="btn sm" onClick={() => navigator.clipboard?.writeText(contacts.dm)}>Copy</button></div>
              <pre className="log" style={{ color: 'var(--text)', background: 'var(--bg)', maxHeight: 200 }}>{contacts.dm}</pre>
            </div>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><strong>Cold email</strong><button className="btn sm" onClick={() => navigator.clipboard?.writeText(`Subject: ${contacts.email.subject}\n\n${contacts.email.body}`)}>Copy</button></div>
              <pre className="log" style={{ color: 'var(--text)', background: 'var(--bg)', maxHeight: 200 }}>{`Subject: ${contacts.email.subject}\n\n${contacts.email.body}`}</pre>
            </div>
          </div>
        </div>
      )}

      {contacts && contacts.groups && (
        <div className="card">
          <p className="section-title">Decision-makers <span className="count">— verify on LinkedIn before sending</span></p>
          {contacts.groups.every((g) => !g.people.length) && <p className="muted">No contacts found — try the exact company name.</p>}
          {contacts.groups.map((g) => g.people.length > 0 && (
            <div key={g.group} style={{ marginBottom: 14 }}>
              <p className="section-title" style={{ marginBottom: 6 }}>{g.group}</p>
              <table>
                <tbody>
                  {g.people.map((p) => (
                    <tr key={p.url}>
                      <td><strong>{p.name}</strong></td>
                      <td className="muted">{p.role}</td>
                      <td><a href={p.url} target="_blank" rel="noreferrer">LinkedIn ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {results && (
        <div className="card">
          <div className="toolbar">
            <span className="section-title" style={{ margin: 0 }}>{results.length} results</span>
            {results.length > 0 && <button className="btn primary" onClick={() => addRows(results.map((r) => ({ url: r.url, company: r.company, title: r.title })))}>+ Add all to pipeline</button>}
          </div>
          <table>
            <thead><tr><th>Company</th><th>Title</th><th>Source</th><th>Link</th><th></th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.url + i}>
                  <td><strong>{r.company}</strong></td>
                  <td>{r.title}{r.snippet && <div className="muted" style={{ fontSize: 12 }}>{r.snippet.slice(0, 120)}</div>}</td>
                  <td className="muted">{r.source || ''}</td>
                  <td><a href={r.url} target="_blank" rel="noreferrer">Open ↗</a></td>
                  <td><button className="btn sm" onClick={() => addRows([{ url: r.url, company: r.company, title: r.title }])}>+ Add</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------- COMPANIES (Method 1 — ATS scan) ----------------
function Companies({ flash }) {
  const [companies, setCompanies] = useState(null);
  const [q, setQ] = useState('');
  const [kits, setKits] = useState({}); // name -> kit (inline, multiple open)

  useEffect(() => { fetch('/api/config', { cache: 'no-store' }).then((r) => r.json()).then((c) => setCompanies(c.companies)); }, []);

  const closeKit = (name) => setKits((k) => { const n = { ...k }; delete n[name]; return n; });
  // Accept a company → queue + open inline company kit (contacts + emails + outreach).
  const acceptCompany = async (name, careers) => {
    if (kits[name]) { closeKit(name); return; }
    setKits((k) => ({ ...k, [name]: { company: name, url: careers, role: '', accepted: true, loading: true } }));
    try {
      await fetch('/api/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: careers, company: name, role: '', kind: 'company' }) });
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: name, website: careers }) });
      const data = await r.json();
      setKits((k) => ({ ...k, [name]: { ...k[name], loading: false, data } }));
      flash('Company accepted → kit');
    } catch (e) { setKits((k) => ({ ...k, [name]: { ...k[name], loading: false, data: { error: String(e) } } })); }
  };

  const save = async () => {
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'companies', companies }) });
    flash('Companies saved');
  };
  // mutate by index into the full (unfiltered) array so hidden fields persist
  const update = (idx, k, v) => setCompanies((cs) => cs.map((c, j) => (j === idx ? { ...c, [k]: v } : c)));
  const add = () => { setCompanies((cs) => [{ name: '', careers_url: '', enabled: true, notes: '' }, ...cs]); setQ(''); };
  const del = (idx) => setCompanies((cs) => cs.filter((_, j) => j !== idx));

  if (!companies) return <p className="muted">Loading…</p>;
  const rows = companies
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => !q || (c.name || '').toLowerCase().includes(q.toLowerCase()));
  const onCount = companies.filter((c) => c.enabled).length;

  return (
   <>
    <div className="card">
      <p className="section-title">Tracked companies <span className="count">({companies.length} total, {onCount} enabled) — Method 1 / ATS scan</span></p>
      <div className="toolbar">
        <input type="text" style={{ maxWidth: 280 }} placeholder="Filter by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={add}>+ Add company</button>
        <button className="btn primary" onClick={save}>Save to portals.yml</button>
      </div>
      <table>
        <thead><tr><th style={{ width: 36 }}>On</th><th style={{ width: 200 }}>Name</th><th>Careers URL (Greenhouse / Ashby / Lever)</th><th style={{ width: 220 }}>Notes</th><th></th></tr></thead>
        <tbody>
          {rows.flatMap(({ c, idx }) => [
            <tr key={idx}>
              <td><input type="checkbox" checked={c.enabled} onChange={(e) => update(idx, 'enabled', e.target.checked)} /></td>
              <td><input type="text" value={c.name || ''} onChange={(e) => update(idx, 'name', e.target.value)} /></td>
              <td>
                <input type="text" value={c.careers_url || ''} onChange={(e) => update(idx, 'careers_url', e.target.value)} />
                {c.scan_method && <span className="muted" style={{ fontSize: 11 }}>method: {c.scan_method}</span>}
              </td>
              <td><input type="text" value={c.notes || ''} onChange={(e) => update(idx, 'notes', e.target.value)} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm primary" onClick={() => acceptCompany(c.name, c.careers_url)} title="Accept → company kit">📋</button>{' '}
                <button className="btn sm danger" onClick={() => del(idx)}>✕</button>
              </td>
            </tr>,
            kits[c.name] ? <tr key={idx + '-k'}><td colSpan={5}><KitBody kit={kits[c.name]} /></td></tr> : null,
          ])}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No companies match “{q}”.</p>}
    </div>
   </>
  );
}

// ---------------- BOARDS & QUERIES ----------------
function Boards({ flash }) {
  const [queries, setQueries] = useState(null);

  useEffect(() => { fetch('/api/config', { cache: 'no-store' }).then((r) => r.json()).then((c) => setQueries(c.queries)); }, []);

  const save = async () => {
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'queries', queries }) });
    flash('Boards saved');
  };
  const update = (i, k, v) => setQueries((q) => q.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const add = () => setQueries((q) => [...q, { name: 'New board', query: 'site:example.com "AI Engineer" OR "Software Engineer" remote', enabled: true }]);
  const del = (i) => setQueries((q) => q.filter((_, j) => j !== i));

  if (!queries) return <p className="muted">Loading…</p>;
  return (
    <div className="card">
      <p className="section-title">Search queries / boards <span className="count">({queries.length}) — edit, toggle, add</span></p>
      <table>
        <thead><tr><th style={{ width: 36 }}>On</th><th style={{ width: 200 }}>Name</th><th>Query (site: filter)</th><th></th></tr></thead>
        <tbody>
          {queries.map((q, i) => (
            <tr key={i}>
              <td><input type="checkbox" checked={q.enabled} onChange={(e) => update(i, 'enabled', e.target.checked)} /></td>
              <td><input type="text" value={q.name} onChange={(e) => update(i, 'name', e.target.value)} /></td>
              <td><textarea value={q.query} onChange={(e) => update(i, 'query', e.target.value)} /></td>
              <td><button className="btn sm danger" onClick={() => del(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: 14 }}>
        <button className="btn" onClick={add}>+ Add board</button>
        <button className="btn primary" onClick={save}>Save to portals.yml</button>
      </div>
    </div>
  );
}

// ---------------- TARGETING ----------------
function Targeting({ flash }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { fetch('/api/config', { cache: 'no-store' }).then((r) => r.json()).then(setCfg); }, []);

  const save = async () => {
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'targeting', positive: cfg.positive, negative: cfg.negative, location: cfg.location }) });
    flash('Targeting saved');
  };
  if (!cfg) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="grid2">
        <ChipEditor title="Target roles / keywords (match)" items={cfg.positive} onChange={(v) => setCfg({ ...cfg, positive: v })} />
        <ChipEditor title="Exclude (negative)" items={cfg.negative} onChange={(v) => setCfg({ ...cfg, negative: v })} />
      </div>
      <div className="grid2">
        <ChipEditor title="Location — allow" items={cfg.location.allow} onChange={(v) => setCfg({ ...cfg, location: { ...cfg.location, allow: v } })} />
        <ChipEditor title="Location — block" items={cfg.location.block} onChange={(v) => setCfg({ ...cfg, location: { ...cfg.location, block: v } })} />
      </div>
      <button className="btn primary" onClick={save}>Save to portals.yml</button>
    </>
  );
}

// ---------------- INFO (reference) ----------------
function Info() {
  return (
    <>
      <div className="card">
        <p className="section-title">How this works — 3 engines + brain</p>
        <ul style={{ lineHeight: 1.9, margin: 0 }}>
          <li><strong>🔍 Engine 1 — Job Scraper</strong> → finds roles. Company scan (<code>scan.mjs</code>, free ATS feeds) + board search (<code>tinyfish-scan.mjs</code>). Cleaned by <code>clean-pipeline.mjs</code>, liveness-checked by <code>check-liveness.mjs</code>.</li>
          <li><strong>🚀 Engine 2 — Startup Finder</strong> → finds companies. <code>startup-finder.mjs</code> (Launch HN = tiny just-funded YC startups) + <code>discover-companies.mjs</code> (ATS boards). Adds them to tracked companies.</li>
          <li><strong>🤝 Engine 3 — Decision-Maker</strong> → <code>find-contact.mjs</code> + the Search Assistant <em>Contacts</em> mode: founders/recruiters + a ready cold DM &amp; email.</li>
          <li><strong>🧠 Brain</strong> → career-ops evaluation (A–G + startup-fit gate) → tracker → this dashboard.</li>
        </ul>
      </div>

      <div className="grid2">
        <div className="card">
          <p className="section-title">2 discovery pipelines</p>
          <ul style={{ lineHeight: 1.9, margin: 0 }}>
            <li><strong>Company-based</strong>: <code>company-pipeline.mjs</code> → find startups → enrich (LinkedIn) → <code>scan.mjs</code> their ATS feeds. Free.</li>
            <li><strong>Job-board-based</strong>: <code>tinyfish-scan.mjs --all</code> → search whole boards (Wellfound/YC/Ashby/…), <code>--expand</code> listing pages. Uses TinyFish.</li>
          </ul>
        </div>
        <div className="card">
          <p className="section-title">Tools</p>
          <ul style={{ lineHeight: 1.9, margin: 0 }}>
            <li><strong>TinyFish</strong> Search + Fetch (free) — discovery + JD/LinkedIn fetch.</li>
            <li><strong>Playwright</strong> (isolated Chromium) — liveness + PDF.</li>
            <li><strong>Greenhouse / Ashby / Lever</strong> JSON APIs — company scan.</li>
            <li><strong>HN Algolia</strong> API — Launch HN startups.</li>
            <li><strong>Claude</strong> (me) — evaluation, ranking, outreach drafting.</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <p className="section-title">Key commands (run in the repo root)</p>
        <pre className="log" style={{ color: 'var(--text)', background: 'var(--bg)' }}>{`# Company pipeline (find startups → enrich → scan)
node company-pipeline.mjs

# Board discovery (TinyFish)
node tinyfish-scan.mjs --all --write
node tinyfish-scan.mjs --expand-all --write

# Find fresh funded startups (Launch HN)
node startup-finder.mjs --resolve --write

# Enrich companies (LinkedIn + profile)
node enrich-companies.mjs

# Decision-makers for a company
node find-contact.mjs "Company Name"

# Strict cleanups
node clean-pipeline.mjs --write      # roles
node clean-companies.mjs --write     # companies

# Health
npm run doctor ; node verify-pipeline.mjs`}</pre>
      </div>

      <div className="card">
        <p className="section-title">This dashboard</p>
        <ul style={{ lineHeight: 1.9, margin: 0 }}>
          <li><strong>Roles</strong> — scored + pending roles, company LinkedIn/profile, live Run-scan, reject.</li>
          <li><strong>Search Assistant</strong> — Search / Expand / Fetch / Contacts (+cold DM &amp; email).</li>
          <li><strong>Companies</strong> — manage tracked companies (Engine 1 source).</li>
          <li><strong>Boards &amp; Queries</strong> + <strong>Targeting</strong> — edit the board queries &amp; keywords.</li>
        </ul>
      </div>
    </>
  );
}

function ChipEditor({ title, items, onChange }) {
  const [val, setVal] = useState('');
  const add = () => { const v = val.trim(); if (v && !items.includes(v)) onChange([...items, v]); setVal(''); };
  return (
    <div className="card">
      <p className="section-title">{title} <span className="count">({items.length})</span></p>
      <div className="chips" style={{ marginBottom: 12 }}>
        {items.map((it) => (
          <span className="chip" key={it}>{it}<button onClick={() => onChange(items.filter((x) => x !== it))}>✕</button></span>
        ))}
      </div>
      <div className="row">
        <input type="text" value={val} placeholder="Add…" onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}
