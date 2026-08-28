import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ALLOWED=new Set(['h2h','spreads','totals']);

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

export async function main(){
  const markets=marketProfile(process.env.ODDS_MARKETS||'h2h');
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const raw=typeof input==='string'?input:input?.url;
    if(raw){
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
