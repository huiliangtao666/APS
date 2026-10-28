import {resourceLoad,loadCsv} from '../src/lib/resource-load.mjs';
import {validInterval} from '../src/lib/timetable.mjs';
import {reviewPlan,contentHash,validConfirmation} from './confirmation.mjs';
import {stageEvents} from '../src/lib/simulation-events.mjs';
import {executionState,executionTransition,executionAdmission,executionSummary,factTables,executionTrialIssues} from '../src/lib/execution-facts.mjs';
import {executionInventory} from '../src/lib/material-allocation.mjs';
import {queryInventoryAvailability} from '../src/lib/inventory.mjs';
import {comparePlans,restoreBlockers,conditionChanges} from '../src/lib/plan-comparison.mjs';
import {resultState,resultCsv} from '../src/lib/result-assessment.mjs';
import { Worker } from 'node:worker_threads';
import { freezeRunInput, inputHash } from './run-input.mjs';
import { assessRules, ruleCatalog } from '../src/lib/business-rules.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { validateInputs } from './input-validation.mjs';
import { queryCsv } from '../src/lib/data-query.mjs';
import { subjectKey } from './auth/store.mjs';
import { defs, seed, calculate } from './planner.ts';
import { exportSupplyPlanCsv } from '../src/lib/expected-supply.mjs';
import { independentlyVerifyPlan } from '../src/lib/independent-verification.mjs';

