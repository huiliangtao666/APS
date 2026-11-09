import {useEffect,useState} from 'react';
import {buildUrgentResultSummary} from './lib/urgent-result-summary.mjs';
import {UrgentMetricDialog} from './UrgentMetricDialog';
export const metricNumber=(v:number|null)=>v===null?'-':v.toLocaleString('zh-CN',{maximumFractionDigits:3});
export function urgentMetricGroups(metrics:any){
 const metric=(id:string,label:string,rows:any[],kind:string,meaning:string,formula:string,warning=false)=>({id,label,rows,kind,meaning,formula,warning,value:rows.length,unit:kind==='demand'?'笔':'个'});
 const u=metrics.urgent,t=metrics.originalTasks,a=metrics.adjustments;
 const demandMeaning='按本次冻结输入中的需求编号去重计数；原需求与插单分别保留来源。';
 const demandFormula='插单总数 = 本次已纳入计算的插单需求编号数；需求总数 = 原需求与插单需求编号的并集数。';
 const planMeaning='只有已交付量与本次安排量覆盖全部需求、未排量为0，并且交付时间满足要求，才计为已排；完整排入但迟交也计为未排。';
 const planFormula='已排 = 数量守恒且未排量为0，且预计迟交天数≤0；未排 = 插单总数 − 已排。缺少可核验字段时计入未排并列出原因。';
 const taskMeaning='按基线工序任务编号计数，使用第1步确认的数量与截止日期。按同需求、产品、工序的累计数量核验拆分或合并后的安排，不重复使用同一份产量。';
 const taskFormula='每个任务截止日内的对应工序累计完成量 ≥ 同组截至该日的原任务累计要求量，计为已排；否则计为未排。按天任务可在截止日期当天完成。';
 const changeMeaning='按本次冻结的原任务状态分类，对原任务编号去重，统计当前结果中安排发生变化的任务。比较时间、数量、设备、班组及工装；不改变已执行事实。';
 return [
  {label:'插单总数 / 需求总数',items:[metric('urgent-total','插单总数',u,'demand',demandMeaning,demandFormula),metric('demand-total','需求总数',metrics.demands,'demand',demandMeaning,demandFormula)]},
  {label:'插单已排 / 未排',items:[metric('urgent-planned','插单已排',u.filter((r:any)=>r.planned),'demand',planMeaning,planFormula),metric('urgent-unplanned','插单未排',u.filter((r:any)=>!r.planned),'demand',planMeaning,planFormula)]},
  {label:'原任务已排 / 未排',items:[metric('original-planned','原任务已排',t.filter((r:any)=>r.planned),'task',taskMeaning,taskFormula),metric('original-unplanned','原任务未排',t.filter((r:any)=>!r.planned),'task',taskMeaning,taskFormula)]},
  {label:'原任务调整',items:[metric('adjusted-started','已开工',a.started,'adjustment',changeMeaning,'已开工调整数 = 已开工任务中实际需要调整剩余工作的原任务编号数。已执行部分与实际耗料保留。',a.started.length>0),metric('adjusted-locked','已锁定',a.locked,'adjustment','统计当前选定结果中已锁定原任务的实际调整数。已锁定任务不可自动调整，正常结果应为0；解锁试算建议单独列出，不计入实际调整数。','已锁定调整数 = 当前结果中缺失或安排变化的已锁定原任务编号数；建议数量不参与此计算。',a.locked.length>0),metric('adjusted-unstarted','未开工',a.unstarted,'adjustment',changeMeaning,'未开工调整数 = 未开工任务中时间、数量、设备、班组或工装发生变化的原任务编号数。')]}
 ];
}
export function UrgentResultOverview({run,impact}:{run:any;impact:any}){
 const [selected,setSelected]=useState<{runId:string;inputHash:string;id:string}>();
 useEffect(()=>setSelected(undefined),[run.id,run.inputHash]);
 if(!impact||impact.runId!==run.id||impact.inputHash!==run.inputHash)return <p role="status">正在读取本次插单结果指标…</p>;
 const s=impact.summary?.metrics?.contract==='urgent-result-metrics-v2'?impact.summary:buildUrgentResultSummary(impact,{baselineTasks:impact.workspace?.workspace?.baselineTasks,fixedTaskIds:impact.workspace?.workspace?.fixedTaskIds,result:run.result});
 const groups=urgentMetricGroups(s.metrics),metric=selected?.runId===run.id&&selected?.inputHash===run.inputHash?groups.flatMap(g=>g.items).find(m=>m.id===selected?.id):undefined;
 return <section className="urgent-result-overview" aria-label="插单结果关键指标">
 <p className="urgent-result-headline">本次插单 {s.metrics.urgent.length} 笔，已排 {s.metrics.urgent.filter((r:any)=>r.planned).length} 笔；已排须同时满足全部数量与时间要求。点击各指标查看口径、来源及明细。</p>
 <div className="urgent-result-metrics">{groups.map(g=><article key={g.label} aria-label={g.label}><span>{g.label}</span><div className="urgent-metric-values">{g.items.map(m=><button key={m.id} type="button" data-metric={m.id} className={m.warning?'urgent-metric-warning':''} aria-haspopup="dialog" aria-label={m.label+' '+metricNumber(m.value)+' '+m.unit+'，查看计算明细'} onClick={()=>setSelected({runId:run.id,inputHash:run.inputHash,id:m.id})}><span>{m.label}</span><strong>{metricNumber(m.value)}<small>{m.unit}</small></strong></button>)}</div></article>)}</div>
 <p className="urgent-step-hint">原任务指基线工序任务，需求按笔、任务按个统计；指标基于本次冻结结果，不随下方筛选和分页改变。</p>
 {metric&&<UrgentMetricDialog key={run.id+metric.id} metric={metric} metrics={s.metrics} run={run} impact={impact} onClose={()=>setSelected(undefined)}/>}
 </section>;
}
