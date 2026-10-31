import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {r4Scenario,at} from './r4-fixture.mjs';import {claim,enableJoint} from './joint-fixture.mjs';
import {calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';
import {verifyProcessRoute} from '../src/lib/verify-process-route.mjs';import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {createMaterialAllocator,calculateMaterialDemand,materialPolicy} from '../src/lib/material-allocation.mjs';
import {assessDelivery} from '../src/lib/delivery-assessment.mjs';
import {deliveryParameters} from '../src/lib/delivery-policy.mjs';
import {pool} from './p10-core-fixture.mjs';
import {fixture} from './fr027-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';import {hostProcess} from './b234-host-client.mjs';
const out=process.env.R4_EVIDENCE;const dump=(id,x)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(x,null,2));if(x.data){const folder=path.join(out,id+'-source');fs.mkdirSync(folder,{recursive:true});for(const file of scenarioFiles(x.data))fs.writeFileSync(path.join(folder,file.name),file.text);}}};
const run=(d,selection={})=>{const input=freezeRunInput(d,selection,at),plan=calculate(input.executionData,1,at,input.conditions);return {data:d,input,plan};};
const check=r=>{const c=verifyProcessRoute(r.plan,r.input.executionData,r.input.conditions);assert.equal(c.status,'pass',JSON.stringify(c));assert.deepEqual(r.plan.findings,[]);return c;};
const task=(r,op,order='A')=>r.plan.tasks.find(t=>t.operation===op&&t.orderId===order);
async function install(f,data){const s=await f.ok('/state'),preview=await f.ok('/imports/preview',{revision:s.revision,files:scenarioFiles(data),inputStage:'supported'});assert.equal(preview.valid,true,JSON.stringify(preview));await f.ok('/imports/commit',{previewId:preview.id});}

test('R4-01 actual five-operation routes, heat-only grouping, qualified-output cooling and fixed durations',()=>{
 for(const scene of ['12','13','14']){const r=run(r4Scenario(scene));check(r);assert.equal(r.plan.tasks.length,scene==='12'?5:10);const heats=r.plan.tasks.filter(t=>t.operation==='HEAT');assert.equal(new Set(heats.map(t=>t.resourceBatchId)).size,scene==='14'?2:1);assert.ok(heats.every(t=>t.duration===120));assert.ok(r.plan.tasks.filter(t=>t.operation==='COOL').every(t=>t.loadKg===240&&t.exactLoadKg.numerator==='240'));if(scene==='12'){assert.equal(task(r,'HEAT').start,90);assert.equal(task(r,'COOL').start,210);}if(scene==='13'){assert.equal(heats[0].resourceBatchId,heats[1].resourceBatchId);assert.notEqual(task(r,'MIX').resourceBatchId,task(r,'MIX','B').resourceBatchId);}dump('R4-01-'+scene,r);}
});

test('R4-02 private multi-time allocation sees pending demand; rollback and stale transaction cannot change root',()=>{
 const d=r4Scenario('13'),a=createMaterialAllocator(d,materialPolicy(d,at)),lean=d.inventory.find(r=>r['物料编号']==='LEAN');lean['账面数量']='200';const before=JSON.stringify(d),da=calculateMaterialDemand(d,d.orders[0],'MIX',0),db=calculateMaterialDemand(d,d.orders[1],'MIX',30);
 const tx=a.begin(),first=tx.stage(da,0),second=tx.stage(db,30);assert.equal(first.ok,true);assert.equal(second.ok,false);assert.equal(second.rows.find(r=>r.materialId==='LEAN').shortage,125);assert.ok(tx.rows.every(r=>!r.committed));assert.throws(()=>tx.commit(),/缺料/);tx.rollback();assert.equal(a.preview(da,0).ok,true);
 const stale=a.begin();stale.stage(da,0);a.preview(da,0).commit();assert.throws(()=>stale.commit(),/过期/);stale.rollback();assert.equal(a.preview(db,30).ok,false);assert.equal(JSON.stringify(d),before);dump('R4-02',{first,second,sourceUnchanged:true});
});

