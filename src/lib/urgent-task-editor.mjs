import {URGENT_FACT_STATUSES} from './urgent-facts.mjs';

export function copyUrgentTaskStatus(tasks,statuses,status){
 if(!URGENT_FACT_STATUSES.includes(status))throw Error('请选择有效的任务状态');
 const next={...statuses};let changed=0;
 for(const task of tasks){if(next[task.id]!==status)changed++;next[task.id]=status;}
 return {statuses:next,total:tasks.length,changed};
}

// Editing either calendar endpoint translates the same finite-capacity task.
// Inclusive displayed end days are distinct from the stored exclusive end.
export function editUrgentTaskFootprint(task,current,key,value,daily){
 const next={...current,[key]:value};
 if(!daily||!['startMinute','endMinute'].includes(key)||!Number.isFinite(value))return next;
 const duration=task.end-task.start;
 const start=Number.isFinite(current.startMinute)?current.startMinute:Number.isFinite(current.endMinute)?current.endMinute-duration:task.start;
 const end=Number.isFinite(current.endMinute)?current.endMinute:start+duration;
 const shift=value-(key==='startMinute'?Math.floor(start):Math.ceil(end)-1);
 return {...current,startMinute:start+shift,endMinute:end+shift};
}
