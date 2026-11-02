import {assertProjection,canonical,digest,fail,previewSummary} from './workbook-preview.mjs';
import {createHash} from 'node:crypto';

const clip=(v,n=160)=>String(v??'').slice(0,n);
export function bounded(value,max){const bytes=Buffer.byteLength(JSON.stringify(value));if(bytes>max)fail('RESPONSE_TOO_LARGE',413,{bytes,max});return value;}
export function identify(v,q={}){
  assertProjection(v);
  if(Number(q.revision)!==v.binding.revision||q.summaryFingerprint!==v.summaryFingerprint)fail('FINGERPRINT_MISMATCH');
  return {previewId:v.binding.previewId,revision:v.binding.revision,summaryFingerprint:v.summaryFingerprint};
}
export function normalizeFilter(q={}){
  const filter={table:String(q.table||''),operation:String(q.operation||''),severity:String(q.severity||''),q:String(q.q||'').trim()};
  if(filter.q.length>200||filter.table.length>100||!['','create','replace','delete'].includes(filter.operation)||!['','error','warning'].includes(filter.severity))fail('FILTER_INVALID',422);
  return filter;
}
function matched(v,f){return v.records.filter(r=>(!f.table||r.table===f.table)&&(!f.operation||r.operation===f.operation)&&
  (!f.severity||v.reports.some(i=>i.severity===f.severity&&i.table===r.table&&(i.objectId===r.key||i.sourceRef.physicalRow===r.sourceRef.physicalRow&&i.sourceRef.physicalRow!==null)))&&
  (!f.q||canonical([r.table,r.key,r.sourceRef,r.fields.map(x=>[x.name,x.before,x.after])]).toLocaleLowerCase().includes(f.q.toLocaleLowerCase())));}
function page(v,items,q,kind,max=v.limits.maxPageSize){
  const n=q.pageSize===undefined?v.limits.pageSize:Number(q.pageSize);
  if(!Number.isSafeInteger(n)||n<1||n>max)fail('PAGE_SIZE_INVALID',422,{max});
  const filterHash=digest({kind,filter:normalizeFilter(q),group:q.groupId??null,record:q.changeId??null});
  let offset=0;
  if(q.cursor){let c;try{c=JSON.parse(Buffer.from(String(q.cursor),'base64url').toString());}catch{fail('CURSOR_INVALID',422);}
    if(c.fingerprint!==v.summaryFingerprint||c.filterHash!==filterHash||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>items.length)fail('CURSOR_INVALID',422);offset=c.offset;}
  const values=items.slice(offset,offset+n),next=offset+values.length;
  return {items:values,total:items.length,pageSize:n,filterHash,nextCursor:next<items.length?Buffer.from(JSON.stringify({fingerprint:v.summaryFingerprint,filterHash,offset:next})).toString('base64url'):null};
}
export function previewRecords(v,q){
  const id=identify(v,q),f=normalizeFilter(q),selection=matched(v,f),p=page(v,selection,q,'records');
  return bounded({...id,...p,normalizedFilter:f,fullBatchRecords:v.counts.records,items:p.items.map(r=>({
    changeId:r.changeId,layer:r.layer,table:r.table,key:r.key,operation:r.operation,changedFieldCount:r.changedFieldCount,
    sourceRef:r.sourceRef,recordHash:r.recordHash,labels:r.fields.filter(f=>f.changed).slice(0,2).map(f=>({name:f.name,value:clip(f.after.value)}))}))},v.limits.responseBytes);
}
function inlineValue(v,atom,fieldId,side){
  const text=canonical(atom.value),bytes=Buffer.byteLength(text);
  return bytes<=v.limits.inlineBytes?atom:{present:atom.present,value:null,truncated:true,valueRef:{fieldId,side},encoding:'canonical-json',length:text.length,bytes,hash:digest(atom.value)};
}
export function previewFields(v,q){
  const id=identify(v,q),r=v.records.find(r=>r.changeId===q.changeId);if(!r)fail('RECORD_NOT_FOUND',404);
  const p=page(v,r.fields,q,'fields');
  return bounded({...id,...p,changeId:r.changeId,key:r.key,table:r.table,changedFieldCount:r.changedFieldCount,
    items:p.items.map(f=>({...f,before:inlineValue(v,f.before,f.fieldId,'before'),after:inlineValue(v,f.after,f.fieldId,'after'),
      formula:inlineValue(v,{present:f.formula!==null,value:f.formula},f.fieldId,'formula')}))},v.limits.responseBytes);
}
export function previewValue(v,q){
  const id=identify(v,q),r=v.records.find(r=>r.changeId===q.changeId),f=r?.fields.find(f=>f.fieldId===q.fieldId);
  if(!f||!['before','after','formula'].includes(q.side))fail('VALUE_NOT_FOUND',404);
  const value=q.side==='formula'?f.formula:f[q.side].value,text=canonical(value),offset=Number(q.offset||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>text.length)fail('VALUE_OFFSET_INVALID',422);
  const chunk=text.slice(offset,offset+v.limits.valueChunk);
  return {...id,encoding:'canonical-json',chunk,offset,total:text.length,nextOffset:offset+chunk.length<text.length?offset+chunk.length:null,hash:digest(value)};
}
export function previewIssues(v,q){
  const id=identify(v,q),f=normalizeFilter(q),reports=v.reports.filter(i=>(!f.table||i.table===f.table)&&(!f.severity||i.severity===f.severity)&&(!f.q||canonical(i).toLowerCase().includes(f.q.toLowerCase())));
  const groups=new Map();for(const i of reports){let g=groups.get(i.groupId);if(!g){g={groupId:i.groupId,code:i.code,kind:i.kind,severity:i.severity,table:i.table,objectId:i.objectId,field:i.field,message:clip(i.message,500),rawReports:0,locations:new Set(),remedy:i.remedy};groups.set(i.groupId,g);}g.rawReports++;g.locations.add(i.locationId);}
  const values=[...groups.values()].map(g=>({...g,uniqueLocations:g.locations.size,locations:undefined})).sort((a,b)=>(a.severity==='error'?0:1)-(b.severity==='error'?0:1)||a.groupId.localeCompare(b.groupId));
  return bounded({...id,...page(v,values,q,'issues',v.limits.maxGroups),rawReports:reports.length},v.limits.responseBytes);
}
export function previewLocations(v,q){
  const id=identify(v,q),reports=v.reports.filter(i=>i.groupId===q.groupId),locations=new Map();
  for(const i of reports){let l=locations.get(i.locationId);if(!l){l={locationId:i.locationId,sourceRef:i.sourceRef,objectId:i.objectId,field:i.field,sourceValue:clip(i.sourceValue,500),reportIds:[],remedy:i.remedy};locations.set(i.locationId,l);}l.reportIds.push(i.reportId);}
  return bounded({...id,...page(v,[...locations.values()],q,'locations')},v.limits.responseBytes);
}

