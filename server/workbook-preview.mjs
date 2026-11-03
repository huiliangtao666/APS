import {createHash} from 'node:crypto';
import {hash,workbookSchema} from './workbook-model.mjs';
import {commitBinding,importChanges} from './workbook-workbench.mjs';
import {sourceRole} from './parameter-contract.mjs';

// A derivative of the existing preview/dataRef, never a dataset or commit ledger.
// Engineering limits, not business defaults or measured production SLOs.
export const previewLimits=Object.freeze({pageSize:25,maxPageSize:100,maxGroups:50,
  inlineBytes:1024,valueChunk:4096,responseBytes:256*1024,summaryBytes:128*1024,
  maxRecords:100000,maxFields:2000000,maxProjectionBytes:128*1024*1024,ttlMs:30*60*1000});
export const PREVIEW_RULES='workbook-preview-first-stage:1';
export class PreviewError extends Error {
  constructor(code,status=409,detail={}){super(code);this.code=code;this.status=status;this.detail=detail;}
}
export const fail=(code,status,detail)=>{throw new PreviewError(code,status,detail);};
export function canonical(v){
  if(v===undefined)return '["missing"]';
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
// Incremental canonical hashing avoids allocating a second full projection string
// inside the bounded 128MiB module-test heap.
export function digest(v){
  const h=createHash('sha256');
  const visit=x=>{if(x===undefined){h.update('["missing"]');return;}
    if(x===null||typeof x!=='object'){h.update(JSON.stringify(x));return;}
    if(Array.isArray(x)){h.update('[');x.forEach((item,i)=>{if(i)h.update(',');visit(item);});h.update(']');return;}
    h.update('{');Object.keys(x).sort().forEach((k,i)=>{if(i)h.update(',');h.update(JSON.stringify(k)+':');visit(x[k]);});h.update('}');};
  visit(v);return h.digest('hex');
}
const own=(o,k)=>!!o&&Object.hasOwn(o,k);
const copy=v=>v&&typeof v==='object'?structuredClone(v):v;
const keyOf=(table,r,spec)=>table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[spec?.key]??'');
export function sourceRef(data,table,row,field){
  const online=row?._origin||row?._overlayRef||row?._source?.kind==='维护'||row?._source?.role==='EDIT';
  const cell=row?._cells?.[field]||null;
  const excelRow=!!row&&(Object.keys(row._cells||{}).length>0||Number.isSafeInteger(row._source?.row));
  return {sourceKind:online?'online':excelRow?'excel':row?'derived':'missing-record',
    fileHash:row?._source?.fileHash||data?.fileHash||null,fileName:row?._source?.fileName||data?.businessFileName||data?.name||null,sheet:row?._source?.sheet||table,
    physicalRow:!online&&excelRow&&Number.isSafeInteger(row?._source?.row??row?._row)?(row?._source?.row??row._row):null,cell:online?null:cell,
    businessKey:row?keyOf(table,row,workbookSchema.tables[table]):null,
    overlayRef:row?._overlayRef||null,absenceReason:online?'应用维护记录，无Excel物理坐标':cell?null:'来源未提供物理单元格'};
}
// Row identity, workbook hashes and file names repeat for every cell. Store those
// once per changed row; restore the original public field shape only for a page
// or one export line. Legacy persisted projections keep working unchanged.
export function expandPreviewField(record,field){
  if(!field.sourceCells)return field;
  const {sourceCells,...value}=field;
  return {...value,sourceRefs:sourceCells.map(([cell,absenceReason],i)=>({
    ...record.rowSourceRefs[i],cell,absenceReason}))};
}
function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze);}return v;}
export function bindingOf(p){return {previewId:p.id,revision:1,model:'workbook',datasetId:p.datasetId,
  expectedVersion:p.expectedVersion,fileHash:p.fileHash,importKind:p.requestedKind||p.importKind||'mixed',
  mode:p.mode||'candidate',scope:p.scope||'dataset',effectivePeriod:p.effectivePeriod??null,
  profile:p.profile,snapshotHash:p.snapshotHash,previewFingerprint:p.previewFingerprint??null,
  mappingHash:p.mappingHash??null,parameterHash:p.parameterHash??null,overlayHash:digest(p.overlay||[]),
  overlayResolution:p.overlayResolution||'keep',owner:p.owner??null,rulesVersion:PREVIEW_RULES};}