test('R4-03 cooling material shortage/horizon abandons the whole pair, never consumes heat material or resources',()=>{
 for(const kind of ['shortage','horizon']){const d=r4Scenario('12');d.downtime=[];for(const b of d.bom)b['投料工序编号']=b['用量类型']==='BOM物料'?'HEAT':'COOL';if(kind==='shortage')d.inventory.find(r=>r['物料编号']==='BAG')['账面数量']='599';const r=run(d,kind==='horizon'?{endMinute:200}:{});assert.equal(r.plan.tasks.filter(t=>['HEAT','COOL','PACK'].includes(t.operation)).length,0);assert.ok(r.plan.tasks.length===2);assert.ok(r.plan.materialDemands.every(m=>!m.committed));assert.ok(r.plan.resourceReservations.every(res=>res.taskIds.every(id=>/MIX|FILL/.test(id))));assert.ok(r.plan.findings.length);assert.equal(verifyProcessRoute(r.plan,r.input.executionData,r.input.conditions).status,'partial');dump('R4-03-'+kind,r);}
});

test('R4-04 shifted pair rechecks tool, personnel, machine calendar and material, including pending group resources',()=>{
 const d=r4Scenario('12');d.downtime=[];
 d.tools=[{'工装编码':'PAIR-TOOL','工装名称':'显式模拟工装','适用任务':'HEAT|COOL','可用数量':'1','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','是否启用':'是','说明':'R4模拟','可用起始分钟':'0','可用结束分钟':'600'}];
 d.resourceClaims.push(claim('HT','A','HEAT','PAIR-TOOL'));enableJoint(d,'MOLD');
 d.personnelGroups=[{'人员组编号':'PAIR-STAFF','人员组名称':'显式模拟组','人员数量':'1','技能':'H','班次':'D','可用起始分钟':'0','可用结束分钟':'600','poolId':''}];
 d.dependencies.push({'订单编号':'A','工序编号':'HEAT','资源类型':'人员技能','资源编号':'PAIR-STAFF','需求数量':'1','所需技能':'H','所需班次':'D','人员岗位编号':'H-POST','人员参与阶段':'全程','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是','提前占用分钟':'0','后延占用分钟':'0'});
 d.resourceStops=[{'例外编号':'T','资源类型':'工装','资源编号':'PAIR-TOOL','起始分钟':'60','结束分钟':'180','原因':'显式模拟'},{'例外编号':'P','资源类型':'人员','资源编号':'PAIR-STAFF','起始分钟':'180','结束分钟':'300','原因':'显式模拟'}];
 d.downtime=[{'设备编号':'HEAT01','起始分钟':'300','结束分钟':'310','原因':'显式模拟'}];
 const r=run(d);check(r);assert.ok(task(r,'HEAT').start>=310);for(const kind of ['RESOURCE','PERSONNEL'])assert.ok(r.plan.jointAttempts.some(a=>a.kind===kind));dump('R4-04',r);
});

test('R4-05 actual-feed cross-midnight BOM rebuild uses new quantities, not ready-time recipe or stale tokens',()=>{
 const d=r4Scenario('12');d.downtime=[{'设备编号':'COOL01','起始分钟':'0','结束分钟':'1100','原因':'显式模拟跨日阻塞'}];d.calendars[0]['结束分钟']='2000';
 for(const b of d.bom)b['投料工序编号']=b['用量类型']==='BOM物料'?'HEAT':'PACK';
 d.bom.push(...d.bom.map(b=>({...b,'版本编号':'R4-SYNTHETIC-NEXT-DAY-v2','生效日期':'2026-11-03','配置用量':b['物料编号']==='LEAN'?'640':b['物料编号']==='FAT'?'160':b['配置用量']})));
 const r=run(d,{endMinute:2000});check(r);assert.ok(task(r,'HEAT').start>=980);const lean=r.plan.materialDemands.find(m=>m.materialId==='LEAN');assert.equal(lean.version,'R4-SYNTHETIC-NEXT-DAY-v2');assert.equal(lean.quantity,160);assert.equal(lean.feedMinute,task(r,'HEAT').start);assert.ok(r.plan.jointAttempts.some(a=>a.stage==='pair-recipe-rebuild'));dump('R4-05',r);
});

