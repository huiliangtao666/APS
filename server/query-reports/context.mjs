import {hash,workbookSchema} from '../workbook-model.mjs';
import {applyParameters,effectiveParameters,blockedParameter} from '../parameter-contract.mjs';
import {canonical,digest,sourceRef} from '../workbook-preview.mjs';
import {bounded} from '../workbook-preview-query.mjs';
export {canonical,digest,bounded,workbookSchema};

export const LIMITS=Object.freeze({responseBytes:256*1024,inlineBytes:1024,valueChunk:4096,
  projectionBytes:32*1024*1024,records:100000,candidates:100,searchChars:200,windowDays:366});
export function fail(code,status=422,detail={}){const e=new Error(code);Object.assign(e,{code,status,detail});throw e;}
export function permit(access,kind='read'){if(access?.[kind]!==true)fail('FORBIDDEN',403,{permission:kind});}
export const number=v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
export const table=(d,name)=>d.tables?.[name]||[];
export const keyOf=(t,r)=>t==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[workbookSchema.tables[t]?.key]??'');
export const publicValues=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('_')));
const epoch=date=>{if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('INVALID_DATE');
  const n=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==date)fail('INVALID_DATE');return n;};
export function calendarDay(dayZero,date){return (epoch(date)-epoch(dayZero))/86400000;}
export function dayCalendar(dayZero,day){if(number(day)===null) return null;
  const n=epoch(dayZero)+Number(day)*86400000;if(!Number.isFinite(n)||Math.abs(n)>8.64e15)fail('INVALID_DATE');return new Date(n).toISOString().slice(0,10);}
export function calendarWindow(dayZero,from,toInclusive){const start=calendarDay(dayZero,from),end=calendarDay(dayZero,toInclusive)+1;
  if(end<=start||end-start>LIMITS.windowDays)fail('INVALID_DATE_WINDOW');return {start,end,interval:'[start,end)'};}
export function minuteCalendar(origin,minute){if(number(minute)===null)return null;
  if(typeof origin!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(origin)||!Number.isFinite(Date.parse(origin)))fail('MINUTE_ORIGIN_REQUIRED');
  // Keep the origin's explicit offset; UTC must not silently become local time.
  const suffix=origin.endsWith('Z')?'Z':origin.slice(-6),sign=suffix[0]==='-'?-1:1;
  const offset=suffix==='Z'?0:sign*(Number(suffix.slice(1,3))*60+Number(suffix.slice(4)));
  const value=new Date(Date.parse(origin)+(Number(minute)+offset)*60000).toISOString();
  return value.slice(0,19)+suffix;
}
export function minuteDay(identity,minute){const date=minuteCalendar(identity.minuteOrigin,minute);if(date===null)return null;
  return calendarDay(identity.dayZero,date.slice(0,10))+(Number(date.slice(11,13))*60+Number(date.slice(14,16))+Number(date.slice(17,19))/60)/1440;}
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const snapshots=new WeakSet();
/** Caller loads an explicit version using the existing snapshot store. Frozen mode
 * accepts ONLY its inputRef readback, never the current dataset as a fallback.
 * Scope/actor are server-owned after existing scopeFor/auth checks. No IO here. */
