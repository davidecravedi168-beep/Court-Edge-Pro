import path from 'node:path';
import {pathToFileURL} from 'node:url';

const allowed=new Set(['h2h','spreads','totals']);
const requested=String(process.env.ODDS_MARKETS||'h2h')
  .split(',').map(x=>x.trim()).filter(x=>allowed.has(x));
const markets=requested.length?requested:['h2h'];
const nativeFetch=globalThis.fetch;

globalThis.fetch=async(input,init)=>{
  const raw=typeof input==='string'?input:input?.url;
  if(raw){
    const u=new URL(raw);
    if(u.hostname==='api.the-odds-api.com'&&/\/odds\/?$/.test(u.pathname)){
      u.searchParams.set('markets',markets.join(','));
      input=typeof input==='string'?u.toString():new Request(u.toString(),input);
    }
  }
  return nativeFetch(input,init);
};

const engine=path.resolve('court-edge-v4.mjs');
process.argv[1]=engine;
await import(pathToFileURL(engine).href);
