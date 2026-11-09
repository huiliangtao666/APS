import {buildUrgentMetrics} from './urgent-result-metrics.mjs';
const EPS=1e-6;
const ids=rows=>[...new Set(rows.map(r=>r.demandId||r.id))];
const sumUnits=(rows,field)=>{const values=new Map();for(const r of rows){if(typeof r[field]!=='number'||!Number.isFinite(r[field]))continue;const unit=r.unit||'单位未提供';values.set(unit,(values.get(unit)||0)+r[field]);}return [...values].map(([unit,quantity])=>({unit,quantity}));};
export function classifyUrgentDemand(row){
 const {quantity,completedQuantity=0,scheduledQuantity,unplannedQuantity}=row;
 if(![quantity,completedQuantity,scheduledQuantity,unplannedQuantity].every(Number.isFinite)||[quantity,completedQuantity,scheduledQuantity,unplannedQuantity].some(n=>n<0)||Math.abs(completedQuantity+scheduledQuantity+unplannedQuantity-quantity)>EPS)return 'unknown';
 if(unplannedQuantity>EPS)return scheduledQuantity+completedQuantity>EPS?'partial':'unplanned';
 if(completedQuantity>=quantity-EPS)return 'satisfied';
 if(Number.isFinite(row.lateDays))return row.lateDays>0?'late':'satisfied';
 return 'delivery_unknown';
}

// Compare route groups when a replan merges/splits tasks: old task IDs do not
// prove which generated fragment replaces which original task. Delay therefore
// means the same demand/product/route group's completion moved later.
export function classifyUnstartedChanges(records,changes=[]){
 const byLineage=new Map(changes.map(c=>[[c.demandId,c.materialId,c.routeStepId].join('|'),c]));
 return records.map(r=>{
  const after=r.after||[],before=r.before||{},change=byLineage.get([r.demandId,before.productId,r.routeStepId||before.routeStepId].join('|'));
  if(!after.length)return {...r,changeKind:'unplanned'};
  const oldEnd=change?.beforeTasks?.length?Math.max(...change.beforeTasks.map(t=>t.end)):before.end;
  const newEnd=change?.afterTasks?.length?Math.max(...change.afterTasks.map(t=>t.end)):Math.max(...after.map(t=>t.end));
  const groupFallback=!change&&after.length>1;
  return {...r,changeKind:groupFallback?'other':Number.isFinite(oldEnd)&&Number.isFinite(newEnd)&&newEnd>oldEnd+EPS?'delayed':'other'};
 });
}

export function buildUrgentResultSummary(impact,{facts,baselineTasks,fixedTaskIds=[],result}={}){
 const urgent=(impact.tabs?.urgent||[]).map(r=>({...r,outcome:classifyUrgentDemand(r)})),original=impact.tabs?.orders||[],changes=impact.tabs?.changes||[];
 const affected=new Set(changes.filter(c=>!c.isUrgent&&c.changed).map(c=>c.demandId));
 for(const r of original)if(r.classification&&r.classification!=='未变化'||Number.isFinite(r.previousUnplannedQuantity)&&Math.abs(r.unplannedQuantity-r.previousUnplannedQuantity)>EPS||r.lateDelta>0||r.lateDelta<0||r.beforeArrival!==r.afterArrival)affected.add(r.demandId);
 const originalRows=original.filter(r=>affected.has(r.demandId));
 const unstarted=classifyUnstartedChanges(impact.adjustments?.reminders?.records||[],changes),started=impact.adjustments?.warnings?.records||[];
 const frozenFacts=facts?.tasks;
 const completedIds=frozenFacts?.filter(t=>t.status==='completed').map(t=>t.id),lockedIds=frozenFacts?.filter(t=>t.status==='locked').map(t=>t.id);
 const protectedIds=frozenFacts?[...new Set([...completedIds,...lockedIds,...fixedTaskIds])]:null;
 const suggestions=(impact.adjustments?.lockSuggestions||[]).filter(s=>s.verification==='pass');
 const remaining=urgent.filter(r=>r.unplannedQuantity>EPS);
 return {contract:'urgent-result-summary-v1',runId:impact.runId,inputHash:impact.inputHash,metrics:buildUrgentMetrics(impact,{facts,baselineTasks,result}),
  demandTotal:new Set([...ids(urgent),...ids(original)]).size,baselineTaskTotal:baselineTasks?.length??null,batches:impact.batchIds?.length??null,
  urgent:{total:urgent.length,satisfied:urgent.filter(r=>r.outcome==='satisfied').length,fullyScheduled:urgent.filter(r=>['satisfied','late','delivery_unknown'].includes(r.outcome)).length,late:urgent.filter(r=>r.outcome==='late').length,partial:urgent.filter(r=>r.outcome==='partial').length,unplanned:urgent.filter(r=>r.outcome==='unplanned').length,unknown:urgent.filter(r=>['unknown','delivery_unknown'].includes(r.outcome)).length,remaining:remaining.length,quantities:sumUnits(urgent,'quantity'),scheduledQuantities:sumUnits(urgent,'scheduledQuantity'),unplannedQuantities:sumUnits(urgent,'unplannedQuantity'),rows:urgent},
  original:{total:original.length,affected:originalRows.length,newLate:original.filter(r=>r.lateDays>0&&!(r.previousLateDays>0)).length,worseLate:original.filter(r=>r.previousLateDays>0&&r.lateDelta>0).length,unplannedIncreased:original.filter(r=>r.unplannedQuantity>r.previousUnplannedQuantity+EPS).length,unplannedDelta:sumUnits(original.map(r=>({...r,delta:Number.isFinite(r.previousUnplannedQuantity)?r.unplannedQuantity-r.previousUnplannedQuantity:NaN})),'delta'),rows:originalRows},
  tasks:{unstarted:impact.adjustments?{total:unstarted.length,delayed:unstarted.filter(r=>r.changeKind==='delayed').length,unplanned:unstarted.filter(r=>r.changeKind==='unplanned').length,other:unstarted.filter(r=>r.changeKind==='other').length,rows:unstarted}:null,started:impact.adjustments?{total:started.length,rows:started}:null},
  protection:{total:protectedIds?.length??null,completed:completedIds?.length??null,locked:lockedIds?.length??null,frozen:new Set(fixedTaskIds).size,automaticUnlocks:result?.urgentOrder?.unlockedTaskIds?.length??null},
  advice:{options:suggestions.length,minTasks:suggestions.length?Math.min(...suggestions.map(s=>s.taskCount)):null,status:impact.adjustments?.adviceStatus||null,taskIds:[...new Set(suggestions.flatMap(s=>s.taskIds))]}
 };
}
