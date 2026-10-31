import {gzipSync,gunzipSync} from 'node:zlib';
import {registerWorkbookRuns} from './workbook-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {Router} from 'express';
import {hash,workbookSchema,refreshDerived,validateWorkbook,workbookReadiness,rows,procurement,PROFILE} from './workbook-model.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
export function createWorkbookRouter({dataDir,permission,actorKey,requestId,workerFactory}) {
 const router=Router(),dir=path.join(dataDir,'workbooks');fs.mkdirSync(dir,{recursive:true});const stateFile=path.join(dir,'state.json'),workers=new Map();
 const read=()=>{try{return JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {datasets:[],previews:[],runs:[],records:[]};}};
 const write=s=>{const tmp=stateFile+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,Buffer.from(JSON.stringify(s)),{flag:'wx',mode:0o600});fs.renameSync(tmp,stateFile);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}};
 const audit=(s,req,action,detail)=>s.records.push({id:randomUUID(),at:new Date().toISOString(),actor:actorKey(req),requestId:requestId(req),action,reason:req.body.reason,...detail});
 const recover=read();let interrupted=false;for(const r of recover.runs)if(['queued','running'].includes(r.status)){r.status='failed';r.failure='应用进程中断；冻结输入保留，可重新创建运行';interrupted=true;}if(interrupted)write(recover);
 const snapshot=ref=>JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,ref))).toString('utf8'));
 const persist=d=>{const ref=randomUUID()+'.json.gz';fs.writeFileSync(path.join(dir,ref),gzipSync(Buffer.from(JSON.stringify(d))),{flag:'wx',mode:0o600});return ref;};
 const dataset=(s,id,v)=>{const set=s.datasets.find(d=>d.id===id),entry=v?set?.versions.find(d=>d.version===Number(v)):set?.versions.at(-1);return entry?snapshot(entry.ref):undefined;};
 const summary=d=>({id:d.id,name:d.name,version:d.version,fileHash:d.fileHash,profile:d.profile,createdAt:d.createdAt,mappingVersion:d.mapping?.version,readiness:workbookReadiness(d)});
 const handle=fn=>(req,res,next)=>{Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(res.headersSent)return next(e);res.status(422).json({error:'workbook_invalid',message:e.message});});};
 let importBusy=false;
 const inspect=data=>new Promise((resolve,reject)=>{const child=fork(new URL('./workbook-import-worker.mjs',import.meta.url),[],{execArgv:['--max-old-space-size=180'],stdio:['ignore','ignore','ignore','ipc']});let message;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('整本解析超时；未提交数据'));},60000);child.once('message',m=>message=m);child.once('error',e=>{clearTimeout(timer);reject(Error('解析进程失败：'+e.message));});child.once('exit',code=>{clearTimeout(timer);if(code===0&&message?.kind==='result')resolve(message.summary);else reject(Error(message?.message||'解析进程中断；未提交数据'));});child.send(data);});
 router.get('/simulation',permission('read'),(_req,res)=>res.json(JSON.parse(fs.readFileSync(new URL('./workbook-simulation.json',import.meta.url),'utf8'))));
 router.get('/schema',permission('read'),(_req,res)=>res.json(workbookSchema));
 router.get('/datasets',permission('read'),(_req,res)=>res.json(read().datasets.map(s=>s.versions.at(-1))));
 router.get('/datasets/:id',permission('read'),handle((req,res)=>{const d=dataset(read(),req.params.id,req.query.version);if(!d)return res.status(404).json({error:'dataset_not_found'});res.json({...summary(d),classification:d.classification,versions:read().datasets.find(s=>s.id===d.id).versions.map(v=>v.version),warnings:d.warnings,bomLossProfiles:d.bomLossProfiles||[]});}));
 router.get('/datasets/:id/rows',permission('read'),handle((req,res)=>{const d=dataset(read(),req.params.id,req.query.version);if(!d)return res.status(404).json({error:'dataset_not_found'});const table=String(req.query.table),filter=String(req.query.q||''),field=String(req.query.sort||''),offset=Math.max(0,Number(req.query.offset)||0),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));let result=rows(d,table).filter(r=>!filter||(filter.startsWith('#row:')?r._row===Number(filter.slice(5)):Object.values(r).some(v=>typeof v==='string'&&v.includes(filter))));if(field)result.sort((a,b)=>String(a[field]??'').localeCompare(String(b[field]??''),'zh-CN',{numeric:true}));res.json({datasetId:d.id,version:d.version,table,total:result.length,offset,rows:result.slice(offset,offset+limit),bindings:(d.bindings||[]).filter(b=>b.sheet===table),kind:workbookSchema.tables[table]?.kind});}));
 router.get('/datasets/:id/source',permission('export'),handle((req,res)=>{const d=dataset(read(),req.params.id,req.query.version);if(!d)return res.status(404).end();res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(fs.readFileSync(path.join(dir,d.fileHash+'.xlsx')));}));
 router.post('/preview',permission('edit'),handle(async(req,res)=>{
  if(typeof req.body.fileBase64!=='string'||req.body.fileBase64.length>17*1024*1024)throw Error('请选择12MB以内的整本xlsx');const buffer=Buffer.from(req.body.fileBase64,'base64'),fileHash=hash(buffer),id=String(req.body.datasetId||randomUUID());
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('数据集编号无效');const before=read(),old=before.datasets.find(s=>s.id===id)?.versions.at(-1),expectedVersion=old?.version||0;
  if(importBusy)return res.status(429).json({error:'import_busy',message:'正在解析另一整本文件，请稍后重试'});
  const ignored=Array.isArray(req.body.ignore)?req.body.ignore:[],dataRef=randomUUID()+'.json.gz',oldEntry=before.datasets.find(s=>s.id===id)?.versions.at(-1);let checked;importBusy=true;
  const sourcePath=path.join(dir,fileHash+'.xlsx');if(!fs.existsSync(sourcePath))fs.writeFileSync(sourcePath,buffer,{flag:'wx',mode:0o600});
  try{checked=await inspect({sourcePath,oldRef:oldEntry?path.join(dir,oldEntry.ref):null,dataPath:path.join(dir,dataRef),id,name:String(req.body.name||old?.name||'新Excel数据集').slice(0,100),expectedVersion,fileHash,ignored});}finally{importBusy=false;}
  const preview={id:randomUUID(),datasetId:id,fileHash,expectedVersion,schemaVersion:workbookSchema.version,...checked,status:'preview',dataRef,ignored};
  const current=read();if((current.datasets.find(s=>s.id===id)?.versions.at(-1)?.version||0)!==expectedVersion)return res.status(409).json({error:'preview_stale',message:'解析期间目标版本已变化，请重新预览'});
  if(!fs.existsSync(path.join(dir,fileHash+'.xlsx')))fs.writeFileSync(path.join(dir,fileHash+'.xlsx'),buffer,{flag:'wx',mode:0o600});
  current.previews.push(preview);audit(current,req,'workbook_preview',{previewId:preview.id,datasetId:id,fileHash});write(current);res.json({...preview,canCommit:!preview.issues.length});
 }));
 router.get('/previews/:id',permission('read'),(req,res)=>{const p=read().previews.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'preview_not_found'});const {data,...visible}=p;res.json(visible);});
 router.post('/commit',permission('edit'),handle((req,res)=>{const s=read(),p=s.previews.find(p=>p.id===req.body.previewId);if(!p)return res.status(404).json({error:'preview_not_found'});
  const prior=s.datasets.find(d=>d.id===p.datasetId)?.imports?.find(i=>i.fileHash===p.fileHash);if(prior)return res.json({...prior,idempotent:true});
  if(p.fileHash!==req.body.fileHash||p.expectedVersion!==req.body.expectedVersion||(s.datasets.find(s=>s.id===p.datasetId)?.versions.at(-1)?.version||0)!==p.expectedVersion)return res.status(409).json({error:'preview_stale',message:'目标版本已变化，请重新预览'});
  if(p.issues.length)return res.status(422).json({error:'validation_failed',issues:p.issues});
  let set=s.datasets.find(d=>d.id===p.datasetId);if(!set){set={id:p.datasetId,versions:[],imports:[]};s.datasets.push(set);}const imported=snapshot(p.dataRef);set.versions.push({...summary(imported),ref:p.dataRef});p.status='committed';p.version=imported.version;const result={previewId:p.id,datasetId:p.datasetId,fileHash:p.fileHash,version:p.version,status:'committed'};set.imports.push(result);audit(s,req,'workbook_committed',result);write(s);res.json({...result,readiness:p.readiness});
 }));
 // Mutations, freeze/run, drafts and native exports are registered below.
 return registerOperations(router,{read,write,dataset,audit,summary,handle,permission,workerFactory,workers,persist,snapshot});
}
function rowKey(table,r){return table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[workbookSchema.tables[table]?.key]);}

