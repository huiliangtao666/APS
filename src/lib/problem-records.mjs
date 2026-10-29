import {recordKeys} from './record-identity.mjs';
// Producers own associations. Never derive identifiers from translated messages/code names.
export function recordRefs(table, rows) {
 return rows.map(row=>({table,row:{...row}}));
}
export function attachProblemRecords(finding, data) {
 if(finding.taskIds?.length || Array.isArray(finding.relatedRecords))return finding;
 const {table,row}=finding;
 if(table && Number.isInteger(row) && row>=2 && data[table]?.[row-2])
  return {...finding,relatedRecords:recordRefs(table,[data[table][row-2]])};
 return {...finding,relatedRecords:[],associationGap:'问题来源未提供逐条关联记录；请提供表名及稳定记录身份后重新检查。'};
}
export function sourceRefs(table, rows, original=rows) {
 const keys=recordKeys[table]||[], nextOccurrence=new Map();
 return rows.map((row,index)=>{
  const sourceIndex=rows===original?index:original.indexOf(row,nextOccurrence.get(row)||0);
  nextOccurrence.set(row,sourceIndex+1);
  return {table,row:{...row},occurrence:{index:sourceIndex,logicalRow:sourceIndex+2,
   keyCount:original.filter(r=>keys.every(k=>(r[k]||'').trim()===(row[k]||'').trim())).length}};
 });
}
// Only explicit producer occurrences may be bound to a version. Legacy text stays legacy.
export function bindProblemSource(finding, source, original, sourceMap) {
 if(finding.taskIds?.length)return finding;
 return {...finding,source,relatedRecords:(finding.relatedRecords||[]).map(ref=>{
  if(!(ref.occurrence?.index>=0))return ref;
  let occurrence=ref.occurrence;
  if(sourceMap&&ref.sourceContext!=='executionContext'){
   const index=sourceMap[ref.table]?.[occurrence.index],rows=original?.[ref.table],keys=recordKeys[ref.table]||[];
   if(!Number.isInteger(index)||!rows?.[index]||JSON.stringify(rows[index])!==JSON.stringify(ref.row))return {...ref,origin:undefined};
   occurrence={index,logicalRow:index+2,keyCount:rows.filter(r=>keys.every(k=>(r[k]||'').trim()===(ref.row[k]||'').trim())).length};
  }
  if(ref.sourceContext==='executionContext'&&(!original?.[ref.table]?.[occurrence.index]||JSON.stringify(original[ref.table][occurrence.index])!==JSON.stringify(ref.row)))return {...ref,origin:undefined};
  return {...ref,origin:{...source,occurrence}};
 })};
}
export function currentRecord(ref, data, context={}) {
 const keys=recordKeys[ref.table],origin=ref.origin;
 const required=ref.table==='dependencies'?keys?.filter(k=>!['人员岗位编号','人员参与阶段'].includes(k)):keys;
 if(!keys?.length || required.some(k=>!ref.row[k]?.trim()) || !origin || origin.occurrence.keyCount!==1 || origin.domain!=='current')return null;
 const match=row=>keys.every(k=>(row[k]||'').trim()===(ref.row[k]||'').trim());
 // Follow existing audited input versions, checking key uniqueness at every transition.
 // A delete, rename, duplicate or missing audit chain never establishes inheritance.
 let version=origin.inputVersionId;
 const changes=(context.operations||[]).filter(r=>!r.trialId&&r.fromVersion&&r.toVersion&&r.batchId&&(Number.isInteger(r.toRevision)?r.toRevision>origin.revision:r.at>=origin.checkedAt));
 const batches=[...new Set(changes.map(r=>r.batchId))];
 for(const batch of batches){
  const group=changes.filter(r=>r.batchId===batch);
  if(group.some(r=>r.fromVersion!==version||r.toVersion!==group[0].toVersion))return null;
  for(const change of group.filter(r=>r.target===ref.table)){
   if(!change.before||!change.after||change.before.filter(match).length!==1||change.after.filter(match).length!==1)return null;
  }
  version=group[0].toVersion;
 }
 if(!version||version!==context.inputVersionId)return null;
 const matches=(data[ref.table]||[]).map((row,index)=>({row,index})).filter(({row})=>match(row));
 return matches.length===1?matches[0]:null;
}
