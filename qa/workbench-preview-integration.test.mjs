// One bounded in-process seam entry. Synthetic authenticated requests and private
// snapshots only: no listener, HTTP, parser, Worker, import or planner execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {gzipSync} from 'node:zlib';
import {createBusinessRouter} from '../server/business.mjs';
import {hash,PROFILE} from '../server/workbook-model.mjs';
import {bindPreview,importChanges} from '../server/workbook-workbench.mjs';
import {buildWorkbookPreview,previewSummary,confirmationPayload} from '../server/workbook-preview.mjs';

function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps-preview-seam-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const data={id:'SYN',version:1,fileHash:'synthetic-business',profile:PROFILE,name:'Explicit synthetic data',tables:{'每日需求':[{'需求编号':'D1','客户编号':'C1',_row:3,_cells:{'需求编号':'A3'}}],'工艺路线':[{'路线工序编号':'S1','成品编号':'SF1','工序编号':'R1'},{'路线工序编号':'S10','成品编号':'SF10','工序编号':'R10'}]},mapping:null,bindings:[]};
 const p={id:'SYN-preview',datasetId:'SYN',expectedVersion:0,fileHash:data.fileHash,name:data.name,profile:PROFILE,snapshotHash:hash(data),requestedKind:'business',mode:'candidate',scope:'dataset',overlayResolution:'keep',owner:'planner-A',status:'preview',issues:[],warnings:[],changeSet:importChanges(null,data),dataRef:'synthetic.gz'};
 bindPreview(p);p.previewModule=buildWorkbookPreview(p,{data});
 const business=createBusinessRouter({dataDir:dir,accessMode:'managed',actorMiddleware:(_r,_s,n)=>n(),requireMember:()=> (_r,_s,n)=>n(),workerFactory:()=>{throw Error('FORBIDDEN_WORKER');}});
 const router=business.stack.find(l=>l.handle?.stack?.some(x=>x.route?.path==='/previews/:id/summary')).handle;
 const file=path.join(dir,'workbooks/state.json'),snap=path.join(dir,'workbooks',p.dataRef);
 fs.writeFileSync(snap,gzipSync(JSON.stringify(data)));
 const initial={datasets:[],previews:[p],records:[],runs:[{id:'frozen-old',status:'completed',inputHash:'unchanged',result:{quantity:180}}]};fs.writeFileSync(file,JSON.stringify(initial));
 function read(){return JSON.parse(fs.readFileSync(file));}
 async function call(method,route,{body={},query={},actor='planner-A',role='planner',exportAllowed=false,site='same-origin',id=p.id}={}){
  const layer=router.stack.find(l=>l.route?.path===route&&l.route.methods[method.toLowerCase()]);assert(layer,route);
  const req={method,body:{reason:'explicit synthetic seam',...body},query,params:{id},member:{role,canExport:exportAllowed},businessAccess:{actor,requestId:'synthetic-request-id'},get:k=>({'sec-fetch-site':site,host:'fixture.invalid',origin:'https://fixture.invalid','x-aps-request':'workbench'}[k.toLowerCase()]),is:()=>true};
  return new Promise((resolve,reject)=>{const res=new EventEmitter();Object.assign(res,{statusCode:200,headersSent:false,destroyed:false,text:'',status(n){this.statusCode=n;return this;},json(b){resolve({status:this.statusCode,body:b,text:this.text});return this;},type(){return this;},set(){return this;},write(s){this.headersSent=true;this.text+=s;return true;},end(){resolve({status:this.statusCode,text:this.text});},destroy(e){reject(e);}});let at=0;const next=e=>{if(e)return reject(e);try{const l=layer.route.stack[at++];if(!l)throw Error('NO_RESPONSE');Promise.resolve(l.handle(req,res,next)).catch(reject);}catch(e){reject(e);}};next();});
 }
 return {p,data,dir,file,snap,read,call,body:confirmationPayload(previewSummary(p),{reason:'explicit synthetic seam',idempotencyKey:'integration-key-0001',acknowledgedReplaceDelete:true,acknowledgedWarnings:true}),bytes:()=>fs.readFileSync(file),write:s=>fs.writeFileSync(file,JSON.stringify(s))};
}
test('real mounted router exposes bounded summaries/pages and server-owned export policy',async t=>{
 const f=setup(t),before=f.bytes();
 for(const route of ['/previews/:id','/previews/:id/summary']){const r=await f.call('GET',route,{role:'query'});assert.equal(r.status,200);assert.equal(r.body.exportAvailable,false);assert.equal(r.body.canCommit,false);for(const k of ['changeSet','issues','parameterThreeWay','dataRef','previewModule'])assert(!(k in r.body));}
 const query={revision:1,summaryFingerprint:f.p.previewModule.summaryFingerprint};
 const page=await f.call('GET','/previews/:id/records',{query,role:'query'});assert.equal(page.status,200);assert(page.body.items.length);assert(!('fields' in page.body.items[0]));
 assert.equal((await f.call('GET','/previews/:id/export',{query:{...query,scope:'ALL'},role:'query'})).status,403);
 const r=await f.call('GET','/previews/:id/export',{query:{...query,scope:'ALL'},role:'query',exportAllowed:true});assert.equal(r.status,200);assert.equal(JSON.parse(r.text.trim().split('\n').at(-1)).complete,true);
 assert.deepEqual(f.bytes(),before);
});
test('legacy module bypass, real role, owner and trusted-write gates do not mutate state',async t=>{
 const f=setup(t),before=f.bytes();
 assert.equal((await f.call('POST','/commit',{body:f.body})).body.error,'module_confirmation_required');
 for(const options of [{role:'query',body:{...f.body,canEdit:true,canExport:true,csrfVerified:true}},{site:'cross-site',body:f.body},{actor:'other-planner',body:f.body}])assert.equal((await f.call('POST','/previews/:id/confirm',options)).status,403);
 assert.deepEqual(f.bytes(),before);
});
test('confirmation commits original state once; persisted receipt/reopen/replay preserve frozen history and actual audit',async t=>{
 const f=setup(t),frozen=f.read().runs;
 const r=await f.call('POST','/previews/:id/confirm',{body:f.body});assert.equal(r.status,200);assert.equal(r.body.version,1);assert.equal(r.body.checksInvalidated,true);
 const saved=f.read();assert.equal(saved.datasets.length,1);assert.equal(saved.datasets[0].versions.length,1);assert.equal(saved.datasets[0].imports.length,1);assert.equal(saved.records[0].actor,'planner-A');assert.equal(saved.records[0].requestId,'synthetic-request-id');assert.deepEqual(saved.runs,frozen);
 const bytes=f.bytes();const replay=await f.call('POST','/previews/:id/confirm',{body:f.body});assert.equal(replay.body.idempotent,true);assert.deepEqual(f.bytes(),bytes);
 const status=await f.call('GET','/previews/:id/commit-status',{query:{idempotencyKey:f.body.idempotencyKey}});assert.equal(status.body.status,'COMMITTED');
 assert.equal((await f.call('POST','/previews/:id/confirm',{body:{...f.body,reason:'changed request'}})).body.error,'IDEMPOTENCY_CONFLICT');assert.deepEqual(f.bytes(),bytes);
 const exact=await f.call('GET','/datasets/:id/rows',{id:'SYN',query:{table:'工艺路线',exactField:'成品编号',exactValue:'SF1'}});assert.equal(exact.body.total,1);assert.equal(exact.body.rows[0]['成品编号'],'SF1');
});
test('original dataRef tamper and competing target reject without partial receipt or version',async t=>{
 const f=setup(t),before=f.bytes();fs.writeFileSync(f.snap,gzipSync(JSON.stringify({...f.data,fileHash:'TAMPERED'})));
 const bad=await f.call('POST','/previews/:id/confirm',{body:f.body});assert.equal(bad.status,409);assert.equal(bad.body.error,'PREVIEW_DATA_CHANGED');assert.deepEqual(f.bytes(),before);
 fs.writeFileSync(f.snap,gzipSync(JSON.stringify(f.data)));const s=f.read();s.datasets.push({id:'SYN',versions:[{version:1}],imports:[]});f.write(s);const changed=f.bytes();
 assert.equal((await f.call('POST','/previews/:id/confirm',{body:f.body})).body.error,'TARGET_CHANGED');assert.deepEqual(f.bytes(),changed);
});
test('legacy preview reads require re-preview; no old raw response route remains',async t=>{
 const f=setup(t),s=f.read();delete s.previews[0].previewModule;f.write(s);const r=await f.call('GET','/previews/:id');assert.equal(r.status,410);assert.equal(r.body.error,'legacy_preview_requires_reimport');
});
