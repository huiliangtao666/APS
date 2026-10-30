import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,seed,defs} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {jointFlags,previewResources,validateJointResources} from '../src/lib/joint-resources.mjs';
import {allocatePersonnel} from '../src/lib/staffing.mjs';
import {exportSupplyPlanCsv} from '../src/lib/expected-supply.mjs';
import {queryData} from '../src/lib/data-query.mjs';
import {batchFixture} from './batch-fixture.mjs';
import {jointFixture,claim,enableJoint} from './joint-fixture.mjs';
const at='2026-10-29T00:00:00Z';
const plan=(d,selection={})=>{const f=freezeRunInput(d,selection,at);return calculate(f.executionData,0,at,f.conditions);};
const mix=p=>p.tasks.filter(t=>t.operation==='MIX');
const peak=(p,id)=>Math.max(0,...p.resourceReservations.filter(r=>r.resourceId===id).map(a=>p.resourceReservations.filter(r=>r.resourceId===id&&r.start<=a.start&&r.end>a.start).reduce((s,r)=>s+Number(r.quantity),0)));
test('FR022 two sets permit two of three simultaneous machines, release boundary is reusable',()=>{
 const d=jointFixture(seed),p=plan(d);assert.equal(p.findings.length,0,JSON.stringify(p.findings));
 assert.deepEqual(mix(p).map(t=>t.start),[0,0,30]);assert.equal(peak(p,'G40'),2);assert.equal(p.tasks.length,6);
 assert.ok(p.resourceReservations.every(r=>r.taskIds.every(id=>p.tasks.some(t=>t.id===id))));
 assert.match(mix(p)[2].source,/联合资源顺延/);
});
test('FR022 one set covers before acquisition and 10-minute delayed release with exact touching',()=>{
 const d=jointFixture(seed);d.tools[0]['可用数量']='1';d.resourceClaims.forEach(c=>{c['提前占用分钟']='5';c['后延占用分钟']='10';});
 const p=plan(d);assert.deepEqual(mix(p).map(t=>[t.start,t.end]),[[5,35],[50,80],[95,125]]);
 assert.deepEqual(p.resourceReservations.filter(r=>r.resourceId==='G40').map(r=>[r.start,r.end]),[[0,45],[45,90],[90,135]]);assert.equal(peak(p,'G40'),1);
});
test('FR022 cooling 600+600 cannot share1000kg; full delayed release shifts the other task',()=>{
 const d=jointFixture(seed);enableJoint(d,'STORAGE');d.batchResources=[{'资源编号':'COLD','资源类型':'共享冷却空间','容量':'1000','单位':'kg','允许程序':'','说明':'显式占用测试'}];
 d.resourceClaims.push(...d.orders.map(o=>claim('SPACE-'+o['订单编号'],o['订单编号'],'MIX','COLD','空间','600','kg','0','30')));
 const p=plan(d);assert.deepEqual(mix(p).map(t=>t.start),[0,60,120]);assert.equal(peak(p,'COLD'),600);
 assert.equal(p.jointResourceChecks.STORAGE,true);assert.ok(p.ruleSnapshot.checkScope.checked.some(s=>s.includes('最大等待')));
});
test('FR022 space locations require integers and explicit same units; no kg inference from notes',()=>{
 const d=jointFixture(seed);enableJoint(d,'STORAGE');d.batchResources=[{'资源编号':'COLD','资源类型':'共享冷却空间','容量':'2','单位':'位置','允许程序':'','说明':'not executable'}];
 d.resourceClaims.push(...d.orders.map(o=>claim('SPACE-'+o['订单编号'],o['订单编号'],'MIX','COLD','空间','1','位置')));
 assert.equal(peak(plan(d),'COLD'),2);
 for(const [key,value]of [['单位','kg'],['需求数量','0.5'],['后延占用分钟','']]){const x=structuredClone(d);x.resourceClaims.at(-1)[key]=value;assert.ok(validateJointResources(x,at).length);assert.equal(plan(x).tasks.length,0);}
});
test('FR022 exact decimal capacity never uses epsilon and adjacent disjoint claims use peak',()=>{
 const c={type:'空间',resourceId:'S',quantity:'0.10000000000000001',capacity:'0.3',before:0,after:0,unit:'kg'};
 assert.equal(previewResources([c],0,30,[{...c,quantity:'0.2',start:0,end:30}]).ok,false);
 assert.equal(previewResources([{...c,quantity:'0.1'}],0,30,[{...c,quantity:'0.2',start:0,end:15},{...c,quantity:'0.2',start:15,end:30}]).ok,true);
});
test('FR022 personnel event sweep uses simultaneous peak rather than summing disjoint intervals',()=>{
 const g={'人员组编号':'G','人员数量':'2','技能':'mix','班次':'D','可用起始分钟':'0','可用结束分钟':'100'};
 const req={'工序编号':'MIX','资源编号':'G','需求数量':'1','所需技能':'mix','所需班次':'D'};
 assert.equal(allocatePersonnel([req],[g],0,30,[{groupId:'G',count:1,start:0,end:15},{groupId:'G',count:1,start:15,end:30}]).ok,true);
 assert.equal(allocatePersonnel([req],[g],0,30,[{groupId:'G',count:2,start:15,end:30}]).ok,false);
});
test('FR022 joint retry rechecks machine downtime, personnel arrival/participation and tooling release',()=>{
 const d=jointFixture(seed);d.tools[0]['可用数量']='1';d.resourceClaims.forEach(c=>c['后延占用分钟']='10');
 d.personnelGroups=[{'人员组编号':'G','人员组名称':'模拟组','人员数量':'2','技能':'mix','班次':'D','可用起始分钟':'60','可用结束分钟':'300'}];
 for(const o of d.orders)d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'2','所需技能':'mix','所需班次':'D','人员开始偏移':'5','人员结束偏移':'20'});
 d.downtime=[{'设备编号':'MIX02','起始分钟':'90','结束分钟':'130','原因':'测试停机'}];
 const p=plan(d);assert.deepEqual(mix(p).map(t=>t.start),[55,130,170]);assert.equal(peak(p,'G40'),1);assert.equal(peak(p,'G'),2);
 assert.deepEqual(p.resourceReservations.filter(r=>r.type==='人员').map(r=>[r.start,r.end]),[[60,65],[135,140],[175,180]]);
});
test('FR022 missing policy/units/intervals or dependency release declaration blocks actionable findings',()=>{
 for(const modify of [d=>d.rules.find(r=>r['规则编号']==='MOLD')['参数JSON']='{}',d=>d.resourceClaims=[],d=>d.resourceClaims[0]['后延占用分钟']='下游结束',d=>d.resourceClaims[0]['单位']='kg',d=>d.dependencies.push({'订单编号':'A','工序编号':'FILL','资源类型':'模具','资源编号':'G40','需求数量':'1'})]){
  const d=jointFixture(seed);modify(d);const p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.length);
 }
 const d=jointFixture(seed);d.resourceClaims=[];d.rules.find(r=>r['规则编号']==='MOLD')['是否启用']='否';assert.equal(plan(d).tasks.length,6);assert.equal(plan(d).jointResourceChecks.MOLD,false);
});
test('FR022 minimal mode and future rules remain truthfully unchecked; explicit max lag now supports draft gap checks',()=>{
 const d=jointFixture(seed);const p=plan(d,{mode:'minimal-r1'});assert.equal(mix(p).filter(t=>t.start===0).length,3);assert.ok(!p.resourceReservations.some(r=>r.type==='工装'));assert.ok(p.ruleSnapshot.checkScope.unchecked.includes('模具与工装'));assert.deepEqual(p.jointResourceChecks,{});
 d.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2027-01-01T00:00:00Z';assert.equal(jointFlags(d,at).MOLD,false);assert.equal(mix(plan(d)).filter(t=>t.start===0).length,3);
 d.rules.find(r=>r['规则编号']==='MAX_LAG')['是否启用']='是';assert.equal(plan(d).tasks.length,6);
});
test('FR022 resource shortage rolls back whole FR021 member cycle, material ledger and reservations',()=>{
 const d=batchFixture(seed);d.orders[0]['合格需求']='240';d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'2'});d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':'B'})));
 d.machines.forEach(m=>m['最大装载kg']='500');d.batchResources.forEach(r=>r['容量']='500');
 const j=jointFixture(seed);d.tools=j.tools;d.tools[0]['可用数量']='1';d.resourceClaims=['A','B'].map(id=>claim('T'+id,id,'MIX','G40'));enableJoint(d,'MOLD');
 const p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('JOINT_RESOURCE')));assert.equal(p.resourceReservations.length,0);assert.ok(p.materialDemands.length>0);assert.ok(p.materialDemands.every(r=>!r.committed));
 d.tools[0]['可用数量']='2';const ok=plan(d);assert.equal(ok.tasks.length,4);assert.equal(ok.productionBatches.length,2);assert.equal(peak(ok,'G40'),2);assert.equal(ok.materialDemands.reduce((s,r)=>s+r.quantity,0),500);assert.ok(ok.tasks.every(t=>t.duration===30));
 d.inventory[0]['账面数量']='1';const short=plan(d);assert.equal(short.tasks.length,0);assert.equal(short.resourceReservations.length,0);assert.ok(short.materialDemands.every(r=>!r.committed));
});
test('FR022 horizon shortage leaves no ghost reservation and exported saved occupancy is task-linked',()=>{
 const d=jointFixture(seed);d.tools[0]['可用数量']='1';const p=plan(d,{endMinute:30});assert.equal(p.resourceReservations.filter(r=>r.type==='工装').length,1);assert.equal(mix(p).length,1);
 const csv=exportSupplyPlanCsv(p);assert.match(csv,/联合资源占用/);assert.match(csv,/G40/);assert.match(queryData(d,[{...p,id:'P'}],'P').tasks[0]['联合资源占用'],/G40/);
 const f=freezeRunInput(d,{orderIds:['B']},at);assert.deepEqual(f.executionData.resourceClaims.map(c=>c['订单编号']),['B']);
 assert.equal(validateInputs(defs,d).length,0);
});