test('R4-06 trusted checker rejects corrupt coverage, identity, loads, waits, resource ledger and material',()=>{
 const r=run(r4Scenario('13'));check(r);
 const mutations=[p=>p.tasks.pop(),p=>p.tasks.push({...p.tasks[0]}),p=>p.tasks[0].quantity=239,p=>p.productionBatches[0].qualifiedKg.numerator='239',p=>p.tasks[0].machine='MIX02',p=>p.tasks.find(t=>t.operation==='COOL').start+=11,p=>p.tasks.find(t=>t.operation==='HEAT').duration=119,p=>p.tasks.find(t=>t.operation==='HEAT').program='OTHER',p=>p.tasks.find(t=>t.operation==='HEAT').predecessor='',p=>p.resourceReservations.pop(),p=>p.resourceReservations.push({...p.resourceReservations.find(r=>r.type==='设备')}),p=>p.resourceBatches[0].members.pop(),p=>p.tasks.find(t=>t.operation==='COOL').exactLoadKg.numerator='250',p=>p.materialDemands[0].version='FAKE',p=>p.materialDemands[0].allocations[0].exactQuantity.numerator='99999',p=>p.resourceReservations.find(r=>r.type==='空间').end--];
 for(const mutate of mutations){const p=structuredClone(r.plan);mutate(p);assert.notEqual(verifyProcessRoute(p,r.input.executionData,r.input.conditions).status,'pass',mutate.toString());}
 dump('R4-06',{mutations:mutations.map(String),source:r});
});

test('R4-07 real import/API/application Worker/verify/roles/native export and independent server process restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r4-restart-'));let f=await hostProcess(dir);try{
  const d=r4Scenario('13');await install(f,d);const r=await b2Worker(f);assert.equal(r.run.status,'completed');assert.equal(r.plan.tasks.length,10);const verified=await f.ok('/plans/'+r.plan.id+'/verify',{});assert.equal(verified.verification.checks.processRoute.status,'pass');await f.ok('/plans',{id:r.plan.id});
  const csv=await f.ok('/export',{planId:r.plan.id}),frozen=await f.ok('/plans/'+r.plan.id+'/inputs'),bytes=f.bytes(),oldPid=f.pid;
  assert.match(csv,/合格产出/);const s=await f.ok('/state');const denied=await f.call('/inputs',{revision:s.revision,tables:{rules:s.data.rules}},'query');assert.equal(denied.status,403);assert.equal(f.bytes(),bytes);
  await f.close();f=await hostProcess(dir);assert.notEqual(f.pid,oldPid);assert.equal(f.bytes(),bytes);assert.equal(await f.ok('/export',{planId:r.plan.id}),csv);assert.deepEqual(await f.ok('/plans/'+r.plan.id+'/inputs'),frozen);
  const state=await f.ok('/state'),changed=structuredClone(state.data.inventory);changed[0]['位置']='R4后来修改';await f.ok('/inputs',{revision:state.revision,tables:{inventory:changed}});assert.deepEqual(await f.ok('/plans/'+r.plan.id+'/inputs'),frozen);assert.equal(await f.ok('/export',{planId:r.plan.id}),csv);dump('R4-07',{data:d,...r,verified,frozen,csv,oldPid,newPid:f.pid,bytesPreserved:true});
 }finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('R4-08 delivery guard rederives source coverage; forged flags, saved checker status and missing tasks cannot lift it',()=>{
 const d=r4Scenario('13');d.products[0]['模拟交付等待分钟']='0';Object.assign(d.rules.find(r=>r['规则编号']==='DELIVERY'),{'是否启用':'是','参数JSON':JSON.stringify(deliveryParameters)});d.deliveryConditions=d.orders.map(o=>({'订单编号':o['订单编号'],'模拟质量状态':'模拟合格','模拟质量可用时间':'','模拟有效期截止时间':'不适用','要求剩余有效分钟':'0'}));
 const r=run(d);check(r);assert.ok(r.plan.deliveryAssessment.orders.every(o=>o.expectedDeliverableMinute!==null&&!o.reasons.some(x=>x.code==='MAX_WAIT_UNRESOLVED')));
 for(const mutate of [p=>p.tasks.pop(),p=>p.resourceReservations=[],p=>p.materialDemands[0].version='FORGED',p=>p.tasks.find(t=>t.operation==='COOL').start+=11]){const p=structuredClone(r.plan);mutate(p);p.integrated=true;p.processRouteVerification={status:'pass',orders:d.orders.map(o=>({orderId:o['订单编号'],status:'pass'}))};const checked=assessDelivery(r.input.executionData,p,at,r.input.conditions);assert.ok(checked.orders.every(o=>o.reasons.some(x=>x.code==='MAX_WAIT_UNRESOLVED')));}
 dump('R4-08',r);
});

