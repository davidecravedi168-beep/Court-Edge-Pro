import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFreshness,assertPublicBoard,runReceipt,EDGE_CORE_VERSION} from '../edge-core.mjs';

const board={meta:{league:'NBA',updated_at:new Date().toISOString()},integrity:{strict_no_fabrication:true},radar:[],upcoming:[],history:[]};
test('edge core validates a fail-closed public board',()=>assert.equal(assertPublicBoard(board),true));
test('edge core rejects secret-like public content',()=>assert.throws(()=>assertPublicBoard({...board,note:'Bearer abcdefghijklmnop'}),/secret-like/));
test('freshness fails closed without a timestamp',()=>assert.deepEqual(assessFreshness(null),{state:'NO_TIMESTAMP',age_minutes:null,operational:false}));
test('run receipt is auditable and contains no secret',()=>{const r=runReceipt({app:'COURT',boards:[board]});assert.equal(r.ok,true);assert.equal(r.edge_core_version,EDGE_CORE_VERSION);assert.match(r.artifact_digest,/^[a-f0-9]{16}$/)});
