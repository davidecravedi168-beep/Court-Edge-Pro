import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeEuroleagueGamesPayload} from '../scripts/run-v4-budgeted.mjs';

const now=Date.parse('2026-08-31T00:00:00Z');
const game=(date,home,away)=>({date,local:{club:{name:'Home'},score:home},road:{club:{name:'Away'},score:away}});

test('keeps plausible completed EuroLeague games',()=>{
  const p={data:[game('2026-04-17T18:00:00Z',85,95)]};
  const x=sanitizeEuroleagueGamesPayload(p,now);
  assert.equal(x.data.length,1);
  assert.equal(x._court_integrity.accepted_historical_games,1);
});

test('rejects future scheduled placeholder games',()=>{
  const p={data:[game('2027-04-17T18:00:00Z',0,0),game('2026-09-24T18:00:00Z',0,0)]};
  const x=sanitizeEuroleagueGamesPayload(p,now);
  assert.equal(x.data.length,0);
  assert.equal(x._court_integrity.rejected_placeholder_or_future,2);
});

test('rejects implausible partial/placeholder scores even in past',()=>{
  const p={games:[game('2026-04-17T18:00:00Z',18,19),game('2026-04-18T18:00:00Z',91,88)]};
  const x=sanitizeEuroleagueGamesPayload(p,now);
  assert.equal(x.games.length,1);
  assert.equal(x.games[0].local.score,91);
});