test('R4-09 complete cooling future interval and exact capacity boundaries; insufficient groups stay partial',()=>{
 for(const cap of ['239.99','240','479.99','480'])for(const wait of ['0','10']){
  const d=r4Scenario('13');d.batchResources.find(r=>r['资源编号']==='COLD')['容量']=cap;d.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']=wait;
  const r=run(d);if(Number(cap)<240){assert.equal(r.plan.tasks.filter(t=>t.operation==='HEAT'||t.operation==='COOL').length,0);assert.equal(verifyProcessRoute(r.plan,r.input.executionData,r.input.conditions).status,'partial');}else{check(r);assert.ok(r.plan.tasks.filter(t=>t.operation==='COOL').every(t=>t.start-r.plan.tasks.find(h=>h.id===t.predecessor).end<=Number(wait)));}
  dump('R4-09-'+cap+'-'+wait,r);
 }
 const d=r4Scenario('13');d.resourceClaims.push(claim('FUTURE','A','FILL','COLD','空间','480','kg'));d.dependencies.find(r=>r['订单编号']==='A'&&r['工序编号']==='FILL'&&r['资源类型']==='设备')['资源编号']='FILL01';
 // Explicit post-operation return retains this prefix space claim into cooling.
 d.resourceClaims.at(-1)['后延占用分钟']='190';const r=run(d);check(r);assert.ok(r.plan.tasks.filter(t=>t.operation==='COOL').every(t=>t.start>=250));dump('R4-09-future-space',r);
});

test('R4-10 physical pool and per-member pending personnel compete inside a heat group; split without duplicated people',()=>{
 const d=r4Scenario('13');d.personnelGroups=[{'人员组编号':'R4-G','人员组名称':'模拟单人多技能组','人员数量':'1','技能':'COOL;OTHER','班次':'D','可用起始分钟':'0','可用结束分钟':'600','poolId':'R4-P'}];d.personnelPools=[{...pool('R4-P','1'),'容量来源':'R4显式模拟','策略来源':'R4显式模拟'}];
 for(const o of d.orders)d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'COOL','资源类型':'人员技能','资源编号':'R4-G','需求数量':'1','所需技能':'COOL','所需班次':'D','人员岗位编号':'COOL-POST','人员参与阶段':'全程','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是','提前占用分钟':'0','后延占用分钟':'0'});
 const r=run(d);check(r);assert.notEqual(task(r,'HEAT').resourceBatchId,task(r,'HEAT','B').resourceBatchId);const people=r.plan.resourceReservations.filter(r=>r.type==='人员');assert.equal(people.length,2);assert.ok(people[0].end<=people[1].start||people[1].end<=people[0].start);dump('R4-10',r);
});

test('R4-11 invalid/incomplete kg pair and client contract hints refuse atomically; query role cannot write',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const state=await f.ok('/state'),before=f.bytes();
 const mutations=[d=>d.times.find(r=>r['工序编号']==='PACK')['计算方式']='按支数',d=>d.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']='',d=>d.machines.find(r=>r['设备编号']==='COOL01')['装载计量基准']='任意节点',d=>d.bom=[],d=>d.resourceClaims[0]['需求数量']='250',d=>d.orders[0]['数量单位']='袋'];
 const results=[];for(const mutate of mutations){const d=r4Scenario('12');mutate(d);const response=await f.call('/inputs',{revision:state.revision,tables:d,integrated:true,processRouteContract:'R4-kg-fixed-pair-v1',allowMaxLag:true});assert.equal(response.status,400);assert.equal(f.bytes(),before);results.push(response);}dump('R4-11',{results,zeroWrite:true});
});

