// company-pipeline.mjs — the COMPANY-BASED pipeline, end to end.
// Step 1 (FIND): discover fresh startups → add to portals.yml tracked_companies.
//   - startup-finder (Launch HN: tiny, just-funded YC startups) — strict-aligned.
//   - discover-companies (broad Ashby/Greenhouse) is OFF by default (re-adds big
//     companies); enable with --broad if you want wider company discovery.
// Step 2 (SCAN): scan ALL tracked companies' ATS feeds → roles into pipeline.md.
//
// Usage:
//   node company-pipeline.mjs              find fresh startups, then scan
//   node company-pipeline.mjs --broad      also run broad company discovery
//   node company-pipeline.mjs --no-find    skip discovery, just scan
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const broad = args.includes('--broad');
const noFind = args.includes('--no-find');

function run(label, cmd, cmdArgs, env = {}) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) console.log(`(${label} exited ${r.status})`);
}

console.log('COMPANY PIPELINE — find companies → scan their roles');

if (!noFind) {
  // Step 1: find fresh startups (tiny, just-funded) and add to tracked_companies.
  run('Step 1a: startup-finder (Launch HN funded startups)', 'node', ['startup-finder.mjs', '--resolve', '--write', '--days', '180']);
  if (broad) {
    run('Step 1b: discover-companies (broad — may add bigger cos)', 'node', ['discover-companies.mjs', '--write']);
  }
  // Step 1c: enrich every company with LinkedIn + profile (so fetched companies
  // carry context: LinkedIn, blurb — shown next to roles in the UI).
  run('Step 1c: enrich companies (LinkedIn + profile)', 'node', ['enrich-companies.mjs']);
}

// Step 2: scan every tracked company's ATS feed for roles.
run('Step 2: scan tracked companies', 'node', ['scan.mjs'], { PLAYWRIGHT_BROWSERS_PATH: '0' });

console.log('\n✓ Company pipeline complete. New roles are in data/pipeline.md.');
console.log('  Next: clean-pipeline.mjs (strict filter) → evaluate.');
