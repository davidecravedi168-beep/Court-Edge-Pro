import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ALLOWED=new Set(['h2h','spreads','totals']);
const BDL_FREE_ONLY=/^(1|true|yes)$/i.test(process.env.BDL_FREE_ONLY||'true');
const PAID_BDL_PATHS=['/v1/player_injuries','/v1/box_scores/live','/v1/stats','/v1/lineups','/nba/v1/stats/advanced','/nba/v2/stats/advanced'];

export function marketProfile(raw='h2h'){
  const out=[];
  for(const x of String(raw||'h2h').split(',').map(x=>x.trim())){
    if(ALLOWED.has(x)&&!out.includes(x))out.push(x);
  }
  return out.length?out:['h2h'];
}

export function rewriteOddsUrl(raw,markets=marketProfile()){
  const u=new URL(raw);
  if(u.hostname==='api.the-odds-api.com'&&/\/odds\/?$/.test(u.pathname))u.searchParams.set('markets',markets.join(','));
  return u.toString();
}

export function isPaidBdlEndpoint(raw){
  try{const u=new URL(raw);return u.hostname==='api.balldontlie.io'&&PAID_BDL_PATHS.some(p=>u.pathname.startsWith(p))}catch{return false}
}

function pick(o,...keys){for(const k of keys){const v=k.split('.').reduce((a,x)=>a?.[x],o);if(v!==undefined&&v!==null&&v!=='')return v}return null}
function euroHistoricalGameOk(g,nowMs=Date.now()){
  const date=Date.parse(pick(g,'date','startDate','startTime','gameDate')||'');
  const hs=Number(pick(g,'local.score','local.points','homeScore','score.local'));
  const as=Number(pick(g,'road.score','road.points','awayScore','score.road'));
  if(!Number.isFinite(date)||date>nowMs+6*3600000)return false;
  if(!Number.isFinite(hs)||!Number.isFinite(as))return false;
  // A scheduled EuroLeague fixture can expose 0/placeholder scores. Historical
  // modelling accepts only plausible completed-game totals, fail-closed.
  if(hs<35||as<35||hs>180||as>180)return false;
  const total=hs+as;
  return total>=90&&total<=320;
}
export function sanitizeEuroleagueGamesPayload(payload,nowMs=Date.now()){
  if(!payload||typeof payload!=='object')return payload;
  const key=Array.isArray(payload.data)?'data':Array.isArray(payload.games)?'games':null;
  if(!key)return payload;
  const rows=payload[key],clean=rows.filter(g=>euroHistoricalGameOk(g,nowMs));
  return {...payload,[key]:clean,_court_integrity:{...(payload._court_integrity||{}),input_games:rows.length,accepted_historical_games:clean.length,rejected_placeholder_or_future:rows.length-clean.length}};
}
function isEuroleagueGamesUrl(raw){try{const u=new URL(raw);return u.hostname==='api-live.euroleague.net'&&/\/competitions\/E\/seasons\/[^/]+\/games\/?$/i.test(u.pathname)}catch{return false}}
async function sanitizeEuroResponse(response,nowMs=Date.now()){
  if(!response?.ok)return response;
  const json=await response.json();
  const clean=sanitizeEuroleagueGamesPayload(json,nowMs);
  const headers=new Headers(response.headers);headers.set('content-type','application/json; charset=utf-8');headers.delete('content-length');
  return new Response(JSON.stringify(clean),{status:response.status,statusText:response.statusText,headers});
}

export async function main(){
  const markets=marketProfile(process.env.ODDS_MARKETS||'h2h');
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const raw=typeof input==='string'?input:input?.url;
    if(raw){
      if(BDL_FREE_ONLY&&isPaidBdlEndpoint(raw))throw new Error('BDL_FREE_ONLY: paid endpoint skipped');
      const next=rewriteOddsUrl(raw,markets);
      if(next!==raw)input=typeof input==='string'?next:new Request(next,input);
      const response=await nativeFetch(input,init);
      return isEuroleagueGamesUrl(next)?sanitizeEuroResponse(response):response;
    }
    return nativeFetch(input,init);
  };

  const engine=path.resolve('court-edge-v4.mjs');
  const oldArgv1=process.argv[1];
  try{
    process.argv[1]=engine;
    await import(pathToFileURL(engine).href);
  }finally{
    process.argv[1]=oldArgv1;
    globalThis.fetch=nativeFetch;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error(e);process.exitCode=1});
}