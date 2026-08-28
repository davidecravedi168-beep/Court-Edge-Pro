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
  assert.match(y,/V4 deterministic contract/);
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
});

test('push and pull-request verification do not consume live provider quota',()=>{
  assert.match(y,/Build V4 boards/);
  assert.match(y,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
  const buildStart=y.indexOf('- name: Build V4 boards');
  const testsStart=y.indexOf('- name: Test suite pass 1');
  assert.ok(buildStart>=0&&testsStart>buildStart);
  const block=y.slice(buildStart,testsStart);
  assert.doesNotMatch(block,/github\.event_name == 'push'/);
  assert.doesNotMatch(block,/github\.event_name == 'pull_request'/);
});

test('BDL free-tier pacing is configured',()=>assert.match(y,/BDL_MIN_INTERVAL_MS: '13000'/));

test('production artifact is staged instead of publishing the full repo',()=>{
  assert.match(y,/mkdir -p _site\/assets _site\/data/);
  assert.match(y,/cp index\.html betting-ux\.js legal\.html/);
  assert.match(y,/nba-v4-board\.json/);
  assert.match(y,/euroleague-v4-board\.json/);
  assert.match(y,/automation-health\.json/);
  assert.match(y,/path: '_site'/);
});

test('board persistence cannot fail silently',()=>{
  assert.match(y,/git add data\/nba-v4-board\.json data\/euroleague-v4-board\.json data\/automation-health\.json/);
  assert.match(y,/git push/);
  assert.doesNotMatch(y,/git push \|\| true/);
});

test('syntax and V4 contracts are release gates',()=>{
  assert.match(y,/Syntax verification/);
  assert.match(y,/node --check edge-core\.mjs/);
  assert.match(y,/node --check court-edge-v4\.mjs/);
  assert.match(y,/node --check betting-ux\.js/);
  assert.match(y,/node --check scripts\/run-v4-budgeted\.mjs/);
  assert.match(y,/node tests\/static-v4-check\.mjs/);
});

test('Edge Core receipt is generated from V4 boards',()=>{
  assert.match(y,/COURT_BOARD_PROFILE: V4/);
  assert.match(y,/scripts\/write-automation-health\.mjs/);
});

test('release-candidate and pull requests verify but only main can deploy Pages',()=>{
  assert.match(y,/pull_request:/);
  assert.match(y,/branches: \[main, court-edge-4-release-candidate\]/);
  assert.match(y,/deploy-pages:/);
  const mainOnly=/if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/g;
  assert.ok((y.match(mainOnly)||[]).length>=4,'all Pages build/deploy steps must be main-only and PR-safe');
});
