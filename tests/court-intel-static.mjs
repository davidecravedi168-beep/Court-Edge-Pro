import fs from 'node:fs';

const ui=fs.readFileSync('court-intel.js','utf8');
const enrich=fs.readFileSync('scripts/enrich-court-intel.mjs','utf8');
const runner=fs.readFileSync('scripts/run-v4-budgeted.mjs','utf8');
const board=JSON.parse(fs.readFileSync('data/nba-v4-board.json','utf8'));

for(const marker of ['MATCHUP LAB','ceQuickIntel','ceLiveIntel','PLAYER FORM','GAME STORY','courtIntelCss']){
  if(!ui.includes(marker))throw new Error(`Court Intel UI marker missing: ${marker}`);
}
for(const marker of ['COURT-INTEL-1.0','BALLDONTLIE FREE GAMES','NBA OFFICIAL CDN LIVE','player_stats_no_fabrication','topPlayers']){
  if(!enrich.includes(marker))throw new Error(`Court Intel enrichment marker missing: ${marker}`);
}
if(!runner.includes('BDL_FREE_ONLY'))throw new Error('Free-only BDL guard missing');
if(!board.meta||!board.integrity||board.integrity.strict_no_fabrication!==true)throw new Error('Base fail-closed board contract missing');
if(board.meta.intelligence_version){
  if(board.meta.intelligence_version!=='COURT-INTEL-1.0')throw new Error('Unexpected intelligence version');
  for(const r of board.radar||[]){
    if(!r.intelligence||!r.intelligence.home||!r.intelligence.away||!r.intelligence.h2h||!r.intelligence.matchup_radar)throw new Error(`Incomplete matchup intelligence: ${r.event_id}`);
    if(!Array.isArray(r.intelligence.top_players?.home)||!Array.isArray(r.intelligence.top_players?.away))throw new Error(`Player-form contract incomplete: ${r.event_id}`);
  }
  if(board.integrity.player_stats_no_fabrication!==true)throw new Error('Player no-fabrication guard missing');
}
console.log('Court Intel static contract PASS');