/** Call once after bindPreview(p); persist result on p.previewModule in the SAME state write.
 * data and before must be the exact dataRef/base-version snapshots (not live data).
 * Validate all rows before this call. Never create a projection from a sampled changeSet.
 */
export function buildWorkbookPreview(p,{data,before=null,now=Date.now(),limits=previewLimits,maintenanceEntries={}}={}){
  if(!data||hash(data)!==p.snapshotHash||data.id!==p.datasetId||data.version!==p.expectedVersion+1)
    fail('PREVIEW_DATA_CHANGED');
  if(before&&(before.id!==p.datasetId||before.version!==p.expectedVersion))fail('BASE_VERSION_CHANGED');
  if(p.expectedVersion>0&&!before)fail('BASE_SNAPSHOT_REQUIRED',422);
  const records=[],seen=new Set();let changedFieldCount=0,fieldCount=0,recordBytes=0;
  const tableCounts=new Map([...new Set([...Object.keys(data.tables||{}),...Object.keys(before?.tables||{})])]
    .map(table=>[table,{table,kind:workbookSchema.tables[table]?.kind||'unknown',inputRecords:(data.tables?.[table]||[]).length+(table==='配置参数'?(data.parameterCandidates||[]).length:0),records:0,create:0,replace:0,delete:0,changedFieldCount:0}]));
  const indexes=new Map();
  function lookup(d,table,key,layer){
    if(!d)return [];
    const token=(d===data?'after:':'before:')+table+':'+layer;
    if(!indexes.has(token)){
      const map=new Map(),spec=workbookSchema.tables[table];
      for(const r of (layer==='candidate'?d.parameterCandidates:d.tables?.[table])||[]){const k=table==='配置参数'&&data.parameterContract?
        [sourceRole(r),r._scope||'dataset',r['参数编号'],r['生效日'],r['失效日']].join('|'):keyOf(table,r,spec);
        const list=map.get(k)||[];list.push(r);map.set(k,list);}
      indexes.set(token,map);
    }
    return indexes.get(token).get(String(key))||[];
  }
  const effectiveChanges=importChanges(before,data);
  if(digest(effectiveChanges)!==digest(p.changeSet||[]))fail('CHANGESET_INCOMPLETE',422);
  const candidateView=d=>({parameterContract:d?.parameterContract,tables:{'配置参数':d?.parameterCandidates||[]}});
  const changes=[...effectiveChanges.map(c=>({...c,layer:'effective'})),
    ...importChanges(candidateView(before),candidateView(data)).map(c=>({...c,layer:'candidate'}))];
  for(const c of changes){
    const spec=workbookSchema.tables[c.table];if(!spec)fail('UNKNOWN_TABLE',422);
    const identity=canonical([c.layer,c.table,c.key]);if(seen.has(identity))fail('DUPLICATE_CHANGE',422,{table:c.table,key:c.key});seen.add(identity);
    const aa=lookup(before,c.table,c.key,c.layer),bb=lookup(data,c.table,c.key,c.layer);
    if(aa.length>1||bb.length>1)fail('DUPLICATE_SOURCE_KEY',422,{table:c.table,key:c.key});
    const a=aa[0],b=bb[0];if(!a&&!b)fail('CHANGE_SOURCE_MISSING',422,{table:c.table,key:c.key});
    const operation=!a?'create':!b?'delete':'replace';
    if(operation!==c.operation)fail('CHANGE_OPERATION_MISMATCH',422);
    // Full union of fields actually present in either row. Schema-only optional
    // fields absent on BOTH sides have no record value and need no serialized row.
    const rowSourceRefs=[sourceRef(data,c.table,b,spec.key),...(a?[sourceRef(before,c.table,a,spec.key)]:[])];
    const fields=spec.fields.filter(f=>own(a,f.name)||own(b,f.name)).map(f=>{const av=own(a,f.name),bv=own(b,f.name);return {
      fieldId:digest([c.table,c.key,f.name]),name:f.name,type:f.type||'text',unit:f.unit??null,
      before:{present:av,value:av?copy(a[f.name]):null},after:{present:bv,value:bv?copy(b[f.name]):null},
      changed:f.name!==spec.key&&(av!==bv||canonical(a?.[f.name])!==canonical(b?.[f.name])),
      formula:b?._formulas?.[f.name]??a?._formulas?.[f.name]??null,
      sourceCells:[sourceRef(data,c.table,b,f.name),...(a?[sourceRef(before,c.table,a,f.name)]:[])]
        .map(ref=>[ref.cell,ref.absenceReason])};});
    const count=fields.filter(f=>f.changed).length;
    const source=sourceRef(b?data:before,c.table,b||a,spec.key);
    const record={changeId:digest([c.layer,c.table,c.key,operation]),layer:c.layer,table:c.table,key:c.key,operation,
      changedFieldCount:count,sourceRef:source,rowSourceRefs,fields};
    record.recordHash=digest(record);records.push(record);changedFieldCount+=count;fieldCount+=fields.length;
    recordBytes+=Buffer.byteLength(JSON.stringify(record));
    if(recordBytes>limits.maxProjectionBytes)fail('INPUT_TOO_LARGE',413,{recordBytes,limit:limits.maxProjectionBytes});
    const tc=tableCounts.get(c.table)||{table:c.table,kind:spec.kind,inputRecords:(data.tables?.[c.table]||[]).length+(c.table==='配置参数'?(data.parameterCandidates||[]).length:0),records:0,create:0,replace:0,delete:0,changedFieldCount:0};
    tc.records++;tc[operation]++;tc.changedFieldCount+=count;tableCounts.set(c.table,tc);
    if(records.length>limits.maxRecords||fieldCount>limits.maxFields)fail('INPUT_TOO_LARGE',413,{records:records.length,fieldCount,limits});
  }
  records.sort((a,b)=>canonical([a.table,a.key,a.operation,a.changeId]).localeCompare(canonical([b.table,b.key,b.operation,b.changeId]),'en'));
  const reports=[];
  // Import blockers and scheduling readiness are separate responsibilities.
  for(const [kind,values]of [['validation',p.issues||[]],['warning',p.warnings||[]],['readiness',p.readiness?.issues||[]]])
    for(const [i,issue]of values.entries()){
      const table=issue.sheet||issue.table||'',row=(data.tables?.[table]||[]).find(r=>r._row===issue.row||String(r[workbookSchema.tables[table]?.key])===String(issue.record));
      let src=sourceRef(data,table,row,issue.field);
      if(issue.cell&&!row?._origin)src={...src,sourceKind:'excel',cell:issue.cell,physicalRow:issue.row>0?issue.row:null};
      const objectId=issue.objectId||issue.record||src.businessKey||null;
      reports.push({reportId:kind+':'+i,kind,blocksCommit:kind==='validation'&&issue.severity!=='warning',
        code:issue.code||'INPUT_INVALID',severity:kind==='warning'?'warning':issue.severity||'error',
        table,objectId,field:issue.field||'',message:issue.message||'',sourceRef:src,
        sourceValue:own(issue,'sourceValue')?copy(issue.sourceValue):row&&own(row,issue.field)?copy(row[issue.field]):null,
        expectedCondition:issue.expectedCondition||null,validator:issue.validator||kind,
        groupId:digest([kind,issue.code,p.datasetId,p.expectedVersion,table,objectId,issue.field,p.scope,issue.severity]),
        locationId:digest([kind,issue.code,objectId,issue.field,src]),
        remedy:registeredMaintenance(readinessRemedy(issue,{objectId,table}),maintenanceEntries)});
    }
  const createdAt=new Date(now).toISOString(),expiresAt=new Date(now+limits.ttlMs).toISOString();
  // Related anchors never inflate report counts. G03's aggregate report remains
  // one report while feed / physical pool / WIP source rows can be paged separately.
  let derivedBytes=recordBytes+Buffer.byteLength(JSON.stringify(reports));
  if(derivedBytes>limits.maxProjectionBytes)fail('INPUT_TOO_LARGE',413,{derivedBytes,limit:limits.maxProjectionBytes});
  const anchors=[];
  for(const report of reports){
    const add=(table,row,field,section)=>{const anchor={anchorId:digest([report.reportId,section,table,row._row,field]),reportId:report.reportId,
      groupId:report.groupId,section,sourceRef:sourceRef(data,table,row,field),businessKey:keyOf(table,row,workbookSchema.tables[table]),
      field,currentValue:copy(row[field]??null)};derivedBytes+=Buffer.byteLength(JSON.stringify(anchor));
      if(derivedBytes>limits.maxProjectionBytes)fail('INPUT_TOO_LARGE',413,{derivedBytes,limit:limits.maxProjectionBytes});anchors.push(anchor);};
    if(report.code==='G01')report.sourceRef={...report.sourceRef,sourceKind:'dataset-selection',physicalRow:null,cell:null,absenceReason:'产线为数据集显式映射，无Excel物理坐标'};
    if(report.code==='G02'){
      const material=(data.tables?.['物料主数据']||[]).find(r=>r['物料编号']===report.objectId);
      if(material)add('物料主数据',material,'物料编号','route-source');
    }
    if(report.code==='G03'){
      const aggregate=report.remedy.section==='feed/physical-pool/wip';
      for(const r of data.tables?.['物料清单']||[])if(aggregate||report.table==='物料清单'&&r['用量关系编号']===report.objectId)add('物料清单',r,'投料位置','feed');
      for(const r of data.tables?.['设备与工装']||[])if(r['资源类别']==='工装'&&(aggregate||report.table==='设备与工装'&&r['资源编号']===report.objectId))add('设备与工装',r,'资源编号','physical-pool');
      for(const r of data.tables?.['期初在制']||[])if(aggregate||report.table==='期初在制'&&r['在制批次编号']===report.objectId)add('期初在制',r,'当前工序编号','wip');
    }
  }
  for(const t of tableCounts.values())t.unchangedRecords=Math.max(0,t.inputRecords-t.create-t.replace);
  const core={binding:bindingOf(p),createdAt,expiresAt,limits,records,reports,anchors,
    validationDigest:digest(p.issues||[]),warningsDigest:digest(p.warnings||[]),
    counts:{records:records.length,changedFieldCount,fieldCount,rawReports:reports.length,
      blockingReports:reports.filter(r=>r.blocksCommit).length,warnings:reports.filter(r=>r.severity==='warning').length,
      uniqueLocations:new Set(reports.map(r=>r.locationId)).size,groups:new Set(reports.map(r=>r.groupId)).size},
    tables:[...tableCounts.values()],sourceFiles:copy(p.sourceFiles||[]),simulation:data.mapping?.mock===true,
    countsComplete:true,exportAvailable:true};
  const projectionBytes=Buffer.byteLength(JSON.stringify(core));
  if(projectionBytes>limits.maxProjectionBytes)fail('INPUT_TOO_LARGE',413,{projectionBytes,limit:limits.maxProjectionBytes});
  return freeze({...core,projectionBytes,summaryFingerprint:digest(core)});
}

