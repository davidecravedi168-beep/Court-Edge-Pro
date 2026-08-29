export const PREDICTION_VERSION='COURT-PF-1.0';
export const FORECAST_LOCK_MIN_HOURS=.75;
export const FORECAST_LOCK_MAX_HOURS=36;

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
const round=(x,d=4)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
function normalCdf(x){
  const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
  const sign=x<0?-1:1,z=Math.abs(x)/Math.sqrt(2),t=1/(1+p*z);
  const erf=sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z));
  return .5*(1+erf);
}
function finite(v,fallback=0){return Number.isFinite(v)?v:fallback}
function logLossFor(p,y){p=clamp(p,1e-9,1-1e-9);return -(y?Math.log(p):Math.log(1-p))}

export function buildChallengerProjection(projected,league='NBA'){
  const m=Array.isArray(projected?.marginParts)?projected.marginParts:[];
  const t=Array.isArray(projected?.totalParts)?projected.totalParts:[];
  const rel=clamp(finite(projected?.reliability),0,1);
  const elo=finite(m[0]),longForm=finite(m[1]),recent=finite(m[2]);
  const rawMargin=(elo*1.45+longForm*1.15+recent*.55)/(1.45+1.15+.55);
  const projectedMargin=rawMargin*rel*.96;
  const sigma=Math.max(5,finite(projected?.marginSigma,league==='NBA'?17:14)*1.06);
  const homeWinProb=clamp(normalCdf(projectedMargin/sigma),.02,.98);
  const structural=finite(t[0],finite(projected?.projectedTotal)),recentTotal=finite(t[1],structural),regressed=finite(t[2],structural);
  const projectedTotal=(structural*1.2+recentTotal*.55+regressed*1.45)/(1.2+.55+1.45);
  return {version:`${PREDICTION_VERSION}-SHADOW`,projected_margin:round(projectedMargin,3),projected_total:round(projectedTotal,3),home_win_prob:round(homeWinProb,5),margin_sigma:round(sigma,3)};
}

export function challengerMarketProb({challenger,projected,marketKey,line,side='A'}={}){
  if(!challenger)return null;
  let p=null;
  if(marketKey==='h2h')p=finite(challenger.home_win_prob,.5);
  else if(marketKey==='spreads'&&Number.isFinite(line))p=normalCdf((finite(challenger.projected_margin)+line)/Math.max(5,finite(challenger.margin_sigma,finite(projected?.marginSigma,12))));
  else if(marketKey==='totals'&&Number.isFinite(line))p=normalCdf((finite(challenger.projected_total)-line)/Math.max(7,finite(projected?.totalSigma,15)*1.06));
  if(!Number.isFinite(p))return null;
  p=clamp(p,.02,.98);return side==='A'?p:1-p;
}

function compactMarket(x,score){
  if(!x)return null;
  return {market_id:x.market_id,market_key:x.market_key,market_label:x.market_label,selection:x.selection,model_prob:x.model_prob,robust_prob:x.robust_prob,best_odds:x.best_odds,best_book:x.best_book,min_acceptable_odds:x.price_to_bet,robust_ev:x.robust_ev,confidence:x.confidence,data_quality:x.data_quality,validation_state:x.validation_state,decision:x.decision,prediction_score:round(score,5),gate_reasons:x.gate_reasons||[]};
}

