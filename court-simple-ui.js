(()=>{
'use strict';
const VERSION='COURT-SIMPLE-UI-1.5';
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const n=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const esc=s=>String(s??'—').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=v=>n(v)==null?'—':`${Math.round(n(v)*100)}%`;
let lastSummaryKey='';
let staticDone=false;

function injectCss(){
 if(q('#courtSimpleCss'))return;
 const s=document.createElement('style');s.id='courtSimpleCss';s.textContent=`
.ceSimpleSummary{border:1px solid rgba(100,168,255,.32);background:linear-gradient(145deg,rgba(18,43,67,.98),rgba(8,20,32,.98));border-radius:22px;padding:15px;margin:0 0 10px;box-shadow:0 18px 48px rgba(0,0,0,.22)}
.ceSimpleTop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ceSimpleKicker{font-size:10px;letter-spacing:.14em;color:var(--c);font-weight:950}.ceSimpleWinner{font-size:22px;line-height:1.05;font-weight:1000;letter-spacing:-.035em;margin-top:5px}.ceSimpleDecision{border:1px solid rgba(66,216,155,.42);background:rgba(66,216,155,.08);color:#c8f8e1;border-radius:999px;padding:7px 10px;font-size:8px;font-weight:1000;white-space:nowrap}.ceSimpleDecision.no{border-color:rgba(242,188,86,.4);background:rgba(242,188,86,.07);color:#ffe3a7}.ceSimpleGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.ceSimpleStat{border:1px solid rgba(49,81,111,.8);border-radius:12px;padding:9px}.ceSimpleStat b{display:block;font-size:15px}.ceSimpleStat span{display:block;font-size:10px;color:var(--muted);margin-top:2px}.ceSimpleWhy{margin-top:11px;border-left:3px solid var(--b);padding:9px 10px;background:rgba(100,168,255,.06);border-radius:0 12px 12px 0;font-size:8px;line-height:1.55;color:#dce7f1}.ceSimpleWhy b{color:#fff}.ceSimpleToggle{margin-top:10px;border:1px solid var(--line2);background:#10263b;color:#eef7ff;border-radius:12px;min-height:38px;padding:0 12px;font-size:8px;font-weight:950;cursor:pointer}.ceSimpleMode>.ceGrid2,.ceSimpleMode>.ceStory{display:none}.ceSimpleMode.ceTechVisible>.ceGrid2{display:grid}.ceSimpleMode.ceTechVisible>.ceStory{display:block}.ceTeamDuel{display:flex;align-items:center;gap:7px;margin:8px 0 3px}.ceTeamDuel .ce10Logo{width:30px;height:30px}.ceTeamDuel .ceTeamNames{min-width:0;font-size:11px;color:#dbe8f4;line-height:1.25;overflow-wrap:anywhere}.ceSimpleHint{font-size:11px;color:var(--muted);margin-top:7px;line-height:1.4}
.bottom .ceNavLabel{font-size:7.2px!important;letter-spacing:0!important}
#courtSureBetFixed{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(82px + env(safe-area-inset-bottom));z-index:9999;display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 15px;border-radius:999px;border:1px solid rgba(66,216,155,.65);background:linear-gradient(135deg,#123c32,#0a211c);color:#d9ffec;text-decoration:none;font-size:10px;font-weight:1000;letter-spacing:.04em;box-shadow:0 12px 34px rgba(0,0,0,.42)}
#courtSureBetFixed:active{transform:scale(.97)}
#courtIntegrityBanner{margin:10px 0;border:1px solid rgba(255,115,123,.46);background:rgba(255,115,123,.08);color:#ffd7d9;border-radius:15px;padding:11px 12px;font-size:8px;line-height:1.5;font-weight:800}#courtIntegrityBanner b{display:block;font-size:10px;margin-bottom:3px;color:#fff}
.ceSimpleWhy{font-size:12px}.ceSimpleToggle{min-height:44px;font-size:12px}.ceTeamDuel .ce10Logo{width:30px;height:30px}@media(max-width:560px){.forecastCard,.betcard,.market,.live,.card,.metric,.kpi{overflow-wrap:anywhere;min-width:0}.forecastPick,.pick,.match,.market strong,.market span{overflow-wrap:anywhere}.ceNavLabel{font-size:10px!important}.ceSimpleWinner{font-size:19px}.ceSimpleStat b{font-size:13px}.ceSimpleSummary{padding:13px}#courtSureBetFixed{right:10px;bottom:calc(80px + env(safe-area-inset-bottom));min-height:44px;padding:0 13px}}
/* COURT EDGE PRO VISUAL REFRESH */
body{font-size:15px;line-height:1.45}.app{max-width:1180px;padding:16px 20px calc(var(--nav) + 34px)}
.top{padding:10px 0 14px;gap:16px}.brand h1{font-size:24px}.brand small{font-size:11px}.league{background:rgba(15,35,55,.72);padding:4px;border-radius:15px}.tab,.btn,.chip{min-height:44px;font-size:12px;padding:0 15px}.tab.active,.chip.active{box-shadow:0 8px 24px rgba(65,145,220,.18)}
.hero{padding:28px;border-radius:30px;background:radial-gradient(500px 200px at 100% 0,rgba(92,224,236,.14),transparent 70%),linear-gradient(135deg,#142f4b,#081521);box-shadow:0 25px 70px rgba(0,0,0,.35)}.eyebrow{font-size:11px}.verdict{font-size:clamp(42px,6vw,70px)}.heroTitle{font-size:25px}.sub{font-size:14px;line-height:1.55}.priceGuard{font-size:14px;padding:14px}.edgeStrip span{font-size:11px;padding:8px 11px}.metric{padding:15px}.metric b{font-size:25px}.metric span{font-size:10px}
.kpis{grid-template-columns:repeat(9,minmax(0,1fr));gap:9px}.kpi{padding:13px}.kpi b{font-size:20px}.kpi span{font-size:10px}.nav{gap:8px;margin:14px 0}.nav .chip{font-size:12px}.card{padding:20px;border-radius:22px;margin-bottom:14px}.head h2{font-size:20px}.pill{font-size:11px;padding:8px 11px}.forecastGrid,.bestgrid{gap:12px}.forecastCard,.betcard{padding:17px;border-radius:20px}.forecastTag,.rank{font-size:10px}.forecastPick,.pick{font-size:19px}.match{font-size:13px}.forecastScore{font-size:28px}.mini{padding:10px}.mini b{font-size:14px}.mini span{font-size:10px}.why,.against,.move{font-size:12px}.market{padding:14px;border-radius:16px}.market strong{font-size:14px}.market span{font-size:11px}.live{padding:17px;border-radius:20px}.score{font-size:34px}.clock{font-size:11px}.liveResearch{font-size:12px}.empty{font-size:14px;padding:25px}.bottom{width:min(760px,calc(100% - 28px));padding:8px;border-radius:24px;box-shadow:0 14px 45px rgba(0,0,0,.5)}.bottom button{min-height:62px;font-size:11px}.bottom b{font-size:20px}.ceNavLabel{font-size:11px!important}.ceSchedule{margin-top:24px;padding-top:20px}.ceScheduleHead h2{font-size:21px}.ceScheduleHead p{font-size:13px}.ceScheduleCard{padding:15px;border-radius:18px}.ceScheduleMeta{font-size:11px}.ceScheduleTeams strong{font-size:13px}.ceScheduleNote{font-size:11px}
@media(max-width:900px){.kpis{overflow:auto;grid-template-columns:repeat(9,125px)}.heroGrid{gap:20px}.forecastGrid,.bestgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.app{padding:10px 12px 104px}.top{align-items:flex-start}.brand h1{font-size:19px}.brand small{font-size:10px}.status{display:flex;font-size:10px}.league{order:3;width:100%;justify-content:stretch}.league .tab{flex:1}.top{flex-wrap:wrap}.hero{padding:21px}.verdict{font-size:42px}.heroTitle{font-size:20px}.sub{font-size:13px}.metrics{grid-template-columns:repeat(3,1fr)}.metric{padding:10px}.metric b{font-size:19px}.metric span{font-size:9px}.nav{margin:12px 0;overflow-x:auto;padding-bottom:3px}.nav .chip{flex:0 0 auto;font-size:11px}.forecastGrid,.bestgrid{grid-template-columns:1fr}.bottom{width:calc(100% - 18px)}.bottom button{min-height:58px;font-size:10px;padding:5px 2px}.bottom b{font-size:18px}.ceScheduleGrid{grid-template-columns:1fr}}

`;
 document.head.appendChild(s);
}

function setIfChanged(el,text){if(el&&el.textContent!==text)el.textContent=text}
function simplifyStaticCopy(){
 if(staticDone)return;
 const navLabels=['Pronostici','Partite','Live','Risultati','Budget'];
 qa('.bottom button').forEach((b,i)=>{const label=q('.ceNavLabel',b);if(label)setIfChanged(label,navLabels[i]||label.textContent);b.setAttribute('aria-label',navLabels[i]||'')});
 qa('.nav .chip').forEach(b=>{const map={bets:'PRONOSTICI',markets:'QUOTE',live:'LIVE',track:'RISULTATI',bank:'BUDGET',model:'DETTAGLI PRO',desk:'GIOCATE',intel:'ANALISI PARTITA'};if(map[b.dataset.page])setIfChanged(b,map[b.dataset.page])});
 setIfChanged(q('#intel .head h2'),'Analisi partita');
 setIfChanged(q('#intel .head .sub'),'Forma recente, precedenti, giocatori chiave e confronto tra le squadre. Le statistiche complete restano disponibili con un tocco.');
 const metricLabels=['PROB. VITTORIA','VANTAGGIO PREVISTO','PUNTI TOTALI PREVISTI'];qa('.hero .metric span').forEach((x,i)=>metricLabels[i]&&setIfChanged(x,metricLabels[i]));
 staticDone=true;
}

function semanticIssue(){
 try{
  if(typeof D==='undefined'||!D)return null;
  if(D.__semanticQuarantine)return D.__semanticQuarantine;
  const league=String(typeof L!=='undefined'?L:D?.meta?.league||'').toUpperCase();
  const rows=Array.isArray(D.radar)?D.radar:[];
  for(const r of rows){
    const total=n(r?.projected_total);
    if(league==='EUROLEAGUE'&&total!=null&&(total<130||total>220))return `Totale previsto anomalo (${total})`;
    if(league==='NBA'&&total!=null&&(total<150||total>320))return `Totale previsto anomalo (${total})`;
    for(const side of ['home','away']){
      const t=r?.team_stats?.[side];if(!t)continue;
      const pf=n(t.avg_pf),pa=n(t.avg_pa),games=n(t.games,0);
      if(games>=5&&((pf!=null&&(pf<35||pf>160))||(pa!=null&&(pa<35||pa>160))))return `Media punti ${side} incompatibile con uno storico finale`;
      const last=Date.parse(t.last_game||'');if(Number.isFinite(last)&&last>Date.now()+24*3600000)return `Ultima partita ${side} risulta nel futuro`;
    }
  }
  return null;
 }catch{return 'Controllo semantico non completabile'}
}
function applyDataIntegrityGuard(){
 if(typeof D==='undefined'||!D)return;
 const issue=semanticIssue();let banner=q('#courtIntegrityBanner');
 if(!issue){banner?.remove();return}
 if(!D.__semanticQuarantine){
   D.__semanticQuarantine=issue;
   D.hero=null;D.hero_prediction=null;D.best_bets=[];D.markets=[];D.radar=[];D.live=[];
   D.meta=D.meta||{};D.meta.data_health='QUARANTINED';D.meta.market_health='QUARANTINED';
   try{if(typeof render==='function')render()}catch{}
 }
 if(!banner){banner=document.createElement('div');banner.id='courtIntegrityBanner';const hero=q('.hero');hero?.insertAdjacentElement('afterend',banner)}
 if(banner)banner.innerHTML=`<b>DATI IN QUARANTENA</b>${esc(issue)}. Pronostici e mercati vengono nascosti finché un nuovo refresh supera i controlli di integrità.`;
 const sync=q('#sync'),dot=q('#dot');if(sync)sync.textContent='DATI IN QUARANTENA';dot?.classList.add('off');
}

function activeRow(){
 if(typeof D==='undefined'||!D||!Array.isArray(D.radar))return null;
 const id=q('.ceGameBtn.active')?.dataset.intelId;
 return D.radar.find(x=>String(x.event_id)===String(id))||D.radar[0]||null;
}
function decisionFor(row){
 if(!row||typeof D==='undefined'||!D)return {label:'NO BET',good:false,detail:'Nessuna giocata approvata.'};
 const direct=(D.best_bets||[]).find(x=>String(x.event_id)===String(row.event_id));
 if(direct?.decision==='PAPER BET')return {label:'BET · TEST',good:true,detail:`${direct.selection} @ ${n(direct.locked_odds||direct.best_odds)?.toFixed(2)||'—'}`};
 if(direct?.decision==='TEST VALUE')return {label:'SOLO TEST',good:false,detail:`${direct.selection} @ ${n(direct.locked_odds||direct.best_odds)?.toFixed(2)||'—'}`};
 const watch=row.prediction_summary?.watch_market;
 if(watch)return {label:'NO BET',good:false,detail:`Da monitorare ${watch.selection}: quota ${n(watch.best_odds)?.toFixed(2)||'—'}, richiesta almeno ${n(watch.min_acceptable_odds)?.toFixed(2)||'—'}.`};
 return {label:'NO BET',good:false,detail:'Pronostico disponibile, ma nessuna quota supera i controlli.'};
}
function confidenceLabel(row){
 const p=n(row?.projected_winner_prob),dq=n(row?.data_quality??row?.prediction_summary?.data_quality),avail=String(row?.availability_status||row?.prediction_summary?.availability_status||'').toUpperCase();
 if(p>=.68&&dq>=82&&!avail.includes('UNKNOWN'))return {text:'Alta',risk:'Medio-basso'};
 if(p>=.58&&dq>=70)return {text:'Media',risk:'Medio'};
 return {text:'Bassa',risk:'Alto'};
}
function simpleWhy(row){
 const I=row?.intelligence||{},r=I.matchup_radar||{},bits=[],home=row.home_team,away=row.away_team;
 if(n(r.form_margin_edge)!=null&&Math.abs(n(r.form_margin_edge))>=1)bits.push(`${n(r.form_margin_edge)>=0?home:away} arriva in forma migliore.`);
 if(n(r.scoring_edge)!=null&&Math.abs(n(r.scoring_edge))>=1)bits.push(`${n(r.scoring_edge)>=0?home:away} sta segnando di più.`);
 if(n(r.defense_edge)!=null&&Math.abs(n(r.defense_edge))>=1)bits.push(`${n(r.defense_edge)>=0?home:away} sta concedendo meno punti.`);
 if(n(r.rest_edge_days)!=null&&Math.abs(n(r.rest_edge_days))>=.5)bits.push(`${n(r.rest_edge_days)>0?home:away} arriva più riposata.`);
 if(I.h2h?.sample>=2)bits.push(`Disponibili ${I.h2h.sample} scontri diretti recenti.`);
 if(!bits.length)bits.push('Le squadre sono vicine nei dati recenti: il vantaggio non è netto.');
 return bits.slice(0,3).join(' ');
}
function playerNote(row){
 const I=row?.intelligence||{},players=[...(I.top_players?.home||[]),...(I.top_players?.away||[])];
 if(players.length)return `Giocatori chiave: ${players.slice(0,2).map(p=>`${p.name} ${Math.round(n(p.pts,0))} pt`).join(' · ')}.`;
 return 'Dati dei giocatori chiave ancora in raccolta: non vengono inventati.';
}
function summaryHtml(row){
 const d=decisionFor(row),c=confidenceLabel(row),winner=row.projected_winner||row.prediction_summary?.winner_name||'—',prob=row.projected_winner_prob??row.prediction_summary?.winner_prob;
 return `<div class="ceSimpleTop"><div><div class="ceSimpleKicker">IN SINTESI</div><div class="ceSimpleWinner">Favorita: ${esc(winner)}</div></div><div class="ceSimpleDecision ${d.good?'':'no'}">${esc(d.label)}</div></div><div class="ceSimpleGrid"><div class="ceSimpleStat"><b>${esc(pct(prob))}</b><span>PROBABILITÀ</span></div><div class="ceSimpleStat"><b>${esc(c.text)}</b><span>AFFIDABILITÀ</span></div><div class="ceSimpleStat"><b>${esc(c.risk)}</b><span>RISCHIO</span></div></div><div class="ceSimpleWhy"><b>Perché:</b> ${esc(simpleWhy(row))}<br><b>Giocata:</b> ${esc(d.detail)}</div><div class="ceSimpleHint">${esc(playerNote(row))}</div><button class="ceSimpleToggle" type="button">Vedi statistiche complete</button>`;
}
function enhanceIntel(){
 const root=q('#ceIntelDetail'),row=activeRow();if(!root||!row)return;
 const key=[row.event_id,row.projected_winner_prob,D?.meta?.updated_at,(D?.best_bets||[]).length].join('|');
 if(key===lastSummaryKey&&q('.ceSimpleSummary',root))return;
 lastSummaryKey=key;
 q('.ceSimpleSummary',root)?.remove();
 root.classList.add('ceSimpleMode');root.classList.remove('ceTechVisible');
 const box=document.createElement('div');box.className='ceSimpleSummary';box.innerHTML=summaryHtml(row);root.prepend(box);
 const btn=q('.ceSimpleToggle',box);if(btn)btn.onclick=()=>{const show=root.classList.toggle('ceTechVisible');btn.textContent=show?'Nascondi statistiche':'Vedi statistiche complete'};
}
function simplifyHero(){
 const v=q('#heroVerdict');if(v?.textContent==='PRONOSTICO')v.textContent='FAVORITA';
}
function enhanceTeamLogos(){
 if(!window.CourtDataCenter||typeof D==='undefined'||!D)return;
 const rows=[...(D.radar||[]),...(D.best_bets||[])],by=new Map(rows.map(x=>[String(x.event_id),x]));
 const add=(card,id)=>{if(card.querySelector('.ceTeamDuel'))return;const row=by.get(String(id));if(!row)return;const league=String(D?.meta?.league||L||'');const html=`<div class="ceTeamDuel">${CourtDataCenter.logoHtml(row.away_team,league,'sm')}${CourtDataCenter.logoHtml(row.home_team,league,'sm')}<span class="ceTeamNames">${esc(row.away_team)} · ${esc(row.home_team)}</span></div>`;card.insertAdjacentHTML('afterbegin',html)};
 qa('#forecastGrid .forecastCard, #bestGrid .betcard').forEach(card=>add(card,card.dataset.ceEventId||card.dataset.eventId));
 qa('#marketGrid .market, #liveGrid .live').forEach((card,i)=>{const id=card.dataset.ceEventId||card.dataset.eventId||card.getAttribute('data-event-id');if(id)add(card,id)});
}
function ensureSureBet(){
 let a=q('#courtSureBetFixed');
 if(!a){
   a=document.createElement('a');
   a.id='courtSureBetFixed';
   a.href='./surebet.html';
   a.setAttribute('aria-label','Apri SureBet');
   a.textContent='⚡ SUREBET';
   document.body.appendChild(a);
 }
}
function run(){try{injectCss();applyDataIntegrityGuard();simplifyStaticCopy();simplifyHero();enhanceIntel();enhanceTeamLogos();ensureSureBet()}catch(err){console.error('Court simple UI:',err)}}
function init(){run();setInterval(run,1500);document.documentElement.dataset.courtSimpleUi=VERSION}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();