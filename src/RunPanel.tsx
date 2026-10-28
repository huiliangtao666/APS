import {schedulingScope,type SchedulingScope} from './lib/scheduling-scope.mjs';
import {useState} from 'react';
type Row=Record<string,string>;
export type Run = {id:string;status:string;phase:string;createdAt:string;finishedAt?:string;planId?:string;inputVersionId:string;snapshotHash:string;conditions:{mode?:string;checkScope?:SchedulingScope;orderIds:string[];lineId:string;startMinute:number;endMinute:number|null;priority:string;enabledRuleIds:string[];timeOrigin:string};failure?:{code:string;message:string}};
export function RunPanel({data,runs,canWrite,busy,onStart,onCancel,onResult,onInputs}:{data:Record<string,Row[]>;runs:Run[];canWrite:boolean;busy:boolean;onStart:(selection:object)=>void;onCancel:(id:string)=>void;onResult:(id:string)=>void;onInputs:(id:string)=>Promise<unknown>}){
 const [orders,setOrders]=useState<string[]|null>(null),[rules,setRules]=useState<string[]|null>(null);
 const [start,setStart]=useState('0'),[end,setEnd]=useState('600'),[priority,setPriority]=useState('规则设置');
 const [mode,setMode]=useState('supported');
 const [snapshot,setSnapshot]=useState(''),[error,setError]=useState('');
 const eligible=(data.orders||[]).filter(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效');
 const selected=(orders??eligible.map(o=>o['订单编号'])).filter(id=>eligible.some(o=>o['订单编号']===id));const enabled=(rules??(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号'])).filter(id=>(data.rules||[]).some(r=>r['规则编号']===id));
 const toggle=(list:string[],id:string)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];
 const states:Record<string,string>={queued:'等待线程',running:'正在计算',completed:'完成',partial:'完成，有未排或问题',cancelled:'已取消',timed_out:'已超时（不代表无解）',failed:'失败'};
 return <section className="panel"><h2>计算范围与运行记录 · FR-018</h2><p>时间使用分钟轴，0 = 2026-11-02 08:00 +08:00。开始时间不移动原日历、停机、供给或人员窗口；完整工序须在结束范围内。已完成合格数量用于同单位模拟订单余量；R5执行事实、已投料核销与剩余工时未实现。</p>
 <label>计算模式<select aria-label="计算模式" value={mode} onChange={e=>setMode(e.target.value)}><option value="supported">已有支持模式（日历、人员、预计供给；物料须启用）</option><option value="minimal-r1">R1 最小模式（机器连续可用，仅机器与顺序）</option></select></label>
 <CheckScope scope={schedulingScope(mode,enabled.includes('MATERIAL')&&!(data.rules.find(r=>r['规则编号']==='MATERIAL')?.['生效时间']&&Date.parse(data.rules.find(r=>r['规则编号']==='MATERIAL')!['生效时间'])>Date.now()))}/>
 <fieldset><legend>本产线有效正式订单</legend>{eligible.map(o=><label key={o['订单编号']}><input type="checkbox" checked={selected.includes(o['订单编号'])} onChange={()=>setOrders(toggle(selected,o['订单编号']))}/>{o['订单编号']} · {o['产线编号']} · 优先 {o['优先顺序']}</label>)}</fieldset>
 <label>开始分钟<input aria-label="开始分钟" type="number" min="0" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>计划结束分钟<input aria-label="计划结束分钟" type="number" min="1" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <label>任务排序<select aria-label="任务排序" value={priority} onChange={e=>setPriority(e.target.value)}><option>规则设置</option><option>优先顺序</option><option>要求日期</option></select></label>
 <fieldset><legend>本次规则配置（最小模式仅采用机器、顺序和排序；其余明确未检查）</legend>{(data.rules||[]).map(r=><label key={r['规则编号']}><input type="checkbox" checked={enabled.includes(r['规则编号'])} disabled={(mode==='minimal-r1'&&!['MACHINE','PRECEDENCE','SORT'].includes(r['规则编号']))||['MACHINE','PRECEDENCE','CALENDAR'].includes(r['规则编号'])} onChange={()=>setRules(toggle(enabled,r['规则编号']))}/>{r['中文名称']}</label>)}</fieldset>
 <button className="primary" disabled={!canWrite||busy||!selected.length||!start.trim()||!end.trim()} onClick={()=>onStart({...(mode==='minimal-r1'?{mode}:{}),orderIds:selected,startMinute:Number(start),endMinute:Number(end),priority,enabledRuleIds:enabled})}>另开计算（冻结当前输入）</button>
 <p>最多两个并行运行；状态按真实线程阶段显示，不估算百分比。已完成运行不可取消，取消不会保存部分结果。</p>
 {error&&<p role="alert">{error}</p>}
 {runs.map(run=><article key={run.id}><b>{states[run.status]||run.status} · {run.id}</b><p>{run.createdAt} · {run.phase} · 产线 {run.conditions.lineId} · 订单 {run.conditions.orderIds.join('、')} · {run.conditions.startMinute}–{run.conditions.endMinute??'日历末尾'} 分钟 · {run.conditions.priority}</p><CheckScope scope={run.conditions.checkScope}/><small>输入 {run.inputVersionId} · 快照 {run.snapshotHash}</small>{run.failure&&<p>{run.failure.code}：{run.failure.message}</p>}<div className="actions"><button disabled={!canWrite||busy||!['queued','running'].includes(run.status)} onClick={()=>onCancel(run.id)}>取消运行</button>{run.planId&&<button onClick={()=>onResult(run.planId!)}>查看结果</button>}<button onClick={()=>{setError('');onInputs(run.id).then(v=>setSnapshot(JSON.stringify(v,null,2))).catch(e=>setError(e.message));}}>查看本次原始输入、实际规则与条件</button></div></article>)}
 {snapshot&&<details open><summary>不可变运行输入</summary><pre style={{maxHeight:360,overflow:'auto'}}>{snapshot}</pre><button onClick={()=>setSnapshot('')}>关闭输入详情</button></details>}
 </section>;
}

export function CheckScope({scope}:{scope?:SchedulingScope}){return <div className="scope-note" aria-label="方案检查范围">{scope?<><b>{scope.label} · {scope.machineAvailability}</b><p>计算检查：{scope.checked.join('；')}</p><p>未检查：{scope.unchecked.join('；')}</p><p>{scope.note}</p></>:<p>旧方案未记录模式与检查范围，不能据此认定完整业务可执行。</p>}</div>;}
