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
import {gzipSync,gunzipSync} from 'node:zlib';
import {registerWorkbookRuns} from './workbook-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {Router} from 'express';
import {hash,workbookSchema,refreshDerived,validateWorkbook,workbookReadiness,rows,procurement,PROFILE} from './workbook-model.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
export function createWorkbookRouter({dataDir,permission,actorKey,requestId,workerFactory,previewAccess=()=>({canEdit:false,canExport:false,csrfVerified:false}),importHeapMiB=180}) {
 if(!Number.isSafeInteger(importHeapMiB)||importHeapMiB<32||importHeapMiB>512)throw Error('Invalid workbook import heap limit');
 const router=Router(),dir=path.join(dataDir,'workbooks');fs.mkdirSync(dir,{recursive:true});const stateFile=path.join(dir,'state.json'),workers=new Map();
 const read=()=>{try{return JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {datasets:[],previews:[],runs:[],records:[]};}};
 const write=s=>{const tmp=stateFile+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,Buffer.from(JSON.stringify(s)),{flag:'wx',mode:0o600});fs.renameSync(tmp,stateFile);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}};
 const audit=(s,req,action,detail)=>s.records.push({id:randomUUID(),at:new Date().toISOString(),actor:actorKey(req),requestId:requestId(req),action,reason:req.body.reason,...detail});
 const recover=read();let interrupted=false;for(const r of recover.runs)if(['queued','running'].includes(r.status)){r.status='failed';r.failure='应用进程中断；冻结输入保留，可重新创建运行';interrupted=true;}if(interrupted)write(recover);
 const snapshot=ref=>JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,ref))).toString('utf8'));
 const persist=d=>{const ref=randomUUID()+'.json.gz';fs.writeFileSync(path.join(dir,ref),gzipSync(Buffer.from(JSON.stringify(d))),{flag:'wx',mode:0o600});return ref;};
 const tableRefs=(d,ref)=>{const refs={};for(const [table,values]of Object.entries(d.tables)){const file=ref+'.'+hash(table).slice(0,16)+'.gz';fs.writeFileSync(path.join(dir,file),gzipSync(Buffer.from(JSON.stringify(values))),{flag:'wx',mode:0o600});refs[table]=file;}return refs;};
 const meta=(s,id,v)=>{const set=s.datasets.find(d=>d.id===id);return v?set?.versions.find(d=>d.version===Number(v)):set?.versions.at(-1);};
 const dataset=(s,id,v)=>{const set=s.datasets.find(d=>d.id===id),entry=v?set?.versions.find(d=>d.version===Number(v)):set?.versions.at(-1);return entry?snapshot(entry.ref):undefined;};
 const summary=d=>({classification:d.classification,warnings:d.warnings,drafts:d.drafts||[],bomLossProfiles:d.bomLossProfiles||[],id:d.id,name:d.name,version:d.version,fileHash:d.fileHash,profile:d.profile,createdAt:d.createdAt,parameterContract:d.parameterContract,parameterCounts:d.parameterCounts,parameterClassification:d.parameterClassification,parameterSources:d.parameterSources,...sourceIdentity(d),mappingVersion:d.mapping?.version,readiness:supplyReadiness(d)});
 const handle=fn=>(req,res,next)=>{Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(res.headersSent)return next(e);res.status(e instanceof PreviewError?e.status:422).json({error:e instanceof PreviewError?e.code:'workbook_invalid',message:e.message,...(e instanceof PreviewError?e.detail:{})});});};
 let importBusy=false;
 const maintenanceEntries={route:{id:'existing-workbook-process-route',table:'工艺路线',origin:'existing',verification:'SOURCE_WIRED_NOT_RUNTIME_VERIFIED',handler:()=>({table:'工艺路线',exactField:'成品编号'})}};
 const inspect=data=>new Promise((resolve,reject)=>{const child=fork(new URL('./workbook-import-worker.mjs',import.meta.url),[],{execArgv:['--max-old-space-size='+importHeapMiB],stdio:['ignore','ignore','ignore','ipc']});let message;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('整本解析超时；未提交数据'));},60000);child.once('message',m=>message=m);child.once('error',e=>{clearTimeout(timer);reject(Error('解析进程失败：'+e.message));});child.once('exit',code=>{clearTimeout(timer);if(code===0&&message?.kind==='result')resolve(message.summary);else reject(Error(message?.message||'解析进程中断；未提交数据'));});child.send(data);});
 router.get('/business/template',permission('export'),(_req,res)=>res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('业务数据空白模板.xlsx').send(workbookTables(Object.entries(workbookSchema.tables).filter(([,s])=>s.kind==='输入').map(([table,s])=>[table,s.fields.map(f=>f.name),[]]))));
 router.get('/simulation',permission('read'),(_req,res)=>res.json(JSON.parse(fs.readFileSync(new URL('./workbook-simulation.json',import.meta.url),'utf8'))));
 router.get('/schema',permission('read'),(_req,res)=>res.json(workbookSchema));
 router.get('/datasets',permission('read'),(_req,res)=>res.json(read().datasets.map(s=>{const m=s.versions.at(-1);return {id:m.id,name:m.name,version:m.version,fileHash:m.fileHash,profile:m.profile,createdAt:m.createdAt,mappingVersion:m.mappingVersion,readiness:m.readiness};})));
 router.get('/datasets/:id',permission('read'),handle((req,res)=>{const s=read(),m=meta(s,req.params.id,req.query.version);if(!m)return res.status(404).json({error:'dataset_not_found'});const visible=m.classification?m:{...m,...summary(snapshot(m.ref))};const {ref,tableRefs,parameterBindings,...publicMeta}=visible;res.json({...publicMeta,versions:s.datasets.find(s=>s.id===m.id).versions.map(v=>v.version)});}));
 router.get('/datasets/:id/rows',permission('read'),handle((req,res)=>{const m=meta(read(),req.params.id,req.query.version);if(!m)return res.status(404).json({error:'dataset_not_found'});const table=String(req.query.table);if(!workbookSchema.tables[table])throw Error('未知业务表');const values=m.tableRefs?.[table]?snapshot(m.tableRefs[table]):rows(snapshot(m.ref),table),filter=String(req.query.q||''),field=String(req.query.sort||''),offset=Math.max(0,Number(req.query.offset)||0),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));if(req.query.exactField&&!workbookSchema.tables[table].fields.some(f=>f.name===req.query.exactField))throw Error('未知精确定位字段');let result=values.filter(r=>req.query.exactField?String(r[String(req.query.exactField)]??'')===String(req.query.exactValue??''):!filter||(filter.startsWith('#row:')?r._row===Number(filter.slice(5)):Object.values(r).some(v=>typeof v==='string'&&v.includes(filter))));if(field)result.sort((a,b)=>String(a[field]??'').localeCompare(String(b[field]??''),'zh-CN',{numeric:true}));const page=result.slice(offset,offset+limit);res.json({datasetId:m.id,version:m.version,table,total:result.length,offset,rows:page,bindings:m.parameterBindings?.[table]||(!m.tableRefs?(snapshot(m.ref).bindings||[]).filter(b=>b.sheet===table):[]),kind:workbookSchema.tables[table]?.kind});}));
 router.get('/datasets/:id/source',permission('export'),handle((req,res)=>{const m=meta(read(),req.params.id,req.query.version);if(!m)return res.status(404).end();res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(fs.readFileSync(path.join(dir,m.fileHash+'.xlsx')));}));
 router.post('/preview',permission('edit'),handle(async(req,res)=>{
  if(typeof req.body.fileBase64!=='string'||req.body.fileBase64.length>17*1024*1024)throw Error('请选择12MB以内的整本xlsx');const buffer=Buffer.from(req.body.fileBase64,'base64'),fileHash=hash(buffer),id=String(req.body.datasetId||randomUUID());
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('数据集编号无效');const before=read(),old=before.datasets.find(s=>s.id===id)?.versions.at(-1),expectedVersion=old?.version||0;
  const binding=importBinding(req.body,{id,expectedVersion,exists:!!old,actor:actorKey(req)});
  if(binding.error)return res.status(binding.status).json(binding);
  if(importBusy)return res.status(429).json({error:'import_busy',message:'正在解析另一整本文件，请稍后重试'});
  const ignored=Array.isArray(req.body.ignore)?req.body.ignore:[],dataRef=randomUUID()+'.json.gz',oldEntry=before.datasets.find(s=>s.id===id)?.versions.at(-1);let checked;importBusy=true;
  const sourcePath=path.join(dir,fileHash+'.xlsx');if(!fs.existsSync(sourcePath))fs.writeFileSync(sourcePath,buffer,{flag:'wx',mode:0o600});
  try{checked=await inspect({sourcePath,oldRef:oldEntry?path.join(dir,oldEntry.ref):null,dataPath:path.join(dir,dataRef),id,name:String(binding.importKind==='parameter'?old?.name:req.body.name||old?.name||'新Excel数据集').slice(0,100),fileName:String(req.body.fileName||req.body.name||'').slice(0,200),expectedVersion,fileHash,ignored,adoptParameters:req.body.adoptParameters===true,actor:actorKey(req),importKind:binding.importKind,overlayResolution:binding.overlayResolution});}finally{importBusy=false;}
  const transitRef=checked.tableRefs?.['既有采购在途'];if(transitRef){const identityIssues=transitIdentityIssues(snapshot(transitRef));checked.issues.push(...identityIssues);if(identityIssues.length)checked.readiness={...checked.readiness,ready:false,issues:[...checked.readiness.issues,...identityIssues]};}
  const preview={id:randomUUID(),datasetId:id,fileHash,expectedVersion,schemaVersion:workbookSchema.version,name:String(binding.importKind==='parameter'?old?.name:req.body.name||old?.name||'新Excel数据集').slice(0,100),profile:checked.sourceProfile||PROFILE,...checked,status:'preview',dataRef,ignored,importKey:hash({datasetId:id,fileHash,importKind:binding.importKind||'legacy',expectedVersion,mode:binding.mode,scope:binding.scope,overlayResolution:binding.overlayResolution}),...binding};
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
  const verified=snapshot(p.dataRef);
  if(p.snapshotHash&&hash(verified)!==p.snapshotHash||verified.id!==p.datasetId||verified.version!==p.expectedVersion+1)fail('PREVIEW_DATA_CHANGED');
  const identityIssues=transitIdentityIssues(rows(verified,'既有采购在途'));
  if(p.issues.length||identityIssues.length)fail('VALIDATION_BLOCKED',422,{blockingReports:p.issues.length+identityIssues.length});
  let set=s.datasets.find(d=>d.id===p.datasetId);if(!set){set={id:p.datasetId,versions:[],imports:[]};s.datasets.push(set);}const imported={id:p.datasetId,name:p.name,version:p.expectedVersion+1,fileHash:p.sourceFileHash||p.fileHash,parameterCounts:p.parameterCounts,parameterClassification:p.parameterClassification,parameterSources:p.parameterSources,parameterContract:p.parameterContract,sourceFiles:p.sourceFiles,overlay:p.overlay,mappingHash:p.mappingHash,parameterHash:p.parameterHash,profile:p.profile,createdAt:p.createdAt,readiness:p.readiness,classification:p.classification,warnings:p.warnings,tableRefs:p.tableRefs,parameterBindings:p.parameterBindings,drafts:p.drafts||[]};set.versions.push({...imported,ref:p.dataRef});p.status='committed';p.version=imported.version;const result={previewId:p.id,datasetId:p.datasetId,fileHash:p.fileHash,version:p.version,status:'committed',importKey:p.importKey};set.imports.push(result);audit(s,req,'workbook_committed',result);return result;
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
 registerWorkbookConversions(router,{read,write,dataset,audit,summary,handle,permission,persist,snapshot,meta,tableRefs});
 return registerOperations(router,{read,write,dataset,audit,summary,handle,permission,workerFactory,workers,persist,snapshot,meta,tableRefs,actorKey});
}
function rowKey(table,r){return table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[workbookSchema.tables[table]?.key]);}

function registerOperations(router,ctx) {
 const {read,write,dataset,audit,summary,handle,permission,workerFactory,workers,persist,snapshot,meta,tableRefs}=ctx;
 function saveVersion(req,res,mutate){const s=read(),d=dataset(s,req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});if(req.body.expectedVersion!==d.version)return res.status(409).json({error:'version_conflict',message:'版本已变化，当前草稿保留；请刷新比较后重试',actualVersion:d.version});const next=d;const result=mutate(next);if(result?.issues)return res.status(422).json({error:'validation_failed',issues:result.issues});refreshDerived(next);next.overlay=[...(next.overlay||[]),{version:d.version+1,actor:ctx.actorKey(req),reason:req.body.reason,operation:req.route?.path||'online-edit',at:new Date().toISOString()}];const issues=[...validateWorkbook(next,{completeness:false}),...transitIdentityIssues(rows(next,'既有采购在途'))];if(issues.length)return res.status(422).json({error:'validation_failed',issues});next.version=d.version+1;next.createdAt=new Date().toISOString();readinessInvalidation(next);const ref=ctx.persist(next),entry={...summary(next),ref,tableRefs:ctx.tableRefs(next,ref),parameterBindings:Object.fromEntries(Object.keys(next.tables).map(t=>[t,(next.bindings||[]).filter(b=>b.sheet===t)]))};s.datasets.find(s=>s.id===d.id).versions.push(entry);audit(s,req,'workbook_version',{datasetId:d.id,version:next.version});write(s);res.json({...summary(next),...result});}
 router.post('/datasets/:id/edit',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{
  const {table,key,changes,operation}=req.body,spec=workbookSchema.tables[table];if(d.parameterContract&&table==='配置参数')throw Error('请使用同源配置参数入口维护对象、scope和有效期');if(!spec||spec.kind!=='输入')throw Error('参考结果只读，不能作为输入维护');let r=rows(d,table).find(r=>rowKey(table,r)===key);
  if(operation==='delete'){if(!r)throw Error('记录不存在');if(Object.entries(d.tables).some(([t,rs])=>t!==table&&workbookSchema.tables[t]?.kind==='输入'&&rs.some(row=>Object.values(row).some(v=>v===r[spec.key]))))throw Error('记录仍被引用，删除被保护');d.tables[table]=rows(d,table).filter(row=>row!==r);return {};}
  if(operation==='create'){if(r)throw Error('编号已存在');r={_row:Math.max(2,...rows(d,table).map(r=>r._row||2))+1,_cells:{},_formulas:{},_origin:'应用新增记录'};d.tables[table].push(r);}else if(!r)throw Error('记录不存在');
  for(const [field,value]of Object.entries(changes||{})){if(!spec.fields.some(f=>f.name===field))throw Error('未知字段 '+field);if(typeof value!=='string'||value.length>2000)throw Error('字段须为文本且不超过2000字');if(operation!=='create'&&field===spec.key&&value!==r[field])throw Error('唯一编号不能原地更改');const binding=d.bindings.find(b=>b.sheet===table&&(b.recordKey?b.recordKey===rowKey(table,r):b.row===r._row)&&b.field===field);if(binding){const literal=rows(d,'配置参数').find(p=>p['参数编号']===binding.parameterId);const p=literal&&(effectiveParameters(d,0).find(p=>p['对象编号']===literal['对象编号']&&p['参数名称']===literal['参数名称'])||literal);if(!p)throw Error('参数来源丢失');if(d.parameterContract)changeParameter(d,{cp:cpOf(p),objectId:p['对象编号'],field:p['参数名称'],id:p['参数编号'],sourceRole:sourceRole(p),sourceFrom:p['生效日'],value,unit:p['单位'],from:p['生效日'],to:p['失效日'],scope:p._scope||'dataset',reason:req.body.reason},ctx.actorKey(req));else p['参数值']=value;}else{const atom=d.parameterContract&&specification(field),source=atom?.table===table&&effectiveParameters(d,0).find(p=>p['参数名称']===field&&p['对象编号']===objectKey(r,atom)&&(p._scope||'dataset')==='dataset'&&Number(p['生效日'])<=0&&0<Number(p['失效日']));if(source){changeParameter(d,{cp:atom.cp,objectId:source['对象编号'],field,id:source['参数编号'],sourceRole:sourceRole(source),sourceFrom:source['生效日'],value,unit:source['单位'],from:source['生效日'],to:source['失效日'],scope:'dataset',reason:req.body.reason},ctx.actorKey(req));continue;}if(r._formulas?.[field])throw Error('派生字段只读，请维护其输入或统一参数');r[field]=value;if(atom?.table===table){const base=d.parameterBaseFields?.find(b=>b.table===table&&b.object===objectKey(r,atom)&&b.field===field);if(base){base.present=true;base.value=value;}}}}
  return {changedRecord:rowKey(table,r),checksInvalidated:true};
 })));
 router.post('/datasets/:id/mapping',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{if(!req.body.mapping||req.body.mapping.mock!==true||!req.body.mapping.line?.id)throw Error('需显式标记仿真映射及选择单线');d.mapping=structuredClone(req.body.mapping);return {};})));
 registerParameterRoutes(router,{...ctx,saveVersion});
 // RUNS_AND_DRAFTS
 return registerWorkbookRuns(router,{...ctx,saveVersion});
}
function readinessInvalidation(d){d.checkedAt=null;d.checksInvalidated=true;}