export function buildPredictionSummary({league='NBA',ev,projected,markets=[],injuryStatus='LIMITED',challenger=null,leagueAvgTotal=null}={}){
  if(!projected)throw new Error('projected required');
  const homeProb=clamp(finite(projected.mlProb,.5),.02,.98),winnerSide=homeProb>=.5?'HOME':'AWAY';
  const winnerProb=Math.max(homeProb,1-homeProb),winnerName=winnerSide==='HOME'?ev?.home_team:ev?.away_team;
  challenger=challenger||buildChallengerProjection(projected,league);
  const challengerGap=Math.abs(homeProb-finite(challenger.home_win_prob,.5));
  const rel=clamp(finite(projected.reliability),0,1),sample=Math.max(0,finite(projected.sample));
  const injuryVerified=injuryStatus==='VERIFIED';
  const dataQuality=clamp(42+rel*38+Math.min(10,sample*.18)+(injuryVerified?7:2),35,97);
  const sigmaBase=league==='NBA'?13:10.5;
  const sigmaPenalty=clamp((finite(projected.marginSigma,sigmaBase)-sigmaBase)/18,0,.5)*12;
  const separation=(winnerProb-.5)*2;
  const sportsConfidence=clamp(48+rel*28+separation*18+(injuryVerified?5:0)-challengerGap*115-sigmaPenalty,35,94);
  const baseline=Number.isFinite(leagueAvgTotal)?leagueAvgTotal:(league==='NBA'?225:162);
  const totalDelta=finite(projected.projectedTotal,baseline)-baseline;
  const gameScript=Math.abs(finite(projected.projectedMargin))>=9?'CLEAR_LEAN':Math.abs(finite(projected.projectedMargin))>=4?'LEAN':'TOSS_UP';
  const pace=totalDelta>=6?'HIGH':totalDelta<=-6?'LOW':'NEUTRAL';
  const projectedHome=(finite(projected.projectedTotal)+finite(projected.projectedMargin))/2;
  const projectedAway=(finite(projected.projectedTotal)-finite(projected.projectedMargin))/2;
  const familyReliability={h2h:1,spreads:.97,totals:.93};
  const ranked=(markets||[]).filter(x=>Number.isFinite(x?.model_prob)&&Number.isFinite(x?.robust_prob)).map(x=>{const validationWeight=x.validation_state==='TEST'?.97:1;const score=clamp((.68*x.model_prob+.32*x.robust_prob)*(familyReliability[x.market_key]||.88)*validationWeight,0,1);return {x,score}}).sort((a,b)=>b.score-a.score||(b.x.model_prob||0)-(a.x.model_prob||0));
  const playable=ranked.filter(({x})=>['PAPER BET','TEST VALUE'].includes(x.decision)&&Number.isFinite(x.robust_ev)&&x.robust_ev>0&&x.best_odds>1&&!(x.gate_reasons||[]).length);
  const watch=ranked.find(({x})=>Number.isFinite(x.robust_ev)&&x.robust_ev>0&&x.best_odds>1)||ranked[0]||null;
  const best=playable[0]||null;
  return {prediction_version:PREDICTION_VERSION,winner_side:winnerSide,winner_name:winnerName||null,home_win_prob:round(homeProb,5),winner_prob:round(winnerProb,5),projected_margin:round(projected.projectedMargin,3),projected_total:round(projected.projectedTotal,3),projected_home_score:round(projectedHome,2),projected_away_score:round(projectedAway,2),sports_confidence:round(sportsConfidence,2),data_quality:round(dataQuality,2),model_sample:sample,reliability:round(rel,4),availability_status:injuryStatus,challenger_home_win_prob:round(challenger.home_win_prob,5),challenger_gap:round(challengerGap,5),scenario:{game_script:gameScript,pace,total_vs_baseline:round(totalDelta,2)},best_market:best?compactMarket(best.x,best.score):null,watch_market:watch?compactMarket(watch.x,watch.score):null,alternatives:playable.slice(1,4).map(({x,score})=>compactMarket(x,score)),price_gate:best?'PLAYABLE_PAPER':'NO_PLAYABLE_PRICE'};
}

