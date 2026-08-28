import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const engine=fs.readFileSync('court-edge-v4.mjs','utf8');

for(const token of [
  'Court Edge Pro 4 · Betting Terminal',
  'id="bets"','id="markets"','id="live"','id="track"','id="bank"','id="model"',
  'BEST BETS','MARKET BOARD','LIVE EDGE','TRACK RECORD','BANKROLL',
  'PRICE GUARD','CUSHION','GRADE','function grade(','function liveBest(','RESEARCH EDGE'
]) assert.match(html,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

for(const token of [
  "MARKET_KEYS=['h2h','spreads','totals']",
  'strict_no_fabrication',
  'price_to_bet',
  'TEST VALUE',
  'synthetic_hold',
  'projected_margin',
  'projected_total'
]) assert(html.includes(token)||engine.includes(token),`missing V4 contract token: ${token}`);

const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).join('\n');
assert(inline.length>100,'inline app script missing');
assert.doesNotThrow(()=>new Function(inline),'frontend JavaScript must compile');

assert(!html.includes('ODDS_API_KEY'));
assert(!html.includes('BDL_API_KEY'));
assert(!html.includes('apiKey='));

for(const f of ['data/nba-v4-board.json','data/euroleague-v4-board.json']){
  const b=JSON.parse(fs.readFileSync(f,'utf8'));
  assert(b.meta&&b.integrity,`${f}: missing meta/integrity`);
  assert.equal(b.integrity.strict_no_fabrication,true,`${f}: fail-closed disabled`);
  for(const k of ['markets','best_bets','history']) assert(Array.isArray(b[k]),`${f}: ${k} must be array`);
}

console.log(JSON.stringify({ok:true,check:'Court Edge Pro V4 static + bettor UI contract'}));
