import {dailyRunContext,dayIndex} from './daily-workbook.mjs';
import {createSolverRunService} from './solver-choice/run-service.mjs';
import {workflowTasks} from './workflow-tasks.mjs';
import {solverRequest} from './solver-choice/contract.mjs';
import {minuteMode,MINUTE_ENGINE,MINUTE_ORIGIN,minuteTime} from './workbook-minute.mjs';
import {checkSelection,sourceIdentity,cloneForParameters,computationInput} from './workbook-workbench.mjs';
import {scopeFor,effectiveParameters,scopeOf} from './parameter-contract.mjs';
import {supplyReadiness} from './workbook-supply.mjs';
import {changeDraft,validateDraftRequest} from './workbook-drafts.mjs';
import {randomUUID} from 'node:crypto';
import {hash,rows,workbookSchema,refreshDerived,dayDate,dayMinute} from './workbook-model.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
export function registerWorkbookRuns(router,ctx) {
 const {read,readMetadata=read,write,dataset,audit,handle,permission,workerFactory,workers,saveVersion}=ctx;
 const solvers=createSolverRunService(ctx);solvers.register(router);
 const inputOf=r=>ctx.snapshot(r.inputRef);
 const publicRun=r=>{const {inputRef,...result}=r;return result;};
 const effectiveInput=r=>refreshDerived(cloneForParameters(inputOf(r)),r.selection.startDay);
 const resultProblem=r=>{
  const d=inputOf(r),p=r.result;
  if(hash(d)!==r.inputHash)return 'frozen_input_corrupt';
  if(r.solverConditions&&r.solver?.requested!==r.solverConditions.request.requested)return 'solver_request_mismatch';
  if(!p)return null;
  if(r.solverConditions&&(p.solver?.actual!==r.solverConditions.request.requested||hash(p.solver)!==hash(r.solver)||p.solver.conditionsHash!==r.solverConditions.conditionsHash))return 'solver_result_mismatch';
  if(r.resultHash&&hash(p)!==r.resultHash)return 'frozen_result_corrupt';
  if(!['completed','partial'].includes(r.status)||p.status!==r.status||p.source?.datasetId!==d.id||p.source?.version!==d.version||p.source?.fileHash!==d.fileHash||p.source?.mappingHash!==hash(d.mapping)||p.source?.parameterHash!==hash(rows(d,'配置参数'))||hash(p.conditions)!==hash({...r.selection,interval:'[start,end)'}))return 'frozen_result_source_mismatch';
  return null;
 };
 router.get('/runs',permission('read'),(req,res)=>{const compact=req.query.summary==='1',runs=(compact?readMetadata():read()).runs.filter(r=>!req.query.datasetId||r.datasetId===req.query.datasetId);res.json(compact?runs:runs.map(publicRun));});
 router.get('/runs/:id',permission('read'),handle((req,res)=>{const r=read().runs.find(r=>r.id===req.params.id);if(!r)return res.status(404).json({error:'run_not_found'});const error=resultProblem(r);if(error)return res.status(409).json({error});res.json(publicRun(r));}));
 router.get('/runs/:id/inputs',permission('read'),(req,res)=>{const r=read().runs.find(r=>r.id===req.params.id);if(!r)return res.status(404).json({error:'run_not_found'});const input=inputOf(r);if(hash(input)!==r.inputHash)return res.status(409).json({error:'frozen_input_corrupt'});res.json({runId:r.id,input,inputHash:r.inputHash,selection:r.selection});});
 router.get('/datasets/:id/scheduling-tasks',permission('read'),handle((req,res)=>{
  const d=dataset(readMetadata(),req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});
  try{res.json(workflowTasks(d,req.query,ctx.actorKey(req)));}catch(e){if(e.status===409)return res.status(409).json({error:'INPUT_CHANGED',message:e.message});throw e;}
 }));
 router.post('/datasets/:id/readiness',permission('read'),handle((req,res)=>{
  const d=dataset(read(),req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});
  if(req.body.expectedParameterRevision!==undefined&&req.body.expectedParameterRevision!==(d.parameterRevision||0))return res.status(409).json({error:'PARAMETERS_CHANGED',message:'配置已变化，请刷新并重新确认任务清单'});
  if(req.body.version!==d.version)return res.status(409).json({error:'INPUT_CHANGED',actualVersion:d.version});
  res.json(solvers.readiness(d,req.body,ctx.actorKey(req)));
 }));
 router.get('/runs/:id/rows',permission('read'),handle((req,res)=>{
  const r=read().runs.find(r=>r.id===req.params.id);if(!r)return res.status(404).json({error:'run_not_found'});
  const error=resultProblem(r);if(error)return res.status(409).json({error});
  const d=inputOf(r),table=String(req.query.table);if(!workbookSchema.tables[table])throw Error('未知业务表');
  const q=String(req.query.q||''),offset=Math.max(0,Number(req.query.offset)||0),values=rows(d,table).filter(x=>!q||JSON.stringify(x).includes(q));
  res.json({model:'workbook',runId:r.id,datasetId:r.datasetId,version:r.version,inputHash:r.inputHash,resultHash:r.resultHash,table,total:values.length,offset,rows:values.slice(offset,offset+25),frozen:true});
 }));
 router.post('/datasets/:id/run',permission('calculate'),handle((req,res)=>{
  if(!Number.isSafeInteger(req.body.version)||req.body.version<1)return res.status(400).json({error:'explicit_version_required'});
  solverRequest(req.body);
  const s=read();let d=dataset(s,req.params.id,req.body.version);if(!d)return res.status(404).json({error:'dataset_not_found'});
  if(req.body.expectedParameterRevision!==undefined&&req.body.expectedParameterRevision!==(d.parameterRevision||0))return res.status(409).json({error:'PARAMETERS_CHANGED',message:'配置已变化，请重新确认本次任务清单'});
  if(req.body.currentVersion===true||req.body.readinessToken){
   const latest=ctx.meta(s,req.params.id);if(latest?.version!==req.body.version)return res.status(409).json({error:'INPUT_CHANGED',actualVersion:latest?.version});
   const check=solvers.readiness(d,req.body,ctx.actorKey(req));if(!req.body.readinessToken||check.token!==req.body.readinessToken)return res.status(409).json({error:'READINESS_CHANGED'});
   if(!check.ready)return res.status(422).json({error:'not_ready',issues:check.issues});
  }
  if(workers.size>=2)return res.status(429).json({error:'run_capacity'});
  const dailyContext=dailyRunContext(s,d);
  const selection=req.body.selection??{};if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(k=>!['startDay','endDay','currentDay','currentMinute','demandIds'].includes(k)))throw Error('运行选择包含未知字段');
  const scope=scopeFor(d,req.body.parameterScope,ctx.actorKey(req));const globals=d.parameterContract?effectiveParameters(d,selection.startDay??0,scope):[];const global=n=>globals.find(p=>p['对象编号']==='GLOBAL'&&p['参数名称']===n)?.['参数值'];
  const start=selection.startDay??Number(global('计划起始日')??1),end=selection.endDay??start+Number(global('窗口天数')??14),current=selection.currentDay??start;
  if(![start,end,current].every(Number.isInteger)||start<current||current<0||end<=start||end>44)throw Error('日窗口无效');
  if(d.parameterContract){d=cloneForParameters(d);d.tables['配置参数']=rows(d,'配置参数').filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope);d.parameterContext={scope,effectiveDay:start};delete d.parameterCandidates;delete d.parameterTrials;refreshDerived(d,start);}
  const ready=supplyReadiness(computationInput(d),{...selection,startDay:start,endDay:end,currentDay:current});if(!ready.ready)return res.status(422).json({error:'not_ready',issues:ready.issues});
  const inWindow=rows(d,'每日需求').filter(r=>(d.dailyContext||Number(r['需求日'])>=start)&&Number(r['需求日'])<end);
  if(Object.hasOwn(selection,'demandIds')&&(!Array.isArray(selection.demandIds)||!selection.demandIds.length||new Set(selection.demandIds).size!==selection.demandIds.length||selection.demandIds.some(id=>typeof id!=='string'||!inWindow.some(r=>r['需求编号']===id))))throw Error('需求选择须唯一且属于所选半开日窗');
  if(!inWindow.length)return res.status(422).json({error:'empty_demand_selection',message:'所选日窗没有需求，未创建成功运行'});
  if(dailyContext&&(start!==dayIndex(dailyContext.date)||current!==start))return res.status(409).json({error:'DAILY_RUN_DATE',message:'运行日期须与当前业务日一致'});
  const normalizedSelection={...selection,startDay:start,endDay:end,currentDay:current},solverConditions=solvers.freeze(d,normalizedSelection,req.body);
  const run={dailyContext,solverConditions,solver:{requested:solverConditions.request.requested,actual:null,version:null,rawStatus:null,conditionsHash:solverConditions.conditionsHash},id:randomUUID(),status:'queued',createdAt:new Date().toISOString(),inputRef:ctx.persist(d),inputHash:hash(d),datasetId:d.id,version:d.version,selection:{...selection,startDay:start,endDay:end,currentDay:current},provenance:{model:'workbook',engineIdentity:minuteMode(d)?MINUTE_ENGINE:'workbook-day-v1',...sourceIdentity(d),selectionHash:hash({...selection,startDay:start,endDay:end,currentDay:current}),actualRecordsHash:hash(d.effectiveParameters||rows(d,'配置参数')),dependencyClosure:ready.dependencyClosure,effectiveAt:start,profile:d.profile,fileHash:d.fileHash,mappingHash:hash(d.mapping),parameterHash:hash(rows(d,'配置参数')),mappingVersion:d.mapping?.version,...(d.parameterContract?{parameterContract:d.parameterContract,parameterScope:scope,effectiveParameters:d.effectiveParameters}:{}),timeUnit:minuteMode(d)?'minute':'day',dayZero:dayDate(0),minuteOrigin:minuteMode(d)?MINUTE_ORIGIN:'2026-11-02T08:00:00+08:00',...(minuteMode(d)?{datasetVersion:d.datasetVersion,timezone:d.timezone,productionContract:d.productionContract}:{}),startDate:dayDate(start),endDate:dayDate(end),startMinute:minuteMode(d)?start*1440:dayMinute(start),endMinute:minuteMode(d)?end*1440:dayMinute(end),interval:'[start,end)'},result:null};s.runs.unshift(run);if(dailyContext){const b=s.dailyBranches.find(b=>b.id===dailyContext.branchId);b.candidate={runId:run.id,status:'generated',stale:false};}audit(s,req,'workbook_run_created',{runId:run.id,inputHash:run.inputHash});write(s);
  let timer;
  const finish=(status,result,failure)=>{const state=read(),r=state.runs.find(r=>r.id===run.id);if(!r||!['queued','running'].includes(r.status))return;if(result&&run.solverConditions.request.requested==='basic'){result.solver={requested:'basic',actual:'basic',version:minuteMode(d)?MINUTE_ENGINE:'workbook-day-v1',rawStatus:null,rawStatusMeaning:'基础引擎未使用CP-SAT原始状态',objective:solverConditions.objective,budget:solverConditions.budget,conditionsHash:solverConditions.conditionsHash,coverage:result.demandSummary,independentCheck:result.verification,startedAt:r.startedAt??r.createdAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-Date.parse(r.startedAt??r.createdAt)};r.solver=result.solver;}else if(result?.solver)r.solver=result.solver;Object.assign(r,{status,result,resultHash:result?hash(result):null,failure,finishedAt:new Date().toISOString()});audit(state,req,'workbook_run_'+status,{runId:r.id,inputHash:r.inputHash});write(state);clearTimeout(timer);const w=workers.get(run.id);if(w?.solver!=='cp-sat'){try{const stopped=w?.terminate();if(stopped?.then)stopped.then(()=>{if(workers.get(run.id)===w)workers.delete(run.id);},()=>{});else if(workers.get(run.id)===w)workers.delete(run.id);}catch{/* Keep the slot until actual termination. */}}};
  if(solverConditions.request.requested==='cp-sat'){solvers.startCp(run,d,req,finish);res.status(202).json(publicRun(read().runs.find(r=>r.id===run.id)));return;}

  try{const executionData={...d,tables:Object.fromEntries(Object.entries(d.tables).filter(([table])=>workbookSchema.tables[table]?.kind==='输入')),referenceSource:{frozenInputHash:run.inputHash,meaning:'参考试算原文保留在冻结对象，不重复进入业务计算'}};const worker=workerFactory({workbookData:executionData,selection:run.selection});workers.set(run.id,worker);worker.cancelSolverRun=()=>{clearTimeout(timer);return worker.terminate();};timer=setTimeout(()=>finish('failed',null,'计算超时；冻结输入保留，不代表无解'),90000);
   worker.on('message',m=>{if(m?.kind==='progress'){const state=read(),r=state.runs.find(r=>r.id===run.id);if(r?.status==='queued'){r.status='running';r.startedAt=new Date().toISOString();r.solver={...r.solver,actual:'basic',version:minuteMode(d)?MINUTE_ENGINE:'workbook-day-v1'};write(state);}}
    else if(m?.kind==='result'&&m.plan){try{const check=verifyWorkbookPlan(effectiveInput(run),m.plan);if(check.status!=='pass')return finish('failed',null,'结果独立检查失败：'+check.issues.join('；'));m.plan.solver={requested:'basic',actual:'basic',version:minuteMode(d)?MINUTE_ENGINE:'workbook-day-v1',rawStatus:null,rawStatusMeaning:'基础引擎未使用CP-SAT原始状态',objective:solverConditions.objective,budget:solverConditions.budget,conditionsHash:solverConditions.conditionsHash,coverage:m.plan.demandSummary,independentCheck:check};const probe={...run,solver:m.plan.solver,status:m.plan.status,result:m.plan};const error=resultProblem(probe);if(error)return finish('failed',null,'结果来源或运行条件不一致');m.plan.verification=check;finish(m.plan.status,m.plan,null);}catch{finish('failed',null,'结果无法独立复核；未保存结果');}}else finish('failed',null,'计算失败；未保存结果');});
   worker.on('error',()=>finish('failed',null,'Worker执行失败'));worker.on('exit',()=>finish('failed',null,'Worker未返回结果即退出'));
  }catch{finish('failed',null,'Worker无法启动');}
  res.status(202).json(publicRun(read().runs.find(r=>r.id===run.id)));
 }));
 router.post('/runs/:id/verify',permission('calculate'),handle((req,res)=>{const s=read(),r=s.runs.find(r=>r.id===req.params.id);if(!r?.result)return res.status(409).json({error:'result_not_ready'});const error=resultProblem(r);if(error)return res.status(409).json({error});const verification=verifyWorkbookPlan(effectiveInput(r),r.result);r.result.verification=verification;r.resultHash=hash(r.result);audit(s,req,'workbook_verified',{runId:r.id,status:verification.status});write(s);res.json(verification);}));
 router.get('/runs/:id/export',permission('export'),handle((req,res)=>{const r=read().runs.find(r=>r.id===req.params.id);if(!r?.result)return res.status(409).json({error:'result_not_ready'});if(hash(inputOf(r))!==r.inputHash)return res.status(409).json({error:'frozen_input_corrupt'});
  const error=resultProblem(r);if(error)return res.status(409).json({error});const exportInput=inputOf(r);const check=verifyWorkbookPlan(effectiveInput(r),r.result);if(check.status!=='pass')return res.status(409).json({error:'independent_result_conflict',issues:check.issues});const body=[['种类','运行编号','数据集','版本','冻结hash','来源profile','业务编号','数量/值','单位','开始日','结束/可用日','来源/状态']];
  const put=(kind,id,value,unit,start,end,source)=>body.push([kind,r.id,r.datasetId,r.version,r.inputHash,exportInput.profile,id,value,unit,start,end,typeof source==='object'?JSON.stringify(source):source]);
  for(const x of r.result.demandResults)put('需求',x.id,x.quantity,x.unit,x.readyDay,x.arrivalDay,{...x.source,status:x.status,lateDays:x.lateDays});
  for(const x of r.result.tasks)put('任务',x.id,x.quantity,'千克',r.result.timeUnit==='minute'?minuteTime(x.start,r.result.minuteOrigin):x.start,r.result.timeUnit==='minute'?minuteTime(x.end,r.result.minuteOrigin):x.end,{...x.source,resource:x.machine,crew:x.crew,tools:x.tools,...(r.result.timeUnit==='minute'?{startMinute:x.startMinute,endMinute:x.endMinute,durationMinutes:x.duration,minuteOrigin:r.result.minuteOrigin}: {})});
  for(const x of r.result.allocations)put('分配',x.supplyId,x.quantity,'基础单位',x.feedDay,'',{...x.source,materialId:x.materialId,conditional:x.conditional});
  for(const x of r.result.shortages)put('净缺口',x.materialId,x.quantity,x.unit,x.needDay,'',x.source);
  for(const x of r.result.suggestions)put('参考采购建议',x.materialId,x.quantity,x.unit,x.orderDay,x.availableDay,{relationId:x.relationId,lateDays:x.lateDays,need:x.need,netGap:x.netGap});
  if(r.solverConditions){put('求解器条件','',JSON.stringify(r.solverConditions),'','','',r.solverConditions.conditionsHash);put('实际求解器','',JSON.stringify(r.solver),'','','',r.result.solver??null);}
  put('检查范围','',JSON.stringify(r.result.verification),'','','',r.result.checkScope);put('时间基准','',r.result.dayZero,'自然日','','',r.result.minuteOrigin);
  // Legacy runs retain their existing native format. New metadata belongs only
  // to runs created with this contract; never backfill historical artifacts.
  if(r.provenance){put('冻结来源','',JSON.stringify(r.provenance),'','','',r.selection);put('运行状态','',r.status,'','','',r.resultHash);}
  if(exportInput.parameterContract)for(const p of exportInput.effectiveParameters?.values||[])put('冻结采用参数',p.id,p.value,'',p.from,p.to,p);
  for(const p of exportInput.bomLossProfiles||[])put('标准投入逐物料损耗',p.productId,JSON.stringify(p.config),'%','','',p.recipe);
  res.type('text/csv; charset=utf-8').attachment('排程冻结结果-'+r.id+'.csv').send('\ufeff'+body.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'));
 }));
 router.post('/datasets/:id/draft',permission('edit'),handle((req,res)=>{
  validateDraftRequest(req.body);
  const d=dataset(read(),req.params.id),prior=d?.drafts?.find(r=>req.body.id?r.id===req.body.id:r.sourceRun===req.body.sourceRun&&r.suggestionId===req.body.suggestionId);
  if(prior&&!req.body.changes&&((req.body.action==='adopt'&&prior.status==='adopted')||(req.body.action==='void'&&prior.status==='void')||(!req.body.id&&!req.body.action)))return res.json({...summaryForDraft(d),draft:prior,idempotent:true,externalDispatch:false});
  const run=read().runs.find(r=>r.id===req.body.sourceRun);if(run){const error=resultProblem(run);if(error)throw Error(error);}
  return saveVersion(req,res,next=>changeDraft(next,req.body,run));
 }));
 router.get('/datasets/:id/drafts',permission('read'),(req,res)=>{const m=ctx.meta(readMetadata(),req.params.id,req.query.version);if(!m)return res.status(404).end();res.json(m.drafts||[]);});
 return router;
}
function summaryForDraft(d){return {id:d.id,version:d.version};}
