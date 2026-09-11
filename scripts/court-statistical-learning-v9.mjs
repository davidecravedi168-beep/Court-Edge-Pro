import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const COURT_STAT_SCHEMA='COURT-STATISTICAL-LEARNING-V9';
export const FEATURE_NAMES=[
  'baseline_logit','challenger_logit','model_challenger_gap','raw_calibration_gap',
  'projected_margin_sigma','projected_total_centered_sigma',
  'sports_confidence','data_quality','reliability','model_sample_log',
  'rest_edge','availability_verified','league_nba'
];
const BOARD_PATHS=['data/nba-v4-board.json','data/euroleague-v4-board.json'];
const OUT='data/court-statistical-learning-v9.json';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const logit=p=>Math.log(clamp(p,1e-6,1-1e-6)/(1-clamp(p,1e-6,1-1e-6)));
const quantile=(xs,q)=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),i=(a.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return a[l]+(a[h]-a[l])*(i-l)};
const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const isoMs=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};

function dedupe(rows,keyFn){
  const m=new Map();
  for(const row of rows){
    const key=keyFn(row);
    const old=m.get(key);
    if(!old||isoMs(row.settled_at)>isoMs(old.settled_at))m.set(key,row);
  }
  return [...m.values()];
}

export function prepareBoards(boards){
  const rejected={not_settled:0,invalid_probability:0,invalid_outcome:0,missing_lock_time:0,missing_start_time:0,temporal_leakage:0};
  const joined=[];
  for(const board of boards||[]){
    const league=String(board?.meta?.league||'UNKNOWN').toUpperCase();
    for(const x of board?.forecast_history||[])joined.push({...x,__league:league});
  }
  const clean=dedupe(joined,x=>[x.__league,x.event_id,x.prediction_locked_at||''].join('|'));
  const rows=[];
  for(const x of clean){
    if(x?.status!=='SETTLED'){rejected.not_settled++;continue}
    const p=finite(x.home_win_prob),y=finite(x.actual_home_win);
    if(!(p>0&&p<1)){rejected.invalid_probability++;continue}
    if(!(y===0||y===1)){rejected.invalid_outcome++;continue}
    const locked=isoMs(x.prediction_locked_at),start=isoMs(x.start_at);
    if(locked===null){rejected.missing_lock_time++;continue}
    if(start===null){rejected.missing_start_time++;continue}
    if(locked>=start){rejected.temporal_leakage++;continue}
    const league=x.__league;
    const challenger=finite(x.challenger_home_win_prob);
    const q=challenger>0&&challenger<1?challenger:p;
    const marginSigma=Math.max(5,finite(x.margin_sigma)??(league==='NBA'?17:14));
    const totalSigma=Math.max(7,finite(x.total_sigma)??(league==='NBA'?18:15));
    const totalBase=league==='NBA'?225:162;
    const homeRest=finite(x?.rest?.home),awayRest=finite(x?.rest?.away);
    const raw={
      baseline_logit:logit(p),
      challenger_logit:logit(q),
      model_challenger_gap:p-q,
      raw_calibration_gap:p-(finite(x.raw_home_win_prob)??p),
      projected_margin_sigma:(finite(x.projected_margin)??0)/marginSigma,
      projected_total_centered_sigma:((finite(x.projected_total)??totalBase)-totalBase)/totalSigma,
      sports_confidence:(finite(x.sports_confidence)??50)/100,
      data_quality:(finite(x.data_quality)??50)/100,
      reliability:finite(x.reliability)??0,
      model_sample_log:Math.log1p(Math.max(0,finite(x.model_sample)??0)),
      rest_edge:homeRest!==null&&awayRest!==null?clamp((homeRest-awayRest)/4,-1,1):0,
      availability_verified:String(x.availability_status||'').toUpperCase()==='VERIFIED'?1:0,
      league_nba:league==='NBA'?1:0
    };
    rows.push({
      id:[league,x.event_id,x.prediction_locked_at].join('|'),
      time:start,league,p,y,
      projected_margin:finite(x.projected_margin),
      actual_margin:finite(x.actual_margin),
      projected_total:finite(x.projected_total),
      actual_total:finite(x.actual_total),
      confidence:finite(x.sports_confidence),
      data_quality:finite(x.data_quality),
      availability:String(x.availability_status||'UNKNOWN').toUpperCase(),
      rest_edge:raw.rest_edge,
      raw:FEATURE_NAMES.map(k=>raw[k])
    });
  }
  rows.sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
  return {rows,rejected};
}

