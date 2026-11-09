import {quantityMath as Q} from '../src/lib/material-allocation.mjs';
import {hash,dayMinute} from './workbook-model.mjs';

// Versioned, frozen with each daily input. Historical runs keep their rules.
export const STATUS_POLICY='daily-adjustable-started-v2';
const same=(a,b)=>hash(['start','end','quantity','machine','crew','people','tools'].map(k=>a[k]))===hash(['start','end','quantity','machine','crew','people','tools'].map(k=>b[k]));
export function changedTaskIds(policy,result,status){
 const facts=new Map(policy.facts.tasks.map(f=>[f.id,f])),available=[...result.tasks],changed=[];
 for(const t of policy.baselineTasks.filter(t=>facts.get(t.id)?.status===status)){
  const at=available.findIndex(x=>x.orderId===t.orderId&&x.productId===t.productId&&x.routeStepId===t.routeStepId&&same(t,x));
  if(at>=0)available.splice(at,1);else changed.push(t.id);
 }
 return changed;
}

export function attachStatusPolicy(d,p,base){
 if(p.facts.statusPolicy!==STATUS_POLICY||p.timeUnit!=='day')return d;
 const u=d.urgentOrder;
 u.statusPolicy={version:STATUS_POLICY,facts:structuredClone(p.facts),baselineTasks:structuredClone(base.tasks),baselineAllocations:structuredClone(base.allocations||[]),originalSeeds:structuredClone(u.seedTasks),originalGroups:structuredClone(u.baseGroups),factualAllocations:[],replacements:structuredClone(p.replacements||[]),fixedTaskIds:structuredClone(d.urgentWorkspace?.fixedTaskIds||[])};
 // Rebuild planned reservations separately from actual consumption.
 u.statusPolicy.factualAllocations=structuredClone((u.seedAllocations||[]).filter(a=>a.executionFact));
 return d;
}

// Only this derived copy changes. The frozen input, fact ledger and locked
// statuses are untouched. Unlocks are permitted only in separate advice trials.
export function statusVariant(input,relaxed=[],unlocked=[]){
 const d=structuredClone(input),u=d.urgentOrder,p=u.statusPolicy;
 if(!p||p.version!==STATUS_POLICY)throw Error('未知执行状态规则');
 const facts=new Map(p.facts.tasks.map(f=>[f.id,f])),fixed=new Set(p.fixedTaskIds);
 if(new Set(relaxed).size!==relaxed.length||new Set(unlocked).size!==unlocked.length||relaxed.some(id=>facts.get(id)?.status!=='started'||fixed.has(id))||unlocked.some(id=>facts.get(id)?.status!=='locked'||fixed.has(id)))throw Error('任务调整范围不合法');
 const released=new Set([...relaxed,...unlocked]);
 u.seedTasks=p.originalSeeds.filter(t=>!released.has(t.id)).map(t=>structuredClone(t));
 for(const id of relaxed){const original=p.originalSeeds.find(t=>t.id===id),f=facts.get(id);if(!original)throw Error('缺少已开工原任务');
  const end=Math.min(f.endDay,p.facts.observationDay);
  if(end>f.startDay)u.seedTasks.push({...structuredClone(original),quantity:f.executedQuantity,start:f.startDay,end,startMinute:dayMinute(f.startDay),endMinute:dayMinute(end),duration:end-f.startDay,executionStatus:'completed',executionPrefix:true,originalTaskId:id,label:original.label+'（已执行占用）'});
 }
 const full=new Set(u.seedTasks.filter(t=>!t.executionPrefix).map(t=>t.id)),seedIds=new Set(u.seedTasks.map(t=>t.id));
 for(const t of u.seedTasks)if(t.predecessor&&!seedIds.has(t.predecessor))throw Error('不能调整受保护后序的前序 '+t.predecessor);
 u.seedAllocations=structuredClone(p.factualAllocations);
 for(const [index,a]of p.baselineAllocations.entries()){
  const route=p.baselineTasks.filter(t=>a.consumer===t.productionId+'|'+t.routeStepId),order=p.baselineTasks.filter(t=>t.orderId===a.consumer);
  const keep=route.length?route.every(t=>full.has(t.id)):order.length?order.every(t=>full.has(t.id)):a.taskId&&full.has(a.taskId);
  if(!keep)continue;
  const used=(p.facts.allocations.find(f=>f.index===index)?.quantity||0)+p.replacements.filter(r=>r.allocationIndex===index).reduce((n,r)=>n+r.quantity,0),quantity=a.quantity-used;
  if(quantity>1e-9)u.seedAllocations.push({...structuredClone(a),quantity,exactQuantity:Q.exact(Q.q(String(quantity))),urgentProtected:true,executionConsumed:false,protectionKind:'locked',statusReservation:true});
 }
 // A partially executed production keeps its original lineage and target.
 const groups=new Set([...u.seedTasks.map(t=>t.productionId),...p.baselineTasks.filter(t=>released.has(t.id)).map(t=>t.productionId)]);
 u.baseGroups=p.originalGroups.filter(g=>groups.has(g.id)).map(g=>({...structuredClone(g),tasks:u.seedTasks.filter(t=>t.productionId===g.id),outputConsumed:u.seedAllocations.filter(a=>a.supplyId==='production:'+g.id).reduce((n,a)=>n+a.quantity,0)}));
 u.statusVariant={relaxedStartedTaskIds:[...relaxed].sort(),unlockedTaskIds:[...unlocked].sort()};
 return d;
}

