import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COURT_STAT_SCHEMA,FEATURE_NAMES,prepareBoards,buildCourtStatisticalLearning,
  syntheticBoards
} from '../scripts/court-statistical-learning-v9.mjs';

test('Court V9 uses time-ordered OOS statistical learning and remains shadow-only',()=>{
  const boards=syntheticBoards(320);
  const out=buildCourtStatisticalLearning(boards);
  assert.equal(out.schema,COURT_STAT_SCHEMA);
  assert(out.oos.n>=120);
  assert(Number.isFinite(out.oos.baseline.brier));
  assert(Number.isFinite(out.oos.candidate.logloss));
  assert.equal(out.governance.time_ordered_walk_forward,true);
  assert.equal(out.governance.shuffled_cross_validation,false);
  assert.equal(out.governance.auto_promote,false);
  assert.equal(out.governance.production_logic_changed,false);
  assert.notEqual(out.promotion.state,'PROMOTED');
  assert(out.model&&out.model.status==='SHADOW');
  assert.deepEqual(Object.keys(out.model.coefficients),FEATURE_NAMES);
  for(const fold of out.oos.folds)assert(Date.parse(fold.train_through)<Date.parse(fold.test_through));
});

test('Court V9 rejects post-start labels and fails closed on cold data',()=>{
  const boards=syntheticBoards(24);
  const bad={...boards[0].forecast_history[0],event_id:'leaked',prediction_locked_at:'2035-01-01T00:00:00Z'};
  boards[0].forecast_history.push(bad);
  const prepared=prepareBoards(boards);
  assert.equal(prepared.rejected.temporal_leakage,1);
  const out=buildCourtStatisticalLearning(boards);
  assert.equal(out.maturity,'COLD');
  assert.equal(out.oos.n,0);
  assert.equal(out.model,null);
  assert.equal(out.promotion.state,'HOLD');
});

test('Court V9 reports score error, paper ROI and only labelled CLV sources',()=>{
  const boards=syntheticBoards(120);
  boards[0].history=[
    {status:'SETTLED',market_key:'h2h',locked_stake_units:.25,profit_units:.2,locked_odds:1.8,closing_odds:1.7},
    {status:'SETTLED',market_key:'spreads',locked_stake_units:.25,profit_units:-.25,clv_proxy:.012},
    {status:'SETTLED',market_key:'totals',locked_stake_units:.25,profit_units:.2}
  ];
  const out=buildCourtStatisticalLearning(boards);
  assert(out.score_models.margin.n>0);
  assert(out.score_models.total.n>0);
  assert.equal(out.paper_markets.overall.n,3);
  assert.equal(out.paper_markets.overall.verified_clv_n,1);
  assert.equal(out.paper_markets.overall.recorded_proxy_clv_n,1);
  assert(Number.isFinite(out.paper_markets.overall.roi));
  assert(Number.isFinite(out.paper_markets.overall.mean_clv));
});

test('Court V9 artifact and automation contract stay fail-closed',()=>{
  const artifact=JSON.parse(fs.readFileSync(new URL('../data/court-statistical-learning-v9.json',import.meta.url),'utf8'));
  const workflow=fs.readFileSync(new URL('../.github/workflows/court-edge-autopilot.yml',import.meta.url),'utf8');
  assert.equal(artifact.schema,COURT_STAT_SCHEMA);
  assert.equal(artifact.governance.shadow_only,true);
  assert.equal(artifact.governance.auto_promote,false);
  assert.equal(artifact.promotion.state,'HOLD');
  for(const marker of ['node --check scripts/court-statistical-learning-v9.mjs','node scripts/court-statistical-learning-v9.mjs --self-test','node scripts/court-statistical-learning-v9.mjs --validate','data/court-statistical-learning-v9.json'])assert(workflow.includes(marker),marker);
});