function scaler(rows){
  const means=[],scales=[];
  for(let j=0;j<FEATURE_NAMES.length;j++){
    const xs=rows.map(r=>r.raw[j]),m=mean(xs);
    const sd=Math.sqrt(mean(xs.map(x=>(x-m)**2)))||1;
    means.push(m);scales.push(sd<1e-8?1:sd);
  }
  return {means,scales};
}
const vector=(r,s)=>[1,...r.raw.map((x,j)=>(x-s.means[j])/s.scales[j])];

export function fitLogistic(rows,{lambda=.06,iterations=2600,rate=.075}={}){
  if(rows.length<20)throw new Error('COURT_V9_TRAINING_SAMPLE_TOO_SMALL');
  const scale=scaler(rows),xs=rows.map(r=>vector(r,scale)),ys=rows.map(r=>r.y);
  const weights=Array(FEATURE_NAMES.length+1).fill(0);
  weights[0]=logit(clamp(mean(ys),.05,.95));
  for(let it=0;it<iterations;it++){
    const gradient=Array(weights.length).fill(0);
    for(let i=0;i<xs.length;i++){
      let z=0;for(let j=0;j<weights.length;j++)z+=weights[j]*xs[i][j];
      const error=sigmoid(z)-ys[i];
      for(let j=0;j<weights.length;j++)gradient[j]+=error*xs[i][j];
    }
    const lr=rate/(1+it/900);
    for(let j=0;j<weights.length;j++){
      gradient[j]/=xs.length;
      if(j)gradient[j]+=lambda*weights[j];
      weights[j]-=lr*gradient[j];
    }
  }
  return {
    weights,scale,lambda,iterations,
    predict:r=>clamp(sigmoid(vector(r,scale).reduce((z,x,j)=>z+x*weights[j],0)),.01,.99)
  };
}

function auc(rows,key){
  const z=rows.filter(r=>Number.isFinite(r[key])).sort((a,b)=>a[key]-b[key]);
  let pos=0,neg=0,rankSum=0,i=0;
  while(i<z.length){
    let j=i+1;while(j<z.length&&z[j][key]===z[i][key])j++;
    const rank=(i+1+j)/2;
    for(let k=i;k<j;k++){if(z[k].y){pos++;rankSum+=rank}else neg++}
    i=j;
  }
  return pos&&neg?(rankSum-pos*(pos+1)/2)/(pos*neg):null;
}

function calibrationFit(rows,key){
  if(rows.length<20)return {intercept:null,slope:null};
  let intercept=0,slope=1;
  for(let it=0;it<1400;it++){
    let gi=0,gs=0;
    for(const r of rows){
      const x=logit(r[key]),error=sigmoid(intercept+slope*x)-r.y;
      gi+=error;gs+=error*x;
    }
    intercept-=.035*gi/rows.length;slope-=.035*gs/rows.length;
  }
  return {intercept,slope};
}

export function reliability(rows,key='candidate_p'){
  const bins=Array.from({length:10},(_,i)=>({low:i/10,high:(i+1)/10,rows:[]}));
  for(const r of rows)bins[Math.min(9,Math.floor(clamp(r[key],0,.999999)*10))].rows.push(r);
  return bins.filter(b=>b.rows.length).map(b=>{
    const n=b.rows.length,w=b.rows.reduce((s,r)=>s+r.y,0),observed=w/n,z=1.96,den=1+z*z/n;
    const center=(observed+z*z/(2*n))/den;
    const half=z*Math.sqrt((observed*(1-observed)+z*z/(4*n))/n)/den;
    return {band:`${Math.round(b.low*100)}-${Math.round(b.high*100)}%`,n,avg_probability:mean(b.rows.map(r=>r[key])),observed_rate:observed,wilson_95:[clamp(center-half,0,1),clamp(center+half,0,1)]};
  });
}

