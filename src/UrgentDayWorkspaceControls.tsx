import {useEffect,useState} from 'react';
import {workbookDate,workbookDay} from './lib/workbook-dates';
import type {UrgentDraftGuard} from './UrgentWorkspaceControls';
type Props={api:(path:string,body?:object)=>Promise<any>;plan:any;canWrite:boolean;onSaved:(p:any)=>void;onGuard:(g:UrgentDraftGuard)=>void};
export function UrgentDayWorkspaceControls({api,plan,canWrite,onSaved,onGuard}:Props){
 const initial=()=>plan.workspace||{timeUnit:'day',freezeDay:plan.facts.observationDay,semiFreezeDay:plan.facts.observationDay,strategy:'delay',scope:'full',priorityDirection:'数值小优先',seedTaskIds:[],events:[],exceptions:[],overtime:[]};
 const [value,setValue]=useState<any>(initial),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{if(!dirty)setValue(initial());},[plan.targetToken]);
 function discard(){setValue(initial());setDirty(false);setError('');setSaved(false);}
 async function save(){setBusy(true);setError('');try{const result=await api('/workbooks/urgent/plans/'+plan.id+'/workspace',{targetToken:plan.targetToken,workspace:value});onSaved(result.plan);setDirty(false);setSaved(true);}catch(e:any){setError(e.message);throw e;}finally{setBusy(false);}}
 useEffect(()=>onGuard({dirty,save,discard}),[dirty,JSON.stringify(value),plan.targetToken]);
 function update(patch:object){setValue({...value,...patch});setDirty(true);setSaved(false);}
 return <section><h3>按天插单策略</h3><p>沿用原计划的日产能、班组、设备、工装、库存与停机约束。冻结截止日前的原任务保留；截止日当天起可调整。已开工任务优先保持原安排，必要时调整剩余工作并警告；已完成、已锁定任务不可调整。</p><div className="urgent-toolbar">
 <label>冻结截止日（当天可调整）<input type="date" min={workbookDate(plan.facts.observationDay)} max={workbookDate(plan.selection.endDay)} value={workbookDate(value.freezeDay)} onChange={e=>{const day=workbookDay(e.target.value);update({freezeDay:day,semiFreezeDay:day});}}/></label>
 <label>排程策略<select value={value.strategy} onChange={e=>update({strategy:e.target.value})}><option value="delay">允许顺延：插单优先，重排剩余工作</option><option value="gap">空隙插入：保留原任务，只用空余产能</option></select></label>
 <label>修复范围<select value={value.scope} onChange={e=>update({scope:e.target.value})}><option value="full">全部剩余工作</option><option value="local">实际依赖闭包</option></select></label>
 <label>客户服务优先级<select value={value.priorityDirection} onChange={e=>update({priorityDirection:e.target.value})}><option>数值小优先</option><option>数值大优先</option></select></label>
 <button disabled={!canWrite||busy} onClick={()=>{void save().catch(()=>{});}}>保存按天策略</button><button disabled={busy} onClick={discard}>放弃策略编辑</button></div>{saved&&!dirty&&<p role="status">按天插单策略已保存。可点击上方“检查插单本次求解条件”，再进行插单排程。</p>}{error&&<p role="alert">{error}</p>}</section>;
}
