import {dayTaskProblems} from '../src/lib/urgent-day-task-problems.mjs';
import {explainFactFailure,factDate} from '../src/lib/urgent-fact-problems.mjs';
import {taskDispositionIssue} from '../src/lib/urgent-facts.mjs';
import {hash} from './workbook-model.mjs';
import {urgentError} from './urgent-order-input.mjs';
import {STATUS_POLICY} from './urgent-status-policy.mjs';

// The day planner packs finite capacity into fractional days. Keep that axis;
// the minuteOrigin on a legacy result belongs only to its CSV export.
export const DAY_ENGINE='workbook-day-v1';
export function dayPoint(value,origin='2026-10-31'){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw urgentError('URGENT_DAY_DATE','请填写有效日期（年-月-日）');
 const at=Date.parse(value+'T00:00:00Z'),point=(at-Date.parse(origin+'T00:00:00Z'))/86400000;
 if(!Number.isSafeInteger(point)||new Date(at).toISOString().slice(0,10)!==value)throw urgentError('URGENT_DAY_DATE','日期无效');
 return point;
}
export function dayExecutionLedger(base,body,previous,window){
 const shown=value=>value===undefined||value===null||value===''?'未填写':typeof value==='number'&&!Number.isFinite(value)?'无效数值':typeof value==='string'||typeof value==='number'?String(value):'格式无效';
 const kindName=value=>({none:'未发生/未锁定',consumed:'实际已耗/已交付',locked:'已锁定不可挪用'})[value]||'无效类型（'+shown(value)+'）';
 const fail=(code,message,context={})=>{const problem=explainFactFailure(code,message,context);throw urgentError(code,problem.message,{...context,factProblems:[problem]});};
 const sourceResultHash=hash(base),tasks=base.tasks||[],byId=new Map(tasks.map(t=>[t.id,t]));
 let observationDay;try{observationDay=dayPoint(body.observationDate??body.observationTime,base.dayZero);}catch(error){fail(error.code,error.message,{section:'observation'});}
 if(observationDay<window.startDay||observationDay>=window.endDay||previous&&observationDay<previous.observationDay)fail('URGENT_FACT_TIME',`本次观察日 ${body.observationDate??body.observationTime}；允许范围 ${factDate(window.startDay,base.dayZero)} 至 ${factDate(window.endDay-1,base.dayZero)}；已保存观察日 ${previous?factDate(previous.observationDay,base.dayZero):'无'}。`,{section:'observation'});
 if(!Array.isArray(body.tasks)||body.tasks.length!==tasks.length||new Set(body.tasks.map(f=>f.id)).size!==tasks.length)fail('URGENT_FACT_INCOMPLETE','提交的任务数量、编号或唯一性与当前基准不一致。');
 const dispositionIssue=taskDispositionIssue(tasks,body.tasks);if(dispositionIssue){const {code,message,...detail}=dispositionIssue;fail(code,message,{...detail,section:'task',key:detail.taskIds?.[0],taskId:detail.taskIds?.[0]});}
 const problems=body.tasks.flatMap(f=>dayTaskProblems(byId.get(f.id),f,observationDay,{origin:base.dayZero,window,previous:previous?.tasks.find(x=>x.id===f.id)}));
 if(problems.length)throw urgentError(problems[0].code,problems[0].message,{factProblems:problems});
 const facts=body.tasks.map(f=>{const task=byId.get(f.id),quantity=f.quantity??task.quantity;return {id:f.id,status:f.status,startDay:f.startDay??task.start,endDay:f.endDay??task.end,quantity,...(f.completionPercent!==undefined?{completionPercent:f.completionPercent}:{}),executedQuantity:f.status==='completed'?quantity:f.status==='started'?f.executedQuantity:0};});
 const completed=body.completed;
 if(!completed||typeof completed!=='object'||Array.isArray(completed))fail('URGENT_COMPLETED_MISSING','逐需求实际交付量没有完整提供。');
 for(const r of base.demandResults||[]){const q=completed[r.id];if(typeof q!=='number'||!Number.isFinite(q)||q<0||q>r.quantity||previous&&q<(previous.completed[r.id]||0))fail('URGENT_COMPLETED_INVALID',`需求 ${r.id} 本次填写 ${shown(q)} 千克，需求总量 ${r.quantity} 千克，已保存交付量 ${previous?.completed[r.id]||0} 千克。`,{demandId:r.id,key:r.id});}
 if(Object.keys(completed).some(id=>!base.demandResults.some(r=>r.id===id)))fail('URGENT_COMPLETED_INVALID','提交的交付记录包含当前基准中不存在的需求。');
 const allocations=body.allocations||((facts.every(f=>f.status==='not_started')&&Object.values(completed).every(q=>q===0))?(base.allocations||[]).map((a,index)=>({index,sourceHash:hash(a),quantity:0,kind:'none',feedDay:a.feedDay})):null);
 if(!Array.isArray(allocations)||allocations.length!==(base.allocations||[]).length||new Set(allocations.map(f=>f.index)).size!==allocations.length)fail('URGENT_CONSUMPTION_FACT_MISSING','供给记录的数量、编号或唯一性与当前基准不一致。');
 for(const f of allocations){
  const a=base.allocations[f.index],old=previous?.allocations?.find(x=>x.index===f.index);
  if(a&&f.sourceResultHash===sourceResultHash&&!f.sourceHash)f.sourceHash=hash(a);
  if(!a||f.sourceHash!==hash(a)||!['none','consumed','locked'].includes(f.kind)||typeof f.quantity!=='number'||!Number.isFinite(f.quantity)||f.quantity<0||f.quantity>a.quantity||!Number.isFinite(f.feedDay)||f.quantity>0&&(f.kind==='none'||f.feedDay<window.startDay||f.feedDay>=window.endDay)||f.kind==='consumed'&&Math.floor(f.feedDay)>observationDay)fail('URGENT_CONSUMPTION_FACT_INVALID',`供给 ${a?.supplyId||'来源不存在'}，本次实际量 ${shown(f.quantity)}，计划分配量 ${a?.quantity??'未知'}，类型 ${kindName(f.kind)}，日期 ${factDate(f.feedDay,base.dayZero)}。`,{key:String(f.index),demandId:a?.need,supplyId:a?.supplyId});
  if(old?.quantity>0&&(f.quantity<old.quantity||old.kind==='consumed'&&(f.kind!=='consumed'||f.feedDay!==old.feedDay)))fail('URGENT_CONSUMPTION_REGRESSION',`供给 ${a.supplyId} 已保存 ${old.quantity}，本次 ${f.quantity}；已保存类型 ${kindName(old.kind)}、日期 ${factDate(old.feedDay,base.dayZero)}，本次 ${kindName(f.kind)}、日期 ${factDate(f.feedDay,base.dayZero)}。`,{key:String(f.index),demandId:a.need,supplyId:a.supplyId});
 }
 for(const r of base.demandResults){const delivered=allocations.filter(f=>{const a=base.allocations[f.index];return f.kind==='consumed'&&a.consumer===r.id&&a.need===r.id&&a.materialId===r.productId;}).reduce((n,f)=>n+f.quantity,0);if(Math.abs(delivered-completed[r.id])>1e-6)fail('URGENT_COMPLETION_ALLOCATION',`需求 ${r.id} 的交付量为 ${completed[r.id]} 千克，成品实际耗用量为 ${delivered} 千克，两者不一致。`,{demandId:r.id,key:r.id});}
 const unlockedTaskIds=facts.filter(f=>f.status==='not_started'&&previous?.tasks.find(x=>x.id===f.id)?.status==='locked').map(f=>f.id);
 return {timeUnit:'day',statusPolicy:STATUS_POLICY,observationDay,tasks:facts,allocations:structuredClone(allocations),completed:structuredClone(completed),sourceResultHash,...(unlockedTaskIds.length?{unlockAudit:{taskIds:unlockedTaskIds,reason:typeof body.unlockReason==='string'&&body.unlockReason.trim()||'用户将已锁定任务改为未开工'}}:{})};
}
