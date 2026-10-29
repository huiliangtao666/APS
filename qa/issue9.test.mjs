import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {fixture} from './fr027-fixture.mjs';import {materialFixture} from './material-fixture.mjs';import {executionFixture} from './execution-fixture.mjs';
import {seed,calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';import {inventoryView} from '../src/lib/inventory-view.mjs';import {queryInventoryAvailability} from '../src/lib/inventory.mjs';
import {at,stockData} from './issue9-fixture.mjs';
const lean=p=>p.materialDemands.find(r=>r.materialId==='LEAN');
test('Issue9 AC10 current availability, exact25 shortage, excluded simulation states and zero physical writes',()=>{
 const d=stockData(),before=JSON.stringify(d),view=inventoryView(d,at),p=calculate(d,0,at);assert.equal(view[0]['账面数量'],400);assert.equal(view[0]['已占用数量'],100);assert.equal(view[0]['当前可用数量'],300);assert.equal(view[0]['分配前可用数量'],300);assert.ok(view.slice(5).every(r=>r['当前可用数量']===0&&r['分配前可用数量']===0));
 assert.equal(lean(p).quantity,325);assert.equal(lean(p).shortage,25);assert.equal(lean(p).committed,false);assert.deepEqual(lean(p).allocations.map(a=>[a.lotId,a.quantity,a.remaining]),[['LEAN-LOT',300,0]]);assert.equal(JSON.stringify(d),before);
});
test('Issue9 query and allocation preserve independent configured policies, no new default state taxonomy',()=>{
 const d=stockData();d.rules.find(r=>r['规则编号']==='INVENTORY')['参数JSON']=JSON.stringify({'可用质量状态':['待检']});
 const rows=inventoryView(d,at),qualified=rows[0],pending=rows.find(r=>r['质量状态']==='待检');assert.equal(qualified['当前可用数量'],0);assert.equal(qualified['分配前可用数量'],300);assert.equal(pending['当前可用数量'],9999);assert.equal(pending['分配前可用数量'],0);assert.equal(lean(calculate(d,0,at)).shortage,25);
});
test('Issue9 shared expiry/time guard uses factory midnight and invalid dates fail closed; exact decimal query',()=>{
 const d=stockData(),lot=d.inventory[0];Object.assign(lot,{'账面数量':'0.3','已占用数量':'0.1'});assert.equal(inventoryView(d,at)[0]['当前可用数量'],0.2);
 for(const override of [{'有效期':'2026-02-30'},{'预计可用时间':'bad'},{'预计可用时间':'2026-11-02T11:00:00+08:00'},{'有效期':'2026-11-01'}]){const copy={...lot,...override};assert.equal(queryInventoryAvailability([copy],{asOf:at})[0]['当前可用数量'],0);}
 assert.equal(queryInventoryAvailability([lot],{asOf:'bad'})[0]['当前可用数量'],0);
});
test('Issue9 consumption is separately explained and not deducted twice, original facts unchanged',()=>{
 const d=executionFixture(seed),before=JSON.stringify(d),r=inventoryView(d,at)[0];assert.deepEqual([r['账面数量'],r['累计模拟耗料'],r['扣耗后余额'],r['已占用数量'],r['当前可用数量'],r['分配前可用数量']],[120,40,80,10,70,70]);assert.equal(JSON.stringify(d),before);
});
test('Issue9 Express atomic role/version/invalid-input protection and saved-reopen evidence',async t=>{
 const f=await fixture(t),d=stockData();await f.ok('/inputs',{revision:0,tables:d});const before=f.bytes(),revision=(await f.ok('/state')).revision;
 for(const [url,body]of [['/inputs',{revision,tables:{inventory:d.inventory}}],['/calculate',{revision}],['/runs',{revision}],['/export',{table:'inventory'}]])assert.equal((await f.call(url,body,'query')).status,403,url);
 assert.equal(f.bytes(),before);const bad=structuredClone(d.inventory);bad[0]['已占用数量']='401';assert.equal((await f.call('/inputs',{revision,tables:{inventory:bad}})).status,400);assert.equal(f.bytes(),before);
 const changed=structuredClone(d.inventory);changed[0]['位置']='显式模拟位置';const results=await Promise.all(['planner','supervisor'].map(role=>f.call('/inputs',{revision,tables:{inventory:changed}},role)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=await f.ok('/inventory?asOf='+encodeURIComponent(at));assert.equal(saved.rows[0]['位置'],'显式模拟位置');assert.equal(saved.rows[0]['当前可用数量'],300);const disk=JSON.parse(f.bytes());assert.equal(disk.records.at(-1).target,'inventory');assert.ok(['planner','supervisor'].includes(disk.records.at(-1).role));assert.equal((await f.call('/inventory?asOf=bad')).status,400);
});
test('Issue9 production bundled Worker retains AC10 source and uncommitted shortage across immutable snapshots',async()=>{
 const d=stockData(),frozen=freezeRunInput(d,{},at);d.inventory[0]['账面数量']='9999';const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:1,calculatedAt:at}});
 try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});assert.equal(lean(p).shortage,25);assert.equal(lean(p).allocations[0].quantity,300);assert.equal(lean(p).committed,false);assert.ok(p.tasks.every(t=>t.operation!=='MIX'));}finally{await worker.terminate();}
});
test('Issue9 AC11 explicit inventory ready11 waits rather than arrival10, and shortage attempts cannot consume stock',async t=>{
 const f=await fixture(t),d=stockData();Object.assign(d.inventory[0],{'账面数量':'425','预计可用时间':'2026-11-02T11:00:00+08:00'});await f.ok('/inputs',{revision:0,tables:d});
 const ten=(await f.ok('/inventory?asOf='+encodeURIComponent('2026-11-02T10:00:00+08:00'))).rows[0],eleven=(await f.ok('/inventory?asOf='+encodeURIComponent('2026-11-02T11:00:00+08:00'))).rows[0];assert.equal(ten['分配前可用数量'],0);assert.equal(eleven['分配前可用数量'],325);
 const before=(await f.ok('/state')).data,p=await f.ok('/calculate',{revision:1});assert.equal(p.tasks.find(t=>t.operation==='MIX').start,180);assert.equal(lean(p).feedMinute,180);assert.equal(lean(p).shortage,0);assert.deepEqual((await f.ok('/state')).data,before);assert.ok(p.tasks.find(t=>t.operation==='MIX').timingReasons.some(r=>r.code==='MATERIAL'));
});
test('Issue9 supervisor confirms preserved inventory snapshot; planner confirm denied; later stock edit cannot rewrite confirmation',async t=>{
 const f=await fixture(t),d=stockData();d.inventory[0]['账面数量']='425';await f.ok('/inputs',{revision:0,tables:d});const p=await f.ok('/calculate',{revision:1});await f.ok('/plans/'+p.id+'/verify',{});
 const decision=async()=>{const r=await f.ok('/plans/'+p.id+'/review');assert.deepEqual(r.blockers,[]);return {revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true};};
 await f.ok('/plans/'+p.id+'/submit',await decision());const bytes=f.bytes();assert.equal((await f.call('/plans/'+p.id+'/confirm',await decision(),'planner')).status,403);assert.equal(f.bytes(),bytes);await f.ok('/plans/'+p.id+'/confirm',await decision(),'supervisor');const disk=JSON.parse(f.bytes()),confirmed=structuredClone(disk.confirmations),plans=structuredClone(disk.plans),facts=structuredClone(disk.data.executionFacts);
 const inventory=structuredClone(disk.data.inventory);inventory[0]['位置']='新模拟位置';await f.ok('/inputs',{revision:1,tables:{inventory}});const after=JSON.parse(f.bytes());assert.deepEqual(after.confirmations,confirmed);assert.deepEqual(after.plans,plans);assert.deepEqual(after.data.executionFacts,facts);assert.equal(after.confirmations[0].actor,'test#supervisor');assert.equal(after.confirmations[0].snapshot.originalInput.inventory[0]['位置'],'模拟库');
});
