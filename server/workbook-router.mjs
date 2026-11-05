import {registerUrgentOrders} from './urgent-order-routes.mjs';
import {registerScenarioCompare} from './scenario-compare-routes.mjs';
import {registerMpsReportRoutes} from './mps-report-routes.mjs';
import {registerSimulatorRoutes} from './simulator/routes.mjs';
import {defs as csvDefs} from './planner.ts';
import {parameterMaintenanceUnit} from './parameter-maintenance.mjs';
import {relationParameterHelp} from './parameter-help.mjs';
import {equipmentDomain} from './workbook-equipment.mjs';
import {registerWorkbookQueryReportRoutes} from './workbook-query-report-routes.mjs';
import {readWorkbookPreview} from './workbook-preview-query.mjs';
import {buildWorkbookPreview,PreviewError,fail} from './workbook-preview.mjs';
import {registerWorkbookPreviewRoutes} from './workbook-preview-routes.mjs';
import {workbookTables} from './parameter-workbook-export.mjs';
import {registerWorkbookConversions} from './workbook-conversion.mjs';
import {importBinding,bindPreview,commitBinding,sourceIdentity} from './workbook-workbench.mjs';
import {changeParameter,cpOf,specification,objectKey,effectiveParameters,sourceRole} from './parameter-contract.mjs';
import {registerParameterRoutes} from './parameter-router.mjs';
import {supplyReadiness,transitIdentityIssues} from './workbook-supply.mjs';
import {gzipSync} from 'node:zlib';
import {createWorkbookSnapshotReader} from './workbook-snapshot-reader.mjs';
import {registerWorkbookRuns} from './workbook-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {Router} from 'express';
import {hash,workbookSchema,refreshDerived,validateWorkbook,workbookReadiness,rows,procurement,PROFILE} from './workbook-model.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
export function createWorkbookRouter({dataDir,permission,actorKey,requestId,workerFactory,previewAccess=()=>({canEdit:false,canExport:false,csrfVerified:false}),importHeapMiB=180,solverEnvironment=null,scenarioEnvironment=null}) {
 if(!Number.isSafeInteger(importHeapMiB)||importHeapMiB<32||importHeapMiB>512)throw Error('Invalid workbook import heap limit');
 const router=Router(),dir=path.join(dataDir,'workbooks');fs.mkdirSync(dir,{recursive:true});const stateFile=path.join(dir,'state.json'),workers=new Map();
 const readState=createWorkbookSnapshotReader(dir,{compressed:false,maxEntries:1,maxBytes:12*1024*1024});
 const read=()=>{try{return readState('state.json');}catch(e){if(e.code!=='ENOENT')throw e;return {datasets:[],previews:[],runs:[],records:[]};}};
 const write=s=>{const tmp=stateFile+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,Buffer.from(JSON.stringify(s)),{flag:'wx',mode:0o600});fs.renameSync(tmp,stateFile);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}};
 const audit=(s,req,action,detail)=>s.records.push({id:randomUUID(),at:new Date().toISOString(),actor:actorKey(req),requestId:requestId(req),action,reason:req.body.reason,...detail});
 const recover=read();let interrupted=false;for(const r of recover.runs)if(['queued','running','cancelling'].includes(r.status)){r.status='failed';r.failure='应用进程中断；冻结输入保留，可重新创建运行';interrupted=true;}if(interrupted)write(recover);
 const snapshot=createWorkbookSnapshotReader(dir);
 const persist=d=>{const ref=randomUUID()+'.json.gz';fs.writeFileSync(path.join(dir,ref),gzipSync(Buffer.from(JSON.stringify(d))),{flag:'wx',mode:0o600});return ref;};
 const tableRefs=(d,ref)=>{const refs={};for(const [table,values]of Object.entries(d.tables)){const file=ref+'.'+hash(table).slice(0,16)+'.gz';fs.writeFileSync(path.join(dir,file),gzipSync(Buffer.from(JSON.stringify(values))),{flag:'wx',mode:0o600});refs[table]=file;}return refs;};
 const meta=(s,id,v)=>{const set=s.datasets.find(d=>d.id===id),base=v?set?.versions.find(d=>d.version===Number(v)):set?.versions.at(-1);return base?(set.parameterWorkspaces?.[base.version]||base):undefined;};
 const dataset=(s,id,v)=>{const entry=meta(s,id,v);return entry?snapshot(entry.ref):undefined;};
 const summary=d=>({parameterRevision:d.parameterRevision||0,parameterBaseline:d.parameterBaseline,productionContract:d.productionContract,datasetVersion:d.datasetVersion,timeUnit:d.timeUnit,minuteOrigin:d.minuteOrigin,classification:d.classification,warnings:d.warnings,drafts:d.drafts||[],bomLossProfiles:d.bomLossProfiles||[],id:d.id,name:d.name,version:d.version,fileHash:d.fileHash,profile:d.profile,createdAt:d.createdAt,parameterContract:d.parameterContract,parameterCounts:d.parameterCounts,parameterClassification:d.parameterClassification,parameterSources:d.parameterSources,...sourceIdentity(d),mappingVersion:d.mapping?.version,readiness:supplyReadiness(d)});
 const handle=fn=>(req,res,next)=>{Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(res.headersSent)return next(e);const traceId=requestId(req),code=e instanceof PreviewError||e.name==='SolverProblem'?e.code:'workbook_invalid';if(code.startsWith('WORKBOOK_IMPORT')||code==='INPUT_TOO_LARGE')console.error(JSON.stringify({event:'workbook_import_error',traceId,code,detail:e.detail||{},exitCode:e.detail?.exitCode,signal:e.detail?.signal}));res.status(e instanceof PreviewError?e.status:422).json({error:code,message:e.message,...(e instanceof PreviewError?e.detail:e.name==='SolverProblem'?{details:e.details}:{}),traceId});});};
 let importBusy=false;
 const maintenanceEntries={route:{id:'existing-workbook-process-route',table:'工艺路线',origin:'existing',verification:'SOURCE_WIRED_NOT_RUNTIME_VERIFIED',handler:()=>({table:'工艺路线',exactField:'成品编号'})}};
 const inspect=data=>new Promise((resolve,reject)=>{const child=fork(new URL('./workbook-import-worker.mjs',import.meta.url),[],{execArgv:['--max-old-space-size='+importHeapMiB],stdio:['ignore','ignore','pipe','ipc']});let message,stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4096);});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new PreviewError('WORKBOOK_IMPORT_TIMEOUT',422,{message:'整本解析超过60秒，文件尚未导入；请检查工作簿规模或联系维护人员。'}));},60000);child.once('message',m=>message=m);child.once('error',e=>{clearTimeout(timer);reject(new PreviewError('WORKBOOK_IMPORT_PROCESS',422,{message:'解析进程启动失败：'+e.message}));});child.once('exit',(code,signal)=>{clearTimeout(timer);if(code===0&&message?.kind==='result')return resolve(message.summary);if(message?.message)return reject(new PreviewError('WORKBOOK_IMPORT_INVALID',422,{message:message.message}));if(/heap out of memory|reached heap limit/i.test(stderr))return reject(new PreviewError('WORKBOOK_IMPORT_MEMORY_LIMIT',422,{message:`工作簿解析超过 ${importHeapMiB} MiB 内存上限，文件尚未导入；请使用当前按日版业务文件，或联系维护人员检查容量。`,exitCode:code,signal}));reject(new PreviewError('WORKBOOK_IMPORT_INTERRUPTED',422,{message:'解析进程中断，文件尚未导入；请凭追踪号联系维护人员。',exitCode:code,signal}));});child.send(data);});
 router.get('/business/template',permission('export'),(_req,res)=>res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('业务数据空白模板.xlsx').send(workbookTables(Object.entries(workbookSchema.tables).filter(([,s])=>s.kind==='输入').map(([table,s])=>[table,s.fields.map(f=>f.name),[]]))));
 router.get('/simulation',permission('read'),(_req,res)=>res.json(JSON.parse(fs.readFileSync(new URL('./workbook-simulation.json',import.meta.url),'utf8'))));
 router.get('/schema',permission('read'),(_req,res)=>res.json(workbookSchema));
 router.get('/datasets',permission('read'),(_req,res)=>res.json(read().datasets.map(s=>{const m=s.parameterWorkspaces?.[s.versions.at(-1).version]||s.versions.at(-1);return {parameterRevision:m.parameterRevision||0,id:m.id,name:m.name,version:m.version,fileHash:m.fileHash,profile:m.profile,createdAt:m.createdAt,mappingVersion:m.mappingVersion,readiness:m.readiness};})));
 router.get('/datasets/:id',permission('read'),handle((req,res)=>{const s=read(),m=meta(s,req.params.id,req.query.version);if(!m)return res.status(404).json({error:'dataset_not_found'});const visible=m.classification?m:{...m,...summary(snapshot(m.ref))};const {ref,tableRefs,parameterBindings,...publicMeta}=visible;res.json({...publicMeta,versions:s.datasets.find(s=>s.id===m.id).versions.map(v=>v.version)});}));
 router.get('/datasets/:id/rows',permission('read'),handle((req,res)=>{const m=meta(read(),req.params.id,req.query.version);if(!m)return res.status(404).json({error:'dataset_not_found'});const table=String(req.query.table);if(!workbookSchema.tables[table])throw Error('未知业务表');const values=m.tableRefs?.[table]?snapshot(m.tableRefs[table]):rows(snapshot(m.ref),table),filter=String(req.query.q||''),field=String(req.query.sort||''),offset=Math.max(0,Number(req.query.offset)||0),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));if(req.query.exactField&&!workbookSchema.tables[table].fields.some(f=>f.name===req.query.exactField))throw Error('未知精确定位字段');let result=values.filter(r=>req.query.exactField?String(r[String(req.query.exactField)]??'')===String(req.query.exactValue??''):!filter||(filter.startsWith('#row:')?r._row===Number(filter.slice(5)):Object.values(r).some(v=>typeof v==='string'&&v.includes(filter))));if(field)result.sort((a,b)=>String(a[field]??'').localeCompare(String(b[field]??''),'zh-CN',{numeric:true}));const page=result.slice(offset,offset+limit);res.json({datasetId:m.id,version:m.version,table,total:result.length,offset,rows:page,bindings:m.parameterBindings?.[table]||(!m.tableRefs?(snapshot(m.ref).bindings||[]).filter(b=>b.sheet===table):[]),kind:workbookSchema.tables[table]?.kind,...(req.query.help==='parameters'?{fieldHelp:relationParameterHelp(table,workbookSchema.tables[table].fields,{productionContract:m.productionContract})}:{})});}));
 router.get('/datasets/:id/source',permission('export'),handle((req,res)=>{const m=meta(read(),req.params.id,req.query.version);if(!m)return res.status(404).end();res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(fs.readFileSync(path.join(dir,m.fileHash+'.xlsx')));}));
 router.post('/preview',permission('edit'),handle(async(req,res)=>{
  if(typeof req.body.fileBase64!=='string'||req.body.fileBase64.length>17*1024*1024)throw Error('请选择12MB以内的整本xlsx');const buffer=Buffer.from(req.body.fileBase64,'base64'),fileHash=hash(buffer),id=String(req.body.datasetId||randomUUID());
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('数据集编号无效');const before=read(),old=before.datasets.find(s=>s.id===id)?.versions.at(-1),expectedVersion=old?.version||0;
  const binding=importBinding(req.body,{id,expectedVersion,exists:!!old,actor:actorKey(req)});
  if(binding.error)return res.status(binding.status).json(binding);
  if(importBusy)return res.status(429).json({error:'import_busy',message:'正在解析另一整本文件，请稍后重试'});
  const ignored=Array.isArray(req.body.ignore)?req.body.ignore:[],dataRef=randomUUID()+'.json.gz',oldEntry=meta(before,id);let checked;importBusy=true;
  const sourcePath=path.join(dir,fileHash+'.xlsx');if(!fs.existsSync(sourcePath))fs.writeFileSync(sourcePath,buffer,{flag:'wx',mode:0o600});
  try{checked=await inspect({sourcePath,oldRef:oldEntry?path.join(dir,oldEntry.ref):null,dataPath:path.join(dir,dataRef),id,name:String(binding.importKind==='parameter'?old?.name:req.body.name||old?.name||'新Excel数据集').slice(0,100),fileName:String(req.body.fileName||req.body.name||'').slice(0,200),expectedVersion,fileHash,ignored,adoptParameters:req.body.adoptParameters===true,actor:actorKey(req),importKind:binding.importKind,overlayResolution:binding.overlayResolution});}finally{importBusy=false;}
  const transitRef=checked.tableRefs?.['既有采购在途'];if(transitRef){const identityIssues=transitIdentityIssues(snapshot(transitRef));checked.issues.push(...identityIssues);if(identityIssues.length)checked.readiness={...checked.readiness,ready:false,issues:[...checked.readiness.issues,...identityIssues]};}
  const preview={expectedParameterRevision:oldEntry?.parameterRevision||0,id:randomUUID(),datasetId:id,fileHash,expectedVersion,schemaVersion:workbookSchema.version,name:String(binding.importKind==='parameter'?old?.name:req.body.name||old?.name||'新Excel数据集').slice(0,100),profile:checked.sourceProfile||PROFILE,...checked,status:'preview',dataRef,ignored,importKey:hash({datasetId:id,fileHash,importKind:binding.importKind||'legacy',expectedVersion,mode:binding.mode,scope:binding.scope,overlayResolution:binding.overlayResolution}),...binding};
  preview.owner=actorKey(req);preview.snapshotHash=hash(snapshot(dataRef));bindPreview(preview);
  preview.previewModule=buildWorkbookPreview(preview,{data:snapshot(dataRef),before:oldEntry?snapshot(oldEntry.ref):null,maintenanceEntries});
  const current=read();if((current.datasets.find(s=>s.id===id)?.versions.at(-1)?.version||0)!==expectedVersion)return res.status(409).json({error:'preview_stale',message:'解析期间目标版本已变化，请重新预览'});
  if(!fs.existsSync(path.join(dir,fileHash+'.xlsx')))fs.writeFileSync(path.join(dir,fileHash+'.xlsx'),buffer,{flag:'wx',mode:0o600});
  current.previews.push(preview);audit(current,req,'workbook_preview',{previewId:preview.id,datasetId:id,fileHash});write(current);res.json(readWorkbookPreview(preview,{},'summary',previewAccess(req)));
 }));
 router.get('/previews/:id',permission('read'),(req,res)=>{const p=read().previews.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'preview_not_found'});if(!p.previewModule)return res.status(410).json({error:'legacy_preview_requires_reimport'});res.json(readWorkbookPreview(p,{},'summary',previewAccess(req)));});
 // All state mutations are synchronous read/validate/write turns on this single
 // process. No await occurs within confirmation; write() atomically renames once.
 // Multiple server processes sharing a dataDir require an external common lock.
 const applyImport=(s,p,body,req)=>{
  const conflict=commitBinding(p,body,actorKey(req));if(conflict)fail(conflict.toUpperCase());
  if(p.fileHash!==body.fileHash||p.expectedVersion!==body.expectedVersion||(s.datasets.find(d=>d.id===p.datasetId)?.versions.at(-1)?.version||0)!==p.expectedVersion)fail('TARGET_CHANGED');
  if((meta(s,p.datasetId)?.parameterRevision||0)!==(p.expectedParameterRevision||0))fail('TARGET_CHANGED',409,{message:'预览后配置已修改，请重新预览，避免覆盖在线修改。'});
  const verified=snapshot(p.dataRef);
  if(p.snapshotHash&&hash(verified)!==p.snapshotHash||verified.id!==p.datasetId||verified.version!==p.expectedVersion+1)fail('PREVIEW_DATA_CHANGED');
  const identityIssues=transitIdentityIssues(rows(verified,'既有采购在途'));
  if(p.issues.length||identityIssues.length)fail('VALIDATION_BLOCKED',422,{blockingReports:p.issues.length+identityIssues.length});
  let set=s.datasets.find(d=>d.id===p.datasetId);if(!set){set={id:p.datasetId,versions:[],imports:[]};s.datasets.push(set);}const imported={parameterRevision:verified.parameterRevision||0,parameterBaseline:verified.parameterBaseline,productionContract:p.productionContract,datasetVersion:p.datasetVersion,timeUnit:p.timeUnit,minuteOrigin:p.minuteOrigin,id:p.datasetId,name:p.name,version:p.expectedVersion+1,fileHash:p.sourceFileHash||p.fileHash,parameterCounts:p.parameterCounts,parameterClassification:p.parameterClassification,parameterSources:p.parameterSources,parameterContract:p.parameterContract,sourceFiles:p.sourceFiles,overlay:p.overlay,mappingHash:p.mappingHash,parameterHash:p.parameterHash,profile:p.profile,createdAt:p.createdAt,readiness:p.readiness,classification:p.classification,warnings:p.warnings,tableRefs:p.tableRefs,parameterBindings:p.parameterBindings,drafts:p.drafts||[]};set.versions.push({...imported,ref:p.dataRef});p.status='committed';p.version=imported.version;const result={previewId:p.id,datasetId:p.datasetId,fileHash:p.fileHash,version:p.version,status:'committed',importKey:p.importKey};set.imports.push(result);audit(s,req,'workbook_committed',result);return result;
 };
 router.post('/commit',permission('edit'),handle((req,res)=>{const s=read(),p=s.previews.find(p=>p.id===req.body.previewId);if(!p)return res.status(404).json({error:'preview_not_found'});
  if(p.previewModule)return res.status(409).json({error:'module_confirmation_required',message:'请使用整批预览确认入口并提交完整快照与确认凭据'});
  const conflict=commitBinding(p,req.body,actorKey(req));if(conflict)return res.status(409).json({error:conflict,message:'预览绑定已变化，请保留草稿重新预览'});
  if(p.fileHash!==req.body.fileHash||p.expectedVersion!==req.body.expectedVersion)return res.status(409).json({error:'preview_stale',message:'预览指纹或期望版本不符'});
  const prior=s.datasets.find(d=>d.id===p.datasetId)?.imports?.find(i=>p.importKey?i.importKey===p.importKey:i.fileHash===p.fileHash);if(prior)return res.json({...prior,idempotent:true});
  if(p.fileHash!==req.body.fileHash||p.expectedVersion!==req.body.expectedVersion||(s.datasets.find(s=>s.id===p.datasetId)?.versions.at(-1)?.version||0)!==p.expectedVersion)return res.status(409).json({error:'preview_stale',message:'目标版本已变化，请重新预览'});
  const result=applyImport(s,p,req.body,req);write(s);res.json({...result,readiness:p.readiness});
 }));
 registerWorkbookPreviewRoutes(router,{read,write,permission,actorKey,access:previewAccess,applyImport});
 // Mutations, freeze/run, drafts and native exports are registered below.
 registerWorkbookQueryReportRoutes(router,{read,dataset,snapshot,permission,actorKey});
 registerMpsReportRoutes(router,{read,dataset,snapshot,permission,actorKey});
 // #146 reads only the explicitly selected frozen run, never the current P
 // workspace. The independent converter remains owned by APS-Test.
 const readFrozenSource=({runId,expectedInputHash})=>{
  if(typeof runId!=='string'||!runId)fail('SIMULATOR_RUN_REQUIRED',422,{message:'请选择已冻结运行，不自动采用当前数据集。'});
  const r=read().runs.find(r=>r.id===runId);
  if(!r)return fail('SIMULATOR_RUN_NOT_FOUND',404);
  if(!r.inputRef||!r.inputHash)fail('SIMULATOR_FROZEN_INPUT_REQUIRED',409);
  if(expectedInputHash!==undefined&&expectedInputHash!==r.inputHash)fail('SIMULATOR_SOURCE_CHANGED',409);
  const input=snapshot(r.inputRef);
  if(hash(input)!==r.inputHash||input.id!==r.datasetId||input.version!==r.version)fail('SIMULATOR_FROZEN_INPUT_CORRUPT',409);
  if(r.result&&!r.resultHash)fail('SIMULATOR_FROZEN_RESULT_HASH_REQUIRED',409);
  if(r.result&&hash(r.result)!==r.resultHash)fail('SIMULATOR_FROZEN_RESULT_CORRUPT',409);
  // Preserve missing fields and original units/origins. This is a source copy,
  // not a simulator spec, P resolution, BOM calculation or a production write.
  const gaps=[];
  for(const key of ['parameterDefinitions','parameterSources','parameterPrecedence','parameterContext','effectiveParameters','minuteOrigin','timeUnit']){
   if(input[key]===undefined||input[key]===null)gaps.push({path:'input.'+key,status:'MISSING_SOURCE'});
  }
  for(const table of ['物料主数据','物料清单','配置参数']){
   if(!Array.isArray(input.tables?.[table]))gaps.push({path:'input.tables.'+table,status:'MISSING_SOURCE'});
  }
  if(!r.result)gaps.push({path:'plan',status:'NO_FROZEN_PLAN'});
  return {contract:'aps-simulator-frozen-source@1',mode:'INDEPENDENT',linked:false,conversionStatus:'NOT_CONVERTED',conversionOwner:'APS-Test',
   run:{id:r.id,datasetId:r.datasetId,version:r.version,status:r.status,inputHash:r.inputHash,resultHash:r.resultHash,selection:r.selection,provenance:r.provenance},
   input,plan:r.result??null,workbookSchema:structuredClone(workbookSchema),gaps};
 };
 for(const [suffix,action]of [['','read'],['/export','export']])router.get('/simulator/source-copy/:runId'+suffix,permission(action),handle((req,res)=>{
  const source=readFrozenSource({runId:req.params.runId,expectedInputHash:req.query.inputHash});
  if(action==='export')return res.type('application/json').attachment('simulator-frozen-source.json').send(JSON.stringify(source));
  res.json(source);
 }));
 // permission('edit') is the existing role + trusted-write/CSRF + reason
 // middleware in business.mjs; do not replace it with an unconditional next.
 registerSimulatorRoutes(router,{root:path.resolve(dataDir,'independent-simulator'),permission,actorKey,writeGuard:permission('edit'),workbookSchema,csvDefs,readFrozenSource});
 registerWorkbookQueryReportRoutes(router,{read,dataset,snapshot,permission,actorKey},equipmentDomain,'/equipment');
 registerWorkbookConversions(router,{read,write,dataset,audit,summary,handle,permission,persist,snapshot,meta,tableRefs});
 registerUrgentOrders(router,{read,write,dataset,audit,permission,workerFactory,workers,persist,snapshot,meta,actorKey,solverEnvironment});
 registerScenarioCompare(router,{read,write,dataset,audit,permission,workerFactory,workers,persist,snapshot,meta,actorKey,solverEnvironment,scenarioEnvironment});
 return registerOperations(router,{read,write,dataset,audit,summary,handle,permission,workerFactory,workers,persist,snapshot,meta,tableRefs,actorKey,solverEnvironment});
}
function rowKey(table,r){return table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[workbookSchema.tables[table]?.key]);}

