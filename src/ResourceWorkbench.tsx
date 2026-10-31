import {MockLedger} from './MockLedger';
import {useEffect,useMemo,useState} from 'react';
import {resourceClient,resourceTables,terminalResourceRun,resourceTaskSources} from './lib/resource-workbench.mjs';
import {ResourcePanel} from './ResourcePanel';
import {timeLabel} from './lib/timetable.mjs';
type Row=Record<string,string>;
export function ResourceWorkbench({data,revision,reason,canWrite,busy,draftPending,onLocate}:{data:Record<string,Row[]>;revision:number;reason:string;canWrite:boolean;busy:boolean;draftPending:boolean;onLocate?:(key:string)=>void}){
 const [orders,setOrders]=useState<string[]>([]),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const [runs,setRuns]=useState<any[]>([]),[active,setActive]=useState<string|null>(null),[view,setView]=useState<any>(null),[preview,setPreview]=useState<any>(null);
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[canExport,setCanExport]=useState(false),[selected,setSelected]=useState<string[]>([]);
 const request=async(path:string,body?:any)=>{
  const response=await fetch(import.meta.env.BASE_URL+'api'+path,body?{method:'POST',headers:{'Content-Type':'application/json','X-APS-Request':'workbench'},body:JSON.stringify({...body,reason})}:{cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Object.assign(Error(result.message||result.issues?.map((i:any)=>`${i.file||i.table}:${i.row}:${i.field} ${i.message}`).join('；')||result.error),{detail:result});return result;
 };
 const client=resourceClient(request),eligible=(data.orders||[]).filter(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效');
 const selection=useMemo(()=>({mode:'supported',orderIds:orders,startMinute:Number(start),endMinute:Number(end),priority:'规则设置',enabledRuleIds:(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号'])}),[orders,start,end,data.rules]);
 const valid=orders.length>0&&orders.every(id=>eligible.some(o=>o['订单编号']===id))&&/^\d+$/.test(start)&&/^\d+$/.test(end)&&Number(start)<Number(end)&&Number(end)<=525600;
 const key=JSON.stringify({revision,selection});
 useEffect(()=>{setPreview(null);},[key,draftPending]);
 useEffect(()=>{let disposed=false;Promise.all([request('/session'),client.runs()]).then(([session,rows])=>{if(!disposed){setCanExport(session.canExport);setRuns(rows);}}).catch(e=>{if(!disposed)setError(e.message);});return()=>{disposed=true;};},[]);
 // Poll only the explicit running calculation; server Worker owns scheduling and persistence.
 useEffect(()=>{if(!active)return;let disposed=false,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const run=await request('/runs/'+encodeURIComponent(active));if(disposed)return;setRuns(rows=>[run,...rows.filter(r=>r.id!==run.id)]);if(terminalResourceRun(run)){setActive(null);if(run.planId)setView(await client.reopen(run.id));else setError(run.failure?.message||'本次未保存结果');}else timer=setTimeout(poll,250);}catch(e){if(!disposed){setError((e as Error).message);setActive(null);}}};poll();return()=>{disposed=true;clearTimeout(timer);};},[active]);
 async function perform(action:()=>Promise<void>){setWorking(true);setError('');try{await action();}catch(e){setError((e as Error).message);}finally{setWorking(false);}}
 const disabled=busy||working||!canWrite||!reason.trim()||draftPending||!valid||!!active;
 return <aside className="hint-box" aria-label="联合资源工作台"><h2>联合资源配置与试算</h2>
  <p>先维护工装、人员池、技能和任务窗口，再保存全部草稿。新试算冻结已保存版本，旧运行仍读取原配置。时间单位为分钟，0 = 2026-11-02 08:00 +08:00；归还/释放端点可立即复用。</p>
  <nav aria-label="资源配置类别">{Object.entries(resourceTables).map(([key,label])=><button type="button" key={key} onClick={()=>onLocate?.(key)}>{label}（{data[key]?.length||0}）</button>)}</nav>
  <p>已保存配置版本 {revision}。{draftPending?'存在未保存草稿，请先保存或取消后试算。':'当前可按保存版本预览。'}共享不增加容量；多个技能组共用同一物理池总人数，技能关系仅按配置方向单跳匹配。</p>
  {(data.tools||[]).map(t=><p key={t['工装编码']}>工装 {t['工装编码']}：可用 {t['可用数量']||'未配置'} 套；每任务 {t['每任务需求数量']||'未配置'} 套；提前 {t['提前占用分钟']||'未配置'} / 后延 {t['后延占用分钟']||'未配置'} 分钟；可用 [{t['可用起始分钟']||'未配置'},{t['可用结束分钟']||'未配置'})。</p>)}
  {(data.personnelPools||[]).map(p=><p key={p.poolId}>池 {p.poolId}：唯一总人数 {p['总人数']||'未配置'}；共用 {p['允许共用']||'未配置'}；{p['互斥粒度']} / {p['占用策略']}；来源 {p['容量来源']||'未配置'}；{p['策略来源']||'策略来源未配置'}。</p>)}
  <fieldset><legend>新运行选择</legend>{eligible.map(o=><label key={o['订单编号']}><input aria-label={'资源订单 '+o['订单编号']} type="checkbox" checked={orders.includes(o['订单编号'])} onChange={e=>setOrders(e.target.checked?[...orders,o['订单编号']]:orders.filter(id=>id!==o['订单编号']))}/>{o['订单编号']}</label>)}
  <label>开始分钟<input aria-label="资源开始分钟" type="number" min="0" max="525599" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束分钟<input aria-label="资源结束分钟" type="number" min="1" max="525600" value={end} onChange={e=>setEnd(e.target.value)}/></label></fieldset>
  <button disabled={disabled} onClick={()=>perform(async()=>setPreview({...await client.preview(Object.fromEntries(Object.keys(resourceTables).map(k=>[k,data[k]||[]])),revision,selection),key}))}>预览已保存资源与排程（零写入）</button>
  <button disabled={disabled||preview?.key!==key} onClick={()=>perform(async()=>{const run=await client.start(revision,selection);setView(null);setActive(run.id);setRuns([run,...runs.filter(r=>r.id!==run.id)]);})}>冻结资源配置并新算</button>
  {preview&&<div role="status" aria-label="资源联合预览"><p>预览基于版本 {preview.revision} · 独立复核 {preview.candidate.resourceVerification.status} · {preview.configurationHash}</p>{preview.candidate.tasks.map((t:any)=><p key={t.id}>{t.id} [{t.start},{t.end})</p>)}{preview.candidate.findings.map((f:any,i:number)=><p key={i}>{f.code}：{f.message}</p>)}</div>}
  {active&&<p role="status">正在计算 {active}；资源配置和订单选择已冻结。</p>}
  <label>重开资源运行<select aria-label="重开资源运行" value={view?.run.id||''} onChange={e=>{if(e.target.value)perform(async()=>{setView(await client.reopen(e.target.value));setSelected([]);});}}><option value="">请选择已有结果</option>{runs.filter(r=>r.planId).map(r=><option key={r.id} value={r.id}>{r.id} · 输入版本 {r.revision}</option>)}</select></label>
  {error&&<p role="alert">{error}</p>}
  {view&&<section aria-label="冻结资源结果"><p>运行 {view.run.id} · 方案 {view.plan.id} · 输入 {view.run.inputVersionId} · 快照 {view.run.snapshotHash} · 资源版本 {view.version} · 独立复核 {view.verification.status}</p>
   <table><thead><tr><th>任务</th><th>设备</th><th>开始</th><th>结束</th><th>来源</th></tr></thead><tbody>{view.plan.tasks.filter((t:any)=>!selected.length||selected.includes(t.id)).map((t:any)=><tr key={t.id}><td>{t.id}</td><td>{t.machine}</td><td>{timeLabel(t.start)}</td><td>{timeLabel(t.end)}</td><td>{t.source}</td></tr>)}</tbody></table>
   <MockLedger data={view.snapshot.executionData} frozen={true}/><ResourcePanel plan={view.plan} onTask={ids=>setSelected(ids)}/><button onClick={()=>setSelected([])}>显示全部任务</button>
   {view.snapshot.conditions.originalDependencyBindings?.length>0&&<section aria-label="原12采用与延期"><h3>原12采用与延期</h3>{view.snapshot.conditions.originalDependencyBindings.map((b:any,i:number)=>{const csv=view.plan.inputCsvSources?.originalDependencies;return <p key={i}><button onClick={()=>setSelected(view.plan.tasks.filter((t:any)=>t.orderId===b.sourceRecord['订单编号']&&t.operation===b.sourceRecord['工序编号']).map((t:any)=>t.id))}>{b.sourceRecord['订单编号']}/{b.sourceRecord['工序编号']} · {b.sourceRecord['资源编号']}</button> · {b.status} · {csv?.file||'原12'} 第 {csv?.records?.[b.sourceIndex]?.line??b.sourceIndex+2} 行 · {b.reason}</p>;})}</section>}
   {!!selected.length&&<section aria-label="冻结资源输入"><h3>选中任务与冻结输入：{selected.join('、')}</h3>{resourceTaskSources(view,selected).map((r:any,i:number)=><p key={i}>{r.table} · {r.file?`${r.file} 原文件第 ${r.physicalRow??'未知'} 行`:`规范化记录第 ${r.canonicalRow} 行（无原CSV行映射）`} · 输入 {r.inputVersionId} · {JSON.stringify(r.row)}</p>)}</section>}
   {view.findings.map((f:any,i:number)=><div key={i}><button onClick={()=>setSelected(f.taskIds||[])}>{f.code}：{f.message}</button>{f.relatedRecords?.map((r:any,n:number)=><p key={n}>{r.table} · 原始行 {r.origin?.physicalRow??r.row??r.index} · 输入版本 {r.origin?.inputVersionId||view.run.inputVersionId} · {JSON.stringify(r.key||r.identity||r)}</p>)}</div>)}
   {view.verification.details?.map((s:string,i:number)=><p key={i}>{s}</p>)}
   <button disabled={!canExport||!reason.trim()||working} onClick={()=>perform(async()=>{const response=await fetch(import.meta.env.BASE_URL+'api/export',{method:'POST',headers:{'Content-Type':'application/json','X-APS-Request':'workbench'},body:JSON.stringify({...client.exportBody(view),reason})});if(!response.ok)throw Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='资源运行-'+view.run.id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>导出本运行资源账与来源</button>
  </section>}
 </aside>;
}
