import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyzeMarket,blendProbabilities,clamp,brierScore,logLoss,devigTwoWay,VERSION} from './quant-engine.mjs';
import {mergePredictionLocks,settleLocks} from './lock-engine.mjs';
import {assertPublicBoard,EDGE_CORE_VERSION} from './edge-core.mjs';

const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const ODDS_KEY=process.env.ODDS_API_KEY||'';
const BDL_KEY=process.env.BDL_API_KEY||'';
const ODDS_REGIONS=process.env.ODDS_REGIONS||'eu';
const BDL_INTERVAL_RAW=Number(process.env.BDL_MIN_INTERVAL_MS||13000);
const BDL_MIN_INTERVAL_MS=Number.isFinite(BDL_INTERVAL_RAW)?Math.max(12000,BDL_INTERVAL_RAW):13000;
const COMMERCIAL_MODE=/^(1|true|yes)$/i.test(process.env.COMMERCIAL_MODE||'');
const EUROLEAGUE_COMMERCIAL_LICENSED=/^(1|true|yes)$/i.test(process.env.EUROLEAGUE_COMMERCIAL_LICENSED||'');
const NOW=new Date();
const ISO=NOW.toISOString();
const LOCK_MIN_HOURS=.75;
const LOCK_MAX_HOURS=36;
const RADAR_MAX_DAYS=90;

const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{const z=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!z.length)return null;const m=Math.floor(z.length/2);return z.length%2?z[m]:(z[m-1]+z[m])/2};
const weightedRecent=a=>{if(!a.length)return 0;let s=0,w=0;a.forEach((v,i)=>{const q=Math.exp((i-a.length+1)/4);s+=v*q;w+=q});return s/w};
const sd=a=>{if(a.length<2)return 10;const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2)))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function retryAfterMs(r){
  const raw=r.headers.get('retry-after');
  if(!raw)return 2000;
  const seconds=Number(raw);
  if(Number.isFinite(seconds))return Math.max(1000,seconds*1000);
  const date=Date.parse(raw);
  return Number.isFinite(date)?Math.max(1000,date-Date.now()):2000;
}

async function fetchJson(url,{headers={},retries=2,timeoutMs=15000}={}){
  let last;
  for(let i=0;i<=retries;i++){
    const c=new AbortController();
    const t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers,signal:c.signal});
      if(r.status===429){
        const wait=Math.min(65000,retryAfterMs(r));
        last=new Error(`HTTP 429 retry-after=${wait}`);
        if(i<retries){await sleep(wait);continue}
        throw last;
      }
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(e){
      last=e;
      if(i<retries)await sleep(Math.min(8000,900*(i+1)));
    }finally{
      clearTimeout(t);
    }
  }
  throw last;
}

let bdlQueue=Promise.resolve();
let bdlNextAt=0;
function bdlFetch(url,options={}){
  const run=bdlQueue.then(async()=>{
    const wait=Math.max(0,bdlNextAt-Date.now());
    if(wait)await sleep(wait);
    bdlNextAt=Date.now()+BDL_MIN_INTERVAL_MS;
    return fetchJson(url,{...options,headers:{...(options.headers||{}),Authorization:BDL_KEY}});
  });
  bdlQueue=run.catch(()=>{});
  return run;
}

function baseBoard(league,source,note=''){
  return {
    meta:{league,status:'LIVE_READY',model_health:'COLD',data_health:'NO_FEED',market_health:'NO_FEED',risk_mode:'PAPER_ONLY',updated_at:ISO,source,model_version:`${VERSION}-${league}`,edge_core_version:EDGE_CORE_VERSION,domain_profile:'BASKETBALL',note,lock_window_hours:[LOCK_MIN_HOURS,LOCK_MAX_HOURS],radar_horizon_days:RADAR_MAX_DAYS},
    stats:{closed_picks:0,hit_rate:null,roi:null,brier:null,log_loss:null,avg_clv:null,max_drawdown_units:0},
    risk:{exposure_units:0,max_exposure_units:league==='NBA'?2.5:2,portfolio_guard:'ON',mode:'PAPER_ONLY'},
    learning:{calibration:{active:false,mode:'MONITOR_ONLY'},drift:{health:'COLD'},challenger:{status:'SHADOW',sample:0,note:'Formula alternativa usata solo come disagreement guard; nessuna promozione senza validazione out-of-sample.'}},
    radar:[],upcoming:[],history:[],
    integrity:{strict_no_fabrication:true,secrets_server_side:true,generated_at:ISO,market_consensus:'same-book de-vig median',prediction_lock:'0.75-36h pre-tip',anomaly_gate:true,portfolio_cap_enforced:true,challenger_shadow:true,secondary_markets:'PAPER_RESEARCH_UNTIL_SETTLED_SAMPLE'}
  };
}