export function readinessRemedy(issue,{objectId,table}={}){
  const fallback='修正原业务Excel，在A1业务卡重新上传、预览并确认；保存后重新检查就绪';
  if(issue.code==='G01')return {section:'line',capability:'UNAVAILABLE',entryId:null,table:null,exactKeyFilter:null,
    businessLocation:'A1 / 生产 / 产线与资源映射',reason:'真实产线与资源映射维护尚未实现；仿真采用不是生产映射',fallback};
  if(issue.code==='G02')return {section:'route',capability:'UNAVAILABLE',entryId:null,table:'工艺路线',
    exactKeyFilter:{field:'成品编号',value:objectId},businessLocation:'A1 / 生产 / 工艺路线',
    reason:'须注册并核实既有真实维护入口；不得修改制造属性或删除物料规避',fallback};
  if(issue.code==='G03')return {section:table==='期初在制'?'wip':table==='设备与工装'?'physical-pool':table==='物料清单'?'feed':'feed/physical-pool/wip',
    capability:'UNAVAILABLE',entryId:null,table,exactKeyFilter:null,businessLocation:'A1 / 生产 / 产线与资源映射',
    reason:'投料点、物理池、WIP剩余分别缺真实维护能力；既有WIP事实不等于剩余映射',fallback};
  return {capability:'UNAVAILABLE',entryId:null,table,reason:'按来源更正；无已注册真实维护入口',fallback};
}

