import {copyReportSource} from './query-reports/source-copy.mjs';
import {appendWorkbookPlanVersion} from './workbook-candidate.mjs';
import {createSolverRunService} from './solver-choice/run-service.mjs';
import {solverRequest} from './solver-choice/contract.mjs';
import {supplyReadiness} from './workbook-supply.mjs';
import {randomUUID} from 'node:crypto';
import {hash,rows,refreshDerived} from './workbook-model.mjs';
import {cloneForParameters,sourceIdentity} from './workbook-workbench.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
import {scopeOf} from './parameter-contract.mjs';
import {MINUTE_ENGINE,instantMinute} from './workbook-minute.mjs';
import {workbookTables} from './parameter-workbook-export.mjs';
import {DEMAND_FIELDS,URGENT_CONTRACT,requireMinute,urgentError,targetToken,assertTarget,previewUrgent,demandInput,executionLedger} from './urgent-order-input.mjs';
import {freezeUrgent} from './urgent-order-engine.mjs';
import {urgentImpact,queryUrgentImpact,urgentCsv} from './urgent-order-impact.mjs';
import {registerUrgentWorkspace,liveIdentity,candidateStaleness,candidateOverride,assertWorkspaceRunIdentity} from './urgent-workspace-routes.mjs';
import {batchTrace} from './urgent-workspace-trace.mjs';