test('R4-12 different actual upstream recipe histories never share heat after both are shifted to the new recipe date',()=>{
 const d=r4Scenario('13');d.calendars[0]['结束分钟']='2200';d.downtime=[{'设备编号':'MIX02','起始分钟':'0','结束分钟':'1000','原因':'B显式模拟晚投料'},...['COOL01','COOL02'].map(id=>({'设备编号':id,'起始分钟':'0','结束分钟':'1300','原因':'显式模拟跨日冷却阻塞'}))];d.bom.push(...d.bom.map(b=>({...b,'版本编号':'R4-UPSTREAM-v2','生效日期':'2026-11-03','配置用量':b['物料编号']==='LEAN'?'640':b['物料编号']==='FAT'?'160':b['配置用量']})));
 const r=run(d,{endMinute:2200});check(r);assert.notEqual(task(r,'HEAT').resourceBatchId,task(r,'HEAT','B').resourceBatchId);const rows=r.plan.materialDemands.filter(m=>m.materialId==='LEAN');assert.equal(rows.find(m=>m.orderId==='A').quantity,162.5);assert.equal(rows.find(m=>m.orderId==='B').quantity,160);assert.ok(r.plan.tasks.filter(t=>t.operation==='HEAT').every(t=>t.start>=1180));dump('R4-12',r);
});

test('R4-13 shifted furnace candidate rechecks actual-feed conditional supply and shares pending quantities atomically',()=>{
 const d=r4Scenario('13');for(const b of d.bom)if(b['用量类型']==='BOM物料')b['投料工序编号']='HEAT';d.inventory.find(r=>r['物料编号']==='LEAN')['账面数量']='162.5';
 const rule=d.rules.find(r=>r['规则编号']==='MATERIAL');rule['参数JSON']=JSON.stringify({...JSON.parse(rule['参数JSON']),'允许预计供给':true});
 d.supplies=[{'供给编号':'R4-EXPECTED','物料编号':'LEAN','批次编号':'R4-EXPECTED-LOT','预计数量':'162.5','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'R4-USE','订单编号':'B','工序编号':'HEAT','供给编号':'R4-EXPECTED','使用数量':'162.5'}];
 const r=run(d);check(r);assert.equal(task(r,'HEAT').resourceBatchId,task(r,'HEAT','B').resourceBatchId);assert.ok(task(r,'HEAT').start>=180);const lean=r.plan.materialDemands.filter(m=>m.materialId==='LEAN'&&m.committed);assert.equal(lean.length,2);assert.equal(lean.reduce((n,r)=>n+r.quantity,0),325);assert.equal(lean.flatMap(r=>r.allocations).filter(a=>a.conditional).reduce((n,a)=>n+a.quantity,0),162.5);assert.ok(r.plan.jointAttempts.some(a=>a.kind==='MATERIAL'));dump('R4-13',r);
});

test('R4-14 production split identity survives independent operation grouping; operation names come from source; no under-min overproduction',()=>{
 const split=r4Scenario('12');split.downtime=[];split.orders[0]['合格需求']='480';split.orders[0]['是否允许拆分']='是';const r=run(split);check(r);assert.equal(r.plan.productionBatches.length,2);assert.equal(r.plan.tasks.length,10);assert.ok(r.plan.productionBatches.every(b=>b.quantity===240&&b.load===250));dump('R4-14-split',r);
 const renamed=r4Scenario('13');for(const table of ['routes','times','machines','dependencies','resourceClaims'])for(const row of renamed[table])for(const field of ['工序编号','前序工序'])if(row[field])row[field]=({HEAT:'STERILIZE-X',COOL:'CHILL-Y'})[row[field]]||row[field];const x=run(renamed);check(x);assert.equal(x.plan.tasks.filter(t=>t.operation==='STERILIZE-X').length,2);dump('R4-14-renamed',x);
 const minimum=r4Scenario('14');minimum.machines.find(m=>m['设备编号']==='HEAT01')['最小装载kg']='300';const blocked=run(minimum);assert.ok(blocked.plan.findings.length);assert.equal(blocked.plan.tasks.filter(t=>t.operation==='HEAT'||t.operation==='COOL').length,0);assert.ok(blocked.plan.productionBatches.every(b=>b.load===250));
});
