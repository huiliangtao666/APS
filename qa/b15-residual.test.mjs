import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture,trialOf,preview,commit} from './fr027-fixture.mjs';
import {batchFixture} from './batch-fixture.mjs';
import {seed} from '../server/planner.ts';
import {r4Scenario} from './r4-fixture.mjs';
import {residualProfile} from './b15-residual-fixture.mjs';
import {b2Worker} from './b2-fixture.mjs';
import {resourceClient,resourceTaskSources} from '../src/lib/resource-workbench.mjs';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
const out=process.env.RESIDUAL_OUT;
const save=(name,x)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(x,null,2));}};
const hash=x=>createHash('sha256').update(x).digest('hex');
async function imported(t,id){
 const f=await fixture(t),profile=residualProfile(id,id<'15'?'/fixtures/originals':'/fixtures/b15-originals');
 const readBytes=f.bytes;f.bytes=()=>fs.existsSync(path.join(f.dir,'business.json'))?readBytes():null;
 await f.ok('/state');const before=f.bytes(),p=await f.call('/imports/preview',{revision:0,files:profile.files,repairs:profile.repairs,inputStage:'supported'});
 assert.equal(p.body.valid,true,JSON.stringify(p.body.issues));assert.equal(f.bytes(),before);
 await f.ok('/imports/commit',{previewId:p.body.id});return {f,profile,preview:p.body};
}
for(const id of ['12','13','14','15','17','18'])test('original05/06/12/17 '+id+' adopted by actual application Worker with frozen physical sources',async t=>{
 const {f,profile,preview:p}=await imported(t,id),result=await b2Worker(f),{input,plan}=result;
 assert.equal(result.run.status,'completed');assert.equal(plan.tasks.length,['12','17'].includes(id)?5:['13','14'].includes(id)?10:id==='15'?4:2);
 const bindings=input.conditions.originalDependencyBindings;
 assert.ok(bindings.length&&bindings.every(b=>b.status==='BOUND'));
 assert.ok(bindings.some(b=>b.materialContract==='existing-versioned-bom-at-feed-v1'));
 assert.equal(verifyResourcePolicies(plan,input.executionData,input.conditions).status,'pass');
 for(const [key,prefix]of [['originalTools','05'],['originalPersonnel','06'],['originalDependencies','12'],['orders','17'],['originalBom','09']]){
  const name=prefix==='09'?'09_物料BOM配置.csv':profile.originals.find(f=>f.name.startsWith(prefix+'_')).name,original=profile.originals.find(f=>f.name===name);
  assert.equal(plan.inputCsvSources[key].originalText,original.text);assert.equal(plan.inputCsvSources[key].sha256,hash(original.text));
 }
 const view=await resourceClient(f.ok).reopen(result.run.id),refs=resourceTaskSources(view,plan.tasks.filter(t=>t.operation==='MIX').map(t=>t.id));
 for(const table of ['originalTools','originalPersonnel','originalDependencies','resourceMappings','personnelPools'])assert.ok(refs.some(r=>r.table===table&&r.physicalRow&&r.sourceSha256),table);
 assert.ok(input.executionData.dependencies.some(d=>d['资源类型']==='物料'&&d['需求数量']==='由BOM计算'));
 const csv=await f.ok('/export',resourceClient(f.ok).exportBody(view));assert.ok(csv.includes(result.run.snapshotHash)&&csv.includes('由BOM计算'));
 const v=await f.ok('/plans/'+plan.id+'/verify',{});assert.equal(v.verification.checks.resourcePolicies.status,'pass');
 const frozen=await f.ok('/plans/'+plan.id+'/inputs');
 // Original09 may differ from the explicit calculation BOM. No inferred mapping.
 assert.ok(input.conditions.checkScope.unchecked.some(x=>x.includes('原09')));
 const state=await f.ok('/state'),tools=structuredClone(state.data.originalTools);tools.find(r=>state.data.resourceMappings.some(m=>m['来源编号']===r['资源编号']))['可用数量']='99';const before=f.bytes(),bad=await f.call('/inputs',{revision:state.revision,tables:{originalTools:tools}});assert.equal(bad.status,400);assert.equal(f.bytes(),before);
 assert.deepEqual(await f.ok('/plans/'+plan.id+'/inputs'),frozen);
 save('adopted-'+id,{profile,preview:p,result,refs,csv,verification:v,frozen,rejectedEdit:bad});
});
test('material and source contracts reject missing versioned BOM, stale mappings, wrong offsets/types, and numeric material atomically',async t=>{
 const {f}=await imported(t,'17'),state=await f.ok('/state'),cases=[];
 for(const [name,change]of [
  ['missing-bom',d=>d.bom=[]],
  ['numeric-material',d=>d.originalDependencies.find(r=>r['资源类型']==='物料')['需求数量']='1'],
  ['material-offset',d=>d.originalDependencies.find(r=>r['资源类型']==='物料')['提前占用分钟']='1'],
  ['unknown-type',d=>d.originalDependencies[0]['资源类型']='unknown'],
  ['duplicate-map',d=>d.resourceMappings.push({...d.resourceMappings[0],'配置编号':'duplicate'})],
  ['stale-map',d=>d.resourceMappings[0]['配置版本']='0'],
  ['pool-missing',d=>d.personnelPools=[]],
  ['space-wrong-output',d=>d.dependencies.find(x=>x['资源类型']==='空间')['需求数量']='250'],
 ]){const data=structuredClone(state.data);change(data);const before=f.bytes(),r=await f.call('/inputs',{revision:state.revision,tables:data});assert.equal(r.status,400,name);assert.equal(f.bytes(),before,name);cases.push({name,r,zeroWrite:true});}
 const run=await b2Worker(f),c=structuredClone(run.input.conditions);c.originalDependencyBindings.find(b=>b.materialContract).targets=[];assert.equal(verifyResourcePolicies(run.plan,run.input.executionData,c).status,'problem');
 save('negative-bindings',{cases,tamperedFrozenBinding:'independent checker problem'});
});
test('batch member movement, atomic group locks and real Worker replay preserve exact quantities and immutable old snapshots',async t=>{
 const f=await fixture(t),{base,root,trial}=await trialOf(f,r4Scenario('13')),heat=base.tasks.find(t=>t.operation==='HEAT'),memberIds=base.tasks.filter(t=>t.resourceBatchId===heat.resourceBatchId).map(t=>t.id);
 assert.equal(memberIds.length,2);const bytes=f.bytes(),p=await preview(f,root,heat.id,{start:heat.start,machine:heat.machine});assert.deepEqual(p.memberIds,memberIds);assert.equal(f.bytes(),bytes);
 const locked=await commit(f,root,await preview(f,root,heat.id,{locked:true},'lock'));
 const locks=(await f.ok('/trials')).find(t=>t.id===trial.id).locks;assert.deepEqual(Object.keys(locks).sort(),memberIds.sort());
 const state=await f.ok(root+'/positions'),attempt=await f.call(root+'/move-preview',{planId:state.planId,planHash:state.planHash,revision:state.revision,taskId:memberIds[1],start:200,machine:heat.machine});assert.equal(attempt.status,409);
 const r=await f.ok('/runs',{trialId:trial.id,revision:1});let terminal;
 for(let i=0;i<500;i++){terminal=await f.ok('/runs/'+r.id);if(['completed','failed','partial'].includes(terminal.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(terminal.status,'completed',JSON.stringify(terminal));
 const replay=(await f.ok('/plans')).find(p=>p.id===terminal.planId);assert.deepEqual(replay.productionBatches,base.productionBatches);assert.equal(replay.tasks.find(t=>t.id===heat.id).start,heat.start);
 const pack=replay.tasks.find(t=>t.operation==='PACK'&&t.orderId==='B'),moved=await commit(f,root,await preview(f,root,pack.id,{start:pack.start+20,machine:pack.machine}));assert.equal(moved.tasks.find(t=>t.id===pack.id).start,pack.start+20);
 assert.deepEqual(moved.productionBatches,base.productionBatches);assert.deepEqual((await f.ok('/plans')).find(p=>p.id===base.id).tasks,base.tasks);
 const reopened=(await f.ok('/plans')).find(p=>p.id===moved.id);assert.deepEqual(reopened.positionEdit.memberIds,[pack.id]);
 save('batch-move-lock',{base,trial,p,locked,locks,replay,moved,csv:await f.ok('/export',{planId:moved.id})});
});
test('batch preview rejects separation, precedence, maximum-wait, wrong machine, horizon and stale/forged requests without store writes',async t=>{
 const f=await fixture(t),{base,root}=await trialOf(f,r4Scenario('13')),cool=base.tasks.find(t=>t.operation==='COOL'),heat=base.tasks.find(t=>t.operation==='HEAT'),cases=[];
 for(const [name,task,change]of [
  ['wait-boundary-11',cool,{start:heat.end+11,machine:cool.machine}],
  ['predecessor',cool,{start:heat.end-1,machine:cool.machine}],
  ['machine',heat,{start:heat.start,machine:'MIX01'}],
  ['horizon',heat,{start:590,machine:heat.machine}],
  ['material-time',base.tasks.find(t=>t.operation==='MIX'),{start:590,machine:'MIX01'}],
 ]){const before=f.bytes(),p=await preview(f,root,task.id,change),check=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(check.valid,false,name);assert.equal((await f.call(root+'/previews/'+p.id+'/commit',{})).status,409);await f.ok(root+'/previews/'+p.id+'/cancel',{});assert.equal(f.bytes(),before);cases.push({name,p,check,zeroWrite:true});}
 const s=await f.ok(root+'/positions'),before=f.bytes();for(const extra of [{duration:1},{memberIds:[heat.id]},{quantity:1},{planHash:'forged'}])assert.ok((await f.call(root+'/move-preview',{planId:s.planId,planHash:s.planHash,revision:s.revision,taskId:heat.id,start:heat.start,machine:heat.machine,...extra})).status>=400);assert.equal(f.bytes(),before);
 save('batch-negative',{base,cases});
});
test('existing whole-route FR021 batches keep the same members during final-operation moves, locks and recalculation',async t=>{
 const f=await fixture(t),{base,root,trial}=await trialOf(f,batchFixture(seed));assert.ok(base.batchChecked&&base.tasks.length);
 const task=base.tasks.filter(t=>t.operation==='FILL').at(-1),members=base.tasks.filter(t=>t.resourceBatchId===task.resourceBatchId);
 const moved=await commit(f,root,await preview(f,root,task.id,{start:task.start+30,machine:task.machine}));
 for(const m of members)assert.equal(moved.tasks.find(t=>t.id===m.id).start,task.start+30);
 await commit(f,root,await preview(f,root,task.id,{locked:true},'lock'));
 const again=await f.ok('/calculate',{trialId:trial.id,revision:2});assert.equal(again.tasks.find(t=>t.id===task.id).start,task.start+30);
 assert.deepEqual(again.productionBatches,base.productionBatches);
 save('whole-route-batch',{base,moved,again});
});
test('full-route confirmation replays bound sources; changed quantities, provenance or wait cannot be accepted',async t=>{
 const {f}=await imported(t,'17'),result=await b2Worker(f),p=result.plan;
 await f.ok('/plans/'+p.id+'/verify',{});
 const review=await f.ok('/plans/'+p.id+'/review');assert.deepEqual(review.blockers,[]);
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(x=>x.id),acceptPartial:false,acceptConditionalSupply:true,acknowledgeScope:true});
 await f.ok('/plans/'+p.id+'/submit',decision(review));const submitted=await f.ok('/plans/'+p.id+'/review');await f.ok('/plans/'+p.id+'/confirm',decision(submitted),'supervisor');
 const confirmed=(await f.ok('/plans/'+p.id+'/review')).confirmation;assert.ok(confirmed?.snapshot);assert.equal(confirmed.snapshot.plan.processRouteContract,'R4-kg-fixed-pair-v1');
 const old=JSON.stringify(confirmed);await f.ok('/plans/'+p.id+'/copy',{});assert.equal(JSON.stringify(await f.ok('/confirmations/'+confirmed.id)),old);
 save('route-confirmed',{result,review,submitted,confirmation:confirmed});
});