export function classificationMetrics(rows,key='candidate_p'){
  if(!rows.length)return {n:0,brier:null,logloss:null,ece:null,auc:null,calibration_intercept:null,calibration_slope:null};
  const brier=mean(rows.map(r=>(r[key]-r.y)**2));
  const logloss=-mean(rows.map(r=>r.y*Math.log(clamp(r[key],1e-9,1-1e-9))+(1-r.y)*Math.log(clamp(1-r[key],1e-9,1-1e-9))));
  const bins=reliability(rows,key);
  const ece=bins.reduce((s,b)=>s+b.n/rows.length*Math.abs(b.avg_probability-b.observed_rate),0);
  const cal=calibrationFit(rows,key);
  return {n:rows.length,brier,logloss,ece,auc:auc(rows,key),calibration_intercept:cal.intercept,calibration_slope:cal.slope};
}

export function rollingWalkForward(rows,{minTrain=100,block=30}={}){
  if(rows.length<=minTrain)return {rows:[],folds:[],min_train:minTrain,block};
  const out=[],folds=[];
  for(let start=minTrain;start<rows.length;start+=block){
    const train=rows.slice(0,start),test=rows.slice(start,Math.min(rows.length,start+block)),model=fitLogistic(train);
    for(const row of test)out.push({...row,candidate_p:model.predict(row)});
    folds.push({train_n:train.length,test_n:test.length,train_through:new Date(train.at(-1).time).toISOString(),test_through:new Date(test.at(-1).time).toISOString()});
  }
  return {rows:out,folds,min_train:minTrain,block};
}

function rng(seed){let x=seed>>>0||0x9e3779b9;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296}}
export function pairedBlockBootstrap(rows,iterations=1000){
  if(rows.length<30)return {iterations:0,block_size:0,brier_delta_95:[null,null],logloss_delta_95:[null,null]};
  const random=rng(parseInt(fingerprint(rows.map(r=>r.id)).slice(0,8),16));
  const n=rows.length,block=Math.max(5,Math.round(Math.sqrt(n))),brier=[],logloss=[];
  for(let it=0;it<iterations;it++){
    const sample=[];
    while(sample.length<n){
      const start=Math.floor(random()*n);
      for(let j=0;j<block&&sample.length<n;j++)sample.push(rows[(start+j)%n]);
    }
    let db=0,dl=0;
    for(const r of sample){
      db+=(r.candidate_p-r.y)**2-(r.p-r.y)**2;
      dl+=-(r.y*Math.log(clamp(r.candidate_p,1e-9,1-1e-9))+(1-r.y)*Math.log(clamp(1-r.candidate_p,1e-9,1-1e-9)))
          +(r.y*Math.log(clamp(r.p,1e-9,1-1e-9))+(1-r.y)*Math.log(clamp(1-r.p,1e-9,1-1e-9)));
    }
    brier.push(db/n);logloss.push(dl/n);
  }
  return {iterations,block_size:block,brier_delta_95:[quantile(brier,.025),quantile(brier,.975)],logloss_delta_95:[quantile(logloss,.025),quantile(logloss,.975)]};
}

function regression(rows,predKey,actualKey){
  const z=rows.filter(r=>Number.isFinite(r[predKey])&&Number.isFinite(r[actualKey]));
  if(!z.length)return {n:0,mae:null,rmse:null,bias:null,r_squared:null};
  const errors=z.map(r=>r[predKey]-r[actualKey]),actualMean=mean(z.map(r=>r[actualKey]));
  const sse=errors.reduce((s,e)=>s+e*e,0),sst=z.reduce((s,r)=>s+(r[actualKey]-actualMean)**2,0);
  return {n:z.length,mae:mean(errors.map(Math.abs)),rmse:Math.sqrt(mean(errors.map(e=>e*e))),bias:mean(errors),r_squared:sst>0?1-sse/sst:null};
}

