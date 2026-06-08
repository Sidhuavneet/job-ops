# Engine 4 — LinkedIn Connection-Nurture DM Engine (PLAN)

> **Status: PLAN ONLY — not implemented.** This document captures the design,
> the research behind it, and the decisions already made, so the build can start
> later without re-deriving anything.
>
> **Decisions locked:**
> - **Build path → Custom in-repo (Playwright).** Chosen over open-source/SaaS because it
>   is the only option that honors the full-isolation rule (everything lives inside
>   `career-ops/`, gone if the folder is deleted), costs nothing, reuses the existing
>   stack (`outreach.js`, Playwright, `data/`), and gives full control of the safety knobs.
> - **Send mode → Draft queue + human approval (HITL).** Engine generates personalized
>   drafts; the user approves/edits before anything sends. Matches career-ops's
>   "never auto-submit, you make the final call" rule and is the single biggest
>   ban-risk reducer (the human is the rate limiter).

---

## 1. Goal

Stop hand-writing a LinkedIn DM for every new connection. When someone accepts a
connection request, send them a **personalized** message built from a template +
their name/company/headline, with the user reviewing each draft before it goes out.

Two original framings — "DM everyone who connected in the last 24h" and "message the
moment a connection is accepted" — **collapse into the same engine** (see §2).

> Scheduling/cadence (cron, run windows) is explicitly **out of scope** for this plan.
> This doc is about *how the engine is built*, not when it runs.

---

## 2. The constraint that dictates the whole design (researched, 2026)

- **No "connection accepted" webhook exists.** Both framings reduce to one mechanism:
  **poll your 1st-degree connections sorted by *Recently added* → diff against a ledger
  of who you've already messaged → draft DMs for the new ones.** "The moment accepted"
  is just a tighter poll cadence.
- **The official LinkedIn API cannot do this.** It does not allow sending personal DMs to
  your connections (only restricted Partner/Marketing messaging). Any approach here is
  "unofficial" by nature.
- **The unofficial Voyager API (`linkedin-api` Python) is a trap.** It logs in with
  username/password and gets **detected + permanently banned in ~3–7 days**. Do **not**
  build on it.
- **Browser extensions are the next-worst.** ~23% of users restricted within 90 days;
  ~60% higher ban risk than cloud tools.
- **The only durable path: drive your *real, already-logged-in* browser session, slowly,
  human-like, at low volume.** This use case is favorable — job-search outreach to a
  handful of *relevant* people, not mass sales blasting. Low volume + high relevance is
  exactly what stays under the radar.
- **Safe-ish ceiling (free account):** ~20–30 messages/day. For this use case, target
  **5–15/day with jitter** — far below any threshold.

---

## 3. Chosen architecture — "Engine 4: Connection Nurture"

Sits alongside the existing 3 engines (job scraper / startup finder / contact finder)
+ brain. Built as a few small `.mjs` files driven by Playwright, reusing the repo's
conventions (`PLAYWRIGHT_BROWSERS_PATH=0`, `data/` for state, gitignored secrets).

### ① Session / auth — log in once, never re-login programmatically
- One-time `node linkedin-login.mjs` launches a **headed** Chromium
  (`PLAYWRIGHT_BROWSERS_PATH=0`). The user logs in by hand (including 2FA).
- Persist Playwright `storageState` (the `li_at` auth cookie + friends) to a
  **gitignored** `data/li-session.json` inside the folder. Every run reuses it.
- **No password automation, no Voyager auth endpoint.** This is the #1 ban-avoidance lever.
- Add a `--check-session` mode that verifies the cookie is still valid and prompts a
  re-login if expired.

### ② Detect new connections
- Navigate to `linkedin.com/mynetwork/invite-connect/connections/` (sorted "Recently added").
- Scrape the top slice into `{ name, profileUrl, headline }`.
- Selectors will need maintenance — LinkedIn's DOM changes; isolate them in one module.

### ③ Ledger / dedupe (state)
- `data/dm-sent.tsv` (gitignored): `profileUrl · name · sentAt · template · status`.
- Guarantees **never double-DM**, and defines "new" without trusting any LinkedIn timestamp
  (new = present on the connections page but absent from the ledger).

### ④ Personalize (so no DM is ever hand-written)
- Extend the existing `ui/lib/outreach.js` `buildDM()` (already handles `{company}`/`{name}`)
  into a per-person template with tokens: `{firstName}`, `{company}`, `{headline}`.
- **Optional AI hook:** pass the person's headline to Claude / the `contacto` mode to
  generate **one** tailored opening line from the user's CV; the rest of the template
  body stays fixed. This is the "no manual tailoring" payoff while keeping it short.
- Keep DMs ultra-short (the existing `buildDM` rule: one hook + 1–2 proof points + one ask).

### ⑤ Send (human-like) — gated behind approval
- Open profile → **Message** → type with Playwright per-keystroke delay + randomized
  "think time" → send.
- **Safety governor:** daily cap, randomized 2–8 min gaps with jitter, optional run-window
  guard, hard skip if already in ledger, and a `--dry-run` that composes + screenshots but
  never clicks Send.

### ⑥ Human-in-the-loop (the chosen default)
- Engine does **not** auto-send. It produces a **draft queue**; the user approves/edits in a
  new UI tab ("DM Queue", added to the existing Next.js dashboard on port 4321), and only
  approved drafts send on the next pass.
- Mirrors career-ops's human-in-the-loop ethic and makes the human the rate limiter →
  drastically lower ban risk.

