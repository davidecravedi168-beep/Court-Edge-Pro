import {clamp,DEFAULT_GATES} from '../quant-engine.mjs';
export const V4='COURT-EDGE-4.0-BETTING-TERMINAL';
export const KEYS=['h2h','spreads','totals'];
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{const z=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!z.length)return null;const m=z.length>>1;return z.length%2?z[m]:(z[m-1]+z[m])/2};
const sd=a=>{const z=a.filter(Number.isFinite);if(z.length<2)return null;const m=avg(z);return Math.sqrt(avg(z.map(x=>(x-m)**2)))};
const wr=a=>{if(!a.length)return 0;let s=0,w=0;a.forEach((v,i)=>{const q=Math.exp((i-a.length+1)/4);s+=v*q;w+=q});return s/w};
export const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
export const round=(x,d=3)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
export function cdf(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,s=x<0?-1:1,z=Math.abs(x)/Math.sqrt(2),t=1/(1+p*z),e=s*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z));return .5*(1+e)}
export const syntheticHold=(a,b)=>a>1&&b>1?1/a+1/b-1:null;
export const priceToBet=(p,min=DEFAULT_GATES.minRobustEV)=>p>0?round((1+min)/p,2):null;
const state=(name,id=null)=>({name,id,elo:1500,games:0,m:[],t:[],pf:[],pa:[],rm:[],rt:[],last:null});
export function buildModel(games,league){
 const teams=new Map(),homeAdj=league==='NBA'?54:45,tot=[],mar=[];
 const get=(n,id)=>{const k=norm(n);if(!teams.has(k))teams.set(k,state(n,id));const x=teams.get(k);if(id!=null)x.id=id;return x};
 for(const g of [...games].sort((a,b)=>new Date(a.date)-new Date(b.date))){if(!g.home||!g.away||!Number.isFinite(g.hs)||!Number.isFinite(g.as))continue;const h=get(g.home,g.home_id),a=get(g.away,g.away_id),m=g.hs-g.as,t=g.hs+g.as,ex=1/(1+10**(-((h.elo+homeAdj)-a.elo)/400)),d=18*((m>0?1:0)-ex);h.elo+=d;a.elo-=d;for(const [x,pf,pa,mm] of [[h,g.hs,g.as,m],[a,g.as,g.hs,-m]]){x.games++;x.m.push(mm);x.t.push(t);x.pf.push(pf);x.pa.push(pa);x.rm.push(mm);x.rt.push(t);x.last=g.date;for(const q of [x.m,x.t,x.pf,x.pa])if(q.length>48)q.shift();if(x.rm.length>12)x.rm.shift();if(x.rt.length>12)x.rt.shift()}tot.push(t);mar.push(m)}
 return {teams,homeAdj,avgTotal:median(tot)||(league==='NBA'?225:162),marginSd:sd(mar)||(league==='NBA'?12.5:10.5),totalSd:sd(tot)||(league==='NBA'?17.5:14.5)};
}
const rest=(x,at)=>x?.last?Math.max(0,(new Date(at)-new Date(x.last))/86400000):4;
const mean=(a,f)=>{const z=a.filter(Number.isFinite);return z.length?avg(z):f};
export function project(model,home,away,start,inj={home:0,away:0}){
 const h=model.teams.get(norm(home))||state(home),a=model.teams.get(norm(away))||state(away),n=Math.min(h.games,a.games),rel=n/(n+12),lt=model.avgTotal;
 const hpf=mean(h.pf,lt/2),hpa=mean(h.pa,lt/2),apf=mean(a.pf,lt/2),apa=mean(a.pa,lt/2),rh=wr(h.rm),ra=wr(a.rm),th=wr(h.rt)||lt,ta=wr(a.rt)||lt;
 const elo=1/(1+10**(-((h.elo+model.homeAdj)-a.elo)/400)),hr=rest(h,start),ar=rest(a,start);let r=0;if(hr<1.7)r-=1.1;if(ar<1.7)r+=1.1;if(hr>3.5&&ar<2.1)r+=.5;if(ar>3.5&&hr<2.1)r-=.5;const ia=clamp(inj.away-inj.home,-3,3)*1.15;
 const mp=[(elo-.5)*(model.marginSd*3.6),((hpf+apa)/2-(apf+hpa)/2)+2.1,(rh-ra)/2+1.6].map(x=>x+r+ia),tm=[(hpf+apf+hpa+apa)/2,(th+ta)/2,lt+(((th+ta)/2-lt)*.45)];
 const margin=(mp[0]*1.25+mp[1]+mp[2])/3.25*rel,total=(tm[0]*1.05+tm[1]+tm[2]*1.15)/3.2,ms=clamp(model.marginSd+(1-rel)*4.5+Math.abs(inj.home-inj.away)*.6,7,22),ts=clamp(model.totalSd+(1-rel)*5.5+(inj.home+inj.away)*.4,10,28),ml=mp.map(x=>.5+(cdf(x/Math.max(7,ms))-.5)*rel);
 return {sample:n,reliability:rel,margin,total,marginSigma:ms,totalSigma:ts,marginParts:mp,totalParts:tm,mlParts:ml,rest:{home:hr,away:ar},injuryRisk:inj};
}
export function modelParts(p,key,line,side='A'){let z;if(key==='h2h')z=p.mlParts;else if(key==='spreads')z=p.marginParts.map(m=>cdf((m+line)/p.marginSigma));else z=p.totalParts.map(t=>cdf((t-line)/p.totalSigma));return side==='A'?z:z.map(x=>1-x)}
export function liveProjection(pre,g){if(!pre||!Number.isFinite(+g.home_team_score)||!Number.isFinite(+g.visitor_team_score))return null;const per=Math.max(0,+g.period||0),m=/^(\d+):(\d+)$/.exec(String(g.time||'').trim()),left=m?+m[1]+(+m[2]/60):0,elapsed=per<=0?0:Math.min(48,(Math.min(per,4)-1)*12+(12-left)),f=clamp(elapsed/48,0,.999),rem=48-elapsed,cm=+g.home_team_score-+g.visitor_team_score,ct=+g.home_team_score+ +g.visitor_team_score,obs=elapsed>2?ct/elapsed:pre.total/48,w=clamp(f*.65,0,.55),rate=(pre.total/48)*(1-w)+obs*w,ms=Math.max(3.2,pre.marginSigma*Math.sqrt(Math.max(.05,1-f))),ts=Math.max(5,pre.totalSigma*Math.sqrt(Math.max(.08,1-f)));return {homeWin:cdf((cm+(1-f)*pre.margin)/ms),finalMargin:cm+(1-f)*pre.margin,finalTotal:ct+rate*rem,marginSigma:ms,totalSigma:ts,elapsed,remaining:rem}}
export {avg,median,sd};