function marketAnalysis(boards){
  const rows=[];
  for(const board of boards||[])for(const x of board?.history||[]){
    if(x?.status!=='SETTLED'||x.push)continue;
    const stake=finite(x.locked_stake_units??x.stake_units),profit=finite(x.profit_units);
    if(!(stake>0)||profit===null)continue;
    let clv=finite(x.clv_proxy),clvSource=clv===null?null:'RECORDED_PROXY';
    const locked=finite(x.locked_odds),closing=finite(x.closing_odds);
    if(clv===null&&locked>1&&closing>1){clv=locked/closing-1;clvSource='VERIFIED_CLOSING_ODDS'}
    rows.push({market:String(x.market_key||'UNKNOWN'),stake,profit,won:profit>0?1:0,clv,clvSource});
  }
  const summarize=z=>({n:z.length,stake_units:z.reduce((s,r)=>s+r.stake,0),profit_units:z.reduce((s,r)=>s+r.profit,0),roi:z.reduce((s,r)=>s+r.stake,0)>0?z.reduce((s,r)=>s+r.profit,0)/z.reduce((s,r)=>s+r.stake,0):null,hit_rate:mean(z.map(r=>r.won)),verified_clv_n:z.filter(r=>r.clvSource==='VERIFIED_CLOSING_ODDS').length,recorded_proxy_clv_n:z.filter(r=>r.clvSource==='RECORDED_PROXY').length,mean_clv:mean(z.filter(r=>r.clv!==null).map(r=>r.clv))});
  const groups={};for(const key of [...new Set(rows.map(r=>r.market))])groups[key]=summarize(rows.filter(r=>r.market===key));
  return {overall:summarize(rows),by_market:groups,note:'ROI is paper-only. CLV is null unless a recorded proxy or verified closing price exists.'};
}

