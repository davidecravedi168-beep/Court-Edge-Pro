import fs from 'node:fs/promises';
const file='index.html';
let s=await fs.readFile(file,'utf8');
if(s.includes('id="matchModal"')){console.log('already patched');process.exit(0)}

const css=`
.forecastCard,.betcard{cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.forecastCard:hover,.betcard:hover{transform:translateY(-2px);border-color:#47759c;box-shadow:0 12px 28px rgba(0,0,0,.18)}.forecastCard:active,.betcard:active{transform:scale(.995)}
.modal{position:fixed;inset:0;z-index:100;display:none;background:rgba(2,7,12,.78);backdrop-filter:blur(10px);padding:18px;overflow:auto}.modal.open{display:block}.modalPanel{width:min(900px,100%);margin:20px auto 90px;background:#091522;border:1px solid #31516f;border-radius:24px;padding:16px;box-shadow:0 30px 90px rgba(0,0,0,.45)}.modalTop{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.modalClose{border:1px solid var(--line);background:var(--p2);color:#fff;border-radius:999px;width:40px;height:40px;font-size:18px}.detailHero{margin-top:12px;border:1px solid var(--line);background:linear-gradient(135deg,#102a43,#091725);border-radius:18px;padding:14px}.detailGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.detailTeamGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.detailTeam{border:1px solid var(--line);border-radius:16px;padding:12px;background:rgba(16,34,55,.68)}.detailTeam h3{margin:0 0 8px;font-size:13px}.detailRows{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.detailRow{border:1px solid var(--line);border-radius:10px;padding:8px}.detailRow b{display:block;font-size:11px}.detailRow span{display:block;color:var(--muted);font-size:6.5px;margin-top:2px}.marketMini{display:grid;gap:6px;margin-top:10px}.marketMiniItem{border:1px solid var(--line);border-radius:12px;padding:9px;display:grid;grid-template-columns:1.3fr repeat(4,.7fr);gap:6px;align-items:center}.marketMiniItem b{font-size:8px}.marketMiniItem span{font-size:6.5px;color:var(--muted)}
@media(max-width:560px){.modal{padding:8px}.modalPanel{margin:8px auto 85px;border-radius:18px;padding:12px}.detailGrid{grid-template-columns:repeat(2,1fr)}.detailTeamGrid{grid-template-columns:1fr}.marketMiniItem{grid-template-columns:1.35fr .8fr .8fr}.marketMiniItem .deskHide{display:none}}
`;
s=s.replace('</style>',css+'\n</style>');

const modal=`
<div id="matchModal" class="modal" onclick="if(event.target===this)closeMatchDetails()"><div class="modalPanel"><div class="modalTop"><div><div class="eyebrow">MATCH INTELLIGENCE</div><h2 id="mdTitle" style="margin:6px 0 0">—</h2><div id="mdWhen" class="sub">—</div></div><button class="modalClose" onclick="closeMatchDetails()" aria-label="Chiudi">×</button></div><div id="mdBody"></div></div></div>
`;
s=s.replace('<nav class="bottom">',modal+'\n<nav class="bottom">');

// Make forecast and best-bet cards clickable.
s=s.replace('<article class="forecastCard"><div class="forecastTag">', '<article class="forecastCard" role="button" tabindex="0" onclick="openMatchDetails(\'${x.event_id}\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openMatchDetails(\'${x.event_id}\')}" aria-label="Apri statistiche ${x.away_team} contro ${x.home_team}"><div class="forecastTag">');
s=s.replace('<article class="betcard ${x.decision===\'TEST VALUE\'?\'test\':\'\'}">', '<article class="betcard ${x.decision===\'TEST VALUE\'?\'test\':\'\'}" role="button" tabindex="0" onclick="openMatchDetails(\'${x.event_id}\')" aria-label="Apri dossier ${x.away_team} contro ${x.home_team}">');

