import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture,trialOf,preview,commit} from './fr027-fixture.mjs';import {seed} from '../server/planner.ts';import {executionFixture} from './execution-fixture.mjs';import {jointFixture} from './joint-fixture.mjs';import {deliveryFixture} from './delivery-fixture.mjs';
const find=(p,id='A-FILL')=>p.tasks.find(t=>t.id===id);
test('AC19 actual allowed time move requires preview then independent recheck and explicit immutable commit, save/reload/compare/CSV',async t=>{
 const f=await fixture(t),{base,trial,root}=await trialOf(f),original=f.bytes(),p=await preview(f,root);
 assert.equal(p.checked,false);assert.equal(f.bytes(),original);assert.equal((await f.call(root+'/previews/'+p.id+'/commit',{})).status,409);
 const next=await commit(f,root,p);assert.equal(find(next).start,90);assert.equal(find(next).duration,find(base).duration);assert.equal(find(next).id,find(base).id);assert.equal(next.positionEdit.source,find(base).source);
 assert.deepEqual((await f.ok('/plans')).find(x=>x.id===base.id).tasks,base.tasks);assert.equal(JSON.parse(f.bytes()).plans.find(x=>x.id===next.id).tasks.find(x=>x.id==='A-FILL').start,90);
 assert.equal((await f.call(root+'/previews/'+p.id+'/commit',{})).status,409);assert.equal((await f.call('/plans',{id:next.id})).status,201);
 const compare=await f.ok('/plans/'+base.id+'/compare/'+next.id);assert.ok(compare.tasks.changes.length);assert.equal((await f.call('/export',{planId:next.id})).status,200);
 const retained=await f.ok(root+'/retain',{revision:1,planId:next.id});assert.ok(retained);
 const log=await f.ok('/operations');const op=log.find(r=>r.action==='trial_position_committed');assert.equal(op.actor,'test#planner');assert.equal(op.requestId,'fr027-synthetic');assert.equal(op.sourcePlanId,trial.basePlanId);
});
test('AC19 forbidden machine and invalid precedence/calendar drops remain invalid with specific identity/conflicts; cancel never mutates',async t=>{
 const f=await fixture(t),{root}=await trialOf(f);
 for(const change of [{start:0,machine:'FILL01'},{start:590,machine:'FILL01'},{start:90,machine:'MIX02'},{start:90,machine:'FILL02'}]){
  const before=f.bytes(),p=await preview(f,root,'A-FILL',change),r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,false,JSON.stringify(change));assert.ok(r.check.findings.some(x=>x.taskIds.includes('A-FILL')));assert.equal((await f.call(root+'/previews/'+p.id+'/commit',{})).status,409);await f.ok(root+'/previews/'+p.id+'/cancel',{});assert.equal(f.bytes(),before);
 }
 const p=await preview(f,root);await f.ok(root+'/previews/'+p.id+'/recheck',{});const before=f.bytes();await f.ok(root+'/previews/'+p.id+'/cancel',{});assert.equal(f.bytes(),before);
});
test('AC19 persisted unstarted locks survive Worker and synchronous recompute; lock-vs-calendar conflicts never silently move/unlock',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f);await commit(f,root,await preview(f,root));
 await commit(f,root,await preview(f,root,'A-FILL',{locked:true},'lock'));let trialNow=(await f.ok('/trials')).find(x=>x.id===trial.id);assert.equal(trialNow.locks['A-FILL'].start,90);
 assert.equal((await f.call(root+'/move-preview',{...(await f.ok(root+'/positions')),taskId:'A-FILL',start:100,machine:'FILL01'})).status,409);
 let p=await f.ok('/calculate',{trialId:trial.id,revision:2});assert.equal(find(p).start,90);assert.equal(find(p).machine,'FILL01');
 const r=await f.ok('/runs',{trialId:trial.id,revision:2});let terminal;for(let i=0;i<100;i++){terminal=await f.ok('/runs/'+r.id);if(['completed','partial','failed'].includes(terminal.status))break;await new Promise(r=>setTimeout(r,20));}assert.equal(terminal.status,'completed');p=(await f.ok('/plans')).find(p=>p.id===terminal.planId);assert.equal(find(p).start,90);
 await f.ok(root+'/inputs',{revision:2,tables:{downtime:[{'设备编号':'FILL01','起始分钟':'80','结束分钟':'130','原因':'锁定窗口维护'}]}});
 const plansBefore=await f.ok('/plans'),rejected=await f.call('/calculate',{trialId:trial.id,revision:3});assert.equal(rejected.status,409);assert.ok(rejected.body.protection.issues.some(x=>x.code==='B15_LOCK_CONFLICT'));assert.deepEqual(await f.ok('/plans'),plansBefore);trialNow=(await f.ok('/trials')).find(x=>x.id===trial.id);assert.equal(trialNow.locks['A-FILL'].start,90);assert.equal(trialNow.locks['A-FILL'].machine,'FILL01');assert.equal(JSON.parse(f.bytes()).trials.find(x=>x.id===trial.id).locks['A-FILL'].start,90);
 assert.equal((await f.ok('/runs/'+rejected.body.runId)).status,'failed');
});
test('AC19 lock cannot silently disappear on duration/rule change or missing task selection; explicit unlock preserves history',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f);await commit(f,root,await preview(f,root,'A-FILL',{locked:true},'lock'));
 const locked=f.bytes(),unlock=await preview(f,root,'A-FILL',{locked:false},'lock');assert.equal(f.bytes(),locked);await f.ok(root+'/previews/'+unlock.id+'/cancel',{});assert.equal(f.bytes(),locked);
 const times=structuredClone(seed.times);times.find(x=>x['产品编号']==='HC40'&&x['工序编号']==='FILL')['固定分钟']='45';await f.ok(root+'/inputs',{revision:1,tables:{times}});const before=await f.ok('/plans'),p=await f.call('/calculate',{trialId:trial.id,revision:2});assert.equal(p.status,409);assert.ok(p.body.protection.issues.some(x=>x.code==='B15_LOCK_CONFLICT'));assert.deepEqual(await f.ok('/plans'),before);assert.equal((await f.ok('/trials')).find(x=>x.id===trial.id).locks['A-FILL'].duration,30);
});
test('AC21 current started/partial/completed and historical executed tasks reject forged drag and lock APIs with no mutation',async t=>{
 for(const state of ['已开始','部分完成','已完成']){const f=await fixture(t),{root}=await trialOf(f,executionFixture(seed,state)),s=await f.ok(root+'/positions');assert.equal(s.tasks.find(x=>x.id==='A-MIX').movable,false);
  for(const kind of ['move','lock']){const before=f.bytes();const r=await f.call(root+'/'+kind+'-preview',{planId:s.planId,planHash:s.planHash,revision:s.revision,taskId:'A-MIX',...(kind==='move'?{start:150,machine:'MIX02'}:{locked:true})});assert.equal(r.status,409);assert.equal(r.body.error,'task_execution_protected');assert.equal(f.bytes(),before);}
 }
});
test('AC21 changed current facts invalidate preview recheck/commit, trial verify and replay; consumed/remaining facts never change',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f,executionFixture(seed)),p=await preview(f,root,'A-FILL',{start:100,machine:'FILL01'});const r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,true);
 const s=await f.ok('/state'),facts=structuredClone(s.data.executionFacts);Object.assign(facts[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});await f.ok('/tables/executionFacts',{rows:facts,revision:s.revision});const before=f.bytes();
 for(const action of ['recheck','commit']){const x=await f.call(root+'/previews/'+p.id+'/'+action,{});assert.equal(x.status,409);assert.equal(x.body.error,'current_execution_changed');}assert.equal((await f.call('/plans/'+trial.basePlanId+'/verify',{})).body.error,'current_execution_changed');assert.equal((await f.call('/calculate',{trialId:trial.id,revision:0})).status,409);assert.equal(f.bytes(),before);
 const current=await f.ok('/state');assert.equal(current.data.executionMaterials[0]['累计已用数量'],'40');assert.equal(current.data.executionFacts[0]['剩余工时分钟'],'15');
});
test('moving downstream of actual remaining work preserves exact material quantity and no double consumption',async t=>{
 const f=await fixture(t),{root}=await trialOf(f,executionFixture(seed)),before=await f.ok('/state'),plan=await commit(f,root,await preview(f,root,'A-FILL',{start:100,machine:'FILL01'}));
 assert.deepEqual(await f.ok('/state'),before);assert.equal(plan.materialDemands.find(d=>d.materialId==='LEAN').quantity,60);assert.equal(plan.execution.facts[0]['工序完成数量'],'40');
});
test('stale plan hash, input revision, preview ownership/roles and malformed/forged quantity/status fail atomically',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f),s=await f.ok(root+'/positions'),body={planId:s.planId,planHash:s.planHash,revision:s.revision,taskId:'A-FILL',start:90,machine:'FILL01'},before=f.bytes();
 for(const extra of [{planHash:'wrong'},{revision:99},{duration:1},{quantity:1},{status:'confirmed'},{start:null}])assert.ok((await f.call(root+'/move-preview',{...body,...extra})).status>=400);
 const p=await preview(f,root);for(const path of ['/move-preview','/lock-preview','/previews/'+p.id+'/recheck','/previews/'+p.id+'/commit','/previews/'+p.id+'/cancel'])assert.equal((await f.call(root+path,body,'query')).status,403,path);
 assert.equal((await f.call(root+'/previews/'+p.id+'/recheck',{},'supervisor')).status,409);assert.equal(f.bytes(),before);
 await commit(f,root,await preview(f,root));assert.equal((await f.call(root+'/previews/'+p.id+'/recheck',{})).status,409);const retry=await f.ok('/runs/'+trial.sourceRunId+'/retry',{});for(let i=0;i<100;i++){if(['completed','partial','failed'].includes((await f.ok('/runs/'+retry.id)).status))break;await new Promise(r=>setTimeout(r,20));} // source run remains independent
});
test('missing/corrupted historical snapshot blocks previews and preserves original bytes',async t=>{
 const f=await fixture(t),{root}=await trialOf(f),s=await f.ok(root+'/positions'),data=JSON.parse(f.bytes());delete data.inputVersions[s.planId];data.inputVersions={};fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(data));const before=f.bytes();assert.equal((await f.call(root+'/lock-preview',{planId:s.planId,planHash:s.planHash,revision:0,taskId:'A-FILL',locked:true})).body.error,'historical_inputs_unavailable');assert.equal(f.bytes(),before);
});
test('independent preview reports personnel and joint tool conflicts without silently shifting task',async t=>{
 const d=jointFixture(seed);d.orders=d.orders.filter(o=>o['订单编号']!=='C');d.dependencies=d.dependencies.filter(x=>x['订单编号']!=='C');d.resourceClaims=d.resourceClaims.filter(x=>x['订单编号']!=='C');d.tools[0]['可用数量']='1';
 const f=await fixture(t),{root}=await trialOf(f,d),before=f.bytes(),p=await preview(f,root,'B-MIX',{start:0,machine:'MIX02'}),r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,false);assert.match(JSON.stringify(r.check.findings),/资源|工装|固定位置/);assert.equal(f.bytes(),before);
});
test('actual submit/confirm of moved supported trial preserves confirmation after later copies and moves',async t=>{
 const f=await fixture(t),{root}=await trialOf(f),p=await commit(f,root,await preview(f,root));await f.ok('/plans/'+p.id+'/verify',{});
 const act=async(id,action,role)=>{const r=await f.ok('/plans/'+id+'/review');assert.deepEqual(r.blockers,[]);return f.ok('/plans/'+id+'/'+action,{revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(x=>x.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true},role);};
 await act(p.id,'submit','planner');await act(p.id,'confirm','supervisor');const confirmation=(await f.ok('/plans/'+p.id+'/review')).confirmation,bytes=JSON.stringify(confirmation);
 const nextTrial=await f.ok('/plans/'+p.id+'/copy',{}),nextRoot='/trials/'+nextTrial.id;await commit(f,nextRoot,await preview(f,nextRoot,'A-FILL',{start:120,machine:'FILL01'}));assert.equal(JSON.stringify(await f.ok('/confirmations/'+confirmation.id)),bytes);assert.equal(confirmation.snapshot.plan.tasks.find(x=>x.id==='A-FILL').start,90);
});
test('unsupported active batch semantics and max-wait remain explicit rather than valid feasibility',async t=>{
 const d=structuredClone(seed);d.routes[0]['最大等待分钟']='10';const f=await fixture(t),{root}=await trialOf(f,d),p=await preview(f,root),r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,false);assert.match(JSON.stringify(r.check),/最大等待|未支持/);
});
test('independent checker inspects the actual invalid candidate even when engine refuses to schedule it',async t=>{
 const f=await fixture(t),{root}=await trialOf(f),p=await preview(f,root,'A-FILL',{start:0,machine:'FILL01'}),r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,false);assert.equal(r.check.checks.precedence.status,'problem');assert.ok(r.check.findings.some(x=>/A-MIX/.test(x.message)));
});
test('specific machine-overlap candidate names both tasks instead of silently shifting or hiding rejected task',async t=>{
 const d=structuredClone(seed);d.dependencies.find(x=>x['订单编号']==='B'&&x['工序编号']==='FILL')['资源编号']='FILL01';const f=await fixture(t),{root}=await trialOf(f,d),p=await preview(f,root,'A-FILL',{start:60,machine:'FILL01'}),r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,false);assert.equal(r.check.checks.machineOverlap.status,'problem');assert.ok(r.check.findings.some(x=>x.taskIds.includes('A-FILL')&&x.taskIds.includes('B-FILL')));
});
test('independent candidate calendar check names downtime source; personnel capacity conflict is explicit',async t=>{
 const d=structuredClone(seed);d.downtime=[{'设备编号':'FILL01','起始分钟':'100','结束分钟':'150','原因':'FR027例外窗口'}];const f=await fixture(t),{root}=await trialOf(f,d),p=await preview(f,root,'A-FILL',{start:100,machine:'FILL01'}),r=await f.ok(root+'/previews/'+p.id+'/recheck',{});assert.equal(r.valid,false);assert.match(JSON.stringify(r.check.findings),/FR027例外窗口/);
 const staff=structuredClone(seed);staff.personnelGroups=[{'人员组编号':'G','人员组名称':'shared','人员数量':'1','技能':'fill','班次':'D','可用起始分钟':'0','可用结束分钟':'600'}];for(const order of ['A','B'])staff.dependencies.push({'订单编号':order,'工序编号':'FILL','资源类型':'人员技能','资源编号':'G','需求数量':'1','所需技能':'fill','所需班次':'D','人员开始偏移':'0','人员结束偏移':'0'});const g=await fixture(t),{root:sr}=await trialOf(g,staff),sp=await preview(g,sr,'A-FILL',{start:60,machine:'FILL01'}),sc=await g.ok(sr+'/previews/'+sp.id+'/recheck',{});assert.equal(sc.valid,false);assert.match(JSON.stringify(sc.check.findings),/人员|G/);
});
test('explicit lock cancellation and successful unlock never alter earlier locked snapshot; stale locked retry is denied',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f);const lock=await commit(f,root,await preview(f,root,'A-FILL',{locked:true},'lock'));const saved=JSON.stringify((await f.ok('/plans')).find(p=>p.id===lock.id));await commit(f,root,await preview(f,root,'A-FILL',{locked:false},'lock'));assert.deepEqual((await f.ok('/trials')).find(x=>x.id===trial.id).locks,{});assert.equal(JSON.stringify((await f.ok('/plans')).find(p=>p.id===lock.id)),saved);assert.equal((await f.call('/runs/'+lock.runId+'/retry',{})).body.error,'stale_trial_positions');
});
test('locks stay recorded when rule modes become unsupported or selected task scope excludes locked task',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f);await commit(f,root,await preview(f,root,'A-FILL',{locked:true},'lock'));const before=await f.ok('/plans');for(const selection of [{orderIds:['B']},{mode:'minimal-r1'}]){const rejected=await f.call('/calculate',{trialId:trial.id,revision:1,selection});assert.equal(rejected.status,409);assert.ok(rejected.body.protection.issues.some(x=>x.code==='B15_LOCK_CONFLICT'&&x.taskIds.includes('A-FILL')));assert.deepEqual(await f.ok('/plans'),before);assert.ok((await f.ok('/trials')).find(x=>x.id===trial.id).locks['A-FILL']);}
});
