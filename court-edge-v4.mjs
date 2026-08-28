import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyzeMarket, clamp, devigTwoWay, DEFAULT_GATES} from './quant-engine.mjs';

export const VERSION='COURT-EDGE-4.0-BETTING-TERMINAL';
const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const ODDS_KEY=process.env.ODDS_API_KEY||'';
const BDL_KEY=process.env.BDL_API_KEY||'';
const ODDS_REGIONS=process.env.ODDS_REGIONS||'eu';
const COMMERCIAL_MODE=/^(1|true|yes)$/i.test(process.env.COMMERCIAL_MODE||'');
const EUROLEAGUE_COMMERCIAL_LICENSED=/^(1|true|yes)$/i.test(process.env.EUROLEAGUE_COMMERCIAL_LICENSED||'');
const BDL_INTERVAL_RAW=Number(process.env.BDL_MIN_INTERVAL_MS||13000);
const BDL_MIN_INTERVAL_MS=Number.isFinite(BDL_INTERVAL_RAW)?Math.max(12000,BDL_INTERVAL_RAW):13000;
const NOW=new Date();
const ISO=NOW.toISOString();
const LOCK_MIN_HOURS=.75;
const LOCK_MAX_HOURS=36;
const RADAR_MAX_DAYS=90;
const MARKET_HISTORY_MAX=18;
const MARKET_KEYS=['h2h','spreads','totals'];
const MIN_TEST_SAMPLE=50;

export const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{const z=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!z.length)return null;const m=Math.floor(z.length/2);return z.length%2?z[m]:(z[m-1]+z[m])/2};
const sd=a=>{const z=a.filter(Number.isFinite);if(z.length<2)return null;const m=avg(z);return Math.sqrt(avg(z.map(x=>(x-m)**2)))};
const weightedRecent=a=>{if(!a.length)return 0;let s=0,w=0;a.forEach((v,i)=>{const q=Math.exp((i-a.length+1)/4);s+=v*q;w+=q});return w?s/w:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const round=(x,d=3)=>Number.isFinite(x)?Number(x.toFixed(d)):null;

export function normalCdf(x){
  const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
  const sign=x<0?-1:1,z=Math.abs(x)/Math.sqrt(2),t=1/(1+p*z);
  const erf=sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z));
  return .5*(1+erf);
}
export const normalProbGreater=(threshold,mean,sigma)=>sigma>0?clamp(1-normalCdf((threshold-mean)/sigma),.001,.999):(mean>threshold?.999:.001);
export function syntheticHold(oddsA,oddsB){return oddsA>1&&oddsB>1?1/oddsA+1/oddsB-1:null}
export function priceToBet(prob,minRobustEV=DEFAULT_GATES.minRobustEV){return prob>0?round((1+minRobustEV)/prob,2):null}

function retryAfterMs(r){
  const raw=r.headers.get('retry-after');if(!raw)return 2000;
  const seconds=Number(raw);if(Number.isFinite(seconds))return Math.max(1000,seconds*1000);
  const date=Date.parse(raw);return Number.isFinite(date)?Math.max(1000,date-Date.now()):2000;
}
async function fetchJson(url,{headers={},retries=2,timeoutMs=16000}={}){
  let last;
  for(let i=0;i<=retries;i++){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers,signal:c.signal});
      if(r.status===429){const wait=Math.min(65000,retryAfterMs(r));last=new Error(`HTTP 429 retry-after=${wait}`);if(i<retries){await sleep(wait);continue}throw last}
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(e){last=e;if(i<retries)await sleep(Math.min(8000,900*(i+1)))}finally{clearTimeout(t)}
  }
  throw last;
}
let bdlQueue=Promise.resolve(),bdlNextAt=0;
function bdlFetch(url,options={}){
  const run=bdlQueue.then(async()=>{const wait=Math.max(0,bdlNextAt-Date.now());if(wait)await sleep(wait);bdlNextAt=Date.now()+BDL_MIN_INTERVAL_MS;return fetchJson(url,{...options,headers:{...(options.headers||{}),Authorization:BDL_KEY}})});
  bdlQueue=run.catch(()=>{});return run;
}

