import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const s=fs.readFileSync(new URL('../live-board.mjs',import.meta.url),'utf8');
test('secrets stay server-side',()=>{assert.match(s,/process\.env\.BDL_API_KEY/);assert.match(s,/process\.env\.ODDS_API_KEY/);assert.doesNotMatch(s,/apiKey=['"][A-Za-z0-9_-]{16,}/)});
test('NBA and EuroLeague providers present',()=>{assert.match(s,/basketball_nba/);assert.match(s,/basketball_euroleague/);assert.match(s,/api-live\.euroleague\.net/)});
test('fail closed and no fabrication contract',()=>{assert.match(s,/PAPER_ONLY/);assert.match(s,/strict_no_fabrication:true/);assert.match(s,/NO_FEED/)});
test('provider fetch has timeout and retries',()=>{assert.match(s,/AbortController/);assert.match(s,/retries=2/)});
