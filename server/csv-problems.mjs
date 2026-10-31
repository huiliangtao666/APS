import {createHash} from 'node:crypto';
import {inputHash} from './run-input.mjs';
import {bindProblemSource,sourceRefs} from '../src/lib/problem-records.mjs';

// Only server-parsed files and the exact checked rows may establish provenance.
export function checkedCsvSources(data,saved={},parsed={}){
 return {...saved,...Object.fromEntries(Object.entries(parsed).map(([table,csv])=>[table,{
  ...csv,sha256:createHash('sha256').update(csv.originalText).digest('hex'),canonicalRows:data[table]
 }]))};
}

// Parser locations are physical; validators use logical rows. Keep that boundary
// explicit, including header/format errors that do not identify a parsed record.
export function csvProblemEvidence(body,inspection,state,defs,{physical=false}={}){
 const data=body.checkedInput?.data||{...state.data,...inspection.tables};
 const source=body.checkedInput||{domain:'candidate:current',inputVersionId:inputHash(data),revision:state.revision,checkedAt:new Date().toISOString(),scope:'CSV proposed input validation',data};
 const {data:checkedData,...context}=source;
 const csvSources=checkedCsvSources(data,state.csvSources,inspection.sources);
 const findings=(body.findings||body.issues||[]).map(issue=>{
  const table=issue.table||defs.find(d=>d.file===issue.file)?.key,csv=csvSources[table];
  const parsed=inspection.sources[table];
  const index=physical?parsed?.lines.indexOf(issue.row):Number.isInteger(issue.row)&&issue.row>=2?issue.row-2:undefined;
  let refs=issue.relatedRecords;
  if(!refs&&Number.isInteger(index)&&index>=0&&data[table]?.[index]){
   refs=sourceRefs(table,[data[table][index]],data[table]);
  }
  const finding={...issue,table,code:issue.code||'CSV / CHECK',taskIds:issue.taskIds||[],message:issue.message||issue.reason,
   reason:issue.reason||issue.message||issue.code,relatedRecords:(refs||[]).map(ref=>({...ref,field:ref.field||issue.field}))};
  // Transition errors carry before/after domains. Never bind an old record to
  // the proposal just because it occupies the same position.
  const bound=body.checkedInputs?{...finding,relatedRecords:finding.relatedRecords.map(ref=>{
   const context=body.checkedInputs[ref.versionSide];
   if(!context)return ref;
   const sources=ref.versionSide==='before'?(state.csvSources||{}):csvSources;
   return bindProblemSource({relatedRecords:[ref]},ref.origin||context,undefined,undefined,sources).relatedRecords[0];
  })}:bindProblemSource(finding,context,undefined,undefined,csvSources);
  const same=Number.isInteger(index)&&index>=0&&csv?.canonicalRows?.[index]&&JSON.stringify(csv.canonicalRows[index])===JSON.stringify(data[table]?.[index]);
  const matching=bound.relatedRecords.filter(ref=>ref.table===table&&ref.origin?.occurrence.index===index);
  const position=body.checkedInputs?(matching.find(ref=>ref.versionSide==='after')||matching[0])?.csv:undefined;
  const line=physical?issue.row:position?.physicalRow??(same?csv.lines[index]:issue.row);
  return {...bound,file:physical?issue.file:position?.file||csv?.file||issue.file||defs.find(d=>d.key===table)?.file||'当前配置',row:line??0,index:Number.isInteger(index)&&index>=0?index:undefined,inBatch:!!parsed,
   ...(!bound.relatedRecords.length?{associationGap:issue.associationGap||'此位置未形成可验证的关联记录；请核查原文件表头或格式，不使用当前同行替代。'}:{})};
 });
 return {...body,issues:findings,findings,...(!body.checkedInputs?{checkedInput:source}:{})};
}