function teamState(name,id=null){return {name,id,elo:1500,games:0,margins:[],totals:[],pf:[],pa:[],recentMargins:[],recentTotals:[],last:null}}
export function modelFromGames(games,league){
  const teams=new Map(),homeAdj=league==='NBA'?54:45;
  const get=(n,id=null)=>{const k=norm(n);if(!teams.has(k))teams.set(k,teamState(n,id));const x=teams.get(k);if(id!=null)x.id=id;return x};
  const totalsAll=[],marginsAll=[];
  for(const g of [...games].sort((a,b)=>new Date(a.date)-new Date(b.date))){
    if(!g.home||!g.away||!Number.isFinite(g.hs)||!Number.isFinite(g.as))continue;
    const h=get(g.home,g.home_id),a=get(g.away,g.away_id),margin=g.hs-g.as,total=g.hs+g.as;
    const ex=1/(1+10**(-((h.elo+homeAdj)-a.elo)/400)),act=margin>0?1:0,k=18,delta=k*(act-ex);h.elo+=delta;a.elo-=delta;
    for(const [t,pf,pa,m] of [[h,g.hs,g.as,margin],[a,g.as,g.hs,-margin]]){
      t.games++;t.margins.push(m);t.totals.push(total);t.pf.push(pf);t.pa.push(pa);t.recentMargins.push(m);t.recentTotals.push(total);t.last=g.date;
      for(const arr of [t.margins,t.totals,t.pf,t.pa])if(arr.length>48)arr.shift();
      if(t.recentMargins.length>12)t.recentMargins.shift();if(t.recentTotals.length>12)t.recentTotals.shift();
    }
    totalsAll.push(total);marginsAll.push(margin);if(totalsAll.length>700)totalsAll.shift();if(marginsAll.length>700)marginsAll.shift();
  }
  return {teams,homeAdj,leagueAvgTotal:median(totalsAll)|| (league==='NBA'?225:162),leagueMarginSd:sd(marginsAll)|| (league==='NBA'?12.5:10.5),leagueTotalSd:sd(totalsAll)|| (league==='NBA'?17.5:14.5)};
}

function restDays(team,startAt){return team?.last?Math.max(0,(new Date(startAt)-new Date(team.last))/86400000):4}
function safeMean(a,fallback){const z=a.filter(Number.isFinite);return z.length?avg(z):fallback}
export function projectGame(model,home,away,startAt,injuryRisk={home:0,away:0}){
  const h=model.teams.get(norm(home))||teamState(home),a=model.teams.get(norm(away))||teamState(away);
  const sample=Math.min(h.games,a.games),reliability=sample/(sample+12),leagueTotal=model.leagueAvgTotal;
  const hPF=safeMean(h.pf,leagueTotal/2),hPA=safeMean(h.pa,leagueTotal/2),aPF=safeMean(a.pf,leagueTotal/2),aPA=safeMean(a.pa,leagueTotal/2);
  const recentH=weightedRecent(h.recentMargins),recentA=weightedRecent(a.recentMargins),recentTH=weightedRecent(h.recentTotals)||leagueTotal,recentTA=weightedRecent(a.recentTotals)||leagueTotal;
  const eloP=1/(1+10**(-((h.elo+model.homeAdj)-a.elo)/400));
  const eloMargin=(eloP-.5)*(model.leagueMarginSd*3.6);
  const offenseDefenseMargin=((hPF+aPA)/2-(aPF+hPA)/2)+2.1;
  const formMargin=(recentH-recentA)/2+1.6;
  const hr=restDays(h,startAt),ar=restDays(a,startAt);let restAdj=0;if(hr<1.7)restAdj-=1.1;if(ar<1.7)restAdj+=1.1;if(hr>3.5&&ar<2.1)restAdj+=.5;if(ar>3.5&&hr<2.1)restAdj-=.5;
  const injuryAdj=clamp(injuryRisk.away-injuryRisk.home,-3,3)*1.15;
  const marginParts=[eloMargin,offenseDefenseMargin,formMargin].map(x=>x+restAdj+injuryAdj);
  const projectedMargin=(marginParts[0]*1.25+marginParts[1]+marginParts[2])/(3.25)*reliability;
  const offenseDefenseTotal=(hPF+aPF+hPA+aPA)/2;
  const recentTotal=(recentTH+recentTA)/2;
  const paceRegression=leagueTotal+((recentTotal-leagueTotal)*.45);
  const totalParts=[offenseDefenseTotal,recentTotal,paceRegression];
  const projectedTotal=(totalParts[0]*1.05+totalParts[1]+totalParts[2]*1.15)/(3.2);
  const marginSigma=clamp(model.leagueMarginSd+(1-reliability)*4.5+Math.abs(injuryRisk.home-injuryRisk.away)*.6,7,22);
  const totalSigma=clamp(model.leagueTotalSd+(1-reliability)*5.5+(injuryRisk.home+injuryRisk.away)*.4,10,28);
  const mlParts=marginParts.map(m=>normalCdf(m/Math.max(7,marginSigma))).map(p=>.5+(p-.5)*reliability);
  const mlProb=clamp((mlParts[0]*1.25+mlParts[1]+mlParts[2])/(3.25),.03,.97);
  return {home,away,sample,reliability,projectedMargin,projectedTotal,marginSigma,totalSigma,marginParts,totalParts,mlParts,mlProb,rest:{home:hr,away:ar},injuryRisk};
}

