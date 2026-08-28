import assert from 'node:assert/strict';
import {modelFromGames,buildMarketsForEvent,priceToBet,settleMarket} from '../court-edge-v4.mjs';

const teams=['A','B'];const games=[];
for(let i=0;i<80;i++)games.push({date:`2026-0${(i%8)+1}-${String((i%27)+1).padStart(2,'0')}`,home:i%2?'A':'B',away:i%2?'B':'A',home_id:i%2?1:2,away_id:i%2?2:1,hs:95+Math.floor(Math.random()*40),as:95+Math.floor(Math.random()*40)});
const model=modelFromGames(games,'NBA');
let rows=0,testPromotions=0,badPrice=0,badProb=0;
for(let i=0;i<25000;i++){
  const line=(Math.round((Math.random()*20-10)*2)/2),total=(Math.round((205+Math.random()*40)*2)/2),p1=1.55+Math.random()*.9,p2=1.55+Math.random()*.9;
  const books=[];for(let b=0;b<4;b++)books.push({title:`B${b}`,last_update:new Date().toISOString(),markets:[
    {key:'h2h',outcomes:[{name:'A',price:p1+(Math.random()-.5)*.08},{name:'B',price:p2+(Math.random()-.5)*.08}]},
    {key:'spreads',outcomes:[{name:'A',price:1.82+Math.random()*.18,point:line},{name:'B',price:1.82+Math.random()*.18,point:-line}]},
    {key:'totals',outcomes:[{name:'Over',price:1.82+Math.random()*.18,point:total},{name:'Under',price:1.82+Math.random()*.18,point:total}]}
  ]});
  const ev={id:`e${i}`,home_team:'A',away_team:'B',commence_time:'2026-10-01T00:00:00Z',bookmakers:books};
  const z=buildMarketsForEvent({league:'NBA',ev,model,history:[],prevMarkets:new Map(),injuries:new Map(),injuryStatus:'VERIFIED'}).markets;
  rows+=z.length;
  for(const m of z){
    if(m.market_key!=='h2h'&&m.validation_state==='TEST'&&m.decision==='PAPER BET')testPromotions++;
    if(!Number.isFinite(m.robust_prob)||m.robust_prob<=0||m.robust_prob>=1)badProb++;
    if(!Number.isFinite(m.price_to_bet)||m.price_to_bet<=1)badPrice++;
  }
}
assert.equal(testPromotions,0);assert.equal(badPrice,0);assert.equal(badProb,0);
for(let i=0;i<10000;i++){
 const line=Math.round((Math.random()*20-10)*2)/2,hs=80+Math.floor(Math.random()*70),as=80+Math.floor(Math.random()*70);
 const home={market_key:'spreads',selection:`A ${line>=0?'+':''}${line}`,line,selection_line:line,home_team:'A',best_odds:1.91,stake_units:.5};
 const away={market_key:'spreads',selection:`B ${-line>=0?'+':''}${-line}`,line,selection_line:-line,home_team:'A',best_odds:1.91,stake_units:.5};
 const sh=settleMarket(home,{hs,as}),sa=settleMarket(away,{hs,as});
 if(!sh.push&&!sa.push)assert.notEqual(sh.outcome,sa.outcome);
}
console.log(JSON.stringify({ok:true,events:25000,market_rows:rows,settlement_pairs:10000,test_promotions:testPromotions,bad_price:badPrice,bad_prob:badProb}));
