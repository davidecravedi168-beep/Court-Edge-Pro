import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const y=fs.readFileSync(new URL('../.github/workflows/court-edge-autopilot.yml',import.meta.url),'utf8');

test('autopilot deploys Pages and protects secrets',()=>{
  assert.match(y,/actions\/deploy-pages@v4/);
  assert.match(y,/secrets\.BDL_API_KEY/);
  assert.match(y,/secrets\.ODDS_API_KEY/);
  assert.match(y,/Test suite pass 1/);
  assert.match(y,/Test suite pass 2/);
  assert.match(y,/Deterministic contract/);
  assert.match(y,/Court Intel contract/);
});

test('scheduled and manual refresh use the Work budget cadence',()=>{
  assert.match(y,/workflow_dispatch/);
  assert.match(y,/17 \*\/6 \* \* \*/);
  assert.match(y,/43 20 \* \* \*/);
});

test('free-tier budget guard uses one region and explicit market profiles',()=>{
  assert.match(y,/ODDS_REGIONS: eu/);
  assert.match(y,/ODDS_MARKETS:/);
  assert.match(y,/h2h,spreads,totals/);
  assert.match(y,/scripts\/run-v4-budgeted\.mjs/);
  assert.match(y,/BDL_FREE_ONLY: 'true'/);
});

test('push and pull-request verification do not run the paid odds-board provider refresh',()=>{
  assert.match(y,/Build validated boards/);
  assert.match(y,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
  const buildStart=y.indexOf('- name: Build validated boards');
  const intelStart=y.indexOf('- name: Enrich NBA matchup intelligence');
  assert.ok(buildStart>=0&&intelStart>buildStart);
  const block=y.slice(buildStart,intelStart);
  assert.doesNotMatch(block,/github\.event_name == 'push'/);
  assert.doesNotMatch(block,/github\.event_name == 'pull_request'/);
});

test('BDL free-tier pacing is configured',()=>assert.match(y,/BDL_MIN_INTERVAL_MS: '13000'/));

test('production artifact contains every browser runtime dependency',()=>{
  assert.match(y,/mkdir -p _site\/assets _site\/data/);
  for(const file of ['index.html','betting-ux.js','match-details-v43.js','quant-math-v5.js','quant-desk-v5.js','court-quality-governance-v6.js','court-intel.js','court-simple-ui.js','sw.js']){
    assert.ok(y.includes(file),`missing staged runtime ${file}`);
  }
  assert.match(y,/Missing runtime dependency in Pages artifact/);
  assert.match(y,/nba-v4-board\.json/);
  assert.match(y,/euroleague-v4-board\.json/);
  assert.match(y,/automation-health\.json/);
  assert.match(y,/path: '_site'/);
});

test('board persistence cannot fail silently',()=>{
  assert.match(y,/git add data\/nba-v4-board\.json data\/euroleague-v4-board\.json data\/automation-health\.json/);
  assert.match(y,/nba-intel-cache\.json/);
  assert.match(y,/nba-player-form\.json/);
  assert.match(y,/euroleague-intel-cache\.json/);
  assert.match(y,/git push/);
  assert.doesNotMatch(y,/git push \|\| true/);
});

test('syntax and board contracts are release gates',()=>{
  assert.match(y,/Syntax verification/);
  for(const file of ['edge-core.mjs','court-edge-v4.mjs','betting-ux.js','match-details-v43.js','quant-math-v5.js','quant-desk-v5.js','court-quality-governance-v6.js','court-intel.js','court-simple-ui.js','sw.js']){
    assert.match(y,new RegExp(`node --check ${file.replaceAll('.','\\.')}`));
  }
  assert.match(y,/node --check scripts\/run-v4-budgeted\.mjs/);
  assert.match(y,/node --check scripts\/enrich-court-intel\.mjs/);
  assert.match(y,/node --check scripts\/enrich-euro-intel\.mjs/);
  assert.match(y,/node tests\/static-v4-check\.mjs/);
  assert.match(y,/node tests\/court-intel-static\.mjs/);
});

test('Edge Core receipt is generated from governed boards',()=>{
  assert.match(y,/COURT_BOARD_PROFILE: V7-TRUST-GOVERNED/);
  assert.match(y,/scripts\/write-automation-health\.mjs/);
});

test('pull requests verify but only main can deploy Pages',()=>{
  assert.match(y,/pull_request:/);
  assert.match(y,/push:\s*\n\s*branches: \[main\]/);
  assert.match(y,/deploy-pages:/);
  const mainOnly=/if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/g;
  assert.ok((y.match(mainOnly)||[]).length>=4,'all Pages build/deploy steps must be main-only and PR-safe');
});
