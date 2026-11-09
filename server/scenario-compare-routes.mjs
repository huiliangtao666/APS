import {DAY_ENGINE} from './urgent-order-day.mjs';
import {dayWorkspaceDefaults} from './scenario-day-defaults.mjs';
import {dayConditionOptions,DAY_SCENARIO_LIMIT_SECONDS} from './scenario-compare-day.mjs';
import {randomUUID} from 'node:crypto';
import {hash,rows,refreshDerived} from './workbook-model.mjs';
import {cloneForParameters} from './workbook-workbench.mjs';
import {executionLedger,URGENT_CONTRACT} from './urgent-order-input.mjs';
import {freezeUrgent} from './urgent-order-engine.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
import {MINUTE_ENGINE} from './workbook-minute.mjs';
import {createSolverRunService} from './solver-choice/run-service.mjs';
import {appendWorkbookPlanVersion} from './workbook-candidate.mjs';
import {SC_CONTRACT,KPI_DEFINITION,scError,validateCompareConfig,scenarioInput,compareStamp} from './scenario-compare-policy.mjs';
import {scenarioMetrics} from './scenario-compare-metrics.mjs';

const terminal=s=>!['queued','running','cancelling'].includes(s);
const stamp=g=>hash({id:g.id,revision:g.revision,baseIdentity:g.baseIdentity,definition:g.definition,scenarios:g.scenarios.map(s=>({id:s.id,revision:s.revision,status:s.status,conditions:s.conditions}))});
export function registerScenarioCompare(router,ctx){
 const {read,write,snapshot,persist,permission,actorKey,audit,workers,workerFactory}=ctx;
 const solver=createSolverRunService(ctx),active=new Map();
 const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(res.headersSent)return next(e);res.status(e.status||422).json({error:e.code||'SC_INVALID',message:e.message,field:e.field||null});});
 const group=(s,id)=>{const g=s.scenarioGroups?.find(g=>g.id===id);if(!g)throw scError('GROUP','对比组不存在','groupId',404);return g;};
 const scene=(g,id)=>{const c=g.scenarios.find(c=>c.id===id);if(!c)throw scError('SCENARIO','情景不存在','scenarioId',404);return c;};
 const expected=(g,token)=>{if(token!==stamp(g))throw scError('REVISION','对比组已变化，请重读后核对','token',409);};
 function frozen(ref,expectedHash){const value=snapshot(ref);if(hash(value)!==expectedHash)throw scError('FROZEN','冻结来源指纹不符','source',409);return structuredClone(value);}
 function source(s,g){const r=s.runs.find(r=>r.id===g.baseRunId);if(!r||r.resultHash!==g.baseIdentity.resultHash||hash(r.result)!==r.resultHash)throw scError('BASE_CHANGED','基准运行结果损坏或变化','baseRunId',409);return {base:r,d:frozen(g.baseInputRef,g.baseIdentity.inputHash),plan:frozen(g.planRef,g.planHash)};}
 function stale(s,g){const {base}=source(s,g),now=compareStamp(ctx,s,base);return g.purpose!=='capacity-bottleneck'&&now.baseAlreadyStale||hash(now)!==hash(g.liveIdentity);}
 function visible(s,g){const {baseInputRef,planRef,...publicGroup}=g;return {...publicGroup,...(g.definition.timeUnit==='day'?{conditionOptions:dayConditionOptions(source(s,g).d)}:{}),token:stamp(g),stale:stale(s,g),pendingOwned:g.batches.some(b=>active.has(b.id)),scenarios:g.scenarios.map(c=>({...c,attempts:c.attempts.map(a=>({...a,run:s.runs.find(r=>r.id===a.runId)?publicRun(s.runs.find(r=>r.id===a.runId)):null}))}))};}
 const publicRun=r=>{const {inputRef,...visible}=r;return visible;};
 const changed=(s,g,req,action)=>{g.revision++;audit(s,req,action,{groupId:g.id,revision:g.revision});write(s);};
 const current=g=>{if(g.batches.some(b=>active.has(b.id)))throw scError('BUSY','当前串行队列尚未最终释放','batch',409);};
 // Restart recovery records real interrupted terminals; no automatic replay,
 // hidden retry, or invented release of a child from another application PID.
 const recovered=read();let recovery=false;
 for(const g of recovered.scenarioGroups||[])for(const b of g.batches)if(!terminal(b.status)){
  b.status='interrupted';b.failure='应用重启，未继续旧队列；保留各尝试与已完成结果';
  for(const id of b.scenarioIds){const c=scene(g,id),a=c.attempts.find(a=>a.batchId===b.id),r=recovered.runs.find(r=>r.id===a?.runId);if(r&&!terminal(r.status)){r.status='failed';r.failure='应用重启中断，未自动重试';r.finishedAt=new Date().toISOString();}if(!terminal(c.status))c.status='interrupted';}recovery=true;
 }
 if(recovery)write(recovered);
 router.get('/scenario/groups',permission('read'),handle((req,res)=>{const s=read();res.json((s.scenarioGroups||[]).filter(g=>(!req.query.datasetId||g.datasetId===req.query.datasetId)&&(req.query.purpose?req.query.purpose===g.purpose:!g.purpose)&&(!req.query.baseRunId||req.query.baseRunId===g.baseRunId)).map(g=>visible(s,g)));}));
 router.get('/scenario/environment',permission('read'),handle((_req,res)=>{const e=ctx.scenarioEnvironment?.();res.json({available:!!e,dayAvailable:true,dayLimits:{runSeconds:DAY_SCENARIO_LIMIT_SECONDS,concurrency:1,source:'沿用按天排程单项90秒保护；情景容量和单项秒数由用户明确填写'},execution:e?validateCompareConfig(e):null,kpiDefinition:KPI_DEFINITION,meaning:'运行容量与预算由当前服务供给，缺失则不可启动；无隐藏5情景或费率默认'});}));
 router.post('/scenario/groups',permission('edit'),handle((req,res)=>{
  const s=read(),r=s.runs.find(r=>r.id===req.body.runId);
  if(!r?.result||!['completed','partial'].includes(r.status)||r.resultHash!==req.body.expectedResultHash||hash(r.result)!==r.resultHash)throw scError('BASE','请选择已保存且来源核实的基准运行','runId');
  const d=frozen(r.inputRef,r.inputHash),config=validateCompareConfig(req.body.config);
  const daily=r.result.timeUnit==='day';if(!['day','minute'].includes(r.result.timeUnit)||r.result.verification?.status!=='pass')throw scError('BASE','基准须为独立检查通过的按天或分钟计划','runId');
  if(daily&&config.runSeconds>DAY_SCENARIO_LIMIT_SECONDS)throw scError('BUDGET','按天单情景最长试算不能超过90秒；请调低试算秒数','runSeconds');
  if(r.solver?.requested&&r.solver.requested!=='basic'||r.solver?.actual&&r.solver.actual!=='basic')throw scError('BASE_ENGINE','当前新增接缝只覆盖同基础引擎基准；不能将CP-SAT基准与基础试算标为相同求解条件','runId');
  const old=(s.urgentPlans||[]).find(p=>p.headRunId===r.id),facts=old?structuredClone(old.facts):executionLedger(r.result,req.body.facts);
  if(old&&req.body.planRevision!==old.revision)throw scError('FACTS_CHANGED','原计划事实或修订已变化，请刷新','planRevision',409);
  const selection={...r.selection,...(daily?{}:{currentMinute:facts.observationMinute})};delete selection.demandIds;
  const plan=old?structuredClone(old):{id:randomUUID(),contract:URGENT_CONTRACT,...(daily?{timeUnit:'day',workspace:dayWorkspaceDefaults(facts.observationDay,d)}:{}),datasetId:r.datasetId,version:r.version,baseRunId:r.id,headRunId:r.id,baseInputRef:r.inputRef,inputHash:r.inputHash,selection,facts,factsRevision:1,revision:1,batches:[],previews:[],runs:[],originalDemandIds:r.result.demandResults.map(r=>r.id)};
  if(daily){plan.timeUnit='day';plan.workspace??=dayWorkspaceDefaults(facts.observationDay,d);}
  // Freeze execution protection using existing factual ledger. The supplied
  // base selection is kept, including an explicit demand scope; no latest run.
  const demandIds=r.result.demandResults.map(r=>r.id);
  const definition={...config,kpiDefinition:KPI_DEFINITION,selection,demandIds,costs:[],interval:'[start,end)',timeUnit:daily?'day':'minute',quantityUnit:'千克'};
  if(req.body.purpose&&req.body.purpose!=='capacity-bottleneck')throw scError('PURPOSE','不支持的分析用途','purpose');
  if(req.body.purpose==='capacity-bottleneck'&&!daily)throw scError('TIME_UNIT','排产瓶颈模拟目前使用按天排程','runId');
  const g={...(req.body.purpose?{purpose:req.body.purpose}:{}),id:randomUUID(),name:String(req.body.name||'').trim(),contract:SC_CONTRACT,revision:1,datasetId:r.datasetId,baseRunId:r.id,baseInputRef:r.inputRef,baseIdentity:{inputHash:r.inputHash,resultHash:r.resultHash,selectionHash:hash(r.selection),parameterHash:hash(rows(d,'配置参数')),parameterContext:d.parameterContext||null,solverConditions:r.solverConditions||null,solver:r.solver||null,factsHash:hash(facts),...(daily?{observationDay:facts.observationDay,dayZero:r.result.dayZero}:{observationMinute:facts.observationMinute,minuteOrigin:d.minuteOrigin})},planRef:persist(plan),planHash:hash(plan),linkedPlanId:old?.id||null,linkedPlanRevision:old?.revision||null,liveIdentity:compareStamp(ctx,s,r),definition,scenarios:[],batches:[],preference:null,createdAt:new Date().toISOString(),actor:actorKey(req)};
  if(!g.name)throw scError('NAME','请填写对比组名称','name');
  s.scenarioGroups??=[];s.scenarioGroups.push(g);audit(s,req,'scenario_group_created',{groupId:g.id,baseRunId:r.id});write(s);res.status(201).json(visible(s,g));
 }));
 router.get('/scenario/groups/:id',permission('read'),handle((req,res)=>{const s=read();res.json(visible(s,group(s,req.params.id)));}));
 router.post('/scenario/groups/:id/scenarios',permission('edit'),handle((req,res)=>{
  const s=read(),g=group(s,req.params.id);expected(g,req.body.token);current(g);
  const {d}=source(s,g);if(stale(s,g))throw scError('STALE','底本/事实变化；旧组可查，请明确重建新组','group',409);
  const existing=req.body.scenarioId?scene(g,req.body.scenarioId):null;
  if(!existing&&g.scenarios.filter(c=>!c.withdrawn).length>=g.definition.maxScenarios)throw scError('CAPACITY','达到本组显式情景容量','maxScenarios');
  const name=String(req.body.name||'').trim();if(!name)throw scError('NAME','请填写情景名称','name');
  scenarioInput(d,req.body.conditions,g.definition.selection,g.definition.timeUnit==='day'?g.baseIdentity.observationDay:g.baseIdentity.observationMinute);
  const c=existing||{id:randomUUID(),revision:0,attempts:[],history:[],status:'draft'};
  c.history.push({revision:c.revision,name:c.name||null,conditions:c.conditions||[],withdrawn:c.withdrawn||false,at:new Date().toISOString()});
  Object.assign(c,{name,conditions:structuredClone(req.body.conditions),revision:c.revision+1,withdrawn:req.body.withdrawn===true,status:req.body.withdrawn?'withdrawn':'draft'});
  if(!existing)g.scenarios.push(c);changed(s,g,req,'scenario_conditions_saved');res.json(visible(s,g));
 }));
 router.post('/scenario/groups/:id/preferences',permission('edit'),handle((req,res)=>{
  const s=read(),g=group(s,req.params.id);expected(g,req.body.token);current(g);
  if(req.body.scenarioId!==null)scene(g,req.body.scenarioId);
  if(typeof req.body.note!=='string')throw scError('NOTE','说明须为文本','note');
  g.preference={scenarioId:req.body.scenarioId,note:req.body.note,at:new Date().toISOString(),actor:actorKey(req)};changed(s,g,req,'scenario_preference_saved');res.json(visible(s,g));
 }));
 function prepared(s,g,c){
  const {d,base,plan}=source(s,g);d.tables['每日需求']=rows(d,'每日需求').filter(r=>g.definition.demandIds.includes(r['需求编号']));
  const input=scenarioInput(d,c.conditions,g.definition.selection,g.definition.timeUnit==='day'?g.baseIdentity.observationDay:g.baseIdentity.observationMinute);
  plan.selection=structuredClone(g.definition.selection);
  return freezeUrgent(input,plan,base.result);
 }
 function exactResult(r){
  if(!r?.result||!['completed','partial'].includes(r.status)||hash(r.result)!==r.resultHash)throw scError('RESULT','没有该尝试的完整同源结果','runId',409);
  const d=frozen(r.inputRef,r.inputHash);
  if(r.provenance?.timeUnit&&r.result.timeUnit!==r.provenance.timeUnit)throw scError('TIME_UNIT','结果与冻结求解时间单位不一致','runId',409);
  if(hash(r.result.conditions)!==hash({...r.selection,interval:'[start,end)'})||r.result.source?.datasetId!==d.id||r.result.source?.parameterHash!==hash(rows(d,'配置参数'))||r.result.source?.mappingHash!==hash(d.mapping)||hash(r.solver)!==hash(r.result.solver))throw scError('RESULT_IDENTITY','实际引擎/范围/参数或结果身份不符','runId',409);
  return d;
 }
 function scheduleBatch(batchId,req){
  const owned=active.get(batchId);if(!owned)return;
  const s=read(),g=(s.scenarioGroups||[]).find(g=>g.batches.some(b=>b.id===batchId));if(!g)return;
  const b=g.batches.find(b=>b.id===batchId);
  if(owned.runId||b.status==='stopped')return;
  const next=b.scenarioIds.map(id=>scene(g,id)).find(c=>c.status==='queued');
  if(!next){b.status='completed';b.finishedAt=new Date().toISOString();write(s);active.delete(batchId);return;}
  if(stale(s,g)){b.status='stopped';b.failure='底本/执行事实变化；未启动剩余情景';for(const c of g.scenarios.filter(c=>b.scenarioIds.includes(c.id)&&c.status==='queued'))c.status='stale';write(s);active.delete(batchId);return;}
  // No second worker is launched while any exact-owned slot remains. An
  // external occupied slot stops this queue instead of polling indefinitely.
  if(workers.size){b.status='stopped';b.failure='存在其他运行槽，未启动剩余情景';for(const c of g.scenarios.filter(c=>b.scenarioIds.includes(c.id)&&c.status==='queued'))c.status='not_started';write(s);active.delete(batchId);return;}
  let input,conditions;
  try{input=prepared(s,g,next);conditions=solver.freeze(input,g.definition.selection,{solver:'basic'});}
  catch(e){next.status='failed';Object.assign(next.attempts.find(a=>a.batchId===batchId),{status:'failed',failure:e.message});write(s);queueMicrotask(()=>scheduleBatch(batchId,req));return;}
  const base=source(s,g).base,engine=g.definition.timeUnit==='day'?DAY_ENGINE:MINUTE_ENGINE;
  const run={id:randomUUID(),actor:actorKey(req),datasetId:g.datasetId,version:input.version,status:'queued',createdAt:new Date().toISOString(),inputRef:persist(input),inputHash:hash(input),selection:structuredClone(g.definition.selection),solverConditions:conditions,solver:{requested:'basic',actual:null,version:null,conditionsHash:conditions.conditionsHash},scenarioGroupId:g.id,scenarioId:next.id,scenarioRevision:next.revision,baseRunId:g.baseRunId,provenance:{...(g.purpose?{purpose:g.purpose}:{}),model:'workbook',parameterScope:input.parameterContext?.scope||'dataset',engineIdentity:engine,timeUnit:g.definition.timeUnit||'minute',minuteOrigin:input.minuteOrigin,dayZero:base.result.dayZero,fileHash:input.fileHash,mappingHash:hash(input.mapping),parameterHash:hash(rows(input,'配置参数')),timezone:input.timezone||base.result.timezone,profile:input.profile,contract:SC_CONTRACT,baseIdentity:g.baseIdentity,definitionHash:hash(g.definition),conditions:structuredClone(next.conditions),conditionsHash:hash(next.conditions),executionBudget:b.execution,planFactsHash:g.baseIdentity.factsHash},result:null};
  const attempt=next.attempts.find(a=>a.batchId===batchId);attempt.runId=run.id;attempt.status='running';next.status='running';s.runs.unshift(run);owned.runId=run.id;b.status='running';audit(s,req,'scenario_attempt_created',{groupId:g.id,batchId,runId:run.id});write(s);
  let timer,worker,settled=false;
  const release=async()=>{
   if(timer)clearTimeout(timer);
   try{if(worker)await worker.terminate();if(workers.get(run.id)===worker)workers.delete(run.id);owned.runId=null;
    const latest=read(),gg=group(latest,g.id),cc=scene(gg,next.id),rr=latest.runs.find(r=>r.id===run.id),aa=cc.attempts.find(a=>a.id===attempt.id);if(aa)aa.releasedAt=new Date().toISOString();if(rr?.status==='cancelling'){rr.status='cancelled';rr.result=null;rr.resultHash=null;rr.finishedAt=new Date().toISOString();cc.status='cancelled';if(aa)aa.status='cancelled';}write(latest);
    const bb=gg.batches.find(x=>x.id===batchId);if(bb.status==='stopped'){active.delete(batchId);return;}queueMicrotask(()=>scheduleBatch(batchId,req));
   }catch(e){const latest=read(),gg=group(latest,g.id),bb=gg.batches.find(x=>x.id===batchId);bb.status='blocked_release';bb.failure='本人Worker未确认退出，未释放槽或启动下一项';write(latest);}
  };
  const finish=(status,result,failure)=>{
   if(settled)return;settled=true;const latest=read(),gg=group(latest,g.id),cc=scene(gg,next.id),rr=latest.runs.find(r=>r.id===run.id),aa=cc.attempts.find(a=>a.id===attempt.id);
   if(rr&&['queued','running'].includes(rr.status)){
    if(result){result.solver={requested:'basic',actual:'basic',version:engine,conditionsHash:conditions.conditionsHash,budget:b.execution,objective:conditions.objective,stopReason:status,startedAt:rr.startedAt||rr.createdAt,finishedAt:new Date().toISOString(),independentCheck:result.verification};rr.solver=result.solver;}
    Object.assign(rr,{status,result,resultHash:result?hash(result):null,failure,finishedAt:new Date().toISOString()});cc.status=status;aa.status=status;aa.failure=failure;
    audit(latest,req,'scenario_attempt_'+status,{runId:rr.id,groupId:g.id});write(latest);
   }
   void release();
  };
  try{
   worker=workerFactory({workbookData:input,selection:run.selection});workers.set(run.id,worker);
   worker.cancelSolverRun=async()=>{if(settled)return;settled=true;await release();};
   timer=setTimeout(()=>finish('timed_out',null,'达到本次显式单项预算；不代表业务无解'),b.execution.runSeconds*1000);
   worker.on('message',m=>{
    if(settled)return;
    if(m?.kind==='progress'){const latest=read(),rr=latest.runs.find(r=>r.id===run.id);if(rr?.status==='queued'){rr.status='running';rr.startedAt=new Date().toISOString();rr.solver.actual='basic';rr.solver.version=engine;write(latest);}return;}
    if(m?.kind!=='result'||!m.plan)return finish('failed',null,'真实Worker未返回可用结果；未以基准填充');
    try{const check=verifyWorkbookPlan(refreshDerived(cloneForParameters(input),run.selection.startDay),m.plan);
     if(m.plan.timeUnit!==g.definition.timeUnit||check.status!=='pass'||check.notChecked?.length||!['completed','partial'].includes(m.plan.status)||hash(m.plan.conditions)!==hash({...run.selection,interval:'[start,end)'})||m.plan.source?.datasetId!==input.id||m.plan.source?.version!==input.version||m.plan.source?.fileHash!==input.fileHash||m.plan.source?.mappingHash!==hash(input.mapping)||m.plan.source?.parameterHash!==hash(rows(input,'配置参数')))return finish('failed',null,'同源全局约束/数量独立检查失败：'+(check.issues||[]).join('；'));
     m.plan.verification=check;finish(m.plan.status,m.plan,null);
    }catch(e){finish('failed',null,'独立检查失败：'+e.message);}
   });
   worker.on('error',e=>{if(e.code==='ERR_WORKER_OUT_OF_MEMORY'){const latest=read(),gg=group(latest,g.id),bb=gg.batches.find(x=>x.id===batchId);bb.status='stopped';bb.failure='本轮Worker内存异常，停止剩余队列，不自动重试';for(const cc of gg.scenarios.filter(c=>bb.scenarioIds.includes(c.id)&&c.status==='queued')){cc.status='not_started';Object.assign(cc.attempts.find(a=>a.batchId===batchId),{status:'not_started',failure:bb.failure});}write(latest);}finish('failed',null,e.code==='ERR_WORKER_OUT_OF_MEMORY'?'Worker内存异常，已停止队列':'计算Worker错误');});worker.on('exit',()=>finish('failed',null,'Worker退出且没有交付结果'));
  }catch(e){finish('failed',null,'计算Worker未成功启动');}
 }
 router.post('/scenario/groups/:id/batch',permission('calculate'),handle((req,res)=>{
  const s=read(),g=group(s,req.params.id);
  const requestHash=hash({ids:req.body.scenarioIds,solver:req.body.solver});
  if(typeof req.body.requestId!=='string'||!req.body.requestId.trim())throw scError('REQUEST','须有明确幂等请求编号','requestId');
  const prior=g.batches.find(b=>b.requestId===req.body.requestId);if(prior){if(prior.requestHash!==requestHash)throw scError('REQUEST_CONFLICT','同请求编号不能覆盖不同情景集合','requestId',409);return res.json({...visible(s,g),idempotent:true});}
  expected(g,req.body.token);current(g);if(stale(s,g))throw scError('STALE','底本或事实已变化，请另建组','group',409);
  if(req.body.solver!=='basic')throw scError('ENGINE','本新增多情景接缝首轮仅支持显式基础引擎；CP-SAT选择能力保留于原功能，不在此静默回退','solver');
  const environment=ctx.scenarioEnvironment?.(),daily=g.definition.timeUnit==='day';if(!environment&&!daily)throw scError('BUDGET_MISSING','当前服务未供给本功能有效运行容量/预算，未启动任何负载','execution',409);
  const execution=validateCompareConfig(environment||g.definition);if(daily&&g.definition.runSeconds>DAY_SCENARIO_LIMIT_SECONDS)throw scError('BUDGET','按天单项计算不能超过90秒','runSeconds');if(g.definition.runSeconds>execution.runSeconds||g.definition.maxScenarios>execution.maxScenarios||g.definition.budgetSource!==execution.budgetSource)throw scError('BUDGET_CHANGED','对比组预算来源或容量超过当前有效服务合同','execution',409);
  if(!Array.isArray(req.body.scenarioIds)||!req.body.scenarioIds.length||new Set(req.body.scenarioIds).size!==req.body.scenarioIds.length||req.body.scenarioIds.length>execution.maxScenarios)throw scError('SELECTION','请选择明确、唯一且未超容量的情景','scenarioIds');
  if(workers.size||s.runs.some(r=>!terminal(r.status)))throw scError('BUSY','已有运行或待释放Worker，不抢占','execution',409);
  for(const id of req.body.scenarioIds){const c=scene(g,id);if(c.withdrawn)throw scError('WITHDRAWN','撤回情景不可启动','scenarioIds');if(c.attempts.some(a=>a.revision===c.revision&&['completed','partial'].includes(a.status)))throw scError('COMPLETED','本修订已完成，不重复创建相同运行；修改条件后再试算','scenarioIds',409);}
  const b={id:randomUUID(),requestId:req.body.requestId,requestHash,scenarioIds:[...req.body.scenarioIds],status:'queued',execution:{...execution,runSeconds:g.definition.runSeconds,concurrency:1},createdAt:new Date().toISOString()};g.batches.push(b);for(const id of b.scenarioIds){const c=scene(g,id);c.status='queued';c.attempts.push({id:randomUUID(),batchId:b.id,runId:null,revision:c.revision,conditionsHash:hash(c.conditions),status:'queued',createdAt:b.createdAt});}changed(s,g,req,'scenario_batch_submitted');active.set(b.id,{runId:null});queueMicrotask(()=>scheduleBatch(b.id,req));res.status(202).json(visible(s,g));
 }));
 router.post('/scenario/groups/:id/cancel',permission('calculate'),handle(async(req,res)=>{
  const s=read(),g=group(s,req.params.id),b=g.batches.find(b=>b.id===req.body.batchId);if(!b)throw scError('BATCH','队列不存在','batchId',404);
  if(req.body.scenarioId&&!b.scenarioIds.includes(req.body.scenarioId))throw scError('SELECTION','情景不属于本队列','scenarioId');
  if(!req.body.scenarioId){b.status='stopped';b.stoppedAt=new Date().toISOString();}
  let running;
  for(const id of b.scenarioIds.filter(id=>!req.body.scenarioId||id===req.body.scenarioId)){
   const c=scene(g,id);if(c.status==='queued'){c.status='cancelled';const queued=c.attempts.findLast(a=>a.batchId===b.id);if(queued){queued.status='cancelled';queued.finishedAt=new Date().toISOString();}}
   const a=c.attempts.findLast(a=>a.batchId===b.id),r=s.runs.find(r=>r.id===a?.runId);
   if(r&&!terminal(r.status)){r.status='cancelling';running=r;}
  }
  changed(s,g,req,'scenario_cancel_requested');
  if(running){const worker=workers.get(running.id);if(!worker)throw scError('OWNER','Worker归属无法确认，不伪签取消已释放','runId',409);await worker.cancelSolverRun();}
  else if(!req.body.scenarioId)active.delete(b.id);
  const final=read();res.json(visible(final,group(final,g.id)));
 }));
 function comparison(s,g,query={}){
  const {base,d}=source(s,g),filter={};
  for(const key of ['demandIds','materialIds'])if(query[key]!==undefined){if(!Array.isArray(query[key])||query[key].some(x=>typeof x!=='string'))throw scError('FILTER','筛选须为明确编号数组；空数组为无结果',key);filter[key]=query[key];}
  if(query.includeBom){if(!Number.isSafeInteger(query.bomDay)||!filter.materialIds)throw scError('BOM_DATE','BOM显示需明确生效日及物料选择','bomDay');const ids=new Set(filter.materialIds);const visit=id=>{for(const b of rows(d,'物料清单').filter(b=>b['父项编号']===id&&Number(b['生效日'])<=query.bomDay&&query.bomDay<Number(b['失效日'])))if(!ids.has(b['子项编号'])){ids.add(b['子项编号']);visit(b['子项编号']);}};for(const id of [...ids])visit(id);filter.materialIds=[...ids];}
  const results=[{id:'baseline',name:'基准',runId:base.id,status:base.status,inputHash:base.inputHash,resultHash:base.resultHash,metrics:scenarioMetrics(d,base.result,base.result,g.definition,filter)}];
  for(const c of g.scenarios){const attempt=c.attempts.at(-1),r=s.runs.find(r=>r.id===attempt?.runId),current=attempt?.revision===c.revision&&attempt?.conditionsHash===hash(c.conditions);results.push({id:c.id,name:c.name,status:c.status,revision:c.revision,runId:r?.id||null,inputHash:r?.inputHash||null,resultHash:r?.resultHash||null,staleConditions:!!attempt&&!current,failure:r?.failure||attempt?.failure||null,metrics:r?.result&&current?scenarioMetrics(exactResult(r),r.result,base.result,g.definition,filter):null});}
  const unfiltered=rows(d,'每日需求').filter(r=>g.definition.demandIds.includes(r['需求编号']));
  return {groupId:g.id,revision:g.revision,token:stamp(g),baseIdentity:g.baseIdentity,definition:g.definition,definitionHash:hash(g.definition),stale:stale(s,g),filter,options:{demandIds:unfiltered.map(r=>r['需求编号']),materialIds:[...new Set(unfiltered.map(r=>r['成品编号']))]},results};
 }
 router.post('/scenario/groups/:id/query',permission('read'),handle((req,res)=>{const s=read();res.json(comparison(s,group(s,req.params.id),req.body));}));
 router.post('/scenario/groups/:id/export',permission('export'),handle((req,res)=>{const s=read(),g=group(s,req.params.id),result=comparison(s,g,req.body);res.type('application/json').attachment('多方案同口径对比-'+g.id+'.json').send(JSON.stringify({contract:SC_CONTRACT,...result,scenarios:g.scenarios,batches:g.batches,preference:g.preference},null,2));}));
 router.post('/scenario/groups/:id/definition',permission('edit'),handle((req,res)=>{
  const s=read(),g=group(s,req.params.id);expected(g,req.body.token);current(g);
  if(g.scenarios.some(c=>c.attempts.length))throw scError('DEFINITION_FROZEN','已有尝试的指标/费用定义不可覆盖，请明确另建比较组','definition',409);
  if(g.definition.timeUnit==='day'&&req.body.costs?.length)throw scError('COST','按天模型不记录实际加班小时，不能按小时费率推算费用','costs');
  if(!Array.isArray(req.body.costs))throw scError('COST','费用类别须为明确列表','costs');
  for(const r of req.body.costs)if(typeof r.enabled!=='boolean'||r.category!=='overtime'||!r.resource||typeof r.currency!=='string'||!r.currency.trim()||r.unit!=='元/小时'||typeof r.rate!=='number'||!Number.isFinite(r.rate)||r.rate<0||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.end<=r.start||typeof r.source!=='string'||!r.source.trim())throw scError('COST','费率须明确启用、类别/设备/币种/小时基准/有效期及来源，缺失不能填0','costs');
  g.definition.costs=structuredClone(req.body.costs);changed(s,g,req,'scenario_definition_saved');res.json(visible(s,g));
 }));
 router.post('/scenario/groups/:id/candidate',permission('edit'),handle((req,res)=>{
  const s=read(),g=group(s,req.params.id),c=scene(g,req.body.scenarioId),r=s.runs.find(r=>r.id===req.body.runId),a=c.attempts.find(a=>a.runId===r?.id);
  if(!a||a.revision!==c.revision||a.conditionsHash!==hash(c.conditions)||r.scenarioGroupId!==g.id)throw scError('CANDIDATE','候选与当前情景修订不一致','runId',409);
  if(r.candidateState==='adopted'&&req.body.action==='adopt')return res.json({idempotent:true,runId:r.id,state:'adopted'});
  expected(g,req.body.token);current(g);if(!['save','discard','adopt'].includes(req.body.action))throw scError('ACTION','请选择保存、放弃或显式采用','action');
  if(r.candidateState==='adopted'||r.candidateState==='discarded'&&req.body.action!=='discard')throw scError('STATE','已采用/放弃的候选不能覆盖状态','action',409);
  const input=exactResult(r);
  if(req.body.action==='adopt'){
   if(stale(s,g))throw scError('STALE','输入/P/事实或原计划修订已变化，旧组只读，须重建','group',409);
   const check=verifyWorkbookPlan(refreshDerived(cloneForParameters(input),r.selection.startDay),r.result);if(check.status!=='pass'||check.notChecked?.length)throw scError('CHECK','采用前全局独立检查未通过','verification');
   const original=source(s,g).plan,p=g.linkedPlanId?(s.urgentPlans||[]).find(p=>p.id===g.linkedPlanId):original;
   if(!p||p.headRunId!==g.baseRunId||g.linkedPlanId&&p.revision!==g.linkedPlanRevision)throw scError('PLAN_CHANGED','原确认计划已变化','plan',409);
   if(!g.linkedPlanId){s.urgentPlans??=[];s.urgentPlans.push(p);}
   appendWorkbookPlanVersion(p,r,input,{groupId:g.id,scenarioId:c.id,revision:c.revision,definitionHash:hash(g.definition),baseIdentity:g.baseIdentity});
   r.urgentPlanId=p.id;p.runs.push(r.id);g.adoptedPlanId=p.id;
  }
  r.candidateState=({save:'saved',discard:'discarded',adopt:'adopted'})[req.body.action];changed(s,g,req,'scenario_candidate_'+req.body.action);res.json({state:r.candidateState,runId:r.id,planId:g.adoptedPlanId||null,externalDispatch:false});
 }));
 return router;
}
