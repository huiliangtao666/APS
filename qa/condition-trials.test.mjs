import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,calculate,defs} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {deliveryFixture} from './delivery-fixture.mjs';
import {jointFixture} from './joint-fixture.mjs';
import {comparePlans} from '../src/lib/plan-comparison.mjs';
const at='2026-10-29T00:00:00Z';
function run(data,id){assert.deepEqual(validateInputs(defs,data),[]);const f=freezeRunInput(data,{},at);return {...calculate(f.executionData,0,at,f.conditions),id,runId:id,conditions:f.conditions,snapshotHash:f.snapshotHash};}
test('FR028 actual bottleneck removal advances task and conditional delivery without changing original',()=>{
 const a=deliveryFixture(seed);a.downtime=[{'设备编号':a.machines[0]['设备编号'],'起始分钟':'0','结束分钟':'120','原因':'模拟瓶颈'}];const b=structuredClone(a);b.downtime=[];
 const p=run(a,'original'),saved=JSON.stringify(p),q=run(b,'trial'),r=comparePlans(p,a,q,b);
 assert.ok(r.tasks.changes.length>0);assert.equal(r.impact.orders[0].outcome,'earlier-conditional');assert.equal(r.impact.orders[0].deliverableDeltaMinutes,-120);assert.equal(r.impact.changedConditions[0].table,'downtime');assert.equal(JSON.stringify(p),saved);
});
test('FR028 material shortage plus100 personnel never becomes delivery improvement',()=>{
 const a=deliveryFixture(seed);a.inventory.forEach(r=>{r['账面数量']='0';r['已占用数量']='0';});const b=structuredClone(a);b.personnelGroups=[{'人员组编号':'EXTRA','人员组名称':'增人','人员数量':'100','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'}];
 const p=run(a,'original'),q=run(b,'trial'),r=comparePlans(p,a,q,b);assert.ok(p.materialDemands.some(d=>d.shortage>0));assert.deepEqual(q.materialDemands,p.materialDemands);assert.equal(r.orderOutcome,'unchanged-no-delivery-improvement');assert.equal(r.impact.orders[0].outcome,'unknown');assert.equal(r.impact.orders[0].after.expectedDeliverableMinute,null);
});
test('FR028 tool capacity improvement changes actually checked reservations and never invents deliverability',()=>{
 const a=jointFixture(seed),b=structuredClone(a);b.tools[0]['可用数量']='3';const p=run(a,'original'),q=run(b,'trial'),r=comparePlans(p,a,q,b);
 assert.ok(r.resources.changes.length);assert.ok(r.tasks.changes.length);assert.ok(q.tasks.filter(t=>t.operation==='MIX').every(t=>t.start===0));assert.equal(r.impact.changedConditions[0].fields[0].field,'可用数量');assert.ok(r.impact.orders.every(o=>o.outcome==='unknown'));
});
test('FR028 delayed expected supply exposes60 minute later delivery, lot conditions and full immutable provenance',()=>{
 const a=deliveryFixture(seed);a.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify({'允许预计供给':true,'可用状态':['合格'],'预计状态':['预计可用'],'不可用状态':['待检','冻结','不合格']});a.inventory=a.inventory.filter(r=>r['物料编号']!=='LEAN');
 a.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'EXPECTED','预计数量':'65','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];a.supplyUses=[{'引用编号':'U1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'65'}];
 const b=structuredClone(a);b.supplyDelays=[{'记录编号':'D1','供给编号':'S1','记录时间':at,'调整后到达时间':'2026-11-02T11:00:00+08:00','调整后可用时间':'2026-11-02T12:00:00+08:00','原因':'延期模拟'}];
 const p=run(a,'original'),before=JSON.stringify(a),q=run(b,'trial'),r=comparePlans(p,a,q,b),o=r.impact.orders[0];assert.equal(o.outcome,'later-conditional');assert.equal(o.deliverableDeltaMinutes,60);assert.ok(o.after.materialAllocations.some(a=>a.supplyId==='S1'&&a.conditional));assert.equal(o.after.supplyConditions[0]['延期记录'][0]['原因'],'延期模拟');assert.equal(r.left.snapshotHash,p.snapshotHash);assert.equal(JSON.stringify(a),before);
});