/** Server-owned registry ONLY. A live existing route plus runtime verification is
 * required; source presence, a mock editor or a client-provided URL is insufficient.
 * First-stage G01/G03 always remain unavailable; no new mapping lifecycle is added.
 */
export function registeredMaintenance(remedy,entries){
  const entry=entries?.[remedy.section];
  if(remedy.section!=='route'||!entry||entry.table!=='工艺路线'||entry.origin!=='existing'||entry.verification!=='RUNTIME_VERIFIED'||typeof entry.handler!=='function'||typeof entry.id!=='string')return remedy;
  return {...remedy,capability:'SUPPORTED',entryId:entry.id,reason:'已有真实工艺路线入口；保存增版后须返回重新预览/检查'};
}

export function assertProjection(v){if(!v?.countsComplete)fail('PREVIEW_NOT_READY',422);return v;}
export function previewSummary(p,{now=Date.now(),canExport=true}={}){
  const v=assertProjection(p.previewModule),expired=now>=Date.parse(v.expiresAt);
  const reasons=[...(expired?['PREVIEW_EXPIRED']:[]),...(v.counts.blockingReports?['VALIDATION_BLOCKED']:[]),
    ...(!v.exportAvailable||!canExport?['EXPORT_UNAVAILABLE']:[]),...(p.status==='committed'?['ALREADY_COMMITTED']:[])];
  return {previewId:p.id,revision:v.binding.revision,summaryFingerprint:v.summaryFingerprint,binding:v.binding,
    createdAt:v.createdAt,expiresAt:v.expiresAt,counts:v.counts,tables:v.tables,countsComplete:v.countsComplete,
    exportAvailable:v.exportAvailable&&canExport,simulation:v.simulation,sourceFiles:v.sourceFiles,
    status:p.status==='committed'?'COMMITTED':expired?'EXPIRED':v.counts.blockingReports?'READY_BLOCKED':'READY',
    canCommit:reasons.length===0,reasons,result:p.status==='committed'?{previewId:p.id,datasetId:p.datasetId,version:p.version,status:'committed'}:null,limits:v.limits};
}

