import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFreshness,assertPublicBoard,runReceipt,EDGE_CORE_VERSION,boardCollections} from '../edge-core.mjs';

const legacy={meta:{league:'NBA',updated_at:new Date().toISOString()},integrity:{strict_no_fabrication:true},radar:[],upcoming:[],history:[]};
const v4={meta:{league:'NBA',updated_at:new Date().toISOString()},integrity:{strict_no_fabrication:true},radar:[],best_bets:[],markets:[],history:[]};

test('edge core validates a fail-closed legacy public board',()=>assert.equal(assertPublicBoard(legacy),true));
test('edge core validates a fail-closed Betting Terminal board',()=>assert.equal(assertPublicBoard(v4),true));
test('edge core normalizes decision collections across board contracts',()=>{
  assert.equal(boardCollections(legacy).decisions,legacy.upcoming);
  assert.equal(boardCollections(v4).decisions,v4.best_bets);
});
test('edge core rejects malformed V4 markets',()=>assert.throws(()=>assertPublicBoard({...v4,markets:{}}),/market collection/));
test('edge core rejects secret-like public content',()=>assert.throws(()=>assertPublicBoard({...legacy,note:'Bearer abcdefghijklmnop'}),/secret-like/));
test('freshness fails closed without a timestamp',()=>assert.deepEqual(assessFreshness(null),{state:'NO_TIMESTAMP',age_minutes:null,operational:false}));
test('run receipt is auditable for V4 and contains market count',()=>{const r=runReceipt({app:'COURT',boards:[v4]});assert.equal(r.ok,true);assert.equal(r.edge_core_version,EDGE_CORE_VERSION);assert.equal(r.boards[0].markets,0);assert.match(r.artifact_digest,/^[a-f0-9]{16}$/)});
