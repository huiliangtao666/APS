import {ProblemRecords} from './ProblemRecords';
import {currentRecord,type RecordRef} from './lib/problem-records.mjs';
import {inventoryView} from './lib/inventory-view.mjs';
import {CsvBatchPanel} from './CsvBatchPanel';
import {ExchangeGuide} from './ExchangeGuide';
import {ReportPanel} from './ReportPanel';
import {LoadPanel} from './LoadPanel';
import {TaskLinkage} from './TaskLinkage';
import {TimelinePanel} from './TimelinePanel';
import {ConfirmationPanel} from './ConfirmationPanel';
import {ExecutionPanel} from './ExecutionPanel';
import {TrialPanel,type Trial} from './TrialPanel';
import {ResultPanel,type ResultPlan} from './ResultPanel';
import {DeliveryPanel,type DeliveryPlan} from './DeliveryPanel';
import {ResourcePanel,type JointPlan} from './ResourcePanel';
import {BatchPanel,type BatchPlan} from './BatchPanel';
import {MaterialPanel} from './MaterialPanel';
import {type MaterialDemandRow} from './lib/material-allocation.mjs';
import {RunPanel,CheckScope,type Run} from './RunPanel';
import {RulePanel,UsedRules} from './RulePanel';
import {type RuleSnapshot} from './lib/business-rules.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';
import { defs } from './data-defs';
import {SingleCsvPanel} from './SingleCsvPanel';
import { DataEditor } from './DataEditor';
import { DataQueries } from './DataQueries';
import { useAppMembership } from './auth/useAppMembership';
import { usePraetorEmbedded } from './praetor-embedded';
import { type VerificationReport, type VerificationStatus } from './lib/independent-verification.mjs';
import { validateMasterData } from './lib/master-data.mjs';
import { validateProcessConfig } from './lib/process-config.mjs';
import { validateExpectedSupply, resolveExpectedSupply, type SupplyCondition } from './lib/expected-supply.mjs';
import { validateInventoryBatches } from './lib/inventory.mjs';
import { validateBomConfig } from './lib/bom-config.mjs';

type Row = Record<string, string>;
type Task = { productionBatchId?:string;resourceBatchId?:string; id: string; orderId: string; productId: string; operation: string; label: string; machine: string; start: number; end: number; duration: number; predecessor: string; source: string };
type Finding = { code: string; message: string; taskIds: string[]; relatedRecords?:RecordRef[];associationGap?:string;associationState?:string;missingTarget?:{table:string;key?:string;requirement?:string};sourceRevision?:number };
type StoredVerificationReport = VerificationReport & { inputFingerprint?: string };
type Plan = ResultPlan & DeliveryPlan & JointPlan & BatchPlan & { id: string; name: string; createdAt: string; tasks: Task[]; findings: Finding[]; rules: string[]; inputVersion: string; verification?: StoredVerificationReport; supplyConditions?: SupplyCondition[]; supplyInput?: string; materialChecked?:boolean;materialDemands?:MaterialDemandRow[]; ruleSnapshot?: RuleSnapshot; inputSnapshot?:Record<string,Row[]>;runId?:string;conditions?:Run["conditions"] };

function rulesInputFingerprint(data:Record<string,Row[]>) { const source=JSON.stringify({orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],personnelGroups:data.personnelGroups||[],machines:data.machines||[],calendars:data.calendars||[],downtime:data.downtime||[],rules:data.rules||[]});let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0'); }

