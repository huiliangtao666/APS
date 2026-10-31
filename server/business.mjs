import {bomApplication,saveBomApplication} from './workbook-bom-application.mjs';
import {createWorkbookRouter} from './workbook-router.mjs';
import {packTransition} from '../src/lib/pack-batch.mjs';
import {stageMappingTransition} from '../src/lib/stage-bindings.mjs';
import {createR21ConfigRouter} from './r21-config.mjs';
import {isTrustedWrite} from './write-request.mjs';
import {partialR21Seed,r21DeviceUsage} from '../src/lib/r21-stage-config.mjs';
import {unmappedStageSources} from '../src/lib/original-stage-data.mjs';
import {checkedCsvSources,csvProblemEvidence} from './csv-problems.mjs';
import {resourceMappingTransition,sameResourceMapping} from '../src/lib/resource-mapping.mjs';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
import {poolTransitionIssues} from '../src/lib/physical-pools.mjs';
import {validateMasterData} from '../src/lib/master-data.mjs';
import {validateOrders} from '../src/lib/orders.mjs';
import {validateSingleLineScope} from '../src/lib/line-scope.mjs';
import {attachProblemRecords,bindProblemSource} from '../src/lib/problem-records.mjs';
import {inspectSingleCsv} from './csv-single.mjs';
import {configurationPreview} from '../src/lib/configuration-preview.mjs';
import {migratePolicies} from '../src/lib/resource-policies.mjs';
import {inspectCsvBatch,batchKeys} from './csv-batch.mjs';
import {adaptOriginalDependencies} from '../src/lib/original-dependencies.mjs';
import {bindRunResultSources} from './run-result-sources.mjs';
import {taskPosition,positionGroup,movableTask,positionGuard,positionToken,freezePositions,evaluatePosition} from './trial-positions.mjs';
import {querySavedReport,savedReportCsv,assessHandoff} from '../src/lib/r7-handoff.mjs';
import {resourceLoad,loadCsv} from '../src/lib/resource-load.mjs';
import {validInterval} from '../src/lib/timetable.mjs';
import {reviewPlan,contentHash,validConfirmation} from './confirmation.mjs';
import {stageEvents} from '../src/lib/simulation-events.mjs';
import {freezeTrialSnapshot,resolveTrialCandidate,trialInputIssues} from '../src/lib/b15-protection.mjs';
import {protectCalculatedTasks} from './trial-protection.mjs';
import {executionState,executionTransition,executionAdmission,executionSummary,factTables} from '../src/lib/execution-facts.mjs';
import {executionInventory,executionMaterialDemand} from '../src/lib/material-allocation.mjs';
import {inventoryView} from '../src/lib/inventory-view.mjs';
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
export function createBusinessRouter({ dataDir, actorMiddleware, requireMember, accessMode = 'managed', runTimeoutMs = 30000, workerFactory = workerData => new Worker(new URL('./calculation-worker.mjs',import.meta.url),{workerData}) }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file=path.join(dataDir,'business.json');
  const read=()=>{try{const s=JSON.parse(fs.readFileSync(file,'utf8'));s.data.simulationEvents??=[];s.data.executionFacts??=[];s.data.executionMaterials??=[];s.data.executionSources??=[];s.data=migratePolicies(s.data);s.data.personnelPools??=[];return s;}catch(e){if(e.code!=='ENOENT')throw e;let legacy=[];try{legacy=JSON.parse(fs.readFileSync(path.join(dataDir,'plans.json'),'utf8'));}catch(old){if(old.code!=='ENOENT')throw old;}return {data:structuredClone(seed),revision:0,plans:legacy.map(p=>({...p,status:'legacy'})),records:[]};}};
  const write=s=>{const tmp=`${file}.${randomUUID()}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}};
  const activeWorkers=new Map();
  const positionPreviews=new Map();
  const csvPreviews=new Map();
  const restorePreviews=new Map();
  let pendingRestores=0;
  const stopping=new Map();
  const terminal=new Set(['completed','partial','cancelled','timed_out','failed']);
  // A new process cannot resume a lost thread. Preserve the snapshot and explain it.
  const recovered=read();let changed=false;
  for(const run of recovered.runs||[])if(!terminal.has(run.status)){
    run.status='failed';run.finishedAt=new Date().toISOString();run.failure={code:'process_interrupted',message:'应用进程中断，原运行未恢复；可使用新运行重新计算。'};run.phase='已中断';run.durationMs=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.createdAt));run.outcome='orphaned';
    recovered.records.push({id:randomUUID(),action:'run_failed',target:run.id,actor:'system',role:'system',at:run.finishedAt,reason:run.failure.message,requestId:run.requestId});changed=true;
  }
  if(changed)write(recovered);
  const router=Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  if (accessMode === 'shared') {
    router.use((req, _res, next) => {
      req.businessAccess = { actor: 'shared-workbench', requestId: randomUUID() };
      req.member = { role: 'supervisor', canExport: true };
      next();
    });
  } else if (accessMode === 'managed') {
    router.use(actorMiddleware,requireMember(['planner','supervisor','query']));
  } else {
    throw new Error('unsupported business access mode');
  }
  const actorKey = req => req.businessAccess?.actor ?? subjectKey(req.praetorActor);
  const requestId = req => req.businessAccess?.requestId ?? req.praetorActor.requestId;
  const permission=(action)=> (req,res,next)=>{
    const m=req.member;
    const allowed= action==='read' || (action==='export' ? m.role!=='query'||m.canExport===true : ['confirm','return','release','archive'].includes(action) ? m.role==='supervisor' : ['planner','supervisor'].includes(m.role));
    if(!allowed){console.info(JSON.stringify({action,decision:'deny',requestId:requestId(req),actor:actorKey(req)}));return res.status(403).json({error:'forbidden'});}
    if(req.method!=='GET'){
      if(!isTrustedWrite(req))return res.status(403).json({error:'csrf'});
      if(typeof req.body?.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>1000)return res.status(400).json({error:'reason_required'});
    }
    next();
  };
  const record=(s,req,action,target,details={})=>s.records.push({id:randomUUID(),action,target,actor:actorKey(req),role:req.member.role,at:new Date().toISOString(),reason:req.body.reason.trim(),requestId:requestId(req),...details});
  router.use('/workbooks',createWorkbookRouter({dataDir,permission,actorKey,requestId,workerFactory}));
  router.get('/bom-loss',permission('read'),(req,res)=>{const s=read();try{const p=bomApplication(s.data,String(req.query.productId||''),String(req.query.version||''));res.json({...p,revision:s.revision});}catch(e){res.status(422).json({error:e.message});}});
  router.post('/bom-loss',permission('edit'),(req,res)=>{const s=read();if(req.body.revision!==s.revision)return res.status(409).json({error:'stale_input'});try{const p=saveBomApplication(s.data,req.body.productId,req.body.version,req.body.config,s.revision+1);s.data.bomLossProfiles=[...(s.data.bomLossProfiles||[]).filter(old=>old.productId!==p.productId||old.recipe.version!==p.recipe.version),p];s.revision++;record(s,req,'bom_loss_saved',p.productId,{model:p.config.model,configVersion:p.config.version});write(s);res.json({...p,revision:s.revision});}catch(e){res.status(422).json({error:e.message});}});
  router.get('/meta',permission('read'),(_req,res)=>res.json({release:'R1 prototype + FR-037 supported-flow slice',baseline:'APS v0.3 review draft',supportedRules:['BR-02 precedence','BR-03 exclusive machine overlap','FR-008 calendar','FR-007 personnel','FR-022 explicit joint occupancy'],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',unsupportedWorkflows:['external-dispatch'],confirmation:'FR030-v1 internal only'}));
  router.get('/rules/preview',permission('read'),(_req,res)=>{const s=read();res.json({revision:s.revision,...configurationPreview(s.data)});});
  router.get('/rules/capabilities',permission('read'),(_req,res)=>res.json(ruleCatalog));
  router.get('/session',permission('read'),(req,res)=>res.json({accessMode,role:req.member.role,canWrite:['planner','supervisor'].includes(req.member.role),canExport:req.member.role!=='query'||req.member.canExport===true}));
  const r21State=s=>s.r21 || {config:partialR21Seed(),history:[],applications:[]};
  router.use('/r21',createR21ConfigRouter({dataDir,authorize:(req,res,next)=>{req.r21Actor=actorKey(req);return permission(req.method==='GET'?'read':'edit')(req,res,next);},
    integratedStore:{read:()=>r21State(read()),write:(value,req)=>{const s=read();s.r21=value;record(s,req,'r21_config_saved',String(value.config.revision),{configFingerprint:inputHash(value.config)});write(s);}},
    readInput:()=>{const s=read();return {data:s.data,revision:s.revision,csvSources:s.csvSources};},saveOrders:()=>{throw Error('atomic_transaction_required');},
    applyTransaction:({req,input,config,proposed})=>{
      if(inputHash(r21State(read()).config)!==inputHash(config))return {status:409,body:{error:'stale_r21_config'}};
      const result={status:200,body:null},response={status(code){result.status=code;return this;},json(body){result.body=body;return this;}};
      saveInputs({...req,body:{...req.body,revision:input.revision,operation:'edit'},r21Application:config},response,{orders:proposed.orders});
      if(result.status===200)result.body={saved:result.body,application:r21State(read()).applications.at(-1)};
      return result;
    }
  }));
  router.get('/state',permission('read'),(_req,res)=>{const s=read();res.json({data:s.data,revision:s.revision,inputVersionId:inputHash(s.data)});});
  router.get('/operations',permission('read'),(_req,res)=>res.json(read().records));
  const versionId=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const preserve=(s,target=s)=>{s.inputVersions??={};const id=versionId(target.data);if(!s.inputVersions[id])s.inputVersions[id]={id,revision:target.revision,data:structuredClone(target.data),csvSources:structuredClone(target.csvSources||{})};return id;};
  const inputs=(s,p)=>{const v=s.inputVersions?.[p.inputVersionId];return v&&v.data&&versionId(v.data)===p.inputVersionId?v:null;};
  router.get('/plans',permission('read'),(_req,res)=>{const s=read();res.json(s.plans.map(p=>({...p,inputSnapshot:inputs(s,p)?.data??null,inputCsvSources:inputs(s,p)?.csvSources??null})));});
  router.get('/plans/:id/inputs',permission('read'),(req,res)=>{const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});res.json(v);});
  router.get('/inventory',permission('read'),(req,res)=>{
    const asOf=req.query.asOf??new Date().toISOString();
    if(typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf)))return res.status(400).json({error:'invalid_inventory_time'});
    const s=read();res.json({revision:s.revision,inputVersionId:inputHash(s.data),asOf,rows:inventoryView(s.data,asOf),scope:'模拟库存；当前查询与分配前余额；方案内分配保留在方案中，不写入库存占用'});
  });
  router.get('/execution',permission('read'),(_req,res)=>{const s=read();const history=s.records.filter(r=>!r.trialId&&factTables.includes(r.target));res.json({...executionSummary(s.data),version:inputHash(executionState(s.data)),revision:s.revision,history,inventory:queryInventoryAvailability(executionInventory(s.data),{rules:s.data.rules}).map(row=>({...row,'扣耗后余额':row['账面数量'],'扣耗前账面数量':s.data.inventory.find(b=>b['批次编号']===row['批次编号'])?.['账面数量'],'说明':'模拟账面减累计耗料，再减独立占用；不是真实库存'}))});});
  // Rejected transitions carry two explicit, independently versioned inputs.
  function transitionEvidence(issues,before,after,revision,domain='current'){
    const at=new Date().toISOString(),sources={before:{domain,inputVersionId:inputHash(before),revision,checkedAt:at},after:{domain:'candidate:'+domain,inputVersionId:inputHash(after),revision,checkedAt:at}};
    const bound=issues.map(f=>({...f,taskIds:[],relatedRecords:(f.relatedRecords||[]).map(ref=>({...ref,origin:{...sources[ref.versionSide],occurrence:ref.occurrence}}))}));
    return {findings:bound,checkedInputs:{before:{data:before,...sources.before},after:{data:after,...sources.after}},issues:bound};
  }
  function saveInputs(req,res,tables,trialId,dryRun=false){
    const {revision,operation}=req.body;
    const s=read(),target=trialId?s.trials?.find(t=>t.id===trialId):s;
    if(!target)return res.status(404).json({error:'trial_not_found'});
    if(target.status==='discarded')return res.status(409).json({error:'trial_discarded'});
    if(revision!==target.revision)return res.status(409).json({error:'stale_input'});
    if(operation!==undefined&&!['import','edit','add','copy','delete','restore'].includes(operation))return res.status(400).json({error:'invalid_operation'});
    if(!tables||typeof tables!=='object'||Array.isArray(tables)||!Object.keys(tables).length)return res.status(400).json({error:'invalid_tables'});
    let proposed=structuredClone(target.data);
    if(req.inputStage==='minimal-r1')proposed.inputStage='minimal-r1';
    else if(req.inputStage==='supported')delete proposed.inputStage;
    for(const [key,rows] of Object.entries(tables)){
      const def=defs.find(d=>d.key===key);if(!def)return res.status(404).json({error:'unknown_table'});
      if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_rows'});
      if(rows.some(r=>Object.keys(r).some(f=>!def.fields.includes(f))))return res.status(400).json({error:'unknown_fields'});
      proposed[key]=(['tools','resourceClaims'].includes(key)?rows:(migratePolicies({[key]:rows})[key]||rows)).map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));
    }
    if(trialId&&factTables.some(k=>tables[k]!==undefined))return res.status(409).json({error:'trial_execution_edit_forbidden'});
    if(!trialId){const staged=stageEvents(target.data,proposed,Object.keys(tables));if(staged.issues.length)return res.status(409).json({error:'event_reconciliation_required',issues:staged.issues});proposed=staged.data;for(const def of defs.filter(d=>JSON.stringify(proposed[d.key])!==JSON.stringify(target.data[d.key]))){const rows=proposed[def.key]||[];if(rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!def.fields.includes(k))||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_event_effect'});proposed[def.key]=rows.map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));}}
    const transition=(trialId?trialInputIssues(s.data,proposed):executionTransition(target.data,proposed));if(transition.length)return res.status(409).json({error:'execution_reconciliation_required',...transitionEvidence(transition,trialId?s.data:target.data,proposed,trialId?s.revision:target.revision)});
    const newlyEnabled=(proposed.rules||[]).some(r=>r['是否启用']==='是'&&!(target.data.rules||[]).some(old=>old['规则编号']===r['规则编号']&&old['是否启用']==='是'));
    const issues=[...packTransition(target.data,proposed,s.records),...stageMappingTransition(target.data,proposed,s.records),...resourceMappingTransition(target.data,proposed,s.records),...poolTransitionIssues(target.data,proposed,s.records),...validateInputs(defs,proposed),...(newlyEnabled?assessRules(adaptOriginalDependencies(proposed).data,new Date().toISOString(),true,proposed.inputStage||'supported').issues:[])];if(issues.length){
      // The rejected proposal is an ephemeral check input, never a saved input version.
      const source={domain:'candidate:'+(trialId?'trial:'+trialId:'current'),inputVersionId:inputHash(proposed),revision:target.revision,checkedAt:new Date().toISOString(),scope:'complete proposed input validation'};
      const csvSources=checkedCsvSources(proposed,target.csvSources,req.csvSources);
      const findings=issues.map(f=>bindProblemSource({...f,taskIds:[]},source,undefined,undefined,csvSources));
      return res.status(400).json({error:'invalid_input',issues:findings,findings,checkedInput:{data:proposed,...source}});
    }
    if(operation==='restore')return res.status(409).json({error:'restore_blocked',...restoreBlockers(s,null)});
    // A missing original confirmed snapshot cannot be reconstructed from today's data.
    if(s.plans.some(p=>['confirmed','released','archived'].includes(p.status)&&!inputs(s,p)))return res.status(409).json({error:'protected_history_unavailable'});
    // Preserve the persisted representation of unchanged mapping rows. Adding
    // an empty optional column to old v1 data must not create a write/version.
    if(Array.isArray(proposed.resourceMappings))proposed.resourceMappings=proposed.resourceMappings.map(m=>{
      const old=(target.data.resourceMappings||[]).find(r=>r['配置编号']===m['配置编号']);
      return sameResourceMapping(old,m)?old:m;
    });
    // Configured values and their immutable provenance enter the SAME business rename.
    // Explicit edits of the six values invalidate the previous configuration attribution.
    if(req.r21Application){const config=structuredClone(req.r21Application);proposed.r21OrderConfiguration={config,configFingerprint:inputHash(config),applicationId:dryRun?'preview':randomUUID()};}
    else if(proposed.r21OrderConfiguration && JSON.stringify(target.data.orders.map(o=>[o['订单编号'],o['是否允许拆分'],o['需求类型'],o['订单状态']]))!==JSON.stringify(proposed.orders.map(o=>[o['订单编号'],o['是否允许拆分'],o['需求类型'],o['订单状态']])))delete proposed.r21OrderConfiguration;
    if(dryRun)return res.json({valid:true,revision:target.revision});
    const changes=defs.map(d=>d.key).filter(key=>JSON.stringify(target.data[key])!==JSON.stringify(proposed[key]));
    const provenanceChanged=JSON.stringify(target.data.r21OrderConfiguration)!==JSON.stringify(proposed.r21OrderConfiguration)||target.data.inputStage!==proposed.inputStage;
    if(!changes.length&&!provenanceChanged)return res.json({data:target.data,revision:target.revision,unchanged:true});
    const before=target.data;const fromVersion=preserve(s,target);
    target.data=proposed;target.revision++;
    target.csvSources={...(target.csvSources||{})};
    for(const key of new Set([...changes,...Object.keys(req.csvSources||{})])){delete target.csvSources[key];if(req.csvSources?.[key])target.csvSources[key]={...structuredClone(req.csvSources[key]),sha256:createHash('sha256').update(req.csvSources[key].originalText).digest('hex'),canonicalRows:structuredClone(proposed[key])};}
    if(req.r21Application&&!req.csvSources?.orders&&target.csvSources.orders){target.csvSources.orders={...structuredClone(target.csvSources.orders),canonicalRows:structuredClone(proposed.orders),r21Configuration:structuredClone(proposed.r21OrderConfiguration)};}
    const toVersion=preserve(s,target);
    if(req.r21Application){const state=r21State(s),applied=proposed.r21OrderConfiguration;s.r21={...state,applications:[...state.applications,{id:applied.applicationId,config:applied.config,configFingerprint:applied.configFingerprint,beforeInputRevision:revision,afterInputRevision:target.revision,inputVersionId:toVersion,at:new Date().toISOString(),reason:req.body.reason.trim(),actor:actorKey(req)}]};record(s,req,'r21_applied',applied.applicationId,{configFingerprint:applied.configFingerprint,fromVersion,toVersion});}
    const batchId=randomUUID();
    for(const key of changes)record(s,req,operation||'edit',key,{before:before[key],after:proposed[key],fromVersion,toVersion,fromRevision:target.revision-1,toRevision:target.revision,batchId,...(req.csvEvidence?.[key]?{csvSource:req.csvEvidence[key]}:{}),trialId:trialId||null,...(req.csvSources?{csvSources:{[key]:req.csvSources[key]}}:{})});
    write(s);res.json({data:target.data,revision:target.revision,inputVersionId:toVersion});
  }
  // Preview and commit pass through exactly the same transition/history/validation gates.
  function checkCsv(req,s,inspection,dryRun){
    const result={status:200,body:null};
    const response={status(code){result.status=code;return this;},json(body){result.body=body;return this;}};
    const csvEvidence=Object.fromEntries(Object.entries(inspection.sources).filter(([key])=>['originalTools','originalPersonnel','resourceMappings'].includes(key)).map(([key,source])=>{const raw=req.body.files?.find(f=>f.name===source.file);return [key,{...source,...(raw?{text:raw.text,sha256:createHash('sha256').update(raw.text).digest('hex')}:{})}];}));
    const csvSources=Object.fromEntries(Object.entries(inspection.sources).map(([key,source])=>[key,{...source,originalText:source.originalText??req.body.files?.find(file=>file.name===source.file)?.text}]));
    if(Object.values(csvSources).some(source=>typeof source.originalText!=='string'))return {status:400,body:{error:'csv_source_unavailable'}};
    saveInputs({...req,csvEvidence,csvSources,...(req.inputStage?{inputStage:req.inputStage}:{}),...(inspection.sources.orders?.r21Configuration?{r21Application:inspection.sources.orders.r21Configuration}:{})},response,inspection.tables,undefined,dryRun);
    if(result.body?.issues)result.body=csvProblemEvidence(result.body,inspection,s,defs);
    return result;
  }
  router.post('/imports/preview',permission('edit'),(req,res)=>{
    const {files,revision,table,repairs=[],r21ConfigRevision,inputStage,resourceRuleBinding=null}=req.body,s=read();
    if(resourceRuleBinding!==null&&table!==undefined)return res.status(400).json({error:'resource_rule_batch_required'});
    if(inputStage!==undefined&&!['minimal-r1','supported'].includes(inputStage))return res.status(400).json({error:'invalid_input_stage'});
    const r21Config=r21ConfigRevision===undefined?null:r21State(s).config;
    if(r21Config&&r21ConfigRevision!==r21Config.revision)return res.status(409).json({error:'stale_r21_config'});
    if(r21Config&&table!==undefined)return res.status(400).json({error:'r21_batch_required'});
    if(revision!==s.revision)return res.status(409).json({error:'stale_input'});
    if(!Array.isArray(files)||!files.length||files.length>batchKeys.length||files.some(f=>!f||typeof f.name!=='string'||typeof f.text!=='string'||f.text.length>1000000))return res.status(400).json({error:'invalid_files'});
    const def=table===undefined?null:defs.find(d=>d.key===table&&d.key!=='factoryLines');
    if(table!==undefined&&(!def||files.length!==1))return res.status(400).json({error:'invalid_single_table'});
    const inspection=def?inspectSingleCsv(files[0],def):inspectCsvBatch(files,defs,repairs,r21Config,resourceRuleBinding);
    if(table==='simulationEvents')inspection.tables.executionFacts=s.data.executionFacts||[];
    const base={tables:inspection.tables,sources:inspection.sources,revision,beforeTables:Object.fromEntries(Object.keys(inspection.tables).map(key=>[key,s.data[key]||[]]))};
    if(inspection.issues.length)return res.json({...base,valid:false,...csvProblemEvidence({issues:inspection.issues},inspection,s,defs,{physical:true})});
    const checked=checkCsv({...req,inputStage,body:{...req.body,operation:'import'}},s,inspection,true);
    if(checked.status!==200)return res.status(checked.status).json({...base,valid:false,...checked.body});
    for(const [id,p] of csvPreviews)if(Date.now()-p.createdAt>15*60*1000)csvPreviews.delete(id);
    if(csvPreviews.size>=100)return res.status(429).json({error:'preview_capacity'});
    const id=randomUUID();csvPreviews.set(id,{owner:actorKey(req),createdAt:Date.now(),stateHash:contentHash(s),revision,table,files:structuredClone(files),repairs:structuredClone(repairs),r21Config:structuredClone(r21Config),inputStage,resourceRuleBinding:structuredClone(resourceRuleBinding)});
    res.json({...base,id,valid:true,issues:[],devices:r21DeviceUsage({...s.data,...inspection.tables},inspection.sources.machines||s.csvSources?.machines)});
  });
  router.post('/imports/commit',permission('edit'),(req,res)=>{
    const p=csvPreviews.get(req.body.previewId),s=read();
    if(!p||p.owner!==actorKey(req)||Date.now()-p.createdAt>15*60*1000)return res.status(409).json({error:'preview_expired_or_unowned'});
    if(p.revision!==s.revision||p.stateHash!==contentHash(s))return res.status(409).json({error:'stale_preview'});
    // Ignore caller-supplied tables/actor/revision; reparse the server-owned original files.
    const inspection=p.table?inspectSingleCsv(p.files[0],defs.find(d=>d.key===p.table)):inspectCsvBatch(p.files,defs,p.repairs,p.r21Config,p.resourceRuleBinding??null);
    if(p.table==='simulationEvents')inspection.tables.executionFacts=s.data.executionFacts||[];
    if(inspection.issues.length)return res.status(400).json({error:'invalid_input',...csvProblemEvidence({issues:inspection.issues},inspection,s,defs,{physical:true})});
    const checked=checkCsv({...req,inputStage:p.inputStage,csvSources:inspection.sources,body:{reason:req.body.reason,revision:p.revision,operation:'import',files:p.files}},s,inspection,false);
    if(checked.status===200)csvPreviews.delete(req.body.previewId);
    res.status(checked.status).json(checked.body);
  });
  router.post('/tables/:table',permission('edit'),(req,res)=>saveInputs(req,res,{[req.params.table]:req.body.rows}));
  // Business dry run only: shares input/history guards, never preserve/write/record.
  router.post('/inputs/resource-policy-preview',permission('calculate'),(req,res)=>{
    const tables=req.body.tables;
    if(!tables||typeof tables!=='object'||Array.isArray(tables)||Object.keys(tables).some(k=>!['stageMappings','originalInventory','originalSupply','originalProgress','originalEvents','inventory','supplies','supplyUses','executionSources','executionFacts','executionMaterials','simulationEvents','originalResourceEvents','personnelPools','personnelGroups','dependencies','skillSubstitutions','originalTools','originalPersonnel','resourceMappings','tools','resourceClaims','rules'].includes(k)))return res.status(400).json({error:'preview_tables',message:'资源策略预览仅接受来源、映射、工装、声明、规则和人员配置草稿'});
    const check={status:200,body:null},response={status(code){check.status=code;return this;},json(body){check.body=body;return this;}};
    saveInputs(req,response,tables,undefined,true);
    if(!check.body?.valid)return res.status(check.status).json(check.body);
    const state=read();if(req.body.revision!==state.revision)return res.status(409).json({error:'stale_input'});
    const candidate=structuredClone(state.data);
    for(const [key,rows] of Object.entries(tables)){const def=defs.find(d=>d.key===key);candidate[key]=(migratePolicies({[key]:rows})[key]||rows).map(row=>Object.fromEntries(def.fields.map(f=>[f,row[f]??''])));}
    const at=new Date().toISOString();
    function evaluate(data){
      const frozen=freezeRunInput(data,req.body.selection,at);
      const issues=[...validateInputs(defs,data,{at,checkPolicyExecution:false}),...executionAdmission(frozen.executionData,frozen.conditions),...assessRules(frozen.executionData,at,true,frozen.conditions.mode).issues];
      if(issues.length)return {status:'blocked',issues};
      const plan=calculate(frozen.executionData,state.revision,at,frozen.conditions);
      return {status:'preview',snapshotHash:frozen.snapshotHash,conditions:frozen.conditions,tasks:plan.tasks,resourceReservations:plan.resourceReservations,materialChecked:plan.materialChecked,materialDemands:plan.materialDemands,findings:plan.findings,resourceVerification:verifyResourcePolicies(plan,frozen.executionData,frozen.conditions)};
    }
    try{
      const proposed=evaluate(candidate);if(proposed.status==='blocked')return res.status(422).json({error:'preview_blocked',issues:proposed.issues});
      let before;try{before=evaluate(state.data);}catch(e){before={status:'blocked',message:e.message};}
      return res.json({valid:true,persisted:false,revision:state.revision,actor:actorKey(req),role:req.member.role,configurationHash:inputHash(candidate),before,candidate:proposed});
    }catch(e){return res.status(400).json({error:'preview_blocked',message:e.message});}
  });
  router.post('/inputs',permission('edit'),(req,res)=>saveInputs(req,res,req.body.tables));
  router.get('/trials',permission('read'),(_req,res)=>res.json(read().trials||[]));
  router.post('/trials/:id/inputs/check',permission('edit'),(req,res)=>saveInputs(req,res,req.body.tables,req.params.id,true));
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
    const snapshot=freezeTrialSnapshot(p,inputs(s,p).data);
    const copy={...structuredClone(snapshot.plan),id:randomUUID(),status:'draft',revision:0,sourceRevision:p.revision,trialId:id,sourcePlanId:p.id,sourceRunId:p.runId,sourceCreatedAt:p.createdAt,sourceVerification:p.verification??null,createdAt:now,name:p.name+' · 独立试算',copiedResult:true};
    delete copy.verification;
    const trial={id,status:'active',revision:0,locks:structuredClone(p.lockSnapshot||{}),createdAt:now,actor:actorKey(req),sourcePlanId:p.id,sourceRunId:p.runId,sourceInputVersionId:p.inputVersionId,sourceSnapshotHash:p.snapshotHash,basePlanId:copy.id,latestPlanId:copy.id,data:structuredClone(snapshot.data),selection:Object.fromEntries(['mode','orderIds','startMinute','endMinute','priority','enabledRuleIds'].map(k=>[k,structuredClone(p.conditions[k])]))};
    s.trials??=[];s.trials.unshift(trial);s.plans.unshift(copy);record(s,req,'trial_created',id,{sourcePlanId:p.id,planId:copy.id,inputVersionId:p.inputVersionId,snapshotHash:p.snapshotHash});write(s);res.status(201).json(trial);
  });
  // Preview transactions are ephemeral and never mutate saved plans, inputs or audit.
  // Only an owned, freshly rechecked preview can create a new immutable snapshot.
  router.get('/trials/:id/positions',permission('read'),(req,res)=>{
    const s=read(),trial=s.trials?.find(t=>t.id===req.params.id),plan=s.plans.find(p=>p.id===trial?.latestPlanId);
    if(!trial||!plan)return res.status(404).json({error:'trial_not_found'});
    const history=inputs(s,plan)?.data;
    res.json({trialId:trial.id,planId:plan.id,revision:trial.revision,planHash:contentHash(plan),blocked:positionGuard(s,trial,plan),locks:trial.locks||{},tasks:plan.tasks.map(t=>({...t,movable:!!history&&positionGroup(plan,t).length>0&&positionGroup(plan,t).every(m=>movableTask(m,s.data,trial.data,history)),positionMemberIds:positionGroup(plan,t).map(m=>m.id),allowedMachines:trial.data.dependencies.filter(d=>d['订单编号']===t.orderId&&d['工序编号']===t.operation&&d['资源类型']==='设备').slice(0,1).map(d=>d['资源编号'])})),limits:['只采用当前显式设备依赖；不推断替代设备授权','已有完整kg固定路线的同一资源批整体移动/锁定；不改变成员、程序或数量。其他未支持条件仍阻断']});
  });
  function createPositionPreview(req,res,kind){
    const s=read(),trial=s.trials?.find(t=>t.id===req.params.id),plan=s.plans.find(p=>p.id===req.body.planId);
    const blocked=positionGuard(s,trial,plan);if(blocked)return res.status(409).json({error:blocked});
    if(req.body.revision!==trial.revision||req.body.planHash!==contentHash(plan))return res.status(409).json({error:'stale_position'});
    const task=plan.tasks.find(t=>t.id===req.body.taskId),history=inputs(s,plan).data;
    const members=positionGroup(plan,task);
    if(!members.length||members.some(t=>!movableTask(t,s.data,trial.data,history)))return res.status(409).json({error:'task_execution_protected',message:'当前或历史任务已开始/已完成/已执行，或资源批成员/合同不完整；禁止移动及改变锁定'});
    if(kind==='move'&&members.some(t=>trial.locks?.[t.id]))return res.status(409).json({error:'task_locked',message:'任务已锁定，请显式解除锁定后再创建移动预览'});
    const keys=kind==='move'?['reason','revision','planId','planHash','taskId','start','machine']:['reason','revision','planId','planHash','taskId','locked'];
    if(Object.keys(req.body).some(k=>!keys.includes(k))||kind==='move'&&(typeof req.body.start!=='number'||!Number.isFinite(req.body.start)||req.body.start<0||req.body.start>525600||typeof req.body.machine!=='string')||kind==='lock'&&typeof req.body.locked!=='boolean')return res.status(400).json({error:'invalid_position_request'});
    const positions=Object.fromEntries(plan.tasks.filter(t=>positionGroup(plan,t).length>0&&positionGroup(plan,t).every(m=>movableTask(m,s.data,trial.data,history))).map(t=>[t.id,taskPosition(t)])),locks=structuredClone(trial.locks||{});
    for(const member of members){
     if(kind==='move')Object.assign(positions[member.id],{start:req.body.start,end:req.body.start+member.duration,machine:req.body.machine});
     else if(req.body.locked)locks[member.id]=taskPosition(member);else delete locks[member.id];
    }
    for(const [id,p] of Object.entries(locks))positions[id]=p;
    // Bounded, short-lived, actor-scoped tokens; no client-supplied plan/quantity accepted.
    for(const [id,p] of positionPreviews)if(Date.now()-p.createdAt>15*60*1000)positionPreviews.delete(id);
    if(positionPreviews.size>=100)return res.status(429).json({error:'preview_capacity'});
    const preview={id:randomUUID(),trialId:trial.id,planId:plan.id,kind,taskId:task.id,memberIds:members.map(t=>t.id),owner:actorKey(req),token:positionToken(s,trial,plan),createdAt:Date.now(),positions,locks,checked:false};positionPreviews.set(preview.id,preview);
    res.status(201).json({id:preview.id,kind,taskId:task.id,memberIds:members.map(t=>t.id),before:taskPosition(task),after:positions[task.id],locks,valid:false,checked:false,message:'仅预览，尚未独立复核；没有写入方案或输入'});
  }
  router.post('/trials/:id/move-preview',permission('edit'),(req,res)=>createPositionPreview(req,res,'move'));
  router.post('/trials/:id/lock-preview',permission('edit'),(req,res)=>createPositionPreview(req,res,'lock'));
  function ownedPreview(req,res){
    const preview=positionPreviews.get(req.params.previewId);
    if(!preview||preview.trialId!==req.params.id||preview.owner!==actorKey(req)||Date.now()-preview.createdAt>15*60*1000){res.status(409).json({error:'preview_expired_or_unowned'});return;}
    return preview;
  }
  function checkedPreview(req,res){
    const preview=ownedPreview(req,res);if(!preview)return;
    const s=read(),trial=s.trials?.find(t=>t.id===preview.trialId),plan=s.plans.find(p=>p.id===preview.planId),blocked=positionGuard(s,trial,plan);
    if(blocked||positionToken(s,trial,plan)!==preview.token){res.status(409).json({error:blocked||'stale_position'});return;}
    const task=plan.tasks.find(t=>t.id===preview.taskId);
    if(!positionGroup(plan,task).length||positionGroup(plan,task).some(t=>!movableTask(t,s.data,trial.data,inputs(s,plan).data))){res.status(409).json({error:'task_execution_protected'});return;}
    const evaluation=evaluatePosition(trial,plan,preview.positions,preview.locks);
    return {s,trial,plan,preview,...evaluation};
  }
  router.post('/trials/:id/previews/:previewId/recheck',permission('edit'),(req,res)=>{
    const x=checkedPreview(req,res);if(!x)return;x.preview.checked=true;x.preview.valid=x.valid;
    res.json({id:x.preview.id,checked:true,valid:x.valid,check:x.check,tasks:x.result.tasks,locks:x.preview.locks});
  });
  router.post('/trials/:id/previews/:previewId/cancel',permission('edit'),(req,res)=>{
    const preview=ownedPreview(req,res);if(!preview)return;positionPreviews.delete(preview.id);res.json({cancelled:true,id:preview.id});
  });
  router.post('/trials/:id/previews/:previewId/commit',permission('edit'),(req,res)=>{
    const preview=ownedPreview(req,res);if(!preview)return;
    if(!preview.checked||!preview.valid)return res.status(409).json({error:'valid_recheck_required'});
    const x=checkedPreview(req,res);if(!x)return;
    if(!x.valid){x.preview.valid=false;return res.status(409).json({error:'position_conflict',check:x.check});}
    const {s,trial,plan,frozen,result}=x;trial.revision++;trial.locks=structuredClone(preview.locks);
    const run={id:randomUUID(),status:'completed',phase:'试算位置独立复核完成',createdAt:frozen.conditions.ruleEvaluationAt,finishedAt:new Date().toISOString(),revision:trial.revision,trialId:trial.id,sourcePlanId:plan.id,inputVersionId:preserve(s,trial),...frozen,lockSnapshot:structuredClone(trial.locks),actor:actorKey(req),reason:req.body.reason.trim(),requestId:requestId(req),positionEdit:{kind:preview.kind,taskId:preview.taskId,memberIds:preview.memberIds,sourcePlanId:plan.id,sourceContentHash:contentHash(plan),before:taskPosition(plan.tasks.find(t=>t.id===preview.taskId)),after:preview.positions[preview.taskId],source:plan.tasks.find(t=>t.id===preview.taskId).source}};
    const next=makePlan(result,run,s);next.positionEdit=structuredClone(run.positionEdit);next.positionCheck=x.check;
    // Additional provenance is recorded outside calculated content so replay remains exact.
    run.planId=next.id;s.runs??=[];s.runs.unshift(run);s.plans.unshift(next);trial.latestPlanId=next.id;
    record(s,req,'trial_position_committed',trial.id,{previewId:preview.id,planId:next.id,runId:run.id,trialRevision:trial.revision,locks:trial.locks,...run.positionEdit});write(s);positionPreviews.delete(preview.id);res.status(201).json(next);
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
    const decision=resolveTrialCandidate(freezeTrialSnapshot(source,inputs(s,source).data),freezeTrialSnapshot(plan,inputs(s,plan).data),'keep');
    const comparison=comparePlans(decision.original.plan,decision.original.data,decision.retained.plan,decision.retained.data);
    if(inputHash(executionState(trial.data))!==inputHash(executionState(s.data)))return res.status(409).json({error:'current_execution_changed'});
    const protectedIssues=trialInputIssues(s.data,trial.data);if(protectedIssues.length)return res.status(409).json({error:'execution_reconciliation_required',...transitionEvidence(protectedIssues,s.data,trial.data,s.revision)});
    const retained={id:randomUUID(),planId:plan.id,runId:plan.runId,inputVersionId:plan.inputVersionId,snapshotHash:plan.snapshotHash,trialRevision:trial.revision,at:new Date().toISOString(),actor:actorKey(req),comparison};
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
    const source=s.plans.find(p=>p.id===trial.sourcePlanId),candidate=s.plans.find(p=>p.id===trial.latestPlanId);
    const decision=resolveTrialCandidate(source,candidate,'discard');
    trial.discardDecision={decision:decision.decision,originalPlanId:decision.original?.id??null,retainedPlanId:decision.retained?.id??null};
    trial.status='discarded';trial.discardedAt=new Date().toISOString();trial.revision++;
    record(s,req,'trial_discarded',trial.id,{sourcePlanId:trial.sourcePlanId});write(s);
    for(const id of pending)await stop(id,req,'cancelled',{failure:{code:'trial_discarded',message:'试算已放弃，保留此前历史结果。'}});
    res.json(trial);
  }catch(e){next(e);}});
  router.get('/plans/:id/compare/:other',permission('read'),(req,res)=>{
    const s=read(),a=s.plans.find(p=>p.id===req.params.id),b=s.plans.find(p=>p.id===req.params.other);
    if(!a||!b)return res.status(404).json({error:'plan_not_found'});
    if(!historical(s,a)||!historical(s,b))return res.status(409).json({error:'historical_inputs_unavailable'});
    res.json(comparePlans(a,inputs(s,a).data,b,inputs(s,b).data));
  });
  // Restore reuses the saved selection, never the old stock, facts or master data.
  // Preview uses a real worker without writing even an audit row on rejection.
  const restoreError=(res,code,message,details={})=>res.status(409).json({error:code,message,...details});
  function restoreSource(s,p){
    try{
    if(!p||p.copiedResult||!historical(s,p)||!p.conditions||!['completed','partial'].includes(historical(s,p).status))return '原方案的服务端运行或原始输入缺失，不能恢复；复制结果须先重算。';
    if(p.trialId&&s.trials?.find(t=>t.id===p.trialId)?.status!=='active')return '来源试算已放弃或缺失，不能采用。';
    if(executionTransition(inputs(s,p).data,s.data).length)return '当前事实、累计耗料或已执行范围与来源记录不一致，禁止恢复缺失或倒退的事实；请核对来源。';
    for(const c of s.confirmations||[]){
      const original=s.plans.find(x=>x.id===c.planId);
      if(!validConfirmation(c)||!original||contentHash(original)!==contentHash(c.snapshot.plan)||!historical(s,original)||inputHash(c.snapshot.originalInput)!==original.inputVersionId)return '确认记录或其保护的方案/原始输入不一致，须先核对历史。';
    }
    if(s.plans.some(x=>['confirmed','released','archived'].includes(x.status)&&(!(s.confirmations||[]).some(c=>c.planId===x.id)||!historical(s,x))))return '已确认方案缺少完整确认或原始记录，须先修复历史。';
    const run=historical(s,p),replay=calculate(run.executionData,run.revision,run.createdAt,run.conditions);
    if(inputHash(p.conditions)!==inputHash(run.conditions)||Object.keys(replay).filter(k=>!['id','name','createdAt'].includes(k)).some(k=>inputHash(replay[k])!==inputHash(p[k])))return '旧方案结果与保存运行重放不一致，禁止采用被改写的结果。';
    return null;
    }catch{return '原方案或确认历史的结构/内容不完整，无法重放核对；未保存恢复结果。';}
  }
  async function restoreCalculation(frozen,revision){
    return new Promise((resolve,reject)=>{
      let worker,timer,settled=false;
      const done=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(result);};
      try{
        worker=workerFactory({executionData:frozen.executionData,revision,conditions:frozen.conditions,calculatedAt:frozen.conditions.ruleEvaluationAt});
        timer=setTimeout(()=>done(Error('恢复预检超时，未保存任何业务数据。')),runTimeoutMs);
        worker.on('message',m=>{if(m?.kind==='progress')return;if(m?.kind==='result'&&Array.isArray(m.plan?.tasks)&&Array.isArray(m.plan?.findings))done(null,m.plan);else done(Error('恢复计算未返回有效结果，未保存。'));});
        worker.on('error',()=>done(Error('恢复计算线程失败，未保存。')));worker.on('exit',()=>done(Error('恢复计算线程已退出，未保存。')));
      }catch{done(Error('恢复计算线程无法启动，未保存。'));}
    });
  }
  router.post('/plans/:id/restore/check',permission('edit'),async(req,res,next)=>{try{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);
    if(!p)return res.status(404).json({error:'plan_not_found'});
    if(req.body.revision!==s.revision)return restoreError(res,'stale_input','当前输入已变化，请刷新后重新检查。');
    const sourceIssue=restoreSource(s,p);if(sourceIssue)return restoreError(res,'restore_blocked',sourceIssue);
    for(const [id,v] of restorePreviews)if(Date.now()-v.createdAt>15*60*1000)restorePreviews.delete(id);
    if(pendingRestores>=2)return res.status(429).json({error:'restore_capacity',message:'已有两个恢复预检计算，请稍后重试。'});
    if(restorePreviews.size>=20)return res.status(429).json({error:'restore_capacity',message:'恢复预检已达上限，请稍后重试。'});
    const currentRules=s.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']).sort();
    if(inputHash(currentRules)!==inputHash([...(p.conditions.enabledRuleIds||[])].sort()))return restoreError(res,'restore_blocked','旧方案规则选择与当前启用规则不一致；不自动启停规则，请按当前规则新算。');
    try{for(const fact of s.data.executionFacts||[]){
      const order=s.data.orders.find(o=>o['订单编号']===fact['订单编号']);
      const required=executionMaterialDemand(s.data,order,fact['工序编号'],Number(fact['开始分钟'])).filter(d=>d.quantity>0);
      if(required.some(d=>!(s.data.executionMaterials||[]).some(c=>c['事实编号']===fact['事实编号']&&c['物料编号']===d.materialId)))return restoreError(res,'restore_blocked','已开始工序缺少所声明物料的累计耗料记录；须核对来源，不推定零耗料。',{factId:fact['事实编号']});
    }}catch{return restoreError(res,'restore_blocked','当前执行工序的适用BOM、事实或耗料口径不完整，须先核对来源。');}
    const token=contentHash(s),at=new Date().toISOString();let frozen;
    const selection=Object.fromEntries(['mode','orderIds','startMinute','endMinute','priority','enabledRuleIds'].map(k=>[k,p.conditions[k]]));
    try{frozen=Object.keys(p.lockSnapshot||{}).length?freezePositions(s.data,p.conditions,p.lockSnapshot,at):freezeRunInput(s.data,selection,at);}catch(e){return restoreError(res,'restore_blocked','旧方案选择在当前数据下已失效，请核对订单、范围与规则；不自动扩大范围。',{cause:e.message});}
    const issues=[...validateInputs(defs,s.data),...executionAdmission(frozen.executionData,frozen.conditions),...assessRules(frozen.executionData,at,true,frozen.conditions.mode).issues];
    if(issues.length)return restoreError(res,'restore_blocked','当前模拟输入、执行或物料来源需核对，未保存恢复版本。',{issues});
    let result;pendingRestores++;try{result=await restoreCalculation(frozen,s.revision);}catch(e){return restoreError(res,'restore_blocked',e.message);}finally{pendingRestores--;}
    if(contentHash(read())!==token)return restoreError(res,'stale_restore','预检期间当前输入、确认或业务记录已变化，请重新检查。');
    const run={id:randomUUID(),status:'completed',createdAt:at,finishedAt:new Date().toISOString(),revision:s.revision,trialId:null,sourcePlanId:p.id,inputVersionId:versionId(s.data),...frozen,lockSnapshot:structuredClone(p.lockSnapshot||{}),actor:actorKey(req),requestId:requestId(req),reason:req.body.reason.trim(),restoreSourcePlanId:p.id};
    const plan=makePlan(result,run);run.planId=plan.id;
    plan.verification={...independentlyVerifyPlan(plan,frozen.executionData.orders,frozen.executionData.routes,plan.rules,at,frozen.executionData,frozen.conditions),contentHash:contentHash(plan)};
    const candidate=structuredClone(s);preserve(candidate);candidate.runs??=[];candidate.runs.unshift(run);candidate.plans.unshift(plan);
    const review=reviewPlan(candidate,plan);
    const blockers=[...review.blockers];
    if(review.unplanned.length||plan.findings.length)blockers.push({code:'RESTORE_INCOMPLETE',message:'旧条件在当前事实下存在未排或冲突，不能自动采用部分结果。'});
    if(frozen.executionData.bom.some(b=>frozen.executionData.orders.some(o=>o['产品编号']===b['产品编号']))&&!plan.materialChecked)blockers.push({code:'MATERIAL_UNCHECKED',message:'本方案声明的BOM物料尚未检查，不能恢复采用。'});
    if(blockers.length)return restoreError(res,'restore_blocked','当前事实下未通过恢复检查；原方案与全部业务数据保持原值。',{blockers});
    const id=randomUUID(),comparison=comparePlans(p,inputs(s,p).data,plan,s.data);
    const provenance={sourcePlanId:p.id,sourceRunId:p.runId,sourceInputVersionId:p.inputVersionId,currentInputVersionId:run.inputVersionId,currentProgressVersion:frozen.conditions.executionFactsVersion,confirmationReferences:(s.confirmations||[]).map(c=>({id:c.id,snapshotHash:c.snapshotHash})),policy:'旧计算条件＋当前全部输入/事实；新草稿不替换确认计划',limits:review.limits};
    restorePreviews.set(id,{owner:actorKey(req),createdAt:Date.now(),token,sourcePlanId:p.id,run,plan,provenance});
    res.json({id,revision:s.revision,plan,comparison,provenance,message:'已按当前事实、累计耗料与启用规则重算并复核；核对变化后可保存新草稿。原确认继续保留，真实Gateway及完整业务保护未在此证明。'});
  }catch(e){next(e);}});
  router.post('/plans/:id/restore',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(req.body.revision!==s.revision)return restoreError(res,'stale_input','当前输入已变化，请刷新后重新检查。');
    const v=restorePreviews.get(req.body.previewId);
    if(!v)return res.status(409).json({error:'restore_blocked',...restoreBlockers(s,p)});
    if(v.owner!==actorKey(req)||v.sourcePlanId!==p.id||Date.now()-v.createdAt>15*60*1000)return restoreError(res,'restore_preview_invalid','恢复预检已过期或不属于当前用户/方案，请重新检查。');
    if(v.token!==contentHash(s))return restoreError(res,'stale_restore','预检后输入、执行事实、确认或业务记录已变化，请重新检查。');
    const sourceIssue=restoreSource(s,p);if(sourceIssue)return restoreError(res,'restore_blocked',sourceIssue);
    preserve(s);s.runs??=[];s.runs.unshift(v.run);s.plans.unshift(v.plan);
    const review=reviewPlan(s,v.plan);if(review.blockers.length)return restoreError(res,'restore_blocked','保存前重新复核未通过，未写入业务数据。',{blockers:review.blockers});
    v.plan.restoreProvenance=v.provenance;
    // Provenance participates in content hashes; regenerate verification for the final saved bytes.
    v.plan.verification.contentHash=contentHash(v.plan);
    s.restorations??=[];s.restorations.push({id:req.body.previewId,planId:v.plan.id,runId:v.run.id,...v.provenance});
    record(s,req,'plan_restored',v.plan.id,{previewId:req.body.previewId,...v.provenance});write(s);restorePreviews.delete(req.body.previewId);
    res.status(201).json({plan:v.plan,provenance:v.provenance,message:'恢复已保存为按当前事实重算的新草稿；原方案、确认、执行事实和库存未回滚。请按现有流程提交主管确认。'});
  });
  function prepare(req,res) {
    if(req.body.trialId!==undefined&&(typeof req.body.trialId!=='string'||!req.body.trialId)){res.status(400).json({error:'invalid_trial'});return;}
    const s=read(),trial=req.body.trialId?s.trials?.find(t=>t.id===req.body.trialId):null;
    if(req.body.trialId&&!trial){res.status(404).json({error:'trial_not_found'});return;}
    if(trial?.status==='discarded'){res.status(409).json({error:'trial_discarded'});return;}
    const target=trial||s;
    if(req.body.revision!==target.revision){res.status(409).json({error:'stale_input'});return;}
    if(trial&&inputHash(executionState(trial.data))!==inputHash(executionState(s.data))){res.status(409).json({error:'current_execution_changed',message:'试算执行事实已落后当前版本；保留旧记录，请从当前事实新算再复制'});return;}
    if(trial){const reconciliation=trialInputIssues(s.data,trial.data);if(reconciliation.length){res.status(409).json({error:'execution_reconciliation_required',...transitionEvidence(reconciliation,s.data,trial.data,s.revision)});return;}}
    const calculatedAt=new Date().toISOString();let frozen;
    const source={domain:trial?'trial:'+trial.id:'current',inputVersionId:inputHash(target.data),revision:target.revision,checkedAt:calculatedAt,scope:req.body.selection??trial?.selection??null};
    try{frozen=freezeRunInput(target.data,req.body.selection??trial?.selection,calculatedAt);if(trial&&Object.keys(trial.locks||{}).length)frozen=freezePositions(target.data,frozen.conditions,trial.locks,calculatedAt);}
    catch(e){
      const selection=req.body.selection??trial?.selection;
      const selected=e.message==='invalid_line_scope'?target.data.orders.filter(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效'&&(!selection?.orderIds||selection.orderIds.includes(o['订单编号']))):[];
      const findings=e.message==='invalid_line_scope'
        ?validateSingleLineScope(selected,target.data.machines).map(f=>({...bindProblemSource(f,{...source,scope:selection??null},target.data,{orders:selected.map(o=>target.data.orders.indexOf(o)),machines:target.data.machines.map((_,i)=>i)},target.csvSources),sourceRevision:target.revision})):[...validateOrders(target.data.orders),...validateMasterData(target.data)].map(f=>({...bindProblemSource({...f,taskIds:[]},{...source,scope:'complete saved input validation'},undefined,undefined,target.csvSources),sourceRevision:target.revision}));
      // Keep the early selection rejection; expose only actually absent mandatory rules.
      if(e.message==='invalid_rule_selection')findings.push(...assessRules(target.data,calculatedAt,false).issues.filter(i=>i.associationState==='known-absent').map(i=>({...bindProblemSource({...i,code:'RULE / CONFIG',taskIds:[]},{...source,scope:'complete saved input rule presence'},undefined,undefined,target.csvSources),sourceRevision:target.revision})));
      res.status(400).json({error:e.message,...(findings?{findings,checkedInput:{data:target.data,inputVersionId:source.inputVersionId}}:{})});return;
    }
    const native=validateInputs(defs,target.data,{at:calculatedAt,checkPolicyExecution:false,mode:frozen.conditions.mode});
    const scoped=[...unmappedStageSources(frozen.executionData),...executionAdmission(frozen.executionData,frozen.conditions),...assessRules(frozen.executionData,calculatedAt,true,frozen.conditions.mode).issues];
    const withSource=(i,data,context,map)=>bindProblemSource(attachProblemRecords({...i,code:i.code||'INPUT / CHECK',taskIds:[]},data),context,target.data,map,target.csvSources);
    const issues=[...native,...scoped];
    const findings=[...native.map(i=>withSource(i,target.data,{...source,scope:'complete saved input validation'})),...scoped.map(i=>withSource(i,frozen.executionData,{...source,executionVersionId:inputHash(frozen.executionData),scope:frozen.conditions},frozen.sourceMap))];
    if(issues.length){res.status(422).json({error:'rule_configuration_blocked',issues,checkedInput:{data:target.data,inputVersionId:source.inputVersionId},findings:findings.map(f=>({...f,sourceRevision:target.revision}))});return;}
    const run={id:randomUUID(),status:'queued',phase:'等待计算线程',createdAt:calculatedAt,revision:target.revision,trialId:trial?.id||null,sourcePlanId:trial?.sourcePlanId||null,inputVersionId:preserve(s,target),...frozen,lockSnapshot:structuredClone(trial?.locks||{}),actor:actorKey(req),requestId:requestId(req),reason:req.body.reason.trim(),timeoutMs:runTimeoutMs};
    s.runs??=[];s.runs.unshift(run);return {s,run};
  }
  const publicRun=run=>{const {executionData,...summary}=run;const plan=run.planId?read().plans.find(p=>p.id===run.planId):null;return {...summary,durationMs:run.durationMs??Math.max(0,Date.parse(run.finishedAt||new Date().toISOString())-Date.parse(run.createdAt)),outcome:run.outcome??({completed:'succeeded',partial:'succeeded',timed_out:'timed_out'}[run.status]||run.status),resultState:resultState(run,plan?.resultAssessment)};};
  function makePlan(result,run,state=read()){
    const trial=run.trialId?state.trials?.find(t=>t.id===run.trialId):null;
    const baseline=trial?state.plans.find(p=>p.id===trial.latestPlanId):null;
    const applicationProtection=protectCalculatedTasks(baseline,result,run.executionData,run.conditions,run.lockSnapshot||{});
    if(!applicationProtection.valid){const error=Error('calculated_protection_conflict');error.protection=applicationProtection;throw error;}
    return {...bindRunResultSources(result,run,state.inputVersions?.[run.inputVersionId]),applicationProtection,...(run.lockSnapshot?{lockSnapshot:structuredClone(run.lockSnapshot)}:{}),trialId:run.trialId,sourcePlanId:run.sourcePlanId,id:randomUUID(),status:'draft',revision:run.revision,inputVersionId:run.inputVersionId,runId:run.id,conditions:run.conditions,snapshotHash:run.snapshotHash};}
  function finish(id,req,status,details={}){
    const s=read(),run=s.runs?.find(r=>r.id===id);if(!run||terminal.has(run.status)||stopping.has(id))return;
    let candidate;
    if(details.result){try{candidate=makePlan(details.result,run,s);}catch(e){status='failed';details={failure:{code:e.protection?'calculated_protection_conflict':'invalid_calculated_result',message:'候选未通过执行保护，未保存方案；原输入、事实与锁定保留。',...(e.protection?{protection:e.protection}:{})}};}}
    Object.assign(run,details,{status,finishedAt:new Date().toISOString(),phase:status==='completed'?'计算完成':status==='partial'?'计算完成，有未排或问题':status});
    run.durationMs=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.createdAt));
    if(candidate){delete run.result;s.plans.unshift(candidate);run.planId=candidate.id;if(run.trialId){const trial=s.trials.find(t=>t.id===run.trialId);if(trial.status==='active'&&trial.revision===run.revision)trial.latestPlanId=candidate.id;}}
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
  function launch(req,run){
    try{
      const worker=workerFactory({executionData:run.executionData,revision:run.revision,conditions:run.conditions,calculatedAt:run.conditions.ruleEvaluationAt||run.createdAt});
      const timer=setTimeout(()=>stop(run.id,req,'timed_out',{failure:{code:'time_limit',message:'达到计算时限；超时不代表无可行排法，可另开计算。'}}),runTimeoutMs);
      activeWorkers.set(run.id,{worker,timer});
      worker.on('message',message=>{
        if(message?.kind==='progress'){
          const current=read(),r=current.runs?.find(r=>r.id===run.id);if(!r||terminal.has(r.status)||stopping.has(run.id)||r.startedAt)return;
          r.status='running';r.phase='计算中';r.startedAt=new Date().toISOString();record(current,req,'run_started',r.id,{snapshotHash:r.snapshotHash});write(current);
        }else if(message?.kind==='result'&&message.plan&&Array.isArray(message.plan.tasks)&&Array.isArray(message.plan.findings))finish(run.id,req,message.plan.resultAssessment?.status==='partial-unplanned'||message.plan.findings.length?'partial':'completed',{result:message.plan});
        else if(message?.kind==='failure')finish(run.id,req,'failed',{failure:{code:'calculation_error',message:'计算发生内部错误，请展开详情并联系维护人员。'}});
        else finish(run.id,req,'failed',{failure:{code:'invalid_worker_message',message:'计算返回内容不完整，未保存结果。'}});
      });
      worker.on('error',()=>finish(run.id,req,'failed',{failure:{code:'worker_error',message:'计算线程失败，未保存结果；可另开计算。'}}));
      worker.on('exit',()=>finish(run.id,req,'failed',{failure:{code:'worker_exit',message:'计算线程在返回结果前退出；可另开计算。'}}));
    }catch{finish(run.id,req,'failed',{failure:{code:'worker_start',message:'无法启动计算线程；可另开计算。'}});}
  }
  async function stop(id,req,status,details){
    if(stopping.has(id))return stopping.get(id);
    const s=read(),run=s.runs?.find(r=>r.id===id);if(!run||terminal.has(run.status))return;
    const job=activeWorkers.get(id);
    run.status=status==='cancelled'?'cancel_requested':'stopping';run.phase=status==='cancelled'?'已请求取消，正在停止计算':'达到时限，正在停止计算';run.stopRequestedAt=new Date().toISOString();
    record(s,req,'run_stop_requested',id,{requestedOutcome:status,snapshotHash:run.snapshotHash});write(s);
    if(job)clearTimeout(job.timer);
    // Persist intent before terminating. Late results/progress/exit cannot win once stop owns the run.
    const pending=Promise.resolve().then(()=>job?.worker.terminate()).then(()=>{
      stopping.delete(id);activeWorkers.delete(id);finish(id,req,status,details);
    },()=>{
      stopping.delete(id);activeWorkers.delete(id);finish(id,req,'failed',{failure:{code:'termination_unconfirmed',message:'无法确认计算线程已停止，请联系维护人员；本次不保存结果。'}});
    });stopping.set(id,pending);return pending;
  }
  router.post('/runs',permission('calculate'),(req,res)=>{
    if(activeWorkers.size>=2)return res.status(429).json({error:'run_capacity',message:'最多同时计算两次，请稍后另开计算。'});
    const prepared=prepare(req,res);if(!prepared)return;const {s,run}=prepared;
    record(s,req,'run_created',run.id,{inputVersionId:run.inputVersionId,snapshotHash:run.snapshotHash,conditions:run.conditions});write(s);launch(req,run);
    res.status(202).json(publicRun(read().runs.find(r=>r.id===run.id)));
  });
  router.post('/runs/:id/retry',permission('calculate'),(req,res)=>{
    if(activeWorkers.size>=2)return res.status(429).json({error:'run_capacity'});
    const s=read(),old=s.runs?.find(r=>r.id===req.params.id);if(!old)return res.status(404).json({error:'run_not_found'});
    if(!terminal.has(old.status))return res.status(409).json({error:'run_active',message:'请等原运行结束后再复查。'});
    const original=s.inputVersions?.[old.inputVersionId];
    if(!original||inputHash(original.data)!==old.inputVersionId||inputHash({conditions:old.conditions,executionData:old.executionData})!==old.snapshotHash)return res.status(409).json({error:'historical_inputs_unavailable',message:'原始输入记录不完整，不能复算。'});
    if(old.trialId&&s.trials?.find(t=>t.id===old.trialId)?.status!=='active')return res.status(409).json({error:'trial_discarded'});
    if(old.trialId){const t=s.trials.find(t=>t.id===old.trialId);if(old.revision!==t.revision||inputHash(old.conditions.taskPositions||{})!==inputHash(t.locks||{}))return res.status(409).json({error:'stale_trial_positions'});}
    if(old.conditions.executionFactsVersion!==inputHash(executionState(s.data)))return res.status(409).json({error:'current_execution_changed',message:'当前执行事实已变化；请从当前事实另开计算，原记录保留。'});
    const run={id:randomUUID(),retryOf:old.id,status:'queued',phase:'等待计算线程',createdAt:new Date().toISOString(),revision:old.revision,trialId:old.trialId,sourcePlanId:old.sourcePlanId,lockSnapshot:structuredClone(old.lockSnapshot||{}),inputVersionId:old.inputVersionId,executionData:structuredClone(old.executionData),sourceMap:structuredClone(old.sourceMap||{}),conditions:structuredClone(old.conditions),snapshotHash:old.snapshotHash,timeoutMs:runTimeoutMs,actor:actorKey(req),requestId:requestId(req),reason:req.body.reason.trim()};
    s.runs.unshift(run);record(s,req,'run_created',run.id,{retryOf:old.id,inputVersionId:run.inputVersionId,snapshotHash:run.snapshotHash});write(s);launch(req,run);res.status(202).json(publicRun(read().runs.find(r=>r.id===run.id)));
  });
  router.post('/runs/:id/cancel',permission('calculate'),async(req,res,next)=>{try{
    const run=read().runs?.find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:'run_not_found'});
    if(terminal.has(run.status))return res.status(409).json({error:'run_finished',status:run.status});
    await stop(run.id,req,'cancelled',{failure:{code:'user_cancelled',message:'用户取消，计算线程已终止；未保存结果。'}});
    res.json(publicRun(read().runs.find(r=>r.id===run.id)));
  }catch(e){next(e);}});
  // Compatibility: this route computes synchronously and reports only a terminal
  // state. It never advertises cancellability or pretends to be a long task.
  router.post('/calculate',permission('calculate'),(req,res)=>{
    const prepared=prepare(req,res);if(!prepared)return;const {s,run}=prepared;
    try{
      const result=calculate(run.executionData,run.revision,run.createdAt,run.conditions),plan=makePlan(result,run,s);
      run.status=result.resultAssessment?.status==='partial-unplanned'||result.findings.length?'partial':'completed';run.phase='同步计算完成';run.finishedAt=new Date().toISOString();run.planId=plan.id;
      run.durationMs=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.createdAt));s.plans.unshift(plan);if(run.trialId){const trial=s.trials.find(t=>t.id===run.trialId);trial.latestPlanId=plan.id;}record(s,req,'calculate',plan.id,{runId:run.id,snapshotHash:run.snapshotHash});write(s);res.status(201).json(plan);
    }catch(e){
      run.status='failed';run.phase='同步计算失败';run.finishedAt=new Date().toISOString();run.failure={code:'calculation_error',message:'同步计算失败，未保存结果。'};
      if(e.protection)run.failure={code:'calculated_protection_conflict',message:'候选未通过执行保护，未保存方案；原输入、事实与锁定保留。',protection:e.protection};
      run.durationMs=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.createdAt));record(s,req,'run_failed',run.id,{failure:run.failure});write(s);res.status(e.protection?409:500).json({error:run.failure.code,runId:run.id,...(e.protection?{protection:e.protection}:{})});
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
    if(p.trialId&&p.conditions?.executionFactsVersion!==inputHash(executionState(s.data)))return res.status(409).json({error:'current_execution_changed'});
    if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});
    const run=p.runId?s.runs?.find(r=>r.id===p.runId):null;
    if(p.runId&&(!run||run.snapshotHash!==p.snapshotHash||inputHash({conditions:run.conditions,executionData:run.executionData})!==p.snapshotHash||!inputs(s,p)))return res.status(409).json({error:'historical_inputs_unavailable'});
    const execution=run?.executionData;
    const verification=independentlyVerifyPlan(p,execution?.orders??s.data.orders,execution?.routes??s.data.routes,p.rules,new Date().toISOString(),execution,run?.conditions);
    const protection=protectCalculatedTasks(p,p,execution||s.data,run?.conditions||p.conditions,p.lockSnapshot||{});
    verification.protection=protection;
    verification.findings.push(...protection.issues);
    const source={domain:p.trialId?'trial:'+p.trialId:'current',inputVersionId:p.inputVersionId,revision:p.revision,checkedAt:verification.checkedAt,scope:run?.conditions};
    p.verification={...verification,findings:verification.findings.map(f=>execution?bindProblemSource(f,source,inputs(s,p)?.data,run.sourceMap||{},inputs(s,p)?.csvSources):f),contentHash:contentHash(p)};if(p.verification.checks.calendar)p.verification.checks.calendar.findings=p.verification.findings.filter(f=>f.sourceRead==='frozen-calendar-v1');record(s,req,'edit',p.id,{kind:'verify'});write(s);res.json(p);
  });
  router.get('/plans/:id/review',permission('read'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    const confirmation=s.confirmations?.find(c=>c.planId===p.id)||null;
    if(confirmation&&!validConfirmation(confirmation))return res.status(409).json({error:'protected_history_unavailable'});
    const review=reviewPlan(s,p),handoff=assessHandoff(s,p.id);
    const acknowledgements=new Set(['PARTIAL_LIST_REQUIRED','CONDITIONAL_SUPPLY_ACK_REQUIRED','SCOPE_ACK_REQUIRED']);
    const blockers=[...review.blockers];for(const b of handoff.blockers)if(!acknowledgements.has(b.code)&&!blockers.some(x=>x.code===b.code))blockers.push(b);
    res.json({...review,blockers,handoff,workflow:s.workflows?.[p.id]||{revision:0,state:p.status,events:[]},confirmation});
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
    // This data gate is additional to the fresh reviewPlan above. It never authorizes a write.
    let handoff=null;
    if(['submit','confirm'].includes(action)){
      handoff=assessHandoff(s,p.id,{allowPartial:req.body.acceptPartial,unplannedIds:req.body.unplannedIds,acceptConditionalSupply:req.body.acceptConditionalSupply,acknowledgeScope:req.body.acknowledgeScope});
      if(!handoff.dataGatePassed)return res.status(409).json({error:'handoff_data_blocked',blockers:handoff.blockers});
    }
    const at=new Date().toISOString(),actor=actorKey(req);
    const event={id:randomUUID(),action,at,actor,role:req.member.role,reason:req.body.reason.trim(),requestId:requestId(req),reviewHash:review.reviewHash,contentHash:contentHash(p)};
    if(action==='submit'){
      if(!p.verification||p.verification.contentHash!==contentHash(p))return res.status(409).json({error:'verification_required'});
      w.submission={...event,id:randomUUID(),inputVersionId:p.inputVersionId,contentHash:contentHash(p),review,handoff,decision:{allowPartial:req.body.acceptPartial===true,unplannedIds:[...req.body.unplannedIds],acceptConditionalSupply:req.body.acceptConditionalSupply===true,acknowledgeScope:req.body.acknowledgeScope===true}};
      w.submissions??=[];w.submissions.push(structuredClone(w.submission));
      w.state='submitted';p.status='submitted';
    }else if(action==='return'){w.state='returned';p.status='draft';}
    else if(action==='confirm'){
      p.status='confirmed';w.state='confirmed';
      const snapshot=structuredClone({plan:p,originalInput:inputs(s,p).data,run:s.runs.find(r=>r.id===p.runId),submission:w.submission,review,handoff,decision:event});
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
  router.get('/reports',permission('read'),(req,res)=>{
    try{res.json(querySavedReport(read(),JSON.parse(req.query.query)));}
    catch(e){res.status(e.status||400).json({error:e.status?e.message:'invalid_report_query'});}
  });
  router.post('/export',permission('export'),(req,res)=>{
    const s=read();let csv,target;
    if(req.body.report){
      try{
        if(Object.keys(req.body).some(k=>!['report','reportSnapshot','viewId','reason'].includes(k)))return res.status(400).json({error:'invalid_report_export'});
        const current=querySavedReport(s,req.body.report),r=req.body.reportSnapshot??current;
        // Check the entire object shown by React, then compare it with the current saved view.
        const nativeCsv=savedReportCsv(r);
        if(r.viewId!==current.viewId)return res.status(409).json({error:'stale_report',message:'查询快照已变化，请重新查询后导出'});
        if(req.body.viewId!==r.viewId)return res.status(409).json({error:'stale_report',message:'查询快照已变化，请重新查询后导出'});
        record(s,req,'export',r.provenance.planId,{query:r.query,viewId:r.viewId,inputVersionId:r.provenance.inputVersionId,snapshotHash:r.provenance.snapshotHash});write(s);
        return res.set('Content-Disposition','attachment; filename="FR035.csv"').type('text/csv').send('\ufeff'+nativeCsv);
      }catch(e){return res.status(e.message==='report_changed'?409:e.status||400).json({error:e.message==='report_changed'?'report_changed':e.status?e.message:'invalid_report_query'});}
    }
    if(req.body.confirmationId){
      const c=s.confirmations?.find(c=>c.id===req.body.confirmationId);if(!c)return res.status(404).json({error:'confirmation_not_found'});
      if(!validConfirmation(c))return res.status(409).json({error:'protected_history_unavailable'});
      record(s,req,'export',c.planId,{confirmationId:c.id,snapshotHash:c.snapshotHash});write(s);return res.type('application/json').send(JSON.stringify({...c,workflow:s.workflows?.[c.planId]},null,2));
    }
    if(req.body.resourceLoad){
      const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});
      const w=req.body.resourceLoad;
      if(!validInterval(w.start,w.end)||!['all','machines','resources','materials','alerts'].includes(w.kind))return res.status(400).json({error:'invalid_load_view'});
      csv=loadCsv(resourceLoad({...p,inputSnapshot:inputs(s,p)?.data??null,inputCsvSources:inputs(s,p)?.csvSources??null},w),w.kind);target=p.id;
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
    else if(req.body.planId){const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});if(req.body.ruleSettings===true){if(p.trialId&&p.conditions?.executionFactsVersion!==inputHash(executionState(s.data)))return res.status(409).json({error:'current_execution_changed'});
    if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});const fields=['id','category','name','enabled','active','status','scope','effectiveFrom','parameters'];csv=[['运行编号',p.runId||'旧方案无记录'],['运行快照',p.snapshotHash||'旧方案无记录'],['计算条件',p.conditions?JSON.stringify(p.conditions):'旧方案无记录'],['能力版本',p.ruleSnapshot.capabilityVersion],['计算时刻',p.ruleSnapshot.at],['输入版本',p.inputVersionId],['始终执行',p.ruleSnapshot.intrinsicChecks.join('；')],['独立复核范围',p.ruleSnapshot.independentChecks.join('；')],['说明',p.ruleSnapshot.note],fields,...p.ruleSnapshot.settings.map(r=>fields.map(f=>typeof r[f]==='object'?JSON.stringify(r[f]):String(r[f])))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}else csv=exportSupplyPlanCsv(p)+'\r\n'+resultCsv(s.runs?.find(r=>r.id===p.runId),p);if(p.conditions){const scope=p.conditions.checkScope;csv=[['运行编号',p.runId],['运行快照',p.snapshotHash],['计算条件',JSON.stringify(p.conditions)],['检查范围',scope?JSON.stringify(scope):'旧方案无记录']].map(row=>row.map(v=>'\"'+String(v).replace(/\"/g,'\"\"')+'\"').join(',')).join('\r\n')+'\r\n'+csv;}target=p.id;}
    else{const d=defs.find(d=>d.key===req.body.table);if(!d)return res.status(404).json({error:'unknown_table'});csv=[d.fields,...(s.data[d.key]||[]).map(r=>d.fields.map(f=>r[f]||''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');target=d.key;}
    if(req.body.planId||req.body.runId){const saved=s.plans.find(x=>req.body.planId?x.id===req.body.planId:x.runId===req.body.runId);if(saved?.conditions?.executionResourceContract){const ledger={kind:'MOCK 明确模拟；非现场实账',contract:saved.conditions.executionResourceContract,version:saved.conditions.executionResourceVersion,events:inputs(s,saved)?.data?.originalResourceEvents||[],protection:saved.originalResourceProtection||[]};csv+='\r\n'+['MOCK取得归还释放账',JSON.stringify(ledger)].map(v=>'"'+v.replaceAll('"','""')+'"').join(',');}}
    record(s,req,'export',target,req.body.query?{query:req.body.query}:req.body.resourceLoad?{resourceLoad:req.body.resourceLoad}:{});write(s);res.type('text/csv').send('\ufeff'+csv);
  });
  router.use((_req,res)=>res.status(404).json({error:'unsupported_action'}));
  router.use((err,_req,res,_next)=>{console.error('business request failed',err.code||'internal_error');res.status(500).json({error:'internal_error'});});
  return router;
}