test('FR022 declared dependency quantity/offset conflicts and dynamic release semantics block instead of picking precedence',()=>{
 for(const [key,value]of [['需求数量','3'],['后延占用分钟','10']]){
  const d=jointFixture(seed);d.dependencies.push({'订单编号':'A','工序编号':'MIX','资源类型':'模具','资源编号':'G40','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0',[key]:value});
  const p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('冲突')));
 }
 const d=jointFixture(seed);d.resourceClaims[0]['占用口径']='下游开始释放';
 const blocked=plan(d);assert.equal(blocked.tasks.length,0);
 const issue=validateJointResources(d,at).find(f=>f.table==='resourceClaims'&&f.row===2&&f.code==='INPUT / JOINT_RESOURCE');
 assert.ok(issue,'invalid release policy must identify the first resource declaration');
 assert.match(issue.message,/^资源占用声明 TOOL-A：占用口径.*(?:未支持|不支持)下游事件动态释放/);
 assert.ok(blocked.findings.some(f=>f.code==='RULE / CONFIG'&&f.message===issue.message),'the planner must surface the unsupported release reason');
 d.resourceClaims[0]['占用口径']='显式逐生产批完整区间';d.dependencies[0]['后延占用分钟']='10';assert.equal(plan(d).tasks.length,0);assert.ok(plan(d).findings.some(f=>f.message.includes('机器阶段')));
});
test('FR022 explicit per-production-batch space quantity repeats without inferred scaling and retains each original member link',()=>{
 const d=batchFixture(seed);const j=jointFixture(seed);d.tools=j.tools;d.resourceClaims=[claim('TA','A','MIX','G40')];enableJoint(d,'MOLD');
 enableJoint(d,'STORAGE');d.batchResources.push({'资源编号':'COLD','资源类型':'共享冷却空间','容量':'1000','单位':'kg','允许程序':'','说明':'explicit per batch600; not inferred from load'});
 d.resourceClaims.push(claim('SA','A','MIX','COLD','空间','600','kg','0','30'));
 const p=plan(d);assert.equal(p.productionBatches.length,2);assert.deepEqual(mix(p).map(t=>t.start),[0,60]);
 const rows=p.resourceReservations.filter(r=>r.type==='空间');assert.equal(rows.length,2);assert.ok(rows.every(r=>r.quantity==='600'&&r.taskIds.length===1));
 assert.deepEqual(rows.map(r=>r.productionBatchId),p.productionBatches.map(b=>b.id));assert.equal(peak(p,'COLD'),600);
});

test('FR022 unsupported machine multiplicity and unsafe tooling capacities fail closed',()=>{
 const d=jointFixture(seed);d.dependencies[0]['需求数量']='2';assert.equal(plan(d).tasks.length,0);assert.ok(plan(d).findings.some(f=>f.message.includes('单台')));
 d.dependencies[0]['需求数量']='1.0';d.dependencies[0]['后延占用分钟']='0.0';assert.equal(plan(d).tasks.length,6);
 d.tools[0]['可用数量']='9007199254740992';assert.equal(plan(d).tasks.length,0);
});