function bookmakerRows(ev,key){
  const out=[];
  for(const b of ev.bookmakers||[]){
    const m=(b.markets||[]).find(x=>x.key===key);if(!m)continue;
    const updated=b.last_update||m.last_update||null,ageMin=updated?(Date.now()-new Date(updated).getTime())/60000:999;
    if(key==='h2h'){
      const ho=m.outcomes?.find(x=>norm(x.name)===norm(ev.home_team)),ao=m.outcomes?.find(x=>norm(x.name)===norm(ev.away_team));
      if(ho?.price>1&&ao?.price>1){const d=devigTwoWay(+ho.price,+ao.price);out.push({book:b.title,key,point:null,sideA:ev.home_team,sideB:ev.away_team,oddsA:+ho.price,oddsB:+ao.price,fairA:d.a,fairB:d.b,overround:d.overround,updated,ageMin})}
    }else if(key==='spreads'){
      const ho=m.outcomes?.find(x=>norm(x.name)===norm(ev.home_team)),ao=m.outcomes?.find(x=>norm(x.name)===norm(ev.away_team));
      if(ho?.price>1&&ao?.price>1&&Number.isFinite(+ho.point)&&Number.isFinite(+ao.point)){
        const d=devigTwoWay(+ho.price,+ao.price);out.push({book:b.title,key,point:+ho.point,oppPoint:+ao.point,sideA:`${ev.home_team} ${+ho.point>=0?'+':''}${+ho.point}`,sideB:`${ev.away_team} ${+ao.point>=0?'+':''}${+ao.point}`,oddsA:+ho.price,oddsB:+ao.price,fairA:d.a,fairB:d.b,overround:d.overround,updated,ageMin})
      }
    }else if(key==='totals'){
      const over=m.outcomes?.find(x=>/^over$/i.test(x.name)),under=m.outcomes?.find(x=>/^under$/i.test(x.name));
      if(over?.price>1&&under?.price>1&&Number.isFinite(+over.point)){
        const d=devigTwoWay(+over.price,+under.price);out.push({book:b.title,key,point:+over.point,sideA:`Over ${+over.point}`,sideB:`Under ${+under.point}`,oddsA:+over.price,oddsB:+under.price,fairA:d.a,fairB:d.b,overround:d.overround,updated,ageMin})
      }
    }
  }
  return out;
}

function groupByLine(rows,key){
  if(key==='h2h')return rows.length?[{line:null,rows}]:[];
  const m=new Map();for(const r of rows){const k=(Math.round(r.point*2)/2).toFixed(1);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}
  return [...m.entries()].map(([line,z])=>({line:+line,rows:z}));
}
export function parseMarketGroups(ev){
  return MARKET_KEYS.flatMap(key=>groupByLine(bookmakerRows(ev,key),key).map(g=>({key,line:g.line,rows:g.rows})));
}