export function confirmationPayload(summary,{reason,idempotencyKey,acknowledgedWarnings=false,acknowledgedReplaceDelete=false}={}){
  const b=summary.binding;return {previewId:b.previewId,revision:b.revision,datasetId:b.datasetId,
    expectedVersion:b.expectedVersion,fileHash:b.fileHash,importKind:b.importKind,mode:b.mode,scope:b.scope,
    effectivePeriod:b.effectivePeriod,previewFingerprint:b.previewFingerprint,summaryFingerprint:summary.summaryFingerprint,
    overlayResolution:b.overlayResolution,fullBatchScope:'ALL_CHANGES',acknowledgedWarnings,
    acknowledgedReplaceDelete,confirmedAll:true,reason,idempotencyKey};
}

/** Pure validation: no writes, no permission inference from a client payload.
 * Access must come from the existing authenticated server middleware.
 */
export function validatePreviewConfirmation(p,body,{actor,currentVersion,now=Date.now(),canEdit=false,canExport=false,csrfVerified=false}={}){
  if(!canEdit||!canExport||!csrfVerified)fail('FORBIDDEN',403);
  const v=assertProjection(p.previewModule);
  const {summaryFingerprint,projectionBytes,...content}=v;
  if(digest(content)!==summaryFingerprint||!Number.isFinite(projectionBytes))fail('PREVIEW_DATA_CHANGED');
  if(digest(p.issues||[])!==v.validationDigest||digest(p.warnings||[])!==v.warningsDigest)fail('VALIDATION_CHANGED');
  if(v.binding.owner!==null&&v.binding.owner!==actor)fail('PREVIEW_OWNER_CHANGED',403);
  const old=commitBinding(p,body,actor);if(old)fail(old.toUpperCase());
  if(digest(bindingOf(p))!==digest(v.binding))fail('BINDING_CHANGED');
  if(body.summaryFingerprint!==v.summaryFingerprint)fail('FINGERPRINT_MISMATCH');
  for(const k of ['previewId','revision','datasetId','expectedVersion','fileHash','importKind','mode','scope','effectivePeriod'])
    if(canonical(body[k])!==canonical(v.binding[k]))fail('BINDING_CHANGED',409,{field:k});
  if(now>=Date.parse(v.expiresAt))fail('PREVIEW_EXPIRED',410);
  if(p.status!=='preview')fail('PREVIEW_NOT_READY',409);
  if(!v.exportAvailable)fail('EXPORT_UNAVAILABLE',503);
  if(v.counts.blockingReports)fail('VALIDATION_BLOCKED',422,{blockingReports:v.counts.blockingReports});
  if(currentVersion!==v.binding.expectedVersion)fail('TARGET_CHANGED');
  if(body.fullBatchScope!=='ALL_CHANGES'||body.confirmedAll!==true||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)fail('WHOLE_BATCH_CONFIRMATION_REQUIRED',422);
  if(v.counts.warnings&&body.acknowledgedWarnings!==true)fail('WARNING_ACK_REQUIRED',422);
  if(v.records.some(r=>['replace','delete'].includes(r.operation))&&body.acknowledgedReplaceDelete!==true)fail('REPLACE_DELETE_ACK_REQUIRED',422);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(body.idempotencyKey||''))fail('IDEMPOTENCY_KEY_REQUIRED',422);
  for(const field of ['force','ignoreIssues','filter','selectedRecords','changes','changeSet'])if(own(body,field))fail('PARTIAL_OR_BYPASS_NOT_SUPPORTED',422,{field});
  return v;
}

