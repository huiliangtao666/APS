import {parseWorkbook} from '../workbook-parse.mjs';
import {prepareBusinessImport} from '../workbook-workbench.mjs';
import {integrateParameterImport} from '../parameter-import.mjs';
import {applyParameters, effectiveParameters, blockedParameter, parameterIssues} from '../parameter-contract.mjs';
import {sourceHash} from '../query-reports/source-copy.mjs';
import {requireThat as need, minute, date, fingerprint} from './contract.mjs';

export const IMPORT_VERSION='aps-simulator-native-import@1';
export const rawHash=sourceHash;
// Detached JSON copy without a second full serialized workbook beside the tree.
const clean=value=>{
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(v=>v===undefined?null:clean(v));
  const out={...value};
  for(const key of Object.keys(value)){if(value[key]===undefined)delete out[key];else if(value[key]!==null&&typeof value[key]==='object')Object.defineProperty(out,key,{value:clean(value[key]),enumerable:true,writable:true,configurable:true});}
  return out;
};

// Native workbook values are plain JSON-like trees (including undefined source
// properties). Copy mutable nodes without structuredClone's serialized string
// buffer. Preserve own-property order, holes and aliases within the detached copy.
export function copyNativeSource(value,seen=new WeakMap()) {
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  const out=Array.isArray(value)?new Array(value.length):{...value};seen.set(value,out);
  for(const key of Object.keys(value)){
    const item=copyNativeSource(value[key],seen);
    Object.defineProperty(out,key,{value:item,enumerable:true,writable:true,configurable:true});
  }
  return out;
}

/** In-memory copies only. Callers supply explicit bytes or an explicitly selected
 * immutable input/run pair. No filesystem, current dataset fallback or solver. */
export function workbookSource({business,parameters,identity},schema) {
  need(schema?.tables&&schema.version,'NATIVE_SCHEMA_REQUIRED','schema','须注入实际workbookSchema');
  const parse=(file,role)=>{
    need(file&&Buffer.isBuffer(file.bytes)&&file.name&&/^[a-f0-9]{64}$/.test(file.hash),'SOURCE_BYTES_REQUIRED',role,'须明确原文件名、bytes和SHA256');
    need(rawHash(file.bytes)===file.hash,'SOURCE_HASH_MISMATCH',role,'原文件字节与所选SHA256不符',409);
    let parsed;try{parsed=parseWorkbook(file.bytes,schema);}catch(e){need(false,'NATIVE_PARSE_BLOCKED',role,e.message);}
    need(!!parsed.parameterWorkbook===(role==='parameters'),'SOURCE_ROLE_MISMATCH',role,'B和P文件角色不符');
    need(!parsed.issues?.some(i=>i.severity==='error'),'NATIVE_PARSE_BLOCKED',role,JSON.stringify(parsed.issues));
    return parsed;
  };
  need(identity?.id&&Number.isSafeInteger(identity.version)&&identity.version>0,'SOURCE_IDENTITY_REQUIRED','identity','须显式独立来源身份和版本');
  minute(identity.capturedAt,'identity.capturedAt');
  let b=parse(business,'business');const businessVersion=b.datasetVersion;
  let d=prepareBusinessImport({...b,id:identity.id,version:identity.version,name:business.name,fileHash:business.hash,
    profile:'excel-qualified-output-202611-r1',mapping:identity.mapping??null,parameterSources:[]},null,copyNativeSource);
  b=null;
  let p=parse(parameters,'parameters');
  need(businessVersion===p.datasetVersion,'SOURCE_VERSION_MISMATCH','parameters','B/P版本必须明确兼容');
  let merged;try{merged=integrateParameterImport(p,d,{...identity,name:business.name,expectedVersion:identity.version-1,fileHash:parameters.hash,adoptParameters:true,actor:'independent-source-copy',overlayResolution:'keep',copyValue:copyNativeSource});}
  catch(e){need(false,'PARAMETER_IMPORT_BLOCKED','parameters',e.message);}
  need(!merged.issues.some(i=>i.severity==='error'),'PARAMETER_IMPORT_BLOCKED','parameters',JSON.stringify(merged.issues));
  d=null;p=null;
  d=clean(merged.d);merged=null;
  d.createdAt=identity.capturedAt;d.parameterBaseline.importedAt=identity.capturedAt;
  return {kind:'WORKBOOK_BYTES_COPY',input:d,run:null,identity:{kind:'WORKBOOK_BYTES_COPY',datasetId:d.id,version:d.version,
    inputHash:rawHash(d),businessFile:{name:business.name,hash:business.hash,bytes:business.bytes.length},
    parameterFile:{name:parameters.name,hash:parameters.hash,bytes:parameters.bytes.length},
    fileHash:d.fileHash,profile:d.profile,schemaVersion:schema.version,schemaHash:rawHash(schema)},schemaVersion:schema.version};
}