export function registerUrgentOrders(router,ctx){
 const {read,write,snapshot,persist,permission,actorKey,audit,workers,workerFactory}=ctx;
 const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){if(res.headersSent)return next(e);res.status(e.status||422).json({error:e.code||'URGENT_INVALID',message:e.message,...e.detail});}};
 const solvers=createSolverRunService(ctx);
 const timers=new Map(),schedule=ctx.scheduleTimeout||setTimeout,unschedule=ctx.cancelTimeout||clearTimeout;
 const terminating=new Set();
 // A terminal run is not proof that its thread has exited. Keep the shared
 // busy gate until this exact worker confirms termination; never signal peers.
 const releaseWorker=id=>{
  const worker=workers.get(id);if(!worker||terminating.has(id))return;
  terminating.add(id);
  const released=()=>{if(workers.get(id)===worker)workers.delete(id);terminating.delete(id);};
  try{const pending=worker.terminate();if(pending?.then)pending.then(released,()=>{});else released();}catch{/* Keep busy until an actual exit event. */}
 };
 const plans=s=>s.urgentPlans||[],plan=(s,id)=>{const p=plans(s).find(p=>p.id===id);if(!p)throw urgentError('URGENT_PLAN_NOT_FOUND','插单计划不存在',{},404);return p;};
 const publicPlan=p=>{const {baseInputRef,inputHash,...rest}=p;return {...rest,inputHash,targetToken:targetToken(p)};};
 // Reuse only this request's verified, detached input when both ref and hash
 // match the head. Always verify the head input/result and retain its identity.
 const frozen=(r,verified)=>{if(!r)throw urgentError('URGENT_RUN_NOT_FOUND','所选运行不存在',{},404);const d=verified&&verified.ref===r.inputRef&&verified.hash===r.inputHash?verified.d:snapshot(r.inputRef);if(hash(d)!==r.inputHash||r.result&&hash(r.result)!==r.resultHash)throw urgentError('URGENT_FROZEN_CORRUPT','冻结输入或结果指纹不符',{},409);return d;};
 const source=(s,p)=>{const d=snapshot(p.baseInputRef);if(hash(d)!==p.inputHash)throw urgentError('URGENT_SOURCE_CORRUPT','计划输入指纹不符');const r=s.runs.find(r=>r.id===p.headRunId);frozen(r,{ref:p.baseInputRef,hash:p.inputHash,d});return {d,r};};
 const readImpact=(s,id)=>{const r=s.runs.find(r=>r.id===id),d=frozen(r);assertWorkspaceRunIdentity(r);if(!r.urgentImpact||hash(r.urgentImpact)!==r.urgentImpactHash)throw urgentError('URGENT_IMPACT_NOT_READY','同源影响尚未就绪');if(r.urgentImpact.runId!==r.id||r.urgentImpact.inputHash!==r.inputHash||r.urgentImpact.baseResultHash!==d.urgentOrder?.baseResultHash)throw urgentError('URGENT_IMPACT_IDENTITY','影响来源不一致');return {r,d,impact:r.urgentImpact};};
 registerUrgentWorkspace(router,ctx,{plan,publicPlan,source,handle});
 router.get('/urgent/template',permission('export'),(_req,res)=>res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('紧急插单每日需求.xlsx').send(workbookTables([['每日需求',DEMAND_FIELDS,[],'紧急插单每日需求；第2行原17列表头，第3行起数据；日序沿所选数据集原点。']])));
 router.get('/urgent/plans',permission('read'),handle((req,res)=>res.json(plans(read()).filter(p=>!req.query.datasetId||p.datasetId===req.query.datasetId).map(publicPlan))));
 router.get('/urgent/plans/:id',permission('read'),handle((req,res)=>res.json(publicPlan(plan(read(),req.params.id)))));
 router.post('/urgent/plans',permission('edit'),handle((req,res)=>{
  const s=read(),r=s.runs.find(r=>r.id===req.body.runId),d=frozen(r);requireMinute(d);
  if(!['completed','partial'].includes(r.status)||!r.result||r.result.verification?.status!=='pass')throw urgentError('URGENT_BASE_NOT_READY','请选择独立检查通过的完整/部分未排分钟计划');
  if(req.body.expectedResultHash!==r.resultHash)throw urgentError('URGENT_TARGET_CHANGED','目标结果已变化',{},409);
  const prior=plans(s).find(p=>p.baseRunId===r.id);if(prior)return res.json({...publicPlan(prior),idempotent:true});
  if(r.urgentPlanId)throw urgentError('URGENT_EXISTING_CONTEXT','该候选已有原插单上下文，请沿原计划接续',{planId:r.urgentPlanId},409);
  const facts=executionLedger(r.result,req.body.facts),p={id:randomUUID(),contract:URGENT_CONTRACT,datasetId:r.datasetId,version:r.version,baseRunId:r.id,headRunId:r.id,baseInputRef:r.inputRef,inputHash:r.inputHash,selection:{startDay:r.selection.startDay,endDay:r.selection.endDay,currentDay:r.selection.currentDay},originalDemandIds:r.result.demandResults.map(x=>x.id),line:d.mapping?.line,facts,factsRevision:1,revision:1,batches:[],previews:[],runs:[],createdAt:new Date().toISOString(),actor:actorKey(req)};
  s.urgentPlans??=[];s.urgentPlans.push(p);audit(s,req,'urgent_context_created',{planId:p.id,baseRunId:r.id,factsHash:hash(facts)});write(s);res.status(201).json(publicPlan(p));
 }));
 router.post('/urgent/plans/:id/facts',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const {r}=source(s,p);
  p.facts=executionLedger(r.result,req.body.facts,p.facts,p.selection);p.factsRevision++;p.revision++;audit(s,req,'urgent_facts_changed',{planId:p.id,factsRevision:p.factsRevision,factsHash:hash(p.facts)});write(s);res.json(publicPlan(p));
 }));
 router.post('/urgent/plans/:id/selection',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const {startDay,endDay}=req.body;
  if(![startDay,endDay].every(Number.isSafeInteger)||startDay<p.selection.currentDay||startDay>p.selection.startDay||endDay<p.selection.endDay||endDay>44||startDay>=endDay||p.facts.observationMinute<startDay*1440||p.facts.observationMinute>=endDay*1440)throw urgentError('URGENT_WINDOW','只能明确扩展当前支持范围内的半开窗口，保留原工作和观察时刻');
  p.selection={...p.selection,startDay,endDay};p.revision++;audit(s,req,'urgent_window_changed',{planId:p.id,selection:p.selection});write(s);res.json(publicPlan(p));
 }));
 router.post('/urgent/plans/:id/configuration',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);
  if(req.body.version!==p.version)throw urgentError('URGENT_CONFIGURATION_VERSION','参数采用只限原业务版本；业务版本变化须重新选定计划');
  const current=ctx.dataset(s,p.datasetId,req.body.version);if(!current||(current.parameterRevision||0)!==req.body.parameterRevision)throw urgentError('URGENT_CONFIGURATION_CHANGED','当前参数修订变化，请刷新后核对',{},409);
  requireMinute(current);const old=snapshot(p.baseInputRef),next=copyReportSource(old);
  // Import only the explicitly acknowledged configuration layer. Authoritative
  // master-data/stock/demands remain those selected by the original plan.
  const scope=old.parameterContext?.scope||'dataset';next.tables['配置参数']=structuredClone(rows(current,'配置参数').filter(x=>scopeOf(x)==='dataset'||scopeOf(x)===scope));
  for(const key of ['parameterContract','parameterDefinitions','parameterSources','parameterClassification','parameterPrecedence','parameterRevision','parameterCandidates','parameterTrials','parameterBaseline'])if(Object.hasOwn(current,key))next[key]=structuredClone(current[key]);
  refreshDerived(next,p.selection.startDay);
  const key=x=>JSON.stringify([x['对象编号'],x['参数名称'],x['生效日'],x['失效日'],scopeOf(x)]),oldValues=new Map(rows(old,'配置参数').map(x=>[key(x),x]));p.configurationChanges??=[];p.configurationChanges.push({revision:p.revision+1,actor:actorKey(req),fromHash:hash(rows(old,'配置参数')),toHash:hash(rows(next,'配置参数')),changes:rows(next,'配置参数').filter(x=>hash(x)!==hash(oldValues.get(key(x))||null)).map(x=>({object:x['对象编号'],field:x['参数名称'],previous:oldValues.get(key(x))?.['参数值'],value:x['参数值'],unit:x['单位'],source:x._source}))});
  p.inputHistory??=[];p.inputHistory.push({ref:p.baseInputRef,inputHash:p.inputHash,revision:p.revision});p.baseInputRef=persist(next);p.inputHash=hash(next);p.parameterRevision=current.parameterRevision||0;p.revision++;
  audit(s,req,'urgent_configuration_adopted',{planId:p.id,inputHash:p.inputHash,parameterRevision:p.parameterRevision});write(s);res.json(publicPlan(p));
 }));
 router.post('/urgent/plans/:id/preview',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const {d}=source(s,p);
  if(typeof req.body.fileBase64!=='string'||req.body.fileBase64.length>17*1024*1024)throw urgentError('URGENT_FILE_SIZE','请选择12MB以内xlsx');
  const buffer=Buffer.from(req.body.fileBase64,'base64'),prior=p.previews.find(x=>x.fileHash===hash(buffer)&&x.effectiveMinute===instantMinute(req.body.effectiveTime,d.minuteOrigin)&&x.actor===actorKey(req)&&p.batches.some(b=>b.previewId===x.id&&b.status!=='withdrawn'));
  if(prior){const {fileRef,...visible}=prior;return res.json({...visible,idempotent:true});}
  const preview=previewUrgent(buffer,d,p,{fileName:String(req.body.fileName||'').slice(0,200),effectiveTime:req.body.effectiveTime});
  const item={...preview,id:randomUUID(),actor:actorKey(req),createdAt:new Date().toISOString(),fileRef:persist({fileBase64:buffer.toString('base64')}),status:'preview'};
  p.previews.push(item);audit(s,req,'urgent_preview',{planId:p.id,previewId:item.id,fileHash:item.fileHash});write(s);const {fileRef,...visible}=item;res.json(visible);
 }));
 router.post('/urgent/plans/:id/commit',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id),item=p.previews.find(x=>x.id===req.body.previewId);if(!item)throw urgentError('URGENT_PREVIEW_NOT_FOUND','预览不存在');
  if(item.actor!==actorKey(req)||item.fileHash!==req.body.fileHash)throw urgentError('URGENT_PREVIEW_BINDING','预览主体或文件指纹不一致',{},409);
  const prior=p.batches.find(b=>b.previewId===item.id);if(prior)return res.json({plan:publicPlan(p),batch:prior,idempotent:true});
  assertTarget(p,req.body.targetToken);if(item.targetToken!==req.body.targetToken)throw urgentError('URGENT_TARGET_CHANGED','预览后上下文已变化，请重新预览',{},409);
  if(!item.valid||item.issues.length)throw urgentError('URGENT_VALIDATION_BLOCKED','整批校验不通过，未生效',{issues:item.issues});
  const draft=item.draftId?p.drafts?.find(x=>x.id===item.draftId):null;if(item.draftId&&(!draft||draft.status!=='draft'||draft.revision!==item.draftRevision))throw urgentError('URGENT_DRAFT_REVISION','草稿已变化，请重新预览',{},409);
  const identical=p.batches.find(b=>b.fileHash===item.fileHash&&b.effectiveMinute===item.effectiveMinute);if(identical)return res.json({plan:publicPlan(p),batch:identical,idempotent:true});
  const {d}=source(s,p),current=demandInput(d,p),ids=new Set([...rows(current,'每日需求').map(r=>r['需求编号']),...p.batches.flatMap(b=>b.demands.map(r=>r['需求编号']))]);if(item.demands.some(r=>ids.has(r['需求编号'])))throw urgentError('URGENT_ID_CONFLICT','需求编号冲突，整批拒绝覆盖');
  const batch={id:randomUUID(),previewId:item.id,sequence:p.batches.length+1,fileHash:item.fileHash,fileName:item.fileName,fileRef:item.fileRef,effectiveMinute:item.effectiveMinute,demands:structuredClone(item.demands),outside:item.outside,status:'effective_pending',actor:actorKey(req),createdAt:new Date().toISOString()};
  if(draft){batch.draftId=draft.id;draft.status='accepted';draft.batchId=batch.id;draft.acceptedRevision=draft.revision;}
  p.batches.push(batch);p.revision++;item.status='committed';audit(s,req,'urgent_batch_effective',{planId:p.id,batchId:batch.id,fileHash:batch.fileHash,revision:p.revision});write(s);res.json({plan:publicPlan(p),batch,idempotent:false});
 }));
 router.get('/urgent/plans/:id/batches/:batch/source',permission('export'),handle((req,res)=>{const p=plan(read(),req.params.id),b=p.batches.find(b=>b.id===req.params.batch);if(!b)throw urgentError('URGENT_BATCH_NOT_FOUND','批次不存在');const bytes=Buffer.from(snapshot(b.fileRef).fileBase64,'base64');if(hash(bytes)!==b.fileHash)throw urgentError('URGENT_SOURCE_CORRUPT','原件指纹不符');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('插单原件.xlsx').send(bytes);}));
 router.post('/urgent/plans/:id/readiness',permission('read'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const {d:original,r:base}=source(s,p),d=freezeUrgent(demandInput(original,p),p,base.result,candidateOverride(req.body)),selection={...p.selection,currentMinute:p.facts.observationMinute};
  if(d.urgentWorkspace&&req.body.solver==='cp-sat')throw urgentError('URGENT_CP_WORKSPACE_UNSUPPORTED','当前CP-SAT编译器尚未覆盖本CR冻结分区/故障分段/加班约束，请明确选择基础分钟求解；不会静默回退');
  res.json({...solvers.readiness(d,{...req.body,selection,parameterScope:d.parameterContext?.scope||'dataset'},actorKey(req)),targetToken:targetToken(p)});
 }));
 router.post('/urgent/plans/:id/run',permission('calculate'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);if(!p.batches.some(b=>b.status!=='withdrawn'))throw urgentError('URGENT_EMPTY','没有已生效插单');solverRequest(req.body);
  if(workers.size||s.runs.some(r=>['queued','running'].includes(r.status)))throw urgentError('URGENT_RUN_BUSY','当前计算窗口被占用，请等待释放',{},429);
  const {d:original,r:base}=source(s,p),d=freezeUrgent(demandInput(original,p),p,base.result,candidateOverride(req.body));
  if(d.urgentWorkspace&&req.body.solver==='cp-sat')throw urgentError('URGENT_CP_WORKSPACE_UNSUPPORTED','当前CP-SAT尚未覆盖本CR策略约束，不启动也不静默回退');
  const selection={...p.selection,currentMinute:p.facts.observationMinute};const readiness=supplyReadiness(d,selection);if(!readiness.ready)throw urgentError('URGENT_NOT_READY','当前计划的必要资料或能力不完整',{issues:readiness.issues});
  const check=solvers.readiness(d,{...req.body,selection,parameterScope:d.parameterContext?.scope||'dataset'},actorKey(req));if(req.body.solver==='cp-sat'||req.body.solverReadinessToken){if(!check.ready)throw urgentError('URGENT_SOLVER_NOT_READY','本次求解条件尚未就绪',{issues:check.issues});if(check.token!==req.body.solverReadinessToken)throw urgentError('URGENT_SOLVER_CHANGED','求解器、预算或输入变化后须重查',{},409);}
  const solverConditions=solvers.freeze(d,selection,req.body);
  const r={solverConditions,solver:{requested:solverConditions.request.requested,actual:null,version:null,rawStatus:null,conditionsHash:solverConditions.conditionsHash},id:randomUUID(),status:'queued',createdAt:new Date().toISOString(),datasetId:d.id,version:d.version,inputRef:persist(d),inputHash:hash(d),selection,urgentPlanId:p.id,urgentRevision:p.revision,baseRunId:p.headRunId,provenance:{model:'workbook',...sourceIdentity(d),engineIdentity:MINUTE_ENGINE,profile:d.profile,fileHash:d.fileHash,mappingHash:hash(d.mapping),parameterHash:hash(rows(d,'配置参数')),timeUnit:'minute',minuteOrigin:d.minuteOrigin,dayZero:d.dayZero,timezone:d.timezone,parameterScope:d.parameterContext?.scope||'dataset',contract:URGENT_CONTRACT,batchIds:d.urgentOrder.batchIds,factsHash:d.urgentOrder.factsHash},result:null};
  if(d.urgentWorkspace){r.workspaceIdentity={live:liveIdentity(ctx,s,p),strategy:d.urgentWorkspace.strategy,scope:d.urgentWorkspace.scope,policyHash:d.urgentWorkspace.policyHash,eventsHash:d.urgentWorkspace.eventsHash,overtime:d.urgentWorkspace.strategy==='overtime'?d.urgentWorkspace.overtime:[]};r.workspaceSnapshot={workspace:d.urgentWorkspace,trace:batchTrace(original,p,base.result),workspaceIdentity:r.workspaceIdentity,traceRecords:structuredClone(p.trace||[]),replacements:structuredClone(p.replacements||[])};r.workspaceSnapshotHash=hash(r.workspaceSnapshot);}
  s.runs.unshift(r);p.runs.push(r.id);for(const b of p.batches.filter(b=>d.urgentOrder.batchIds.includes(b.id))){b.status='computing';b.activeRunId=r.id;}audit(s,req,'urgent_run_created',{planId:p.id,runId:r.id,inputHash:r.inputHash});write(s);
  let timer,worker;
  const finish=(status,result,failure)=>{const state=read(),saved=state.runs.find(x=>x.id===r.id);if(!saved||!['queued','running'].includes(saved.status)){unschedule(timer);timers.delete(r.id);return;}if(result&&solverConditions.request.requested==='basic'){result.solver={requested:'basic',actual:'basic',version:MINUTE_ENGINE,rawStatus:null,rawStatusMeaning:'基础引擎未使用CP-SAT原始状态',objective:solverConditions.objective,budget:solverConditions.budget,conditionsHash:solverConditions.conditionsHash,coverage:result.demandSummary,independentCheck:result.verification,startedAt:saved.startedAt??saved.createdAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-Date.parse(saved.startedAt??saved.createdAt)};saved.solver=result.solver;}else if(result?.solver)saved.solver=result.solver;Object.assign(saved,{status,result,resultHash:result?hash(result):null,failure,finishedAt:new Date().toISOString()});
   if(result){saved.urgentImpact=urgentImpact(d,base.result,result,r.id);saved.urgentImpactHash=hash(saved.urgentImpact);saved.candidateState='saved';}
   const current=plans(state).find(x=>x.id===p.id);for(const b of current?.batches||[])if(b.activeRunId===r.id)b.status=({completed:'result_generated',partial:'partial_unplanned',failed:'calculation_failed',timed_out:'timed_out'})[status]||status;
   audit(state,req,'urgent_run_'+status,{planId:p.id,runId:r.id});write(state);unschedule(timer);timers.delete(r.id);releaseWorker(r.id);};
  if(solverConditions.request.requested==='cp-sat'){solvers.startCp(r,d,req,finish);const {inputRef,...visible}=read().runs.find(x=>x.id===r.id);res.status(202).json(visible);return;}
  try{worker=workerFactory({workbookData:d,selection});workers.set(r.id,worker);worker.cancelSolverRun=()=>{unschedule(timer);timers.delete(r.id);return worker.terminate();};timer=schedule(()=>finish('timed_out',null,'计算超时；保留已生效批次和冻结输入，不推断业务无解'),90000);timers.set(r.id,timer);
   worker.on('message',m=>{if(m?.kind==='progress'){const state=read(),saved=state.runs.find(x=>x.id===r.id);if(saved?.status==='queued'){saved.status='running';saved.startedAt=new Date().toISOString();saved.solver={...saved.solver,actual:'basic',version:MINUTE_ENGINE};write(state);}}
    else if(m?.kind==='result'&&m.plan){try{if(!['completed','partial'].includes(m.plan.status))return finish('failed',null,'Worker返回未知完成状态');const input=refreshDerived(cloneForParameters(d),selection.startDay),verification=verifyWorkbookPlan(input,m.plan);if(verification.status!=='pass'||verification.notChecked?.length)return finish('failed',null,'独立检查未通过：'+verification.issues.join('；'));if(hash(m.plan.conditions)!==hash({...selection,interval:'[start,end)'})||m.plan.source?.datasetId!==d.id||m.plan.source?.version!==d.version||m.plan.source?.fileHash!==d.fileHash||m.plan.source?.mappingHash!==r.provenance.mappingHash||m.plan.source?.parameterHash!==r.provenance.parameterHash)return finish('failed',null,'结果与冻结条件/参数不符');m.plan.verification=verification;finish(m.plan.status,m.plan,null);}catch(e){finish('failed',null,'结果复核失败：'+e.message);}}
    else finish('failed',null,m?.message||'计算未返回结果');});worker.on('error',()=>finish('failed',null,'Worker执行失败'));worker.on('exit',()=>{if(workers.get(r.id)===worker)workers.delete(r.id);terminating.delete(r.id);finish('failed',null,'Worker未返回结果即退出');});
  }catch{finish('failed',null,'Worker无法启动');}
  const {inputRef,...visible}=read().runs.find(x=>x.id===r.id);res.status(202).json(visible);
 }));
 router.post('/urgent/runs/:id/cancel',permission('calculate'),(req,res,next)=>{const r=read().runs.find(r=>r.id===req.params.id);if(r?.solverConditions?.request.requested==='cp-sat'){req.url='/runs/'+encodeURIComponent(r.id)+'/cancel';return router.handle(req,res,next);}next();},handle((req,res)=>{const s=read(),r=s.runs.find(r=>r.id===req.params.id);if(!r?.urgentPlanId)throw urgentError('URGENT_RUN_NOT_FOUND','插单运行不存在');if(['queued','running'].includes(r.status)){r.status='cancelled';r.failure='用户取消，已生效需求仍保留';r.finishedAt=new Date().toISOString();unschedule(timers.get(r.id));timers.delete(r.id);const context=plan(s,r.urgentPlanId);for(const b of context.batches)if(b.activeRunId===r.id)b.status='cancelled';audit(s,req,'urgent_run_cancelled',{runId:r.id});write(s);releaseWorker(r.id);}res.json({id:r.id,status:r.status,pendingWorker:workers.has(r.id)});}));
 router.post('/urgent/runs/:id/candidate',permission('edit'),handle((req,res)=>{const s=read(),{r,d}=readImpact(s,req.params.id),p=plan(s,r.urgentPlanId);assertTarget(p,req.body.targetToken);const action=req.body.action;
  if(r.candidateState==='discarded'&&action==='adopt')throw urgentError('URGENT_DISCARDED','放弃的候选不可直接采用，请另建运行');
  if(!['save','discard','adopt'].includes(action))throw urgentError('URGENT_CANDIDATE_ACTION','未知方案操作');
  if(r.candidateState==='adopted'&&action!=='adopt')throw urgentError('URGENT_ADOPTED','已采用版本不能以放弃或保存撤销');
  if(action==='adopt'&&r.candidateState!=='adopted'){
   const stale=candidateStaleness(ctx,s,p,r);if(stale.stale)throw urgentError('URGENT_CANDIDATE_STALE',stale.reasons.join('；')+'，请重查后再采用',{},409);
   const check=verifyWorkbookPlan(refreshDerived(cloneForParameters(d),r.selection.startDay),r.result);if(check.status!=='pass'||check.notChecked?.length)throw urgentError('URGENT_CONFIRM_BLOCKED','关键约束或检查未通过，不能采用',{issues:check.issues});
   appendWorkbookPlanVersion(p,r,d);
  }
  r.candidateState=({save:'saved',discard:'discarded',adopt:'adopted'})[action];audit(s,req,'urgent_candidate_'+action,{runId:r.id,planId:p.id});write(s);res.json({state:r.candidateState,plan:publicPlan(p),externalDispatch:false});
 }));
 router.get('/urgent/runs/:id/impact',permission('read'),handle((req,res)=>{const s=read(),{r,impact}=readImpact(s,req.params.id),p=plan(s,r.urgentPlanId);res.json({...impact,candidateState:r.candidateState,pendingBatchIds:p.batches.filter(b=>b.status!=='withdrawn'&&!impact.batchIds.includes(b.id)).map(b=>b.id),factsChanged:p.factsRevision!==impact.factsRevision,workspace:r.workspaceSnapshot,staleness:candidateStaleness(ctx,s,p,r)});}));
 for(const [suffix,exporting]of [['query',false],['export',true]])router.post('/urgent/runs/:id/'+suffix,permission(exporting?'export':'read'),handle((req,res)=>{
  const {d,impact}=readImpact(read(),req.params.id);if(req.body.inputHash!==impact.inputHash)throw urgentError('URGENT_QUERY_STALE','查询来源指纹不一致',{},409);const page=queryUrgentImpact(impact,req.body.query,d);
  if(exporting)return res.type('text/csv; charset=utf-8').attachment('插单结果与影响-'+req.params.id+'.csv').send(urgentCsv(page,req.body.columns));
  const size=req.body.query?.pageSize??100,offset=req.body.query?.offset??0;if(![100,200,500].includes(size)||!Number.isSafeInteger(offset)||offset<0)throw urgentError('URGENT_QUERY_PAGE','分页须为100/200/500及非负偏移');res.json({...page,offset,records:page.records.slice(offset,offset+size),nextOffset:offset+size<page.total?offset+size:null});
 }));
}