async function previous(file){try{return JSON.parse(await fs.readFile(path.join(DATA,file),'utf8'))}catch{return null}}

function metrics(history=[]){
  const settled=history.filter(x=>x.status==='SETTLED'&&Number.isFinite(x.model_prob)&&typeof x.outcome==='boolean');
  const bets=settled.filter(x=>x.verdict==='PAPER BET'&&Number.isFinite(x.profit_units));
  const rows=settled.map(x=>({prob:x.model_prob,outcome:x.outcome}));
  const stake=bets.reduce((s,x)=>s+(x.locked_stake_units??x.stake_units??1),0);
  const profit=bets.reduce((s,x)=>s+x.profit_units,0);
  const clv=bets.map(x=>x.clv_proxy).filter(Number.isFinite);
  let eq=0,peak=0,dd=0;
  for(const x of bets){eq+=x.profit_units||0;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  return {closed_picks:settled.length,hit_rate:bets.length?bets.filter(x=>x.profit_units>0).length/bets.length:null,roi:stake?profit/stake:null,brier:brierScore(rows),log_loss:logLoss(rows),avg_clv:clv.length?avg(clv):null,max_drawdown_units:dd};
}

function modelFromGames(games,league){
  const m=new Map(),homeAdj=league==='NBA'?55:60;
  const get=n=>{const k=norm(n);if(!m.has(k))m.set(k,{name:n,elo:1500,games:0,margins:[],recent:[],totals:[],pointsFor:[],pointsAgainst:[],last:null});return m.get(k)};
  for(const g of [...games].sort((a,b)=>new Date(a.date)-new Date(b.date))){
    if(!g.home||!g.away||!Number.isFinite(g.hs)||!Number.isFinite(g.as))continue;
    const h=get(g.home),a=get(g.away),ex=1/(1+10**(-((h.elo+homeAdj)-a.elo)/400)),act=g.hs>g.as?1:0,k=18,delta=k*(act-ex);
    h.elo+=delta;a.elo-=delta;h.games++;a.games++;
    h.margins.push(g.hs-g.as);a.margins.push(g.as-g.hs);h.recent.push(g.hs-g.as);a.recent.push(g.as-g.hs);
    h.totals.push(g.hs+g.as);a.totals.push(g.hs+g.as);h.pointsFor.push(g.hs);h.pointsAgainst.push(g.as);a.pointsFor.push(g.as);a.pointsAgainst.push(g.hs);
    if(h.recent.length>12)h.recent.shift();if(a.recent.length>12)a.recent.shift();if(h.margins.length>40)h.margins.shift();if(a.margins.length>40)a.margins.shift();
    for(const z of [h,a])for(const key of ['totals','pointsFor','pointsAgainst'])if(z[key].length>40)z[key].shift();
    h.last=g.date;a.last=g.date;
  }
  return {teams:m,homeAdj};
}

function probs(model,home,away,startAt){
  const h=model.teams.get(norm(home))||{elo:1500,games:0,margins:[],recent:[],totals:[],pointsFor:[],pointsAgainst:[],last:null};
  const a=model.teams.get(norm(away))||{elo:1500,games:0,margins:[],recent:[],totals:[],pointsFor:[],pointsAgainst:[],last:null};
  const elo=1/(1+10**(-((h.elo+model.homeAdj)-a.elo)/400));
  const form=1/(1+Math.exp(-(weightedRecent(h.recent)-weightedRecent(a.recent)+2)/11));
  const margin=1/(1+Math.exp(-(avg(h.margins)-avg(a.margins)+2)/13));
  let parts=[elo,form,margin];
  const tip=new Date(startAt).getTime();
  const restDays=x=>x?.last?Math.max(0,(tip-new Date(x.last).getTime())/86400000):4;
  const hr=restDays(h),ar=restDays(a);
  let restAdj=0;
  if(hr<1.7)restAdj-=.018;if(ar<1.7)restAdj+=.018;if(hr>3.5&&ar<2.1)restAdj+=.008;if(ar>3.5&&hr<2.1)restAdj-=.008;
  parts=parts.map(x=>clamp(x+restAdj,.05,.95));
  const championRaw=blendProbabilities(parts,[1.35,1,.95]);
  const challengerRaw=blendProbabilities(parts,[1.0,1.20,1.15]);
  const sample=Math.min(h.games,a.games),reliability=sample/(sample+12);
  const p=.5+(championRaw-.5)*reliability;
  const challengerP=.5+(challengerRaw-.5)*reliability;
  const challengerGap=Math.abs(p-challengerP);
  const engineSpread=Math.max(...parts)-Math.min(...parts);
  const dis=Math.max(engineSpread,challengerGap*1.25);
  const unc=clamp(.025+(sd(h.recent)+sd(a.recent))/210+Math.max(0,16-sample)/180,.025,.14);
  const projectedMargin=sample>=8?clamp((avg(h.margins)-avg(a.margins))/2+model.homeAdj/20,-25,25):null;
  const totalPool=[...(h.totals||[]).slice(-12),...(a.totals||[]).slice(-12)];
  const projectedTotal=sample>=8&&totalPool.length>=12?clamp(avg(totalPool),leagueBaseTotal(model.homeAdj)*.72,leagueBaseTotal(model.homeAdj)*1.28):null;
  const baseTotal=leagueBaseTotal(model.homeAdj);
  return {p,challengerP,challengerGap,parts:parts.map(x=>.5+(x-.5)*reliability),dis,unc,sample,rest:{home:hr,away:ar,edge_home:hr-ar},projectedMargin,projectedTotal,paceIndex:projectedTotal==null?null:projectedTotal/baseTotal*100};
}

function leagueBaseTotal(homeAdj){return homeAdj===55?225:162}

export function markets(ev){
  const rows=[],spreadRows=[],totalRows=[];
  for(const b of ev.bookmakers||[]){
    const m=(b.markets||[]).find(x=>x.key==='h2h');
    const ho=m?.outcomes?.find(x=>norm(x.name)===norm(ev.home_team));
    const ao=m?.outcomes?.find(x=>norm(x.name)===norm(ev.away_team));
    if(ho?.price>1&&ao?.price>1){
      const d=devigTwoWay(+ho.price,+ao.price),updated=b.last_update||m.last_update,ageMin=updated?(Date.now()-new Date(updated).getTime())/60000:999;
      rows.push({book:b.title,home:+ho.price,away:+ao.price,fairHome:d.a,fairAway:d.b,overround:d.overround,updated,ageMin});
    }
    const sm=(b.markets||[]).find(x=>x.key==='spreads'),sh=sm?.outcomes?.find(x=>norm(x.name)===norm(ev.home_team)),sa=sm?.outcomes?.find(x=>norm(x.name)===norm(ev.away_team));
    if(Number.isFinite(+sh?.point)&&sh?.price>1&&sa?.price>1)spreadRows.push({book:b.title,homeLine:+sh.point,homeOdds:+sh.price,awayOdds:+sa.price,updated:b.last_update||sm.last_update});
    const tm=(b.markets||[]).find(x=>x.key==='totals'),over=tm?.outcomes?.find(x=>norm(x.name)==='over'),under=tm?.outcomes?.find(x=>norm(x.name)==='under');
    if(Number.isFinite(+over?.point)&&over?.price>1&&under?.price>1)totalRows.push({book:b.title,line:+over.point,overOdds:+over.price,underOdds:+under.price,updated:b.last_update||tm.last_update});
  }
  if(!rows.length)return null;
  const fresh=rows.filter(r=>r.ageMin<=120),use=fresh.length?fresh:rows;
  const fairHomes=use.map(r=>r.fairHome),fairHome=median(fairHomes),fairAway=1-fairHome,dispersion=use.length>1?sd(fairHomes):0,overround=median(use.map(r=>r.overround)),ageMin=median(use.map(r=>r.ageMin))??999;
  const spread=spreadRows.length?{state:'PAPER_RESEARCH',books:spreadRows.length,home_line:median(spreadRows.map(x=>x.homeLine)),best_home_odds:Math.max(...spreadRows.map(x=>x.homeOdds)),best_away_odds:Math.max(...spreadRows.map(x=>x.awayOdds))}:null;
  const total=totalRows.length?{state:'PAPER_RESEARCH',books:totalRows.length,line:median(totalRows.map(x=>x.line)),best_over_odds:Math.max(...totalRows.map(x=>x.overOdds)),best_under_odds:Math.max(...totalRows.map(x=>x.underOdds))}:null;
  return {books:use.length,bestHome:Math.max(...use.map(r=>r.home)),bestAway:Math.max(...use.map(r=>r.away)),fairHome,fairAway,dispersion,overround,ageMin,stability:clamp(94-dispersion*520-Math.min(35,ageMin/2.5),25,97),spread,total,marketFamilies:['MONEYLINE',...(spread?['SPREAD']:[]),...(total?['TOTAL']:[])]};
}

function hoursToStart(iso){return (new Date(iso).getTime()-Date.now())/3600000}
function stableEventId(league,ev){return String(ev.id||`${league}-${norm(ev.away_team)}-${norm(ev.home_team)}-${ev.commence_time}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,96)}

function buildEntries(league,odds,games,{availability='LIMITED',requireAvailability=false}={}){
  const model=modelFromGames(games,league),upcoming=[],radar=[];
  for(const ev of odds){
    const hrs=hoursToStart(ev.commence_time);
    if(hrs<=0||hrs>RADAR_MAX_DAYS*24)continue;
    const eventId=stableEventId(league,ev),p=probs(model,ev.home_team,ev.away_team,ev.commence_time),mk=markets(ev);
    const basketballIntel={state:p.sample>=8?'MODEL_DERIVED':'INSUFFICIENT_SAMPLE',projected_home_margin:p.projectedMargin,projected_total:p.projectedTotal,pace_index:p.paceIndex,home_rest_days:p.rest.home,away_rest_days:p.rest.away,rest_edge_home_days:p.rest.edge_home,back_to_back_home:p.rest.home<1.7,back_to_back_away:p.rest.away<1.7,provenance:'DERIVED_FROM_OBSERVED_FINAL_SCORES'};
    radar.push({event_id:eventId,league,away_team:ev.away_team,home_team:ev.home_team,start_at:ev.commence_time,pre_status:hrs<=LOCK_MAX_HOURS?'LOCK WINDOW':'EARLY RADAR',favorite_name:p.p>=.5?ev.home_team:ev.away_team,favorite_prob:Math.max(p.p,1-p.p),challenger_prob:p.p>=.5?p.challengerP:1-p.challengerP,challenger_gap:p.challengerGap,confidence:clamp(100-p.unc*100-p.dis*55-p.challengerGap*42,0,100),priority:clamp(50+Math.abs(p.p-.5)*100+Math.min(28,p.sample),0,100),hours_to_start:hrs,model_sample:p.sample,basketball_intel:basketballIntel,preview_reason:hrs<=LOCK_MAX_HOURS?'Dentro la finestra di lock: mercato e qualità dati possono essere validati.':'Early radar: previsione sportiva osservata, nessuna decisione di mercato ancora bloccata.'});
    if(!mk||hrs<LOCK_MIN_HOURS||hrs>LOCK_MAX_HOURS)continue;
    const homePick=p.p>=.5,pick=homePick?ev.home_team:ev.away_team,probParts=homePick?p.parts:p.parts.map(x=>1-x),op=homePick?mk.bestHome:mk.bestAway,oo=homePick?mk.bestAway:mk.bestHome,marketProb=homePick?mk.fairHome:mk.fairAway;
    const dq=clamp(50+Math.min(35,p.sample*1.25)+(availability==='VERIFIED'?12:6)+Math.min(7,mk.books),45,96),penalty=availability==='VERIFIED'?0:.018;
    const a=analyzeMarket({engineProbs:probParts,engineWeights:[1.35,1,.95],oddsPick:op,oddsOther:oo,marketProb,overround:mk.overround,uncertainty:p.unc,disagreement:p.dis,challengerGap:p.challengerGap,dataQuality:dq,marketBooks:mk.books,oddsAgeMin:mk.ageMin,availabilityStatus:availability,requireAvailability,availabilityPenalty:penalty,marketStability:mk.stability,sampleSize:p.sample});
    const anomaly=a.gateReasons.includes('EV_ANOMALY')||a.gateReasons.includes('MODEL_MARKET_GAP')||a.gateReasons.includes('MARKET_INTEGRITY');
    upcoming.push({event_id:eventId,league,away_team:ev.away_team,home_team:ev.home_team,start_at:ev.commence_time,predicted_at:ISO,hours_to_start:hrs,audit_id:`${league}-${eventId}`,verdict:a.decision,pick_team:pick,pick_name:`${pick} ML`,best_odds:op,market_home_odds:mk.bestHome,market_away_odds:mk.bestAway,market_home_prob:mk.fairHome,market_away_prob:mk.fairAway,market_overround:mk.overround,market_families:mk.marketFamilies,market_ladder:{moneyline:{home:mk.bestHome,away:mk.bestAway,books:mk.books},spread:mk.spread,total:mk.total},basketball_intel:basketballIntel,raw_ev:a.rawEV,robust_ev:a.robustEV,model_prob:a.modelProb,challenger_prob:homePick?p.challengerP:1-p.challengerP,challenger_gap:p.challengerGap,market_prob:a.marketProb,edge:a.edge,model_market_gap:a.modelMarketGap,confidence:a.confidence,data_quality:dq,market_books:mk.books,odds_age_min:mk.ageMin,market_dispersion:mk.dispersion,market_stability:mk.stability,model_sample:p.sample,model_disagreement:p.dis,uncertainty:p.unc,stake_units:a.stakeUnits,opportunity:a.opportunity,availability_status:availability,require_availability:requireAvailability,reason_codes:a.gateReasons,signal_state:anomaly?'REVIEW':a.decision,wait_reason:a.gateReasons.length?`${anomaly?'Integrity review':'Gate'}: ${a.gateReasons.join(', ')}`:null,case_for:`Elo, forma, margin profile e rest adjustment convergono su ${pick}; il prezzo è valutato contro consenso de-vig per bookmaker.`,case_against:anomaly?'Gap modello-mercato o integrità fuori range operativo: segnale escluso finché non viene confermato.':availability==='VERIFIED'?'Rischio residuo: varianza e line movement.':'Roster availability non completamente verificata: confidence e stake penalizzati.'});
  }
  return {upcoming,radar};
}

export function applyPortfolioGuard(rows,previous=[],maxExposure=2.5){
  const existingBetIds=new Set((previous||[]).filter(x=>x?.verdict==='PAPER BET').map(x=>x.event_id));
  let exposure=(previous||[]).filter(x=>x?.verdict==='PAPER BET').reduce((s,x)=>s+(x.locked_stake_units??x.stake_units??0),0);
  const candidates=rows.filter(x=>x.verdict==='PAPER BET'&&!existingBetIds.has(x.event_id)).sort((a,b)=>(b.opportunity||0)-(a.opportunity||0));
  const allowed=new Set();
  for(const x of candidates){
    const stake=x.locked_stake_units??x.stake_units??0;
    if(exposure+stake<=maxExposure+1e-9){allowed.add(x.event_id);exposure+=stake}
  }
  return rows.map(x=>{
    if(x.verdict!=='PAPER BET'||existingBetIds.has(x.event_id)||allowed.has(x.event_id))return x;
    const reasons=[...(x.reason_codes||[]),'PORTFOLIO_EXPOSURE'];
    return {...x,verdict:'WAIT',signal_state:'WAIT',stake_units:0,locked_stake_units:0,bet_locked_at:null,bet_odds:null,reason_codes:reasons,wait_reason:`Portfolio Guard: esposizione massima ${maxExposure.toFixed(2)}u raggiunta.`};
  });
}

async function oddsFor(key){
  if(!ODDS_KEY)return [];
  const requested=String(process.env.ODDS_MARKETS||'h2h').split(',').map(x=>x.trim()).filter(x=>['h2h','spreads','totals'].includes(x));
  const markets=[...new Set(requested.length?requested:['h2h'])];
  return fetchJson(`https://api.the-odds-api.com/v4/sports/${key}/odds/?regions=${encodeURIComponent(ODDS_REGIONS)}&markets=${encodeURIComponent(markets.join(','))}&oddsFormat=decimal&apiKey=${encodeURIComponent(ODDS_KEY)}`);
}

async function nbaGames(){
  if(!BDL_KEY)return [];
  const end=new Date(Date.now()-86400000).toISOString().slice(0,10),start=new Date(Date.now()-240*86400000).toISOString().slice(0,10),out=[];
  let cursor=null;
  for(let page=0;page<10;page++){
    const q=new URLSearchParams({start_date:start,end_date:end,per_page:'100'});if(cursor!=null)q.set('cursor',String(cursor));
    const j=await bdlFetch(`https://api.balldontlie.io/v1/games?${q}`);
    out.push(...(j.data||[]));cursor=j.meta?.next_cursor;if(!cursor)break;
  }
  return out.filter(g=>g.status==='Final'||g.status_state==='final'||Number.isFinite(+g.home_team_score)).map(g=>({date:g.datetime||g.date,home:g.home_team?.full_name,away:g.visitor_team?.full_name,hs:+g.home_team_score,as:+g.visitor_team_score}));
}

async function nbaAvailability(){
  if(!BDL_KEY)return {status:'UNKNOWN',count:0,source:'none'};
  try{
    const j=await bdlFetch('https://api.balldontlie.io/v1/player_injuries?per_page=100',{retries:1});
    return {status:'VERIFIED',count:(j.data||[]).length,source:'BALLDONTLIE player_injuries'};
  }catch(e){
    return {status:'LIMITED',count:0,source:`unavailable:${e.message}`};
  }
}

function pick(o,...keys){for(const k of keys){const v=k.split('.').reduce((a,x)=>a?.[x],o);if(v!==undefined&&v!==null&&v!=='')return v}return null}
function parseELGame(g){const home=pick(g,'local.club.name','local.club.clubName','local.club.clubPermanentName','local.name','homeTeam.name','home.name'),away=pick(g,'road.club.name','road.club.clubName','road.club.clubPermanentName','road.name','awayTeam.name','away.name'),hs=Number(pick(g,'local.score','local.points','homeScore','score.local')),as=Number(pick(g,'road.score','road.points','awayScore','score.road')),date=pick(g,'date','startDate','startTime','gameDate');return {date,home,away,hs,as}}
export function euroSeasonCodes(now=NOW){const y=now.getUTCFullYear(),m=now.getUTCMonth(),currentStart=m>=7?y:y-1;return [`E${currentStart-1}`,`E${currentStart}`]}
async function euroGames(){
  if(COMMERCIAL_MODE&&!EUROLEAGUE_COMMERCIAL_LICENSED)return [];
  let out=[];
  for(const s of euroSeasonCodes()){
    try{const j=await fetchJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${s}/games`,{retries:1});out.push(...(j.data||j.games||[]).map(parseELGame).filter(x=>x.home&&x.away&&Number.isFinite(x.hs)&&Number.isFinite(x.as)))}catch(e){console.warn('EuroLeague season',s,e.message)}
  }
  return out;
}

async function writeBoard(league,file,source,odds,games,opts,note,availabilityMeta=null){
  const prev=await previous(file),prevHistory=prev?.history||[],prevUpcoming=prev?.upcoming||[],b=baseBoard(league,source,note),rolled=settleLocks(prevUpcoming,prevHistory,games,ISO);
  if(odds.length&&games.length){
    const z=buildEntries(league,odds,games,opts);
    const merged=mergePredictionLocks(rolled.activeUpcoming,z.upcoming,ISO);
    const locked=applyPortfolioGuard(merged,rolled.activeUpcoming,b.risk.max_exposure_units);
    b.upcoming=locked;b.radar=z.radar;
    b.meta.data_health=games.length>250?'GOOD':games.length>80?'LIMITED':'THIN';b.meta.market_health='LIVE';b.meta.risk_mode='PAPER';
    b.meta.model_health=rolled.history.filter(x=>x.status==='SETTLED').length>=100?'WARM':rolled.history.filter(x=>x.status==='SETTLED').length>=40?'CALIBRATING':'COLD';
    b.risk.mode='PAPER';b.risk.exposure_units=locked.filter(x=>x.verdict==='PAPER BET'&&x.status!=='SETTLED').reduce((s,x)=>s+(x.locked_stake_units??x.stake_units??0),0);
    b.history=rolled.history.slice(0,1200);b.stats=metrics(b.history);b.learning.calibration.active=b.stats.closed_picks>=40;b.learning.challenger.sample=b.stats.closed_picks;
    b.integrity.historical_games=games.length;b.integrity.market_events=odds.length;b.integrity.locked_events=locked.length;b.integrity.radar_events=z.radar.length;b.integrity.settled_events=b.stats.closed_picks;b.integrity.lock_persistence=true;b.integrity.clv_proxy='last observed pre-settlement price';
    if(availabilityMeta)b.integrity.availability_feed=availabilityMeta;
  }else{
    b.upcoming=rolled.activeUpcoming;b.history=rolled.history.slice(0,1200);b.stats=metrics(b.history);b.meta.note=note||'Feed incompleto: sistema fail-closed, nessun segnale inventato.';
    if(availabilityMeta)b.integrity.availability_feed=availabilityMeta;
  }
  assertPublicBoard(b);
  await fs.writeFile(path.join(DATA,file),JSON.stringify(b,null,2));
  return b;
}

async function main(){
  await fs.mkdir(DATA,{recursive:true});
  const results=await Promise.allSettled([oddsFor('basketball_nba'),oddsFor('basketball_euroleague'),nbaGames(),euroGames(),nbaAvailability()]);
  const [nbaOdds,elOdds,ng,eg,availability]=results.map((x,i)=>x.status==='fulfilled'?x.value:(i===4?{status:'LIMITED',count:0,source:'request_failed'}:[]));
  results.forEach((x,i)=>{if(x.status==='rejected')console.warn(['nba odds','el odds','nba games','el games','nba availability'][i],x.reason?.message)});
  const nbaAvail=availability?.status||'LIMITED';
  const nba=await writeBoard('NBA','nba-quant-board.json','BALLDONTLIE + The Odds API',nbaOdds,ng,{availability:nbaAvail,requireAvailability:false},!ODDS_KEY||!BDL_KEY?'Configura ODDS_API_KEY e BDL_API_KEY per il feed NBA completo.':nbaAvail==='VERIFIED'?'Pipeline NBA live attiva con availability feed verificato.':'Pipeline NBA live attiva; injuries endpoint non incluso nel piano corrente, applicata penalità availability.',availability);
  const elNote=COMMERCIAL_MODE&&!EUROLEAGUE_COMMERCIAL_LICENSED?'COMMERCIAL MODE: feed statistico EuroLeague disabilitato finché non viene configurata una licenza commerciale.':!ODDS_KEY?'Configura ODDS_API_KEY; feed EuroLeague in modalità research.':'Pipeline EuroLeague live in modalità research: verificare licenza dati prima di monetizzare.';
  const el=await writeBoard('EUROLEAGUE','euroleague-quant-board.json',COMMERCIAL_MODE?'Licensed EuroLeague provider required + The Odds API':'EuroLeague upstream research feed + The Odds API',elOdds,eg,{availability:'LIMITED',requireAvailability:false},elNote,{status:'LIMITED',source:COMMERCIAL_MODE?'commercial_license_gate':'EuroLeague upstream research feed'});
  console.log(JSON.stringify({ok:true,version:VERSION,nba:{games:ng.length,market:nbaOdds.length,availability:nbaAvail,radar:nba.radar.length,locked:nba.upcoming.length,exposure:nba.risk.exposure_units},euroleague:{games:eg.length,market:elOdds.length,radar:el.radar.length,locked:el.upcoming.length,exposure:el.risk.exposure_units}},null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exitCode=1});