function shrinkageSegments(rows,name,keyFn){
  if(!rows.length)return[];
  const global=mean(rows.map(r=>r.y)),prior=24,groups=new Map();
  for(const r of rows){const key=keyFn(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  return [...groups.entries()].map(([key,z])=>({
    segment:name,key,n:z.length,
    observed_rate:mean(z.map(r=>r.y)),
    shrunken_rate:(z.reduce((s,r)=>s+r.y,0)+prior*global)/(z.length+prior),
    baseline:classificationMetrics(z,'p'),
    candidate:classificationMetrics(z,'candidate_p')
  })).sort((a,b)=>b.n-a.n);
}

function psi(base,recent,key){
  const cuts=[0,.4,.5,.6,.7,.8,1],count=(xs,i)=>xs.filter(r=>r[key]>=cuts[i]&&(i===cuts.length-2?r[key]<=cuts[i+1]:r[key]<cuts[i+1])).length;
  let total=0;
  for(let i=0;i<cuts.length-1;i++){
    const a=(count(base,i)+.5)/(base.length+.5*(cuts.length-1)),b=(count(recent,i)+.5)/(recent.length+.5*(cuts.length-1));
    total+=(b-a)*Math.log(b/a);
  }
  return total;
}
function drift(rows){
  if(rows.length<100)return {state:'INSUFFICIENT',psi:null,baseline_n:0,recent_n:rows.length};
  const recent=rows.slice(-50),base=rows.slice(0,-50),value=psi(base,recent,'candidate_p');
  const bm=classificationMetrics(base),rm=classificationMetrics(recent);
  return {state:value>=.25||rm.logloss-bm.logloss>.12?'ALERT':value>=.10||rm.logloss-bm.logloss>.06?'WATCH':'OK',psi:value,baseline_n:base.length,recent_n:recent.length,delta_brier:rm.brier-bm.brier,delta_logloss:rm.logloss-bm.logloss};
}

export function buildCourtStatisticalLearning(boards){
  const prepared=prepareBoards(boards),rows=prepared.rows;
  const minTrain=Math.max(80,Math.min(140,Math.floor(rows.length*.55)));
  const oos=rollingWalkForward(rows,{minTrain,block:30});
  const baseline=classificationMetrics(oos.rows,'p'),candidate=classificationMetrics(oos.rows,'candidate_p');
  const confidence=pairedBlockBootstrap(oos.rows),distributionDrift=drift(oos.rows);
  const segments=[
    ...shrinkageSegments(oos.rows,'league',r=>r.league),
    ...shrinkageSegments(oos.rows,'confidence',r=>r.confidence>=80?'80+':r.confidence>=65?'65-79':'<65'),
    ...shrinkageSegments(oos.rows,'data_quality',r=>r.data_quality>=85?'85+':r.data_quality>=70?'70-84':'<70'),
    ...shrinkageSegments(oos.rows,'availability',r=>r.availability)
  ];
  const stable=segments.filter(s=>s.n>=35).every(s=>s.candidate.logloss<=s.baseline.logloss+.02);
  const gates={
    minimum_oos:oos.rows.length>=200,
    brier_delta_ci_below_zero:confidence.brier_delta_95[1]!==null&&confidence.brier_delta_95[1]<0,
    logloss_delta_ci_below_zero:confidence.logloss_delta_95[1]!==null&&confidence.logloss_delta_95[1]<0,
    ece_not_worse:candidate.ece!==null&&candidate.ece<=baseline.ece+.005,
    calibration_slope_sane:candidate.calibration_slope!==null&&candidate.calibration_slope>=.75&&candidate.calibration_slope<=1.25,
    segment_stability:stable,
    drift_not_alert:distributionDrift.state!=='ALERT',
    no_temporal_leakage:prepared.rejected.temporal_leakage===0
  };
  const eligible=Object.values(gates).every(Boolean);
  const finalModel=rows.length>=80?fitLogistic(rows):null;
  return {
    schema:COURT_STAT_SCHEMA,generated_at:new Date().toISOString(),
    maturity:rows.length<30?'COLD':rows.length<80?'LEARNING':'REVIEW',
    source:{eligible_rows:rows.length,rejected:prepared.rejected,board_versions:(boards||[]).map(b=>({league:b?.meta?.league||'UNKNOWN',updated_at:b?.meta?.updated_at||null,prediction_version:b?.meta?.prediction_version||null}))},
    governance:{paper_only:true,shadow_only:true,auto_promote:false,production_logic_changed:false,fail_closed:true,review_required:true,time_ordered_walk_forward:true,shuffled_cross_validation:false,holdout_reuse:false},
    methods:{classifier:'L2-regularized logistic regression',uncertainty:'deterministic moving-block bootstrap 95%',small_sample_control:'Beta-binomial shrinkage, prior strength 24',drift:'Population Stability Index plus log-loss shift'},
    features:FEATURE_NAMES,
    oos:{n:oos.rows.length,folds:oos.folds,baseline,candidate,delta:oos.rows.length?{brier:candidate.brier-baseline.brier,logloss:candidate.logloss-baseline.logloss,ece:candidate.ece-baseline.ece}:{brier:null,logloss:null,ece:null},confidence_intervals:confidence,reliability:reliability(oos.rows)},
    score_models:{margin:regression(rows,'projected_margin','actual_margin'),total:regression(rows,'projected_total','actual_total')},
    paper_markets:marketAnalysis(boards),
    segments,drift:distributionDrift,
    promotion:{state:eligible?'REVIEW_ELIGIBLE':'HOLD',review_eligible:eligible,gates},
    model:finalModel?{status:'SHADOW',trained_n:rows.length,training_through:new Date(rows.at(-1).time).toISOString(),intercept:finalModel.weights[0],coefficients:Object.fromEntries(FEATURE_NAMES.map((k,i)=>[k,finalModel.weights[i+1]])),scaler:Object.fromEntries(FEATURE_NAMES.map((k,i)=>[k,{mean:finalModel.scale.means[i],scale:finalModel.scale.scales[i]}])),lambda:finalModel.lambda,iterations:finalModel.iterations,training_fingerprint:fingerprint(rows.map(r=>r.id))}:null
  };
}

export function syntheticBoards(n=320){
  const forecast_history=[];
  for(let i=0;i<n;i++){
    const league=i%4?'NBA':'EUROLEAGUE',base=.38+(i%25)/100,challenger=clamp(base+(i%5-2)*.008,.05,.95);
    const margin=(base-.5)*(league==='NBA'?34:28),quality=58+(i%39),reliability=.55+(i%35)/100;
    const truth=sigmoid(-.12+1.08*logit(base)+.32*(challenger-base)+.18*(quality/100-.7)+.16*(reliability-.7));
    const y=((i*7919)%10000)/10000<truth?1:0;
    const start=new Date(Date.UTC(2024,0,2+i,20));
    forecast_history.push({event_id:`e${i}`,prediction_locked_at:new Date(start-6*3600000).toISOString(),start_at:start.toISOString(),settled_at:new Date(+start+3*3600000).toISOString(),status:'SETTLED',home_win_prob:base,challenger_home_win_prob:challenger,actual_home_win:y,projected_margin:margin,actual_margin:margin+(i%7-3)*2.1,projected_total:league==='NBA'?224:161,actual_total:(league==='NBA'?224:161)+(i%9-4)*2.3,sports_confidence:62+(i%28),data_quality:quality,reliability,model_sample:30+(i%65),availability_status:i%3?'VERIFIED':'LIMITED',margin_sigma:league==='NBA'?17:14,total_sigma:league==='NBA'?18:15,rest:{home:2+(i%3),away:2+((i+1)%3)}});
  }
  return [{meta:{league:'NBA',updated_at:'2025-01-01T00:00:00Z',prediction_version:'TEST'},forecast_history:forecast_history.filter(x=>x.event_id.slice(1)%4!==0),history:[]},{meta:{league:'EUROLEAGUE',updated_at:'2025-01-01T00:00:00Z',prediction_version:'TEST'},forecast_history:forecast_history.filter(x=>x.event_id.slice(1)%4===0),history:[]}];
}

export function selfTest(){
  const boards=syntheticBoards();
  boards[0].forecast_history.push({...boards[0].forecast_history[0],event_id:'leak',prediction_locked_at:'2030-01-02T00:00:00Z'});
  const out=buildCourtStatisticalLearning(boards);
  if(out.oos.n<120||!Number.isFinite(out.oos.candidate.brier)||!Number.isFinite(out.oos.candidate.logloss)||out.governance.auto_promote!==false||out.governance.production_logic_changed!==false||out.source.rejected.temporal_leakage!==1||!out.model||out.promotion.state==='PROMOTED')throw new Error('COURT_STATISTICAL_LEARNING_V9_SELF_TEST');
  console.log(JSON.stringify({ok:true,tests:['temporal_walk_forward','l2_logistic','brier_logloss_ece_auc','calibration_wilson','block_bootstrap','score_regression','paper_roi_clv_integrity','hierarchical_shrinkage','psi_drift','promotion_fail_closed'],oos_n:out.oos.n}));
}

async function main(){
  if(process.argv.includes('--self-test')){selfTest();return}
  const boards=await Promise.all(BOARD_PATHS.map(p=>fs.readFile(p,'utf8').then(JSON.parse)));
  const out=buildCourtStatisticalLearning(boards);
  await fs.mkdir(path.dirname(OUT),{recursive:true});
  await fs.writeFile(OUT,JSON.stringify(out,null,2)+'\n','utf8');
  if(process.argv.includes('--validate')){
    if(out.schema!==COURT_STAT_SCHEMA||out.governance.shadow_only!==true||out.governance.auto_promote!==false||out.governance.production_logic_changed!==false||out.source.rejected.temporal_leakage!==0||!Array.isArray(out.oos.folds))throw new Error('COURT_STATISTICAL_LEARNING_V9_INVALID');
  }
  console.log(JSON.stringify({ok:true,eligible:out.source.eligible_rows,oos_n:out.oos.n,maturity:out.maturity,promotion:out.promotion.state,drift:out.drift.state,output:OUT}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error);process.exitCode=1});
