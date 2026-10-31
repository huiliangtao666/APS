import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {packScenario,at} from './pack-batch-fixture.mjs';
import {r4Scenario} from './r4-fixture.mjs';
import {calculate,defs} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';import {verifyProcessRoute} from '../src/lib/verify-process-route.mjs';
import {operationDuration} from '../src/lib/pack-batch.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';
import {fixture,preview,commit} from './fr027-fixture.mjs';import {hostProcess} from './b234-host-client.mjs';import {b2Worker} from './b2-fixture.mjs';
const output=process.env.PACK_EVIDENCE;
const dump=(id,value)=>{if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,id+'.json'),JSON.stringify(value,null,2));}};
const run=data=>{const input=freezeRunInput(data,{},at),plan=calculate(input.executionData,1,at,input.conditions);return {data,input,plan};};
const check=r=>{assert.deepEqual(r.plan.findings,[]);const v=verifyProcessRoute(r.plan,r.input.executionData,r.input.conditions);assert.equal(v.status,'pass',JSON.stringify(v));return v;};
async function install(f,d){const state=await f.ok('/state'),response=await f.call('/imports/preview',{revision:state.revision,files:scenarioFiles(d),inputStage:'supported'}),p=response.body;assert.equal(p.valid,true,JSON.stringify(p.issues||p));await f.ok('/imports/commit',{previewId:p.id});}