function modelProbPartsFor(projected,key,line,side='A'){
  if(key==='h2h')return side==='A'?projected.mlParts:projected.mlParts.map(p=>1-p);
  if(key==='spreads'){
    const parts=projected.marginParts.map(m=>normalCdf((m+line)/projected.marginSigma));return side==='A'?parts:parts.map(p=>1-p);
  }
  if(key==='totals'){
    const parts=projected.totalParts.map(t=>normalCdf((t-line)/projected.totalSigma));return side==='A'?parts:parts.map(p=>1-p);
  }
  return [];
}
function marketLabel(key){return key==='h2h'?'Moneyline':key==='spreads'?'Spread':'Total'}
function validationState(key,history=[]){
  const settled=history.filter(x=>x.market_key===key&&x.status==='SETTLED');
  return {sample:settled.length,state:key==='h2h'?'PAPER':settled.length>=MIN_TEST_SAMPLE?'PAPER':'TEST'};
}
function injuryPenalty(r){return clamp((r.home+r.away)*.008,0,.045)}
function buildCandidate({league,ev,projected,group,history,prevMarkets,injuryStatus}){
  const {key,line,rows}=group;if(!rows.length)return [];
  const use=rows.filter(r=>r.ageMin<=90);const z=use.length?use:rows;
  const bestA=Math.max(...z.map(r=>r.oddsA)),bestB=Math.max(...z.map(r=>r.oddsB));
  const rowA=z.find(r=>r.oddsA===bestA),rowB=z.find(r=>r.oddsB===bestB),marketProbA=median(z.map(r=>r.fairA)),marketProbB=1-marketProbA;
  const overround=median(z.map(r=>r.overround)),ageMin=median(z.map(r=>r.ageMin))??999,disp=sd(z.map(r=>r.fairA))||0,stability=clamp(96-disp*480-Math.min(35,ageMin/2.5),20,98);
  const dq=clamp(48+Math.min(32,projected.sample*1.3)+Math.min(9,z.length*1.4)+(injuryStatus==='VERIFIED'?8:3),42,97);
  const validation=validationState(key,history),out=[];
  for(const side of ['A','B']){
    const probParts=modelProbPartsFor(projected,key,line,side),odds=side==='A'?bestA:bestB,other=side==='A'?bestB:bestA,marketProb=side==='A'?marketProbA:marketProbB;
    const rawMean=avg(probParts),dis=(Math.max(...probParts)-Math.min(...probParts)),unc=clamp((key==='h2h'?projected.marginSigma/150:key==='spreads'?projected.marginSigma/135:projected.totalSigma/165)+(1-projected.reliability)*.035,.025,.16);
    const a=analyzeMarket({engineProbs:probParts,engineWeights:[1.25,1,1],oddsPick:odds,oddsOther:other,marketProb,overround,uncertainty:unc,disagreement:dis,challengerGap:null,dataQuality:dq,marketBooks:z.length,oddsAgeMin:ageMin,availabilityStatus:injuryStatus,requireAvailability:false,availabilityPenalty:injuryPenalty(projected.injuryRisk),marketStability:stability,sampleSize:projected.sample});
    const sideName=side==='A'?(rowA?.sideA||ev.home_team):(rowB?.sideB||ev.away_team),book=side==='A'?rowA?.book:rowB?.book,selectionLine=key==='spreads'?(side==='A'?line:-line):line;
    const keyId=`${ev.id||norm(ev.home_team+'-'+ev.away_team)}|${key}|${line??'ML'}|${side}`;
    const prev=prevMarkets?.get(keyId),decision=a.decision==='PAPER BET'?(validation.state==='TEST'?'TEST VALUE':'PAPER BET'):'WAIT';
    out.push({market_id:keyId,event_id:String(ev.id||keyId.split('|')[0]),league,market_key:key,market_label:marketLabel(key),line,selection_line:selectionLine,side,selection:sideName,best_odds:odds,best_book:book||'—',other_best_odds:other,market_prob:marketProb,model_prob:a.modelProb,robust_prob:a.conservativeProb,edge:a.edge,raw_ev:a.rawEV,robust_ev:a.robustEV,confidence:a.confidence,data_quality:dq,market_books:z.length,odds_age_min:ageMin,market_stability:stability,synthetic_hold:syntheticHold(bestA,bestB),price_to_bet:priceToBet(a.conservativeProb),decision,gate_reasons:a.gateReasons,opportunity:a.opportunity,validation_state:validation.state,validation_sample:validation.sample,model_projection:key==='h2h'?projected.projectedMargin:key==='spreads'?projected.projectedMargin:projected.projectedTotal,projection_sigma:key==='totals'?projected.totalSigma:projected.marginSigma,previous_odds:prev?.best_odds??null,odds_move:prev&&prev.best_odds>0?odds/prev.best_odds-1:null,previous_line:prev?.line??null,line_move:prev&&Number.isFinite(line)&&Number.isFinite(prev.line)?line-prev.line:null,case_for:caseFor(key,side,projected,selectionLine,a),case_against:caseAgainst(projected,a,injuryStatus),stake_units:decision==='PAPER BET'?a.stakeUnits:0,updated_at:ISO});
  }
  return out;
}
function caseFor(key,side,p,line,a){
  const direction=side==='A'?'prima':'opposta';
  if(key==='h2h')return `Modello ${direction} squadra ${round(a.modelProb*100,1)}% vs mercato ${round(a.marketProb*100,1)}%; margine previsto ${round(p.projectedMargin,1)}.`;
  if(key==='spreads')return `Margine previsto ${round(p.projectedMargin,1)} punti contro linea ${line>=0?'+':''}${line}; probabilità prudente ${round(a.conservativeProb*100,1)}%.`;
  return `Totale previsto ${round(p.projectedTotal,1)} contro linea ${line}; probabilità prudente ${round(a.conservativeProb*100,1)}%.`;
}
function caseAgainst(p,a,injuryStatus){
  const x=[];if(a.gateReasons?.length)x.push(`Gate: ${a.gateReasons.join(', ')}`);if(injuryStatus!=='VERIFIED')x.push('injury feed incompleto');if(p.sample<20)x.push('campione squadra limitato');if(a.confidence<70)x.push('confidenza moderata');return x.length?x.join(' · '):'Rischio residuo: varianza partita e movimento quota.';
}

export function buildInjurySummary(injuries=[]){
  const m=new Map();
  for(const x of injuries){const id=x?.player?.team_id;if(id==null)continue;const status=String(x.status||'').toLowerCase();let w=0;if(status.includes('out'))w=1;else if(status.includes('doubt'))w=.7;else if(status.includes('question'))w=.35;else if(status.includes('day'))w=.25;else w=.15;
    if(!m.has(id))m.set(id,{risk:0,count:0,players:[]});const z=m.get(id);z.risk=clamp(z.risk+w,0,3);z.count++;z.players.push(`${x.player?.first_name||''} ${x.player?.last_name||''}`.trim()+` (${x.status||'?'})`);
  }
  return m;
}

