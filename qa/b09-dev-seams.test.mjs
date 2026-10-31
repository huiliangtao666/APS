import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {materialScenario,scenarioFiles} from './b3-material-fixture.mjs';
import {materialTaskSources,inventoryView} from '../src/lib/inventory-view.mjs';import {resourceClient} from '../src/lib/resource-workbench.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),out=process.env.EVIDENCE_DIR;
function dump(id,value){if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(value,null,2));}}
async function imported(f,data=materialScenario()){const s=await f.ok('/state'),p=await f.ok('/imports/preview',{revision:s.revision,files:scenarioFiles(data),inputStage:'supported'});assert.ok(p.valid);await f.ok('/imports/commit',{previewId:p.id});return data;}
async function worker(f){const s=await f.ok('/state'),r=await f.ok('/runs',{revision:s.revision,selection:{mode:'supported',orderIds:['A'],startMinute:0,endMinute:600,enabledRuleIds:s.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号'])}});for(let n=0;n<600;n++){const run=await f.ok('/runs/'+r.id);if(run.planId)return {run,plan:(await f.ok('/plans')).find(p=>p.id===run.planId),snapshot:await f.ok('/runs/'+r.id+'/inputs')};assert.ok(!['failed','cancelled','timed_out'].includes(run.status));await new Promise(r=>setTimeout(r,10));}throw Error('worker timeout');}
test('BD01 saved material preview returns exact snapshots, zero writes; disabled MATERIAL remains unchecked',async t=>{
 const f=await fixture(t);await imported(f);let s=await f.ok('/state'),bytes=f.bytes();const selection={mode:'supported',orderIds:['A'],startMinute:0,endMinute:600};
 const p=await f.ok('/inputs/resource-policy-preview',{revision:s.revision,tables:{rules:s.data.rules},selection});assert.equal(p.persisted,false);assert.equal(f.bytes(),bytes);assert.equal(p.candidate.materialChecked,true);assert.equal(p.candidate.materialDemands.find(r=>r.materialId==='LEAN').quantity,162.5);
 const rules=structuredClone(s.data.rules);rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='否';const off=await f.ok('/inputs/resource-policy-preview',{revision:s.revision,tables:{rules},selection});assert.equal(off.candidate.materialChecked,false);assert.equal(f.bytes(),bytes);
 dump('BD01',{preview:p,offMaterialUnchecked:off});
});
test('BD02 frozen material sources preserve physical rows/hash and unplanned tasks; no guessed original09 mapping',async t=>{
 const f=await fixture(t);await imported(f,materialScenario('UAT-10'));const {run,plan,snapshot}=await worker(f),view={run,plan,snapshot},refs=materialTaskSources(view,['A-MIX']);
 assert.ok(refs.some(r=>r.table==='bom'&&r.row['物料编号']==='LEAN'));assert.ok(refs.some(r=>r.table==='inventory'&&r.row['批次编号']==='B3-FROZEN'));assert.ok(!refs.some(r=>r.table==='originalBom'));assert.ok(refs.every(r=>r.physicalRow>=2&&r.file&&r.sourceSha256));
 const d=structuredClone(view);d.plan.inputCsvSources.bom.canonicalRows[0]['配置用量']='999';const fallback=materialTaskSources(d,['A-MIX']).find(r=>r.table==='bom'&&r.index===0);assert.equal(fallback.physicalRow,null);assert.equal(fallback.sourceSha256,null);assert.equal(fallback.canonicalRow,2);
 assert.deepEqual(materialTaskSources(view,['unknown']),[]);assert.equal(plan.tasks.length,0);assert.equal(plan.materialDemands.find(r=>r.materialId==='LEAN').shortage,0.1);dump('BD02',{run,refs,fallback});
});
test('BD03 all four invalid inputs individually and jointly reject atomically; no Worker launch/default correction',async t=>{
 const f=await fixture(t);await imported(f);const s=await f.ok('/state'),bytes=f.bytes(),bad=materialScenario('UAT-11'),results=[];
 for(const tables of [bad,{calendars:bad.calendars},{times:bad.times},{dependencies:bad.dependencies},{bom:bad.bom}]){const r=await f.call('/inputs',{revision:s.revision,tables});assert.equal(r.status,400);assert.equal(f.bytes(),bytes);results.push(r);}
 const preview=await f.call('/imports/preview',{revision:s.revision,files:scenarioFiles(bad),inputStage:'supported'});assert.equal(preview.status,400);assert.equal(f.bytes(),bytes);
 for(const table of ['calendars','routes','dependencies','bom'])assert.ok(preview.body.issues.some(i=>i.table===table&&i.file&&i.row>=2&&i.field),table);
 const disk=JSON.parse(bytes);disk.data=bad;fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(disk));const injected=f.bytes(),run=await f.call('/runs',{revision:s.revision});assert.equal(run.status,422);assert.equal(f.bytes(),injected);assert.equal((await f.ok('/runs')).length,0);
 dump('BD03',{results,preview,run,zeroWrites:true});
});
test('BD04 Worker freeze, native export and source bytes survive current edits and store reopen; stale/role/CSRF guards',async t=>{
 const f=await fixture(t);await imported(f);const data=await f.ok('/state'),{run,plan,snapshot}=await worker(f);const csv=await f.ok('/export',{planId:plan.id}),before=hash(JSON.stringify(snapshot));await f.ok('/plans',{id:plan.id});
 assert.match(csv,/exactShortage/);assert.match(csv,/B3-EARLY/);assert.match(csv,/excludedLots/);const tables={inventory:data.data.inventory.map(r=>r['批次编号']==='B3-LATE'?{...r,'账面数量':'62.4'}:r)};
 const saved=await f.ok('/inputs',{revision:data.revision,tables});assert.ok(saved.revision>data.revision);assert.equal(hash(JSON.stringify(await f.ok('/runs/'+run.id+'/inputs'))),before);assert.equal(await f.ok('/export',{planId:plan.id}),csv);
 const client=resourceClient(f.ok),view=await client.reopen(run.id);assert.equal(view.plan.materialDemands.find(r=>r.materialId==='LEAN').shortage,0);assert.equal(inventoryView(view.snapshot.executionData,'2026-11-02T08:00:00+08:00').find(r=>r['批次编号']==='B3-LATE')['账面数量'],62.5);
 assert.equal((await f.call('/inputs',{revision:data.revision,tables})).status,409);assert.equal((await f.call('/runs',{revision:saved.revision},'query')).status,403);assert.equal((await f.call('/inputs',{revision:saved.revision,tables},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 dump('BD04',{run,plan,snapshotHash:before,exportHash:hash(csv),frozenSources:materialTaskSources(view,['A-MIX']),saved,bytesHash:hash(f.bytes())});
});
