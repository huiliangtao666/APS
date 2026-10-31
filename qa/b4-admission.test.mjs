import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';

test('B4-A01 real API guards unchanged: original19 refused with no token or business write',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const s=await f.ok('/state'),results=[];
 for(const id of ['12','13','14','17']){
  const folder=path.join(process.env.B4_INPUTS,'UAT-'+id);
  const files=fs.readdirSync(folder).filter(n=>/^(0[1-9]|1[0-9])_.*\.csv$/.test(n)).map(name=>({name,text:fs.readFileSync(path.join(folder,name),'utf8')}));
  assert.equal(files.length,19);const before=f.bytes(),response=await f.call('/imports/preview',{revision:s.revision,files});
  assert.ok([200,400].includes(response.status));assert.equal(response.body.valid,false);assert.ok(!response.body.id);assert.equal(f.bytes(),before);
  const forged=await f.call('/imports/commit',{previewId:'B4-invalid-no-token'});assert.ok(forged.status>=400);assert.equal(f.bytes(),before);
  results.push({id:'UAT-'+id,response,forged,atomicUnchanged:true,classification:'INTEGRATION_DEPENDENCY: literal original contract rejected before application Worker; not a new product FAIL'});
 }
 fs.writeFileSync(path.join(process.env.B4_EVIDENCE,'b4-admission.json'),JSON.stringify(results,null,2));
});

test('B4-A02 enabling MAX_LAG still refuses atomically until the shared planner is integrated',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const state=await f.ok('/state'),before=f.bytes();
 const rules=state.data.rules.map(r=>r['规则编号']==='MAX_LAG'?{...r,'是否启用':'是','参数JSON':'{}'}:r);
 const response=await f.call('/inputs',{revision:state.revision,tables:{rules}});
 assert.equal(response.status,400);assert.equal(f.bytes(),before);
 fs.writeFileSync(path.join(process.env.B4_EVIDENCE,'b4-max-lag-guard.json'),JSON.stringify({response,atomicUnchanged:true,classification:'Shared rule capability intentionally not enabled by unintegrated B4 module'},null,2));
});
