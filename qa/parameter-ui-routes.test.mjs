// In-process registered route execution: no HTTP listener, Worker, or deployed instance.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';
import {createWorkbookRouter} from '../server/workbook-router.mjs';import {parseWorkbook} from '../server/workbook-parse.mjs';import {workbookSchema,refreshDerived,hash} from '../server/workbook-model.mjs';
const base=process.env.PARAMETER_FIXTURE;if(!base)throw Error('PARAMETER_FIXTURE required');
function fixture(){const dir=fs.mkdtempSync(path.join(base,'routes-')),store=path.join(dir,'workbooks');fs.mkdirSync(store);let d=parseWorkbook(fs.readFileSync(base+'/supply/small.xlsx'),workbookSchema);d=refreshDerived({...d,id:'MOCK',name:'isolated route fixture',version:1,fileHash:'business-source',profile:'excel-qualified-output-202611-r1',mapping:JSON.parse(fs.readFileSync(base+'/supply/mapping.json')),parameterContract:'CR-PARAM-UI-20261101:r1',createdAt:'2026-11-01'});
 fs.writeFileSync(store+'/input.gz',gzipSync(JSON.stringify(d)));const statePath=store+'/state.json';fs.writeFileSync(statePath,JSON.stringify({datasets:[{id:'MOCK',versions:[{id:'MOCK',name:d.name,version:1,fileHash:d.fileHash,ref:'input.gz'}],imports:[]}],runs:[],previews:[],records:[]}));
 const permission=action=>(req,res,next)=>{if(req.role==='query'&&action!=='read')return res.status(403).json({error:'forbidden'});if(req.method==='POST'&&!req.body.reason?.trim())return res.status(400).json({error:'reason_required'});next();};
 const router=createWorkbookRouter({dataDir:dir,permission,actorKey:req=>req.actor,requestId:()=> 'in-process-test',workerFactory:()=>{throw Error('NO_WORKER_WINDOW');}});
 async function call(method,route,body={},query={},role='planner',actor='A'){
  const layer=router.stack.find(l=>l.route?.path===route&&l.route.methods[method.toLowerCase()]);assert.ok(layer,route);let at=0;return await new Promise((resolve,reject)=>{const req={method,body:{reason:'explicit synthetic test',...body},params:{id:'MOCK'},query,role,actor},res={statusCode:200,status(n){this.statusCode=n;return this;},json(value){resolve({status:this.statusCode,value});return this;},send(value){if(typeof value==='string'&&value.startsWith('{'))value=JSON.parse(value);resolve({status:this.statusCode,value});return this;},end(){resolve({status:this.statusCode});},type(){return this;},attachment(){return this;}};const next=e=>{if(e)return reject(e);try{const l=layer.route.stack[at++];if(!l)return reject(Error('route did not return'));l.handle(req,res,next);}catch(e){reject(e);}};next();});
 }
 return {dir,statePath,call,bytes:()=>fs.readFileSync(statePath),version:()=>JSON.parse(fs.readFileSync(statePath)).datasets[0].versions.at(-1).version};}
const edit=(version,extra={})=>({expectedVersion:1,expectedParameterRevision:version-1,cp:'CP074',objectId:'MOCK-SUP',field:'检验天数',value:'2',unit:'天',from:0,to:44,scope:'dataset',...extra});

test('parameter help is returned by maintenance and structured rows without writing configuration',async()=>{
 const f=fixture(),before=f.bytes();
 const page=await f.call('GET','/datasets/:id/parameters',{}, {mode:'maintenance',tab:'resource',cp:'CP179',day:1});
 assert.equal(page.status,200);assert.deepEqual(page.value.helpByField['CP179|资源占用方式'].inputSpec.values,['独占','重量共享','重量容量共享']);
 assert.ok(page.value.helpByField['CP179|资源占用方式'].usage.includes('当前数据按日模型'));
 const rows=await f.call('GET','/datasets/:id/rows',{}, {table:'设备与工装',help:'parameters'});assert.equal(rows.status,200);
 assert.ok(rows.value.fieldHelp['可用数量'].zero.includes('不可分配'));assert.ok(rows.value.fieldHelp['资源编号'].maintain.includes('唯一身份'));
 assert.deepEqual(f.bytes(),before);
});