// One local application process; mutation + audit are one atomic rename.
// No request body can supply identity, audit fields, or plan status.
export function createBusinessRouter({ dataDir, actorMiddleware, requireMember, runTimeoutMs = 30000, workerFactory = workerData => new Worker(new URL('./calculation-worker.mjs',import.meta.url),{workerData}) }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file=path.join(dataDir,'business.json');
  const read=()=>{try{const s=JSON.parse(fs.readFileSync(file,'utf8'));s.data.simulationEvents??=[];s.data.executionFacts??=[];s.data.executionMaterials??=[];s.data.executionSources??=[];return s;}catch(e){if(e.code!=='ENOENT')throw e;let legacy=[];try{legacy=JSON.parse(fs.readFileSync(path.join(dataDir,'plans.json'),'utf8'));}catch(old){if(old.code!=='ENOENT')throw old;}return {data:structuredClone(seed),revision:0,plans:legacy.map(p=>({...p,status:'legacy'})),records:[]};}};
  const write=s=>{const tmp=`${file}.${randomUUID()}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}};
  const activeWorkers=new Map();
  const terminal=new Set(['completed','partial','cancelled','timed_out','failed']);
  // A new process cannot resume a lost thread. Preserve the snapshot and explain it.
  const recovered=read();let changed=false;
  for(const run of recovered.runs||[])if(!terminal.has(run.status)){
    run.status='failed';run.finishedAt=new Date().toISOString();run.failure={code:'process_interrupted',message:'应用进程中断，原运行未恢复；可使用新运行重新计算。'};run.phase='已中断';
    recovered.records.push({id:randomUUID(),action:'run_failed',target:run.id,actor:'system',role:'system',at:run.finishedAt,reason:run.failure.message,requestId:run.requestId});changed=true;
  }
  if(changed)write(recovered);
  const router=Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.use(actorMiddleware,requireMember(['planner','supervisor','query']));
  const permission=(action)=> (req,res,next)=>{
    const m=req.member;
    const allowed= action==='read' || (action==='export' ? m.role!=='query'||m.canExport===true : ['confirm','return','release','archive'].includes(action) ? m.role==='supervisor' : ['planner','supervisor'].includes(m.role));
    if(!allowed){console.info(JSON.stringify({action,decision:'deny',requestId:req.praetorActor.requestId,actor:subjectKey(req.praetorActor)}));return res.status(403).json({error:'forbidden'});}
    if(req.method!=='GET'){
      const site=req.get('sec-fetch-site');const origin=req.get('origin');
      let badOrigin=false;try{if(origin){const parsed=new URL(origin);badOrigin=!['http:','https:'].includes(parsed.protocol)||parsed.host!==req.get('host');}}catch{badOrigin=true;}
      if((site&&!['same-origin','none'].includes(site))||badOrigin)return res.status(403).json({error:'csrf'});
      if(typeof req.body?.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>1000)return res.status(400).json({error:'reason_required'});
    }
    next();
  };
  const record=(s,req,action,target,details={})=>s.records.push({id:randomUUID(),action,target,actor:subjectKey(req.praetorActor),role:req.member.role,at:new Date().toISOString(),reason:req.body.reason.trim(),requestId:req.praetorActor.requestId,...details});
  router.get('/meta',permission('read'),(_req,res)=>res.json({release:'R1 prototype + FR-037 supported-flow slice',baseline:'APS v0.3 review draft',supportedRules:['BR-02 precedence','BR-03 exclusive machine overlap','FR-008 calendar','FR-007 personnel','FR-022 explicit joint occupancy'],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',unsupportedWorkflows:['external-dispatch','historical-restore'],confirmation:'FR030-v1 internal only'}));
  router.get('/rules/capabilities',permission('read'),(_req,res)=>res.json(ruleCatalog));
  router.get('/session',permission('read'),(req,res)=>res.json({role:req.member.role,canWrite:['planner','supervisor'].includes(req.member.role),canExport:req.member.role!=='query'||req.member.canExport===true}));
  router.get('/state',permission('read'),(_req,res)=>{const s=read();res.json({data:s.data,revision:s.revision});});
  router.get('/operations',permission('read'),(_req,res)=>res.json(read().records));
  const versionId=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const preserve=(s,target=s)=>{s.inputVersions??={};const id=versionId(target.data);if(!s.inputVersions[id])s.inputVersions[id]={id,revision:target.revision,data:structuredClone(target.data)};return id;};
  const inputs=(s,p)=>{const v=s.inputVersions?.[p.inputVersionId];return v&&v.data&&versionId(v.data)===p.inputVersionId?v:null;};
  router.get('/plans',permission('read'),(_req,res)=>{const s=read();res.json(s.plans.map(p=>({...p,inputSnapshot:inputs(s,p)?.data??null})));});
  router.get('/plans/:id/inputs',permission('read'),(req,res)=>{const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});res.json(v);});
  router.get('/execution',permission('read'),(_req,res)=>{const s=read();const history=s.records.filter(r=>!r.trialId&&factTables.includes(r.target));res.json({...executionSummary(s.data),version:inputHash(executionState(s.data)),revision:s.revision,history,inventory:queryInventoryAvailability(executionInventory(s.data),{rules:s.data.rules}).map(row=>({...row,'扣耗后余额':row['账面数量'],'扣耗前账面数量':s.data.inventory.find(b=>b['批次编号']===row['批次编号'])?.['账面数量'],'说明':'模拟账面减累计耗料，再减独立占用；不是真实库存'}))});});
  function saveInputs(req,res,tables,trialId){
    const {revision,operation}=req.body;
    const s=read(),target=trialId?s.trials?.find(t=>t.id===trialId):s;
    if(!target)return res.status(404).json({error:'trial_not_found'});
    if(target.status==='discarded')return res.status(409).json({error:'trial_discarded'});
    if(revision!==target.revision)return res.status(409).json({error:'stale_input'});
    if(operation!==undefined&&!['import','edit','add','copy','delete','restore'].includes(operation))return res.status(400).json({error:'invalid_operation'});
    if(!tables||typeof tables!=='object'||Array.isArray(tables)||!Object.keys(tables).length)return res.status(400).json({error:'invalid_tables'});
    let proposed=structuredClone(target.data);
    for(const [key,rows] of Object.entries(tables)){
      const def=defs.find(d=>d.key===key);if(!def)return res.status(404).json({error:'unknown_table'});
      if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_rows'});
      if(rows.some(r=>Object.keys(r).some(f=>!def.fields.includes(f))))return res.status(400).json({error:'unknown_fields'});
      proposed[key]=rows.map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));
    }
    if(trialId&&factTables.some(k=>tables[k]!==undefined))return res.status(409).json({error:'trial_execution_edit_forbidden'});
    if(!trialId){const staged=stageEvents(target.data,proposed,Object.keys(tables));if(staged.issues.length)return res.status(409).json({error:'event_reconciliation_required',issues:staged.issues});proposed=staged.data;for(const def of defs.filter(d=>JSON.stringify(proposed[d.key])!==JSON.stringify(target.data[d.key]))){const rows=proposed[def.key]||[];if(rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!def.fields.includes(k))||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_event_effect'});proposed[def.key]=rows.map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));}}
    const transition=(trialId?executionTrialIssues(s.data,proposed):executionTransition(target.data,proposed));if(transition.length)return res.status(409).json({error:'execution_reconciliation_required',issues:transition});
    const newlyEnabled=(proposed.rules||[]).some(r=>r['是否启用']==='是'&&!(target.data.rules||[]).some(old=>old['规则编号']===r['规则编号']&&old['是否启用']==='是'));
    const issues=[...validateInputs(defs,proposed),...(newlyEnabled?assessRules(proposed,new Date().toISOString(),true).issues:[])];if(issues.length)return res.status(400).json({error:'invalid_input',issues});
    if(operation==='restore')return res.status(409).json({error:'restore_blocked',...restoreBlockers(s,null)});
    // A missing original confirmed snapshot cannot be reconstructed from today's data.
    if(s.plans.some(p=>['confirmed','released','archived'].includes(p.status)&&!inputs(s,p)))return res.status(409).json({error:'protected_history_unavailable'});
    const changes=defs.map(d=>d.key).filter(key=>JSON.stringify(target.data[key])!==JSON.stringify(proposed[key]));
    if(!changes.length)return res.json({data:target.data,revision:target.revision,unchanged:true});
    const before=target.data;const fromVersion=preserve(s,target);
    target.data=proposed;target.revision++;const toVersion=preserve(s,target);
    const batchId=randomUUID();
    for(const key of changes)record(s,req,operation||'edit',key,{before:before[key],after:proposed[key],fromVersion,toVersion,batchId,trialId:trialId||null});
    write(s);res.json({data:target.data,revision:target.revision,inputVersionId:toVersion});
  }
  router.post('/tables/:table',permission('edit'),(req,res)=>saveInputs(req,res,{[req.params.table]:req.body.rows}));
  router.post('/inputs',permission('edit'),(req,res)=>saveInputs(req,res,req.body.tables));
  router.get('/trials',permission('read'),(_req,res)=>res.json(read().trials||[]));
  router.post('/trials/:id/inputs',permission('edit'),(req,res)=>saveInputs(req,res,req.body.tables,req.params.id));
  function historical(s,p){
    const run=s.runs?.find(r=>r.id===p.runId);
    return inputs(s,p)&&run&&run.inputVersionId===p.inputVersionId&&run.snapshotHash===p.snapshotHash&&inputHash({conditions:run.conditions,executionData:run.executionData})===p.snapshotHash?run:null;
  }
  router.post('/plans/:id/copy',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.trialId&&s.trials?.find(t=>t.id===p.trialId)?.status==='discarded')return res.status(409).json({error:'trial_discarded'});
    if(!historical(s,p))return res.status(409).json({error:'historical_inputs_unavailable'});
    const id=randomUUID(),now=new Date().toISOString();
    const copy={...structuredClone(p),id:randomUUID(),status:'draft',revision:0,sourceRevision:p.revision,trialId:id,sourcePlanId:p.id,sourceRunId:p.runId,sourceCreatedAt:p.createdAt,sourceVerification:p.verification??null,createdAt:now,name:p.name+' · 独立试算',copiedResult:true};
    delete copy.verification;
    const trial={id,status:'active',revision:0,createdAt:now,actor:subjectKey(req.praetorActor),sourcePlanId:p.id,sourceRunId:p.runId,sourceInputVersionId:p.inputVersionId,sourceSnapshotHash:p.snapshotHash,basePlanId:copy.id,latestPlanId:copy.id,data:structuredClone(inputs(s,p).data),selection:Object.fromEntries(['mode','orderIds','startMinute','endMinute','priority','enabledRuleIds'].map(k=>[k,structuredClone(p.conditions[k])]))};
    s.trials??=[];s.trials.unshift(trial);s.plans.unshift(copy);record(s,req,'trial_created',id,{sourcePlanId:p.id,planId:copy.id,inputVersionId:p.inputVersionId,snapshotHash:p.snapshotHash});write(s);res.status(201).json(trial);
  });
  router.get('/trials/:id/changes',permission('read'),(req,res)=>{
    const s=read(),trial=s.trials?.find(t=>t.id===req.params.id),source=s.plans.find(p=>p.id===trial?.sourcePlanId);
    if(!trial)return res.status(404).json({error:'trial_not_found'});
    if(!source||!historical(s,source))return res.status(409).json({error:'historical_inputs_unavailable'});
    res.json({trialId:trial.id,revision:trial.revision,sourcePlanId:source.id,sourceRunId:source.runId,sourceInputVersionId:source.inputVersionId,sourceSnapshotHash:source.snapshotHash,currentInputHash:inputHash(trial.data),changedConditions:conditionChanges(inputs(s,source).data,trial.data),scope:'模拟输入；尚不代表已重算，检查范围以保存运行结果为准'});
  });
  router.post('/trials/:id/retain',permission('edit'),(req,res)=>{
    const s=read(),trial=s.trials?.find(t=>t.id===req.params.id);
    if(!trial)return res.status(404).json({error:'trial_not_found'});
    if(trial.status==='discarded')return res.status(409).json({error:'trial_discarded'});
    if(req.body.revision!==trial.revision)return res.status(409).json({error:'stale_input'});
    const plan=s.plans.find(p=>p.id===req.body.planId),source=s.plans.find(p=>p.id===trial.sourcePlanId);
    if(!plan||plan.trialId!==trial.id||plan.id!==trial.latestPlanId||plan.revision!==trial.revision||plan.copiedResult||plan.inputVersionId!==versionId(trial.data))return res.status(409).json({error:'recalculated_current_trial_required'});
    if(!source||!historical(s,source)||!historical(s,plan))return res.status(409).json({error:'historical_inputs_unavailable'});
    const comparison=comparePlans(source,inputs(s,source).data,plan,inputs(s,plan).data);
    if(inputHash(executionState(trial.data))!==inputHash(executionState(s.data)))return res.status(409).json({error:'current_execution_changed'});
    const protectedIssues=executionTrialIssues(s.data,trial.data);if(protectedIssues.length)return res.status(409).json({error:'execution_reconciliation_required',issues:protectedIssues});
    const retained={id:randomUUID(),planId:plan.id,runId:plan.runId,inputVersionId:plan.inputVersionId,snapshotHash:plan.snapshotHash,trialRevision:trial.revision,at:new Date().toISOString(),actor:subjectKey(req.praetorActor),comparison};
    trial.retainedSnapshots??=[];trial.retainedSnapshots.push(retained);
    record(s,req,'trial_retained',trial.id,{retainedId:retained.id,planId:plan.id,runId:plan.runId,inputVersionId:plan.inputVersionId,snapshotHash:plan.snapshotHash,sourcePlanId:source.id});write(s);
    res.status(201).json(retained);
  });
  router.post('/trials/:id/discard',permission('edit'),async(req,res,next)=>{try{
    let s=read(),trial=s.trials?.find(t=>t.id===req.params.id);if(!trial)return res.status(404).json({error:'trial_not_found'});
    if(req.body.revision!==trial.revision)return res.status(409).json({error:'stale_input'});
    if(trial.status==='discarded')return res.json(trial);
    const pending=(s.runs||[]).filter(run=>run.trialId===trial.id&&!terminal.has(run.status)).map(run=>run.id);
    // Commit the gate before awaiting termination, so concurrent requests cannot
    // start or edit this trial while a worker is shutting down.
    trial.status='discarded';trial.discardedAt=new Date().toISOString();trial.revision++;
    record(s,req,'trial_discarded',trial.id,{sourcePlanId:trial.sourcePlanId});write(s);
    for(const id of pending)await finish(id,req,'cancelled',{failure:{code:'trial_discarded',message:'试算已放弃，保留此前历史结果。'}});
    res.json(trial);
  }catch(e){next(e);}});
  router.get('/plans/:id/compare/:other',permission('read'),(req,res)=>{
    const s=read(),a=s.plans.find(p=>p.id===req.params.id),b=s.plans.find(p=>p.id===req.params.other);
    if(!a||!b)return res.status(404).json({error:'plan_not_found'});
    if(!historical(s,a)||!historical(s,b))return res.status(409).json({error:'historical_inputs_unavailable'});
    res.json(comparePlans(a,inputs(s,a).data,b,inputs(s,b).data));
  });
  router.post('/plans/:id/restore',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(req.body.revision!==s.revision)return res.status(409).json({error:'stale_input'});
    // Facts are versioned; historical replacement still requires FR031 and a real confirmation contract.
    // Even an unchanged input hash cannot prove that no execution has occurred.
    res.status(409).json({error:'restore_blocked',...restoreBlockers(s,p),historicalInputsAvailable:!!historical(s,p)});
  });
  function prepare(req,res) {
    if(req.body.trialId!==undefined&&(typeof req.body.trialId!=='string'||!req.body.trialId)){res.status(400).json({error:'invalid_trial'});return;}
    const s=read(),trial=req.body.trialId?s.trials?.find(t=>t.id===req.body.trialId):null;
    if(req.body.trialId&&!trial){res.status(404).json({error:'trial_not_found'});return;}
    if(trial?.status==='discarded'){res.status(409).json({error:'trial_discarded'});return;}
    const target=trial||s;
    if(req.body.revision!==target.revision){res.status(409).json({error:'stale_input'});return;}
    if(trial&&inputHash(executionState(trial.data))!==inputHash(executionState(s.data))){res.status(409).json({error:'current_execution_changed',message:'试算执行事实已落后当前版本；保留旧记录，请从当前事实新算再复制'});return;}
    if(trial){const reconciliation=executionTrialIssues(s.data,trial.data);if(reconciliation.length){res.status(409).json({error:'execution_reconciliation_required',issues:reconciliation});return;}}
    const calculatedAt=new Date().toISOString();let frozen;
    try{frozen=freezeRunInput(target.data,req.body.selection??trial?.selection,calculatedAt);}catch(e){res.status(400).json({error:e.message});return;}
    const issues=[...validateInputs(defs,target.data),...executionAdmission(frozen.executionData,frozen.conditions),...assessRules(frozen.executionData,calculatedAt,true,frozen.conditions.mode).issues];
    if(issues.length){res.status(422).json({error:'rule_configuration_blocked',issues});return;}
    const run={id:randomUUID(),status:'queued',phase:'等待计算线程',createdAt:calculatedAt,revision:target.revision,trialId:trial?.id||null,sourcePlanId:trial?.sourcePlanId||null,inputVersionId:preserve(s,target),...frozen,actor:subjectKey(req.praetorActor),requestId:req.praetorActor.requestId,reason:req.body.reason.trim(),timeoutMs:runTimeoutMs};
    s.runs??=[];s.runs.unshift(run);return {s,run};
  }
  const publicRun=run=>{const {executionData,...summary}=run;const plan=run.planId?read().plans.find(p=>p.id===run.planId):null;return {...summary,resultState:resultState(run,plan?.resultAssessment)};};
  function makePlan(result,run){return {...result,trialId:run.trialId,sourcePlanId:run.sourcePlanId,id:randomUUID(),status:'draft',revision:run.revision,inputVersionId:run.inputVersionId,runId:run.id,conditions:run.conditions,snapshotHash:run.snapshotHash};}
  function finish(id,req,status,details={}){
    const s=read(),run=s.runs?.find(r=>r.id===id);if(!run||terminal.has(run.status))return;
    Object.assign(run,details,{status,finishedAt:new Date().toISOString(),phase:status==='completed'?'计算完成':status==='partial'?'计算完成，有未排或问题':status});
    if(details.result){const plan=makePlan(details.result,run);delete run.result;s.plans.unshift(plan);run.planId=plan.id;if(run.trialId){const trial=s.trials.find(t=>t.id===run.trialId);if(trial.status==='active'&&trial.revision===run.revision)trial.latestPlanId=plan.id;}}
    record(s,req,'run_'+status,id,{inputVersionId:run.inputVersionId,snapshotHash:run.snapshotHash,failure:run.failure,planId:run.planId});write(s);
    const job=activeWorkers.get(id);if(job){clearTimeout(job.timer);activeWorkers.delete(id);return job.worker.terminate();}
  }
  router.get('/runs',permission('read'),(_req,res)=>res.json((read().runs||[]).map(publicRun)));
  router.get('/runs/:id',permission('read'),(req,res)=>{const run=read().runs?.find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:'run_not_found'});res.json(publicRun(run));});
  router.get('/runs/:id/inputs',permission('read'),(req,res)=>{
    const s=read(),run=s.runs?.find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:'run_not_found'});
    const original=s.inputVersions?.[run.inputVersionId];
    if(!original||inputHash(original.data)!==run.inputVersionId||inputHash({conditions:run.conditions,executionData:run.executionData})!==run.snapshotHash)return res.status(409).json({error:'historical_inputs_unavailable'});
    res.json({runId:run.id,inputVersionId:run.inputVersionId,snapshotHash:run.snapshotHash,originalInput:original.data,executionData:run.executionData,conditions:run.conditions});
  });
  router.post('/runs',permission('calculate'),(req,res)=>{
    if(activeWorkers.size>=2)return res.status(429).json({error:'run_capacity',message:'最多同时计算两次，请稍后另开计算。'});
    const prepared=prepare(req,res);if(!prepared)return;const {s,run}=prepared;
    record(s,req,'run_created',run.id,{inputVersionId:run.inputVersionId,snapshotHash:run.snapshotHash,conditions:run.conditions});write(s);
    try{
      const worker=workerFactory({executionData:run.executionData,revision:run.revision,conditions:run.conditions,calculatedAt:run.createdAt});
      const timer=setTimeout(()=>finish(run.id,req,'timed_out',{failure:{code:'time_limit',message:'达到计算时限；超时不代表无可行排法，可另开计算。'}}),runTimeoutMs);
      activeWorkers.set(run.id,{worker,timer});
      worker.on('message',message=>{
        if(message.kind==='progress'){
          const current=read(),r=current.runs?.find(r=>r.id===run.id);if(!r||terminal.has(r.status))return;
          r.status='running';r.phase='计算中';r.startedAt=new Date().toISOString();record(current,req,'run_started',r.id,{snapshotHash:r.snapshotHash});write(current);
        }else if(message.kind==='result')finish(run.id,req,message.plan.resultAssessment?.status==='partial-unplanned'||message.plan.findings.length?'partial':'completed',{result:message.plan});
        else if(message.kind==='failure')finish(run.id,req,'failed',{failure:{code:message.code,message:message.message}});
      });
      worker.on('error',()=>finish(run.id,req,'failed',{failure:{code:'worker_error',message:'计算线程失败，未保存结果；可另开计算。'}}));
      worker.on('exit',()=>finish(run.id,req,'failed',{failure:{code:'worker_exit',message:'计算线程在返回结果前退出；可另开计算。'}}));
    }catch{finish(run.id,req,'failed',{failure:{code:'worker_start',message:'无法启动计算线程；可另开计算。'}});}
    res.status(202).json(publicRun(read().runs.find(r=>r.id===run.id)));
  });
  router.post('/runs/:id/cancel',permission('calculate'),async(req,res,next)=>{try{
    const run=read().runs?.find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:'run_not_found'});
    if(terminal.has(run.status))return res.status(409).json({error:'run_finished',status:run.status});
    await finish(run.id,req,'cancelled',{failure:{code:'user_cancelled',message:'用户取消，计算线程已终止；未保存结果。'}});
    res.json(publicRun(read().runs.find(r=>r.id===run.id)));
  }catch(e){next(e);}});
  // Compatibility: this route computes synchronously and reports only a terminal
  // state. It never advertises cancellability or pretends to be a long task.
  router.post('/calculate',permission('calculate'),(req,res)=>{
    const prepared=prepare(req,res);if(!prepared)return;const {s,run}=prepared;
    try{
      const result=calculate(run.executionData,run.revision,run.createdAt,run.conditions),plan=makePlan(result,run);
      run.status=result.resultAssessment?.status==='partial-unplanned'||result.findings.length?'partial':'completed';run.phase='同步计算完成';run.finishedAt=new Date().toISOString();run.planId=plan.id;
      s.plans.unshift(plan);if(run.trialId){const trial=s.trials.find(t=>t.id===run.trialId);trial.latestPlanId=plan.id;}record(s,req,'calculate',plan.id,{runId:run.id,snapshotHash:run.snapshotHash});write(s);res.status(201).json(plan);
    }catch{
      run.status='failed';run.phase='同步计算失败';run.finishedAt=new Date().toISOString();run.failure={code:'calculation_error',message:'同步计算失败，未保存结果。'};
      record(s,req,'run_failed',run.id,{failure:run.failure});write(s);res.status(500).json({error:'calculation_error',runId:run.id});
    }
  });
  // The old arbitrary-snapshot POST is closed: only save a calculated server plan.
  router.post('/plans',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.body.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.status!=='draft')return res.status(409).json({error:'immutable_plan'});
    if(p.trialId&&s.trials?.find(t=>t.id===p.trialId)?.status==='discarded')return res.status(409).json({error:'trial_discarded'});
    record(s,req,'edit',p.id,{kind:'save_snapshot'});write(s);res.status(201).json(p);
  });
  router.post('/plans/:id/verify',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.status!=='draft')return res.status(409).json({error:'immutable_plan'});
    if(p.trialId&&s.trials?.find(t=>t.id===p.trialId)?.status==='discarded')return res.status(409).json({error:'trial_discarded'});
    if(p.revision!==(p.trialId?s.trials?.find(t=>t.id===p.trialId)?.revision:s.revision))return res.status(409).json({error:'stale_input'});
    if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});
    const run=p.runId?s.runs?.find(r=>r.id===p.runId):null;
    if(p.runId&&(!run||run.snapshotHash!==p.snapshotHash||inputHash({conditions:run.conditions,executionData:run.executionData})!==p.snapshotHash||!inputs(s,p)))return res.status(409).json({error:'historical_inputs_unavailable'});
    const execution=run?.executionData;
    p.verification={...independentlyVerifyPlan(p,execution?.orders??s.data.orders,execution?.routes??s.data.routes,p.rules),contentHash:contentHash(p)};record(s,req,'edit',p.id,{kind:'verify'});write(s);res.json(p);
  });
  router.get('/plans/:id/review',permission('read'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    const confirmation=s.confirmations?.find(c=>c.planId===p.id)||null;
    if(confirmation&&!validConfirmation(confirmation))return res.status(409).json({error:'protected_history_unavailable'});
    res.json({...reviewPlan(s,p),workflow:s.workflows?.[p.id]||{revision:0,state:p.status,events:[]},confirmation});
  });
  router.get('/confirmations',permission('read'),(_req,res)=>{
    const confirmations=read().confirmations||[];
    if(!confirmations.every(validConfirmation))return res.status(409).json({error:'protected_history_unavailable'});
    res.json(confirmations);
  });
  router.get('/confirmations/:id',permission('read'),(req,res)=>{
    const c=read().confirmations?.find(c=>c.id===req.params.id);if(!c)return res.status(404).json({error:'confirmation_not_found'});
    if(!validConfirmation(c))return res.status(409).json({error:'protected_history_unavailable'});res.json(c);
  });
  for(const action of ['submit','confirm','return','release','archive'])router.post(`/plans/:id/${action}`,permission(action),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    const w=s.workflows?.[p.id]||{revision:0,state:p.status,events:[]};
    if(req.body.revision!==s.revision||req.body.workflowRevision!==w.revision)return res.status(409).json({error:'stale_input'});
    const allowed={submit:['draft','returned'],confirm:['submitted'],return:['submitted'],release:['confirmed'],archive:['confirmed','released']};
    if(!allowed[action].includes(w.state))return res.status(409).json({error:'invalid_transition'});
    const review=reviewPlan(s,p);
    if(req.body.reviewHash!==review.reviewHash)return res.status(409).json({error:'stale_review',message:'复核内容已变化，请刷新后重新核对'});
    if(['submit','confirm','release'].includes(action)&&review.blockers.length)return res.status(409).json({error:'confirmation_blocked',blockers:review.blockers});
    if(['confirm','return'].includes(action)&&req.body.submissionId!==w.submission?.id)return res.status(409).json({error:'stale_submission'});
    if(['confirm','release'].includes(action)&&(!w.submission||w.submission.contentHash!==contentHash(p)||w.submission.inputVersionId!==p.inputVersionId))return res.status(409).json({error:'resubmission_required'});
    if(['submit','confirm'].includes(action)){
      const expected=review.unplanned.map(t=>t.id).sort();const ids=req.body.unplannedIds;
      if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||inputHash([...ids].sort())!==inputHash(expected)||expected.length&&req.body.acceptPartial!==true)return res.status(400).json({error:'explicit_unplanned_required'});
      if(review.conditionalSupply.length&&req.body.acceptConditionalSupply!==true)return res.status(400).json({error:'conditional_supply_ack_required'});
      if(req.body.acknowledgeScope!==true)return res.status(400).json({error:'check_scope_ack_required'});
    }
    const at=new Date().toISOString(),actor=subjectKey(req.praetorActor);
    const event={id:randomUUID(),action,at,actor,role:req.member.role,reason:req.body.reason.trim(),requestId:req.praetorActor.requestId,reviewHash:review.reviewHash,contentHash:contentHash(p)};
    if(action==='submit'){
      if(!p.verification||p.verification.contentHash!==contentHash(p))return res.status(409).json({error:'verification_required'});
      w.submission={...event,id:randomUUID(),inputVersionId:p.inputVersionId,contentHash:contentHash(p),review};
      w.submissions??=[];w.submissions.push(structuredClone(w.submission));
      w.state='submitted';p.status='submitted';
    }else if(action==='return'){w.state='returned';p.status='draft';}
    else if(action==='confirm'){
      p.status='confirmed';w.state='confirmed';
      const snapshot=structuredClone({plan:p,originalInput:inputs(s,p).data,run:s.runs.find(r=>r.id===p.runId),submission:w.submission,review,decision:event});
      const c={id:randomUUID(),planId:p.id,createdAt:at,actor,snapshot,snapshotHash:inputHash(snapshot)};
      s.confirmations??=[];s.confirmations.push(c);w.confirmationId=c.id;
    }else{
      const c=s.confirmations?.find(c=>c.id===w.confirmationId);
      if(!validConfirmation(c)||contentHash(c.snapshot.plan)!==contentHash(p))return res.status(409).json({error:'protected_history_unavailable'});
      // Release/archive metadata is separate: confirmed plan bytes never change.
      w.state=action==='release'?'released':'archived';
    }
    event.submissionId=w.submission?.id;w.events.push(event);w.revision++;s.workflows??={};s.workflows[p.id]=w;
    record(s,req,action,p.id,{workflowRevision:w.revision,submissionId:w.submission?.id,confirmationId:w.confirmationId,reviewHash:review.reviewHash,inputVersionId:p.inputVersionId,snapshotHash:p.snapshotHash});write(s);res.json({plan:p,workflow:w});
  });
  router.post('/export',permission('export'),(req,res)=>{
    const s=read();let csv,target;
    if(req.body.confirmationId){
      const c=s.confirmations?.find(c=>c.id===req.body.confirmationId);if(!c)return res.status(404).json({error:'confirmation_not_found'});
      if(!validConfirmation(c))return res.status(409).json({error:'protected_history_unavailable'});
      record(s,req,'export',c.planId,{confirmationId:c.id,snapshotHash:c.snapshotHash});write(s);return res.type('application/json').send(JSON.stringify({...c,workflow:s.workflows?.[c.planId]},null,2));
    }
    if(req.body.resourceLoad){
      const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});
      const w=req.body.resourceLoad;
      if(!validInterval(w.start,w.end)||!['all','machines','resources','materials','alerts'].includes(w.kind))return res.status(400).json({error:'invalid_load_view'});
      csv=loadCsv(resourceLoad({...p,inputSnapshot:inputs(s,p)?.data??null},w),w.kind);target=p.id;
    }
    else if(req.body.runId){
      const run=s.runs?.find(r=>r.id===req.body.runId);if(!run)return res.status(404).json({error:'run_not_found'});
      const plan=s.plans.find(p=>p.id===run.planId);csv=resultCsv(run,plan);target=run.id;
    }
    else if(req.body.query){
      const q=req.body.query;
      if(!q||typeof q!=='object'||typeof q.table!=='string'||(q.planId!==undefined&&typeof q.planId!=='string')||(q.filters!==undefined&&(q.filters===null||typeof q.filters!=='object'||Array.isArray(q.filters)||Object.values(q.filters).some(v=>typeof v!=='string'))))return res.status(400).json({error:'invalid_query'});
      if(q.revision!==s.revision)return res.status(409).json({error:'stale_input'});
      let source=s.data;
      if(q.sourcePlanId!==undefined){if(typeof q.sourcePlanId!=='string'||q.planId!==q.sourcePlanId)return res.status(400).json({error:'invalid_query'});const p=s.plans.find(p=>p.id===q.sourcePlanId);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});source=v.data;}
      try{csv=queryCsv(defs,source,s.plans,s.revision,q);}catch(e){if(['unknown_table','plan_not_found'].includes(e.message))return res.status(404).json({error:e.message});return res.status(500).json({error:'internal_error'});}target=q.table;
    }
    else if(req.body.planId){const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});if(req.body.ruleSettings===true){if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});const fields=['id','category','name','enabled','active','status','scope','effectiveFrom','parameters'];csv=[['运行编号',p.runId||'旧方案无记录'],['运行快照',p.snapshotHash||'旧方案无记录'],['计算条件',p.conditions?JSON.stringify(p.conditions):'旧方案无记录'],['能力版本',p.ruleSnapshot.capabilityVersion],['计算时刻',p.ruleSnapshot.at],['输入版本',p.inputVersionId],['始终执行',p.ruleSnapshot.intrinsicChecks.join('；')],['独立复核范围',p.ruleSnapshot.independentChecks.join('；')],['说明',p.ruleSnapshot.note],fields,...p.ruleSnapshot.settings.map(r=>fields.map(f=>typeof r[f]==='object'?JSON.stringify(r[f]):String(r[f])))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}else csv=exportSupplyPlanCsv(p)+'\r\n'+resultCsv(s.runs?.find(r=>r.id===p.runId),p);if(p.conditions){const scope=p.conditions.checkScope;csv=[['运行编号',p.runId],['运行快照',p.snapshotHash],['计算条件',JSON.stringify(p.conditions)],['检查范围',scope?JSON.stringify(scope):'旧方案无记录']].map(row=>row.map(v=>'\"'+String(v).replace(/\"/g,'\"\"')+'\"').join(',')).join('\r\n')+'\r\n'+csv;}target=p.id;}
    else{const d=defs.find(d=>d.key===req.body.table);if(!d)return res.status(404).json({error:'unknown_table'});csv=[d.fields,...(s.data[d.key]||[]).map(r=>d.fields.map(f=>r[f]||''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');target=d.key;}
    record(s,req,'export',target,req.body.query?{query:req.body.query}:req.body.resourceLoad?{resourceLoad:req.body.resourceLoad}:{});write(s);res.type('text/csv').send('\ufeff'+csv);
  });
  router.use((_req,res)=>res.status(404).json({error:'unsupported_action'}));
  router.use((err,_req,res,_next)=>{console.error('business request failed',err.code||'internal_error');res.status(500).json({error:'internal_error'});});
  return router;
}
