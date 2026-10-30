import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {configFixture,csvFiles} from './fr013-config-fixture.mjs';
import {resourceMappingTransition} from '../src/lib/resource-mapping.mjs';
const parentRoot=process.env.PARENT_ROOT;
assert.ok(parentRoot,'Set PARENT_ROOT to an isolated bd6f9fabe8354432e9c67b52219dc26989c2761d checkout with dependencies');
async function completed(f,id){for(let i=0;i<500;i++){const r=await f.ok('/runs/'+id);if(['completed','partial'].includes(r.status))return r;assert.notEqual(r.status,'failed',JSON.stringify(r));await new Promise(r=>setTimeout(r,10));}throw Error('Worker timeout');}
const evidence=[];const hash=x=>createHash('sha256').update(x).digest('hex');
async function legacy(t,kind){
 const {fixture:parentFixture}=await import(parentRoot+'/qa/fr027-fixture.mjs');const {configFixture:parentConfig,csvFiles:parentCsv}=await import(parentRoot+'/qa/fr013-config-fixture.mjs');
 const p=await parentFixture(t),d=parentConfig(kind);await p.ok('/inputs',{revision:0,tables:d});const s=await p.ok('/state'),files=parentCsv({resourceMappings:s.data.resourceMappings});
 const oldRun=await p.ok('/runs',{revision:s.revision});await completed(p,oldRun.id);
 const b=p.bytes(),pv=await p.ok('/imports/preview',{revision:s.revision,files});assert.equal(pv.valid,true);assert.equal(p.bytes(),b);
 const oldFrozen=await p.ok('/runs/'+oldRun.id+'/inputs');const f=await fixture(t);fs.writeFileSync(f.dir+'/business.json',b);return {f,d,files,b,s,oldFrozen,parentPreview:pv};
}
for(const kind of ['tool','personnel'])test(`V1-NOOP ${kind}: real parent full store, identical 19 columns preview/commit/repeat/API remain byte-identical`,async t=>{
 const {f,files,b,s,oldFrozen,parentPreview}=await legacy(t,kind);assert.ok(s.data.resourceMappings.every(m=>!Object.hasOwn(m,'字段权威JSON')));
 const pv=await f.call('/imports/preview',{revision:s.revision,files});evidence.push({id:'V1-NOOP-'+kind,parentPreview:parentPreview.valid,csv:files,parentStore:JSON.parse(b),parentHash:hash(b),candidatePreview:pv});assert.equal(pv.status,200,JSON.stringify(pv));assert.equal(pv.body.valid,true);assert.equal(f.bytes(),b);
 for(let i=0;i<2;i++){
  const pre=await f.ok('/imports/preview',{revision:s.revision,files});const c=await f.ok('/imports/commit',{previewId:pre.id});assert.equal(c.unchanged,true);assert.equal(c.revision,s.revision);assert.equal(f.bytes(),b);
 }
 const api=await f.ok('/inputs',{revision:s.revision,tables:{resourceMappings:s.data.resourceMappings}});assert.equal(api.unchanged,true);assert.equal(f.bytes(),b);
 const reopen=await f.ok('/state');assert.deepEqual(reopen.data,s.data);assert.equal(reopen.revision,s.revision);evidence.at(-1).finalHash=hash(f.bytes());
 const oldRun=JSON.parse(b).runs[0],oldInputs=await f.ok('/runs/'+oldRun.id+'/inputs');assert.deepEqual(oldInputs,oldFrozen);assert.equal(f.bytes(),b);
 const run=await f.ok('/runs',{revision:s.revision});await completed(f,run.id);assert.deepEqual(await f.ok('/runs/'+oldRun.id+'/inputs'),oldInputs);
});
for(const kind of ['tool','personnel'])test(`V1-EDIT ${kind}: real same-version change CSV and API atomically reject`,async t=>{
 const {f,b,s}=await legacy(t,kind);const rows=structuredClone(s.data.resourceMappings);rows[0]['别名']+=' edited';const api=await f.call('/inputs',{revision:s.revision,tables:{resourceMappings:rows}});assert.equal(api.status,400);assert.ok(api.body.issues.some(i=>i.field==='配置版本'&&i.code==='NOT_READY_CONFIG'));assert.equal(f.bytes(),b);
 const csv=await f.call('/imports/preview',{revision:s.revision,files:csvFiles({resourceMappings:rows})});assert.equal(csv.status,400);assert.equal(f.bytes(),b);evidence.push({id:'V1-EDIT-'+kind,api,csv,beforeHash:hash(b),afterHash:hash(f.bytes())});
 rows[0]['配置版本']='2';const saved=await f.ok('/inputs',{revision:s.revision,tables:{resourceMappings:rows}});assert.equal(saved.revision,s.revision+1);assert.equal(saved.data.resourceMappings[0]['别名'],rows[0]['别名']);
});
for(const kind of ['tool','personnel'])test(`V1-NEW ${kind}: empty current mapping store accepts initial parent 19-column CSV and Worker`,async t=>{
 const {f,d,files}=await legacy(t,kind);const fresh=await fixture(t);await fresh.ok('/inputs',{revision:0,tables:{...d,resourceMappings:[]}});const state=await fresh.ok('/state'),b=fresh.bytes();const pre=await fresh.ok('/imports/preview',{revision:state.revision,files});assert.equal(pre.valid,true);assert.equal(fresh.bytes(),b);await fresh.ok('/imports/commit',{previewId:pre.id});const saved=await fresh.ok('/state');assert.equal(saved.data.resourceMappings.length,d.resourceMappings.length);assert.ok(saved.data.resourceMappings.every(m=>m['字段权威JSON']===''));const run=await fresh.ok('/runs',{revision:saved.revision});await completed(fresh,run.id);evidence.push({id:'V1-NEW-'+kind,run:await fresh.ok('/runs/'+run.id+'/inputs')});
});
test('V1-STRICT optional nonempty, other missing fields, historical version reuse still reject',()=>{
 const d=configFixture('tool'),old=d.resourceMappings[0];delete old['字段权威JSON'];
 for(const mutate of [m=>m['字段权威JSON']=' ',m=>m['字段权威JSON']='{}',m=>delete m['别名'],m=>m['配置依据']+=' change',m=>m['合同版本']='FR013-resource-map-v2']){const m=structuredClone(old);mutate(m);assert.equal(resourceMappingTransition(d,{resourceMappings:[m]}).length,1);}
 assert.equal(resourceMappingTransition({resourceMappings:[]},d,[{target:'resourceMappings',before:d.resourceMappings}]).length,1);
});
test.after(()=>{if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});fs.writeFileSync(process.env.EVIDENCE_DIR+'/v1-noop-results.json',JSON.stringify(evidence,null,2));}});
