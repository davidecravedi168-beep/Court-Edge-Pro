import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const y=fs.readFileSync(new URL('../.github/workflows/court-edge-autopilot.yml',import.meta.url),'utf8');

test('autopilot deploys Pages and protects secrets',()=>{
  assert.match(y,/actions\/deploy-pages@v4/);
  assert.match(y,/secrets\.BDL_API_KEY/);
  assert.match(y,/secrets\.ODDS_API_KEY/);
  assert.match(y,/Legacy regression suite/);
  assert.match(y,/V4 deterministic tests/);
  assert.match(y,/V4 stress tests/);
});

test('scheduled and manual refresh',()=>{assert.match(y,/workflow_dispatch/);assert.match(y,/17 \*\/4/)});
test('free-tier budget guard defaults to one region',()=>assert.match(y,/ODDS_REGIONS: eu/));

test('push and pull-request verification do not consume live provider quota',()=>{
  assert.match(y,/Build V4 live boards/);
  assert.match(y,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
  const buildStart=y.indexOf('- name: Build V4 live boards');
  const validateStart=y.indexOf('- name: Validate generated V4 boards');
  const block=y.slice(buildStart,validateStart);
  assert.doesNotMatch(block,/github\.event_name == 'push'/);
  assert.doesNotMatch(block,/github\.event_name == 'pull_request'/);
});

test('BDL free-tier pacing is configured',()=>assert.match(y,/BDL_MIN_INTERVAL_MS: '13000'/));
test('production artifact is staged instead of publishing the full repo',()=>{assert.match(y,/mkdir -p _site\/assets _site\/data/);assert.match(y,/path: '_site'/)});
test('board persistence cannot fail silently',()=>{assert.match(y,/git push/);assert.doesNotMatch(y,/git push \|\| true/)});
test('syntax verification is part of release gate',()=>{assert.match(y,/V4 syntax verification/);assert.match(y,/node --check live-board\.mjs/);assert.match(y,/node --check court-edge-v4\.mjs/)});
test('pull requests verify but never deploy Pages',()=>{assert.match(y,/deploy-pages:/);assert.match(y,/if: github\.event_name != 'pull_request'/)});