test('PACK01 merged order work rounds 606 bags once to 610, target/rate=60min, actual tail input and fixed heat remain',()=>{
 const r=run(packScenario());check(r);const pack=r.plan.tasks.filter(t=>t.operation==='PACK');assert.equal(pack.length,2);assert.equal(new Set(pack.map(t=>t.resourceBatchId)).size,1);assert.ok(pack.every(t=>t.duration===60));
 assert.equal(r.plan.materialDemands.filter(d=>d.materialId==='BAG'&&d.committed).reduce((s,d)=>s+d.quantity,0),610);
 assert.deepEqual(r.plan.materialDemands.filter(d=>d.materialId==='BAG').map(d=>d.quantity),[310,300]);assert.ok(r.plan.tasks.filter(t=>t.operation==='HEAT').every(t=>t.duration===120&&t.loadKg===126.25));
 assert.equal(r.plan.productionBatches.reduce((s,b)=>s+b.quantity,0),242.4);assert.ok(r.plan.resourceBatches.filter(g=>g.operation==='HEAT').every(g=>g.loadKg<g.minimum));dump('PACK01',r);
});
test('PACK02 explicit separate work rounds each actual work, 310+310=620, 30min each and no shared remainder',()=>{
 const r=run(packScenario('逐生产批'));check(r);const pack=r.plan.tasks.filter(t=>t.operation==='PACK');assert.equal(new Set(pack.map(t=>t.resourceBatchId)).size,2);assert.ok(pack.every(t=>t.duration===30));assert.deepEqual(r.plan.materialDemands.filter(d=>d.materialId==='BAG').map(d=>d.quantity),[310,310]);dump('PACK02',r);
});
test('PACK03 compatible heat combines original orders at actual under-min load, never fills extra output',()=>{
 const d=r4Scenario('13');for(const m of d.machines){m['不足批处理']='允许实际量';if(m['工序编号']==='HEAT')m['最小装载kg']='500';}
 // 125kg+125kg input, with individually frozen 120kg output and matching cooling claims.
 for(const o of d.orders)o['合格需求']='120';for(const dep of d.dependencies.filter(d=>d['资源类型']==='空间'))dep['需求数量']='120';for(const c of d.resourceClaims)c['需求数量']='120';
 const r=run(d);check(r);const h=r.plan.tasks.filter(t=>t.operation==='HEAT');assert.equal(new Set(h.map(t=>t.resourceBatchId)).size,1);assert.ok(h.every(t=>t.duration===120&&t.quantity===120));dump('PACK03',r);
});
test('PACK04 explicit kg/piece/bag conversion and hour/minute rate units use exact source factors, no efficiency',()=>{
 const d=packScenario(),t=d.times.find(t=>t['工序编号']==='PACK'),kg={numerator:'1212',denominator:'5'};
 for(const [unit,rate]of [['kg','4.04'],['支','101'],['袋','10.1']]){Object.assign(t,{'包装数量单位':unit,'包装速率':rate,'速率时间单位':'分钟'});assert.equal(operationDuration(d,'HC40','PACK',kg),60);}
 Object.assign(t,{'包装数量单位':'kg','包装速率':'242.4','速率时间单位':'小时','包装时长模式':'按配置工时'});assert.equal(operationDuration(d,'HC40','PACK',kg),60);t['包装工时']='2';assert.throws(()=>operationDuration(d,'HC40','PACK',kg),/目标不等/);
 t['包装时长模式']='按目标数量';t['包装速率']='7';assert.throws(()=>operationDuration(d,'HC40','PACK',kg),/整数分钟/);
});
test('PACK05 frozen checker rejects duplicate members/tasks/deductions, double rounding, short time, capacity, wait and incompatible program',()=>{
 const r=run(packScenario());check(r);
 const mutations=[p=>p.tasks.push({...p.tasks.at(-1)}),p=>p.resourceBatches.find(g=>g.operation==='PACK').members.pop(),p=>p.resourceReservations.push({...p.resourceReservations.find(r=>r.resourceBatchId===p.tasks.at(-1).resourceBatchId)}),p=>{const d=p.materialDemands.findLast(d=>d.materialId==='BAG');d.quantity=310;d.exactQuantity={numerator:'310',denominator:'1'};},p=>p.tasks.find(t=>t.operation==='PACK').duration=1,p=>p.tasks.find(t=>t.operation==='HEAT').program='WRONG',p=>p.tasks.find(t=>t.operation==='COOL').start+=11,p=>p.materialDemands[0].allocations[0].exactRemaining.numerator='-1',p=>p.materialDemands.push({...p.materialDemands.find(d=>d.materialId==='BAG')})];
 for(const mutate of mutations){const p=structuredClone(r.plan);mutate(p);assert.notEqual(verifyProcessRoute(p,r.input.executionData,r.input.conditions).status,'pass',mutate.toString());}
 const d=structuredClone(r.input.executionData);d.machines.find(m=>m['工序编号']==='PACK')['最大装载kg']='200';assert.notEqual(verifyProcessRoute(r.plan,d,r.input.conditions).status,'pass');dump('PACK05',{mutations:mutations.map(String),original:r});
});
test('PACK06 bad config/units/minimum/version and unrelated new nodes fail whole proposed transaction with no writes',async t=>{
 const f=await fixture(t);await install(f,packScenario());
 for(const [table,field,value]of [['times','包装速率','0'],['times','包装数量单位','箱'],['times','速率时间单位','秒'],['times','包装作业边界','任意合并'],['times','数据性质',''],['bom','最小包装单位','0'],['machines','不足批处理','自动补满']]){
  const state=await f.ok('/state'),rows=structuredClone(state.data[table]),row=table==='times'?rows.find(r=>r['工序编号']==='PACK'):table==='bom'?rows.find(r=>r['用量类型']==='包装物料'):rows[0];row[field]=value;if(table==='times')row['配置版本']='2';const bytes=f.bytes(),res=await f.call('/inputs',{revision:state.revision,tables:{[table]:rows}});assert.equal(res.status,400,JSON.stringify(res));assert.equal(f.bytes(),bytes);
 }
 const state=await f.ok('/state'),times=structuredClone(state.data.times);times.at(-1)['包装速率']='121.2';const bytes=f.bytes();assert.equal((await f.call('/inputs',{revision:state.revision,tables:{times}})).status,400);assert.equal(f.bytes(),bytes);dump('PACK06',{atomic:true});
});
test('PACK07 actual import/API/Worker/verify/save/nativeCSV/new-process reopen freeze configuration and old plan; query cannot edit',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pack-reopen-'));let f=await hostProcess(dir);try{
  await install(f,packScenario());let result=await b2Worker(f);assert.equal(result.run.status,'completed');assert.equal(result.plan.tasks.length,10);const v=await f.ok('/plans/'+result.plan.id+'/verify',{});assert.equal(v.verification.checks.processRoute.status,'pass');await f.ok('/plans',{id:result.plan.id});
  const frozen=await f.ok('/plans/'+result.plan.id+'/inputs'),csv=await f.ok('/export',{planId:result.plan.id}),state=await f.ok('/state'),times=structuredClone(state.data.times);Object.assign(times.at(-1),{'包装速率':'484.8','配置版本':'2'});await f.ok('/inputs',{revision:state.revision,tables:{times}});
  const next=await b2Worker(f);assert.equal(next.run.status,'completed');assert.ok(next.plan.tasks.filter(t=>t.operation==='PACK').every(t=>t.duration===30));assert.deepEqual(await f.ok('/plans/'+result.plan.id+'/inputs'),frozen);assert.equal(await f.ok('/export',{planId:result.plan.id}),csv);
  const s=await f.ok('/state'),before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{times:s.data.times}},'query')).status,403);assert.equal(f.bytes(),before);const pid=f.pid;await f.close();f=await hostProcess(dir);assert.notEqual(f.pid,pid);assert.equal(f.bytes(),before);assert.equal(await f.ok('/export',{planId:result.plan.id}),csv);assert.deepEqual(await f.ok('/plans/'+result.plan.id+'/inputs'),frozen);dump('PACK07',{result,next,verified:v,frozen,csv,reopened:true});
 }finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('PACK08 old fixed input and legacy package amounts remain unchanged without opt-in',()=>{
 const d=r4Scenario('13'),before=JSON.stringify(d),r=run(d);check(r);assert.equal(JSON.stringify(d),before);assert.ok(r.plan.tasks.filter(t=>t.operation==='PACK').every(t=>t.duration===50));assert.equal(r.plan.materialDemands.filter(d=>d.materialId==='BAG').reduce((s,d)=>s+d.quantity,0),1200);dump('PACK08',r);
});
test('PACK09 merged packaging members move and lock together through real preview/independent recheck/explicit commit',async t=>{
 const f=await fixture(t);await install(f,packScenario());const r=await b2Worker(f),original=await f.ok('/plans/'+r.plan.id+'/inputs'),copy=await f.ok('/plans/'+r.plan.id+'/copy',{}),root='/trials/'+copy.id;
 const p=await preview(f,root,'["A",1,"PACK"]',{start:430,machine:'PACK01'});await commit(f,root,p);const state=await f.ok(root+'/positions'),id=state.planId,plans=await f.ok('/plans'),plan=plans.find(p=>p.id===id),pack=plan.tasks.filter(t=>t.operation==='PACK');assert.ok(pack.every(t=>t.start===430&&t.duration===60));assert.equal(new Set(pack.map(t=>t.resourceBatchId)).size,1);assert.deepEqual(await f.ok('/plans/'+r.plan.id+'/inputs'),original);
 const before=f.bytes(),bad=await f.call(root+'/move-preview',{revision:state.revision,planId:state.planId,planHash:state.planHash,taskId:pack[0].id,machine:'COOL01',start:430});assert.equal(bad.body.valid,false);const rejected=await f.ok(root+'/previews/'+bad.body.id+'/recheck',{});assert.equal(rejected.valid,false);assert.equal((await f.call(root+'/previews/'+bad.body.id+'/commit',{})).status,409);assert.equal(f.bytes(),before);const lock=await preview(f,root,pack[0].id,{locked:true},'lock');await commit(f,root,lock);const locked=await f.ok(root+'/positions');assert.ok(pack.every(t=>locked.locks[t.id]));dump('PACK09',{plan,oldInputsPreserved:true,forgedMachineRejected:true,locks:locked.locks});
});
test('PACK10 existing sequential kg route without a heat/cooling pair adopts packaging under its own declared rules',()=>{
 const d=packScenario();d.routes=d.routes.filter(r=>!['HEAT','COOL'].includes(r['工序编号']));d.times=d.times.filter(r=>!['HEAT','COOL'].includes(r['工序编号']));d.routes.at(-1)['前序工序']='FILL';d.dependencies=d.dependencies.filter(r=>!['HEAT','COOL'].includes(r['工序编号']));d.batchResources=[];d.resourceClaims=[];for(const rule of d.rules.filter(r=>['MAX_LAG','STORAGE'].includes(r['规则编号'])))rule['是否启用']='否';
 const r=run(d);check(r);assert.equal(r.plan.tasks.length,6);assert.ok(r.plan.tasks.filter(t=>t.operation==='PACK').every(t=>t.duration===60));dump('PACK10',r);
});
test('PACK11 merged-work shortage and capacity failure leave no pack allocations; missing upstream covers every unplanned member',()=>{
 for(const kind of ['shortage','capacity','upstream']){
  const d=packScenario();if(kind==='shortage')d.inventory.find(r=>r['物料编号']==='BAG')['账面数量']='609';if(kind==='capacity')d.machines.find(m=>m['工序编号']==='PACK')['最大装载kg']='200';if(kind==='upstream')d.calendars[0]['结束分钟']='100';
  const r=run(d);assert.equal(r.plan.tasks.filter(t=>t.operation==='PACK').length,0);assert.ok(r.plan.materialDemands.filter(m=>m.operation==='PACK').every(m=>!m.committed));assert.ok(r.plan.resourceReservations.every(res=>!res.taskIds?.some(id=>id.includes('PACK'))));assert.equal(verifyProcessRoute(r.plan,r.input.executionData,r.input.conditions).status,'partial');dump('PACK11-'+kind,r);
 }
});