function findResult(lock,games=[]){
  const start=new Date(lock.start_at).getTime();let best=null,bestDiff=Infinity;
  for(const g of games){if(norm(g.home)!==norm(lock.home_team)||norm(g.away)!==norm(lock.away_team))continue;const t=new Date(g.date).getTime(),diff=Math.abs(t-start);if(Number.isFinite(diff)&&diff<bestDiff&&diff<=36*3600000){best=g;bestDiff=diff}}
  return best;
}
function settleForecast(lock,g,nowIso){
  const hs=+g.hs,as=+g.as,actualHome=hs>as?1:0,actualMargin=hs-as,actualTotal=hs+as;
  const predWinner=lock.predicted_winner,actualWinner=actualHome?lock.home_team:lock.away_team;
  return {...lock,status:'SETTLED',settled_at:nowIso,actual_home_win:actualHome,actual_winner:actualWinner,winner_correct:norm(predWinner)===norm(actualWinner),actual_home_score:hs,actual_away_score:as,actual_margin:actualMargin,actual_total:actualTotal,margin_error:Math.abs(finite(lock.projected_margin)-actualMargin),total_error:Math.abs(finite(lock.projected_total)-actualTotal),home_score_error:Math.abs(finite(lock.projected_home_score)-hs),away_score_error:Math.abs(finite(lock.projected_away_score)-as)};
}
function lockFromRadar(r,nowIso){return {event_id:r.event_id,league:r.league||null,home_team:r.home_team,away_team:r.away_team,start_at:r.start_at,prediction_locked_at:nowIso,prediction_version:r.prediction_version||PREDICTION_VERSION,status:'LOCKED',home_win_prob:r.home_win_prob,predicted_winner:r.projected_winner,winner_prob:r.projected_winner_prob,projected_margin:r.projected_margin,projected_total:r.projected_total,projected_home_score:r.projected_home_score,projected_away_score:r.projected_away_score,challenger_home_win_prob:r.challenger_home_win_prob,challenger_gap:r.challenger_gap,sports_confidence:r.sports_confidence,data_quality:r.data_quality,model_sample:r.model_sample,reliability:r.reliability,availability_status:r.availability_status||null}}
function dedupeHistory(rows){const seen=new Set();return rows.filter(x=>{const k=`${x.event_id}|${x.prediction_locked_at||''}`;if(seen.has(k))return false;seen.add(k);return true})}

export function forecastStats(history=[]){
  const z=(history||[]).filter(x=>x.status==='SETTLED'&&Number.isFinite(x.home_win_prob)&&Number.isFinite(x.actual_home_win));
  const closed=z.length;
  if(!closed)return {closed:0,winner_accuracy:null,brier:null,log_loss:null,margin_mae:null,total_mae:null,score_mae:null,challenger_brier:null,challenger_log_loss:null,shadow_advantage_brier:null,ece:null,calibration:[],recent_brier:null,drift_alert:false,status:'LEARNING'};
  const brier=avg(z.map(x=>(x.home_win_prob-x.actual_home_win)**2));
  const ll=avg(z.map(x=>logLossFor(x.home_win_prob,x.actual_home_win)));
  const shadow=z.filter(x=>Number.isFinite(x.challenger_home_win_prob));
  const sb=shadow.length?avg(shadow.map(x=>(x.challenger_home_win_prob-x.actual_home_win)**2)):null;
  const sll=shadow.length?avg(shadow.map(x=>logLossFor(x.challenger_home_win_prob,x.actual_home_win))):null;
  const bins=[[.50,.60],[.60,.70],[.70,.80],[.80,.90],[.90,1.001]];
  const calibration=bins.map(([lo,hi])=>{const q=z.filter(x=>x.winner_prob>=lo&&x.winner_prob<hi);return {range:`${Math.round(lo*100)}-${Math.round(Math.min(hi,1)*100)}%`,sample:q.length,mean_confidence:q.length?round(avg(q.map(x=>x.winner_prob)),4):null,accuracy:q.length?round(avg(q.map(x=>x.winner_correct?1:0)),4):null}}).filter(x=>x.sample);
  const ece=calibration.length?calibration.reduce((s,b)=>s+b.sample/closed*Math.abs(b.mean_confidence-b.accuracy),0):null;
  const recent=z.slice(-20),older=z.slice(0,Math.max(0,z.length-20)),recentBrier=recent.length?avg(recent.map(x=>(x.home_win_prob-x.actual_home_win)**2)):null,olderBrier=older.length?avg(older.map(x=>(x.home_win_prob-x.actual_home_win)**2)):null;
  const drift=closed>=40&&((Number.isFinite(olderBrier)&&recentBrier>olderBrier+.03)||(Number.isFinite(ece)&&ece>.09));
  return {closed,winner_accuracy:round(avg(z.map(x=>x.winner_correct?1:0)),5),brier:round(brier,6),log_loss:round(ll,6),margin_mae:round(avg(z.map(x=>x.margin_error).filter(Number.isFinite)),3),total_mae:round(avg(z.map(x=>x.total_error).filter(Number.isFinite)),3),score_mae:round(avg(z.flatMap(x=>[x.home_score_error,x.away_score_error]).filter(Number.isFinite)),3),challenger_brier:round(sb,6),challenger_log_loss:round(sll,6),shadow_advantage_brier:Number.isFinite(sb)?round(brier-sb,6):null,ece:round(ece,6),calibration,recent_brier:round(recentBrier,6),drift_alert:drift,status:closed<20?'LEARNING':drift?'WATCH':'HEALTHY'};
}

