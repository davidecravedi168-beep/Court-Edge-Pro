import fs from 'node:fs/promises';
import {runReceipt} from '../edge-core.mjs';

const files=['data/nba-quant-board.json','data/euroleague-quant-board.json'];
const boards=await Promise.all(files.map(async file=>JSON.parse(await fs.readFile(file,'utf8'))));
const receipt=runReceipt({app:'COURT_EDGE_PRO',event:process.env.GITHUB_EVENT_NAME||'local',schedule:process.env.GITHUB_EVENT_SCHEDULE||null,quotaMode:process.env.ODDS_MARKETS||'h2h',boards});
receipt.workflow_version='CEP-4.0-EDGE-CORE';
receipt.run_id=process.env.GITHUB_RUN_ID||null;
receipt.run_attempt=Number(process.env.GITHUB_RUN_ATTEMPT||1);
await fs.writeFile('data/automation-health.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
