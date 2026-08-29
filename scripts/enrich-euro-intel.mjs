import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const BOARD_FILE=path.join(DATA,'euroleague-v4-board.json');
const CACHE_FILE=path.join(DATA,'euroleague-intel-cache.json');
const NOW=new Date();
const ISO=NOW.toISOString();
const VERSION='COURT-INTEL-1.0';

const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sd=a=>{const z=a.filter(Number.isFinite);if(z.length<2)return null;const m=avg(z);return Math.sqrt(avg(z.map(x=>(x-m)**2)))};
const round=(x,d=2)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}}
async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n')}
async function fetchJson(url,{timeoutMs=18000,retries=1}={}){let last;for(let i=0;i<=retries;i++){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}catch(e){last=e}finally{clearTimeout(t)}}throw last}
function pick(o,...keys){for(const k of keys){const v=k.split('.').reduce((a,x)=>a?.[x],o);if(v!==undefined&&v!==null&&v!=='')return v}return null}
function parseGame(g){
  const home=pick(g,'local.club.name','local.club.clubName','local.club.clubPermanentName','local.name','homeTeam.name','home.name');
  const away=pick(g,'road.club.name','road.club.clubName','road.club.clubPermanentName','road.name','awayTeam.name','away.name');
  const hs=Number(pick(g,'local.score','local.points','homeScore','score.local'));
  const as=Number(pick(g,'road.score','road.points','awayScore','score.road'));
  const date=pick(g,'date','startDate','startTime','gameDate');
  const id=pick(g,'id','gameCode','code')||`${String(date||'').slice(0,10)}|${norm(away)}|${norm(home)}`;
  return {id:String(id),date,home,away,hs,as};
}
function valid(g){return g.home&&g.away&&g.date&&Number.isFinite(g.hs)&&Number.isFinite(g.as)&&g.hs+g.as>0}
function seasonCodes(){const y=NOW.getUTCFullYear(),m=NOW.getUTCMonth(),start=m>=7?y:y-1;return [`E${start-1}`,`E${start}`]}
function merge(oldRows,newRows){const m=new Map();for(const g of [...oldRows,...newRows])if(valid(g))m.set(g.id||`${String(g.date).slice(0,10)}|${norm(g.away)}|${norm(g.home)}`,g);return [...m.values()].sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(-700)}
async function euroGames(cache){
  const old=Array.isArray(cache?.games)?cache.games:[],fresh=[];let ok=0,lastError=null;
  for(const s of seasonCodes()){
    try{const j=await fetchJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${s}/games`);fresh.push(...(j.data||j.games||[]).map(parseGame).filter(valid));ok++}catch(e){lastError=e.message;console.warn('EuroLeague intel',s,e.message)}
  }
  const games=merge(old,fresh);return {games,state:ok?'VERIFIED_PUBLIC':games.length?'CACHE_FALLBACK':'UNAVAILABLE',fetched:fresh.length,error:lastError};
}
function one(team,g){const home=norm(g.home)===norm(team),pf=home?g.hs:g.as,pa=home?g.as:g.hs,margin=pf-pa;return {date:String(g.date).slice(0,10),opponent:home?g.away:g.home,venue:home?'HOME':'AWAY',pf,pa,margin,total:pf+pa,result:margin>0?'W':margin<0?'L':'T'}}
function rec(rows){return `${rows.filter(x=>x.result==='W').length}-${rows.filter(x=>x.result==='L').length}`}
function streak(rows){if(!rows.length)return '—';const r=rows[0].result;let n=0;for(const x of rows){if(x.result!==r)break;n++}return `${r}${n}`}
function team(team,games,fallback={}){
  const all=games.filter(g=>norm(g.home)===norm(team)||norm(g.away)===norm(team)).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(g=>one(team,g));
  const stat=rows=>({sample:rows.length,record:rec(rows),avg_pf:round(avg(rows.map(x=>x.pf)),1),avg_pa:round(avg(rows.map(x=>x.pa)),1),avg_margin:round(avg(rows.map(x=>x.margin)),1),avg_total:round(avg(rows.map(x=>x.total)),1)});
  if(!all.length)return {state:'MODEL_SUMMARY_ONLY',sample:fallback.games||0,streak:'—',last_game:fallback.last_game||null,last5:{sample:0,record:'—',avg_pf:fallback.avg_pf??null,avg_pa:fallback.avg_pa??null,avg_margin:fallback.recent_margin??null,avg_total:fallback.recent_total??null},last10:{sample:0,record:'—',avg_pf:fallback.avg_pf??null,avg_pa:fallback.avg_pa??null,avg_margin:fallback.recent_margin??null,avg_total:fallback.recent_total??null},home_split:{sample:0,record:'—'},away_split:{sample:0,record:'—'},volatility:{margin_sd:null,total_sd:null},trend:{margin:[],pf:[],pa:[],total:[]},games:[]};
  const l10=all.slice(0,10),l5=all.slice(0,5),home=all.filter(x=>x.venue==='HOME').slice(0,10),away=all.filter(x=>x.venue==='AWAY').slice(0,10);
  return {state:l5.length>=5?'VERIFIED':'LIMITED',sample:all.length,streak:streak(all),last_game:all[0]?.date||null,last5:stat(l5),last10:stat(l10),home_split:stat(home),away_split:stat(away),volatility:{margin_sd:round(sd(l10.map(x=>x.margin)),1),total_sd:round(sd(l10.map(x=>x.total)),1)},trend:{margin:[...l10].reverse().map(x=>x.margin),pf:[...l10].reverse().map(x=>x.pf),pa:[...l10].reverse().map(x=>x.pa),total:[...l10].reverse().map(x=>x.total)},games:l10};
}
function h2h(home,away,games){const z=games.filter(g=>[norm(g.home),norm(g.away)].includes(norm(home))&&[norm(g.home),norm(g.away)].includes(norm(away))).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8).map(g=>one(home,g));return {sample:z.length,home_perspective_record:rec(z),avg_margin:round(avg(z.map(x=>x.margin)),1),avg_total:round(avg(z.map(x=>x.total)),1),games:z}}
function matchup(home,away,r){const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?round(a-b,1):null,hr=Number(r?.rest?.home),ar=Number(r?.rest?.away);return {form_margin_edge:diff(home.last5?.avg_margin,away.last5?.avg_margin),scoring_edge:diff(home.last10?.avg_pf,away.last10?.avg_pf),defense_edge:diff(away.last10?.avg_pa,home.last10?.avg_pa),stability_edge:diff(away.volatility?.margin_sd,home.volatility?.margin_sd),rest_edge_days:Number.isFinite(hr)&&Number.isFinite(ar)?round(hr-ar,1):null}}

async function main(){
  const board=await readJson(BOARD_FILE,null);if(!board)throw new Error('EuroLeague V4 board missing');
  const cache=await readJson(CACHE_FILE,{version:VERSION,updated_at:null,games:[]}),source=await euroGames(cache),games=source.games||[];
  for(const r of board.radar||[]){const home=team(r.home_team,games,r.team_stats?.home),away=team(r.away_team,games,r.team_stats?.away);r.intelligence={version:VERSION,generated_at:ISO,data_state:source.state,sources:['EUROLEAGUE PUBLIC GAMES'],home,away,h2h:h2h(r.home_team,r.away_team,games),matchup_radar:matchup(home,away,r),top_players:{home:[],away:[]},player_form_state:'UNAVAILABLE_PUBLIC_VERIFIED_FEED'}}
  board.meta={...board.meta,intelligence_version:VERSION,intelligence_updated_at:ISO,team_history_health:source.state,player_form_health:'LIMITED_PUBLIC_FEED'};
  board.integrity={...board.integrity,team_history_public_source:true,player_stats_no_fabrication:true};
  await writeJson(BOARD_FILE,board);await writeJson(CACHE_FILE,{version:VERSION,updated_at:ISO,source_state:source.state,games});
  console.log(JSON.stringify({ok:true,version:VERSION,league:'EUROLEAGUE',radar:(board.radar||[]).length,historical_games:games.length,state:source.state,fetched:source.fetched}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
