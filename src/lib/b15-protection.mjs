import {executionTrialIssues,validateExecution} from './execution-facts.mjs';
import {validateEvents} from './simulation-events.mjs';

const clone=value=>structuredClone(value);
const position=t=>({start:t.start,end:t.end,machine:t.machine});
const samePosition=(a,b)=>a.start===b.start&&a.end===b.end&&a.machine===b.machine;
const validPosition=p=>p&&Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.start>=0&&p.end>p.start&&typeof p.machine==='string'&&p.machine.length>0;
const deepFreeze=value=>{
 if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}
 return value;
};

// A domain snapshot. Application persistence/version checks remain the caller's responsibility.
export function freezeTrialSnapshot(plan,data){
 return deepFreeze(clone({contract:'B15-protection-v1',plan,data}));
}

// A comparison/retention decision never writes either input or a confirmed plan.
export function resolveTrialCandidate(original,candidate,decision){
 if(!['keep','discard'].includes(decision))throw Error('invalid_trial_decision');
 return {decision,original:clone(original),retained:clone(decision==='keep'?candidate:original)};
}

export function trialInputIssues(current,proposed){
 return [...executionTrialIssues(current,proposed),...validateExecution(proposed),...validateEvents(proposed)];
}

// Independent protection check, additional to the planner's resource/material verification.
// locks use the existing {taskId:{start,end,machine}} application shape.
export function checkProtectedTasks(before,candidate,data,{locks={},protectionUntil=0}={}){
 const issues=[],handlingRequired=[],tasks=candidate.tasks||[],baseline=before.tasks||[];
 const add=(code,taskId,message,extra={})=>issues.push({code,taskIds:[taskId],message,...extra});
 const unique=id=>{const rows=tasks.filter(t=>t.id===id);return rows.length===1?rows[0]:null;};
 for(const [id,locked] of Object.entries(locks)){
  const task=unique(id);
  if(!validPosition(locked)||!task||!samePosition(task,locked))add('B15_LOCK_CONFLICT',id,'锁定任务缺失、重复或位置改变；不得静默解除锁定',{protectedPosition:clone(locked),actualPosition:task?position(task):null});
 }
 const facts=data.executionFacts||[];
 for(const fact of facts){
  const matching=t=>t.orderId===fact['订单编号']&&t.operation===fact['工序编号'];
  const old=baseline.filter(matching),next=tasks.filter(matching),id=old[0]?.id||`${fact['订单编号']}-${fact['工序编号']}`;
  if(fact['状态']==='已完成'){
   const expected={start:Number(fact['开始分钟']),end:Number(fact['完成分钟']),machine:fact['当前设备']};
   if(next.length!==1||!samePosition(next[0],expected))add('B15_COMPLETED_FACT_PROTECTED',id,'已完成原始区间及设备必须保留；不得重排或删除',{factId:fact['事实编号'],protectedPosition:expected});
  }else if(!next.length&&candidate.execution?.risks?.some(r=>r.factId===fact['事实编号'])&&candidate.execution?.facts?.some(f=>JSON.stringify(f)===JSON.stringify(fact))&&candidate.execution?.protection?.some(p=>p.factId===fact['事实编号']&&p.machine===fact['当前设备']&&p.originalStart===Number(fact['开始分钟'])&&p.observedUntil===Number(fact['观测分钟']))){
   handlingRequired.push({factId:fact['事实编号'],orderId:fact['订单编号'],operation:fact['工序编号'],reason:'原始事实及设备保护保留，剩余任务未排且显式需处理'});
  }else if(old.length){
   if(old.length!==1||next.length!==1||!samePosition(old[0],next[0]))add('B15_STARTED_TASK_PROTECTED',id,'已开始任务投影不可自由移动或消失；异常应保留事实并显式标需处理',{factId:fact['事实编号']});
  }else if(next.length){
   // No accepted remainder projection exists to move. Only the observed explicit remainder is supported.
   const expected={start:Number(fact['观测分钟']),end:Number(fact['观测分钟'])+Number(fact['剩余工时分钟']),machine:fact['当前设备']};
   if(fact['状态']==='暂停'||next.length!==1||!samePosition(next[0],expected))add('B15_STARTED_TASK_PROTECTED',next[0].id,'无已接纳投影；仅允许观测点显式剩余，暂停不得自动恢复',{factId:fact['事实编号']});
  }
 }
 if(typeof protectionUntil!=='number'||!Number.isFinite(protectionUntil)||protectionUntil<0||protectionUntil>525600)add('B15_INVALID_PROTECTION_WINDOW','*','保护截止须为0至525600的有限分钟');
 else for(const task of tasks)if(!facts.some(f=>task.orderId===f['订单编号']&&task.operation===f['工序编号'])&&task.start<protectionUntil)add('B15_PROTECTION_WINDOW',task.id,'未开始任务不得在显式保护截止之前开工',{protectionUntil});
 return {contract:'B15-protection-v1',valid:issues.length===0,issues,handlingRequired,locks:clone(locks),requiresResourceVerification:true};
}