export function updateForecastTracking({previousLocks=[],previousHistory=[],radar=[],games=[],nowIso=new Date().toISOString(),lockMinHours=FORECAST_LOCK_MIN_HOURS,lockMaxHours=FORECAST_LOCK_MAX_HOURS}={}){
  const history=[...(previousHistory||[])],active=[],settledIds=new Set(history.filter(x=>x.status==='SETTLED').map(x=>x.event_id));
  for(const lock of previousLocks||[]){if(!lock?.event_id||settledIds.has(lock.event_id))continue;const g=findResult(lock,games);if(g){history.push(settleForecast(lock,g,nowIso));settledIds.add(lock.event_id);continue}active.push(lock)}
  const activeIds=new Set(active.map(x=>x.event_id));
  for(const r of radar||[]){const hrs=Number(r.hours_to_start);if(!r?.event_id||activeIds.has(r.event_id)||settledIds.has(r.event_id))continue;if(Number.isFinite(hrs)&&hrs>=lockMinHours&&hrs<=lockMaxHours){active.push(lockFromRadar(r,nowIso));activeIds.add(r.event_id)}}
  const clean=dedupeHistory(history).sort((a,b)=>new Date(a.start_at||0)-new Date(b.start_at||0)).slice(-4000);
  const stats=forecastStats(clean);
  return {locks:active,history:clean,stats,health:{status:stats.status,drift_alert:stats.drift_alert,closed:stats.closed,brier:stats.brier,log_loss:stats.log_loss,challenger_brier:stats.challenger_brier,ece:stats.ece,prediction_version:PREDICTION_VERSION}};
}

export function selectPredictionHero(radar=[]){
  const future=(radar||[]).filter(x=>Number.isFinite(x?.hours_to_start)&&x.hours_to_start>0);
  if(!future.length)return null;
  const near=future.filter(x=>x.hours_to_start<=FORECAST_LOCK_MAX_HOURS),pool=near.length?near:future.sort((a,b)=>a.hours_to_start-b.hours_to_start).slice(0,12);
  return [...pool].sort((a,b)=>{const as=finite(a.sports_confidence,finite(a.reliability)*100)+(finite(a.projected_winner_prob,.5)-.5)*35-Math.min(a.hours_to_start,168)/168*3;const bs=finite(b.sports_confidence,finite(b.reliability)*100)+(finite(b.projected_winner_prob,.5)-.5)*35-Math.min(b.hours_to_start,168)/168*3;return bs-as})[0]||null;
}
