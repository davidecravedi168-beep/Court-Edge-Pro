(()=>{
'use strict';
const VERSION='COURT-SIMPLE-UI-1.0';
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const n=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const esc=s=>String(s??'—').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=v=>n(v)==null?'—':`${Math.round(n(v)*100)}%`;

function injectCss(){
 if(q('#courtSimpleCss'))return;
 const s=document.createElement('style');s.id='courtSimpleCss';s.textContent=`
.ceSimpleSummary{border:1px solid rgba(100,168,255,.32);background:linear-gradient(145deg,rgba(18,43,67,.98),rgba(8,20,32,.98));border-radius:22px;padding:15px;margin:0 0 10px;box-shadow:0 18px 48px rgba(0,0,0,.22)}
.ceSimpleTop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ceSimpleKicker{font-size:7px;letter-spacing:.14em;color:var(--c);font-weight:950}.ceSimpleWinner{font-size:22px;line-height:1.05;font-weight:1000;letter-spacing:-.035em;margin-top:5px}.ceSimpleDecision{border:1px solid rgba(66,216,155,.42);background:rgba(66,216,155,.08);color:#c8f8e1;border-radius:999px;padding:7px 10px;font-size:8px;font-weight:1000;white-space:nowrap}.ceSimpleDecision.no{border-color:rgba(242,188,86,.4);background:rgba(242,188,86,.07);color:#ffe3a7}.ceSimpleGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.ceSimpleStat{border:1px solid rgba(49,81,111,.8);border-radius:12px;padding:9px}.ceSimpleStat b{display:block;font-size:15px}.ceSimpleStat span{display:block;font-size:6.5px;color:var(--muted);margin-top:2px}.ceSimpleWhy{margin-top:11px;border-left:3px solid var(--b);padding:9px 10px;background:rgba(100,168,255,.06);border-radius:0 12px 12px 0;font-size:8px;line-height:1.55;color:#dce7f1}.ceSimpleWhy b{color:#fff}.ceSimpleActions{display:flex;gap:7px;margin-top:10px}.ceSimpleToggle{border:1px solid var(--line2);background:#10263b;color:#eef7ff;border-radius:12px;min-height:38px;padding:0 12px;font-size:8px;font-weight:950;cursor:pointer}.ceSimpleMode>.ceGrid2,.ceSimpleMode>.ceStory{display:none}.ceSimpleMode.ceTechVisible>.ceGrid2,.ceSimpleMode.ceTechVisible>.ceStory{display:grid}.ceSimpleMode.ceTechVisible>.ceStory{display:block}.ceSimpleHint{font-size:6.7px;color:var(--muted);margin-top:7px;line-height:1.4}
.bottom .ceNavLabel{font-size:7.2px!important;letter-spacing:0!important}.hero .edgeStrip{opacity:.78}.cePanelHead span{font-size:7px!important}.ceMetric span{font-size:6.5px!important}.cePlayer span{font-size:6.8px!important}
@media(max-width:560px){.ceSimpleWinner{font-size:19px}.ceSimpleGrid{grid-template-columns:repeat(3,1fr)}.ceSimpleStat b{font-size:13px}.ceSimpleSummary{padding:13px}}
`;
 document.head.appendChild(s);
}

function setText(sel,text){const el=q(sel);if(el)el.textContent=text}
function simplifyStaticCopy(){
 const navLabels=['Pronostici','Partite','Live','Risultati','Budget'];
 qa('.bottom button').forEach((b,i)=>{const label=q('.ceNavLabel',b);if(label)label.textContent=navLabels[i]||label.textContent;b.setAttribute('aria-label',navLabels[i]||'')});
 qa('.nav .chip').forEach(b=>{
   const p=b.dataset.page;
   const map={bets:'PRONOSTICI',markets:'QUOTE',live:'LIVE',track:'RISULTATI',bank:'BUDGET',model:'DETTAGLI PRO',desk:'GIOCATE',intel:'ANALISI PARTITA'};
   if(map[p])b.textContent=map[p];
 });
 const intelTitle=q('#intel .head h2');if(intelTitle)intelTitle.textContent='Analisi partita';
 const intelSub=q('#intel .head .sub');if(intelSub)intelSub.textContent='Forma recente, precedenti, giocatori chiave e confronto tra le squadre. Le informazioni tecniche restano disponibili sotto.';
 const map={
  '#bets .head h2':'Giocate migliori',
  '#markets .head h2':'Quote e mercati',
  '#live .head h2':'Partite live',
  '#track .head h2':'Risultati del modello',
  '#bank .head h2':'Gestione budget'
 };
 Object.entries(map).forEach(([s,t])=>setText(s,t));
 const metricLabels=['PROB. VITTORIA','VANTAGGIO PREVISTO','PUNTI TOTALI PREVISTI'];qa('.hero .metric span').forEach((x,i)=>{if(metricLabels[i])x.textContent=metricLabels[i]});
 const kpiLabels=['GIOCATE','PARTITE','QUOTE','LIVE','VERIFICATE','ERRORE MODELLO','INFORTUNI','STATO APP','AGGIORNATO'];qa('.kpis .kpi span').forEach((x,i)=>{if(kpiLabels[i])x.textContent=kpiLabels[i]});
}

function activeRow(){
 if(typeof D==='undefined'||!D||!Array.isArray(D.radar))return null;
 const id=q('.ceGameBtn.active')?.dataset.intelId;
 return D.radar.find(x=>String(x.event_id)===String(id))||D.radar[0]||null;
}
function decisionFor(row){
 if(!row||typeof D==='undefined'||!D)return {label:'NO BET',good:false,detail:'Nessuna quota supera i controlli richiesti.'};
 const direct=(D.best_bets||[]).find(x=>String(x.event_id)===String(row.event_id));
 if(direct&&direct.decision==='PAPER BET')return {label:'BET · TEST',good:true,detail:`${direct.selection} @ ${n(direct.locked_odds||direct.best_odds)?.toFixed(2)||'—'}`};
 if(direct&&direct.decision==='TEST VALUE')return {label:'SOLO TEST',good:false,detail:`${direct.selection} @ ${n(direct.locked_odds||direct.best_odds)?.toFixed(2)||'—'}`};
 const watch=row.prediction_summary?.watch_market;
 if(watch)return {label:'NO BET',good:false,detail:`Da monitorare ${watch.selection}; quota attuale ${n(watch.best_odds)?.toFixed(2)||'—'}, richiesta almeno ${n(watch.min_acceptable_odds)?.toFixed(2)||'—'}.`};
 return {label:'NO BET',good:false,detail:'Pronostico disponibile, ma non c’è una giocata approvata.'};
}
function confidenceLabel(row){
 const p=n(row?.projected_winner_prob),dq=n(row?.data_quality??row?.prediction_summary?.data_quality),avail=String(row?.availability_status||row?.prediction_summary?.availability_status||'').toUpperCase();
 if(p>=.68&&dq>=82&&!avail.includes('UNKNOWN'))return {text:'Alta',risk:'Medio-basso'};
 if(p>=.58&&dq>=70)return {text:'Media',risk:'Medio'};
 return {text:'Bassa',risk:'Alto'};
}
function simpleWhy(row){
 const I=row?.intelligence||{},r=I.matchup_radar||{},bits=[];
 const home=row.home_team,away=row.away_team;
 if(n(r.form_margin_edge)!=null&&Math.abs(n(r.form_margin_edge))>=1)bits.push(`${n(r.form_margin_edge)>=0?home:away} arriva in forma migliore.`);
 if(n(r.scoring_edge)!=null&&Math.abs(n(r.scoring_edge))>=1)bits.push(`${n(r.scoring_edge)>=0?home:away} sta segnando di più.`);
 if(n(r.defense_edge)!=null&&Math.abs(n(r.defense_edge))>=1)bits.push(`${n(r.defense_edge)>=0?home:away} sta concedendo meno agli avversari.`);
 if(n(r.rest_edge_days)!=null&&Math.abs(n(r.rest_edge_days))>=.5)bits.push(`${n(r.rest_edge_days)>0?home:away} arriva più riposata.`);
 if(I.h2h?.sample>=2)bits.push(`Ci sono ${I.h2h.sample} scontri diretti recenti verificati.`);
 if(!bits.length)bits.push('Le due squadre sono abbastanza vicine nei dati recenti: il vantaggio non è netto.');
 return bits.slice(0,3).join(' ');
}
function playerNote(row){
 const I=row?.intelligence||{},players=[...(I.top_players?.home||[]),...(I.top_players?.away||[])];
 if(players.length)return `Giocatori chiave: ${players.slice(0,2).map(p=>`${p.name} ${Math.round(n(p.pts,0))} pt`).join(' · ')}.`;
 const st=String(I.player_form_state||D?.meta?.player_form_health||'').toUpperCase();
 return st==='LEARNING'?'Dati dei giocatori chiave ancora in raccolta: non vengono inventati.':'';
}
function summaryHtml(row){
 const d=decisionFor(row),c=confidenceLabel(row),winner=row.projected_winner||row.prediction_summary?.winner_name||'—',prob=row.projected_winner_prob??row.prediction_summary?.winner_prob;
 return `<div class="ceSimpleTop"><div><div class="ceSimpleKicker">IN SINTESI</div><div class="ceSimpleWinner">Favorita: ${esc(winner)}</div></div><div class="ceSimpleDecision ${d.good?'':'no'}">${esc(d.label)}</div></div><div class="ceSimpleGrid"><div class="ceSimpleStat"><b>${esc(pct(prob))}</b><span>PROBABILITÀ</span></div><div class="ceSimpleStat"><b>${esc(c.text)}</b><span>AFFIDABILITÀ</span></div><div class="ceSimpleStat"><b>${esc(c.risk)}</b><span>RISCHIO SEGNALE</span></div></div><div class="ceSimpleWhy"><b>Perché:</b> ${esc(simpleWhy(row))}<br><b>Giocata:</b> ${esc(d.detail)}</div><div class="ceSimpleHint">${esc(playerNote(row))}</div><div class="ceSimpleActions"><button class="ceSimpleToggle" type="button">Vedi statistiche complete</button></div>`;
}
function simplifyIntelText(root){
 qa('.ceMetric span',root).forEach(x=>{const m={'LAST 5':'ULTIME 5','STREAK':'SERIE','PTS FOR':'PUNTI FATTI','PTS AGAINST':'PUNTI SUBITI','MARGIN 10':'MARGINE MEDIO','VOLATILITY':'VARIABILITÀ','HOME SPLIT':'IN CASA','AWAY SPLIT':'TRASFERTA','HOME VIEW':'CASA','AVG MARGIN':'MARGINE MEDIO','AVG TOTAL':'PUNTI MEDI','SAMPLE':'PARTITE'};if(m[x.textContent.trim()])x.textContent=m[x.textContent.trim()]});
 qa('.cePanelHead h3',root).forEach(h=>{h.textContent=h.textContent.replace('Matchup Radar','Confronto squadre').replace('Head-to-head','Scontri diretti').replace('top player form','Giocatori chiave')});
 qa('.cePanelHead span',root).forEach(s=>{s.textContent=s.textContent.replace('vantaggio relativo · casa positivo','barra = vantaggio relativo').replace('official boxscore rolling','ultime partite verificate')});
 qa('.cePlayer span',root).forEach(s=>{s.textContent=s.textContent.replaceAll('PTS','pt').replaceAll('REB','rimbalzi').replaceAll('AST','assist').replaceAll('MIN','min').replace('impact','impatto')});
 const story=q('.ceStory',root);if(story)story.innerHTML=story.innerHTML.replace('GAME STORY ·','IN PAROLE SEMPLICI ·');
 qa('.ceTeamHero .sub',root).forEach(s=>{s.textContent=s.textContent.replace(' win · ',' vittoria · ').replace(' L5',' ultime 5')});
 const vs=q('.ceVs',root);if(vs){vs.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&node.textContent.includes('PROJECTED'))node.textContent=node.textContent.replace('PROJECTED','PREVISIONE')})}
}
function enhanceIntel(){
 const root=q('#ceIntelDetail');const row=activeRow();if(!root||!row)return;
 const existing=q('.ceSimpleSummary',root);
 const key=String(row.event_id)+'|'+String(row.projected_winner_prob)+'|'+String((D?.best_bets||[]).length);
 if(existing?.dataset.key===key){simplifyIntelText(root);return}
 existing?.remove();
 root.classList.add('ceSimpleMode');root.classList.remove('ceTechVisible');
 const box=document.createElement('div');box.className='ceSimpleSummary';box.dataset.key=key;box.innerHTML=summaryHtml(row);root.prepend(box);
 q('.ceSimpleToggle',box).onclick=()=>{const show=root.classList.toggle('ceTechVisible');q('.ceSimpleToggle',box).textContent=show?'Nascondi statistiche':'Vedi statistiche complete'};
 simplifyIntelText(root);
}
function simplifyHero(){
 const v=q('#heroVerdict');if(v&&v.textContent==='PRONOSTICO')v.textContent='FAVORITA';
 const g=q('#heroGuard');if(g){g.innerHTML=g.innerHTML.replace('NESSUN INGRESSO','NO BET').replace('GIOCATA MIGLIORE','GIOCATA').replace('QUOTA MINIMA','QUOTA MINIMA CONSIGLIATA').replace('PRICE LAYER','QUOTE')}
 const grade=q('#heroGrade');if(grade)grade.textContent=grade.textContent.replace('SPORT CONF','AFFIDABILITÀ').replace('DQ','DATI');
 const age=q('#heroAge');if(age)age.textContent=age.textContent.replace('BOARD','AGGIORNATO');
}
function run(){injectCss();simplifyStaticCopy();simplifyHero();enhanceIntel()}
function init(){run();const mo=new MutationObserver(()=>queueMicrotask(run));mo.observe(document.body,{subtree:true,childList:true});setInterval(run,3000);document.documentElement.dataset.courtSimpleUi=VERSION}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
