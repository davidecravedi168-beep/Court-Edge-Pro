import assert from 'node:assert/strict';
import {normalCdf,syntheticHold,priceToBet,modelFromGames,projectGame,parseMarketGroups,buildMarketsForEvent,buildInjurySummary,settleMarket,liveProjection,VERSION} from '../court-edge-v4.mjs';

assert.equal(VERSION,'COURT-EDGE-4.0-BETTING-TERMINAL');
assert(Math.abs(normalCdf(0)-.5)<1e-6);
assert(normalCdf(2)>0.97&&normalCdf(-2)<0.03);
assert(Math.abs(syntheticHold(2.05,2.05)+.02439)<.001);
assert(priceToBet(.60)>1.69&&priceToBet(.60)<1.71);

const games=[];
for(let i=0;i<40;i++){
  games.push({date:`2026-0${(i%8)+1}-${String((i%27)+1).padStart(2,'0')}`,home:i%2?'Boston Celtics':'Los Angeles Lakers',away:i%2?'Los Angeles Lakers':'Boston Celtics',home_id:i%2?2:14,away_id:i%2?14:2,hs:i%2?118:113,as:i%2?108:111});
}
const model=modelFromGames(games,'NBA');
const proj=projectGame(model,'Boston Celtics','Los Angeles Lakers','2026-10-01T00:00:00Z',{home:0,away:0});
assert(Number.isFinite(proj.projectedMargin));
assert(Number.isFinite(proj.projectedTotal));
assert(proj.sample>=30);

const ev={id:'evt1',home_team:'Boston Celtics',away_team:'Los Angeles Lakers',commence_time:'2026-10-01T00:00:00Z',bookmakers:[
  {title:'Book A',last_update:new Date().toISOString(),markets:[
    {key:'h2h',outcomes:[{name:'Boston Celtics',price:1.72},{name:'Los Angeles Lakers',price:2.20}]},
    {key:'spreads',outcomes:[{name:'Boston Celtics',price:1.91,point:-4.5},{name:'Los Angeles Lakers',price:1.91,point:4.5}]},
    {key:'totals',outcomes:[{name:'Over',price:1.93,point:224.5},{name:'Under',price:1.89,point:224.5}]}
  ]},
  {title:'Book B',last_update:new Date().toISOString(),markets:[
    {key:'h2h',outcomes:[{name:'Boston Celtics',price:1.75},{name:'Los Angeles Lakers',price:2.15}]},
    {key:'spreads',outcomes:[{name:'Boston Celtics',price:1.95,point:-4.5},{name:'Los Angeles Lakers',price:1.88,point:4.5}]},
    {key:'totals',outcomes:[{name:'Over',price:1.90,point:224.5},{name:'Under',price:1.94,point:224.5}]}
  ]},
  {title:'Book C',last_update:new Date().toISOString(),markets:[
    {key:'h2h',outcomes:[{name:'Boston Celtics',price:1.73},{name:'Los Angeles Lakers',price:2.18}]},
    {key:'spreads',outcomes:[{name:'Boston Celtics',price:1.92,point:-4.5},{name:'Los Angeles Lakers',price:1.92,point:4.5}]},
    {key:'totals',outcomes:[{name:'Over',price:1.92,point:224.5},{name:'Under',price:1.92,point:224.5}]}
  ]}
]};
const groups=parseMarketGroups(ev);
assert(groups.some(x=>x.key==='h2h'));
assert(groups.some(x=>x.key==='spreads'&&x.line===-4.5));
assert(groups.some(x=>x.key==='totals'&&x.line===224.5));

const injuries=buildInjurySummary([{player:{team_id:14,first_name:'A',last_name:'Star'},status:'Out'},{player:{team_id:14,first_name:'B',last_name:'Guard'},status:'Questionable'}]);
assert(injuries.get(14).risk>1);
const built=buildMarketsForEvent({league:'NBA',ev,model,history:[],prevMarkets:new Map(),injuries,injuryStatus:'VERIFIED'});
assert.equal(built.markets.length,6);
for(const m of built.markets){
  assert(Number.isFinite(m.best_odds)&&m.best_odds>1);
  assert(Number.isFinite(m.market_prob));
  assert(Number.isFinite(m.robust_prob));
  assert(Number.isFinite(m.price_to_bet));
  assert(m.decision==='WAIT'||m.decision==='PAPER BET'||m.decision==='TEST VALUE');
  if(m.market_key!=='h2h'&&m.decision!=='WAIT')assert.equal(m.decision,'TEST VALUE');
}

const spread={market_key:'spreads',selection:'Boston Celtics -4.5',line:-4.5,home_team:'Boston Celtics',best_odds:1.91,stake_units:.5};
let s=settleMarket(spread,{hs:110,as:100});assert.equal(s.outcome,true);assert(s.profit_units>0);
s=settleMarket(spread,{hs:104,as:100});assert.equal(s.outcome,false);
const spreadAway={market_key:'spreads',selection:'Los Angeles Lakers +4.5',line:-4.5,selection_line:4.5,home_team:'Boston Celtics',best_odds:1.91,stake_units:.5};
s=settleMarket(spreadAway,{hs:104,as:100});assert.equal(s.outcome,true);
const total={market_key:'totals',selection:'Over 224.5',line:224.5,home_team:'Boston Celtics',best_odds:1.91,stake_units:.5};
s=settleMarket(total,{hs:120,as:110});assert.equal(s.outcome,true);

const lp=liveProjection({projected_margin:5,projected_total:226,margin_sigma:12,total_sigma:17},{home_team_score:60,visitor_team_score:55,period:3,time:'12:00',status:'3rd Qtr',status_state:'in_progress'});
assert(lp.home_win_prob>.5);
assert(lp.final_total_mean>115);

// fuzz: probabilities/thresholds must stay finite and bounded
for(let i=0;i<10000;i++){
  const p=.05+Math.random()*.9,odds=1.2+Math.random()*4;
  const ptb=priceToBet(p);assert(Number.isFinite(ptb)&&ptb>1);
  const h=syntheticHold(odds,1.2+Math.random()*4);assert(Number.isFinite(h));
}
console.log(JSON.stringify({ok:true,tests:10000+18,version:VERSION,markets:built.markets.map(x=>({k:x.market_key,d:x.decision,ev:x.robust_ev}))},null,2));
