import {UrgentConsumedMaterials,UrgentCompletedMaterials,UrgentDeliveryFacts} from './UrgentProgressLists';
import {completionPercent,defaultCompletionPercent,editTaskCompletion,progressProjection} from './lib/urgent-progress.mjs';
import {useEffect,useRef,useState} from 'react';
import {UrgentFactProblems} from './UrgentFactProblems';
import {dayTaskProblems} from './lib/urgent-day-task-problems.mjs';
import {explainFactFailure,type UrgentFactProblem} from './lib/urgent-fact-problems.mjs';
import {UrgentStatusEditSummary} from './UrgentStatusEditSummary';
import {UrgentConfirmedImports} from './UrgentConfirmedImports';
import {UrgentImportNotes,UrgentImportDemand} from './UrgentImportNotes';
import {UrgentImportRevisionSummary} from './UrgentImportRevisionSummary';
import {UrgentImportMapping,type UrgentMappingConfig} from './UrgentImportMapping';
import {UrgentResultOverview} from './UrgentResultOverview';
import {UrgentTaskEditor} from './UrgentTaskEditor';
import {editUrgentTaskFootprint} from './lib/urgent-task-editor.mjs';
import {UrgentFactsReview} from './UrgentFactsReview';
import {reviewUrgentFactDraft} from './lib/urgent-facts.mjs';
import {initialUrgentFacts,initialUrgentStrategy,selectUrgentPlan,urgentQueue,scheduleUrgentFlow} from './lib/urgent-flow.mjs';
import {UrgentBaselineNotice} from './UrgentBaselineNotice';
import {urgentRunEligibility,urgentFactTime,urgentFactMinute} from './lib/urgent-run-eligibility.mjs';
import {SolverChoice,type SolverSelection} from './SolverChoice';
import {WorkspaceRecords,type UrgentDraftGuard} from './UrgentWorkspaceControls';
import {WorkbookRunView} from './WorkbookRunView';
import {UrgentQueue} from './UrgentQueue';
import {UrgentFlowStep} from './UrgentFlowStep';
import {appPath} from './app-path';
import {workbookDate,workbookDay} from './lib/workbook-dates';
import './UrgentOrders.css';
type Api=(path:string,body?:object)=>Promise<any>;
type Props={active?:boolean;onGuard?:(g:UrgentDraftGuard)=>void;onParameters?:()=>void;onWorkflow?:()=>void;api:Api;datasetId:string;run:any;canWrite:boolean;canExport:boolean;onRun:(r:any)=>void;onRefresh:()=>Promise<void>;parameterRevision:number;version:number};
export function UrgentOrders({api,datasetId,run,canWrite,canExport,onRun,onRefresh,version,active=true,onGuard,onWorkflow}:Props){
 const [p,setP]=useState<any>(),[base,setBase]=useState<any>(()=>urgentRunEligibility(run).eligible?run:undefined),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [initial]=useState(()=>initialUrgentFacts(run)),[observation,setObservation]=useState(()=>urgentFactTime(run?.result?.timeUnit==='day'?run?.selection?.currentDay:run?.selection?.currentMinute??run?.selection?.currentDay*1440,run));
 const [facts,setFacts]=useState<Record<string,string>>(initial.statuses),[completed,setCompleted]=useState<Record<string,string>>(initial.completed),[footprints,setFootprints]=useState<Record<string,any>>(initial.footprints),[allocationFacts,setAllocationFacts]=useState<Record<number,any>>(initial.allocations);
 const [factPage,setFactPage]=useState(0),[factPageSize,setFactPageSize]=useState(100),[factFocus,setFactFocus]=useState<{section:'task'|'progress'|'start'|'observation'|'completed'|'allocation';key:string}|null>(null),[unlockReason,setUnlockReason]=useState(''),[serverFactProblems,setServerFactProblems]=useState<UrgentFactProblem[]>([]);
 const [factsDirty,setFactsDirty]=useState(false),[uploadDirty,setUploadDirty]=useState(false),[policyDirty,setPolicyDirty]=useState(false),[strategy,setStrategy]=useState<any>(),[preview,setPreview]=useState<any>(),[effective,setEffective]=useState(''),[importRecord,setImportRecord]=useState<any>(),[importMapping,setImportMapping]=useState<UrgentMappingConfig>({}),[impact,setImpact]=useState<any>();
 const [progressContext,setProgressContext]=useState<any>();
 const [stepOpen,setStepOpen]=useState([true,true,true,true,true]);
 function toggleStep(step:number){setStepOpen(current=>current.map((open,index)=>index===step-1?!open:open));}
 function showStep(step:number){setStepOpen(current=>current[step-1]?current:current.map((open,index)=>index===step-1?true:open));}
 const [solverSelection,setSolverSelection]=useState<SolverSelection>({solver:'basic'});
 const factsTable=useRef<HTMLDivElement>(null),completedDetails=useRef<HTMLDetailsElement>(null),allocationDetails=useRef<HTMLDetailsElement>(null),observationInput=useRef<HTMLInputElement>(null),file=useRef<HTMLInputElement>(null),strategySection=useRef<HTMLElement>(null),uploadSection=useRef<HTMLElement>(null),resultsSection=useRef<HTMLElement>(null),sequence=useRef(0),uploadSequence=useRef(0);
 const path='/workbooks/urgent',factDaily=base?.result?.timeUnit==='day',daily=(p?.timeUnit||base?.result?.timeUnit||run?.result?.timeUnit)==='day';
 const writable=canWrite&&!busy&&!loading,dirty=factsDirty||uploadDirty||policyDirty,isCalculating=!!run?.urgentPlanId&&['queued','running','cancelling'].includes(run.status);
 const factTime=(value:number)=>urgentFactTime(value,base),factMinute=(value:string)=>urgentFactMinute(value,base);
 const draft={statuses:facts,completed,allocations:allocationFacts,footprints},factReview=reviewUrgentFactDraft(base?.result,draft);
 const liveFactProblems:UrgentFactProblem[]=factDaily?(base?.result.tasks||[]).flatMap((task:any)=>{const value=footprints[task.id];return dayTaskProblems(task,{status:facts[task.id],startDay:value?.startMinute,endDay:value?.endMinute,quantity:value?.quantity,completionPercent:value?.completionPercent===''?null:value?.completionPercent,executedQuantity:value?.executedQuantity===''||value?.executedQuantity===undefined?undefined:Number(value.executedQuantity)},workbookDay(observation,base.result.dayZero)??NaN,{origin:base.result.dayZero,window:p?.selection||base.selection,previous:p?.facts.tasks.find((t:any)=>t.id===task.id)});}):[];
 const factProblems=[...liveFactProblems,...serverFactProblems.filter(problem=>!liveFactProblems.some(live=>live.code===problem.code&&live.key===problem.key&&live.reason===problem.reason))];
 function hydrate(r:any,plan:any){
  setBase(r);setP(plan);const d=initialUrgentFacts(r,plan);setFacts(d.statuses);setCompleted(d.completed);setFootprints(d.footprints);setAllocationFacts(d.allocations);
  const point=r.result.timeUnit==='day'?(plan?.facts.observationDay??r.selection?.currentDay):(plan?.facts.observationMinute??r.selection?.currentMinute??r.selection?.currentDay*1440);
  setObservation(urgentFactTime(point,r));setEffective(urgentFactTime(point,r));setStrategy(plan?initialUrgentStrategy(plan):undefined);setFactsDirty(false);setPolicyDirty(false);setUploadDirty(false);setUnlockReason('');setServerFactProblems([]);setPreview(undefined);setFactPage(0);if(file.current)file.current.value='';
 }
 useEffect(()=>{
  if(!active)return;let live=true;const seq=++sequence.current;setLoading(true);setError('');setImpact(undefined);setImportRecord(undefined);uploadSequence.current++;
  (async()=>{const list=await api(path+'/plans?datasetId='+encodeURIComponent(datasetId));const plan=selectUrgentPlan(list,run);const r=plan?(plan.headRunId===run?.id?run:await api('/workbooks/runs/'+plan.headRunId)):run;if(!live||seq!==sequence.current)return;if(urgentRunEligibility(r).eligible)hydrate(r,plan);else{setP(undefined);setBase(undefined);setFactsDirty(false);setUploadDirty(false);setPolicyDirty(false);}})().catch(e=>{if(live){setBase(undefined);setP(undefined);setError(e.message);}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[datasetId,run?.id,active]);
 useEffect(()=>{if(!active||!run?.result?.urgentOrder)return;let live=true;api(path+'/runs/'+run.id+'/impact').then(x=>{if(live)setImpact(x);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[active,run?.id,run?.status,run?.resultHash,p?.targetToken]);
 useEffect(()=>{if(active&&run?.result?.urgentOrder){showStep(5);resultsSection.current?.scrollIntoView({block:'start',behavior:'smooth'});}},[active,run?.id,run?.resultHash]);
 useEffect(()=>{if(factsDirty){setError('');setServerFactProblems([]);}},[facts,completed,allocationFacts,footprints,unlockReason,observation]);
 useEffect(()=>{setProgressContext(undefined);if(!active||!base||!factDaily)return;let live=true;api(path+'/progress-context?runId='+encodeURIComponent(base.id)).then(context=>{if(context.runId!==base.id||context.resultHash!==base.resultHash)throw Error('完成比例的物料来源与当前计划不一致');if(live)setProgressContext(context);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[active,base?.id,base?.resultHash]);
 const progressReady=!factDaily||progressContext?.runId===base?.id&&progressContext?.resultHash===base?.resultHash;
 const progress=progressProjection(base,draft,{...progressContext,savedAllocations:p?.facts.allocations||[]},base?factMinute(observation):NaN);
 useEffect(()=>{if(!factDaily||!progressContext||progressContext.runId!==base.id||progressContext.resultHash!==base.resultHash)return;const next=progressProjection(base,{statuses:facts,completed,allocations:allocationFacts,footprints},{...progressContext,savedAllocations:p?.facts.allocations||[]},factMinute(observation)).allocations;
  if(JSON.stringify(next)!==JSON.stringify(allocationFacts)){setAllocationFacts(next);setFactsDirty(true);}
 },[progressContext,facts,footprints,observation,p?.targetToken]);

 function changeFactStatuses(next:Record<string,string>){
  if(factDaily)setFootprints(current=>{const updated={...current};for(const task of base.result.tasks)if(next[task.id]!==facts[task.id])updated[task.id]=editTaskCompletion(task,next[task.id],current[task.id]||{},defaultCompletionPercent(next[task.id]));return updated;});
  setFacts(next);setFactsDirty(true);setError('');
 }
 function footprint(id:string,key:string,value:any){setFootprints(current=>{const task=base.result.tasks.find((t:any)=>t.id===id),old=current[id]||{},edited=editUrgentTaskFootprint(task,old,key,value,factDaily);return {...current,[id]:factDaily&&['completionPercent','quantity'].includes(key)?editTaskCompletion(task,facts[id],edited,key==='completionPercent'?value:completionPercent(task,facts[id],old)):edited};});}
  function locateFactProblem(problem:UrgentFactProblem){
  let section=problem.section as 'task'|'progress'|'start'|'observation'|'completed'|'allocation',key=problem.key||problem.taskId||problem.demandId||'';
  if(!section)return;
  showStep(1);
  if(['task','progress','start'].includes(section)){const index=base.result.tasks.findIndex((t:any)=>t.id===key);if(index<0)return;setFactPage(Math.floor(index/factPageSize));}
  if(section==='completed'&&!key)key=base.result.demandResults[0]?.id||'';
  if(section==='allocation'&&!key)key='0';
  setFactFocus({section,key});
 }

 function locateMissingFact(){
  showStep(1);
  if(factReview.pendingTasks.length){const id=factReview.pendingTasks[0].id,index=base.result.tasks.findIndex((t:any)=>t.id===id);setFactPage(Math.floor(index/factPageSize));setFactFocus({section:'task',key:id});}
  else if(factReview.pendingProgress.length){const id=factReview.pendingProgress[0].id,index=base.result.tasks.findIndex((t:any)=>t.id===id);setFactPage(Math.floor(index/factPageSize));setFactFocus({section:'progress',key:id});}
  else if(factReview.pendingCompleted.length)setFactFocus({section:'completed',key:factReview.pendingCompleted[0].id});
  else if(factReview.pendingAllocations.length)setFactFocus({section:'allocation',key:String(factReview.pendingAllocations[0].index)});
  else if(factProblems.length)locateFactProblem(factProblems[0]);
 }
 useEffect(()=>{if(!factFocus)return;const frame=requestAnimationFrame(()=>{const section=factFocus.section;if(section==='observation'){observationInput.current?.focus();observationInput.current?.scrollIntoView({block:'center'});setFactFocus(null);return;}const container=section==='task'||section==='progress'||section==='start'?factsTable.current:section==='completed'?completedDetails.current:allocationDetails.current;if(container instanceof HTMLDetailsElement)container.open=true;const attr='data-fact-'+section,element=Array.from(container?.querySelectorAll<HTMLElement>('['+attr+']')||[]).find(el=>el.getAttribute(attr)===factFocus.key);const details=element?.closest('details');if(details)details.open=true;element?.focus();element?.scrollIntoView({block:'center'});setFactFocus(null);});return()=>cancelAnimationFrame(frame);},[factFocus,factPage]);

  async function act(fn:()=>Promise<void>,factAction=false){setBusy(true);setError('');setMessage('');try{await fn();}catch(e:any){if(e.plan){setP(e.plan);setPolicyDirty(false);}if(factAction){setServerFactProblems(e.detail?.factProblems?.length?e.detail.factProblems:[explainFactFailure(e.detail?.error||'URGENT_FACT_INVALID',e.message)]);}else setError(e.message);}finally{setBusy(false);}}
 async function saveFacts(){
  const check=urgentRunEligibility(base);if(!check.eligible)throw Error(check.message);
  if(factDaily&&!progressReady)throw Error('正在读取当前计划的物料关联，请读取完成后确认任务。');
  if(liveFactProblems.length){locateFactProblem(liveFactProblems[0]);throw Object.assign(Error(liveFactProblems[0].message),{detail:{factProblems:liveFactProblems}});}
  if(factReview.blocked){locateMissingFact();throw Error(factReview.message);}
  const currentAllocations=factDaily?progressProjection(base,draft,{...progressContext,savedAllocations:p?.facts.allocations||[]},factMinute(observation)).allocations:allocationFacts;
  const ledger={unlockReason,statusChangeReason:unlockReason,...(factDaily?{observationDate:observation}:{observationTime:observation+':00+08:00'}),tasks:base.result.tasks.map((t:any)=>({id:t.id,status:facts[t.id]||'unknown',...(factDaily?{startDay:footprints[t.id]?.startMinute,endDay:footprints[t.id]?.endMinute,quantity:footprints[t.id]?.quantity,completionPercent:footprints[t.id]?.completionPercent===''?null:footprints[t.id]?.completionPercent,executedQuantity:footprints[t.id]?.executedQuantity===''?null:Number(footprints[t.id]?.executedQuantity)}:footprints[t.id])})),allocations:base.result.allocations.map((_a:any,index:number)=>({...(factDaily?{kind:currentAllocations[index]?.kind,feedDay:currentAllocations[index]?.feedMinute}:currentAllocations[index]),index,sourceResultHash:base.resultHash,quantity:currentAllocations[index]?.quantity===''||currentAllocations[index]?.quantity===undefined?null:Number(currentAllocations[index].quantity)})),completed:Object.fromEntries(base.result.demandResults.map((r:any)=>[r.id,completed[r.id]?.trim()===''||completed[r.id]===undefined?null:Number(completed[r.id])]))};
  const saved=p?await api(path+'/plans/'+p.id+'/facts',{targetToken:p.targetToken,facts:ledger}):await api(path+'/plans',{runId:base.id,expectedResultHash:base.resultHash,facts:ledger});
  setP(saved);setAllocationFacts(currentAllocations);setFactsDirty(false);setServerFactProblems([]);if(!policyDirty)setStrategy(initialUrgentStrategy(saved));if(!uploadDirty)setEffective(observation);setMessage('当前任务已确认，可继续导入插单。');return saved;
 }
 async function upload(){const seq=++uploadSequence.current,f=file.current?.files?.[0];if(!p||factsDirty)throw Error('请先确认当前任务，再导入插单。');if(!f)throw Error('请选择xlsx文件');if(f.size>12*1024*1024)throw Error('请选择12MB以内文件');const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(f);});const result=await api(path+'/plans/'+p.id+'/preview',{targetToken:p.targetToken,fileName:f.name,fileBase64:data,mapping:importMapping,effectiveTime:daily?effective:effective+':00+08:00'});if(seq===uploadSequence.current)setPreview(result);}
 async function commitImport(){
  const r=await api(path+'/plans/'+p.id+'/commit',{previewId:preview.id,fileHash:preview.fileHash,targetToken:p.targetToken});setP(r.plan);setPreview(undefined);setUploadDirty(false);setImportRecord(undefined);setImportMapping({});if(file.current)file.current.value='';setImpact(undefined);const change=r.changes;setMessage(change?'插单清单已更新：新增 '+change.added+' 笔、更新 '+change.updated+' 笔、未变化 '+change.unchanged+' 笔。'+(change.added||change.updated?'待排任务已同步，请重新执行插单排程以更新结果和影响。':'当前插单数据没有变化。'):'已导入 '+r.batch.demands.length+' 笔插单，已显示在下方任务清单前面。');
 }
 function discardImport(){uploadSequence.current++;setPreview(undefined);setUploadDirty(false);setImportMapping({});setImportRecord(undefined);if(file.current)file.current.value='';}
 async function savePageDraft(){
  if(uploadDirty)throw Error('请先确认导入或放弃本次导入，再切换页面。');
  const current=factsDirty?await saveFacts():p;
  if(policyDirty){if(!current)throw Error('请先确认当前任务。');const saved=await api(path+'/plans/'+current.id+'/workspace',{targetToken:current.targetToken,workspace:strategy});setP(saved.plan);setStrategy(initialUrgentStrategy(saved.plan));setPolicyDirty(false);}
 }
 function discardPageDraft(){if(base)hydrate(base,p);discardImport();}
 useEffect(()=>onGuard?.({dirty,save:savePageDraft,discard:discardPageDraft}),[dirty,facts,completed,footprints,allocationFacts,observation,unlockReason,strategy,preview,p?.targetToken]);
 const scheduleProblems=[...(!p?['请先确认当前生产计划任务。']:[]),...(factsDirty?['任务状态或数量已修改，请重新确认当前任务。']:[]),...(uploadDirty?['请先确认导入或放弃本次导入。']:[]),...(p&&!p.batches.some((b:any)=>b.status!=='withdrawn')?['请导入插单并确认导入。']:[])];
 async function schedule(){
  if(scheduleProblems.length)throw Error(scheduleProblems.join('；'));
  const next=await scheduleUrgentFlow(api,p,strategy,solverSelection);setP(next.plan);setStrategy(initialUrgentStrategy(next.plan));setPolicyDirty(false);setImpact(undefined);onRun(next.run);await onRefresh();setMessage('已启动插单排程，完成后默认显示需求交付结果。');
 }
 function updateStrategy(patch:object){setStrategy({...strategy,...patch});setPolicyDirty(true);}
 const queue=urgentQueue(base?.result,p,draft),protectedCount=Object.values(facts).filter(s=>s==='completed'||s==='locked').length;
 const resultIsCurrent=run?.urgentPlanId&&p?.id===run.urgentPlanId;
 const previewActions=new Map<string,string>((preview?.changes?.records||[]).map((change:any)=>[change.id,change.action]));
 const importChanged=resultIsCurrent&&(p.importHistory||[]).some((entry:any)=>entry.revision>run.urgentRevision);

  return <section className="panel urgent-orders urgent-flow" aria-label="事件与插单">
  <header><h2>事件与插单</h2><p>基线生产计划：{base?'v'+base.version+' · '+base.id:'请在抬头“选择运行”中选定生产计划'}{p?' · 已确认任务，事实修订 '+p.factsRevision:''} · 当前业务 v{version}</p></header>
  {!canWrite&&<p role="status">当前为只读模式，可查看任务和结果。</p>}{loading&&<p role="status">正在读取所选基线和任务…</p>}{busy&&<p role="status">正在处理…</p>}{message&&<p role="status">{message}</p>}{error&&<p className="urgent-error" role="alert">{error}</p>}
  {!base&&!loading&&<UrgentBaselineNotice run={run} onWorkflow={onWorkflow}/>}
  <UrgentFlowStep number={1} title="确认当前生产计划任务" open={stepOpen[0]} onToggle={()=>toggleStep(1)}><p>新任务默认未开工；完成比例默认：已完成 100%、已开工 50%、其他 0%，均可修改。按比例计算工序完成量和相关耗料，确认后用于排程；已保存事实按原值保留。</p>
  {base&&<fieldset disabled={!writable||isCalculating} onChange={e=>{if((e.target as HTMLElement).getAttribute('aria-label')!=='任务每页条数'&&(e.target as HTMLElement).getAttribute('aria-label')!=='批量设置任务状态')setFactsDirty(true);}}><div className="urgent-toolbar"><label>{factDaily?'模拟观察日期':'模拟观察时刻'}<input ref={observationInput} type={factDaily?'date':'datetime-local'} step={factDaily?undefined:60} value={observation} onChange={e=>setObservation(e.target.value)}/></label><span>{p&&!factsDirty?'当前任务已确认':'请核对以下任务并确认'}</span></div>
  <p className="urgent-step-hint">未开工可调并提醒；已开工尽量少调，必要时调整并警告；已完成、已锁定保持原安排。按天观察以当日零点为准；修改开始或截止日期会同步平移另一端，保留原占用时长。</p>
  <UrgentTaskEditor key={base.id} resetToken={p?.targetToken} run={base} values={facts} footprints={footprints} page={factPage} pageSize={factPageSize} disabled={!writable||isCalculating} tableRef={factsTable} onStatuses={changeFactStatuses} onFootprint={footprint} onPage={setFactPage} onPageSize={setFactPageSize}/>
    {factDaily?<><UrgentConsumedMaterials rows={progress.consumed} run={base} detailsRef={allocationDetails} ready={progressReady}/><UrgentCompletedMaterials rows={progress.completed} tasks={progress.tasks} detailsRef={completedDetails} ready={progressReady}><div className="urgent-completed">{base.result.demandResults.map((r:any)=><label key={r.id}>{r.id} / {r.quantity} kg<input data-fact-completed={r.id} aria-label={'已完成量 '+r.id} type="number" min={0} max={r.quantity} step="any" value={completed[r.id]??''} onChange={e=>setCompleted({...completed,[r.id]:e.target.value})}/></label>)}</div><UrgentDeliveryFacts run={base} values={allocationFacts} disabled={!writable||isCalculating} onChange={(index,value)=>setAllocationFacts(current=>({...current,[index]:value}))}/></UrgentCompletedMaterials></>:<><details ref={allocationDetails}><summary>实际已耗及锁定供给（逐条确认，未发生填0）</summary><div className="urgent-scroll"><table><thead><tr><th>需求 / 物料 / 批次</th><th>计划分配量</th><th>事实类型</th><th>实际量</th><th>投耗/锁定时刻</th></tr></thead><tbody>{base.result.allocations.map((a:any,index:number)=><tr key={index}><td>{a.need} / {a.materialId}<br/>{a.supplyId}</td><td>{a.quantity} {a.unit||'物料基础单位'}</td><td><select aria-label={'供给事实类型 '+index} value={allocationFacts[index]?.kind||'none'} onChange={e=>setAllocationFacts({...allocationFacts,[index]:{...allocationFacts[index],kind:e.target.value}})}>{[['none','未发生/未锁定'],['consumed','实际已耗/已交付'],['locked','已锁定不可挪用']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></td><td><input data-fact-allocation={String(index)} aria-label={'供给事实量 '+index} type="number" min={0} max={a.quantity} step="any" value={allocationFacts[index]?.quantity??''} onChange={e=>setAllocationFacts({...allocationFacts,[index]:{...allocationFacts[index],quantity:e.target.value}})}/></td><td><input type={factDaily?'date':'datetime-local'} step={factDaily?undefined:60} aria-label={'供给事实时刻 '+index} value={factTime(allocationFacts[index]?.feedMinute??(factDaily?a.feedDay:a.feedMinute))} onChange={e=>setAllocationFacts({...allocationFacts,[index]:{...allocationFacts[index],feedMinute:factDaily?factMinute(e.target.value)+((allocationFacts[index]?.feedMinute??a.feedDay)-Math.floor(allocationFacts[index]?.feedMinute??a.feedDay)):factMinute(e.target.value)}})}/></td></tr>)}</tbody></table></div></details><details ref={completedDetails}><summary>逐需求已完成合格交付量（千克）</summary><div className="urgent-completed">{base.result.demandResults.map((r:any)=><label key={r.id}>{r.id} / {r.quantity} kg<input data-fact-completed={r.id} aria-label={'已完成量 '+r.id} type="number" min={0} max={r.quantity} step="any" value={completed[r.id]??''} onChange={e=>setCompleted({...completed,[r.id]:e.target.value})}/></label>)}</div></details></>}<UrgentFactsReview review={factReview} problemCount={factProblems.length} onLocate={locateMissingFact}/><UrgentFactProblems problems={factProblems} onLocate={locateFactProblem}/>{factDaily&&p&&<UrgentStatusEditSummary savedTasks={p.facts.tasks} statuses={facts} footprints={footprints} note={unlockReason} onNote={setUnlockReason}/>}<button className="primary" disabled={!writable||factReview.blocked||liveFactProblems.length>0||factDaily&&!progressReady} onClick={()=>act(async()=>{await saveFacts();},true)}>确认当前任务</button>
  </fieldset>}
  </UrgentFlowStep>
  <UrgentFlowStep ref={uploadSection} number={2} title="导入插单" className="urgent-upload-inline" open={stepOpen[1]} onToggle={()=>toggleStep(2)}><p>可修改 Excel 后反复导入：同编号更新尚未采用的插单，新编号追加；确认后同步插单清单和待排任务。</p>{(!p||factsDirty)&&<p role="status">请先在上方确认当前任务。</p>}<fieldset disabled={!writable||!p||factsDirty||isCalculating}>
  <div className="urgent-toolbar urgent-upload-inputs"><label>{daily?'插单生效日期':'插单生效时刻'}<input type={daily?'date':'datetime-local'} step={daily?undefined:60} value={effective} onChange={e=>{uploadSequence.current++;setEffective(e.target.value);setPreview(undefined);setUploadDirty(true);}}/></label><label>需求Excel（按字段抬头映射）<input ref={file} type="file" accept=".xlsx" disabled={!writable} onChange={()=>{uploadSequence.current++;setImportMapping({});setPreview(undefined);setUploadDirty(true);}}/></label>{canExport&&<a href={appPath('/api'+path+'/template')}>下载空白需求模板</a>}<button disabled={!writable} onClick={()=>act(upload)}>校验预览</button>{uploadDirty&&<button onClick={discardImport}>放弃本次导入</button>}</div>
    {preview&&<><UrgentImportMapping mapping={preview.importMapping} value={importMapping} disabled={!writable||!!preview.draftId} dirty={preview.mappingDirty} onChange={value=>{uploadSequence.current++;setImportMapping(value);setPreview({...preview,valid:false,mappingDirty:true});setUploadDirty(true);}}/><p>{preview.demands.length} 笔 · {preview.mappingDirty?'映射已修改，等待重新校验':preview.valid?'校验通过，待确认导入':'校验阻断，整批未生效'}</p>{!preview.mappingDirty&&preview.issues.map((i:any,n:number)=><p className="urgent-error" key={n}>{i.sheet} 第{i.row}行 {i.field}：{i.message}</p>)}{preview.outside.length>0&&<p className="urgent-error">窗外需求：{preview.outside.map((r:any)=>r.id).join('、')}。生效可保留，调整窗口/计划前不可计算。</p>}{!preview.mappingDirty&&<UrgentImportRevisionSummary key={preview.id} changes={preview.changes}/>}{!preview.mappingDirty&&<WorkspaceRecords id={'urgent-preview:'+p?.id} showFilters={false} onOpen={r=>setImportRecord(r)} rows={preview.demands.map((r:any)=>({...r,id:String(r._row),导入处理:({add:'新增插单',update:'更新原插单',unchanged:'保持不变',blocked:'不可覆盖'} as Record<string,string>)[previewActions.get(r['需求编号'])||'add']||'新增插单',需求日期:workbookDate(Number(r['需求日'])),要求发运日期:workbookDate(r['按要求日最晚发运日'])||'—'}))} labels={{id:'源行',导入处理:'本次处理',需求编号:'需求',客户编号:'客户',成品编号:'产品',需求日期:'需求日',需求箱数:'箱数',每箱净重千克:'权威箱重千克',需求千克:'千克',要求发运日期:'要求发运日'}} canExport={canExport} identity={{previewId:preview.id,fileHash:preview.fileHash,targetToken:preview.targetToken,state:'预览，未生效'}}/>}{!preview.mappingDirty&&<UrgentImportNotes preview={preview}/>}<button className="primary" disabled={!writable||!preview.valid||preview.mappingDirty||preview.targetToken!==p?.targetToken} onClick={()=>act(commitImport)}>确认导入</button></>}
  </fieldset><UrgentConfirmedImports key={p?.id||'empty'} plan={p} headResult={base?.result} onOpen={setImportRecord}/>{importRecord&&<UrgentImportDemand record={importRecord} onClose={()=>setImportRecord(undefined)}/>}</UrgentFlowStep>
  <UrgentFlowStep number={3} title="本次任务清单" label="本次插单与再排任务" open={stepOpen[2]} onToggle={()=>toggleStep(3)}>{factsDirty&&<p role="status">以下显示当前编辑值，确认任务后用于排程。</p>}<UrgentQueue rows={queue} base={base} protectedCount={protectedCount}/></UrgentFlowStep>
  <UrgentFlowStep ref={strategySection} number={4} title="选择策略并执行插单排程" open={stepOpen[3]} onToggle={()=>toggleStep(4)}><p>沿用基线的设备、人员、工装、库存及产能约束。点击“插单排程”时保存并校验当前策略。</p>
  <fieldset disabled={!writable||!p||isCalculating}><div className="urgent-toolbar">
  <label>插单策略<select aria-label="插单策略" value={strategy?.strategy||'delay'} onChange={e=>updateStrategy({strategy:e.target.value})}><option value="delay">允许顺延：插单优先，重排剩余工作</option><option value="gap">空隙插入：保留原任务，使用空余产能</option>{!daily&&strategy?.overtime?.length>0&&<option value="overtime">采用已登记加班资源</option>}</select></label>
  <label>冻结截止{daily?'日（当天可调整）':'时刻'}<input aria-label="冻结截止" type={daily?'date':'datetime-local'} value={urgentFactTime(daily?strategy?.freezeDay:strategy?.freezeMinute,base)} onChange={e=>{const point=factMinute(e.target.value);updateStrategy(daily?{freezeDay:point,semiFreezeDay:point}:{freezeMinute:point});}}/></label>
  {!daily&&<label>半冻结截止<input type="datetime-local" value={urgentFactTime(strategy?.semiFreezeMinute,base)} onChange={e=>updateStrategy({semiFreezeMinute:factMinute(e.target.value)})}/></label>}
  <label>重排范围<select value={strategy?.scope||'full'} onChange={e=>updateStrategy({scope:e.target.value})}><option value="full">全部剩余工作</option><option value="local">实际依赖范围</option></select></label>
  {daily&&<label>客户服务优先级<select value={strategy?.priorityDirection||'数值小优先'} onChange={e=>updateStrategy({priorityDirection:e.target.value})}><option>数值小优先</option><option>数值大优先</option></select></label>}
  <button className="primary" disabled={scheduleProblems.length>0} onClick={()=>act(schedule)}>插单排程</button>
  </div>{!daily&&<SolverChoice value={solverSelection} onChange={v=>{setSolverSelection(v);setPolicyDirty(true);}} disabled={!writable}/>}</fieldset>
  {canWrite&&scheduleProblems.length>0&&<p className="urgent-step-hint" role="status">{scheduleProblems.join(' ')}</p>}
  {resultIsCurrent&&isCalculating&&<p role="status">正在生成排程结果… <button disabled={!writable||run.status==='cancelling'} onClick={()=>act(async()=>{await api(path+'/runs/'+run.id+'/cancel',{});onRun(await api('/workbooks/runs/'+run.id));})}>取消本次计算</button></p>}
  </UrgentFlowStep>
  <UrgentFlowStep ref={resultsSection} number={5} title="插单排程结果" className="urgent-flow-results" open={stepOpen[4]} onToggle={()=>toggleStep(5)}>{resultIsCurrent?<>{(importChanged||impact?.staleness?.stale)&&<p role="alert">插单清单或排程条件已更新；下方是更新前的冻结结果。请重新执行插单排程，更新指标、交付日期和对原任务的影响。</p>}<UrgentResultOverview run={run} impact={impact}/><WorkbookRunView key={run.id} initialView="E2" run={run} api={api} canExport={canExport} canWrite={writable&&!factsDirty&&!uploadDirty&&!policyDirty} onRun={onRun}/></>:<p className="urgent-step-hint">完成前 4 步并执行插单排程后，这里显示结果，默认打开“需求交付”。</p>}</UrgentFlowStep>
 </section>;

}