### Likely file layout (when built)
```
linkedin-login.mjs        # ① one-time session capture -> data/li-session.json (gitignored)
linkedin-nurture.mjs      # ②③④ detect new connections, dedupe, build drafts -> data/dm-queue.json
linkedin-send.mjs         # ⑤ send APPROVED drafts only, human-like, with governor
lib/li-dm.js              # shared: selectors, personalization (extends outreach.js), ledger I/O
ui/app/...                # ⑥ "DM Queue" tab to review/approve/edit drafts
data/li-session.json      # gitignored — auth cookies
data/dm-sent.tsv          # gitignored — ledger
data/dm-queue.json        # gitignored — pending drafts
```

---

## 4. Build options considered (research)

| Path | What it is | Tradeoffs | Verdict |
|---|---|---|---|
| **A. Custom in-repo** ✅ | A few `.mjs` files + reuse `outreach.js`; Playwright on the real saved session | Free, fully isolated (gitignored session, gone with the folder), reuses the stack, full control of safety knobs. You own the ban risk. | **CHOSEN** |
| B. Adopt open-source | [OpenOutreach](https://github.com/eracle/OpenOutreach) (Playwright + stealth + AI follow-ups) or [Linkedin-Outreach](https://github.com/Harddiikk/Linkedin-Outreach) | Less code to write, but a heavier separate stack to vendor in; less tailored to career-ops; same underlying ban risk. | Rejected — isolation + fit |
| C. Free-tier SaaS | [HeyReach](https://www.heyreach.io/blog/linkedin-messaging-automation-tools) / [Linked Helper](https://www.linkedhelper.com/) / [Expandi](https://expandi.io/blog/linkedin-message-automation/) / Waalaxy — native "if accepted → message" sequences | Cloud = safer detection profile + near-zero engineering, BUT paid beyond trials and your session/data leave your machine → **breaks the isolation rule**. | Rejected — privacy/isolation (revisit if ban-risk minimization ever outweighs isolation) |

Also evaluated and rejected outright:
- **Official LinkedIn API** — cannot send personal DMs (§2).
- **Unofficial Voyager API** ([`linkedin-api`](https://pypi.org/project/linkedin-api/),
  [inb](https://github.com/joshiayush/inb)) — username/password login → ban in 3–7 days.
- **Browser extensions** (LinkedRadar etc.) — highest restriction rate.

---

## 5. Safety design (baked in, not optional)
- Real saved session only — never automate login.
- Conservative caps (target 5–15 DMs/day), randomized human-like delays + jitter.
- Ledger-based dedupe — never message the same person twice.
- `--dry-run` and the HITL approval queue as default — nothing sends unreviewed.
- High relevance only (people connected to the job search), never generic blasting.
- Kill-switch / easy pause. Keep all selectors in one module for fast repair when the DOM shifts.
- **Honest risk note:** any LinkedIn automation carries account-restriction risk. The
  mitigations above make it low for this low-volume, high-relevance, human-reviewed use,
  but the risk is never zero. This is the user's own account and personal outreach.

---

## 6. Integration with career-ops
- **Reuses** `ui/lib/outreach.js` (DM generation), `find-contact.mjs` (who to reach), and the
  `contacto` mode (AI drafting) — Engine 4 is the "actually deliver it" layer on top.
- **Isolation:** session + ledger + queue all gitignored inside `data/`; Playwright runs with
  `PLAYWRIGHT_BROWSERS_PATH=0` (Chromium in `node_modules`). Delete the folder → everything gone.
- **UI:** new "DM Queue" tab in the existing Next.js dashboard (port 4321) for review/approve.
- Positions as **Engine 4** in the "3 engines + brain" model (see the dashboard Info tab).

---

## 7. Open questions for when we resume
- [ ] Where does the AI hook generation run — inline Claude Code call, or a small script that
      calls the API? (affects how `--ai-hook` is wired)
- [ ] One template, or a couple (founder vs recruiter vs eng-lead) keyed off headline?
- [ ] Approve-in-UI only, or also a terminal approve flow for headless use?
- [ ] Add a follow-up step (e.g., a 2nd message after N days if no reply), or keep it to the
      single first-touch DM?
- [ ] Session-expiry UX: how to surface "you need to re-login" cleanly.

---

## 8. Sources (research)
- [LinkedIn Automation Safety Guide 2026 — limits & detection (Dux-Soup)](https://www.dux-soup.com/blog/linkedin-automation-safety-guide-how-to-avoid-account-restrictions-in-2026)
- [LinkedIn automation safety guide 2026 (GetSales.io)](https://getsales.io/blog/linkedin-automation-safety-guide-2026/)
- [Is LinkedIn Automation Safe in 2026? ToS & scraping (ConnectSafely.ai)](https://connectsafely.ai/articles/is-linkedin-automation-safe-tos-scraping-guide-2026)
- [LinkedIn API: what's restricted, what devs use instead (Clura)](https://clura.ai/blog/linkedin-api)
- [`linkedin-api` (unofficial Voyager wrapper) — PyPI](https://pypi.org/project/linkedin-api/)
- [OpenOutreach — open-source Playwright LinkedIn automation](https://github.com/eracle/OpenOutreach)
- [Linkedin-Outreach — Playwright + AI templates](https://github.com/Harddiikk/Linkedin-Outreach)
- [LinkedIn message automation guide (Expandi)](https://expandi.io/blog/linkedin-message-automation/)
- [12 LinkedIn messaging automation tools 2026 (HeyReach)](https://www.heyreach.io/blog/linkedin-messaging-automation-tools)
- [Linked Helper — message-after-accept](https://www.linkedhelper.com/)
