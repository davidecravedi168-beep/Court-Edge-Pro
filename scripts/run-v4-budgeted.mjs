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

export async function main(){
  const markets=marketProfile(process.env.ODDS_MARKETS||'h2h');
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const raw=typeof input==='string'?input:input?.url;
    if(raw){
      if(BDL_FREE_ONLY&&isPaidBdlEndpoint(raw))throw new Error('BDL_FREE_ONLY: paid endpoint skipped');
      const next=rewriteOddsUrl(raw,markets);
      if(next!==raw)input=typeof input==='string'?next:new Request(next,input);
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