export function createReportSnapshot({dataset,frozenInput,run,datasetId,version,dayZero,scope='dataset',actor=''},access){
  permit(access);const d=run?frozenInput:dataset;
  if(!d||!datasetId||!Number.isSafeInteger(version)||version<1||d.id!==datasetId||d.version!==version)fail('CONTEXT_MISMATCH',409);
  if(run&&dataset)fail('MIXED_CURRENT_AND_FROZEN',409);
  if(run){if(run.datasetId!==d.id||run.version!==d.version||run.inputHash!==hash(d))fail('FROZEN_INPUT_CORRUPT',409);
    if(!run.result||!['completed','partial'].includes(run.status))fail('RESULT_NOT_READY',409);
    const p=run.result,s=p.source;
    if(!run.resultHash||run.resultHash!==hash(p))fail('FROZEN_RESULT_CORRUPT',409);
    if(p.status!==run.status||s?.datasetId!==d.id||s?.version!==d.version||s?.fileHash!==d.fileHash||s?.mappingHash!==hash(d.mapping)||s?.parameterHash!==hash(table(d,'配置参数'))||hash(p.conditions)!==hash({...run.selection,interval:'[start,end)'}))fail('FROZEN_SOURCE_MISMATCH',409);
    if(scope!==(run.provenance?.parameterScope||d.parameterContext?.scope||'dataset'))fail('FROZEN_SCOPE_MISMATCH',409);
    const zero=run.provenance?.dayZero||p.dayZero;if(dayZero&&zero!==dayZero)fail('CONTEXT_MISMATCH',409);dayZero=zero;
  }else if(d.dayZero&&dayZero&&d.dayZero!==dayZero)fail('CONTEXT_MISMATCH',409);
  dayZero=dayZero||d.dayZero;epoch(dayZero);
  if(!run&&scope!=='dataset'&&!d.parameterTrials?.some(t=>'trial:'+t.id===scope&&t.actor===actor))fail('FORBIDDEN',403);
  // Bound the actual report sources. Import/readiness explanations and frozen
  // provenance repeat the same parameter facts; counting those copies rejected
  // full V2 inputs before any report was projected. Keep the complete snapshots
  // below for source/identity checks, with the existing projection/response caps.
  const bytes=Buffer.byteLength(JSON.stringify({tables:d.tables||{},mapping:d.mapping||null,result:run?.result||null}));
  if(bytes>LIMITS.projectionBytes||Object.values(d.tables||{}).reduce((n,r)=>n+r.length,0)>LIMITS.records)fail('PROJECTION_TOO_LARGE',413);
  const identity={model:'workbook',datasetId:d.id,version:d.version,frozen:!!run,runId:run?.id||null,
    inputHash:run?.inputHash||hash(d),parameterHash:hash(table(d,'配置参数')),mappingHash:hash(d.mapping),resultHash:run?.resultHash||null,
    fileHash:d.fileHash||null,parameterDefinitionsHash:hash(d.parameterDefinitions||[]),scope,dayZero,
    timeUnit:run?.result?.timeUnit||d.timeUnit||'day',minuteOrigin:run?.result?.minuteOrigin||run?.provenance?.minuteOrigin||d.minuteOrigin||null,profile:d.profile||null};
  const result={identity,fingerprint:digest(identity),input:structuredClone(d),run:run?structuredClone(run):null,actor};
  snapshots.add(result);return freeze(result);
}
export function assertSnapshot(s){if(!snapshots.has(s))fail('INVALID_SNAPSHOT',409);return s;}
export function resolvedInput(s,day){assertSnapshot(s);const d=structuredClone(s.input);
  const at=s.run?s.run.provenance?.effectiveAt??s.run.selection.startDay:day;
  if(d.parameterContract){applyParameters(d,at,s.identity.scope);
    // Existing day-profile resolver assumes the simulation epoch. Re-evaluate
    // weekday-only CAL mapping with THIS snapshot's dayZero, preserving literals.
    const ps=effectiveParameters(d,at,s.identity.scope).filter(p=>p['对象编号']==='CAL');
    for(const c of table(d,'工厂日历')){const sunday=new Date(epoch(dayCalendar(s.identity.dayZero,number(c['日序'])))).getUTCDay()===0;
      const actual=ps.find(p=>p['参数名称']===(sunday?'周日班次数':'标准日班次数'));
      if(actual){for(const k of ['生产班次数','日产能分子']){if(blockedParameter(actual))delete c[k];else c[k]=actual['参数值'];}}}
  }
  return d;
}
export function anchor(s,t,r,field){const v=sourceRef(s.input,t,r,field);
  // Parameter sources must not inherit the business file's identity.
  const role=r?._sourceRole||r?._source?.role;
  if(role==='P'&&!r?._source?.fileHash){v.fileHash=null;v.fileName=null;v.physicalRow=null;v.cell=null;}
  return {...v,businessKey:keyOf(t,r),table:t,identity:s.identity,
    origin:v.sourceKind==='online'?{source:r?._source??null,origin:r?._origin??null,overlayRef:r?._overlayRef??null}:null};
}
export const ref=(t,r)=>({table:t,key:keyOf(t,r),row:r._row??null});
export function rawRecord(s,r){return table(s.input,r.table).find(x=>keyOf(r.table,x)===r.key&&(r.row===null||x._row===r.row));}
