import {WorkbookRunView} from './WorkbookRunView';
import {useEffect,useState} from 'react';
import {type QueryApi,type QueryIdentity,sameQueryIdentity} from './QueryReportsTypes';
import {capacityNumber as num} from './CapacityDialog';
import {ScheduleResourceDetails,ScheduleCapacityDetails} from './ScheduleCapacityDetails';
import {ScheduleCapacityParameters,type CapacityPatch} from './ScheduleCapacityParameters';
import {workbookDate} from './lib/workbook-dates';
import './CapacityOverview.css';
import './ScheduleCapacity.css';
const active=(g:any)=>!!g?.pendingOwned||g?.scenarios?.some((s:any)=>['queued','running','cancelling'].includes(s.status));
export function ScheduleCapacity({run,identity,api,canWrite,onRun,onTask}:{run:any;identity:QueryIdentity;api:QueryApi;canWrite:boolean;onRun?:(run:any)=>void;onTask?:(id:string)=>void}){
 const [data,setData]=useState<any>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[day,setDay]=useState(run.selection.startDay),[reload,setReload]=useState(0),[patches,setPatches]=useState<CapacityPatch[]>([]),[group,setGroup]=useState<any>(),[comparison,setComparison]=useState<any>(),[submitted,setSubmitted]=useState(''),[assertUnstarted,setAssertUnstarted]=useState(false),[seconds,setSeconds]=useState(90),[dialog,setDialog]=useState<any>(),[preview,setPreview]=useState(false);
 const base='/workbooks/scenario/groups',signature=JSON.stringify(patches),scene=group?.scenarios?.[0],attempt=scene?.attempts?.at(-1),candidate=attempt?.revision===scene?.revision?attempt?.run:undefined;
 const calculating=active(group),candidateReady=!!candidate?.result&&['completed','partial'].includes(candidate.status),currentCandidate=candidateReady&&signature===submitted&&!group?.stale;
 useEffect(()=>{let live=true;setLoading(true);setError('');api('/workbooks/schedule-capacity',{identity,day}).then(r=>{if(!live)return;if(!sameQueryIdentity(identity,r.identity))throw Error('排产瓶颈来源不一致，请重新选择运行。');setData(r);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[identity.fingerprint,day,reload]);
 useEffect(()=>{let live=true;api(base+'?'+new URLSearchParams({datasetId:run.datasetId,baseRunId:run.id,purpose:'capacity-bottleneck'})).then(list=>{if(!live||!list.length)return;const g=list.at(-1),c=g.scenarios[0],saved=c?.conditions.find((c:any)=>c.type==='capacity')?.patches;if(saved){setPatches(saved);setSubmitted(JSON.stringify(saved));}setSeconds(g.definition.runSeconds);setGroup(g);}).catch(e=>{if(live)setError('历史模拟读取失败：'+e.message);});return()=>{live=false;};},[run.id]);
 useEffect(()=>{if(!calculating)return;let live=true;const timer=window.setTimeout(()=>api(base+'/'+group.id).then(g=>{if(live)setGroup(g);}).catch(e=>{if(live)setError(e.message);}),1000);return()=>{live=false;window.clearTimeout(timer);};},[group]);
 useEffect(()=>{if(!candidateReady)return;let live=true;api(base+'/'+group.id+'/query',{}).then(r=>{if(live)setComparison(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[candidate?.id,candidate?.resultHash,group?.revision]);
 async function act(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function simulate(){
  if(!data?.canSimulate)throw Error(data?.simulationBlock||'请先读取完整分析');
  if(!patches.length||patches.some(p=>!Number.isFinite(p.after)||p.after===p.before))throw Error('请填写有效且不同于原值的模拟参数');
  if(!data.execution.hasPlan&&!assertUnstarted)throw Error('请先确认任务均未开工；已有实际进度时请先在插单页确认任务状态及实际耗料。');
  let g=group;
  if(!g||g.stale){
   g=await api(base,{runId:run.id,expectedResultHash:run.resultHash,purpose:'capacity-bottleneck',name:'产能排产瓶颈分析 · '+run.id,planRevision:data.execution.planRevision,config:{maxScenarios:1,runSeconds:seconds,budgetSource:'按天瓶颈重排，用户明确的单项预算'},...(!data.execution.hasPlan?{facts:{observationDate:workbookDate(run.selection.currentDay??run.selection.startDay,identity.dayZero),tasks:run.result.tasks.map((t:any)=>({id:t.id,status:'not_started'})),completed:Object.fromEntries(run.result.demandResults.map((r:any)=>[r.id,0]))}}:{})});setGroup(g);
  }
  if(g.definition.runSeconds!==seconds)throw Error('本次模拟预算已冻结为'+g.definition.runSeconds+'秒；请恢复该秒数或重新读取分析后建立新模拟。');
  const token=globalThis.crypto.randomUUID();setSubmitted(signature);setComparison(undefined);
  g=await api(base+'/'+g.id+'/scenarios',{token:g.token,scenarioId:g.scenarios[0]?.id,name:'当前累计产能调整',conditions:[{id:'capacity-'+token,type:'capacity',object:'RUN',source:'第7视图累计产能模拟',patches}]});setGroup(g);
  g=await api(base+'/'+g.id+'/batch',{token:g.token,requestId:token,solver:'basic',scenarioIds:[g.scenarios[0].id]});setGroup(g);
 }
 async function adopt(){
  if(!currentCandidate)throw Error('模拟参数或来源已变化，请重新试算。');
  await api(base+'/'+group.id+'/candidate',{token:group.token,scenarioId:scene.id,runId:candidate.id,action:'adopt'});
  const adopted=await api('/workbooks/runs/'+candidate.id);if(onRun)onRun(adopted);else{setGroup(await api(base+'/'+group.id));setError('本方案已生效；请在抬头选择运行 '+candidate.id+' 查看新输入及排程结果。');}
 }
 function addSuggestion(s:any){setPatches(p=>{const old=p.find(p=>p.id===s.patch.id);return old?p.map(p=>p.id===s.patch.id?{...p,after:s.patch.after}:p):[...p,s.patch];});}
 if(!data)return <section className="schedule-capacity">{error?<p role="alert">{error}<button onClick={()=>setReload(n=>n+1)}>重新读取分析</button></p>:<p role="status">正在读取冻结任务、资源及日历，分析实际排产瓶颈…</p>}</section>;
 const variant=comparison?.results.find((r:any)=>r.id===scene?.id&&r.runId===candidate?.id),metrics=variant?.metrics?.summary,baselineMetrics=comparison?.results[0]?.metrics?.summary;
 return <section className="schedule-capacity capacity-overview" aria-label="产能排产瓶颈分析" aria-busy={loading||busy||calculating}>
 <header className="schedule-capacity-heading"><div><h3>产能排产瓶颈分析</h3><p>{data.meaning}</p></div><label>查看日期<select aria-label="排产瓶颈日期" value={day} disabled={loading||busy} onChange={e=>setDay(Number(e.target.value))}>{data.days.map((d:any)=><option key={d.day} value={d.day}>{d.date}</option>)}</select></label><button disabled={busy||calculating} onClick={()=>{setGroup(undefined);setComparison(undefined);setSubmitted('');setReload(n=>n+1);}}>刷新分析</button></header>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">正在更新所选日，保留上次完整结果…</p>}
 <div className="capacity-kpis"><button className="capacity-kpi" onClick={()=>setDialog({kind:'demands'})}><span>需求总数 / 完整准时满足 ⓘ</span><b>{data.summary.total} / {data.summary.onTime}</b><small>数量排全且计划到货不晚于最晚到货日</small></button><button className="capacity-kpi" onClick={()=>setDialog({kind:'demands'})}><span>延期 / 未排全 ⓘ</span><b>{data.summary.late} / {data.summary.unplanned}</b><small>交付信息不完整 {data.summary.unknown} 笔</small></button><button className="capacity-kpi" onClick={()=>setDialog({kind:'resources'})}><span>所选日资源压力项 ⓘ</span><b>{data.summary.pressure}</b><small>负荷≥90%或已超过可用值</small></button><button className="capacity-kpi" disabled={!data.theoretical} onClick={()=>setDialog({kind:'calculation'})}><span>所选组合理论上限 ⓘ</span><b>{num(data.theoretical?.selected?.total)} 千克/日</b><small>按本运行需求质量配比，不扣既有占用</small></button></div>
 <section className="capacity-panel"><h4>排产期间的实际资源压力</h4><div className="schedule-capacity-days">{data.days.map((d:any)=><button key={d.day} aria-pressed={d.day===data.day} disabled={loading} onClick={()=>setDay(d.day)}><b>{d.pressure}项</b><i style={{height:Math.min(100,d.peakLoad*70)+3,background:d.pressure?'#bf8034':'#3972a2'}}/><span>{d.date.slice(5)}</span><small>{d.taskCount}项开工</small></button>)}</div></section>
 <ScheduleCapacityParameters options={data.options} dayZero={identity.dayZero} patches={patches} onChange={setPatches} disabled={busy||calculating}/>
 <div className="schedule-capacity-toolbar">{data.execution.hasPlan?<span>沿用已确认任务事实：未开工 {data.execution.statuses.not_started}，已开工 {data.execution.statuses.started}，已完成 {data.execution.statuses.completed}，已锁定 {data.execution.statuses.locked}。已完成、已锁定任务保留。</span>:<label><input type="checkbox" checked={assertUnstarted} disabled={busy||calculating} onChange={e=>setAssertUnstarted(e.target.checked)}/>确认本计划全部未开工、无实际耗料或交付；已有进度时先在“插单”确认任务事实。</label>}<label>试算上限<input aria-label="瓶颈试算秒数" type="number" min={1} max={90} value={seconds} disabled={busy||calculating||!!group} onChange={e=>setSeconds(Number(e.target.value))}/>秒</label><button className="primary" disabled={!canWrite||!data.canSimulate||busy||calculating||!patches.length} onClick={()=>act(simulate)}>{calculating?'正在真实重排…':'模拟排程'}</button>{calculating&&<button disabled={busy} onClick={()=>act(async()=>setGroup(await api(base+'/'+group.id+'/cancel',{batchId:group.batches.at(-1).id})))}>取消本次试算</button>}{!canWrite&&<span>当前页面仅可查看；执行试算需维护权限，并先保存任务、插单与策略修改。</span>}{!data.canSimulate&&<span>{data.simulationBlock}</span>}</div>
 {data.suggestions.length>0&&<section className="capacity-panel"><h4>基于实际压力的建议措施 · 可累计到参数草稿</h4><div className="capacity-suggestions">{data.suggestions.map((s:any)=><div key={s.id}><b>{s.label}</b><small>{s.reason}</small><button disabled={busy||calculating} onClick={()=>addSuggestion(s)}>加入本次调整</button></div>)}</div><p>这里不预先承诺提升幅度；点击“模拟排程”后以真实交付、任务变化和约束检查判断效果。</p></section>}
 {candidate&&<section className="schedule-capacity-result" aria-label="瓶颈模拟排程结果"><h4>真实重排结果 · {candidate.id}</h4><p>{candidateReady?'已按本次累计参数重新计算，并完成独立约束检查。':candidate.failure||'试算尚未完成。'}{signature!==submitted?' 参数草稿已修改，请重新模拟。':''}{group.stale?' 输入或任务事实已变化，旧结果仅供查看；请刷新分析后重新模拟。':''}</p>
 {metrics&&<div className="capacity-scroll"><table><thead><tr><th>指标</th><th>原运行</th><th>模拟结果</th></tr></thead><tbody>{[['完整准时满足','onTime'],['已排但延期','late'],['数量未排全','unplanned'],['累计延期天数','delayDays'],['原任务调整数','changedTasks']].map(([label,key])=><tr key={key}><td>{label}</td><td>{num(baselineMetrics?.[key])}</td><td>{num(metrics[key])}</td></tr>)}</tbody></table></div>}
 <div className="schedule-capacity-toolbar"><button disabled={!canWrite||!currentCandidate||!metrics||busy||calculating||candidate.candidateState==='adopted'} onClick={()=>act(adopt)}>生效并更新当前排产方案</button><span>仅采用当前方案的新输入和结果；原运行保留，主数据及其他方案不改写。</span></div><button disabled={!candidateReady} onClick={()=>setPreview(v=>!v)}>{preview?'收起模拟排程视图':'查看模拟排程视图'}</button>{preview&&<WorkbookRunView run={candidate} api={api} canExport={false} initialView="E2"/>}<details><summary>本次参数与任务调整明细</summary><p>{patches.map(p=>{const o=data.options.find((o:any)=>o.id===p.id);return (o?o.name+' / '+o.field:p.id)+'：'+p.before+' → '+p.after;}).join('；')}</p>{variant?.metrics?.changes?.records?.filter((r:any)=>r.changed).map((r:any)=><p key={r.id}>{r.demandId} / {r.materialId}：原{r.before.length}项任务，现{r.after.length}项任务；{r.reason}</p>)}</details></section>}
 {data.theoreticalError&&<p className="capacity-scope">理论上限：{data.theoreticalError}</p>}
 <details className="capacity-panel" open><summary>所选日实际资源负荷与计算支撑</summary><ScheduleResourceDetails resources={data.resources} onTask={onTask}/></details>
 <details className="capacity-panel"><summary>沿用综合产能方法的完整计算过程</summary><button disabled={!data.theoretical} onClick={()=>setDialog({kind:'calculation'})}>悬浮查看设备、工装、班组与工序计算</button><p>实际占用来自当前冻结任务；理论上限用于解释共享约束。试算后以真实重排的交付、数量、任务调整和独立检查判断改善效果。</p></details>
 {dialog&&<ScheduleCapacityDetails data={data} dialog={dialog} onDialog={setDialog} onClose={()=>setDialog(undefined)} onTask={onTask}/>}
 </section>;
}
