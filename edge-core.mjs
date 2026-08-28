import crypto from 'node:crypto';

export const EDGE_CORE_VERSION='1.0.0';

const SECRET_KEY=/api[_-]?key|token|secret|password|authorization/i;
const SECRET_VALUE=/(?:sk-|gh[oprsu]_|bearer\s+)[A-Za-z0-9._-]{12,}/i;

export function assessFreshness(updatedAt,{warnMinutes=390,failMinutes=510}={}){
  const ts=Date.parse(updatedAt||'');
  if(!Number.isFinite(ts))return {state:'NO_TIMESTAMP',age_minutes:null,operational:false};
  const age=Math.max(0,(Date.now()-ts)/60000);
  return {state:age>failMinutes?'STALE':age>warnMinutes?'DEGRADED':'FRESH',age_minutes:Math.round(age*10)/10,operational:age<=failMinutes};
}

export function assertPublicBoard(board){
  if(!board||typeof board!=='object')throw new Error('board missing');
  if(board.integrity?.strict_no_fabrication!==true)throw new Error('strict_no_fabrication missing');
  if(!Array.isArray(board.radar)||!Array.isArray(board.upcoming)||!Array.isArray(board.history))throw new Error('board collections invalid');
  const raw=JSON.stringify(board);
  if(SECRET_VALUE.test(raw))throw new Error('secret-like value in public board');
  for(const key of Object.keys(board))if(SECRET_KEY.test(key))throw new Error(`sensitive root key: ${key}`);
  return true;
}

export function runReceipt({app,runAt=new Date().toISOString(),event='unknown',schedule=null,boards=[],quotaMode='h2h'}={}){
  const validations=boards.map(board=>{assertPublicBoard(board);return {league:board.meta?.league||'UNKNOWN',updated_at:board.meta?.updated_at||null,radar:board.radar.length,locked:board.upcoming.length,history:board.history.length}});
  const digest=crypto.createHash('sha256').update(JSON.stringify(validations)).digest('hex').slice(0,16);
  return {ok:true,app,edge_core_version:EDGE_CORE_VERSION,checked_at:runAt,event,schedule:schedule||null,quota_mode:quotaMode,artifact_digest:digest,boards:validations,security:{secrets_server_side:true,public_artifact_scan:'PASS',strict_no_fabrication:true}};
}