function matchTeamId(model,name){return model.teams.get(norm(name))?.id??null}
export function buildMarketsForEvent({league,ev,model,history=[],prevMarkets=new Map(),injuries=new Map(),injuryStatus='LIMITED'}){
  const hid=matchTeamId(model,ev.home_team),aid=matchTeamId(model,ev.away_team),hr=hid!=null?(injuries.get(hid)?.risk||0):0,ar=aid!=null?(injuries.get(aid)?.risk||0):0;
  const projected=projectGame(model,ev.home_team,ev.away_team,ev.commence_time,{home:hr,away:ar});
  const groups=parseMarketGroups(ev),markets=groups.flatMap(group=>buildCandidate({league,ev,projected,group,history,prevMarkets,injuryStatus}));
  return {projected,markets,injuries:{home:hid!=null?injuries.get(hid)||null:null,away:aid!=null?injuries.get(aid)||null:null}};
}

function chooseBest(markets){
  const ranked=[...markets].filter(x=>x.decision!=='WAIT').sort((a,b)=>(b.opportunity||0)-(a.opportunity||0)||(b.robust_ev||0)-(a.robust_ev||0));
  return ranked[0]||null;
}
function buildPrevMap(prev){return new Map((prev?.markets||[]).map(x=>[x.market_id,x]))}
function updateMarketHistory(prev,current){
  const hist=new Map(Object.entries(prev?.market_history||{}));
  for(const x of current){const arr=Array.isArray(hist.get(x.market_id))?hist.get(x.market_id):[];arr.push({at:ISO,line:x.line,best_odds:x.best_odds,book:x.best_book,market_prob:x.market_prob});hist.set(x.market_id,arr.slice(-MARKET_HISTORY_MAX))}
  return Object.fromEntries(hist);
}

export function settleMarket(row,game){
  if(!row||!game||!Number.isFinite(game.hs)||!Number.isFinite(game.as))return null;
  const home=norm(row.home_team),sel=norm(row.selection),margin=game.hs-game.as,total=game.hs+game.as;let won=null,push=false;
  if(row.market_key==='h2h')won=sel.includes(home)?margin>0:margin<0;
  else if(row.market_key==='spreads'){
    const isHome=sel.includes(home),adj=(isHome?margin:-margin)+(Number(row.selection_line??row.line)||0);if(Math.abs(adj)<1e-9)push=true;else won=adj>0;
  }else if(row.market_key==='totals'){
    const over=/^over/i.test(row.selection),d=total-Number(row.line);if(Math.abs(d)<1e-9)push=true;else won=over?d>0:d<0;
  }
  const odds=row.locked_odds||row.best_odds,stake=row.locked_stake_units??row.stake_units??0,profit=push?0:won?stake*(odds-1):-stake;
  return {...row,status:'SETTLED',settled_at:ISO,outcome:push?null:won,push,final_home:game.hs,final_away:game.as,profit_units:profit};
}
function gameKey(g){return `${norm(g.away)}|${norm(g.home)}|${String(g.date||'').slice(0,10)}`}
function settleHistory(prevHistory=[],prevBestBets=[],games=[]){
  const finals=new Map();for(const g of games)finals.set(gameKey(g),g);
  const history=[...prevHistory],active=[];
  for(const x of prevBestBets||[]){if(x.status==='SETTLED'){history.push(x);continue}const date=String(x.start_at||'').slice(0,10),g=finals.get(`${norm(x.away_team)}|${norm(x.home_team)}|${date}`);if(!g){active.push(x);continue}const s=settleMarket(x,g);if(s)history.unshift(s);else active.push(x)}
  return {history:dedupeHistory(history).slice(0,3000),active};
}
function dedupeHistory(rows){const seen=new Set();return rows.filter(x=>{const k=x.bet_id||`${x.market_id}|${x.start_at}`;if(seen.has(k))return false;seen.add(k);return true})}
function trackStats(history=[]){
  const byMarket={};for(const key of MARKET_KEYS){const z=history.filter(x=>x.status==='SETTLED'&&x.market_key===key&&!x.push),bets=z.filter(x=>Number.isFinite(x.profit_units));const stake=bets.reduce((s,x)=>s+(x.locked_stake_units??x.stake_units??0),0),profit=bets.reduce((s,x)=>s+x.profit_units,0);let eq=0,peak=0,dd=0;for(const x of [...bets].reverse()){eq+=x.profit_units;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}byMarket[key]={sample:bets.length,roi:stake?profit/stake:null,profit_units:profit,hit_rate:bets.length?bets.filter(x=>x.profit_units>0).length/bets.length:null,max_drawdown_units:dd}}
  return {closed:history.filter(x=>x.status==='SETTLED').length,by_market:byMarket};
}