test('PCU06/07/10/19 registered query/save: persisted reverse reads, stale conflict and all denied writes preserve bytes',async()=>{
 const f=fixture(),first=await f.call('POST','/datasets/:id/parameters',edit(1));assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.value.version,1);assert.equal(first.value.parameterRevision,1);
 const step=await f.call('GET','/datasets/:id/parameters',{}, {cp:'CP063',step:'A3',day:1});assert.equal(step.status,200);assert.equal(step.value.records[0]['参数值'],'2');const id=step.value.records[0]['参数编号'];
 const before=f.bytes();for(const body of [edit(1,{id,value:'3'}),edit(1,{id,value:'4'})]){const r=await f.call('POST','/datasets/:id/parameters',body);assert.equal(r.status,409);assert.deepEqual(f.bytes(),before);}
 for(const body of [edit(2,{id,value:''}),edit(2,{id,value:'illegal'}),edit(2,{id,value:'-1'}),edit(2,{id,value:'2',unit:'kg'}),edit(2,{cp:'CP147',field:'版本指纹',value:'1'})]){const r=await f.call('POST','/datasets/:id/parameters',body);assert.equal(r.status,422,JSON.stringify(r));assert.deepEqual(f.bytes(),before);}
 const denied=await f.call('POST','/datasets/:id/parameters',edit(2,{id,value:'4'}),{},'query');assert.equal(denied.status,403);assert.deepEqual(f.bytes(),before);
 const saved=await f.call('POST','/datasets/:id/parameters',edit(2,{id,value:'3'}));assert.equal(saved.status,200);const central=await f.call('GET','/datasets/:id/parameters',{}, {cp:'CP074',day:1});assert.equal(central.value.version,1);assert.equal(central.value.parameterRevision,2);assert.equal(central.value.records[0]['参数值'],'3');
 const reopened=createWorkbookRouter({dataDir:f.dir,permission:()=> (_req,_res,next)=>next(),actorKey:()=> 'A',requestId:()=> 'reopen',workerFactory:()=>{throw Error('NO_WORKER_WINDOW');}});assert.ok(reopened.stack.length>0);assert.equal(JSON.parse(f.bytes()).datasets[0].versions.length,1);
 const native=await f.call('GET','/datasets/:id/parameters/export',{}, {day:1});assert.equal(native.status,200);assert.match(native.value,/CP074/);assert.match(native.value,/dataset/); // Configuration CSV, not frozen-run native export.
});

test('PCU09/12/19: registered isolated trials inherit zero correctly and reject another actor',async()=>{
 const f=fixture();await f.call('POST','/datasets/:id/parameters',edit(1));const trial=await f.call('POST','/datasets/:id/parameter-trials',{expectedVersion:1,expectedParameterRevision:1,name:'independent local scope'});assert.equal(trial.status,200);const scope='trial:'+trial.value.trial.id;
 const local=await f.call('POST','/datasets/:id/parameters',edit(3,{scope,value:'0'}));assert.equal(local.status,200,JSON.stringify(local));const step=await f.call('GET','/datasets/:id/parameters',{}, {scope,cp:'CP074',day:1});assert.equal(step.value.records.find(p=>p.scope===scope)['参数值'],'0');const shared=await f.call('GET','/datasets/:id/parameters',{}, {cp:'CP074',day:1});assert.equal(shared.value.records[0]['参数值'],'2');
 const before=f.bytes();const other=await f.call('POST','/datasets/:id/parameters',edit(4,{scope,value:'1'}),{},'planner','OTHER');assert.equal(other.status,422);assert.deepEqual(f.bytes(),before);
 const override=step.value.records.find(p=>p.scope===scope);const clear=await f.call('POST','/datasets/:id/parameters',edit(4,{scope,id:override['参数编号'],operation:'inherit'}));assert.equal(clear.status,200);const result=await f.call('GET','/datasets/:id/parameters',{}, {scope,cp:'CP074',day:1});assert.equal(result.value.records[0].effectiveValue,'2');
});

