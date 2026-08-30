import fs from 'node:fs/promises';
import path from 'node:path';

const DATA='data';
const OUT=path.join(DATA,'surebet-board.json');
const MODEL='COURT-SUREBET-1.0';
const MAX_BOARD_AGE_MIN=20;
const MAX_MARKET_AGE_MIN=15;
const MAX_HOURS_TO_START=36;
const MIN_RAW_ROI=.005;
const MIN_ROUNDED_ROI=.0025;
const NOW=new Date();

const num=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const ageMin=v=>{const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?Math.max(0,(NOW-t)/60000):Infinity};
const hoursUntil=v=>(new Date(v)-NOW)/36e5;
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}}
async function writeJson(file,obj){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}`;await fs.writeFile(tmp,JSON.stringify(obj,null,2)+'\n');await fs.rename(tmp,file)}

function allocation(total,qa,qb){
  const cents=Math.max(2,Math.round(total*100));
  const sum=1/qa+1/qb;
  const idealA=total*(1/qa)/sum;
  const base=Math.round(idealA*100);
  let best=null;
  for(let ca=Math.max(1,base-10);ca<=Math.min(cents-1,base+10);ca++){
    const cb=cents-ca,sa=ca/100,sb=cb/100,ra=sa*qa,rb=sb*qb,worst=Math.min(ra,rb);
    if(!best||worst>best.worst_return)best={stake_a:sa,stake_b:sb,return_a:ra,return_b:rb,worst_return:worst};
  }
  const spent=best.stake_a+best.stake_b;
  const profit=best.worst_return-spent;
  return {...best,total:spent,profit,roi:profit/spent};
}

function groupMoneyline(board){
  const map=new Map();
  for(const r of board?.markets||[]){
    if(r?.market_key!=='h2h'||!['A','B'].includes(r?.side))continue;
    const k=String(r.event_id||'');if(!k)continue;
    if(!map.has(k))map.set(k,{});
    map.get(k)[r.side]=r;
  }
  return map;
}

function analyzeLeague(board,league){
  const boardAge=ageMin(board?.meta?.updated_at);
  const checked=[];
  if(!board||!Number.isFinite(boardAge)||boardAge>MAX_BOARD_AGE_MIN)return {board_age_min:boardAge,checked,opportunities:[],status:'STALE'};
  for(const [eventId,pair] of groupMoneyline(board)){
    const a=pair.A,b=pair.B;
    if(!a||!b)continue;
    const qa=num(a.best_odds),qb=num(b.best_odds);
    const bookA=String(a.best_book||''),bookB=String(b.best_book||'');
    const marketAge=Math.max(num(a.odds_age_min)??Infinity,num(b.odds_age_min)??Infinity);
    const startAt=a.start_at||b.start_at;
    const hrs=hoursUntil(startAt);
    const reasons=[];
    if(!(qa>1&&qb>1))reasons.push('QUOTE_INVALID');
    if(!bookA||!bookB||bookA===bookB)reasons.push('SERVONO_DUE_BOOKMAKER');
    if(!(num(a.market_books)>=2&&num(b.market_books)>=2))reasons.push('PROFONDITA_INSUFFICIENTE');
    if(!Number.isFinite(marketAge)||marketAge>MAX_MARKET_AGE_MIN)reasons.push('QUOTE_NON_FRESCHE');
    if(!(hrs>0&&hrs<=MAX_HOURS_TO_START))reasons.push('FUORI_FINESTRA');
    let implied=null,rawRoi=null,alloc=null;
    if(qa>1&&qb>1){implied=1/qa+1/qb;rawRoi=1/implied-1;alloc=allocation(100,qa,qb);if(!(rawRoi>=MIN_RAW_ROI))reasons.push('MARGINE_TROPPO_BASSO');if(!(alloc.roi>=MIN_ROUNDED_ROI))reasons.push('ROUNDING_BUFFER');}
    const row={event_id:eventId,league,home_team:a.home_team||b.home_team,away_team:a.away_team||b.away_team,start_at:startAt,market:'MONEYLINE',side_a:a.selection,side_b:b.selection,book_a:bookA,book_b:bookB,odds_a:qa,odds_b:qb,market_books:Math.min(num(a.market_books)||0,num(b.market_books)||0),board_age_min:+boardAge.toFixed(1),market_age_min:Number.isFinite(marketAge)?+marketAge.toFixed(1):null,implied_sum:implied==null?null:+implied.toFixed(8),raw_roi:rawRoi==null?null:+rawRoi.toFixed(8),status:reasons.length?'NON_CERTIFICATA':'SUREBET',reasons,stake_100:alloc?{stake_a:+alloc.stake_a.toFixed(2),stake_b:+alloc.stake_b.toFixed(2),return_if_a:+alloc.return_a.toFixed(2),return_if_b:+alloc.return_b.toFixed(2),worst_return:+alloc.worst_return.toFixed(2),profit:+alloc.profit.toFixed(2),roi:+alloc.roi.toFixed(8)}:null,source_updated_at:board.meta.updated_at,detected_at:NOW.toISOString(),execution_note:'Copertura matematica valida solo se entrambe le puntate sono accettate alle quote mostrate e le regole di settlement/OT sono equivalenti.'};
    checked.push(row);
  }
  return {board_age_min:boardAge,checked,opportunities:checked.filter(x=>x.status==='SUREBET'),status:'READY'};
}

async function build(){
  const nba=await readJson(path.join(DATA,'nba-v4-board.json'));
  const euro=await readJson(path.join(DATA,'euroleague-v4-board.json'));
  const a=analyzeLeague(nba,'NBA'),b=analyzeLeague(euro,'EUROLEAGUE');
  const opportunities=[...a.opportunities,...b.opportunities].sort((x,y)=>(y.stake_100?.roi||0)-(x.stake_100?.roi||0));
  const checked=[...a.checked,...b.checked].sort((x,y)=>(y.raw_roi||-99)-(x.raw_roi||-99));
  const statuses=[a.status,b.status];
  const status=opportunities.length?'READY':statuses.every(x=>x==='STALE')?'STALE':'READY';
  const out={meta:{updated_at:NOW.toISOString(),status,model_version:MODEL,source:'Court Edge Pro cached market boards · zero extra API calls',api_calls:0,leagues:['NBA','EUROLEAGUE'],max_board_age_min:MAX_BOARD_AGE_MIN,max_market_age_min:MAX_MARKET_AGE_MIN,max_hours_to_start:MAX_HOURS_TO_START,min_raw_roi:MIN_RAW_ROI,min_rounded_roi:MIN_ROUNDED_ROI,fail_closed:true,nba_board_age_min:Number.isFinite(a.board_age_min)?+a.board_age_min.toFixed(1):null,euroleague_board_age_min:Number.isFinite(b.board_age_min)?+b.board_age_min.toFixed(1):null,note:'Solo Moneyline 2-way. Se i board quote sono vecchi, nessuna vecchia surebet resta attiva.'},opportunities,checked:checked.slice(0,80)};
  await writeJson(OUT,out);
  return out;
}

function selfTest(){
  const now=NOW.toISOString(),start=new Date(NOW.getTime()+2*3600000).toISOString();
  const board={meta:{updated_at:now},markets:[
    {event_id:'T1',market_key:'h2h',side:'A',selection:'Home',home_team:'Home',away_team:'Away',start_at:start,best_odds:2.20,best_book:'Book A',market_books:4,odds_age_min:2},
    {event_id:'T1',market_key:'h2h',side:'B',selection:'Away',home_team:'Home',away_team:'Away',start_at:start,best_odds:2.05,best_book:'Book B',market_books:4,odds_age_min:3}
  ]};
  const r=analyzeLeague(board,'NBA');
  if(r.opportunities.length!==1)throw new Error('SELFTEST_ARB');
  const x=r.opportunities[0];if(x.book_a===x.book_b||!(x.stake_100.profit>0)||Math.abs(x.stake_100.stake_a+x.stake_100.stake_b-100)>.001)throw new Error('SELFTEST_STAKE');
  const same={...board,markets:board.markets.map(v=>({...v,best_book:'Same'}))};if(analyzeLeague(same,'NBA').opportunities.length)throw new Error('SELFTEST_SAME_BOOK');
  const stale={...board,meta:{updated_at:new Date(NOW.getTime()-30*60000).toISOString()}};if(analyzeLeague(stale,'NBA').opportunities.length)throw new Error('SELFTEST_STALE');
  console.log(JSON.stringify({ok:true,model:MODEL,tests:['two_book_arb','cent_allocation','same_book_guard','stale_fail_closed']}));
}

if(process.argv.includes('--self-test'))selfTest();else build().then(x=>console.log(JSON.stringify({ok:true,status:x.meta.status,opportunities:x.opportunities.length,api_calls:0},null,2))).catch(e=>{console.error(e);process.exitCode=1});
