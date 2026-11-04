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
  return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,clean(v)]));
};

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
  const b=parse(business,'business'),p=parse(parameters,'parameters');
  need(b.datasetVersion===p.datasetVersion,'SOURCE_VERSION_MISMATCH','parameters','B/P版本必须明确兼容');
  let d=prepareBusinessImport({...b,id:identity.id,version:identity.version,name:business.name,fileHash:business.hash,
    profile:'excel-qualified-output-202611-r1',mapping:identity.mapping??null,parameterSources:[]},null);
  let merged;try{merged=integrateParameterImport(p,d,{...identity,name:business.name,expectedVersion:identity.version-1,fileHash:parameters.hash,adoptParameters:true,actor:'independent-source-copy',overlayResolution:'keep'});}
  catch(e){need(false,'PARAMETER_IMPORT_BLOCKED','parameters',e.message);}
  need(!merged.issues.some(i=>i.severity==='error'),'PARAMETER_IMPORT_BLOCKED','parameters',JSON.stringify(merged.issues));
  d=clean(merged.d);
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

export function resolveSource(source,calendar) {
  date(calendar.dayZero,'calendar.dayZero'); date(calendar.startDate,'calendar.startDate');
  minute(calendar.minuteOrigin,'calendar.minuteOrigin');
  need(calendar.minuteOrigin.endsWith('+08:00'),'TIMEZONE_UNSUPPORTED','calendar.minuteOrigin','须保留原来源时区');
  const d=clean(source.input),r=source.run,origin=r?.result?.minuteOrigin??r?.provenance?.minuteOrigin??d.minuteOrigin;
  need(d.profile==='excel-qualified-output-202611-r1','SOURCE_PROFILE_UNSUPPORTED','profile','此转换仅接既有Excel合格产出定额模型；标准投入kg模型须独立适配');
  const zero=r?.result?.dayZero??r?.provenance?.dayZero??d.dayZero;
  need(!origin||origin===calendar.minuteOrigin,'MINUTE_ORIGIN_MISMATCH','calendar.minuteOrigin','不能改写来源分钟原点',409);
  need(!zero||zero===calendar.dayZero,'DAY_ZERO_MISMATCH','calendar.dayZero','不能改写来源日序原点',409);
  need(d.parameterContract&&d.parameterSources?.some(s=>s.mode==='dataset'&&s.role==='P')&&d.parameterDefinitions?.length,
    'SECOND_P_REQUIRED','parameters','须含实际采用第二份P、完整目录定义及缺项，不接仅声明SECOND_P');
  need(!d.parameterContext?.scope||d.parameterContext.scope==='dataset','PARAMETER_SCOPE_UNSUPPORTED','parameters.scope','trial冻结须另行明确适配，不混入dataset');
  const day=(Date.parse(calendar.startDate+'T00:00:00Z')-Date.parse(calendar.dayZero+'T00:00:00Z'))/86400000;
  const active=effectiveParameters(d,day,'dataset');
  const pOrigin=active.find(p=>p['对象编号']==='GLOBAL'&&p['参数名称']==='分钟原点');
  if(pOrigin)need(!blockedParameter(pOrigin)&&pOrigin['参数值']===calendar.minuteOrigin,
    'MINUTE_ORIGIN_MISMATCH','parameters.分钟原点','所选原点不符第二P有效来源',409);
  need(calendar.dayZero==='2026-10-31','DAY_ZERO_UNSUPPORTED','calendar.dayZero','当前Excel模型日序原点固定10.31；其他模型待适配');
  const issues=parameterIssues(d,{completeness:false}).filter(i=>i.severity==='error');
  need(!issues.length,'PARAMETER_CONTRACT_BLOCKED','parameters',JSON.stringify(issues));
  applyParameters(d,day,'dataset');
  const archive=clean({definitions:d.parameterDefinitions,categories:d.parameterCategories??[],annotations:d.parameterAnnotations??{},
    layers:source.input.tables['配置参数'],candidates:d.parameterCandidates??[],candidateDefinitions:d.parameterCandidateDefinitions??[],pending:d.parameterPending??[],
    active:active.map(p=>({...p,blocked:!!blockedParameter(p)})),effectiveDay:day,precedenceVersion:d.parameterPrecedence,
    sources:d.parameterSources,baseline:d.parameterBaseline??null});
  return {input:d,day,active,archive,parameterHash:fingerprint(archive)};
}