test('PCU04: actual registered commit idempotency, fingerprint validation and stale precheck',async()=>{
 const f=fixture(),state=JSON.parse(f.bytes()),next=JSON.parse(gunzipSync(fs.readFileSync(path.join(f.dir,'workbooks/input.gz'))));next.version=2;fs.writeFileSync(path.join(f.dir,'workbooks/import-next.gz'),gzipSync(JSON.stringify(next)));state.previews.push({id:'P',datasetId:'MOCK',fileHash:'PARAM-HASH',sourceFileHash:'business-source',expectedVersion:1,sourceProfile:'excel-qualified-output-202611-r1',profile:'excel-qualified-output-202611-r1',dataRef:'import-next.gz',issues:[],importKey:'MODE-1',readiness:{ready:true},tableRefs:{}});fs.writeFileSync(f.statePath,JSON.stringify(state));
 const req={previewId:'P',fileHash:'PARAM-HASH',expectedVersion:1},first=await f.call('POST','/commit',req);assert.equal(first.status,200);const bytes=f.bytes(),retry=await f.call('POST','/commit',req);assert.equal(retry.value.idempotent,true);assert.deepEqual(f.bytes(),bytes);const wrong=await f.call('POST','/commit',{...req,fileHash:'WRONG'});assert.equal(wrong.status,409);assert.deepEqual(f.bytes(),bytes);assert.equal(JSON.parse(bytes).datasets[0].versions.at(-1).fileHash,'business-source');
});

