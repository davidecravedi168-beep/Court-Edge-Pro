import fs from 'node:fs';

const MODEL='data/court-calibration-model-v8.json';
const clamp=(x,a=.02,b=.98)=>Math.max(a,Math.min(b,x));
const sigmoid=x=>1/(1+Math.exp(-x));
const logit=p=>Math.log(p/(1-p));

export function activeCourtCalibration(){
  try{
    const m=JSON.parse(fs.readFileSync(MODEL,'utf8'));
    if(m?.schema==='COURT-CALIBRATION-MODEL-V8'&&m?.status==='ACTIVE'&&Number.isFinite(m?.params?.a)&&Number.isFinite(m?.params?.b)) return m;
  }catch{}
  return null;
}
export function calibrateCourtProb(raw,{league='UNKNOWN'}={}){
  const p=Number(raw);
  if(!(p>0&&p<1)) return null;
  const m=activeCourtCalibration();
  if(!m) return clamp(p);
  let z=m.params.a*logit(clamp(p,.01,.99))+m.params.b;
  const lg=String(league||'UNKNOWN').toUpperCase();
  if(lg==='NBA') z+=Number(m.params.nba_bias||0);
  if(lg==='EUROLEAGUE') z+=Number(m.params.euro_bias||0);
  return clamp(sigmoid(z));
}
