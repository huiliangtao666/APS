import {urgentFactTime} from './urgent-run-eligibility.mjs';
export const urgentImportFields=['需求编号','需求日','客户编号','客户名称','区域编号','区域名称','客户等级','成品编号','成品名称','需求箱数','每箱净重千克','需求千克','最早到货日','最晚到货日','按要求日最晚发运日','到货剩余保质天数','范围'];
export function adoptedUrgentBatchIds(plan,headResult){
 return new Set([...(headResult?.urgentOrder?.batchIds||[]),...(plan?.planVersions||[]).flatMap(v=>v.batchIds||[])]);
}
const value=v=>v===undefined||v===null?'':String(v);
const fields=row=>Object.fromEntries(urgentImportFields.map(f=>[f,row?.[f]??'']));

// Compare resolved business values rather than file bytes or source row order.
// Each incoming ID updates one pending insertion; absent IDs remain in place.
export function reviewUrgentImport(plan,demands,{originalDemandIds=[],headResult,effectiveDay,effectiveMinute}={}){
 const adopted=adoptedUrgentBatchIds(plan,headResult),original=new Set([...(plan.originalDemandIds||[]),...originalDemandIds]);
 const active=new Map(),adoptedIds=new Set();
 for(const b of plan.batches||[])for(const r of b.demands){
  if(adopted.has(b.id)||b.adoptedRunId)adoptedIds.add(r['需求编号']);
  if(b.status!=='withdrawn')active.set(r['需求编号'],{batch:b,row:r});
 }
 const records=demands.map(row=>{
  const id=row['需求编号'],current=active.get(id),before=current?fields(current.row):null,after=fields(row);
  const changedFields=current?urgentImportFields.filter(f=>value(before[f])!==value(after[f])):[];
  if(current&&(plan.timeUnit==='day'?current.batch.effectiveDay!==effectiveDay:current.batch.effectiveMinute!==effectiveMinute)){
   changedFields.push('插单生效时间');const clock={result:{...headResult,timeUnit:plan.timeUnit,dayZero:plan.dayZero||headResult?.dayZero,minuteOrigin:plan.minuteOrigin||headResult?.minuteOrigin}};
   before['插单生效时间']=urgentFactTime(plan.timeUnit==='day'?current.batch.effectiveDay:current.batch.effectiveMinute,clock)||String(plan.timeUnit==='day'?current.batch.effectiveDay:current.batch.effectiveMinute);
   after['插单生效时间']=urgentFactTime(plan.timeUnit==='day'?effectiveDay:effectiveMinute,clock)||String(plan.timeUnit==='day'?effectiveDay:effectiveMinute);
  }
  let action=current?(changedFields.length?'update':'unchanged'):'add',reason='';
  if(original.has(id)){action='blocked';reason='与基线原需求编号相同，不能通过插单导入覆盖；请使用新的插单需求编号。';}
  else if(adoptedIds.has(id)&&action!=='unchanged'){action='blocked';reason='该插单已随排程结果采用生效，不能覆盖；请使用新的插单需求编号。';}
  return {id,action,batchId:current?.batch.id||null,before,after,changedFields,reason};
 });
 return {added:records.filter(r=>r.action==='add').length,updated:records.filter(r=>r.action==='update').length,unchanged:records.filter(r=>r.action==='unchanged').length,blocked:records.filter(r=>r.action==='blocked').length,records};
}