export function previewAnchors(v,q){
  const id=identify(v,q),values=v.anchors.filter(a=>a.groupId===q.groupId&&(!q.section||a.section===q.section));
  return bounded({...id,...page(v,values,{...q,q:q.section||''},'anchors')},v.limits.responseBytes);
}

/** Lossless NDJSON stream. Manifest has identity/counts; trailer certifies completion
 * and SHA256 of all prior UTF-8 lines. Missing trailer always means incomplete.
 * JSON strings do not execute spreadsheet formulae; values retain type/presence.
 */
export function* exportWorkbookPreview(v,q){
  identify(v,q);if(!v.exportAvailable)fail('EXPORT_UNAVAILABLE',503);
  if(!['ALL','FILTERED'].includes(q.scope))fail('EXPORT_SCOPE_REQUIRED',422);
  const filter=normalizeFilter(q),records=q.scope==='ALL'?v.records:matched(v,filter),ids=new Set(records.map(r=>r.changeId));
  const reports=q.scope==='ALL'?v.reports:v.reports.filter(i=>(!filter.table||i.table===filter.table)&&(!filter.severity||i.severity===filter.severity)&&(!filter.q||canonical(i).toLowerCase().includes(filter.q.toLowerCase())||records.some(r=>r.table===i.table&&String(r.key)===String(i.objectId))));
  // ALL includes reports with no changed record. FILTERED explicitly describes its two populations.
  const reportIds=new Set(reports.map(r=>r.reportId));
  const counts={records:records.length,changedFieldCount:records.reduce((n,r)=>n+r.changedFieldCount,0),fields:records.reduce((n,r)=>n+r.fields.length,0),rawReports:reports.length,uniqueLocations:new Set(reports.map(r=>r.locationId)).size,groups:new Set(reports.map(r=>r.groupId)).size,sources:v.anchors.filter(a=>reportIds.has(a.reportId)).length};
  const sha=createHash('sha256');let bytes=0;
  const line=value=>{const s=JSON.stringify(value)+'\n';sha.update(s);bytes+=Buffer.byteLength(s);return s;};
  yield line({kind:'manifest',schemaVersion:1,binding:v.binding,summaryFingerprint:v.summaryFingerprint,scope:q.scope,
    filter:q.scope==='ALL'?null:filter,filterHash:digest(q.scope==='ALL'?null:filter),counts,sourceFiles:v.sourceFiles,simulation:v.simulation,
    allRecordFields:true,valueEncoding:'typed-json-with-presence',reportSelection:'ALL or issue-filter plus matching-record identities',complete:false});
  for(const r of records){yield line({kind:'record',...r,fields:undefined});for(const f of r.fields)yield line({kind:'field',changeId:r.changeId,...f});}
  for(const report of reports)yield line({kind:'report',...report});
  for(const anchor of v.anchors)if(reportIds.has(anchor.reportId))yield line({kind:'source',...anchor});
  yield JSON.stringify({kind:'completion',complete:true,counts,contentBytes:bytes,contentSha256:sha.digest('hex'),recordIdentityDigest:digest([...ids])})+'\n';
}

export function readWorkbookPreview(p,q,kind='summary',access={}){
  const v=assertProjection(p.previewModule);
  if(kind==='summary')return bounded(previewSummary(p,access),v.limits.summaryBytes);
  return ({records:previewRecords,fields:previewFields,value:previewValue,issues:previewIssues,locations:previewLocations,anchors:previewAnchors}[kind]||(()=>fail('VIEW_NOT_FOUND',404)))(v,q);
}