/** Existing router's synchronous atomic transaction calls this, then writes returned
 * state ONCE. applyImport must use existing import/version/audit logic on this clone,
 * have no external effects, and return its existing committed result. An exception
 * discards the clone. No async callbacks or independent ledger are accepted.
 */
export function confirmWorkbookPreview(state,body,access,applyImport){
  if(!access?.canEdit||!access.canExport||!access.csrfVerified)fail('FORBIDDEN',403);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(body.idempotencyKey||''))fail('IDEMPOTENCY_KEY_REQUIRED',422);
  const requestHash=digest(body),prior=state.datasets.flatMap(d=>d.imports||[])
    .find(i=>i.confirmation?.actor===access.actor&&i.confirmation.key===body.idempotencyKey);
  if(prior){if(prior.confirmation.requestHash!==requestHash)fail('IDEMPOTENCY_CONFLICT');const {confirmation,...result}=prior;return {state,result:{...result,idempotent:true},write:false};}
  const original=state.previews.find(p=>p.id===body.previewId);if(!original)fail('PREVIEW_REMOVED',410);
  const currentVersion=state.datasets.find(d=>d.id===original.datasetId)?.versions.at(-1)?.version||0;
  validatePreviewConfirmation(original,body,{...access,currentVersion});
  const next=structuredClone(state),p=next.previews.find(p=>p.id===body.previewId);
  const result=applyImport(next,p,body);
  if(!result||typeof result.then==='function'||result.status!=='committed'||result.datasetId!==p.datasetId||result.version!==p.expectedVersion+1)fail('IMPORT_TRANSACTION_INVALID',500);
  const set=next.datasets.find(d=>d.id===p.datasetId),saved=set?.imports?.find(i=>i.previewId===p.id||result.importKey&&i.importKey===result.importKey);
  if(!saved||!set.versions.some(v=>v.version===result.version))fail('IMPORT_TRANSACTION_INVALID',500);
  p.status='committed';p.version=result.version;
  const receipt={...result,commitId:result.commitId||p.id,summaryFingerprint:p.previewModule.summaryFingerprint,
    mode:p.previewModule.binding.mode,checksInvalidated:true,
    disposition:p.previewModule.binding.importKind==='parameter'&&p.previewModule.binding.mode==='candidate'?'候选已保存，未采用':'已提交新版本，请重新检查就绪'};
  // Extend the EXISTING imports result. No second commit/operation ledger.
  Object.assign(saved,receipt,{confirmation:{actor:access.actor,key:body.idempotencyKey,requestHash}});
  return {state:next,result:receipt,write:true};
}

export function previewCommitStatus(state,{previewId,idempotencyKey},actor){
  const p=state.previews.find(p=>p.id===previewId);if(!p)fail('PREVIEW_REMOVED',410);
  if(p.previewModule?.binding.owner!==null&&p.previewModule?.binding.owner!==actor)fail('FORBIDDEN',403);
  const receipt=state.datasets.flatMap(d=>d.imports||[]).find(i=>i.previewId===p.id&&i.confirmation?.actor===actor&&i.confirmation.key===idempotencyKey);
  if(receipt){const {confirmation,...result}=receipt;return {status:'COMMITTED',result};}
  return {status:'NOT_COMMITTED',stillValid:previewSummary(p).canCommit};
}
