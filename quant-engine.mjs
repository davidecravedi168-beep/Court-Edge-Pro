export const VERSION='CEP-3.2.0';
export const DEFAULT_GATES={
  minRobustEV:.022,
  minDQ:72,
  maxDisagreement:.085,
  maxChallengerGap:.070,
  maxUncertainty:.095,
  minBooks:3,
  maxOddsAgeMin:60,
  minSample:12,
  maxModelMarketGap:.20,
  maxRobustEV:.30,
  maxRawEV:.50,
  maxStake:.50,
  maxExposure:2.50
};
export function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
export function logistic(x){return 1/(1+Math.exp(-x))}
export function logit(p){p=clamp(p,1e-9,1-1e-9);return Math.log(p/(1-p))}
export function blendProbabilities(parts,weights){if(!parts.length)throw new Error('parts required');const ws=weights?.length===parts.length?weights:parts.map(()=>1);const z=parts.reduce((s,p,i)=>s+logit(clamp(p))*ws[i],0)/ws.reduce((a,b)=>a+b,0);return clamp(logistic(z),.02,.98)}
export function devigTwoWay(oddsA,oddsB){if(!(oddsA>1&&oddsB>1))throw new Error('decimal odds > 1 required');const a=1/oddsA,b=1/oddsB,t=a+b;return {a:a/t,b:b/t,overround:t-1}}
export function expectedValue(prob,odds){return prob*odds-1}
export function robustProbability(prob,{uncertainty=0,disagreement=0,dataQuality=100,availabilityPenalty=0,sampleSize=50}={}){
  const dqPenalty=(100-clamp(dataQuality,0,100))/100*.075;
  const samplePenalty=sampleSize>=20?0:clamp((20-sampleSize)/20,0,1)*.028;
  const penalty=clamp(uncertainty,0,.3)*.46+clamp(disagreement,0,.3)*.32+dqPenalty+clamp(availabilityPenalty,0,.08)+samplePenalty;
  return clamp(prob-penalty,.02,.98)
}
export function kellyFraction(prob,odds){if(!(odds>1))return 0;const b=odds-1,q=1-prob;return Math.max(0,(b*prob-q)/b)}
export function stakeUnits({prob,odds,confidence=70,bankrollUnits=100,maxStake=.50}){const k=kellyFraction(prob,odds);const scaled=k*.16*clamp(confidence/100,.35,1);return Math.min(maxStake,Math.max(0,scaled*bankrollUnits/100))}
export function opportunityScore({robustEV=0,confidence=0,dataQuality=0,marketStability=0}){return clamp((clamp(robustEV/.10)*.34+clamp(confidence/100)*.28+clamp(dataQuality/100)*.20+clamp(marketStability/100)*.18)*100,0,100)}
export function gateDecision(x,g=DEFAULT_GATES){
  const reasons=[];
  if(x.robustEV<g.minRobustEV)reasons.push('ROBUST_EV');
  if(x.dataQuality<g.minDQ)reasons.push('DATA_QUALITY');
  if(x.disagreement>g.maxDisagreement)reasons.push('MODEL_DISAGREEMENT');
  if(Number.isFinite(x.challengerGap)&&x.challengerGap>g.maxChallengerGap)reasons.push('CHALLENGER_GAP');
  if(x.uncertainty>g.maxUncertainty)reasons.push('UNCERTAINTY');
  if(x.marketBooks<g.minBooks)reasons.push('MARKET_DEPTH');
  if(x.oddsAgeMin>g.maxOddsAgeMin)reasons.push('STALE_ODDS');
  if(Number.isFinite(x.sampleSize)&&x.sampleSize<g.minSample)reasons.push('MODEL_SAMPLE');
  if(Number.isFinite(x.modelMarketGap)&&x.modelMarketGap>g.maxModelMarketGap)reasons.push('MODEL_MARKET_GAP');
  if(x.robustEV>g.maxRobustEV||x.rawEV>g.maxRawEV)reasons.push('EV_ANOMALY');
  if(x.marketIntegrity===false)reasons.push('MARKET_INTEGRITY');
  if(x.requireAvailability&&x.availabilityStatus!=='VERIFIED')reasons.push(x.availabilityStatus==='UNKNOWN'?'AVAILABILITY_UNKNOWN':'AVAILABILITY_UNVERIFIED');
  return {pass:reasons.length===0,reasons}
}
export function brierScore(rows){if(!rows.length)return null;return rows.reduce((s,r)=>s+(r.prob-(r.outcome?1:0))**2,0)/rows.length}
export function logLoss(rows){if(!rows.length)return null;return -rows.reduce((s,r)=>{const p=clamp(r.prob,1e-9,1-1e-9);return s+(r.outcome?Math.log(p):Math.log(1-p))},0)/rows.length}
export function closingLineValue(lockOdds,closeOdds){if(!(lockOdds>1&&closeOdds>1))return null;return lockOdds/closeOdds-1}
export function analyzeMarket(input,g=DEFAULT_GATES){
  const modelProb=blendProbabilities(input.engineProbs,input.engineWeights);
  const fallbackMarket=devigTwoWay(input.oddsPick,input.oddsOther);
  const marketProb=Number.isFinite(input.marketProb)?clamp(input.marketProb,.02,.98):fallbackMarket.a;
  const overround=Number.isFinite(input.overround)?input.overround:fallbackMarket.overround;
  const conservativeProb=robustProbability(modelProb,{uncertainty:input.uncertainty,disagreement:input.disagreement,dataQuality:input.dataQuality,availabilityPenalty:input.availabilityPenalty||0,sampleSize:input.sampleSize});
  const rawEV=expectedValue(modelProb,input.oddsPick),robustEV=expectedValue(conservativeProb,input.oddsPick),modelMarketGap=Math.abs(conservativeProb-marketProb);
  const marketIntegrity=Number.isFinite(overround)&&overround>-0.02&&overround<.18&&marketProb>.02&&marketProb<.98;
  const gate=gateDecision({robustEV,rawEV,dataQuality:input.dataQuality,disagreement:input.disagreement,challengerGap:input.challengerGap,uncertainty:input.uncertainty,marketBooks:input.marketBooks,oddsAgeMin:input.oddsAgeMin,availabilityStatus:input.availabilityStatus,requireAvailability:input.requireAvailability,sampleSize:input.sampleSize,modelMarketGap,marketIntegrity},g);
  const confidence=clamp((1-input.uncertainty)*100-input.disagreement*58-(input.challengerGap||0)*42-(100-input.dataQuality)*.13-(input.availabilityPenalty||0)*125-Math.max(0,modelMarketGap-.08)*55,0,100);
  return {modelProb,marketProb,overround,conservativeProb,rawEV,robustEV,edge:conservativeProb-marketProb,modelMarketGap,challengerGap:input.challengerGap??null,confidence,decision:gate.pass?'PAPER BET':'WAIT',gateReasons:gate.reasons,stakeUnits:gate.pass?stakeUnits({prob:conservativeProb,odds:input.oddsPick,confidence,maxStake:g.maxStake}):0,opportunity:opportunityScore({robustEV,confidence,dataQuality:input.dataQuality,marketStability:input.marketStability})}
}
