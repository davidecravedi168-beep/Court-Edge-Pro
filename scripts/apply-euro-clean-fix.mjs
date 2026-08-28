import fs from 'node:fs/promises';

async function patchEngine(){
  const file='court-edge-v4.mjs';
  let s=await fs.readFile(file,'utf8');
  const oldEuro="async function euroGames(){if(COMMERCIAL_MODE&&!EUROLEAGUE_COMMERCIAL_LICENSED)return [];let out=[];for(const s of euroSeasonCodes()){try{const j=await fetchJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${s}/games`,{retries:1});out.push(...(j.data||j.games||[]).map(parseELGame).filter(x=>x.home&&x.away&&Number.isFinite(x.hs)&&Number.isFinite(x.as)))}catch(e){console.warn('EuroLeague',s,e.message)}}return out}";
  const newEuro="async function euroGames(){if(COMMERCIAL_MODE&&!EUROLEAGUE_COMMERCIAL_LICENSED)return [];let out=[];for(const s of euroSeasonCodes()){try{const j=await fetchJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${s}/games`,{retries:1});out.push(...(j.data||j.games||[]).map(parseELGame).filter(x=>{const t=Date.parse(x.date||'');return x.home&&x.away&&Number.isFinite(x.hs)&&Number.isFinite(x.as)&&x.hs>0&&x.as>0&&Number.isFinite(t)&&t<=Date.now()-3*3600000}))}catch(e){console.warn('EuroLeague',s,e.message)}}return out}";
  if(s.includes(oldEuro)) s=s.replace(oldEuro,newEuro);
  else if(!s.includes("t<=Date.now()-3*3600000")) throw new Error('Euro history target not found');

  const oldForecast="const hp=z.projected.mlProb,homeScore=(z.projected.projectedTotal+z.projected.projectedMargin)/2,awayScore=(z.projected.projectedTotal-z.projected.projectedMargin)/2;";
  const newForecast="const hp=z.projected.mlProb,forecastReady=z.projected.sample>=20&&z.projected.reliability>=.6,homeScore=(z.projected.projectedTotal+z.projected.projectedMargin)/2,awayScore=(z.projected.projectedTotal-z.projected.projectedMargin)/2;";
  if(s.includes(oldForecast)) s=s.replace(oldForecast,newForecast);
  else if(!s.includes('forecastReady=z.projected.sample>=20')) throw new Error('Forecast readiness target not found');

  const oldOut="home_win_prob:round(hp,4),projected_winner:hp>=.5?ev.home_team:ev.away_team,projected_winner_prob:round(hp>=.5?hp:1-hp,4),model_sample:z.projected.sample,reliability:round(z.projected.reliability,4)";
  const newOut="home_win_prob:forecastReady?round(hp,4):null,forecast_state:forecastReady?'READY':'THIN',projected_winner:forecastReady?(hp>=.5?ev.home_team:ev.away_team):null,projected_winner_prob:forecastReady?round(hp>=.5?hp:1-hp,4):null,model_sample:z.projected.sample,reliability:round(z.projected.reliability,4)";
  if(s.includes(oldOut)) s=s.replace(oldOut,newOut);
  else if(!s.includes("forecast_state:forecastReady?'READY':'THIN'")) throw new Error('Forecast output target not found');
  await fs.writeFile(file,s);
}

async function patchIndex(){
  const file='index.html';
  let s=await fs.readFile(file,'utf8');
  s=s.replace('.kpis{display:grid;grid-template-columns:repeat(8,1fr);', '.kpis{display:grid;grid-template-columns:repeat(9,1fr);');
  s=s.replace('.kpis{overflow:auto;grid-template-columns:repeat(8,105px)}', '.kpis{overflow:auto;grid-template-columns:repeat(9,105px)}');
  s=s.replace("<div class=\"forecastPick\">MODEL LEAN · ${esc(x.projected_winner)}</div>","<div class=\"forecastPick\">${x.forecast_state==='THIN'?'DATI INSUFFICIENTI':'MODEL LEAN · '+esc(x.projected_winner)}</div>");
  s=s.replace("⚠ Pronostico modello anticipato. Senza quota fresca e confronto col mercato resta RESEARCH / NO BET.","${x.forecast_state==='THIN'?'⚠ Campione insufficiente: nessun pronostico viene emesso.':'⚠ Pronostico modello anticipato. Senza quota fresca e confronto col mercato resta RESEARCH / NO BET.'}");
  await fs.writeFile(file,s);
}

await patchEngine();
await patchIndex();
console.log('EuroLeague clean history + THIN forecast guard applied');