export function frozenSource({input,run},schema) {
  need(input&&run&&schema?.tables,'FROZEN_SOURCE_REQUIRED','frozen','须明确选定run及其inputRef副本，不能传当前数据集替代');
  need(/^[a-f0-9]{64}$/.test(input.fileHash)&&input.profile&&Number.isSafeInteger(input.version),'SOURCE_IDENTITY_REQUIRED','input','冻结输入缺真实文件hash/profile/版本');
  need(run.id&&run.datasetId===input.id&&run.version===input.version&&run.inputHash===rawHash(input),
    'FROZEN_INPUT_MISMATCH','frozen.input','冻结身份或原JSON顺序hash不符',409);
  if(run.result){const p=run.result;
    need(run.resultHash===rawHash(p)&&['completed','partial'].includes(run.status)&&p.status===run.status&&
      p.source?.datasetId===input.id&&p.source.version===input.version&&p.source.fileHash===input.fileHash&&
      p.source.mappingHash===rawHash(input.mapping)&&p.source.parameterHash===rawHash(input.tables?.['配置参数']||[])&&
      rawHash(p.conditions)===rawHash({...run.selection,interval:'[start,end)'}),
      'FROZEN_RESULT_MISMATCH','frozen.run','冻结作业、条件或参数来源不符',409);
  }
  return {kind:'FROZEN_RUN_COPY',input:clean(input),run:clean(run),schemaVersion:schema.version,
    identity:{kind:'FROZEN_RUN_COPY',datasetId:input.id,version:input.version,runId:run.id,inputHash:run.inputHash,
      resultHash:run.resultHash??null,fileHash:input.fileHash,profile:input.profile,schemaVersion:schema.version,schemaHash:rawHash(schema)}};
}

/** Adapt the public seam's detached envelope, never a current workbook. The
 * public run deliberately omits result; only envelope.plan is its hashed result. */
export function frozenSourceCopy(envelope,selection={}) {
  need(envelope?.contract==='aps-simulator-frozen-source@1'&&envelope.mode==='INDEPENDENT'&&envelope.linked===false&&
    envelope.conversionStatus==='NOT_CONVERTED','FROZEN_CONTRACT_REQUIRED','frozenSource','须为公共接缝的未转换冻结副本');
  const {run,input,plan,workbookSchema:schema,gaps}=envelope;
  need(run&&Object.hasOwn(envelope,'plan')&&Array.isArray(gaps),'FROZEN_ENVELOPE_REQUIRED','frozenSource','缺run/plan/gaps；无计划须显式null');
  need(!Object.hasOwn(run,'result'),'FROZEN_RESULT_AMBIGUOUS','frozenSource.run.result','公共接缝计划只能来自plan');
  need((selection.runId===undefined||run.id===selection.runId)&&
    (selection.expectedInputHash===undefined||run.inputHash===selection.expectedInputHash),
    'FROZEN_SELECTION_MISMATCH','frozenSource.run','与明确选择的运行或输入hash不符',409);
  need(plan===null||(plan&&typeof plan==='object'&&!Array.isArray(plan)),'FROZEN_PLAN_REQUIRED','frozenSource.plan','须为原冻结结果或null');
  need(plan!==null||run.resultHash==null,'FROZEN_RESULT_MISMATCH','frozenSource.plan','存在结果hash但缺原冻结计划',409);
  const source=frozenSource({input,run:{...run,result:plan}},schema);
  // Preserve original frozen context verbatim, even when conversion is blocked.
  source.seam={contract:envelope.contract,conversionStatus:envelope.conversionStatus,gaps:clean(gaps),
    run:clean(run),schemaHash:rawHash(schema)};
  source.identity.publicContract=envelope.contract;
  return source;
}

