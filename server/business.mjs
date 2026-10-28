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
  const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;let legacy=[];try{legacy=JSON.parse(fs.readFileSync(path.join(dataDir,'plans.json'),'utf8'));}catch(old){if(old.code!=='ENOENT')throw old;}return {data:structuredClone(seed),revision:0,plans:legacy.map(p=>({...p,status:'legacy'})),records:[]};}};
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
    const allowed= action==='read' || (action==='export' ? m.role!=='query'||m.canExport===true : ['confirm','return','release'].includes(action) ? m.role==='supervisor' : ['planner','supervisor'].includes(m.role));
    if(!allowed){console.info(JSON.stringify({action,decision:'deny',requestId:req.praetorActor.requestId,actor:subjectKey(req.praetorActor)}));return res.status(403).json({error:'forbidden'});}
    if(req.method!=='GET'){
      const site=req.get('sec-fetch-site');const origin=req.get('origin');
      if((site&&!['same-origin','none'].includes(site))||(!site&&origin&&new URL(origin).host!==req.get('host')))return res.status(403).json({error:'csrf'});
      if(typeof req.body?.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>1000)return res.status(400).json({error:'reason_required'});
    }
    next();
  };
  const record=(s,req,action,target,details={})=>s.records.push({id:randomUUID(),action,target,actor:subjectKey(req.praetorActor),role:req.member.role,at:new Date().toISOString(),reason:req.body.reason.trim(),requestId:req.praetorActor.requestId,...details});
  router.get('/meta',permission('read'),(_req,res)=>res.json({release:'R1 prototype + FR-037 supported-flow slice',baseline:'APS v0.3 review draft',supportedRules:['BR-02 precedence','BR-03 exclusive machine overlap','FR-008 calendar','FR-007 personnel','FR-022 explicit joint occupancy'],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',unsupportedWorkflows:['confirm','return','release']}));
  router.get('/rules/capabilities',permission('read'),(_req,res)=>res.json(ruleCatalog));
  router.get('/session',permission('read'),(req,res)=>res.json({role:req.member.role,canWrite:['planner','supervisor'].includes(req.member.role),canExport:req.member.role!=='query'||req.member.canExport===true}));
  router.get('/state',permission('read'),(_req,res)=>{const s=read();res.json({data:s.data,revision:s.revision});});
  router.get('/operations',permission('read'),(_req,res)=>res.json(read().records));
  const versionId=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const preserve=s=>{s.inputVersions??={};const id=versionId(s.data);if(!s.inputVersions[id])s.inputVersions[id]={id,revision:s.revision,data:structuredClone(s.data)};return id;};
  const inputs=(s,p)=>{const v=s.inputVersions?.[p.inputVersionId];return v&&v.data&&versionId(v.data)===p.inputVersionId?v:null;};
  router.get('/plans',permission('read'),(_req,res)=>{const s=read();res.json(s.plans.map(p=>({...p,inputSnapshot:inputs(s,p)?.data??null})));});
  router.get('/plans/:id/inputs',permission('read'),(req,res)=>{const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});res.json(v);});
  function saveInputs(req,res,tables){
    const {revision,operation}=req.body;
    const s=read();if(revision!==s.revision)return res.status(409).json({error:'stale_input'});
    if(operation!==undefined&&!['import','edit','add','copy','delete','restore'].includes(operation))return res.status(400).json({error:'invalid_operation'});
    if(!tables||typeof tables!=='object'||Array.isArray(tables)||!Object.keys(tables).length)return res.status(400).json({error:'invalid_tables'});
    const proposed={...s.data};
    for(const [key,rows] of Object.entries(tables)){
      const def=defs.find(d=>d.key===key);if(!def)return res.status(404).json({error:'unknown_table'});
      if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_rows'});
      if(rows.some(r=>Object.keys(r).some(f=>!def.fields.includes(f))))return res.status(400).json({error:'unknown_fields'});
      proposed[key]=rows.map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));
    }
    const newlyEnabled=(proposed.rules||[]).some(r=>r['是否启用']==='是'&&!(s.data.rules||[]).some(old=>old['规则编号']===r['规则编号']&&old['是否启用']==='是'));
    const issues=[...validateInputs(defs,proposed),...(newlyEnabled?assessRules(proposed,new Date().toISOString(),true).issues:[])];if(issues.length)return res.status(400).json({error:'invalid_input',issues});
    // A missing original confirmed snapshot cannot be reconstructed from today's data.
    if(s.plans.some(p=>['confirmed','released'].includes(p.status)&&!inputs(s,p)))return res.status(409).json({error:'protected_history_unavailable'});
    const changes=Object.keys(tables).filter(key=>JSON.stringify(s.data[key])!==JSON.stringify(proposed[key]));
    if(!changes.length)return res.json({data:s.data,revision:s.revision,unchanged:true});
    const before=s.data;const fromVersion=preserve(s);
    s.data=proposed;s.revision++;const toVersion=preserve(s);
    const batchId=randomUUID();
    for(const key of changes)record(s,req,operation||'edit',key,{before:before[key],after:proposed[key],fromVersion,toVersion,batchId});
    write(s);res.json({data:s.data,revision:s.revision,inputVersionId:toVersion});
  }
  router.post('/tables/:table',permission('edit'),(req,res)=>saveInputs(req,res,{[req.params.table]:req.body.rows}));
  router.post('/inputs',permission('edit'),(req,res)=>saveInputs(req,res,req.body.tables));
  function prepare(req,res) {
    const s=read();if(req.body.revision!==s.revision){res.status(409).json({error:'stale_input'});return;}
    const calculatedAt=new Date().toISOString();let frozen;
    try{frozen=freezeRunInput(s.data,req.body.selection,calculatedAt);}catch(e){res.status(400).json({error:e.message});return;}
    const issues=[...validateInputs(defs,s.data),...assessRules(frozen.executionData,calculatedAt,true,frozen.conditions.mode).issues];
    if(issues.length){res.status(422).json({error:'rule_configuration_blocked',issues});return;}
    const run={id:randomUUID(),status:'queued',phase:'等待计算线程',createdAt:calculatedAt,revision:s.revision,inputVersionId:preserve(s),...frozen,actor:subjectKey(req.praetorActor),requestId:req.praetorActor.requestId,reason:req.body.reason.trim(),timeoutMs:runTimeoutMs};
    s.runs??=[];s.runs.unshift(run);return {s,run};
  }
  const publicRun=run=>{const {executionData,...summary}=run;return summary;};
  function makePlan(result,run){return {...result,id:randomUUID(),status:'draft',revision:run.revision,inputVersionId:run.inputVersionId,runId:run.id,conditions:run.conditions,snapshotHash:run.snapshotHash};}
  function finish(id,req,status,details={}){
    const s=read(),run=s.runs?.find(r=>r.id===id);if(!run||terminal.has(run.status))return;
    Object.assign(run,details,{status,finishedAt:new Date().toISOString(),phase:status==='completed'?'计算完成':status==='partial'?'计算完成，有未排或问题':status});
    if(details.result){const plan=makePlan(details.result,run);delete run.result;s.plans.unshift(plan);run.planId=plan.id;}
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
        }else if(message.kind==='result')finish(run.id,req,message.plan.findings.length?'partial':'completed',{result:message.plan});
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
      run.status=result.findings.length?'partial':'completed';run.phase='同步计算完成';run.finishedAt=new Date().toISOString();run.planId=plan.id;
      s.plans.unshift(plan);record(s,req,'calculate',plan.id,{runId:run.id,snapshotHash:run.snapshotHash});write(s);res.status(201).json(plan);
    }catch{
      run.status='failed';run.phase='同步计算失败';run.finishedAt=new Date().toISOString();run.failure={code:'calculation_error',message:'同步计算失败，未保存结果。'};
      record(s,req,'run_failed',run.id,{failure:run.failure});write(s);res.status(500).json({error:'calculation_error',runId:run.id});
    }
  });
  // The old arbitrary-snapshot POST is closed: only save a calculated server plan.
  router.post('/plans',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.body.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.status!=='draft')return res.status(409).json({error:'immutable_plan'});
    record(s,req,'edit',p.id,{kind:'save_snapshot'});write(s);res.status(201).json(p);
  });
  router.post('/plans/:id/verify',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.status!=='draft')return res.status(409).json({error:'immutable_plan'});
    if(p.revision!==s.revision)return res.status(409).json({error:'stale_input'});
    if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});
    const run=p.runId?s.runs?.find(r=>r.id===p.runId):null;
    if(p.runId&&(!run||run.snapshotHash!==p.snapshotHash||inputHash({conditions:run.conditions,executionData:run.executionData})!==p.snapshotHash||!inputs(s,p)))return res.status(409).json({error:'historical_inputs_unavailable'});
    const execution=run?.executionData;
    p.verification=independentlyVerifyPlan(p,execution?.orders??s.data.orders,execution?.routes??s.data.routes,p.rules);record(s,req,'edit',p.id,{kind:'verify'});write(s);res.json(p);
  });
  // FR-025/030 submission, conflict/partial/staleness confirmation and return
  // are not implemented in this slice. Never turn a client status into release.
  for(const action of ['confirm','return','release'])router.post(`/plans/:id/${action}`,permission(action),(_req,res)=>res.status(501).json({error:'workflow_not_supported',action}));
  router.post('/export',permission('export'),(req,res)=>{
    const s=read();let csv,target;
    if(req.body.query){
      const q=req.body.query;
      if(!q||typeof q!=='object'||typeof q.table!=='string'||(q.planId!==undefined&&typeof q.planId!=='string')||(q.filters!==undefined&&(q.filters===null||typeof q.filters!=='object'||Array.isArray(q.filters)||Object.values(q.filters).some(v=>typeof v!=='string'))))return res.status(400).json({error:'invalid_query'});
      if(q.revision!==s.revision)return res.status(409).json({error:'stale_input'});
      let source=s.data;
      if(q.sourcePlanId!==undefined){if(typeof q.sourcePlanId!=='string'||q.planId!==q.sourcePlanId)return res.status(400).json({error:'invalid_query'});const p=s.plans.find(p=>p.id===q.sourcePlanId);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});source=v.data;}
      try{csv=queryCsv(defs,source,s.plans,s.revision,q);}catch(e){if(['unknown_table','plan_not_found'].includes(e.message))return res.status(404).json({error:e.message});return res.status(500).json({error:'internal_error'});}target=q.table;
    }
    else if(req.body.planId){const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});if(req.body.ruleSettings===true){if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});const fields=['id','category','name','enabled','active','status','scope','effectiveFrom','parameters'];csv=[['运行编号',p.runId||'旧方案无记录'],['运行快照',p.snapshotHash||'旧方案无记录'],['计算条件',p.conditions?JSON.stringify(p.conditions):'旧方案无记录'],['能力版本',p.ruleSnapshot.capabilityVersion],['计算时刻',p.ruleSnapshot.at],['输入版本',p.inputVersionId],['始终执行',p.ruleSnapshot.intrinsicChecks.join('；')],['独立复核范围',p.ruleSnapshot.independentChecks.join('；')],['说明',p.ruleSnapshot.note],fields,...p.ruleSnapshot.settings.map(r=>fields.map(f=>typeof r[f]==='object'?JSON.stringify(r[f]):String(r[f])))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}else csv=exportSupplyPlanCsv(p);if(p.conditions){const scope=p.conditions.checkScope;csv=[['运行编号',p.runId],['运行快照',p.snapshotHash],['计算条件',JSON.stringify(p.conditions)],['检查范围',scope?JSON.stringify(scope):'旧方案无记录']].map(row=>row.map(v=>'\"'+String(v).replace(/\"/g,'\"\"')+'\"').join(',')).join('\r\n')+'\r\n'+csv;}target=p.id;}
    else{const d=defs.find(d=>d.key===req.body.table);if(!d)return res.status(404).json({error:'unknown_table'});csv=[d.fields,...(s.data[d.key]||[]).map(r=>d.fields.map(f=>r[f]||''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');target=d.key;}
    record(s,req,'export',target,req.body.query?{query:req.body.query}:{});write(s);res.type('text/csv').send('\ufeff'+csv);
  });
  router.use((_req,res)=>res.status(404).json({error:'unsupported_action'}));
  router.use((err,_req,res,_next)=>{console.error('business request failed',err.code||'internal_error');res.status(500).json({error:'internal_error'});});
  return router;
}
