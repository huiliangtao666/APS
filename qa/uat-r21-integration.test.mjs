import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';
import {multiFixture} from './fr013-multisource-fixture.mjs';
import {csvFiles} from './fr013-config-fixture.mjs';

async function worker(f){
 const state=await f.ok('/state'),run=await f.ok('/runs',{revision:state.revision});
 for(let i=0;i<500;i++){
  const result=await f.ok('/runs/'+run.id);
  assert.ok(!['failed','timed_out','cancelled'].includes(result.status),JSON.stringify(result));
  if(['completed','partial'].includes(result.status))return {run:result,input:await f.ok('/runs/'+run.id+'/inputs'),plan:(await f.ok('/plans')).find(p=>p.runId===run.id)};
  await new Promise(r=>setTimeout(r,10));
 }
 throw Error('worker timeout');
}
test('combined v2 mapping, CSV9 rejection, single-table provenance and calendar change preserve frozen Worker history',async t=>{
 const f=await fixture(t),data=multiFixture('tool');
 await f.ok('/inputs',{revision:0,tables:data});
 const first=await worker(f),state=await f.ok('/state');
 assert.equal(first.input.conditions.originalResourceContract,'FR013-resource-map-v2');
 const original=await f.ok('/plans/'+first.plan.id+'/inputs');
 const verified=await f.ok('/plans/'+first.plan.id+'/verify',{});
 assert.equal(verified.verification.checks.calendar.status,'pass');
 assert.equal(verified.verification.checks.resourcePolicies.status,'pass');
 const before=f.bytes();
 const legacy=fs.readFileSync(new URL('../prototypes/fr006-config-only/sample-data/FR-006/18_工装配置.csv',import.meta.url),'utf8');
 const bad=await f.call('/imports/preview',{table:'tools',revision:state.revision,files:[{name:'18_工装配置.csv',text:legacy}]});
 assert.equal(bad.status,400);assert.equal(bad.body.valid,false);assert.ok(!bad.body.id);assert.equal(f.bytes(),before);
 const noop=await f.ok('/inputs',{revision:state.revision,tables:{resourceMappings:state.data.resourceMappings}});
 assert.equal(noop.unchanged,true);assert.equal(f.bytes(),before);
 const machine=first.plan.tasks[0].machine;
 const downtime=[{'设备编号':machine,'起始分钟':'0','结束分钟':'15','原因':'集成验证显式停机'}];
 const file=csvFiles({downtime})[0];
 const preview=await f.ok('/imports/preview',{table:'downtime',revision:state.revision,files:[file]});
 assert.equal(preview.valid,true);assert.equal(f.bytes(),before);
 const saved=await f.ok('/imports/commit',{previewId:preview.id});
 assert.equal(saved.revision,state.revision+1);
 const next=await worker(f),v=await f.ok('/plans/'+next.plan.id+'/verify',{});
 assert.equal(v.verification.checks.calendar.status,'pass');assert.equal(v.verification.checks.resourcePolicies.status,'pass');
 assert.ok(next.plan.tasks.filter(t=>t.machine===machine).every(t=>t.start>=15));
 assert.deepEqual(next.input.executionData.tools,first.input.executionData.tools);
 assert.deepEqual(await f.ok('/runs/'+first.run.id+'/inputs'),first.input);
 assert.deepEqual(await f.ok('/plans/'+first.plan.id+'/inputs'),original);
 const old=(await f.ok('/plans')).find(p=>p.id===first.plan.id);assert.deepEqual(old.verification,verified.verification);
 const frozen=await f.ok('/plans/'+next.plan.id+'/inputs');
 assert.equal(frozen.csvSources.downtime.originalText,file.text);
 assert.equal(frozen.csvSources.downtime.sha256,createHash('sha256').update(file.text).digest('hex'));
 assert.equal(frozen.csvSources.downtime.records[0].line,2);
 assert.equal(frozen.csvSources.downtime.records[0].values['结束分钟'],'15');
 if(process.env.EVIDENCE_DIR)fs.writeFileSync(process.env.EVIDENCE_DIR+'/three-slice-cross.json',JSON.stringify({first,next,verified:v,oldVerified:verified,frozen},null,2));
});
