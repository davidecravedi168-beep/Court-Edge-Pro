import test from 'node:test';
import assert from 'node:assert/strict';
import {marketProfile,rewriteOddsUrl} from '../scripts/run-v4-budgeted.mjs';

test('budget profile defaults fail-closed to Moneyline',()=>assert.deepEqual(marketProfile(''),['h2h']));
test('budget profile accepts only supported markets and deduplicates',()=>assert.deepEqual(marketProfile('totals,h2h,evil,spreads,h2h'),['totals','h2h','spreads']));
test('odds URL receives the exact selected market profile',()=>{
  const raw='https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?regions=eu&markets=h2h&apiKey=redacted';
  const u=new URL(rewriteOddsUrl(raw,['h2h','spreads','totals']));
  assert.equal(u.searchParams.get('markets'),'h2h,spreads,totals');
  assert.equal(u.searchParams.get('regions'),'eu');
});
test('non-odds provider URL is untouched semantically',()=>{
  const raw='https://api.balldontlie.io/v1/games?per_page=100';
  const u=new URL(rewriteOddsUrl(raw,['totals']));
  assert.equal(u.hostname,'api.balldontlie.io');
  assert.equal(u.searchParams.get('markets'),null);
});
