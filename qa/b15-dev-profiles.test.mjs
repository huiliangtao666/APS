import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';import {uat15,uat17,uat18} from './b15-test-fixture.mjs';
import {scenarioFiles} from './b3-material-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';
import {b15DevScenario} from './b15-dev-fixture.mjs';
const dump=(id,x)=>{if(process.env.B15_EVIDENCE)fs.writeFileSync(path.join(process.env.B15_EVIDENCE,id+'.json'),JSON.stringify(x,null,2));};
for(const id of ['15','17','18'])test('B15 final shared API imports, calculates, copies, verifies and retains explicit UAT'+id,async t=>{
 const f=await fixture(t),data=b15DevScenario(id),s=await f.ok('/state');
 const preview=await f.ok('/imports/preview',{revision:s.revision,files:scenarioFiles(data),inputStage:'supported'});assert.equal(preview.valid,true,JSON.stringify(preview.issues));await f.ok('/imports/commit',{previewId:preview.id});
 const first=await b2Worker(f,id==='15'?{startMinute:60}:undefined);assert.equal(first.run.status,'completed');assert.equal(first.plan.applicationProtection.valid,true);
 const original=await f.ok('/plans/'+first.plan.id+'/inputs'),saved=JSON.stringify(first.plan);
 const trial=await f.ok('/plans/'+first.plan.id+'/copy',{}),root='/trials/'+trial.id;
 let tables={};
 if(id==='15'){const next=structuredClone(trial.data);next.personnelGroups.forEach(g=>g['人员数量']='2');next.personnelPools[0]['总人数']='2';tables={personnelGroups:next.personnelGroups,personnelPools:next.personnelPools};}
 if(id==='18'){const next=uat18(true);tables=Object.fromEntries(['times','calendars','tools','resourceClaims','bom'].map(k=>[k,next[k]]));}
 if(Object.keys(tables).length){const before=f.bytes(),preview=await f.ok(root+'/inputs/check',{revision:0,tables});assert.equal(preview.valid,true);assert.equal(f.bytes(),before);await f.ok(root+'/inputs',{revision:0,tables});}
 const current=(await f.ok('/trials'))[0],run=await f.ok('/runs',{trialId:trial.id,revision:current.revision});let terminal;
 for(let n=0;n<500;n++){terminal=await f.ok('/runs/'+run.id);if(['completed','partial','failed'].includes(terminal.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(terminal.status,'completed',JSON.stringify(terminal));const plan=(await f.ok('/plans')).find(p=>p.id===terminal.planId);
 const verified=await f.ok('/plans/'+plan.id+'/verify',{});assert.equal(verified.verification.protection.valid,true);assert.equal(verified.verification.checks.jointConditions.status,'pass');
 if(id==='15'){assert.equal(plan.tasks.find(t=>t.id==='B-MIX').start,180);assert.deepEqual(plan.tasks.filter(t=>t.orderId==='A').map(t=>[t.start,t.end]),[[0,30],[30,60]]);}
 if(id==='17'){assert.equal(plan.deliveryAssessment.orders[0].expectedDeliverableMinute,350);assert.equal(plan.deliveryAssessment.orders[0].delayMinutes,260);}
 if(id==='18')assert.equal(plan.materialDemands.find(m=>m.materialId==='LEAN').quantity,175);
 const retained=await f.ok(root+'/retain',{revision:current.revision,planId:plan.id});await f.ok(root+'/discard',{revision:current.revision});
 assert.equal(JSON.stringify((await f.ok('/plans')).find(p=>p.id===first.plan.id)),saved);assert.deepEqual(await f.ok('/plans/'+first.plan.id+'/inputs'),original);
 dump('APP_PROFILE_'+id,{first,terminal,plan:verified,retained,originalUnchanged:true});
});