const urgentRows=p=>p.demandResults.filter(r=>r.urgent);
const originalUnplanned=p=>p.demandResults.filter(r=>!r.urgent).reduce((n,r)=>n+r.unplannedQuantity,0);
const validAdvice=(r,best)=>r&&!unmet(r)&&originalUnplanned(r)<=originalUnplanned(best)+1e-6;
const unmet=p=>urgentRows(p).some(r=>r.unplannedQuantity>1e-6||(r.lateDays||0)>0);
const score=(p,policy)=>[urgentRows(p).reduce((n,r)=>n+r.unplannedQuantity,0),urgentRows(p).reduce((n,r)=>n+(r.lateDays||0),0),p.demandResults.filter(r=>!r.urgent).reduce((n,r)=>n+r.unplannedQuantity,0),changedTaskIds(policy,p,'started').length,changedTaskIds(policy,p,'not_started').length];
const better=(a,b)=>{for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1e-6)return a[i]<b[i];return false;};
function trialSets(ids){const sets=ids.slice(0,8).map(id=>[id]);for(let i=0;i<Math.min(ids.length,4);i++)for(let j=i+1;j<Math.min(ids.length,4);j++)sets.push([ids[i],ids[j]]);if(ids.length>1)sets.splice(1,0,ids);return sets;}

