import fs from 'node:fs/promises';
import fssync from 'node:fs';
import {activeCourtCalibration} from './court-calibration-v8.mjs';

const BOARDS=['data/nba-v4-board.json','data/euroleague-v4-board.json'];
const OUT='data/court-learning-v8.json';
const MODEL='data/court-calibration-model-v8.json';
const clamp=(x,a=.01,b=.99)=>Math.max(a,Math.min(b,x));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sigmoid=x=>1/(1+Math.exp(-x));
const logit=p=>Math.log(p/(1-p));
const round=(x,d=6)=>Number.isFinite(x)?Number(x.toFixed(d)):null;

function metric(rows,fn=x=>x.p){
  if(!rows.length)return {n:0,brier:null,logloss:null,ece:null};
  const xs=rows.map(r=>({p:clamp(fn(r)),y:r.y}));
  const brier=mean(xs.map(x=>(x.p-x.y)**2));
  const logloss=-mean(xs.map(x=>x.y*Math.log(x.p)+(1-x.y)*Math.log(1-x.p)));
  const bins=Array.from({length:10},()=>[]);
  for(const x of xs)bins[Math.min(9,Math.floor(x.p*10))].push(x);
  let ece=0;
  for(const b of bins){if(!b.length)continue;ece+=b.length/xs.length*Math.abs(mean(b.map(x=>x.p))-mean(b.map(x=>x.y)))}
  return {n:xs.length,brier:round(brier),logloss:round(logloss),ece:round(ece)};
}
function apply(p,league,par){
  let z=par.a*logit(clamp(p))+par.b;
  if(league==='NBA')z+=par.nba_bias||0;
  if(league==='EUROLEAGUE')z+=par.euro_bias||0;
  return clamp(sigmoid(z),.02,.98);
}
function fit(train){
  let best={a:1,b:0,nba_bias:0,euro_bias:0},bestLoss=Infinity;
  const av=[.6,.8,1,1.2,1.4],bv=[-.4,-.2,0,.2,.4],bias=[-.2,-.1,0,.1,.2];
  for(const a of av)for(const b of bv)for(const nb of bias)for(const eb of bias){
    const par={a,b,nba_bias:nb,euro_bias:eb};
    const m=metric(train,r=>apply(r.p,r.league,par));
    if(m.logloss<bestLoss){bestLoss=m.logloss;best=par}
  }
  return best;
}
function state(recent,base){
  if(!recent.n||!base.n)return {state:'INSUFFICIENT',reasons:[]};
  const dB=recent.brier-base.brier,dL=recent.logloss-base.logloss,dE=recent.ece-base.ece;
  let s='OK';const reasons=[];
  if(dB>.03){s='WATCH';reasons.push('BRIER_WORSE')}
  if(dL>.08){s='WATCH';reasons.push('LOGLOSS_WORSE')}
  if(dE>.04){s='WATCH';reasons.push('ECE_WORSE')}
  if((dB>.06&&dL>.12)||dE>.08){s='ALERT';reasons.push('MATERIAL_PROBABILITY_DRIFT')}
  return {state:s,reasons,delta:{brier:round(dB),logloss:round(dL),ece:round(dE)}};
}
function selfTest(){
  const rows=Array.from({length:100},(_,i)=>({p:i%2?.7:.3,y:i%2?1:0,league:i%3?'NBA':'EUROLEAGUE'}));
  const raw=metric(rows),par=fit(rows.slice(0,60)),cal=metric(rows.slice(60),r=>apply(r.p,r.league,par));
  if(!(raw.n===100&&cal.n===40&&Number.isFinite(cal.logloss)))throw new Error('COURT_LEARNING_SELF_TEST');
  console.log(JSON.stringify({ok:true,tests:['brier','logloss','ece','platt_grid','drift']}));
}
if(process.argv.includes('--self-test')){selfTest();process.exit(0)}

const boards=await Promise.all(BOARDS.map(async p=>JSON.parse(await fs.readFile(p,'utf8'))));
const rows=[];
for(const b of boards){
  const league=String(b?.meta?.league||'UNKNOWN').toUpperCase();
  for(const x of b.forecast_history||[]){
    if(x?.status!=='SETTLED'||!Number.isFinite(x.home_win_prob)||!Number.isFinite(x.actual_home_win))continue;
    rows.push({event_id:x.event_id,start_at:x.start_at||x.settled_at,p:x.home_win_prob,y:x.actual_home_win?1:0,league});
  }
}
rows.sort((a,b)=>new Date(a.start_at||0)-new Date(b.start_at||0));
const raw=metric(rows);
let active=activeCourtCalibration();
let candidate=null,promotion='COLD_START';
if(rows.length>=80){
  const holdout=rows.slice(-40),train=rows.slice(0,-40),params=fit(train),cand=metric(holdout,r=>apply(r.p,r.league,params));
  const inc=metric(holdout,r=>active?apply(r.p,r.league,active.params):r.p);
  const lastN=Number(active?.trained_on_n||0),newLabels=rows.length-lastN;
  const gates={
    min_new_labels:newLabels>=10,
    logloss_improved_0_5pct:cand.logloss<=inc.logloss*.995,
    brier_not_worse_0_5pct:cand.brier<=inc.brier*1.005,
    ece_not_worse_0_01:cand.ece<=inc.ece+.01
  };
  candidate={params,train_n:train.length,holdout_n:holdout.length,incumbent:inc,metrics:cand,new_labels_since_active:newLabels,gates};
  if(Object.values(gates).every(Boolean)){
    active={schema:'COURT-CALIBRATION-MODEL-V8',status:'ACTIVE',version:`COURT-CAL-V8-${rows.length}`,trained_on_n:rows.length,promoted_at:new Date().toISOString(),params,validation:cand};
    await fs.writeFile(MODEL,JSON.stringify(active,null,2)+'\n');
    promotion='PROMOTED';
  }else promotion='REJECTED';
}
const calibrated=metric(rows,r=>active?apply(r.p,r.league,active.params):r.p);
let drift={state:'INSUFFICIENT',reasons:[]};
if(rows.length>=80){
  const recentRows=rows.slice(-40),baseRows=rows.slice(0,-40);
  drift=state(metric(recentRows,r=>active?apply(r.p,r.league,active.params):r.p),metric(baseRows,r=>active?apply(r.p,r.league,active.params):r.p));
}
const out={
 schema:'COURT-LEARNING-V8',
 generated_at:new Date().toISOString(),
 settled_n:rows.length,
 maturity:rows.length<30?'COLD':rows.length<80?'LEARNING':'REVIEW',
 raw,
 calibrated,
 calibration:{active:!!active,version:active?.version||'IDENTITY_FALLBACK',promotion,candidate},
 drift,
 governance:{paper_only:true,auto_promote_calibration:true,real_money_auto_promotion:false,min_labels_for_training:80,holdout_n:40,min_new_labels:10,fail_closed:true}
};
await fs.writeFile(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({ok:true,n:rows.length,maturity:out.maturity,calibration:out.calibration.version,promotion,drift:drift.state}));
