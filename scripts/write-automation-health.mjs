import fs from 'node:fs/promises';
import {runReceipt} from '../edge-core.mjs';

// The public terminal always serves the V4 board contract. Branding/governance
// profile names (for example V6-GOVERNED) must never switch the health receipt
// to legacy quant-board files, otherwise GitHub Actions can be green while the
// user-facing board has a different freshness timestamp.
const profile=String(process.env.COURT_BOARD_PROFILE||'V4').toUpperCase();
const files=['data/nba-v4-board.json','data/euroleague-v4-board.json'];
const boards=await Promise.all(files.map(async file=>JSON.parse(await fs.readFile(file,'utf8'))));
const receipt=runReceipt({
  app:'COURT_EDGE_PRO',
  event:process.env.GITHUB_EVENT_NAME||'local',
  schedule:process.env.GITHUB_EVENT_SCHEDULE||null,
  quotaMode:process.env.ODDS_MARKETS||'h2h',
  boards
});
receipt.workflow_version='CEP-4.0-BETTING-TERMINAL-EDGE-CORE';
receipt.board_profile=profile;
receipt.certified_files=files;
receipt.public_board_contract='V4';
receipt.run_id=process.env.GITHUB_RUN_ID||null;
receipt.run_attempt=Number(process.env.GITHUB_RUN_ATTEMPT||1);
await fs.writeFile('data/automation-health.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
