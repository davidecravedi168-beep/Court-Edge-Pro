import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';const y=fs.readFileSync(new URL('../.github/workflows/court-edge-autopilot.yml',import.meta.url),'utf8');
test('autopilot deploys Pages and protects secrets',()=>{assert.match(y,/actions\/deploy-pages@v4/);assert.match(y,/secrets\.BDL_API_KEY/);assert.match(y,/secrets\.ODDS_API_KEY/);assert.match(y,/Test suite pass 1/);assert.match(y,/Test suite pass 2/)});
test('scheduled and manual refresh',()=>{assert.match(y,/workflow_dispatch/);assert.match(y,/cron:/)});
