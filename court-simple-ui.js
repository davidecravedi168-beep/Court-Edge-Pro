(()=>{
'use strict';
const VERSION='COURT-SIMPLE-UI-1.2';
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
.ceSimpleTop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ceSimpleKicker{font-size:7px;letter-spacing:.14em;color:var(--c);font-weight:950}.ceSimpleWinner{font-size:22px;line-height:1.05;font-weight:1000;letter-spacing:-.035em;margin-top:5px}.ceSimpleDecision{border:1px solid rgba(66,216,155,.42);background:rgba(66,216,155,.08);color:#c8f8e1;border-radius:999px;padding:7px 10px;font-size:8px;font-weight:1000;white-space:nowrap}.ceSimpleDecision.no{border-color:rgba(242,188,86,.4);background:rgba(242,188,86,.07);color:#ffe3a7}.ceSimpleGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.ceSimpleStat{border:1px solid rgba(49,81,111,.8);border-radius:12px;padding:9px}.ceSimpleStat b{display:block;font-size:15px}.ceSimpleStat span{display:block;font-size:6.5px;color:var(--muted);margin-top:2px}.ceSimpleWhy{margin-top:11px;border-left:3px solid var(--b);padding:9px 10px;background:rgba(100,168,255,.06);border-radius:0 12px 12px 0;font-size:8px;line-height:1.55;color:#dce7f1}.ceSimpleWhy b{color:#fff}.ceSimpleToggle{margin-top:10px;border:1px solid var(--line2);background:#10263b;color:#eef7ff;border-radius:12px;min-height:38px;padding:0 12px;font-size:8px;font-weight:950;cursor:pointer}.ceSimpleMode>.ceGrid2,.ceSimpleMode>.ceStory{display:none}.ceSimpleMode.ceTechVisible>.ceGrid2{display:grid}.ceSimpleMode.ceTechVisible>.ceStory{display:block}.ceSimpleHint{font-size:6.7px;color:var(--muted);margin-top:7px;line-height:1.4}
.bottom .ceNavLabel{font-size:7.2px!important;letter-spacing:0!important}
#courtSureBetFixed{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(82px + env(safe-area-inset-bottom));z-index:9999;display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 15px;border-radius:999px;border:1px solid rgba(66,216,155,.65);background:linear-gradient(135deg,#123c32,#0a211c);color:#d9ffec;text-decoration:none;font-size:10px;font-weight:1000;letter-spacing:.04em;box-shadow:0 12px 34px rgba(0,0,0,.42)}
#courtSureBetFixed:active{transform:scale(.97)}
@media(max-width:560px){.ceSimpleWinner{font-size:19px}.ceSimpleStat b{font-size:13px}.ceSimpleSummary{padding:13px}#courtSureBetFixed{right:10px;bottom:calc(80px + env(safe-area-inset-bottom));min-height:44px;padding:0 13px}}
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
function run(){try{injectCss();simplifyStaticCopy();simplifyHero();enhanceIntel();ensureSureBet()}catch(err){console.error('Court simple UI:',err)}}
function init(){run();setInterval(run,1500);document.documentElement.dataset.courtSimpleUi=VERSION}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
