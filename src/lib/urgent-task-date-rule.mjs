import {urgentFactMinute} from './urgent-run-eligibility.mjs';

// This prepares the open form only. It neither saves execution facts nor
// changes observation dates, actual occupations, deliveries or consumption.
export function urgentTaskDateRule(result,statuses,cutoffDate,savedTasks=[],throughStatus='started'){
 if(result?.timeUnit!=='day')throw Error('按日期批量设置仅支持按天排程基准');
 if(!['started','locked'].includes(throughStatus))throw Error('请选择已开工可调或已锁定不可调');
 const cutoffDay=urgentFactMinute(cutoffDate,{result});
 if(!Number.isSafeInteger(cutoffDay))throw Error('请选择有效的状态分界日期');
 const next={...statuses},throughIds=[],afterIds=[],changedSavedIds=[];
 const saved=new Map(savedTasks.map(t=>[t.id,t.status])),seen=new Set();
 for(const task of result.tasks||[]){
  if(!task.id||seen.has(task.id)||!Number.isFinite(task.start))throw Error('任务编号或开始日期无效，未批量修改');seen.add(task.id);
  const through=task.start<cutoffDay+1,status=through?throughStatus:'not_started',old=saved.get(task.id);
  if(old&&old!==status)changedSavedIds.push(task.id);
  next[task.id]=status;(through?throughIds:afterIds).push(task.id);
 }
 return {statuses:next,throughStatus,cutoffDate,cutoffDay,throughIds,afterIds,changedSavedIds};
}
