import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const beforeMode=process.env.INVENTORY_BEFORE==='1';
test('Issue4 inventory field locator r1: exact fields, physical rows, atomic rejection and corrected reimport',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const original=f.bytes(),state=await f.ok('/state'),data=structuredClone(state.data),trace=[];
 Object.assign(data.inventory[0],{'账面数量':'500','已占用数量':'0'});
 for(const [code,field,value,oldField] of [['INVENTORY_MATERIAL','物料编号','UNKNOWN-MATERIAL','关联配置'],['INVENTORY_RESERVED','已占用数量','501','账面数量']]){
  for(const multiline of [false,true])for(const mixed of [false,true]){
   const d=structuredClone(data);let index=0,row=2;
   if(multiline){d.inventory[0]['位置']='first\r\nsecond';d.inventory.push({...d.inventory[0],'批次编号':'ROW2','位置':'second location'});index=1;row=4;}
   d.inventory[index][field]=value;
   const keys=mixed?['inventory','materials']:['inventory'];if(mixed)d.materials[0]['物料名称']+=' revised but must not save';
   const body={revision:0,files:filesOf(d,keys),...(!mixed?{table:'inventory'}:{})};
   const r=await f.call('/imports/preview',body);const finding=r.body.issues?.find(i=>i.code===code);
   trace.push({code,field,value,multiline,mixed,request:body,response:r,beforeSHA256:hash(original),afterSHA256:hash(f.bytes()),zeroWrite:f.bytes()===original});
   if(mixed){assert.equal(r.status,200);assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(i=>i.file==='09_库存批次.csv'&&i.row===1&&i.field==='文件'));assert.equal(f.bytes(),original);continue;}
   assert.equal(r.status,400,JSON.stringify(r));assert.equal(r.body.valid,false);assert.equal(r.body.id,undefined);assert.ok(finding,JSON.stringify(r));
   assert.equal(finding.field,beforeMode?oldField:field,JSON.stringify(finding));assert.equal(finding.row,row);assert.equal(finding.file,'09_库存批次.csv');assert.ok(finding.reason);assert.equal(f.bytes(),original);
   const blocked=await f.call('/imports/commit',{previewId:r.body.id||'invalid-preview'});assert.equal(blocked.status,409);assert.equal(f.bytes(),original);
  }
 }
 const invalids=[['账面数量','-1'],['已占用数量','-1'],['有效期','2026-02-30']];
 for(const [field,value]of invalids){const d=structuredClone(data);d.inventory[0][field]=value;const r=await f.call('/imports/preview',{revision:0,table:'inventory',files:filesOf(d,['inventory'])});assert.equal(r.status,400);assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(i=>i.field===field));assert.equal(f.bytes(),original);trace.push({regression:field,response:r,zeroWrite:true});}
 if(!beforeMode){
  const p=await f.ok('/imports/preview',{revision:0,table:'inventory',files:filesOf(data,['inventory'])});assert.equal(p.valid,true);assert.equal(f.bytes(),original);
  const saved=await f.ok('/imports/commit',{previewId:p.id});assert.equal(saved.revision,1);const after=JSON.parse(f.bytes()),prior=JSON.parse(original);assert.deepEqual(after.data.inventory,data.inventory);assert.deepEqual(after.plans,prior.plans);for(const [id,v]of Object.entries(prior.inputVersions))assert.deepEqual(after.inputVersions[id],v);
  const bytes=f.bytes(),again=await f.ok('/imports/preview',{revision:1,table:'inventory',files:filesOf(data,['inventory'])});assert.equal((await f.ok('/imports/commit',{previewId:again.id})).unchanged,true);assert.equal(f.bytes(),bytes);
  const reopened=await fixture(t);fs.writeFileSync(path.join(reopened.dir,'business.json'),bytes);assert.deepEqual((await reopened.ok('/state')).data.inventory,data.inventory);trace.push({correctedReimport:'PASS',unchangedReimport:'PASS',historyPreserved:true,reopened:true});
 }
 if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,beforeMode?'before.json':'after.json'),JSON.stringify({node:process.version,syntheticActor:true,trace},null,2));fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,beforeMode?'before-business.json':'after-baseline-business.json'),original);}
});
