import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
for(const id of ['desk','slate','radar','lab','pro','nbaTab','elTab','heroVerdict','slotGrid','gameGrid'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/euroleague-quant-board\.json/);assert.match(html,/nba-quant-board\.json/);assert.match(html,/COURT EDGE PRO/);assert.equal(manifest.display,'standalone');
for(const f of ['nba-quant-board.json','euroleague-quant-board.json']){const j=JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));assert.equal(j.integrity.strict_no_fabrication,true);assert.ok(j.meta.model_version)}
console.log('static-check: PASS');
