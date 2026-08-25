import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const legal=fs.readFileSync(new URL('../legal.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
for(const id of ['desk','slate','radar','lab','pro','nbaTab','elTab','heroVerdict','slotGrid','gameGrid','auditList','kReview'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/euroleague-quant-board\.json/);assert.match(html,/nba-quant-board\.json/);assert.match(html,/COURT EDGE PRO/);assert.match(html,/v3\.2/);assert.match(html,/36h Prediction Lock/);assert.match(html,/Portfolio Guard/);assert.match(html,/Challenger Shadow/);assert.match(html,/Content-Security-Policy/);assert.match(html,/legal\.html/);assert.match(legal,/Commercializzazione futura/);assert.match(legal,/maggiorenni/);assert.equal(manifest.display,'standalone');assert.match(sw,/court-edge-pro-v3-2/);assert.match(sw,/e\.request\.mode==='navigate'/);
for(const f of ['nba-quant-board.json','euroleague-quant-board.json']){const j=JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));assert.equal(j.integrity.strict_no_fabrication,true);assert.equal(j.integrity.portfolio_cap_enforced,true);assert.equal(j.integrity.challenger_shadow,true);assert.match(j.meta.model_version,/CEP-3\.2\.0/)}
console.log('static-check: PASS');