export function resolveSource(source,calendar) {
  date(calendar.dayZero,'calendar.dayZero'); date(calendar.startDate,'calendar.startDate');
  minute(calendar.minuteOrigin,'calendar.minuteOrigin');
  need(calendar.minuteOrigin.endsWith('+08:00'),'TIMEZONE_UNSUPPORTED','calendar.minuteOrigin','须保留原来源时区');
  const d=clean(source.input),r=source.run,origin=r?.result?.minuteOrigin??r?.provenance?.minuteOrigin??d.minuteOrigin;
  need(d.profile==='excel-qualified-output-202611-r1','SOURCE_PROFILE_UNSUPPORTED','profile','此转换仅接既有Excel合格产出定额模型；标准投入kg模型须独立适配');
  const zero=r?.result?.dayZero??r?.provenance?.dayZero??d.dayZero;
  need(!origin||origin===calendar.minuteOrigin,'MINUTE_ORIGIN_MISMATCH','calendar.minuteOrigin','不能改写来源分钟原点',409);
  need(!zero||zero===calendar.dayZero,'DAY_ZERO_MISMATCH','calendar.dayZero','不能改写来源日序原点',409);
  for(const [where,value]of [['input',d],['run.provenance',r?.provenance],['plan',r?.result]]){
    if(value?.minuteOrigin!==undefined)need(value.minuteOrigin===calendar.minuteOrigin,'MINUTE_ORIGIN_MISMATCH',where+'.minuteOrigin','冻结来源间的分钟原点不一致',409);
    if(value?.dayZero!==undefined)need(value.dayZero===calendar.dayZero,'DAY_ZERO_MISMATCH',where+'.dayZero','冻结来源间的日序原点不一致',409);
  }
  need(d.parameterContract&&d.parameterSources?.some(s=>s.mode==='dataset'&&s.role==='P')&&d.parameterDefinitions?.length,
    'SECOND_P_REQUIRED','parameters','须含实际采用第二份P、完整目录定义及缺项，不接仅声明SECOND_P');
  need(d.tables?.['配置参数']?.some(p=>p._sourceRole==='P'||p._source?.role==='P'),
    'SECOND_P_ROWS_REQUIRED','input.tables.配置参数','第二P来源声明不能替代原P实例行');
  need(!d.parameterContext?.scope||d.parameterContext.scope==='dataset','PARAMETER_SCOPE_UNSUPPORTED','parameters.scope','trial冻结须另行明确适配，不混入dataset');
  const day=(Date.parse(calendar.startDate+'T00:00:00Z')-Date.parse(calendar.dayZero+'T00:00:00Z'))/86400000;
  // Older frozen V2 sources carry the same context in effectiveParameters.
  // Read that frozen metadata; never substitute the simulation/current P day.
  const ep=source.input.effectiveParameters;
  const frozenContext=source.kind==='FROZEN_RUN_COPY'?(source.input.parameterContext??
    (ep&&Number.isSafeInteger(ep.day)?{scope:ep.scope,effectiveDay:ep.day}:null)):null;
  if(source.seam)need(frozenContext?.scope&&Number.isSafeInteger(frozenContext.effectiveDay)&&
    source.input.parameterPrecedence&&source.input.effectiveParameters&&Array.isArray(source.input.effectiveParameters.values),
    'FROZEN_PARAMETER_CONTEXT_REQUIRED','input.parameterContext/effectiveParameters','冻结参数上下文及有效值缺失，不能按当前模拟日重算替代');
  need(!frozenContext||frozenContext.scope==='dataset','PARAMETER_SCOPE_UNSUPPORTED','parameters.scope','冻结试算参数须显式适配，不替换为dataset');
  const parameterDay=frozenContext?.effectiveDay??day;
  need(Number.isSafeInteger(parameterDay),'FROZEN_PARAMETER_CONTEXT_REQUIRED','input.parameterContext.effectiveDay','冻结参数生效日须为原整数日序');
  if(frozenContext&&r.selection?.startDay!==undefined)need(parameterDay===r.selection.startDay,
    'FROZEN_PARAMETER_CONTEXT_MISMATCH','input.parameterContext.effectiveDay','冻结参数日与所选运行起始日不一致',409);
  const active=effectiveParameters(d,parameterDay,'dataset');
  const pOrigin=active.find(p=>p['对象编号']==='GLOBAL'&&p['参数名称']==='分钟原点');
  if(pOrigin)need(!blockedParameter(pOrigin)&&pOrigin['参数值']===calendar.minuteOrigin,
    'MINUTE_ORIGIN_MISMATCH','parameters.分钟原点','所选原点不符第二P有效来源',409);
  need(calendar.dayZero==='2026-10-31','DAY_ZERO_UNSUPPORTED','calendar.dayZero','当前Excel模型日序原点固定10.31；其他模型待适配');
  const issues=parameterIssues(d,{completeness:false}).filter(i=>i.severity==='error');
  need(!issues.length,'PARAMETER_CONTRACT_BLOCKED','parameters',JSON.stringify(issues));
  applyParameters(d,parameterDay,'dataset');
  if(frozenContext&&source.input.effectiveParameters)need(rawHash(d.effectiveParameters)===rawHash(source.input.effectiveParameters),
    'FROZEN_PARAMETERS_MISMATCH','input.effectiveParameters','冻结有效参数与原P层/上下文不一致，不能换成当前P',409);
  const archive=clean({definitions:d.parameterDefinitions,categories:d.parameterCategories??[],annotations:d.parameterAnnotations??{},
    layers:source.input.tables['配置参数'],candidates:d.parameterCandidates??[],candidateDefinitions:d.parameterCandidateDefinitions??[],pending:d.parameterPending??[],
    active:active.map(p=>({...p,blocked:!!blockedParameter(p)})),effectiveDay:parameterDay,simulationDay:day,precedenceVersion:d.parameterPrecedence,
    sources:d.parameterSources,baseline:d.parameterBaseline??null,context:source.input.parameterContext??null,
    resolvedFrozenContext:frozenContext,contextSource:source.input.parameterContext?'parameterContext':frozenContext?'effectiveParameters':'explicit-simulation-day',
    frozenEffectiveParameters:source.input.effectiveParameters??null,
    frozenEffectiveParametersHash:source.input.effectiveParameters?rawHash(source.input.effectiveParameters):null,resolutionDay:parameterDay,
    resolutionScope:'dataset',sourceLayersHash:rawHash(source.input.tables['配置参数'])});
  return {input:d,day,active,archive,parameterHash:fingerprint(archive)};
}