export default function App() {
  const membership=useAppMembership();
  const requestGeneration=useRef(0);
  const embedded = usePraetorEmbedded();
  const [data,setData]=useState<Record<string,Row[]>>({});
  const [queryHistorical,setQueryHistorical]=useState(false);
  const [checkedInputs,setCheckedInputs]=useState<Record<string,Record<string,Row[]>>>({});
  const [querySnapshot,setQuerySnapshot]=useState<{data:Record<string,Row[]>;id:string}|undefined>();
  const [queryOccurrence,setQueryOccurrence]=useState<number|undefined>();
  const [currentInputId,setCurrentInputId]=useState<string>();
  const [queryInputRow,setQueryInputRow]=useState<Row|undefined>();
  const [queryInputTable,setQueryInputTable]=useState<string|undefined>();
  const [view,setView]=useState<'schedule'|'data'|'query'|'decisions'|'reports'>('schedule');
  useEffect(()=>{if(view!=='query')setQueryInputTable(undefined);},[view]);
  const [tableKey,setTableKey]=useState('orders');
  const [inventoryAsOf,setInventoryAsOf]=useState(new Date(Date.now()+8*3600000).toISOString().slice(0,16));
  const [selected,setSelected]=useState<string[]>([]);
  const [focusedProblem,setFocusedProblem]=useState<any>(null);
  const [problemOnly,setProblemOnly]=useState(false);
  const [recordProblem,setRecordProblem]=useState<Finding|null>(null);
  const [recordProblemOpen,setRecordProblemOpen]=useState(0);
  const [editRecord,setEditRecord]=useState<RecordRef|null>(null);

  const [runs,setRuns]=useState<Run[]>([]);
  const pendingRun=useRef<string|null>(null);
  const [trials,setTrials]=useState<Trial[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [activePlan,setActivePlan]=useState<Plan|null>(null);
  useEffect(()=>{setFocusedProblem(null);setProblemOnly(false);setRecordProblem(null);},[activePlan?.id]);
  const [verification,setVerification]=useState<StoredVerificationReport|null>(null);
  const [message,setMessage]=useState('');
  const [issues,setIssues]=useState<Finding[]>([]);
  const [inputVersion,setInputVersion]=useState(0);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [session,setSession]=useState<{role:string;canWrite:boolean;canExport:boolean}|null>(null);
  const [operations,setOperations]=useState<{id:string;action:string;actor:string;at:string;reason:string;target?:string;before?:Row[];after?:Row[]}[]>([]);
  const orderHistory=operations.flatMap(r=>{const x=r as typeof r & {target?:string;before?:Row[];after?:Row[]};if((x as typeof x & {trialId?:string}).trialId||x.target!=='orders'||!x.before||!x.after)return [];return x.after.flatMap(row=>{const before=x.before!.find(b=>b['订单编号']===row['订单编号']);return before?['合格需求','数量单位','要求可交付分钟'].filter(f=>before[f]!==row[f]).map(f=>({orderId:row['订单编号'],field:f,before:before[f],after:row[f],changedAt:x.at})):[];});});
  const currentDef=defs.find(d=>d.key===tableKey)!;
  const currentRows=data[tableKey]||[];
  const inventoryQuery=useMemo(()=>inventoryView(data,inventoryAsOf?inventoryAsOf+':00+08:00':''),[data.inventory,data.executionMaterials,data.rules,inventoryAsOf]);
  const inventoryIssues=useMemo(()=>validateInventoryBatches(data.inventory||[],data.materials||[]),[data.inventory,data.materials]);
  const supplyInput=JSON.stringify({supplies:data.supplies||[],delays:data.supplyDelays||[],uses:data.supplyUses||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[]});
  const supplyIssues=useMemo(()=>validateExpectedSupply(JSON.parse(supplyInput)),[supplyInput]);
  const resolvedSupplies=useMemo(()=>resolveExpectedSupply(data.supplies||[],data.supplyDelays||[]),[data.supplies,data.supplyDelays]);
  const supplyStale=!!activePlan && (activePlan.supplyInput ? activePlan.supplyInput!==supplyInput : (data.supplyUses||[]).length>0);
  const enabledRules=(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
  const tasks=activePlan?.tasks||[];
  const verificationStale=!!verification&&(activePlan?.inputVersion!==`v${inputVersion}`||verification.inputFingerprint!==rulesInputFingerprint(data));

  async function api(path:string,body?:object) {
    const generation=requestGeneration.current;
    const r=await fetch('/api'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,reason})}:{cache:'no-store'});
    if(!r.ok){const e=await r.json();if(e.findings&&generation===requestGeneration.current){setIssues(e.findings);if(e.checkedInputs)setCheckedInputs(current=>({...current,...Object.fromEntries(Object.values(e.checkedInputs).map((entry:any)=>[entry.inputVersionId,entry.data]))}));if(e.checkedInput)setCheckedInputs(current=>({...current,[e.checkedInput.inputVersionId]:e.checkedInput.data}));}throw Object.assign(new Error(e.blockers?.length?e.blockers.map((b:any)=>`${b.code}：${b.message}`).join('；'):e.error==='stale_input'?'输入已变化，请刷新并重新编辑':e.error==='protected_history_unavailable'?'已确认方案缺少原始输入，已阻止修改，请先修复历史记录':e.issues?.length?e.issues.map((x:any)=>`${x.file} 第${x.row}行 ${x.field}：${x.message}`).join('；'):({current_execution_changed:'当前执行事实已变化，请从当前事实另开计算；原运行记录保留',historical_inputs_unavailable:'原始输入记录不完整，请联系维护人员并提供运行编号',run_active:'原计算尚未结束，请等待或先取消',run_finished:'运行已经结束，请刷新查看结果',trial_discarded:'试算已放弃，不能重新计算',run_capacity:'已有两个计算正在运行，请等待结束或取消其中一个',forbidden:'当前角色没有此操作权限，请联系管理员',reason_required:'请先填写操作原因'} as Record<string,string>)[e.error]||e.message||e.error||`HTTP ${r.status}`),{detail:e,status:r.status});}const result=await r.json();if(generation!==requestGeneration.current)throw new Error('身份已变化，请刷新');return result;
  }
  async function refresh(){const [state,list,who,log,history,trialList]=await Promise.all([api('/state'),api('/plans'),api('/session'),api('/operations'),api('/runs'),api('/trials')]);setTrials(trialList);setData(state.data);setCurrentInputId(state.inputVersionId);setInputVersion(state.revision);setPlans(list);setActivePlan(current=>current?(list.find((p:Plan)=>p.id===current.id)??current):current);setSession(who);setOperations(log);setRuns(history);const done=history.find((r:Run)=>r.id===pendingRun.current&&r.planId);if(done){pendingRun.current=null;const p=list.find((p:Plan)=>p.id===done.planId);if(p){setActivePlan(p);setIssues(p.findings);setVerification(null);}}}
  useEffect(()=>{requestGeneration.current++;if(membership.state.kind==='member'){refresh().catch(e=>setMessage(e.message));}else{setData({});setTrials([]);setRuns([]);pendingRun.current=null;setPlans([]);setActivePlan(null);setSession(null);setCheckedInputs({});setQuerySnapshot(undefined);setRecordProblem(null);setEditRecord(null);setIssues([]);}},[membership.state]);
  const hasActiveRun=runs.some(r=>['queued','running','cancel_requested','stopping'].includes(r.status));
  useEffect(()=>{if(!hasActiveRun||membership.state.kind!=='member')return;const timer=window.setInterval(()=>{refresh().catch(e=>setMessage(e.message));},750);return ()=>window.clearInterval(timer);},[hasActiveRun,membership.state]);
  function startRun(selection:object){perform(async()=>{const run=await api('/runs',{revision:inputVersion,selection});pendingRun.current=run.id;await refresh();});}
  function cancelRun(id:string){perform(async()=>{await api('/runs/'+id+'/cancel',{});await refresh();});}
  function perform(work:()=>Promise<void>){if(busy)return;setBusy(true);work().catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}
  function download(target:object,name:string){perform(async()=>{const r=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...target,reason})});if(!r.ok){const e=await r.json();throw new Error(({stale_report:'报表快照已变化，请重新查询后导出',forbidden:'当前角色没有导出权限，请联系管理员',membership_required:'成员权限已撤销，请重新登录',historical_inputs_unavailable:'历史输入不可用，已阻止导出',protected_history_unavailable:'确认快照校验失败，已阻止导出',invalid_report_export:'导出条件无效，请重新查询'} as Record<string,string>)[e.error]||e.error);}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);await refresh();});}
  function downloadCsv(){download({table:tableKey},currentDef.file);}
  function schedule(){perform(async()=>{const p=await api('/calculate',{revision:inputVersion});setActivePlan(p);setVerification(null);setIssues(p.findings);await refresh();});}
  function verifyPlan(){if(activePlan)perform(async()=>{const p=await api('/plans/'+activePlan.id+'/verify',{});setActivePlan(p);setVerification({...p.verification,inputFingerprint:rulesInputFingerprint(data)});await refresh();});}
  function savePlan(){if(activePlan)perform(async()=>{await api('/plans',{id:activePlan.id});setMessage('服务端排程快照已保存。');await refresh();});}
  function exportPlan(){if(activePlan)download({planId:activePlan.id},activePlan.id+'-tasks.csv');}
  const visibleFindings=useMemo(()=>[...(issues.length?issues:(activePlan?.findings||[])),...(activePlan?.verification?.findings||[])],[issues,activePlan]);
  function locate(f:Finding){if(!f.taskIds.length){setRecordProblem(f);setRecordProblemOpen(n=>n+1);return;}setRecordProblem(f.relatedRecords?.length?f:null);setRecordProblemOpen(n=>n+1);setFocusedProblem(f);setSelected(f.taskIds);setView('schedule');}

  if(membership.state.kind!=='member')return <main className="panel"><h1>APS · 模拟排程</h1><p>身份状态：{membership.state.kind}</p><p>需要托管身份和已授权业务成员。</p><button onClick={()=>membership.signIn()}>登录</button></main>;
  return <div className="app-shell">
    <header className={`topbar ${embedded?'embedded-topbar':''}`}><div className="brandmark">APS</div><div className="brand"><b>APS · 单线最小排程</b><span>R1 原型 / v0.3 需求基线</span></div>{<nav><button className={view==='schedule'?'active':''} onClick={()=>setView('schedule')}>排程工作台</button><button className={view==='query'?'active':''} onClick={()=>setView('query')}>模拟数据查询</button><button className={view==='data'?'active':''} onClick={()=>setView('data')}>数据与 CSV</button><button className={view==='reports'?'active':''} onClick={()=>setView('reports')}>查询报表与导出</button><button className={view==='decisions'?'active':''} onClick={()=>setView('decisions')}>范围与待决</button></nav>}<div className="top-status"><i/>预览环境</div></header>
    <main>
      <section className="panel"><h2>权限与操作记录</h2><p>当前权限：{session?.role||'未取得业务权限'} · 所有质量状态均为模拟数据，无 QA 在线审批。计划员可核对及提交，主管可确认或退回；确认仅在本系统支持范围内生效。</p><label>操作原因（必填）<input aria-label="操作原因" value={reason} onChange={e=>setReason(e.target.value)}/></label><button onClick={()=>{requestGeneration.current++;membership.signOut().catch(e=>setMessage(e.message));}}>退出登录</button><button onClick={()=>perform(refresh)}>刷新数据与记录</button><details><summary>操作记录（{operations.length}）</summary>{operations.map(r=><p key={r.id}>{r.at} · {r.actor} · {r.action} · {r.reason}</p>)}</details></section>
      <section className="hero"><div><p className="eyebrow">单线排程 · R1 最小模式 / 已有支持模式</p><h1>{view==='schedule'?'排程计算与范围核对':view==='data'?'日历与排程数据':view==='query'?'模拟数据与关联查询':view==='reports'?'查询报表与文件导出':'实现范围与业务决策'}</h1><p className="sub">基于 v0.3 UAT-02 / 2026-11-02 08:00（Asia/Shanghai）；样例业务值均为虚构，仅用于软件验证。</p></div><div className="hero-source"><span>追溯基线</span><b>FR-008 · UAT-02 · AC-05</b><small>工厂窗口继承 · 设备停机例外 · 连续工作窗口</small></div></section>
      {message&&<div className="toast" role="status" aria-live="polite" aria-atomic="true"><span>{message}</span><button aria-label="关闭提示" onClick={()=>setMessage('')}>×</button></div>}
      {recordProblem&&<ProblemRecords key={recordProblemOpen} finding={recordProblem} data={data} identityContext={{inputVersionId:currentInputId,operations}} canWrite={!!session?.canWrite&&!busy} onClose={()=>setRecordProblem(null)} onQuery={(ref,current)=>{const resolved=current?currentRecord(ref,data,{inputVersionId:currentInputId,operations}):null;if(current&&!resolved)return;const id=ref.origin?.inputVersionId;const original=id?(checkedInputs[id]||plans.find(p=>(p as any).inputVersionId===id)?.inputSnapshot):undefined;if(!current&&!original){setMessage('原输入版本不可用；上方保留原检查值，不能使用当前同位记录替代。');return;}setQuerySnapshot(!current&&original&&id?{data:original,id}:undefined);setQueryOccurrence(current?resolved?.index:ref.origin?.occurrence.index);setQueryHistorical(!current);setQueryInputTable(ref.table);setQueryInputRow(current?resolved!.row:ref.row);setView('query');}} onEdit={ref=>{setTableKey(ref.table);setEditRecord(ref);setView('data');}}/>}
      {view==='reports'&&<ReportPanel key={membership.state.kind} plans={plans} api={api} onExport={session?.canExport&&!busy&&!!reason.trim()?download:undefined}/>}
      {view==='schedule'&&<>
        <ConfirmationPanel plans={plans} role={session?.role} busy={busy} reason={reason} api={api} refresh={refresh} onExport={session?.canExport?id=>download({confirmationId:id},id+'-确认副本.json'):undefined}/>
        <TrialPanel plans={plans} activeId={activePlan?.id} trials={trials} runs={runs} revision={inputVersion} canWrite={!!session?.canWrite} busy={busy} reason={reason} api={api} refresh={refresh} onResult={id=>{api('/plans').then(list=>{const p=list.find((x:Plan)=>x.id===id);if(p){setActivePlan(p);setIssues(p.findings);setVerification(p.verification||null);}}).catch(e=>setMessage(e.message));}} onRun={(trial,selection)=>perform(async()=>{const run=await api('/runs',{trialId:trial.id,revision:trial.revision,selection});pendingRun.current=run.id;await refresh();})} onCancel={cancelRun}/>
        {activePlan&&<ResultPanel onProblem={locate} plan={activePlan} onTask={id=>setSelected([id])} onInput={(table,row,taskId)=>{if(taskId)setSelected([taskId]);setQuerySnapshot(undefined);setQueryOccurrence(undefined);setQueryHistorical(true);setQueryInputTable(table);setQueryInputRow(row);setView('query');}}/>}
        <RunPanel onRetry={id=>perform(async()=>{const run=await api('/runs/'+id+'/retry',{});pendingRun.current=run.id;await refresh();})} data={data} runs={runs} canWrite={!!session?.canWrite&&!!reason.trim()} busy={busy} onExport={session?.canExport&&!busy&&!!reason.trim()?id=>download({runId:id},id+'-结果原因.csv'):undefined} onStart={startRun} onCancel={cancelRun} onInputs={id=>api('/runs/'+id+'/inputs')} onResult={id=>{const p=plans.find(p=>p.id===id);if(p){setActivePlan(p);setIssues(p.findings);setVerification(p.verification||null);}}}/>
        <div className="metrics"><article><span>单线订单</span><b>{data.orders?.length||0}</b><small>FR-009 / BR-01</small></article><article><span>已排任务</span><b>{tasks.length}</b><small>机器 + 前后序</small></article><article><span>问题定位</span><b className={visibleFindings.length?'warn-text':''}>{visibleFindings.length}</b><small>问题与甘特联动</small></article><article><span>保存方案</span><b>{plans.length}</b><small>快照保留输入版本</small></article></div>
        {activePlan&&<CheckScope scope={activePlan.conditions?.checkScope}/>}
        {activePlan&&<DeliveryPanel plan={activePlan} plans={plans} onTask={ids=>setSelected(ids)}/>}
        {activePlan&&<ResourcePanel plan={activePlan} onTask={ids=>setSelected(ids)}/>}
        {activePlan&&<BatchPanel plan={activePlan} onTask={ids=>setSelected(ids)}/>}
        {activePlan&&<MaterialPanel plan={activePlan} onTask={id=>setSelected([id])}/>}
        {activePlan&&activePlan.conditions?.mode!=='minimal-r1'&&<section className="panel"><h2>预计供给使用条件</h2>{supplyStale&&<p role="alert">供给、延期、引用或相关主数据已变化；当前方案是旧快照，须重新计算。保存与导出保留原方案条件。</p>}{activePlan.supplyConditions?.length ? activePlan.supplyConditions.map(c=><div className="hint-box" key={c['引用编号']}><b>{c['订单编号']} / {c['工序编号']} · 条件性计划</b><span>{c['条件说明']}</span><span>延期记录：{c['延期记录'].map(d=>`${d['记录编号']}（${d['原因']}）`).join('；')||'无'}</span></div>) : <p>{activePlan.supplyInput?'本方案没有显式引用预计供给；尚未校验全部物料需求覆盖。':'旧版方案未记录预计供给条件；请重新计算后评估。'}</p>}<p>仅对“计划供给引用”中的供给按可用时间安排；物料分配是否执行以本方案保存的 MATERIAL 采用状态和下方需求记录为准；不确认到货或创建采购单。</p></section>}
        <section className="panel control-panel"><div><h2>已有支持模式 · 同步计算 / 方案操作</h2><p>任务完整落入工厂工作窗口；机器自动运行时段与人员参与阶段分开计算。人员须同时满足人数、技能、班次和可用时间。</p><div className="rule-chips"><span>BR-02 工序顺序</span><span>BR-03 机器占用</span><span>FR-008 日历窗口</span><span>FR-007 人数与技能</span><span>已配置启用：{enabledRules.join(' · ')||'无'}（实际采用见方案设置）</span></div></div><div className="actions"><button className="primary" onClick={schedule} disabled={!session?.canWrite||busy||!reason.trim()}>同步计算全部（无取消）</button><button onClick={verifyPlan} disabled={!activePlan||!session?.canWrite||busy||!reason.trim()}>独立复核</button><button onClick={savePlan} disabled={!session?.canWrite||busy||!reason.trim()}>保存快照</button><button onClick={exportPlan} disabled={!activePlan||!session?.canExport||busy||!reason.trim()}>导出 CSV</button></div></section>
        {activePlan&&<>{activePlan.runId&&<p>当前方案运行编号：{activePlan.runId} · 订单 {activePlan.conditions?.orderIds.join("、")} · 范围 {activePlan.conditions?.startMinute}–{activePlan.conditions?.endMinute??"原日历末尾"} 分钟 · 排序 {activePlan.conditions?.priority}</p>}<UsedRules snapshot={activePlan.ruleSnapshot}/><button disabled={!session?.canExport||busy||!reason.trim()} onClick={()=>download({planId:activePlan.id,ruleSettings:true},activePlan.id+'-规则设置.csv')}>导出本方案规则设置</button></>}
        <section className="panel verification-panel"><div className="panel-head"><div><h2>独立结果复核 · 主管确认前</h2><p>复核器独立检查单线、机器不重叠、优先关系、冻结工厂日历与设备停机；新方案使用本次冻结的订单与路线，当前输入变化后须重新计算。</p></div><span className={`tag ${verificationStale?'warn-text':''}`}>{!verification?'尚未复核':verificationStale?'复核已过期':'复核记录'}</span></div>
          {!verification?<div className="empty">运行“独立复核”后显示通过、问题和未检查明细。主管确认前应重新复核一次。</div>:<><div className="verification-meta"><span>复核时间：{new Date(verification.checkedAt).toLocaleString('zh-CN',{hour12:false})}</span><span>订单/规则输入标识：{verification.inputFingerprint||'旧版记录，无标识'}</span>{verificationStale&&<b>当前订单或规则输入与复核记录不一致；此复核不能用于主管确认。</b>}</div><div className="verification-grid">{([
            ['lineScope','单线约束'],['machineOverlap','机器不重叠'],['precedence','优先关系'],['calendar','工厂日历 / 设备停机'],['resourcePolicies','工装 / 人员参数'],['batchAndWait','批次重量 / 最大等待'],
          ] as const).map(([key,label])=>{const check=verification.checks[key];if(!check)return null;const statusLabel:Record<VerificationStatus,string>={pass:'通过',problem:'问题',not_checked:'未检查'};return <article className={`verification-check ${check.status}`} key={key}><div><b>{label}</b><strong>{statusLabel[check.status]}</strong></div><ul>{check.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul></article>;})}</div>{verification.ruleStatuses?.map((r:any,i:number)=><p key={i}>规则 {r.id} · {r.status==='not_checked'?'未检查':r.status==='problem'?'问题':'通过'} · {r.reason}</p>)}<small className="verification-note">本报告复核上述已列明约束；新运行另按冻结配置独立核对工装和人员。保存的结果不代替主管确认。输入变更后需重新复核。</small></>}
        </section>
        <LoadPanel onExport={session?.canExport&&!busy&&!!reason.trim()?options=>download({planId:activePlan?.id,resourceLoad:options},activePlan?.id+'-资源负荷.csv'):undefined} key={'load-'+(activePlan?.id||'none')} plan={activePlan} onTask={ids=>{setProblemOnly(false);setFocusedProblem(null);setSelected(ids);}} onInput={(table,row)=>{setQuerySnapshot(undefined);setQueryOccurrence(undefined);setQueryHistorical(true);setQueryInputTable(table);setQueryInputRow(row);setView('query');}}/>
        <TaskLinkage plan={activePlan} selected={selected} findings={visibleFindings} focused={focusedProblem} onProblem={locate} onSelect={ids=>{setFocusedProblem(null);setSelected(ids);}} onCheck={verifyPlan} busy={busy||!session?.canWrite||!reason.trim()} problemOnly={problemOnly} onFilter={setProblemOnly}/>
        <TimelinePanel focusedProblem={focusedProblem} problemTaskIds={problemOnly?visibleFindings.flatMap(f=>f.taskIds):undefined} key={activePlan?.id||'none'} plan={activePlan} selected={selected} onSelect={setSelected} currentFacts={data.executionFacts||[]} onInput={(table,row)=>{setQuerySnapshot(undefined);setQueryOccurrence(undefined);setQueryHistorical(true);setQueryInputTable(table);setQueryInputRow(row);setView('query');}}/>
        <div className="content-grid">
        <aside className="panel issues-panel"><div className="panel-head"><div><h2>问题定位</h2><p>点击问题突出关联任务；输入错误定位到表格更正。</p></div><span className={`count ${visibleFindings.length?'error':''}`}>{visibleFindings.length}</span></div>
          {visibleFindings.length?visibleFindings.map((f,i)=><button className="finding" key={`${f.code}-${i}`} onClick={()=>locate(f)}><b>{f.code}</b><span>{f.message}</span>{f.taskIds.length>0&&<small>定位任务：{f.taskIds.join(' / ')}</small>}</button>):<div className="clear-state"><span>✓</span><b>{activePlan?'当前结果未报告问题':'尚无计算结果'}</b><small>检查范围见当前方案记录；无问题不代表全订单覆盖或完整业务可执行。</small></div>}
          <div className="scope-note"><b>检查边界</b><p>R1 最小模式不判断日历、停机、人员、工装或物料；已有支持模式保留既有依赖保护。跨班和可中断策略尚无已确认业务口径；显式声明的工装/空间以及物料/拆合批是否检查见本方案范围；动态释放、最大等待、执行事实及主管确认尚未实现；显式预计供给引用按可用时点等待。</p></div>
        </aside></div>
        <section className="panel plan-list"><div className="panel-head"><div><h2>任务明细 / 已保存方案</h2><button onClick={()=>setView('query')}>查询关联输入与任务</button><p>任务时间、资源和前序引用支持核查；保存方案在此回看。</p></div><select aria-label="已保存方案" value={activePlan?.id||''} onChange={e=>{const plan=plans.find(p=>p.id===e.target.value)||activePlan;setActivePlan(plan);setIssues([]);setVerification(plan?.verification||null);}}><option value="">当前计算</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>

        </section>
      </>}
      {view==='query'&&<DataQueries key={inputVersion+'-'+plans.map(p=>p.id).join(',')+'-'+queryInputTable+'-'+JSON.stringify(queryInputRow)+'-'+queryHistorical+'-'+queryOccurrence+'-'+querySnapshot?.id} data={data} plans={plans} revision={inputVersion} initialHistorical={!!queryInputTable&&queryHistorical} initialTable={queryInputTable} initialSnapshot={querySnapshot} initialOccurrence={queryOccurrence} initialRow={queryInputTable?queryInputRow:undefined} initialPlan={activePlan?.id} initialTask={selected[0]} canExport={!!session?.canExport} reason={reason} onExport={(query)=>download({query},'模拟数据查询.csv')} onRestore={session?.canWrite?(tables)=>perform(async()=>{await api('/inputs',{tables,revision:inputVersion,operation:'restore'});await refresh();setMessage('已恢复为新输入版本；历史方案保持原值。');}):undefined} onTask={(planId,taskId)=>{const plan=plans.find(p=>p.id===planId);if(plan){setActivePlan(plan);setIssues(plan.findings);setVerification(plan.verification||null);setSelected([taskId]);setView('schedule');}}}/>}
      {view==='data'&&<CsvBatchPanel key={membership.state.kind+':'+(session?.role||'')} revision={inputVersion} canWrite={!!session?.canWrite&&!!reason.trim()} busy={busy} api={api} refresh={refresh} onLocate={(table,row)=>{setQueryHistorical(false);setQueryInputTable(table);setQueryInputRow(data[table]?.[row]);setView('query');}}/>}
      {view==='data'&&<section className="panel data-panel"><div className="panel-head"><div><h2>主数据、单位与排程输入</h2><p>FR-002 新增产品/包装规格与物料主数据；同时维护 R1/R2.1 排程表。下方单表 CSV 先预览检查、确认后替换当前表；上方 CSV 批导先预览再原子提交；预计供给使用带时区 ISO 时间，其余排程时间字段使用分钟，0 = 2026-11-02 08:00 Asia/Shanghai。</p></div><div className="actions"><button onClick={downloadCsv} disabled={!session?.canExport||busy||!reason.trim()}>导出当前表</button></div></div>
        <ExchangeGuide current={currentDef}/>
        {tableKey==='factoryLines'&&<p>原01导入请使用上方“选择批量 CSV”先预览、检查，再确认导入。{!Object.prototype.hasOwnProperty.call(data,'factoryLines')?'当前旧数据尚未配置01映射，请显式录入工厂、产线和时区；不会自动填充。':'01映射已配置；保存和导入均检查当前引用。'}</p>}
        <ExecutionPanel data={data} operations={operations} historical={activePlan?.conditions as any}/>
        <SingleCsvPanel key={`${tableKey}:${inputVersion}:${session?.role||''}`} table={currentDef} rows={currentRows} revision={inputVersion} canWrite={!!session?.canWrite&&!!reason.trim()&&tableKey!=='factoryLines'} busy={busy} api={api} refresh={refresh}/>
        <div className="data-tabs">{defs.map(d=><button className={d.key===tableKey?'chosen':''} key={d.key} onClick={()=>{setTableKey(d.key);setSelected([]);}}>{d.label}<small>{data[d.key]?.length||0}</small></button>)}</div>
        {tableKey==='rules'&&<RulePanel data={data} history={operations}/>}
        {tableKey==='inventory'&&<section className="panel inventory-panel" data-inventory-view><div className="panel-head"><div><h2>库存账面与当前可用量</h2><p>模拟数据维护；余额 = 账面 − 累计模拟耗料；可用量再减已有占用，并检查质量、效期和预计可用时间。</p></div><label>查询时点（工厂 +08:00） <input type="datetime-local" value={inventoryAsOf} onChange={e=>setInventoryAsOf(e.target.value)}/></label></div><p>查询沿用 INVENTORY；分配沿用 MATERIAL 独立配置。方案内分配与缺口见方案物料清单，未写入库存占用。无 QA 在线审批或放行。</p><div className="table-wrap"><table><thead><tr>{['批次','物料','账面数量','累计模拟耗料','扣耗后余额','已占用','当前查询可用','分配前可用','位置','有效期','模拟质量状态','预计可用时间','查询守卫','分配守卫'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{inventoryQuery.map(batch=><tr key={String(batch['批次编号'])}>{['批次编号','物料编号','账面数量','累计模拟耗料','扣耗后余额','已占用数量','当前可用数量','分配前可用数量','位置','有效期','质量状态','预计可用时间','不可用原因','分配守卫'].map(f=><td key={f}>{batch[f]??'未检查'}</td>)}</tr>)}</tbody></table></div>{inventoryIssues.map((issue,i)=><div className="finding" key={i}>{issue.code}：{issue.message}</div>)}</section>}

        {['supplies','supplyDelays','supplyUses'].includes(tableKey)&&<section className="panel"><h2>预计供给 · 到达与可用分开</h2><p>全部为模拟预计量，永不计入库存账面或确认真实到货。日期时间须含时区，例如 2026-11-02T08:00:00+08:00。延期表保留原始到料，按记录时间应用全部模拟调整；CSV 只替换当前表，错误导入不会生效。</p><p>在“计划供给引用”指定订单、工序、供给及数量，计算时按调整后的预计可用时间等待；跨引用合计不能超过预计量。此引用不表示已满足该工序全部物料需求。</p><div className="table-wrap"><table><thead><tr><th>供给 / 批次</th><th>物料 / 预计量</th><th>原预计到达</th><th>原预计可用</th><th>调整后到达</th><th>调整后可用</th><th>延期记录</th><th>性质</th></tr></thead><tbody>{resolvedSupplies.map((r,i)=><tr key={i}><td>{r['供给编号']} / {r['批次编号']}</td><td>{r['物料编号']} / {r['预计数量']}</td><td>{r['预计到达时间']}</td><td>{r['预计可用时间']}</td><td>{r['生效到达时间']}</td><td>{r['生效可用时间']}</td><td>{r['延期记录'].map(d=>`${d['记录编号']}：${d['原因']}`).join('；')||'无'}</td><td>{r['供给性质']}</td></tr>)}</tbody></table></div>{supplyIssues.map((issue,i)=><div className="finding" key={i}><b>{issue.code}</b><span>{issue.message}</span></div>)}</section>}
        <div className="schema-note"><b>{currentDef.file}</b><span>字段：{currentDef.fields.join('、')}</span><span>可追溯：FR-013/014/015/016 · DT-09/11/13</span></div>
        {tableKey==='orders'&&<>
          <div className="hint-box"><b>FR-009 · 订单与需求</b><span>需求类型“正式订单”参与本次排程；“预测”独立保存且不混入正式排程。取消订单保留已有排程快照，之后不再生成新任务。MATERIAL 使用已声明的数量换算；CAPACITY/PROGRAM 同时启用时仅支持 kg、显式设备BOM总投入或合格产出节点和均分，遵守“是否允许拆分”。固定程序连续执行；其他中间装载节点和跨产品兼容须先决定配置。</span></div>
          {orderHistory.length>0&&<div className="table-wrap"><table><thead><tr><th>订单</th><th>变更字段</th><th>原值</th><th>新值</th><th>记录时间</th></tr></thead><tbody>{orderHistory.map((entry,i)=><tr key={`${entry.orderId}-${entry.changedAt}-${i}`}><td>{entry.orderId}</td><td>{entry.field}</td><td>{entry.before}</td><td>{entry.after}</td><td>{entry.changedAt}</td></tr>)}</tbody></table></div>}
        </>}
        {tableKey==='simulationEvents'&&<p>先保存事件时点全部在制任务的累计事实，再导入或编辑完整事件集合。事件保存会同批校验当前事实；观测分钟不等于事件分钟时拒绝。参数格式见交付样例；需处理事实JSON留空，由服务器计算。事件接纳后不可删除或改写，须从当前版本重算。</p>}
        {['executionFacts','executionMaterials'].includes(tableKey)&&<p>模拟执行累计表：0=2026-11-02 08:00 +08:00。导入采用当前完整累计集合；相同集合重导不累加。原始开始/完成不可覆盖或删除；纠错保留审计，倒退/超量/转机/退料需人工核对。账面数量必须是扣耗前且占用为独立占用。工序产出不自动成为合格入库；暂停不自动恢复。</p>}
        <DataEditor identityContext={{inputVersionId:currentInputId,operations}} initialRecord={editRecord} data={data} onLocate={table=>setTableKey(table)} def={currentDef} rows={currentRows} revision={inputVersion} canWrite={!!session?.canWrite} busy={busy} reason={reason} onSave={async(tables,revision,operation)=>{const result=await api('/inputs',{tables:tables.simulationEvents?{executionFacts:data.executionFacts||[],...tables}:tables,revision,operation});await refresh();return result;}}/>
        {tableKey==='dependencies'&&<div className="hint-box"><b>FR-007 · 人员任务需求</b><span>资源类型选“人员技能”，资源编号填人员组编号；需求数量为所需人数，所需技能须同技能匹配或使用已启用的显式有向替代，班次必须匹配。人员参与阶段用于标注装卸/操作，开始/结束偏移（分钟）定义人员相对工序开始/结束的参与窗口；窗口外是否释放按“窗口外释放”字段执行。</span></div>}
        {tableKey==='personnelGroups'&&<div className="hint-box"><b>FR-007 · 人员组容量与班次</b><span>每行配置组人数、以逗号分隔的技能、班次及分钟可用窗口（以工作台显示的 2026-11-02 08:00 为分钟 0）。同组相交的任务会扣减可用人数；不满足人数、技能、班次或可用窗口时任务不可排。P0 不记录考勤。</span></div>}
        <div className="hint-box"><b>数据质量检查 · FR-004</b><span>校验产品路线工序编号/名称、重复工序、前序引用与循环，逐工序固定分钟工时，以及资源依赖的订单、工序、类型和资源编号。路线按可配置前序关系排序，CSV 行顺序不定义工艺顺序。设备依赖进入当前排程；FR-007 人员技能依赖按人数、技能、班次、参与阶段和可用窗口核验；模具、工具及空间依赖须在表23明确声明并启用对应规则后才检查容量与完整释放区间；投料依赖仍只保存标识。</span></div>
        {[...validateBomConfig({products:data.products||[],materials:data.materials||[],routes:data.routes||[],bom:data.bom||[]}),...validateMasterData({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],dependencies:data.dependencies||[]}),...validateProcessConfig({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],machines:data.machines||[],personnelGroups:data.personnelGroups||[],tools:data.tools||[]})].length>0&&<div className="finding-list">{[...validateBomConfig({products:data.products||[],materials:data.materials||[],routes:data.routes||[],bom:data.bom||[]}),...validateMasterData({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],dependencies:data.dependencies||[]}),...validateProcessConfig({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],machines:data.machines||[],personnelGroups:data.personnelGroups||[],tools:data.tools||[]})].map((issue,i)=><div className="finding" key={`${issue.code}-${i}`}><b>{issue.code}</b><span>{issue.message}</span></div>)}</div>}
      </section>}
      {view==='decisions'&&<div className="decision-layout"><section className="panel"><h2>实现边界与追溯</h2><div className="trace-row"><b>R2.1 映射</b><span>FR-008：工厂日历继承、设备停机例外与连续工作窗口；UAT-02：08:15 边界；AC-05：按日历约束排程。本页面仅覆盖 UAT-02 阶段切片。</span></div><div className="trace-row"><b>R2.1 数据</b><span>02 工厂工作日历（calendarId、factoryId、startMinute、endMinute、isWork；否行从工作段扣除）；03 设备资源.日历编号关联工厂日历；04 设备停机与例外日历（machineId、startMinute、endMinute、reason）。</span></div><div className="trace-row"><b>R2.1 行为</b><span>资源默认继承设备所引用日历对应的工厂工作窗口；无设备日历编号时回退唯一配置日历。任务须完整置于一个连续工作窗口，并排除该设备停机；端点相邻合法。工厂无工作窗口时不排任务并给出原因。</span></div><div className="trace-row"><b>R1 基线</b><span>《APS需求分析与设计说明书 v0.3》：第2.2、5、6、7、8、10、12、14章；UAT-01 和 AC-01/02/04。</span></div><div className="trace-row"><b>时间接口</b><span>分钟基准：0=2026-11-02 08:00 Asia/Shanghai；时间段 [start,end)；任务主键 orderId-operationId；来源保留订单/路线/工时/设备依赖。完整字段与测试约定见 docs/APS-TEST-HANDOFF.md。</span></div></section>
        <section className="panel"><h2>显式待决项</h2>{[
          ['D-01','同机冲突语义','R1 假定设备为独占资源，并按 [开始,结束) 判断；BR-03 的“允许并行/可用台数”如何表达需产品决策。'],
          ['D-02','排程排序策略','当前按订单“优先顺序”升序、CSV 顺序稳定排序；同优先级是否按交期/订单号、允许用户指定需确认。'],
          ['D-03','交期状态','显示输入交期，但当前不把迟交作为排程阻断条件。是否提供“只排期内”或确认迟交部分另待 BR-15/BR-17。'],
          ['D-04','固定工时与速度','只按固定分钟执行；“速度支每分钟”涉及数量基准、转换和舍入，需产品确认后支持。'],
          ['D-05','缺少机器依赖','不擅自分配兼容设备；当前作为数据错误中止该任务，默认候选设备策略待决。'],
          ['D-06','数据保存与版本','输入数据、排程快照与操作记录由服务端保存；旧浏览器数据不会自动覆盖服务端数据，需按权限导入。'],
          ['D-07','单位换算与精度','产品净重、每袋支数及物料单位目前只保存配置；kg/支/袋/箱的换算方向与链、计算/展示精度、取整时点和误差范围待 APS-Design 按 BR-18 确认。当前不换算订单/工时/包材/BOM数量。'],
          ['D-08','BOM 生效与收率/损耗','FR-003 保存产品/版本/生效日期/投料工序/物料及配置用量。生效日的区间边界、历史版本追溯方式、订单适用版本选择、用量基准，以及总收率与逐工序收率/损耗的口径均待 APS-Design 确认；当前仅做结构校验，不选版本、不展开或计算需求。'],
        ].map(([id,title,body])=><article className="decision" key={id}><b>{id} · {title}</b><p>{body}</p></article>)}</section>
        <section className="panel"><h2>待决与未实现（不作隐式默认）</h2><ul className="not-in">{['跨班任务：是否允许跨日历窗口衔接，待业务确认；当前要求单个连续窗口容纳完整工序。','可中断工序：是否允许拆分、最小连续段和中断恢复规则待确认；当前不拆分任务。','人员按已配置组、技能、班次及参与偏移检查；支持显式单跳有向替代；自动人员优化未实现。','工装与空间仅执行明确启用的表23逐生产批声明；工装参数来源、整工序/明确窗口与归还均可配置；动态下游释放、最大等待与多线未实现。','工厂日历的有效日期/周循环、节假日优先级和跨日窗口表达尚待确认；当前时间为 v0.3 单日分钟轴。','全局优化、真实工艺/质量参数、主管确认和外部 ERP/MES/WMS 集成不在此切片。'] .map(x=><li key={x}>{x}</li>)}</ul></section></div>}
      <footer>APS-Dev 原型 · R2.1 阶段预览 · 未发布上线 · v0.3 UAT-02 虚构数据</footer>
    </main>
  </div>;
}