export function calculateStatusCandidates(data,selection,calculate,verify){
 const policy=data.urgentOrder.statusPolicy,started=policy.facts.tasks.filter(f=>f.status==='started'&&!policy.fixedTaskIds.includes(f.id)).map(f=>f.id).sort(),locked=policy.facts.tasks.filter(f=>f.status==='locked'&&!policy.fixedTaskIds.includes(f.id)).map(f=>f.id).sort();
 const began=Date.now(),budgetMs=60000,maxTrials=32;let trials=0,rejected=0,best,bestIds=started.filter(id=>policy.facts.tasks.find(f=>f.id===id).endDay<=policy.facts.observationDay);
 const run=(ids,unlocks=[])=>{if(trials>=maxTrials||Date.now()-began>budgetMs)return null;trials++;try{const d=statusVariant(data,ids,unlocks),r=calculate(d,selection);if(r.verification.status!=='pass'){rejected++;return null;}return r;}catch{rejected++;return null;}};
 best=run(bestIds);if(!best)throw Error('保留执行事实的候选未通过检查');
 const initialUnmet=unmet(best);
 if(initialUnmet)for(const optional of trialSets(started)){const ids=[...new Set([...bestIds.filter(id=>policy.facts.tasks.find(f=>f.id===id).endDay<=policy.facts.observationDay),...optional])],r=run(ids);if(r&&better(score(r,policy),score(best,policy))){best=r;bestIds=ids;}if(trials>=maxTrials||Date.now()-began>budgetMs)break;}
 // Shrink the selected set with verified trials, without claiming optimality.
 if(bestIds.length>1)for(const id of [...bestIds]){const ids=bestIds.filter(x=>x!==id),r=run(ids);if(r&&better(score(r,policy),score(best,policy))){best=r;bestIds=ids;}}
 const advice=[];
 if(unmet(best))for(const ids of trialSets(locked)){
  let r=run(bestIds,ids);
  if(!validAdvice(r,best)&&started.some(id=>!bestIds.includes(id)))r=run(started,ids);
  if(validAdvice(r,best)&&changedTaskIds(policy,r,'locked').some(id=>ids.includes(id))){
   const changed=changedTaskIds(policy,r,'locked');
   advice.push({taskIds:changed,taskCount:changed.length,result:r,resultHash:hash(r),verification:'pass',message:'仅试算：调整这些锁定任务后，插单可完整排入且不迟交，原需求未排量不增加；原方案未解锁。'});
  }
  if(advice.length>=2||trials>=maxTrials||Date.now()-began>budgetMs)break;
 }
 best.statusSearch={version:STATUS_POLICY,trials,rejected,budgetMs,maxTrials,limited:true,initialUrgentUnmet:initialUnmet,startedChangedTaskIds:changedTaskIds(policy,best,'started'),lockSuggestions:advice,adviceStatus:!unmet(best)?'not_needed':advice.length?'verified':locked.length?'not_found':'no_locked_tasks',message:'先保留已开工任务；仅在插单未满足时试排剩余工作。有限试算，不代表全局最优或必然无解。'};
 // Recheck the selected candidate against the original frozen authority.
 best.verification=verify(data,best);return best;
}

export function statusAdjustmentSummary(d,result){
 const p=d.urgentOrder?.statusPolicy;if(!p)return null;
 const records=status=>changedTaskIds(p,result,status).map(id=>{const t=p.baselineTasks.find(t=>t.id===id);return {taskId:id,demandId:t.orderId,routeStepId:t.routeStepId,before:t,after:result.tasks.filter(x=>x.id===id||x.source?.originalTaskIds?.includes(id)||status==='not_started'&&x.orderId===t.orderId&&x.productId===t.productId&&x.routeStepId===t.routeStepId)};});
 const reminders=records('not_started'),warnings=records('started');
 return {reminders:{count:reminders.length,taskIds:reminders.map(r=>r.taskId),records:reminders},warnings:{count:warnings.length,taskIds:warnings.map(r=>r.taskId),records:warnings},lockSuggestions:(result.statusSearch?.lockSuggestions||[]).map(s=>({taskIds:s.taskIds,taskCount:s.taskCount,resultHash:s.resultHash,verification:s.verification,message:s.message,originalUnplannedQuantity:originalUnplanned(s.result),startedTaskIds:changedTaskIds(p,s.result,'started'),unstartedTaskIds:changedTaskIds(p,s.result,'not_started'),lateOriginalDemands:s.result.demandResults.filter(r=>!r.urgent&&(r.lateDays||0)>0).map(r=>({demandId:r.id,lateDays:r.lateDays})),tasks:s.taskIds.map(id=>{const t=p.baselineTasks.find(t=>t.id===id);return {taskId:id,demandId:t.orderId,machine:t.machine,beforeQuantity:t.quantity,beforeStart:t.start,beforeEnd:t.end,after:s.result.tasks.filter(x=>x.productionId===t.productionId&&x.routeStepId===t.routeStepId).map(x=>({taskId:x.id,machine:x.machine,start:x.start,end:x.end,quantity:x.quantity}))};})})),adviceStatus:result.statusSearch?.adviceStatus,limited:true};
}
