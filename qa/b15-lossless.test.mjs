import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';import {losslessProfile} from './b15-lossless-fixture.mjs';
import {freezeRunInput} from '../server/run-input.mjs';import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';import {inventoryEligibility,queryInventoryAvailability} from '../src/lib/inventory.mjs';import {minuteInstant} from '../src/lib/minute-validity.mjs';import {PLAN_TIME_ORIGIN} from '../src/lib/expected-supply.mjs';
import {materialTaskSources} from '../src/lib/inventory-view.mjs';import {resourceClient} from '../src/lib/resource-workbench.mjs';
const out=process.env.LOSSLESS_OUT||'/workspace/temp/b15-lossless/selftest';
const save=(name,x)=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(x,null,2));};
const hash=x=>createHash('sha256').update(x).digest('hex');
async function imported(t,id){const f=await fixture(t),profile=losslessProfile(id);const read=f.bytes;f.bytes=()=>fs.existsSync(path.join(f.dir,'business.json'))?read():null;await f.ok('/state');const before=f.bytes(),p=await f.call('/imports/preview',{revision:0,files:profile.files,repairs:profile.repairs,inputStage:'supported'});assert.equal(p.body.valid,true,JSON.stringify(p.body));assert.equal(f.bytes(),before);await f.ok('/imports/commit',{previewId:p.body.id});return {f,profile,preview:p};}
for(const id of ['12','13','14','15','17','18'])test('lossless original13 '+id+' and UAT15 original14/18/19 use actual Worker and independent fixed-source verification',async t=>{
 const {f,profile,preview}=await imported(t,id),r=await b2Worker(f,profile.selection);assert.equal(r.run.status,'completed');assert.equal(r.plan.tasks.length,{12:5,13:10,14:10,15:4,17:5,18:2}[id]);assert.deepEqual(r.plan.findings,[]);
 const original=await f.ok('/plans/'+r.plan.id+'/inputs');assert.ok(original.data.originalInventory.length);assert.equal(r.input.conditions.stageBindings.length,id==='15'?9:5);assert.ok(r.input.conditions.stageBindings.every(b=>b.status==='BOUND'&&b.dataKind==='明确模拟'));
 const v=await f.ok('/plans/'+r.plan.id+'/verify',{});for(const key of ['stageBindings','resourcePolicies','jointConditions'])assert.equal(v.verification.checks[key].status,'pass',JSON.stringify(v.verification));
 for(const key of ['originalInventory',...(id==='15'?['originalSupply','originalProgress','originalEvents']:[])]){const csv=r.plan.inputCsvSources[key],raw=profile.originals.find(f=>f.name===csv.file);assert.equal(csv.originalText,raw.text);assert.equal(csv.sha256,hash(raw.text));assert.ok(csv.records.every(rec=>rec.line>=2));}
 assert.ok(r.plan.materialDemands.flatMap(d=>d.allocations).some(a=>a.lotId.startsWith('LOT-')));
 const view=await resourceClient(f.ok).reopen(r.run.id),refs=materialTaskSources(view,r.plan.tasks.map(t=>t.id));assert.ok(refs.some(r=>r.table==='originalInventory'&&r.physicalRow===2&&r.sourceSha256));assert.ok(refs.some(r=>r.table==='stageMappings'&&r.physicalRow));
 const csv=await f.ok('/export',{planId:r.plan.id});assert.ok(csv.includes('FR013-stage-bindings-v1')&&csv.includes('明确模拟'));
 if(id==='15'){
  assert.equal(r.plan.tasks.find(t=>t.id==='A-MIX').start,0);assert.equal(r.plan.tasks.find(t=>t.id==='A-FILL').end,60);assert.equal(r.plan.tasks.find(t=>t.id==='B-MIX').start,180);
  const b=r.plan.materialDemands.find(d=>d.orderId==='B'&&d.materialId==='LEAN');assert.equal(b.quantity,162.5);assert.deepEqual(b.allocations.map(a=>[a.lotId,a.quantity,a.conditional]),[['RCPT-LEAN',162.5,true]]);
  assert.equal(r.input.executionData.executionMaterials.reduce((sum,c)=>sum+Number(c['累计已用数量']),0),250);assert.equal(r.input.executionData.executionFacts[0]['工序完成数量'],'240');assert.equal(r.input.executionData.orders.find(o=>o['订单编号']==='A')['已完成合格数量'],profile.data.orders.find(o=>o['订单编号']==='A')['已完成合格数量']);
  assert.equal(v.verification.checks.originalResources.status,'pass');assert.ok(r.plan.originalResourceProtection.filter(p=>p.type==='人员').every(p=>p.quantity==='1'&&p.end===60));
  const before=f.bytes(),bad=await f.call('/runs',{revision:(await f.ok('/state')).revision,selection:{...profile.selection,startMinute:59}});assert.ok(bad.status>=400);assert.equal(f.bytes(),before);
 }
 save('worker-'+id,{profile,preview,result:r,verification:v,refs,csv,frozen:original});
});
test('configured expiry has exact next-day08:00 boundary; no date truncation, locale or silent rounding',()=>{
 const p=losslessProfile('17'),lot=p.data.inventory[0];assert.equal(minuteInstant(PLAN_TIME_ORIGIN,'1440'),'2026-11-03T00:00:00Z');
 const cases=[];for(const boundary of ['截止前','含截止'])for(const at of ['2026-11-03T07:59:59+08:00','2026-11-03T08:00:00+08:00','2026-11-03T08:00:01+08:00']){const r={...lot,'到期边界':boundary},actual=inventoryEligibility(r,at,['合格']).eligible,expected=at.includes('07:59:59')||boundary==='含截止'&&at.includes('08:00:00');assert.equal(actual,expected);cases.push({boundary,at,expected,actual});}
 for(const at of ['2026-11-02T23:59:59+08:00','2026-11-03T00:00:00+08:00'])assert.ok(queryInventoryAvailability([lot],{asOf:at})[0]['当前可用数量']>0);
 assert.throws(()=>minuteInstant(PLAN_TIME_ORIGIN,'0.000000000001'),/禁止舍入/);assert.equal(minuteInstant(PLAN_TIME_ORIGIN,'0.00005'),'2026-11-02T00:00:00.003Z');save('expiry-boundaries',cases);
});
test('mapping edit preview is zero-write, save adopts next version, old run and confirmation stay immutable',async t=>{
 const {f,profile}=await imported(t,'17'),old=await b2Worker(f,profile.selection);await f.ok('/plans/'+old.plan.id+'/verify',{});let review=await f.ok('/plans/'+old.plan.id+'/review');assert.deepEqual(review.blockers,[]);
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(x=>x.id),acceptPartial:false,acceptConditionalSupply:true,acknowledgeScope:true});
 await f.ok('/plans/'+old.plan.id+'/submit',decision(review));review=await f.ok('/plans/'+old.plan.id+'/review');await f.ok('/plans/'+old.plan.id+'/confirm',decision(review),'supervisor');const confirmation=(await f.ok('/plans/'+old.plan.id+'/review')).confirmation,oldInputs=await f.ok('/plans/'+old.plan.id+'/inputs');
 const s=await f.ok('/state'),maps=structuredClone(s.data.stageMappings),inventory=structuredClone(s.data.inventory);maps[0]['配置版本']='2';const params=JSON.parse(maps[0]['参数JSON']);params.location='MOCK-EDITED-LOCATION';maps[0]['参数JSON']=JSON.stringify(params);inventory[0]['位置']=params.location;const tables={stageMappings:maps,inventory};
 const before=f.bytes(),preview=await f.ok('/inputs/resource-policy-preview',{revision:s.revision,tables,selection:profile.selection});assert.equal(preview.valid,true);assert.equal(f.bytes(),before);
 const saved=await f.ok('/inputs',{revision:s.revision,tables});assert.equal(saved.revision,s.revision+1);const next=await b2Worker(f,profile.selection);assert.equal(next.input.executionData.inventory[0]['位置'],params.location);assert.equal(next.input.conditions.stageBindings[0].version,'2');assert.equal(old.input.conditions.stageBindings[0].version,'1');assert.deepEqual(await f.ok('/plans/'+old.plan.id+'/inputs'),oldInputs);assert.deepEqual(await f.ok('/confirmations/'+confirmation.id),confirmation);
 save('edit-preview-save-old-freeze',{old,next,preview,confirmation,oldInputs,storeBytesSha256:hash(f.bytes())});
});

