import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V4.3 match details exposes a direct global opener and bettor stats',()=>{
  const js=fs.readFileSync('match-details-v43.js','utf8');
  for(const token of ['window.CourtEdgeDetails={ready:true,openById,close,decorate}','MATCH INTELLIGENCE','PUNTI FATTI / G','PUNTI SUBITI / G','TOTAL PROIETTATO','AFFIDABILITÀ','BET ≥']) assert.ok(js.includes(token),`missing ${token}`);
  assert.ok(!/Math\.random\(/.test(js),'match details cannot fabricate stats');
});

test('rendered cards have explicit tap wiring',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.includes('data-ce-kind="forecast"'));
  assert.ok(html.includes('data-ce-kind="bet"'));
  assert.ok(html.includes("CourtEdgeDetails?.openById('forecast'"));
  assert.ok(html.includes("CourtEdgeDetails?.openById('bet'"));
  assert.ok(html.includes('match-details-v43.js?v=4.3'));
});
