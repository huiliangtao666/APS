import {useEffect,useState} from 'react';
import {DataEditor} from './DataEditor';
import {defs} from './data-defs';
import {RunPanel,type Run} from './RunPanel';
export type Trial={id:string;status:string;revision:number;sourcePlanId:string;sourceRunId:string;sourceInputVersionId:string;sourceSnapshotHash:string;basePlanId:string;latestPlanId:string;data:Record<string,Record<string,string>[]>;selection:Run['conditions']};
type Props={plans:{id:string;name:string}[];activeId?:string;trials:Trial[];runs:Run[];revision:number;canWrite:boolean;busy:boolean;reason:string;api:(path:string,body?:object)=>Promise<any>;refresh:()=>Promise<void>;onResult:(id:string)=>void;onRun:(trial:Trial,selection:object)=>void;onCancel:(id:string)=>void};
export function TrialPanel(p:Props){
 const [trialId,setTrialId]=useState(''),[other,setOther]=useState(''),[table,setTable]=useState('orders'),[comparison,setComparison]=useState<any>(null),[error,setError]=useState(''),[working,setWorking]=useState(false);
 useEffect(()=>setComparison(null),[p.activeId]);
 const trial=p.trials.find(t=>t.id===trialId),disabled=p.busy||working,def=defs.find(d=>d.key===table)!;
 async function act(work:()=>Promise<void>){setError('');setWorking(true);try{await work();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setWorking(false);}}
 return <section className="panel" aria-label="方案副本与比较"><h2>独立试算与方案比较 · FR-026</h2><p>副本冻结原始输入和结果。编辑与计算仅写入试算；放弃保留历史。恢复须复查当前进度，当前缺少执行事实接口，会显示阻塞原因。</p>
 <button disabled={!p.activeId||!p.canWrite||disabled||!p.reason.trim()} onClick={()=>act(async()=>{const t=await p.api('/plans/'+p.activeId+'/copy',{});await p.refresh();setTrialId(t.id);p.onResult(t.basePlanId);setComparison(null);})}>复制当前方案为独立试算</button>
 <button disabled={!p.activeId||!p.canWrite||disabled||!p.reason.trim()} onClick={()=>act(async()=>{await p.api('/plans/'+p.activeId+'/restore',{revision:p.revision});})}>检查能否恢复当前历史方案</button>
 <label>比较对象<select aria-label="比较对象" value={other} onChange={e=>{setOther(e.target.value);setComparison(null);}}><option value="">选择已保存方案</option>{p.plans.map(x=><option key={x.id} value={x.id}>{x.name} · {x.id}</option>)}</select></label>
 <button disabled={!p.activeId||!other||disabled} onClick={()=>act(async()=>setComparison(await p.api('/plans/'+p.activeId+'/compare/'+other)))}>比较当前方案与所选方案</button>
 {error&&<p role="alert">{error}</p>}
 {comparison&&<article aria-label="保存的比较结果"><p>左：{comparison.left.planId} / 右：{comparison.right.planId}</p><p>{comparison.orderOutcome==='unchanged-no-delivery-improvement'?'订单交期及数量结果未变化；没有交期改善':comparison.orderOutcome==='unknown'?'订单结果未知，无法判断改善':'订单结果有变化，请逐单核查'}</p><p>检查范围{comparison.scope.comparable?'相同':'不同，须核查覆盖差异'} · 输入变化 {comparison.inputs.length} 张表</p>{(['tasks','resources','materials','orders','unplanned'] as const).map((key,i)=><details key={key} open><summary>{['任务时间与机器','资源占用','物料分配（含未提交候选）','订单交期与数量','未排任务数量（不跨工序相加）'][i]} · {comparison[key].known?`${comparison[key].changes.length} 项变化`:'未检查或历史证据缺失'}</summary><pre style={{maxHeight:260,overflow:'auto'}}>{JSON.stringify(comparison[key].known?comparison[key].changes:{before:comparison[key].before,after:comparison[key].after},null,2)}</pre></details>)}<details><summary>条件与输入变化</summary><pre style={{maxHeight:300,overflow:'auto'}}>{JSON.stringify({conditions:comparison.conditions,inputs:comparison.inputs},null,2)}</pre></details>{comparison.limits.map((x:string)=><p key={x}>{x}</p>)}</article>}
 <label>独立试算<select aria-label="独立试算" value={trialId} onChange={e=>{setTrialId(e.target.value);setComparison(null);}}><option value="">选择试算</option>{p.trials.map(t=><option key={t.id} value={t.id}>{t.status==='active'?'进行中':'已放弃'} · {t.id}</option>)}</select></label>
 {trial&&<article><p>来源方案 {trial.sourcePlanId} · 原运行 {trial.sourceRunId} · 试算输入版本 {trial.revision}</p><button onClick={()=>p.onResult(trial.latestPlanId)}>查看试算最近保存结果</button><button disabled={trial.status!=='active'||!p.canWrite||disabled||!p.reason.trim()} onClick={()=>act(async()=>{await p.api('/trials/'+trial.id+'/discard',{revision:trial.revision});await p.refresh();})}>放弃试算（保留历史）</button>
 <label>试算输入类别<select aria-label="试算输入类别" value={table} onChange={e=>setTable(e.target.value)}>{defs.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
 <DataEditor key={trial.id} def={def} rows={trial.data[table]||[]} revision={trial.revision} canWrite={p.canWrite&&trial.status==='active'} busy={disabled} reason={p.reason} onSave={async(tables,revision,operation)=>{await p.api('/trials/'+trial.id+'/inputs',{tables,revision,operation});await p.refresh();setComparison(null);}}/>
 <RunPanel key={'run-'+trial.id} data={trial.data} initialSelection={trial.selection} runs={p.runs.filter(r=>(r as Run&{trialId?:string}).trialId===trial.id)} canWrite={p.canWrite&&trial.status==='active'&&!!p.reason.trim()} busy={disabled} onStart={selection=>p.onRun(trial,selection)} onCancel={p.onCancel} onInputs={id=>p.api('/runs/'+id+'/inputs')} onResult={p.onResult}/>
 </article>}
 </section>;
}