test('minute precision enters runtime without rounding and delayed conditional supply respects original minute expiry',async t=>{
 const p=losslessProfile('17'),lot={...p.data.inventory[0],'可用分钟':'0.00005','预计可用时间':minuteInstant(PLAN_TIME_ORIGIN,'0.00005')};
 assert.equal(inventoryEligibility(lot,'2026-11-02T00:00:00.002Z',['合格']).eligible,false);assert.equal(inventoryEligibility(lot,'2026-11-02T00:00:00.003Z',['合格']).eligible,true);
 const {f,profile}=await imported(t,'15'),old=await b2Worker(f,profile.selection),state=await f.ok('/state');
 const delays=[{'记录编号':'MOCK-DELAY','供给编号':'MOCK-RCPT-LEAN','记录时间':'2026-11-02T09:00:00+08:00','调整后到达时间':'2026-11-02T11:30:00+08:00','调整后可用时间':'2026-11-02T11:30:00+08:00','原因':'明确模拟延期30分钟，不改原14的180分钟'}];
 await f.ok('/inputs',{revision:state.revision,tables:{supplyDelays:delays}});const next=await b2Worker(f,profile.selection);assert.equal(next.plan.tasks.find(t=>t.id==='B-MIX').start,210);assert.equal(next.input.executionData.supplies[0]['可用分钟'],'180');assert.equal(old.plan.tasks.find(t=>t.id==='B-MIX').start,180);assert.equal((await f.ok('/plans/'+next.plan.id+'/verify',{})).verification.checks.jointConditions.status,'pass');save('minute-precision-delayed-supply',{old,next,delays});
});
