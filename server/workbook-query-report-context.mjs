import {rows,PROFILE,dayDate} from './workbook-model.mjs';
import {sourceHash as hash,copyReportSource} from './query-reports/source-copy.mjs';
import {scopeFor} from './parameter-contract.mjs';
import {sourceIdentity} from './workbook-workbench.mjs';

export class WorkbookQueryContextError extends Error {
  constructor(code,status=422){super(code);this.code=code;this.status=status;}
}
const reject=(code,status)=>{throw new WorkbookQueryContextError(code,status);};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);

/** Read only the explicitly selected authoritative workbook snapshot.
 * No state write, recovery, parameter mutation, worker, cache, or latest fallback.
 * Report-domain projection/filtering remains owned by server/query-reports.
 */
export function workbookQueryContext(ctx,ref,actor=''){
  if(!object(ref)||Object.keys(ref).some(k=>!['datasetId','version','runId'].includes(k))||
    typeof ref.datasetId!=='string'||!ref.datasetId||ref.datasetId.length>100||
    !Number.isSafeInteger(ref.version)||ref.version<1||
    (ref.runId!==undefined&&(typeof ref.runId!=='string'||!ref.runId||ref.runId.length>100)))reject('CONTEXT_INVALID');
  const state=ctx.read();let input,run;
  if(ref.runId!==undefined){
    run=state.runs.find(r=>r.id===ref.runId);
    if(!run)reject('RUN_NOT_FOUND',404);
    if(run.datasetId!==ref.datasetId||run.version!==ref.version)reject('CONTEXT_MISMATCH',409);
    try{input=ctx.snapshot(run.inputRef);}catch{reject('FROZEN_INPUT_UNAVAILABLE',409);}
    if(!input||hash(input)!==run.inputHash)reject('FROZEN_INPUT_CORRUPT',409);
    if(run.result){
      if(!run.resultHash||hash(run.result)!==run.resultHash)reject('FROZEN_RESULT_CORRUPT',409);
      const p=run.result;
      if(!['completed','partial'].includes(run.status)||p.status!==run.status||
        p.source?.datasetId!==input.id||p.source?.version!==input.version||p.source?.fileHash!==input.fileHash||
        p.source?.mappingHash!==hash(input.mapping)||p.source?.parameterHash!==hash(rows(input,'配置参数'))||
        hash(p.conditions)!==hash({...run.selection,interval:'[start,end)'}))reject('FROZEN_RESULT_SOURCE_MISMATCH',409);
    }
  }else{
    try{input=ctx.dataset(state,ref.datasetId,ref.version);}catch{reject('DATASET_SOURCE_UNAVAILABLE',409);}
    if(!input)reject('DATASET_NOT_FOUND',404);
  }
  if(input.id!==ref.datasetId||input.version!==ref.version||!object(input.tables))reject('CONTEXT_MISMATCH',409);
  const origin=run?.provenance?.dayZero||run?.result?.dayZero||input.dayZero||(input.profile===PROFILE?dayDate(0):undefined);
  if(typeof origin!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(origin)||!Number.isFinite(Date.parse(origin))||new Date(origin).toISOString().slice(0,10)!==origin)reject('DAY_ZERO_NOT_PROVIDED');
  let scope;try{
    const requested=run?.provenance?.parameterScope||'dataset';
    // Frozen runtime inputs intentionally omit mutable trial catalogues. Their
    // scope and actor were frozen on the run; never consult today's catalogue.
    if(run&&requested!=='dataset'){if(run.actor!==actor||input.parameterContext?.scope!==requested)reject('FORBIDDEN',403);scope=requested;}
    else scope=scopeFor(input,requested,actor);
  }catch{reject('FORBIDDEN',403);}
  const sources=sourceIdentity(input);
  const identity={scope,datasetId:input.id,version:input.version,...(run?{runId:run.id}:{}),
    inputHash:hash(input),fileHash:input.fileHash,parameterHash:sources.parameterHash,mappingHash:sources.mappingHash,
    ...(run?.resultHash?{resultHash:run.resultHash}:{}),dayZero:origin,
    ...(run?.provenance?.minuteOrigin||run?.result?.minuteOrigin||input.minuteOrigin?{minuteOrigin:run?.provenance?.minuteOrigin||run?.result?.minuteOrigin||input.minuteOrigin}:{}),
    timeUnit:run?.provenance?.timeUnit||run?.result?.timeUnit||input.timeUnit||(input.profile===PROFILE?'day':undefined)};
  identity.fingerprint=hash(identity);
  // Clones prevent a projection from mutating the shared in-memory authority.
  return {identity,actor,input:copyReportSource(input),run:run?copyReportSource(run):undefined,sources:copyReportSource(sources)};
}

export function workbookQueryBoundContext(ctx,identity,actor=''){
  if(!object(identity)||typeof identity.fingerprint!=='string')reject('FINGERPRINT_REQUIRED',409);
  const value=workbookQueryContext(ctx,{datasetId:identity.datasetId,version:identity.version,...(identity.runId!==undefined?{runId:identity.runId}:{})},actor);
  for(const key of ['scope','fingerprint','inputHash','parameterHash','mappingHash','resultHash','fileHash','dayZero','timeUnit','minuteOrigin'])
    if(value.identity[key]!==identity[key])reject('CONTEXT_MISMATCH',409);
  return value;
}
