import fs from 'node:fs/promises';

const index='index.html';
let html=await fs.readFile(index,'utf8');
if(!html.includes('match-details.js')){
  if(!html.includes('</body>')) throw new Error('index closing body not found');
  html=html.replace('</body>','<script src="match-details.js?v=4.2"></script>\n</body>');
  await fs.writeFile(index,html);
}

const swFile='sw.js';
let sw=await fs.readFile(swFile,'utf8');
sw=sw.replace(/const CACHE='court-edge-pro-v4-[^']+';/,"const CACHE='court-edge-pro-v4-2-0';");
if(!sw.includes("'./match-details.js'")){
  sw=sw.replace("'./betting-ux.js'","'./betting-ux.js','./match-details.js'");
}
await fs.writeFile(swFile,sw);

console.log('match details installed');