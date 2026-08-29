import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChallengerProjection,challengerMarketProb,buildPredictionSummary,updateForecastTracking,selectPredictionHero,PREDICTION_VERSION} from '../court-prediction-core.mjs';
import {modelFromGames,buildMarketsForEvent} from '../court-edge-v4.mjs';

test('prediction core creates independent sports forecast and shadow model',()=>{
  const projected={marginParts:[5,6,8],totalParts:[225,230,226],reliability:.85,marginSigma:17,totalSigma:20,mlProb:.64,projectedMargin:6,projectedTotal:228,sample:60};
  const challenger=buildChallengerProjection(projected,'NBA');
  assert.equal(challenger.version,`${PREDICTION_VERSION}-SHADOW`);
  assert(challenger.home_win_prob>0&&challenger.home_win_prob<1);
  const spread=challengerMarketProb({challenger,projected,marketKey:'spreads',line:-3.5,side:'A'});
  const total=challengerMarketProb({challenger,projected,marketKey:'totals',line:224.5,side:'A'});
  assert(spread>0&&spread<1);assert(total>0&&total<1);
});

test('market selector never turns a strong forecast into a wager without a price pass',()=>{
  const projected={marginParts:[6,5,7],totalParts:[225,228,226],reliability:.88,marginSigma:16,totalSigma:19,mlProb:.69,projectedMargin:7,projectedTotal:227,sample:70};
  const markets=[
    {market_id:'ml',market_key:'h2h',market_label:'Moneyline',selection:'Home',model_prob:.69,robust_prob:.64,best_odds:1.35,best_book:'A',price_to_bet:1.60,robust_ev:-.136,confidence:78,data_quality:90,validation_state:'PAPER',decision:'WAIT',gate_reasons:['ROBUST_EV']},
    {market_id:'sp',market_key:'spreads',market_label:'Spread',selection:'Home -4.5',model_prob:.62,robust_prob:.58,best_odds:1.95,best_book:'B',price_to_bet:1.80,robust_ev:.131,confidence:76,data_quality:88,validation_state:'TEST',decision:'TEST VALUE',gate_reasons:[]}
  ];
  const s=buildPredictionSummary({league:'NBA',ev:{home_team:'Home',away_team:'Away'},projected,markets,injuryStatus:'VERIFIED',leagueAvgTotal:225});
  assert.equal(s.winner_name,'Home');
  assert.equal(s.best_market.market_key,'spreads');
  assert.equal(s.best_market.selection,'Home -4.5');
  assert.equal(s.price_gate,'PLAYABLE_PAPER');
});

test('forecast lock settles independently from betting history and exposes calibration metrics',()=>{
  const now='2026-01-01T00:00:00Z';
  const radar=[{event_id:'e1',league:'NBA',home_team:'A',away_team:'B',start_at:'2026-01-01T10:00:00Z',hours_to_start:10,home_win_prob:.62,projected_winner:'A',projected_winner_prob:.62,projected_margin:5,projected_total:220,projected_home_score:112.5,projected_away_score:107.5,challenger_home_win_prob:.59,challenger_gap:.03,sports_confidence:74,data_quality:90,model_sample:60,reliability:.84,prediction_version:PREDICTION_VERSION}];
  let x=updateForecastTracking({radar,games:[],nowIso:now});
  assert.equal(x.locks.length,1);assert.equal(x.stats.closed,0);
  x=updateForecastTracking({previousLocks:x.locks,previousHistory:x.history,radar:[],games:[{date:'2026-01-01T10:00:00Z',home:'A',away:'B',hs:110,as:105}],nowIso:'2026-01-02T00:00:00Z'});
  assert.equal(x.history.length,1);assert.equal(x.stats.closed,1);assert.equal(x.stats.winner_accuracy,1);
  assert(Number.isFinite(x.stats.brier));assert(Number.isFinite(x.stats.log_loss));assert(Number.isFinite(x.stats.margin_mae));
});

test('hero prioritizes lock-window forecasts before distant radar',()=>{
  const h=selectPredictionHero([{event_id:'far',hours_to_start:120,projected_winner_prob:.80,sports_confidence:86},{event_id:'near',hours_to_start:8,projected_winner_prob:.63,sports_confidence:72}]);
  assert.equal(h.event_id,'near');
});

test('Court V4 integration exports prediction-first summary and market-specific challenger gaps',()=>{
  const games=[];
  for(let i=0;i<48;i++)games.push({date:`2026-0${(i%8)+1}-${String((i%27)+1).padStart(2,'0')}`,home:i%2?'A':'B',away:i%2?'B':'A',home_id:i%2?1:2,away_id:i%2?2:1,hs:i%2?118:108,as:i%2?106:110});
  const model=modelFromGames(games,'NBA');
  const ev={id:'evt-pf',home_team:'A',away_team:'B',commence_time:'2026-10-01T00:00:00Z',bookmakers:[0,1,2].map(i=>({title:`B${i}`,last_update:new Date().toISOString(),markets:[{key:'h2h',outcomes:[{name:'A',price:1.75+i*.01},{name:'B',price:2.15-i*.01}]},{key:'spreads',outcomes:[{name:'A',price:1.93,point:-4.5},{name:'B',price:1.93,point:4.5}]},{key:'totals',outcomes:[{name:'Over',price:1.93,point:224.5},{name:'Under',price:1.93,point:224.5}]}]}))};
  const z=buildMarketsForEvent({league:'NBA',ev,model,history:[],prevMarkets:new Map(),injuries:new Map(),injuryStatus:'VERIFIED'});
  assert(z.prediction);assert(z.challenger);assert.equal(z.prediction.prediction_version,PREDICTION_VERSION);
  assert(Number.isFinite(z.prediction.challenger_gap));
  for(const m of z.markets){assert(Number.isFinite(m.challenger_prob));assert(Number.isFinite(m.challenger_gap));}
});
