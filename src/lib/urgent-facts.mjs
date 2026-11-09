// A missing disposition is a required user input, not evidence of execution.
export const URGENT_FACT_STATUSES=['not_started','started','completed','locked'];
export const URGENT_FACT_CONFIRM_LABEL='确认未确认任务均未开工、空白数量均为0';
const blank=value=>value===undefined||value===null||typeof value==='string'&&!value.trim();
const confirmed=status=>URGENT_FACT_STATUSES.includes(status);

export function taskDispositionIssue(tasks,submitted){
 const ids=new Set(tasks.map(t=>t.id)),unknown=submitted.filter(f=>!ids.has(f.id));
 if(unknown.length)return {code:'URGENT_FACT_TASK_UNKNOWN',message:'提交的任务 '+String(unknown[0].id)+' 已不在当前基准中，请重新打开执行事实核对；已有录入请先保留。',count:unknown.length,taskIds:unknown.map(f=>f.id)};
 const pending=submitted.filter(f=>!confirmed(f.status));
 if(!pending.length)return null;
 const first=tasks.find(t=>t.id===pending[0].id),example=first.id+(first.orderId?' / 需求 '+first.orderId:'');
 return {code:'URGENT_FACT_STATUS_REQUIRED',message:'还有 '+pending.length+' 个任务未确认执行状态（首个：'+example+'）。请逐项选择状态；若这些任务确实均未开工，可点击“'+URGENT_FACT_CONFIRM_LABEL+'”。',count:pending.length,taskIds:pending.map(f=>f.id)};
}

export function reviewUrgentFactDraft(result,draft){
 const tasks=result?.tasks||[],demands=result?.demandResults||[],allocations=result?.allocations||[];
 const pendingTasks=tasks.filter(t=>!confirmed(draft.statuses?.[t.id]));
 const pendingCompleted=demands.filter(r=>blank(draft.completed?.[r.id]));
 const pendingAllocations=allocations.map((a,index)=>({...a,index})).filter(a=>blank(draft.allocations?.[a.index]?.quantity));
 const pendingProgress=result?.timeUnit==='day'?tasks.filter(t=>draft.statuses?.[t.id]==='started'&&blank(draft.footprints?.[t.id]?.executedQuantity)):[];
 const issue=taskDispositionIssue(tasks,tasks.map(t=>({id:t.id,status:draft.statuses?.[t.id]})));
 const progressLabel=pendingProgress.some(t=>draft.footprints?.[t.id]?.completionPercent!==undefined)?'完成比例':'已完成工序量';
 const missing=[pendingProgress.length?pendingProgress.length+' 个已开工任务的'+progressLabel+'（未产出填0）':'',pendingCompleted.length?pendingCompleted.length+' 个需求的已完成交付量':'',pendingAllocations.length?pendingAllocations.length+' 条供给的实际量':''].filter(Boolean);
 return {pendingTasks,pendingProgress,pendingCompleted,pendingAllocations,totalTasks:tasks.length,confirmedTasks:tasks.length-pendingTasks.length,blocked:!!(pendingTasks.length||missing.length),message:issue?.message||(pendingProgress.length?'还有 '+pendingProgress.length+' 个已开工任务未填写'+progressLabel+'（首个：'+pendingProgress[0].id+'）。请核对完成比例或已完成的工序量；未产出填0。':missing.length?'还有 '+missing.join('、')+' 未填写。未发生请填写 0；确认均未发生时可使用“'+URGENT_FACT_CONFIRM_LABEL+'”。':'')};
}

// Only an explicit click applies these confirmations. Preserve all entered
// statuses and quantities, including 0, and never infer them from plan dates.
export function confirmUnfilledUrgentFacts(result,draft){
 const statuses={...draft.statuses},completed={...draft.completed},allocations={...draft.allocations};
 for(const t of result.tasks||[])if(blank(statuses[t.id])||statuses[t.id]==='unknown')statuses[t.id]='not_started';
 for(const r of result.demandResults||[])if(blank(completed[r.id]))completed[r.id]='0';
 for(const [index] of (result.allocations||[]).entries())if(blank(allocations[index]?.quantity))allocations[index]={...allocations[index],quantity:'0'};
 return {statuses,completed,allocations};
}