function registerOperations(router,ctx) {
 const {read,write,dataset,audit,summary,handle,permission,workerFactory,workers,persist,snapshot}=ctx;
 function saveVersion(req,res,mutate){const s=read(),d=dataset(s,req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});if(req.body.expectedVersion!==d.version)return res.status(409).json({error:'version_conflict',message:'版本已变化，当前草稿保留；请刷新比较后重试',actualVersion:d.version});const next=d;const result=mutate(next);if(result?.issues)return res.status(422).json({error:'validation_failed',issues:result.issues});refreshDerived(next);const issues=validateWorkbook(next);if(issues.length)return res.status(422).json({error:'validation_failed',issues});next.version=d.version+1;next.createdAt=new Date().toISOString();readinessInvalidation(next);s.datasets.find(s=>s.id===d.id).versions.push({...summary(next),ref:ctx.persist(next)});audit(s,req,'workbook_version',{datasetId:d.id,version:next.version});write(s);res.json({...summary(next),...result});}
 router.post('/datasets/:id/edit',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{
  const {table,key,changes,operation}=req.body,spec=workbookSchema.tables[table];if(!spec||spec.kind!=='输入')throw Error('参考结果只读，不能作为输入维护');let r=rows(d,table).find(r=>rowKey(table,r)===key);
  if(operation==='delete'){if(!r)throw Error('记录不存在');if(Object.entries(d.tables).some(([t,rs])=>t!==table&&workbookSchema.tables[t]?.kind==='输入'&&rs.some(row=>Object.values(row).some(v=>v===r[spec.key]))))throw Error('记录仍被引用，删除被保护');d.tables[table]=rows(d,table).filter(row=>row!==r);return {};}
  if(operation==='create'){if(r)throw Error('编号已存在');r={_row:Math.max(2,...rows(d,table).map(r=>r._row||2))+1,_cells:{},_formulas:{},_origin:'应用新增记录'};d.tables[table].push(r);}else if(!r)throw Error('记录不存在');
  for(const [field,value]of Object.entries(changes||{})){if(!spec.fields.some(f=>f.name===field))throw Error('未知字段 '+field);if(typeof value!=='string'||value.length>2000)throw Error('字段须为文本且不超过2000字');if(operation!=='create'&&field===spec.key&&value!==r[field])throw Error('唯一编号不能原地更改');const binding=d.bindings.find(b=>b.sheet===table&&(b.recordKey?b.recordKey===rowKey(table,r):b.row===r._row)&&b.field===field);if(binding){const p=rows(d,'配置参数').find(p=>p['参数编号']===binding.parameterId);if(!p)throw Error('参数来源丢失');p['参数值']=value;}else{if(r._formulas?.[field])throw Error('派生字段只读，请维护其输入或统一参数');r[field]=value;}}
  return {changedRecord:rowKey(table,r),checksInvalidated:true};
 })));
 router.post('/datasets/:id/mapping',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{if(!req.body.mapping||req.body.mapping.mock!==true||!req.body.mapping.line?.id)throw Error('需显式标记仿真映射及选择单线');d.mapping=structuredClone(req.body.mapping);return {};})));
 // RUNS_AND_DRAFTS
 return registerWorkbookRuns(router,{...ctx,saveVersion});
}
function readinessInvalidation(d){d.checkedAt=null;d.checksInvalidated=true;}
