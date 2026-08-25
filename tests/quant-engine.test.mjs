import test from 'node:test';import assert from 'node:assert/strict';import {devigTwoWay,expectedValue,robustProbability,gateDecision,brierScore,closingLineValue,analyzeMarket} from '../quant-engine.mjs';
test('devig sums to one',()=>{const x=devigTwoWay(1.91,1.91);assert.ok(Math.abs(x.a+x.b-1)<1e-12);assert.ok(x.overround>0)});
test('EV formula',()=>assert.ok(Math.abs(expectedValue(.60,1.80)-.08)<1e-12));
test('robust probability applies penalties',()=>assert.ok(robustProbability(.62,{uncertainty:.08,disagreement:.04,dataQuality:90,availabilityPenalty:.01})<.62));
test('availability gate can fail closed when required',()=>{const g=gateDecision({robustEV:.05,dataQuality:90,disagreement:.02,uncertainty:.02,marketBooks:5,oddsAgeMin:5,availabilityStatus:'UNKNOWN',requireAvailability:true});assert.equal(g.pass,false);assert.ok(g.reasons.includes('AVAILABILITY_UNKNOWN'))});
test('limited availability may continue with penalty when policy allows',()=>{const g=gateDecision({robustEV:.05,dataQuality:90,disagreement:.02,uncertainty:.02,marketBooks:5,oddsAgeMin:5,availabilityStatus:'LIMITED',requireAvailability:false});assert.equal(g.pass,true)});
test('brier known value',()=>assert.ok(Math.abs(brierScore([{prob:.8,outcome:1},{prob:.3,outcome:0}])-.065)<1e-12));
test('positive CLV',()=>assert.ok(closingLineValue(2.05,1.95)>0));
test('analysis bounded',()=>{const x=analyzeMarket({engineProbs:[.62,.60,.61],engineWeights:[1.2,1,1],oddsPick:1.82,oddsOther:2.06,uncertainty:.025,disagreement:.03,dataQuality:92,marketBooks:5,oddsAgeMin:10,availabilityStatus:'VERIFIED',requireAvailability:false,marketStability:90});assert.ok(x.modelProb>0&&x.modelProb<1);assert.ok(x.confidence>=0&&x.confidence<=100);assert.ok(['PAPER BET','WAIT'].includes(x.decision));assert.ok(x.stakeUnits<=.65)});
