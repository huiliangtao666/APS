// Offline product contracts: no listener, child process, Worker, or real state.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {gzipSync} from 'node:zlib';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {workbookSchema,refreshDerived,hash,rows,PROFILE} from '../server/workbook-model.mjs';
import {prepareBusinessImport,importBinding,bindPreview,commitBinding,importChanges,checkSelection,validateImportType} from '../server/workbook-workbench.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {createWorkbookRouter} from '../server/workbook-router.mjs';
import {calculateWorkbook,verifyWorkbookPlan} from '../server/workbook-plan.mjs';
import {workbookView} from '../src/lib/workbook-view.mjs';
const base=process.env.WORKBENCH_FIXTURE;if(!base)throw Error('WORKBENCH_FIXTURE required');
const parsed=name=>parseWorkbook(fs.readFileSync(path.join(base,name)),workbookSchema);
function business(name='business180.xlsx',old){const p=parsed(name);assert.equal(p.issues.length,0,JSON.stringify(p.issues));const d=prepareBusinessImport({...p,id:'SYN',name:'explicit simulation',version:(old?.version||0)+1,profile:PROFILE,fileHash:hash(fs.readFileSync(path.join(base,name))),mapping:JSON.parse(fs.readFileSync(path.join(base,'mapping.json'))),drafts:[],createdAt:'2026-11-02'},old);return refreshDerived(d);}
function parameters(d,qty,adopt){const p=parsed('parameter'+qty+'.xlsx');assert.deepEqual(p.issues,[]);const r=integrateParameterImport(p,d,{id:d.id,name:d.name,expectedVersion:d.version,fileHash:'parameter-'+qty,adoptParameters:adopt,actor:'planner'});assert.deepEqual(r.issues,[]);return refreshDerived(r.d);}
const selection={currentDay:1,startDay:1,endDay:15,demandIds:['SUPPLY-D']};
function fixture(t,d=business()){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps-workbench-r2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=path.join(dir,'workbooks');fs.mkdirSync(store);fs.writeFileSync(store+'/input.gz',gzipSync(JSON.stringify(d)));fs.writeFileSync(store+'/state.json',JSON.stringify({datasets:[{id:d.id,versions:[{id:d.id,name:d.name,version:d.version,fileHash:d.fileHash,ref:'input.gz'}],imports:[]}],runs:[],previews:[],records:[]}));
 let started=0;
 const permission=action=>(req,res,next)=>{if(req.role==='query'&&action!=='read')return res.status(403).json({error:'forbidden'});next();};
 const make=()=>createWorkbookRouter({dataDir:dir,permission,actorKey:r=>r.actor,requestId:()=> 'offline',workerFactory:()=>{started++;throw Error('NO_WORKER_BUDGET');}}),router=make();
 async function call(method,route,body={},query={},id=d.id,role='planner',actor='planner'){
  const layer=router.stack.find(l=>l.route?.path===route&&l.route.methods[method.toLowerCase()]);assert.ok(layer,route);let at=0;
  return await new Promise((resolve,reject)=>{const req={body:{reason:'explicit isolated selftest',...body},method,query,params:{id},role,actor},res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){resolve({status:this.statusCode,body});return this;},send(body){resolve({status:this.statusCode,body});return this;},type(){return this;},attachment(){return this;},end(){resolve({status:this.statusCode});}};const next=e=>{if(e)return reject(e);try{const l=layer.route.stack[at++];if(!l)throw Error('Route did not respond');l.handle(req,res,next);}catch(e){reject(e);}};next();});
 }
 return {dir,store,call,make,bytes:()=>fs.readFileSync(store+'/state.json'),state:()=>JSON.parse(fs.readFileSync(store+'/state.json')),set:s=>fs.writeFileSync(store+'/state.json',JSON.stringify(s)),started:()=>started};
}
test('strict import contracts: kind/target/version/scope/actor and adoption binding',()=>{
 const opts={id:'SYN',expectedVersion:2,exists:true,actor:'planner'},body={importKind:'parameter',expectedVersion:2,mode:'candidate',scope:'dataset',adoptParameters:false};
 assert.equal(importBinding(body,opts).error,undefined);assert.equal(importBinding(body,{...opts,exists:false}).error,'parameter_target_required');assert.equal(importBinding({...body,expectedVersion:1},opts).status,409);
 assert.equal(importBinding({...body,mode:'trial'},opts).error,'bulk_trial_not_supported');assert.equal(importBinding({...body,scope:'trial:other'},opts).error,'bulk_trial_not_supported');assert.equal(importBinding({...body,mode:'dataset'},opts).error,'adoption_mode_mismatch');
 const p={id:'PREVIEW',datasetId:'SYN',fileHash:'PARAM',expectedVersion:2,snapshotHash:'DATA',changeSet:[],...importBinding(body,opts)};bindPreview(p);const commit={previewFingerprint:p.previewFingerprint,importKind:'parameter',datasetId:'SYN',mode:'candidate',scope:'dataset'};assert.equal(commitBinding(p,commit,'planner'),null);
 for(const b of [{...commit,datasetId:'OTHER'},{...commit,mode:'dataset'},{...commit,scope:'trial:x'},{...commit,importKind:'business'},{...commit,previewFingerprint:'bad'}])assert.equal(commitBinding(p,b,'planner'),'preview_binding_changed');assert.equal(commitBinding(p,commit,'other'),'preview_owner_changed');
 assert.equal(importBinding({},opts).importKind,undefined); // legacy API preserved
});
test('business replacement is traceable 180→200kg without appended demand or lost adopted parameter',()=>{
 const first=parameters(business(),1,true),before=hash(first),next=business('business200.xlsx',first);assert.equal(rows(next,'每日需求').length,1);assert.equal(rows(next,'每日需求')[0]['需求千克'],'200');assert.equal(rows(next,'配置参数').find(p=>p['参数编号']==='SYN-PA-TOOL')['参数值'],'1');assert.equal(next.parameterSources.at(-1).fileHash,'parameter-1');assert.equal(hash(first),before);
 const changes=importChanges(first,next);assert.ok(changes.some(c=>c.table==='每日需求'&&c.operation==='replace'&&c.fields.some(f=>f.field==='需求箱数'&&f.before==='18'&&f.after==='20')));
});
test('pure planner causal quantities and candidate1→0→adopted0; not a Worker proof',()=>{
 const one=parameters(business(),1,true),frozen=structuredClone(one),a=calculateWorkbook(one,selection);assert.equal(a.demandSummary.totalKg,180);assert.equal(a.demandSummary.scheduled,1);assert.ok(a.tasks.length);assert.equal(verifyWorkbookPlan(one,a).status,'pass');
 const candidate=parameters(one,0,false),c=calculateWorkbook(candidate,selection);assert.equal(rows(candidate,'设备与工装').find(t=>t['资源编号']==='MOCK-T')['可用数量'],'1');assert.equal(c.demandSummary.scheduled,1);
 const zero=parameters(candidate,0,true),z=calculateWorkbook(zero,selection);assert.equal(rows(zero,'设备与工装').find(t=>t['资源编号']==='MOCK-T')['可用数量'],'0');assert.equal(z.demandSummary.scheduled,0);assert.equal(z.tasks.length,0);assert.ok(verifyWorkbookPlan(zero,a).issues.some(i=>/数量为零/.test(i)));assert.notEqual(hash(zero.effectiveParameters),hash(one.effectiveParameters));
 const two=business('business200.xlsx',one),b=calculateWorkbook(two,selection);assert.equal(b.demandSummary.totalKg,200);assert.equal(b.demandSummary.scheduled,1);assert.equal(verifyWorkbookPlan(two,b).status,'pass');assert.deepEqual(one,frozen);assert.equal(a.demandSummary.totalKg,180);
 if(process.env.WORKBENCH_EVIDENCE)fs.writeFileSync(process.env.WORKBENCH_EVIDENCE+'/pure-causal.json',JSON.stringify({method:'OFFLINE_PURE_PLANNER_NOT_WORKER',a,b,c,z,sourceOneHash:hash(one),sourceTwoHash:hash(two),candidateHash:hash(candidate),zeroHash:hash(zero)},null,2));
});
test('ready identity binds current version, selection, scope, start day, actual parameters',()=>{
 const d=parameters(business(),1,true),r=checkSelection(d,{selection,parameterScope:'dataset'},'planner');assert.equal(r.ready,true,JSON.stringify(r.issues));for(const change of [{...selection,endDay:14},{...selection,startDay:2}])assert.notEqual(checkSelection(d,{selection:change},'planner').token,r.token);
 const missing=checkSelection(d,{selection:{...selection,demandIds:['DELETED']}},'planner');assert.equal(missing.ready,false);assert.ok(missing.issues.some(i=>i.code==='DEMAND_CHANGED'));assert.equal(checkSelection(d,{selection:{...selection,startDay:10,endDay:11,demandIds:[]}},'planner').ready,false);
 const next=business('business200.xlsx',d);assert.notEqual(checkSelection(next,{selection},'planner').token,r.token);assert.notEqual(checkSelection(parameters(d,0,true),{selection},'planner').token,r.token);
});
test('registered stale ready/current and denied writes reject atomically before Worker',async t=>{
 const f=fixture(t),v=f.state().datasets[0].versions[0].version,r=await f.call('POST','/datasets/:id/readiness',{version:v,selection});assert.equal(r.status,200);const before=f.bytes();
 for(const b of [{version:v,currentVersion:true,readinessToken:'wrong',selection},{version:v+1,currentVersion:true,readinessToken:r.body.token,selection},{version:v,currentVersion:true,readinessToken:r.body.token,selection:{...selection,endDay:14}}]){const rejected=await f.call('POST','/datasets/:id/run',b);assert.ok([404,409].includes(rejected.status),JSON.stringify(rejected));assert.deepEqual(f.bytes(),before);}
 const denied=await f.call('POST','/datasets/:id/edit',{expectedVersion:v,table:'每日需求',key:'SUPPLY-D',changes:{'需求箱数':'20'}},{},'SYN','query');assert.equal(denied.status,403);assert.deepEqual(f.bytes(),before);assert.equal(f.started(),0);
 const save=await f.call('POST','/datasets/:id/edit',{expectedVersion:v,table:'每日需求',key:'SUPPLY-D',changes:{'需求箱数':'20'}});assert.equal(save.status,200,JSON.stringify(save));const persisted=f.bytes();const stale=await f.call('POST','/datasets/:id/run',{version:v,currentVersion:true,readinessToken:r.body.token,selection});assert.equal(stale.body.error,'INPUT_CHANGED');assert.deepEqual(f.bytes(),persisted);
});
test('registered preview commit rebind rejection, idempotent retry, and invalid rows write nothing',async t=>{
 const f=fixture(t),state=f.state(),d=business();d.version=2;fs.writeFileSync(f.store+'/preview.gz',gzipSync(JSON.stringify(d)));const p={id:'P',datasetId:d.id,fileHash:'FILE',sourceFileHash:d.fileHash,expectedVersion:1,profile:PROFILE,dataRef:'preview.gz',issues:[],readiness:{ready:true},changeSet:[],canCommit:true,importKey:'same-operation',requestedKind:'business',mode:'candidate',scope:'dataset',owner:'planner',snapshotHash:hash(d)};bindPreview(p);state.previews.push(p);f.set(state);
 const b={previewId:'P',fileHash:p.fileHash,expectedVersion:1,previewFingerprint:p.previewFingerprint,importKind:'business',datasetId:d.id,mode:'candidate',scope:'dataset'},before=f.bytes();
 assert.equal((await f.call('POST','/commit',{...b,mode:'dataset'})).status,409);assert.deepEqual(f.bytes(),before);
 const first=await f.call('POST','/commit',b);assert.equal(first.status,200,JSON.stringify(first));const after=f.bytes();assert.equal((await f.call('POST','/commit',b)).body.idempotent,true);assert.deepEqual(f.bytes(),after);
 const bad=f.state();bad.previews.push({...p,id:'BAD',expectedVersion:2,importKey:'bad',issues:[{code:'INVALID',sheet:'每日需求',row:3,field:'需求箱数'}]});bindPreview(bad.previews.at(-1));f.set(bad);const bytes=f.bytes();const reject=await f.call('POST','/commit',{...b,previewId:'BAD',expectedVersion:2,previewFingerprint:bad.previews.at(-1).previewFingerprint});assert.equal(reject.status,422);assert.deepEqual(f.bytes(),bytes);assert.equal(f.started(),0);
});
test('conversion preview/rejection is read-only; same-profile copy is atomic, traceable, deduplicated',async t=>{
 const f=fixture(t),before=f.bytes(),native=await f.call('POST','/datasets/:id/conversions/preview',{version:1,targetModel:'native'});assert.equal(native.body.mayCommit,false);assert.deepEqual(f.bytes(),before);assert.equal((await f.call('POST','/datasets/:id/conversions/confirm',{...native.body,confirm:true})).status,422);assert.deepEqual(f.bytes(),before);
 const preview=await f.call('POST','/datasets/:id/conversions/preview',{version:1,targetModel:'workbook'});assert.equal(preview.body.mayCommit,true);assert.deepEqual(f.bytes(),before);
 assert.equal((await f.call('POST','/datasets/:id/conversions/confirm',{...preview.body,targetPreviewHash:'bad',confirm:true})).status,409);assert.deepEqual(f.bytes(),before);
 const b={...preview.body,confirm:true};assert.equal((await f.call('POST','/datasets/:id/conversions/confirm',b,{},'SYN','query')).status,403);assert.deepEqual(f.bytes(),before);
 const result=await f.call('POST','/datasets/:id/conversions/confirm',b);assert.equal(result.status,200);assert.equal(f.state().datasets.length,2);const bytes=f.bytes();assert.equal((await f.call('POST','/datasets/:id/conversions/confirm',b)).body.idempotent,true);assert.deepEqual(f.bytes(),bytes);assert.equal(f.state().datasets[0].versions.length,1);assert.notEqual(result.body.targetRef.id,'SYN');assert.equal(result.body.sourceRef.inputHash,hash(business()));
});
test('frozen result/day view, persisted reopen/query/export use the same identity; reject mixed/corrupt data',async t=>{
 const d=parameters(business(),1,true),f=fixture(t,d),p=calculateWorkbook(d,selection);p.verification=verifyWorkbookPlan(d,p);const run={id:'OFFLINE-R1',status:p.status,datasetId:d.id,version:d.version,inputHash:hash(d),inputRef:'input.gz',selection,result:p,resultHash:hash(p),provenance:{model:'workbook',engineIdentity:'workbook-day-v1',timeUnit:'day',dayZero:p.dayZero,fileHash:d.fileHash,mappingHash:hash(d.mapping),parameterHash:hash(rows(d,'配置参数'))}};
 const s=f.state();s.runs.push(run);f.set(s);const before=f.bytes(),v=workbookView(run);assert.deepEqual(v.tasks,p.tasks);assert.equal(v.runRef.runId,run.id);for(const task of v.tasks)assert.ok(task.end>task.start);
 const query=await f.call('GET','/runs/:id/rows',{}, {table:'每日需求'},run.id);assert.equal(query.status,200);assert.equal(query.body.inputHash,run.inputHash);assert.equal(query.body.resultHash,run.resultHash);assert.equal(query.body.rows[0]['需求千克'],'180');
 const exported=await f.call('GET','/runs/:id/export',{}, {},run.id);assert.equal(exported.status,200,JSON.stringify(exported));assert.match(exported.body,/OFFLINE-R1/);assert.match(exported.body,/180/);assert.deepEqual(f.bytes(),before);assert.ok(f.make().stack.length);assert.deepEqual(f.bytes(),before);
 for(const key of ['datasetId','version','fileHash','mappingHash','parameterHash']){const mixed=structuredClone(run);mixed.result.source[key]='OTHER';assert.throws(()=>workbookView(mixed),/身份/);}
 const corrupt=f.state();corrupt.runs[0].result.tasks[0].quantity=999;f.set(corrupt);const bytes=f.bytes();for(const route of ['/runs/:id','/runs/:id/rows','/runs/:id/export']){const response=await f.call('GET',route,{}, {table:'每日需求'},run.id);assert.equal(response.status,409);assert.deepEqual(f.bytes(),bytes);}assert.equal(f.started(),0);
 if(process.env.WORKBENCH_EVIDENCE)fs.writeFileSync(process.env.WORKBENCH_EVIDENCE+'/offline-frozen-route.json',JSON.stringify({method:'REGISTERED_ROUTES_MANUALLY_SEEDED_RUN_NOT_WORKER',run,query,exported},null,2));
});
test('deleted selected demand stops current checks and leaves original snapshot untouched',()=>{
 const d=business(),old=hash(d),next=structuredClone(d);next.version++;next.tables['每日需求']=[];const r=checkSelection(next,{selection},'planner');assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.code==='DEMAND_CHANGED'));assert.equal(hash(d),old);
});

test('real parsed OOXML kind rejection, trial import refusal, and blank schema template roundtrip',async t=>{
 const b=parsed('business180.xlsx'),p=parsed('parameter1.xlsx');assert.throws(()=>validateImportType(b,'parameter'),/文件类型/);assert.throws(()=>validateImportType(p,'business'),/文件类型/);assert.doesNotThrow(()=>validateImportType(b,'business'));assert.doesNotThrow(()=>validateImportType(p,'parameter'));p.tables['配置参数'][0]['作用范围']='trial:other';assert.throws(()=>validateImportType(p,'parameter'),/trial/);
 const f=fixture(t),before=f.bytes(),r=await f.call('GET','/business/template');assert.equal(r.status,200);const empty=parseWorkbook(r.body,workbookSchema);assert.equal(empty.parameterWorkbook,undefined);assert.deepEqual(empty.issues,[]);assert.equal(rows(empty,'每日需求').length,0);assert.deepEqual(f.bytes(),before);
});
