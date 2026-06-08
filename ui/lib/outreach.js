// outreach.js — company-level cold DM + email, generated from Avneet's CV.
// Design rule: a recruiter must get the value in 3–5 seconds → short, bulleted,
// one hook + 3 proof points + one ask. Edit the PROOF lines to retune.

const NAME = 'Avneet Singh Sidhu';
const HOOK = 'AI Software Engineer — I ship production AI agents + full-stack, fast.';
const PROOF = [
  '25+ tool multi-agent assistant (Salesforce · Supabase · RAG · OpenAI/Gemini) in prod',
  'Deal Intelligence: agentic RAG → real-time CRM signals & alerts',
  'Perf: cut email sync 3× and page-to-page nav 50% (Next.js)',
];
const LINKS = 'github.com/Sidhuavneet · linkedin.com/in/avneet-singh-sidhu-61b190233';

// LinkedIn DM — ultra short. {company} (+ optional {name}).
export function buildDM(company, name) {
  const greet = name ? `Hi ${name.split(' ')[0]}` : `Hi ${company} team`;
  return [
    `${greet} — big fan of what ${company} is building.`,
    `${HOOK}`,
    `Why me:`,
    `• ${PROOF[0]}`,
    `• ${PROOF[2]}`,
    `Open to a quick 15-min chat?`,
  ].join('\n');
}

// Cold email — subject + scannable body.
export function buildEmail(company, role) {
  const subject = `${role ? role + ' — ' : ''}AI engineer who ships agents (${company})`;
  const body = [
    `Hi ${company} team,`,
    ``,
    `${HOOK} A few proof points:`,
    `• ${PROOF[0]}`,
    `• ${PROOF[1]}`,
    `• ${PROOF[2]}`,
    ``,
    `I'd love to contribute${role ? ` to your ${role} work` : ` at ${company}`}. 15 min this week?`,
    ``,
    `— ${NAME}`,
    LINKS,
  ].join('\n');
  return { subject, body };
}
