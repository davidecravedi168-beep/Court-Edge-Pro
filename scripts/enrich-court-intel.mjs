import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const BOARD_FILE=path.join(DATA,'nba-v4-board.json');
const GAME_CACHE_FILE=path.join(DATA,'nba-intel-cache.json');
const PLAYER_CACHE_FILE=path.join(DATA,'nba-player-form.json');
const BDL_KEY=process.env.BDL_API_KEY||'';
const NOW=new Date();
const ISO=NOW.toISOString();
const VERSION='COURT-INTEL-1.0';
const NBA_HEADERS={
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept':'application/json, text/plain, */*',
  'Accept-Language':'en-US,en;q=0.9',
  'Origin':'https://www.nba.com',
  'Referer':'https://www.nba.com/'
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sd=a=>{const z=a.filter(Number.isFinite);if(z.length<2)return null;const m=avg(z);return Math.sqrt(avg(z.map(x=>(x-m)**2)))};
const round=(x,d=2)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}}
async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n')}
async function fetchJson(url,{headers={},timeoutMs=18000,retries=1}={}){
  let last;
  for(let i=0;i<=retries;i++){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers,signal:c.signal});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(e){last=e;if(i<retries)await sleep(1200*(i+1))}finally{clearTimeout(t)}
  }
  throw last;
}

function gameDate(g){return String(g.datetime||g.date||'').slice(0,10)}
function mapBdlGame(g){
  const hs=Number(g.home_team_score),as=Number(g.visitor_team_score);
  return {id:String(g.id),date:g.datetime||g.date,home:g.home_team?.full_name,away:g.visitor_team?.full_name,home_id:g.home_team?.id??null,away_id:g.visitor_team?.id??null,hs,as,status:g.status_state||g.status};
}
function validFinal(g){return g.home&&g.away&&Number.isFinite(g.hs)&&Number.isFinite(g.as)&&g.hs+g.as>0}
function mergeGames(oldRows,newRows){
  const m=new Map();
  for(const g of [...oldRows,...newRows]){const k=g.id||`${gameDate(g)}|${norm(g.away)}|${norm(g.home)}`;if(validFinal(g))m.set(k,g)}
  return [...m.values()].sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(-900);
}
async function updateHistoricalGames(cache){
  const existing=Array.isArray(cache?.games)?cache.games:[];
  if(!BDL_KEY)return {games:existing,source_state:'NO_KEY'};
  const initial=existing.length<120;
  const last=existing.length?new Date(existing[existing.length-1].date):null;
  const start=initial?new Date(NOW-330*86400000):new Date(Math.max(NOW-21*86400000,(last?.getTime()||0)-2*86400000));
  const end=new Date(NOW.getTime()+86400000);
  const found=[];let cursor=null;
  try{
    await sleep(14000);
    for(let page=0;page<(initial?10:3);page++){
      const q=new URLSearchParams({start_date:start.toISOString().slice(0,10),end_date:end.toISOString().slice(0,10),per_page:'100'});
      if(cursor!=null)q.set('cursor',String(cursor));
      const j=await fetchJson(`https://api.balldontlie.io/v1/games?${q}`,{headers:{Authorization:BDL_KEY},retries:1});
      for(const raw of j.data||[]){if(raw.status_state==='final'||raw.status==='Final'){const g=mapBdlGame(raw);if(validFinal(g))found.push(g)}}
      cursor=j.meta?.next_cursor;
      if(!cursor)break;
      await sleep(13000);
    }
    return {games:mergeGames(existing,found),source_state:'VERIFIED_FREE',fetched:found.length};
  }catch(e){
    console.warn('Court intel BDL history:',e.message);
    return {games:existing,source_state:existing.length?'CACHE_FALLBACK':'UNAVAILABLE',error:e.message};
  }
}

function oneTeamGame(team,g){
  const home=norm(g.home)===norm(team),pf=home?g.hs:g.as,pa=home?g.as:g.hs,margin=pf-pa;
  return {date:gameDate(g),opponent:home?g.away:g.home,venue:home?'HOME':'AWAY',pf,pa,margin,total:pf+pa,result:margin>0?'W':margin<0?'L':'T'};
}
function rec(rows){const w=rows.filter(x=>x.result==='W').length,l=rows.filter(x=>x.result==='L').length;return `${w}-${l}`}
function streak(rows){if(!rows.length)return '—';const r=rows[0].result;let n=0;for(const x of rows){if(x.result!==r)break;n++}return `${r}${n}`}
function summarizeTeam(team,games){
  const all=games.filter(g=>norm(g.home)===norm(team)||norm(g.away)===norm(team)).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(g=>oneTeamGame(team,g));
  const last10=all.slice(0,10),last5=all.slice(0,5),home=all.filter(x=>x.venue==='HOME').slice(0,10),away=all.filter(x=>x.venue==='AWAY').slice(0,10);
  const stat=rows=>({sample:rows.length,record:rec(rows),avg_pf:round(avg(rows.map(x=>x.pf)),1),avg_pa:round(avg(rows.map(x=>x.pa)),1),avg_margin:round(avg(rows.map(x=>x.margin)),1),avg_total:round(avg(rows.map(x=>x.total)),1)});
  return {
    state:last10.length>=5?'VERIFIED':'LIMITED',sample:all.length,streak:streak(all),last_game:all[0]?.date||null,
    last5:stat(last5),last10:stat(last10),home_split:stat(home),away_split:stat(away),
    volatility:{margin_sd:round(sd(last10.map(x=>x.margin)),1),total_sd:round(sd(last10.map(x=>x.total)),1)},
    trend:{margin:[...last10].reverse().map(x=>x.margin),pf:[...last10].reverse().map(x=>x.pf),pa:[...last10].reverse().map(x=>x.pa),total:[...last10].reverse().map(x=>x.total)},
    games:last10
  };
}
function h2h(home,away,games){
  const rows=games.filter(g=>[norm(g.home),norm(g.away)].includes(norm(home))&&[norm(g.home),norm(g.away)].includes(norm(away))).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8).map(g=>oneTeamGame(home,g));
  return {sample:rows.length,home_perspective_record:rec(rows),avg_margin:round(avg(rows.map(x=>x.margin)),1),avg_total:round(avg(rows.map(x=>x.total)),1),games:rows};
}

function playerLine(p,game,teamName){
  const mins=Number.parseFloat(String(p.minutesCalculated||p.minutes||p.statistics?.minutes||'0'))||0;
  return {game_id:String(game.gameId||game.game_id||''),date:String(game.gameTimeUTC||game.gameTimeLocal||ISO).slice(0,10),team_name:teamName,min:round(mins,1),pts:Number(p.points??0),reb:Number(p.reboundsTotal??p.rebounds??0),ast:Number(p.assists??0),stl:Number(p.steals??0),blk:Number(p.blocks??0),tov:Number(p.turnovers??0),plus_minus:Number(p.plusMinusPoints??p.plusMinus??0),fg_pct:round(Number(p.fieldGoalsPercentage??0),3),fg3_pct:round(Number(p.threePointersPercentage??0),3),starter:Boolean(p.position&&p.position!=='')};
}
function teamFullName(t){return [t.teamCity||t.city,t.teamName||t.name].filter(Boolean).join(' ').trim()||t.name||t.teamTricode||'Unknown'}
function updatePlayerCache(cache,box){
  const rows=cache?.players&&typeof cache.players==='object'?cache.players:{};const game=box.game||box;
  for(const team of [game.homeTeam,game.awayTeam].filter(Boolean)){
    const teamName=teamFullName(team);
    for(const p of team.players||[]){
      const id=String(p.personId??p.playerId??p.player?.id??'');if(!id)continue;
      const name=(p.name||p.nameI||[p.firstName,p.familyName].filter(Boolean).join(' ')||p.player?.name||'').trim();if(!name)continue;
      const old=rows[id]||{player_id:id,name,team_name:teamName,position:p.position||'',games:[]};
      old.name=name;old.team_name=teamName;old.position=p.position||old.position||'';
      const line=playerLine(p,game,teamName),gm=new Map((old.games||[]).map(x=>[x.game_id,x]));gm.set(line.game_id,line);old.games=[...gm.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-12);rows[id]=old;
    }
  }
  return {version:VERSION,updated_at:ISO,players:rows};
}
function topPlayers(team,playerCache){
  const out=[];
  for(const p of Object.values(playerCache?.players||{})){
    if(norm(p.team_name)!==norm(team)||!(p.games||[]).length)continue;
    const z=(p.games||[]).slice(-5),mean=k=>round(avg(z.map(x=>Number(x[k])).filter(Number.isFinite)),1);
    const row={player_id:p.player_id,name:p.name,position:p.position||'',sample:z.length,avg_min:mean('min'),pts:mean('pts'),reb:mean('reb'),ast:mean('ast'),stl:mean('stl'),blk:mean('blk'),tov:mean('tov'),plus_minus:mean('plus_minus'),fg_pct:round(avg(z.map(x=>x.fg_pct).filter(Number.isFinite)),3),fg3_pct:round(avg(z.map(x=>x.fg3_pct).filter(Number.isFinite)),3)};
    row.impact_score=round((row.pts||0)+.7*(row.reb||0)+.8*(row.ast||0)+.8*(row.stl||0)+.8*(row.blk||0)-.5*(row.tov||0),1);out.push(row);
  }
  return out.sort((a,b)=>(b.impact_score||0)-(a.impact_score||0)).slice(0,4);
}

function clockMinutes(raw){
  const s=String(raw||'');let m=/PT(\d+)M([\d.]+)S/i.exec(s);if(m)return +m[1]+(+m[2]/60);m=/(\d+):(\d+)/.exec(s);return m?+m[1]+(+m[2]/60):0;
}
function normalCdf(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,sign=x<0?-1:1,z=Math.abs(x)/Math.sqrt(2),t=1/(1+p*z),erf=sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z));return .5*(1+erf)}
function liveProjection(pre,g){
  const period=Math.max(0,Number(g.period||0)),clock=clockMinutes(g.gameClock||g.time||g.gameStatusText),elapsed=period<=0?0:Math.min(48,(Math.min(period,4)-1)*12+(12-clock)),frac=clamp(elapsed/48,0,.999),remaining=48-elapsed,homeScore=Number(g.homeTeam?.score??g.home_score??0),awayScore=Number(g.awayTeam?.score??g.away_score??0),curMargin=homeScore-awayScore,curTotal=homeScore+awayScore;
  const preTotal=Number(pre?.projected_total)||225,preMargin=Number(pre?.projected_margin)||0,observedRate=elapsed>2?curTotal/elapsed:preTotal/48,w=clamp(frac*.7,0,.58),futureRate=(preTotal/48)*(1-w)+observedRate*w,finalTotal=curTotal+futureRate*remaining,finalMargin=curMargin+(1-frac)*preMargin,baseSigma=Number(pre?.margin_sigma)||13,marginSigma=Math.max(3.0,baseSigma*Math.sqrt(Math.max(.05,1-frac)));
  return {elapsed_min:round(elapsed,2),remaining_min:round(remaining,2),current_margin:curMargin,current_total:curTotal,final_margin_mean:round(finalMargin,2),final_total_mean:round(finalTotal,2),margin_sigma:round(marginSigma,2),home_win_prob:round(normalCdf(finalMargin/marginSigma),4),period,clock:String(g.gameClock||g.time||g.gameStatusText||'')};
}
function boxTeamStats(team){const s=team?.statistics||{};return {fg_pct:round(Number(s.fieldGoalsPercentage),3),fg3_pct:round(Number(s.threePointersPercentage),3),ft_pct:round(Number(s.freeThrowsPercentage),3),reb:Number(s.reboundsTotal??s.rebounds??0),ast:Number(s.assists??0),tov:Number(s.turnoversTotal??s.turnovers??0),paint:Number(s.pointsInThePaint??0),fast_break:Number(s.pointsFastBreak??0)} }
function topLivePlayers(team){return [...(team?.players||[])].map(p=>({name:(p.name||p.nameI||[p.firstName,p.familyName].filter(Boolean).join(' ')).trim(),position:p.position||'',pts:Number(p.points||0),reb:Number(p.reboundsTotal??p.rebounds??0),ast:Number(p.assists||0),plus_minus:Number(p.plusMinusPoints??p.plusMinus??0)})).filter(x=>x.name).sort((a,b)=>(b.pts+b.reb*.6+b.ast*.7)-(a.pts+a.reb*.6+a.ast*.7)).slice(0,3)}
function momentumFromPbp(pbp){
  const a=pbp?.game?.actions||pbp?.actions||[];const scored=a.filter(x=>Number.isFinite(Number(x.scoreHome))&&Number.isFinite(Number(x.scoreAway))).slice(-12);if(scored.length<2)return {side:'NEUTRAL',net:0,last_play:a.at(-1)?.description||null};
  const first=scored[0],last=scored.at(-1),home=(+last.scoreHome-+first.scoreHome),away=(+last.scoreAway-+first.scoreAway),net=home-away;return {side:net>=5?'HOME':net<=-5?'AWAY':'NEUTRAL',net,last_play:a.at(-1)?.description||null};
}
async function officialLive(playerCache){
  try{
    const score=await fetchJson('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',{headers:NBA_HEADERS,retries:1});
    const games=score?.scoreboard?.games||[];const live=[];let cache=playerCache;
    for(const g of games.slice(0,15)){
      if(![2,3].includes(Number(g.gameStatus)))continue;
      const id=String(g.gameId||'');if(!id)continue;
      let box=null,pbp=null;
      try{box=await fetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${id}.json`,{headers:NBA_HEADERS,retries:1});cache=updatePlayerCache(cache,box)}catch(e){console.warn('NBA boxscore',id,e.message)}
      if(Number(g.gameStatus)===2){try{pbp=await fetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${id}.json`,{headers:NBA_HEADERS,retries:0})}catch(e){console.warn('NBA pbp',id,e.message)}}
      if(Number(g.gameStatus)!==2)continue;
      const bg=box?.game||{},home=teamFullName(bg.homeTeam||g.homeTeam),away=teamFullName(bg.awayTeam||g.awayTeam);
      live.push({game_id:id,home_team:home,away_team:away,home_score:Number(g.homeTeam?.score??bg.homeTeam?.score??0),away_score:Number(g.awayTeam?.score??bg.awayTeam?.score??0),period:Number(g.period||bg.period||0),time:String(g.gameClock||g.gameStatusText||bg.gameStatusText||''),status:g.gameStatusText||'LIVE',status_state:'in_progress',source:'NBA OFFICIAL CDN',team_box:{home:boxTeamStats(bg.homeTeam),away:boxTeamStats(bg.awayTeam)},leaders:{home:topLivePlayers(bg.homeTeam),away:topLivePlayers(bg.awayTeam)},momentum:momentumFromPbp(pbp),market_groups:[],mode:'OFFICIAL LIVE RESEARCH'});
    }
    return {ok:true,live,playerCache:cache,scoreboard_games:games.length};
  }catch(e){console.warn('NBA official live:',e.message);return {ok:false,live:[],playerCache,error:e.message}}
}

function matchupRadar(home,away,radar){
  const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?round(a-b,1):null;
  const restHome=Number(radar?.rest?.home),restAway=Number(radar?.rest?.away);
  return {
    form_margin_edge:diff(home.last5?.avg_margin,away.last5?.avg_margin),
    scoring_edge:diff(home.last10?.avg_pf,away.last10?.avg_pf),
    defense_edge:diff(away.last10?.avg_pa,home.last10?.avg_pa),
    stability_edge:diff(away.volatility?.margin_sd,home.volatility?.margin_sd),
    rest_edge_days:Number.isFinite(restHome)&&Number.isFinite(restAway)?round(restHome-restAway,1):null
  };
}
function fallbackTeam(radarStats){return {state:'MODEL_SUMMARY_ONLY',sample:radarStats?.games||0,streak:'—',last_game:radarStats?.last_game||null,last5:{sample:0,record:'—',avg_pf:radarStats?.avg_pf??null,avg_pa:radarStats?.avg_pa??null,avg_margin:radarStats?.recent_margin??null,avg_total:radarStats?.recent_total??null},last10:{sample:0,record:'—',avg_pf:radarStats?.avg_pf??null,avg_pa:radarStats?.avg_pa??null,avg_margin:radarStats?.recent_margin??null,avg_total:radarStats?.recent_total??null},home_split:{sample:0,record:'—'},away_split:{sample:0,record:'—'},volatility:{margin_sd:null,total_sd:null},trend:{margin:[],pf:[],pa:[],total:[]},games:[]}}

async function main(){
  const board=await readJson(BOARD_FILE,null);if(!board)throw new Error('NBA V4 board missing');
  const oldGameCache=await readJson(GAME_CACHE_FILE,{version:VERSION,updated_at:null,games:[]});
  const oldPlayerCache=await readJson(PLAYER_CACHE_FILE,{version:VERSION,updated_at:null,players:{}});
  const hist=await updateHistoricalGames(oldGameCache);let playerCache=oldPlayerCache;
  const official=await officialLive(playerCache);playerCache=official.playerCache||playerCache;
  const games=hist.games||[];
  for(const r of board.radar||[]){
    const home=games.length?summarizeTeam(r.home_team,games):fallbackTeam(r.team_stats?.home),away=games.length?summarizeTeam(r.away_team,games):fallbackTeam(r.team_stats?.away),hh=games.length?h2h(r.home_team,r.away_team,games):{sample:0,home_perspective_record:'—',avg_margin:null,avg_total:null,games:[]};
    r.intelligence={version:VERSION,generated_at:ISO,data_state:hist.source_state,sources:['BALLDONTLIE FREE GAMES','NBA OFFICIAL CDN LIVE'],home,away,h2h:hh,matchup_radar:matchupRadar(home,away,r),top_players:{home:topPlayers(r.home_team,playerCache),away:topPlayers(r.away_team,playerCache)},player_form_state:Object.keys(playerCache?.players||{}).length?'ROLLING_OFFICIAL_BOXSCORES':'LEARNING'};
  }
  if(official.ok){
    const previous=Array.isArray(board.live)?board.live:[];
    board.live=official.live.map(x=>{const pre=(board.radar||[]).find(r=>norm(r.home_team)===norm(x.home_team)&&norm(r.away_team)===norm(x.away_team)),old=previous.find(r=>norm(r.home_team)===norm(x.home_team)&&norm(r.away_team)===norm(x.away_team));return {...x,projection:liveProjection(pre,x),market_groups:old?.market_groups||[],note:'Official NBA live snapshot. Probability is model-derived research, not an operational in-play signal.'}});
  }
  board.meta={...board.meta,intelligence_version:VERSION,intelligence_updated_at:ISO,team_history_health:hist.source_state,official_live_health:official.ok?'READY':'LIMITED',official_live_source:'NBA CDN',player_form_health:Object.keys(playerCache?.players||{}).length?'ROLLING':'LEARNING'};
  board.integrity={...board.integrity,team_history_free_source:true,official_nba_live:true,player_stats_no_fabrication:true,player_form_from_official_boxscores:true};
  await writeJson(BOARD_FILE,board);
  await writeJson(GAME_CACHE_FILE,{version:VERSION,updated_at:ISO,source_state:hist.source_state,games});
  await writeJson(PLAYER_CACHE_FILE,{...playerCache,version:VERSION,updated_at:ISO});
  console.log(JSON.stringify({ok:true,version:VERSION,radar:(board.radar||[]).length,historical_games:games.length,live:(board.live||[]).length,player_profiles:Object.keys(playerCache?.players||{}).length,history_state:hist.source_state,official_live:official.ok}));
}

main().catch(e=>{console.error(e);process.exitCode=1});