function hoursToStart(iso){return (new Date(iso)-NOW)/3600000}
function stableEventId(league,ev){return String(ev.id||`${league}-${norm(ev.away_team)}-${norm(ev.home_team)}-${ev.commence_time}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,96)}
function paperLock(x,ev){return {...x,bet_id:`${x.market_id}|${ISO}`,home_team:ev.home_team,away_team:ev.away_team,start_at:ev.commence_time,status:'LOCKED',locked_at:ISO,locked_odds:x.best_odds,locked_stake_units:x.stake_units}}

export function liveProjection(pre,live){
  if(!pre||!live||!Number.isFinite(+live.home_team_score)||!Number.isFinite(+live.visitor_team_score))return null;
  const period=Math.max(0,+live.period||0),clock=String(live.time||'').trim();let minRemainingInPeriod=0;
  const mm=/^(\d+):(\d+)$/.exec(clock);if(mm)minRemainingInPeriod=+mm[1]+(+mm[2]/60);
  const totalMinutes=48,elapsed=period<=0?0:Math.min(48,(Math.min(period,4)-1)*12+(12-minRemainingInPeriod));const frac=clamp(elapsed/48,0,.999),remaining=48-elapsed,currentMargin=+live.home_team_score-+live.visitor_team_score,currentTotal=+live.home_team_score+ +live.visitor_team_score;
  const observedRate=elapsed>2?currentTotal/elapsed:pre.projected_total/48,w=clamp(frac*.65,0,.55),futureRate=(pre.projected_total/48)*(1-w)+observedRate*w;
  const finalTotalMean=currentTotal+futureRate*remaining,finalMarginMean=currentMargin+(1-frac)*pre.projected_margin,marginSigma=Math.max(3.2,pre.margin_sigma*Math.sqrt(Math.max(.05,1-frac))),totalSigma=Math.max(5,pre.total_sigma*Math.sqrt(Math.max(.08,1-frac)));
  const homeWin=normalCdf(finalMarginMean/marginSigma);
  return {elapsed_min:elapsed,remaining_min:remaining,final_margin_mean:finalMarginMean,final_total_mean:finalTotalMean,margin_sigma:marginSigma,total_sigma:totalSigma,home_win_prob:homeWin,current_margin:currentMargin,current_total:currentTotal,period,clock,status:live.status,status_state:live.status_state};
}
function buildLive({events,boxScores,pregameByTeams}){
  const live=[];
  for(const g of boxScores||[]){if(!['in_progress','scheduled'].includes(g.status_state)&&!/qtr|half|ot/i.test(String(g.status||'')))continue;const home=g.home_team?.full_name,away=g.visitor_team?.full_name;if(!home||!away)continue;const pre=pregameByTeams.get(`${norm(away)}|${norm(home)}`);if(!pre)continue;const lp=liveProjection(pre,g);if(!lp)continue;const ev=(events||[]).find(x=>norm(x.home_team)===norm(home)&&norm(x.away_team)===norm(away));const marketGroups=ev?parseMarketGroups(ev):[];live.push({game_id:g.id,home_team:home,away_team:away,home_score:+g.home_team_score,away_score:+g.visitor_team_score,period:g.period,time:g.time,status:g.status,status_state:g.status_state,projection:lp,market_groups:marketGroups.map(x=>({market_key:x.key,line:x.line,books:x.rows.length,best_a:x.rows.length?Math.max(...x.rows.map(r=>r.oddsA)):null,best_b:x.rows.length?Math.max(...x.rows.map(r=>r.oddsB)):null,age_min:x.rows.length?median(x.rows.map(r=>r.ageMin)):null})),mode:'LIVE RESEARCH',note:'GitHub-scheduled refresh is not low-latency enough for an operational in-play signal.'})}
  return live;
}

async function oddsFor(key){if(!ODDS_KEY)return [];return fetchJson(`https://api.the-odds-api.com/v4/sports/${key}/odds/?regions=${encodeURIComponent(ODDS_REGIONS)}&markets=${MARKET_KEYS.join(',')}&oddsFormat=decimal&apiKey=${encodeURIComponent(ODDS_KEY)}`)}
async function nbaGames(){
  if(!BDL_KEY)return [];const end=new Date(Date.now()-86400000).toISOString().slice(0,10),start=new Date(Date.now()-300*86400000).toISOString().slice(0,10),out=[];let cursor=null;
  for(let page=0;page<12;page++){const q=new URLSearchParams({start_date:start,end_date:end,per_page:'100'});if(cursor!=null)q.set('cursor',String(cursor));const j=await bdlFetch(`https://api.balldontlie.io/v1/games?${q}`);out.push(...(j.data||[]));cursor=j.meta?.next_cursor;if(!cursor)break}
  return out.filter(g=>g.status_state==='final'||g.status==='Final').map(g=>({date:g.datetime||g.date,home:g.home_team?.full_name,away:g.visitor_team?.full_name,home_id:g.home_team?.id,away_id:g.visitor_team?.id,hs:+g.home_team_score,as:+g.visitor_team_score})).filter(g=>g.home&&g.away&&Number.isFinite(g.hs)&&Number.isFinite(g.as));
}
async function nbaInjuries(){if(!BDL_KEY)return {status:'UNKNOWN',rows:[]};try{const j=await bdlFetch('https://api.balldontlie.io/v1/player_injuries?per_page=100',{retries:1});return {status:'VERIFIED',rows:j.data||[]}}catch(e){return {status:'LIMITED',rows:[],error:e.message}}}
async function nbaLiveBox(){if(!BDL_KEY)return [];try{const j=await bdlFetch('https://api.balldontlie.io/v1/box_scores/live',{retries:1});return j.data||[]}catch(e){console.warn('live box',e.message);return []}}
function pick(o,...keys){for(const k of keys){const v=k.split('.').reduce((a,x)=>a?.[x],o);if(v!==undefined&&v!==null&&v!=='')return v}return null}
function parseELGame(g){const home=pick(g,'local.club.name','local.club.clubName','local.club.clubPermanentName','local.name','homeTeam.name','home.name'),away=pick(g,'road.club.name','road.club.clubName','road.club.clubPermanentName','road.name','awayTeam.name','away.name'),hs=Number(pick(g,'local.score','local.points','homeScore','score.local')),as=Number(pick(g,'road.score','road.points','awayScore','score.road')),date=pick(g,'date','startDate','startTime','gameDate');return {date,home,away,hs,as}}
export function euroSeasonCodes(now=NOW){const y=now.getUTCFullYear(),m=now.getUTCMonth(),currentStart=m>=7?y:y-1;return [`E${currentStart-1}`,`E${currentStart}`]}
async function euroGames(){if(COMMERCIAL_MODE&&!EUROLEAGUE_COMMERCIAL_LICENSED)return [];let out=[];for(const s of euroSeasonCodes()){try{const j=await fetchJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${s}/games`,{retries:1});out.push(...(j.data||j.games||[]).map(parseELGame).filter(x=>x.home&&x.away&&Number.isFinite(x.hs)&&Number.isFinite(x.as)))}catch(e){console.warn('EuroLeague',s,e.message)}}return out}

function emptyBoard(league,source){return {meta:{league,version:VERSION,updated_at:ISO,status:'PAPER BETA',source,risk_mode:'PAPER_ONLY',strict_no_fabrication:true},hero:null,best_bets:[],markets:[],radar:[],live:[],history:[],stats:{closed:0,by_market:{}},market_history:{},integrity:{strict_no_fabrication:true,featured_markets:MARKET_KEYS,price_to_bet:true,line_movement:true,synthetic_hold:true,injury_feed:false,commercial_license_gate:true}}}
async function previous(file){try{return JSON.parse(await fs.readFile(path.join(DATA,file),'utf8'))}catch{return null}}

async function buildBoard(league,file,source,events,games,{injuriesStatus='LIMITED',injuryRows=[],liveBoxes=[]}={}){
  const prev=await previous(file),board=emptyBoard(league,source),model=modelFromGames(games,league),injuries=buildInjurySummary(injuryRows),prevMap=buildPrevMap(prev),settled=settleHistory(prev?.history||[],prev?.best_bets||[],games),history=settled.history,markets=[],radar=[],pregameByTeams=new Map();
  for(const ev of events||[]){const hrs=hoursToStart(ev.commence_time);if(hrs>RADAR_MAX_DAYS*24)continue;const eventId=stableEventId(league,ev),z=buildMarketsForEvent({league,ev:{...ev,id:eventId},model,history,prevMarkets:prevMap,injuries,injuryStatus:injuriesStatus});
    pregameByTeams.set(`${norm(ev.away_team)}|${norm(ev.home_team)}`,{projected_margin:z.projected.projectedMargin,projected_total:z.projected.projectedTotal,margin_sigma:z.projected.marginSigma,total_sigma:z.projected.totalSigma});
    if(hrs>0){
      const hs=model.teams.get(norm(ev.home_team))||teamState(ev.home_team),as=model.teams.get(norm(ev.away_team))||teamState(ev.away_team);
      const hp=z.projected.mlProb,homeScore=(z.projected.projectedTotal+z.projected.projectedMargin)/2,awayScore=(z.projected.projectedTotal-z.projected.projectedMargin)/2;
      const snapshot=t=>({elo:round(t.elo,0),games:t.games,avg_pf:round(safeMean(t.pf,model.leagueAvgTotal/2),1),avg_pa:round(safeMean(t.pa,model.leagueAvgTotal/2),1),recent_margin:round(weightedRecent(t.recentMargins),1),recent_total:round(weightedRecent(t.recentTotals)||model.leagueAvgTotal,1),last_game:t.last});
      radar.push({event_id:eventId,home_team:ev.home_team,away_team:ev.away_team,start_at:ev.commence_time,hours_to_start:hrs,projected_margin:round(z.projected.projectedMargin,2),projected_total:round(z.projected.projectedTotal,2),projected_home_score:round(homeScore,1),projected_away_score:round(awayScore,1),home_win_prob:round(hp,4),projected_winner:hp>=.5?ev.home_team:ev.away_team,projected_winner_prob:round(hp>=.5?hp:1-hp,4),model_sample:z.projected.sample,reliability:round(z.projected.reliability,4),margin_sigma:round(z.projected.marginSigma,2),total_sigma:round(z.projected.totalSigma,2),rest:z.projected.rest,team_stats:{home:snapshot(hs),away:snapshot(as)},injuries:z.injuries,status:hrs<=LOCK_MAX_HOURS?'LOCK WINDOW':'EARLY RADAR'});
    }
    if(hrs>=LOCK_MIN_HOURS&&hrs<=LOCK_MAX_HOURS){for(const m of z.markets)markets.push({...m,home_team:ev.home_team,away_team:ev.away_team,start_at:ev.commence_time,event_id:eventId})}
  }
  const byEvent=new Map();for(const m of markets){if(!byEvent.has(m.event_id))byEvent.set(m.event_id,[]);byEvent.get(m.event_id).push(m)}
  const best=[];for(const [eventId,z] of byEvent){const b=chooseBest(z);if(b)best.push(paperLock(b,{home_team:b.home_team,away_team:b.away_team,commence_time:b.start_at}))}
  const mergedActive=new Map((settled.active||[]).map(x=>[x.bet_id||`${x.market_id}|${x.start_at}`,x]));for(const b of best){const same=[...mergedActive.values()].find(x=>x.event_id===b.event_id&&x.status!=='SETTLED');if(!same)mergedActive.set(b.bet_id,b)}
  board.markets=markets.sort((a,b)=>(b.opportunity||0)-(a.opportunity||0));board.radar=radar.sort((a,b)=>a.hours_to_start-b.hours_to_start);board.best_bets=[...mergedActive.values()].sort((a,b)=>(b.opportunity||0)-(a.opportunity||0));board.history=history;board.stats=trackStats(history);board.market_history=updateMarketHistory(prev,markets);board.integrity.injury_feed=injuriesStatus==='VERIFIED';board.integrity.historical_games=games.length;board.integrity.market_events=events.length;board.integrity.market_rows=markets.length;board.integrity.best_bets=board.best_bets.length;board.meta.data_health=games.length>250?'GOOD':games.length>80?'LIMITED':'THIN';board.meta.market_health=events.length?'LIVE':'NO FEED';board.meta.injury_health=injuriesStatus;board.model_stats={historical_games:games.length,teams:model.teams.size,league_avg_total:round(model.leagueAvgTotal,1),league_margin_sd:round(model.leagueMarginSd,1),league_total_sd:round(model.leagueTotalSd,1),forecast_games:board.radar.length};board.hero=board.best_bets[0]||null;
  if(league==='NBA')board.live=buildLive({events,boxScores:liveBoxes,pregameByTeams});
  await fs.writeFile(path.join(DATA,file),JSON.stringify(board,null,2));return board;
}

async function main(){
  await fs.mkdir(DATA,{recursive:true});
  const results=await Promise.allSettled([oddsFor('basketball_nba'),oddsFor('basketball_euroleague'),nbaGames(),euroGames(),nbaInjuries(),nbaLiveBox()]);
  const [nbaOdds,elOdds,ng,eg,inj,live]=results.map((x,i)=>x.status==='fulfilled'?x.value:(i===4?{status:'LIMITED',rows:[]} : []));
  results.forEach((x,i)=>{if(x.status==='rejected')console.warn(['nba odds','el odds','nba games','el games','injuries','live'][i],x.reason?.message)});
  const nba=await buildBoard('NBA','nba-v4-board.json','BALLDONTLIE + The Odds API',nbaOdds,ng,{injuriesStatus:inj.status,injuryRows:inj.rows,liveBoxes:live});
  const elSource=COMMERCIAL_MODE?'Licensed EuroLeague provider required + The Odds API':'EuroLeague upstream research feed + The Odds API';
  const el=await buildBoard('EUROLEAGUE','euroleague-v4-board.json',elSource,elOdds,eg,{injuriesStatus:'LIMITED'});
  console.log(JSON.stringify({ok:true,version:VERSION,nba:{markets:nba.markets.length,best:nba.best_bets.length,live:nba.live.length,closed:nba.stats.closed},euroleague:{markets:el.markets.length,best:el.best_bets.length,closed:el.stats.closed}},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exitCode=1});
