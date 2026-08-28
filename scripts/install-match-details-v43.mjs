import fs from 'node:fs/promises';

const index='index.html';
let s=await fs.readFile(index,'utf8');

s=s.replace('<script src="match-details.js?v=4.2"></script>','<script src="match-details-v43.js?v=4.3"></script>');

const oldBet='<article class="betcard ${x.decision===\'TEST VALUE\'?\'test\':\'\'}">';
const newBet='<article class="betcard ${x.decision===\'TEST VALUE\'?\'test\':\'\'}" data-ce-event-id="${esc(x.event_id)}" data-ce-kind="bet" onclick="window.CourtEdgeDetails?.openById(\'bet\',this.dataset.ceEventId)">';
if(s.includes(oldBet)) s=s.replace(oldBet,newBet);
else if(!s.includes('data-ce-kind="bet"')) throw new Error('bet card target missing');

const oldForecast='<article class="forecastCard"><div class="forecastTag">';
const newForecast='<article class="forecastCard" data-ce-event-id="${esc(x.event_id)}" data-ce-kind="forecast" onclick="window.CourtEdgeDetails?.openById(\'forecast\',this.dataset.ceEventId)"><div class="forecastTag">';
if(s.includes(oldForecast)) s=s.replace(oldForecast,newForecast);
else if(!s.includes('data-ce-kind="forecast"')) throw new Error('forecast card target missing');

await fs.writeFile(index,s);

const swFile='sw.js';
let sw=await fs.readFile(swFile,'utf8');
sw=sw.replace(/const CACHE='court-edge-pro-v4-[^']+';/,"const CACHE='court-edge-pro-v4-3-0';");
sw=sw.replace("'./match-details.js'","'./match-details-v43.js'");
if(!sw.includes("'./match-details-v43.js'")){
  sw=sw.replace("'./betting-ux.js'","'./betting-ux.js','./match-details-v43.js'");
}
await fs.writeFile(swFile,sw);
console.log('V4.3 explicit card opener installed');