test('new configuration revision preserves import versions and frozen input bytes, reopens correctly and invalidates old readiness',async()=>{
 const f=fixture(),store=path.join(f.dir,'workbooks'),original=fs.readFileSync(path.join(store,'input.gz')),input=JSON.parse(gunzipSync(original)),state=JSON.parse(f.bytes());
 state.runs.push({id:'MOCK',datasetId:'MOCK',version:1,status:'completed',inputRef:'input.gz',inputHash:hash(input),result:null});fs.writeFileSync(f.statePath,JSON.stringify(state));
 const selection={startDay:1,endDay:14,currentDay:1},checked=await f.call('POST','/datasets/:id/readiness',{version:1,selection});assert.equal(checked.status,200);
 const first=await f.call('POST','/datasets/:id/parameters',edit(1));assert.equal(first.status,200);assert.equal(first.value.version,1);assert.equal(first.value.parameterRevision,1);
 assert.deepEqual(fs.readFileSync(path.join(store,'input.gz')),original);assert.equal(JSON.parse(f.bytes()).datasets[0].versions.length,1);
 const frozen=await f.call('GET','/runs/:id/inputs');assert.equal(frozen.status,200);assert.equal(hash(frozen.value.input),hash(input));
 const stale=await f.call('POST','/datasets/:id/run',{version:1,currentVersion:true,readinessToken:checked.value.token,selection});assert.equal(stale.status,409);assert.equal(stale.value.error,'READINESS_CHANGED');
 const current=await f.call('GET','/datasets/:id',{},{});assert.equal(current.value.version,1);assert.equal(current.value.parameterRevision,1);
 const page=await f.call('GET','/datasets/:id/parameters',{}, {version:1,mode:'maintenance',tab:'supplier',cp:'CP074',object:'MOCK-SUP',day:1});assert.equal(page.value.records.length,1);assert.equal(page.value.records[0].effectiveValue,'2');
 const history=await f.call('GET','/datasets/:id/parameters/history');assert.equal(history.value.total,1);assert.equal(history.value.records[0].before.参数值,input.tables['供应商与供货条件'].find(r=>r['供货关系编号']==='MOCK-SUP')['检验天数']);assert.equal(history.value.records[0].after.参数值,'2');
 const before=f.bytes(),missing=await f.call('POST','/datasets/:id/parameters',{...edit(2),expectedParameterRevision:undefined});assert.equal(missing.status,409);assert.deepEqual(f.bytes(),before);
});
test('an import preview created before a configuration edit cannot replace the newer online value',async()=>{
 const f=fixture(),state=JSON.parse(f.bytes()),store=path.join(f.dir,'workbooks'),next=JSON.parse(gunzipSync(fs.readFileSync(path.join(store,'input.gz'))));next.version=2;
 fs.writeFileSync(path.join(store,'preview.gz'),gzipSync(JSON.stringify(next)));state.previews.push({id:'STALE',datasetId:'MOCK',fileHash:'P-NEXT',expectedVersion:1,expectedParameterRevision:0,dataRef:'preview.gz',issues:[],readiness:{ready:true}});fs.writeFileSync(f.statePath,JSON.stringify(state));
 assert.equal((await f.call('POST','/datasets/:id/parameters',edit(1))).status,200);const before=f.bytes();
 const commit=await f.call('POST','/commit',{previewId:'STALE',fileHash:'P-NEXT',expectedVersion:1});assert.equal(commit.status,409);assert.equal(commit.value.error,'TARGET_CHANGED');assert.deepEqual(f.bytes(),before);
});
test('structured configuration edits share the revision and history without creating a business version',async()=>{
 const f=fixture(),saved=await f.call('POST','/datasets/:id/edit',{expectedVersion:1,expectedParameterRevision:0,configuration:true,table:'物料主数据',key:'MOCK-FG',operation:'edit',changes:{物料名称:'配置维护后的名称'}});
 assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.value.version,1);assert.equal(saved.value.parameterRevision,1);
 const history=await f.call('GET','/datasets/:id/parameters/history');assert.equal(history.value.total,1);assert.equal(history.value.records[0].table,'物料主数据');
 const before=f.bytes(),stale=await f.call('POST','/datasets/:id/edit',{expectedVersion:1,expectedParameterRevision:0,configuration:true,table:'物料主数据',key:'MOCK-FG',operation:'edit',changes:{物料名称:'旧草稿'}});assert.equal(stale.status,409);assert.deepEqual(f.bytes(),before);
});
test('same business version gets a new bound query identity after online maintenance; old chunks cannot read mixed configuration',async()=>{
 const f=fixture(),context=await f.call('GET','/query-reports/context',{}, {request:JSON.stringify({datasetId:'MOCK',version:1})});assert.equal(context.status,200);
 const q={identity:context.value.identity,view:'bom.materials',fromDate:'2026-11-01',toDateInclusive:'2026-11-14',bomAsOfDate:'2026-11-01',knownAsOfDate:'2026-11-01',pageSize:100,offset:0,filters:{},q:''};
 assert.equal((await f.call('POST','/datasets/:id/parameters',edit(1))).status,200);
 const rejected=await f.call('GET','/query-reports/query',{}, {request:JSON.stringify(q)});assert.equal(rejected.status,409);
 const current=await f.call('GET','/query-reports/context',{}, {request:JSON.stringify({datasetId:'MOCK',version:1})});assert.equal(current.value.identity.version,1);assert.notEqual(current.value.identity.fingerprint,context.value.identity.fingerprint);
 const page=await f.call('GET','/query-reports/query',{}, {request:JSON.stringify({...q,identity:current.value.identity})});assert.equal(page.status,200);assert.ok(page.value.total>0);
});
test('mixed structured maintenance logs parameter and descriptive fields and retains the literal baseline',async()=>{
 const f=fixture(),saved=await f.call('POST','/datasets/:id/edit',{expectedVersion:1,expectedParameterRevision:0,configuration:true,table:'物料主数据',key:'MOCK-FG',operation:'edit',changes:{每件净重千克:'2',物料名称:'混合配置维护'}});
 assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.value.version,1);assert.equal(saved.value.parameterRevision,1);
 const p=await f.call('GET','/datasets/:id/parameters',{}, {mode:'maintenance',tab:'material',cp:'CP017',object:'MOCK-FG',day:1});assert.equal(p.value.records[0].effectiveValue,'2');assert.equal(p.value.records[0].baselineValue,'1');
 const history=await f.call('GET','/datasets/:id/parameters/history');assert.equal(history.value.total,2);assert.ok(history.value.records.some(r=>r.cp==='CP017'&&r.after.参数值==='2'));assert.ok(history.value.records.some(r=>r.field==='物料名称'&&r.after.物料名称==='混合配置维护'));
});
