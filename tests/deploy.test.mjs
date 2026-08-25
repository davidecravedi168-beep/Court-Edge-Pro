import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const y=fs.readFileSync(new URL('../.github/workflows/court-edge-autopilot.yml',import.meta.url),'utf8');

test('autopilot deploys Pages and protects secrets',()=>{assert.match(y,/actions\/deploy-pages@v4/);assert.match(y,/secrets\.BDL_API_KEY/);assert.match(y,/secrets\.ODDS_API_KEY/);assert.match(y,/Test suite pass 1/);assert.match(y,/Test suite pass 2/)});
test('scheduled and manual refresh',()=>{assert.match(y,/workflow_dispatch/);assert.match(y,/17 \*\/4/)});
test('free-tier budget guard defaults to one region',()=>assert.match(y,/ODDS_REGIONS: eu/));
test('push deploys do not consume live provider quota',()=>{const hits=[...y.matchAll(/if: github\.event_name != 'push'/g)];assert.ok(hits.length>=2);assert.match(y,/Build live boards/)});
test('BDL free-tier pacing is configured',()=>assert.match(y,/BDL_MIN_INTERVAL_MS: '13000'/));
test('production artifact is staged instead of publishing the full repo',()=>{assert.match(y,/mkdir -p _site\/assets _site\/data/);assert.match(y,/path: '_site'/)});
test('board persistence cannot fail silently',()=>{assert.match(y,/git push/);assert.doesNotMatch(y,/git push \|\| true/)});
test('syntax verification is part of release gate',()=>{assert.match(y,/Syntax verification/);assert.match(y,/node --check live-board\.mjs/)});
