import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('match detail drawer exposes bettor statistics without fabricating data',()=>{
  const s=fs.readFileSync('match-details.js','utf8');
  for(const token of ['MATCH INTELLIGENCE','MODEL LEAN','PUNTI FATTI / G','PUNTI SUBITI / G','HOME MARGIN','TOTAL','AFFIDABILITÀ','BET ≥','Pronostico sportivo ≠ scommessa']) assert.ok(s.includes(token),`missing ${token}`);
  assert.ok(s.includes("D?.radar"));
  assert.ok(s.includes("D?.best_bets"));
  assert.ok(!/Math\.random\(/.test(s),'details UI must not fabricate random stats');
});

test('forecast and best bet cards are both interactive',()=>{
  const s=fs.readFileSync('match-details.js','utf8');
  assert.ok(s.includes("#forecastGrid .forecastCard"));
  assert.ok(s.includes("#bestGrid .betcard"));
  assert.ok(s.includes('STATISTICHE COMPLETE'));
  assert.ok(s.includes('MATCH INTELLIGENCE'));
});