const fn=`
function fmtDate(ts){try{return new Date(ts).toLocaleString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return '—'}}
function n1(x){return Number.isFinite(+x)?(+x).toFixed(1):'—'}
function statBox(v,l){return '<div class="detailRow"><b>'+esc(v)+'</b><span>'+esc(l)+'</span></div>'}
function teamDetail(name,t={}){return '<div class="detailTeam"><h3>'+esc(name)+'</h3><div class="detailRows">'+statBox(t.elo??'—','ELO')+statBox(t.games??'—','PARTITE MODELLO')+statBox(t.avg_pf??'—','PUNTI FATTI AVG')+statBox(t.avg_pa??'—','PUNTI SUBITI AVG')+statBox(t.recent_margin??'—','MARGINE FORMA')+statBox(t.recent_total??'—','TOTALE RECENTE')+statBox(t.last_game?fmtDate(t.last_game):'—','ULTIMA PARTITA')+'</div></div>'}
function openMatchDetails(eventId){
  const r=(D?.radar||[]).find(x=>String(x.event_id)===String(eventId));
  const ms=(D?.markets||[]).filter(x=>String(x.event_id)===String(eventId)).sort((a,b)=>(b.opportunity||0)-(a.opportunity||0));
  const bb=(D?.best_bets||[]).find(x=>String(x.event_id)===String(eventId));
  const x=r||bb||ms[0]; if(!x)return;
  $('mdTitle').textContent=(x.away_team||'—')+' @ '+(x.home_team||'—'); $('mdWhen').textContent=fmtDate(x.start_at)+' · '+(r?.status||bb?.decision||'MATCH');
  const home=r?.team_stats?.home||{},away=r?.team_stats?.away||{};
  const p=r?.projected_winner_prob, pred=r?.projected_winner||'—';
  const score=Number.isFinite(r?.projected_away_score)&&Number.isFinite(r?.projected_home_score)?n1(r.projected_away_score)+' – '+n1(r.projected_home_score):'—';
  const marketHtml=ms.length?'<div style="margin-top:14px"><h3 style="margin:0 0 7px">Mercati & prezzo</h3><div class="marketMini">'+ms.slice(0,12).map(m=>'<div class="marketMiniItem"><div><b>'+esc(m.selection)+'</b><br><span>'+esc(m.market_label)+' · '+esc(m.best_book||'—')+'</span></div><div><b>'+odds(m.best_odds)+'</b><br><span>QUOTA</span></div><div><b>'+odds(m.price_to_bet)+'</b><br><span>BET ≥</span></div><div class="deskHide"><b>'+sign(m.robust_ev)+'</b><br><span>EV</span></div><div class="deskHide"><b>'+pct(m.robust_prob)+'</b><br><span>MODEL</span></div></div>').join('')+'</div></div>':'<div class="forecastNote" style="margin-top:14px">Mercati non ancora nella Prediction Lock: il pronostico sportivo è visibile, ma non viene trasformato in una giocata.</div>';
  const injury='<div class="forecastNote">Disponibilità roster: '+esc(D?.meta?.injury_health||'—')+' · '+(r?.injuries?.home||r?.injuries?.away?'segnalazioni disponibili':'nessun impatto affidabile applicato')+'.</div>';
  $('mdBody').innerHTML='<div class="detailHero"><div class="forecastTag">MODEL FORECAST · NON È UNA GARANZIA</div><div class="forecastPick">'+esc(pred)+'</div><div class="forecastScore">'+esc(score)+'</div><div class="detailGrid">'+statBox(Number.isFinite(p)?pct(p):'—','WIN PROB LEAN')+statBox(Number.isFinite(r?.projected_margin)?(r.projected_margin>=0?'+':'')+n1(r.projected_margin):'—','HOME MARGIN')+statBox(n1(r?.projected_total),'TOTAL PROIETTATO')+statBox(r?.model_sample??'—','SAMPLE')+statBox(Number.isFinite(r?.reliability)?pct(r.reliability):'—','AFFIDABILITÀ MODELLO')+statBox(n1(r?.margin_sigma),'MARGIN UNCERTAINTY')+statBox(n1(r?.total_sigma),'TOTAL UNCERTAINTY')+statBox(r?.rest?Math.round(r.rest.away)+'g / '+Math.round(r.rest.home)+'g':'—','REST AWAY / HOME')+'</div></div><div class="detailTeamGrid">'+teamDetail(x.away_team,away)+teamDetail(x.home_team,home)+'</div>'+marketHtml+injury;
  $('matchModal').classList.add('open'); document.body.style.overflow='hidden';
}
function closeMatchDetails(){$('matchModal')?.classList.remove('open');document.body.style.overflow=''}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMatchDetails()});
`;
s=s.replace('function renderHero(){',fn+'\nfunction renderHero(){');

await fs.writeFile(file,s);
console.log('match detail dossier applied');