function registerOperations(router,ctx) {
 const {read,write,dataset,audit,summary,handle,permission,workerFactory,workers,persist,snapshot,meta,tableRefs}=ctx;
 function saveVersion(req,res,mutate,{configuration=false}={}){
  const s=read(),d=dataset(s,req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});
  if(req.body.expectedVersion!==d.version)return res.status(409).json({error:'version_conflict',message:'业务输入版本已变化，草稿保留，请刷新比较后重试',actualVersion:d.version});
  const revision=d.parameterRevision||0;
  if(configuration&&req.body.expectedParameterRevision!==revision)return res.status(409).json({error:'parameter_revision_conflict',message:'配置已被修改，草稿保留，请刷新比较后重试',actualVersion:d.version,actualParameterRevision:revision});
  const logCount=(d.parameterChangeLog||[]).length,beforeRow=configuration&&req.body.table?structuredClone(rows(d,req.body.table).find(r=>rowKey(req.body.table,r)===req.body.key)||{}):null;
  const result=mutate(d);if(result?.issues)return res.status(422).json({error:'validation_failed',issues:result.issues});
  refreshDerived(d);const at=new Date().toISOString();
  d.overlay=[...(d.overlay||[]),{version:configuration?d.version:d.version+1,parameterRevision:configuration?revision+1:revision,actor:ctx.actorKey(req),reason:req.body.reason,operation:req.route?.path||'online-edit',at}];
  const issues=[...validateWorkbook(d,{completeness:false}),...transitIdentityIssues(rows(d,'既有采购在途'))];if(issues.length)return res.status(422).json({error:'validation_failed',issues});
  const set=s.datasets.find(set=>set.id===d.id);
  if(configuration){d.parameterRevision=revision+1;d.parameterUpdatedAt=at;const genericChanges=req.body.changes?Object.fromEntries(Object.entries(req.body.changes).filter(([field])=>(d.parameterChangeLog||[]).length===logCount||specification(field)?.table!==req.body.table)):undefined;if(req.body.changes?Object.keys(genericChanges).length:(d.parameterChangeLog||[]).length===logCount)(d.parameterChangeLog??=[]).push({id:randomUUID(),at,actor:ctx.actorKey(req),revision:d.parameterRevision,datasetVersion:d.version,baselineHash:d.parameterBaseline?.fileHash||null,scope:'dataset',operation:req.body.table?'关系维护':'建立试算',table:req.body.table,object:req.body.key,changes:genericChanges,field:genericChanges?Object.keys(genericChanges).join('、'):undefined,before:genericChanges?Object.fromEntries(Object.keys(genericChanges).map(field=>[field,beforeRow?.[field]])):null,after:genericChanges,trial:result?.trial?.name});}else{d.version++;d.createdAt=at;}
  readinessInvalidation(d);
  const ref=ctx.persist(d),entry={...summary(d),ref,tableRefs:ctx.tableRefs(d,ref),parameterBindings:Object.fromEntries(Object.keys(d.tables).map(t=>[t,(d.bindings||[]).filter(b=>b.sheet===t)]))};
  if(configuration){(set.parameterWorkspaces??={})[d.version]=entry;}else set.versions.push(entry);
  audit(s,req,configuration?'parameter_configuration_changed':'workbook_version',{datasetId:d.id,version:d.version,parameterRevision:d.parameterRevision||0});write(s);res.json({...summary(d),...result});
 }
 router.post('/datasets/:id/edit',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{
  const {table,key,changes,operation}=req.body,spec=workbookSchema.tables[table];if(d.parameterContract&&table==='配置参数')throw Error('请使用同源配置参数入口维护对象、scope和有效期');if(!spec||spec.kind!=='输入')throw Error('参考结果只读，不能作为输入维护');let r=rows(d,table).find(r=>rowKey(table,r)===key);
  if(operation==='delete'){if(!r)throw Error('记录不存在');if(Object.entries(d.tables).some(([t,rs])=>t!==table&&workbookSchema.tables[t]?.kind==='输入'&&rs.some(row=>Object.values(row).some(v=>v===r[spec.key]))))throw Error('记录仍被引用，删除被保护');d.tables[table]=rows(d,table).filter(row=>row!==r);return {};}
  if(operation==='create'){if(r)throw Error('编号已存在');r={_row:Math.max(2,...rows(d,table).map(r=>r._row||2))+1,_cells:{},_formulas:{},_origin:'应用新增记录'};d.tables[table].push(r);}else if(!r)throw Error('记录不存在');
  for(const [field,value]of Object.entries(changes||{})){if(!spec.fields.some(f=>f.name===field))throw Error('未知字段 '+field);if(typeof value!=='string'||value.length>2000)throw Error('字段须为文本且不超过2000字');if(operation!=='create'&&field===spec.key&&value!==r[field])throw Error('唯一编号不能原地更改');const binding=d.bindings.find(b=>b.sheet===table&&(b.recordKey?b.recordKey===rowKey(table,r):b.row===r._row)&&b.field===field);if(binding){const literal=rows(d,'配置参数').find(p=>p['参数编号']===binding.parameterId);const p=literal&&(effectiveParameters(d,0).find(p=>p['对象编号']===literal['对象编号']&&p['参数名称']===literal['参数名称'])||literal);if(!p)throw Error('参数来源丢失');if(d.parameterContract)changeParameter(d,{cp:cpOf(p),objectId:p['对象编号'],field:p['参数名称'],id:p['参数编号'],sourceRole:sourceRole(p),sourceFrom:p['生效日'],value,unit:p['单位'],from:p['生效日'],to:p['失效日'],scope:p._scope||'dataset',configuration:req.body.configuration===true,reason:req.body.reason},ctx.actorKey(req));else p['参数值']=value;}else{const atom=d.parameterContract&&specification(field),source=atom?.table===table&&effectiveParameters(d,0).find(p=>p['参数名称']===field&&p['对象编号']===objectKey(r,atom)&&(p._scope||'dataset')==='dataset'&&Number(p['生效日'])<=0&&0<Number(p['失效日']));if(source){changeParameter(d,{cp:atom.cp,objectId:source['对象编号'],field,id:source['参数编号'],sourceRole:sourceRole(source),sourceFrom:source['生效日'],value,unit:source['单位'],from:source['生效日'],to:source['失效日'],scope:'dataset',configuration:req.body.configuration===true,reason:req.body.reason},ctx.actorKey(req));continue;}if(req.body.configuration===true&&atom?.table===table&&!r._formulas?.[field]){changeParameter(d,{cp:atom.cp,objectId:objectKey(r,atom),field,value,unit:parameterMaintenanceUnit(atom,r),from:0,to:44,scope:'dataset',configuration:true,reason:req.body.reason},ctx.actorKey(req));continue;}if(r._formulas?.[field])throw Error('派生字段只读，请维护其输入或统一参数');r[field]=value;if(atom?.table===table){const base=d.parameterBaseFields?.find(b=>b.table===table&&b.object===objectKey(r,atom)&&b.field===field);if(base){base.present=true;base.value=value;}}}}
  return {changedRecord:rowKey(table,r),checksInvalidated:true};
 },{configuration:req.body.configuration===true})));
 router.post('/datasets/:id/mapping',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{if(!req.body.mapping||req.body.mapping.mock!==true||!req.body.mapping.line?.id)throw Error('需显式标记仿真映射及选择单线');d.mapping=structuredClone(req.body.mapping);return {};})));
 registerParameterRoutes(router,{...ctx,saveVersion});
 // RUNS_AND_DRAFTS
 return registerWorkbookRuns(router,{...ctx,saveVersion});
}
function readinessInvalidation(d){d.checkedAt=null;d.checksInvalidated=true;}
