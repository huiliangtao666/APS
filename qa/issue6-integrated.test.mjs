import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';import {stageInput} from './issue6-stage-input.mjs';
import {defs,calculate} from '../server/planner.ts';import {inputHash} from '../server/run-input.mjs';
const dir=process.env.ISSUE6_INPUT_DIR||'/inputs';
export async function importStage(f){
 const {files,repairs}=stageInput(dir,{selectApplicableMachines:true});assert.equal(files.length,10);
 const state=await f.ok('/state');
 const missing=await f.ok('/imports/preview',{revision:state.revision,files});assert.equal(missing.valid,false);assert.equal(missing.issues.length,6);
 const raw=stageInput(dir);const original=await f.call('/imports/preview',{revision:state.revision,files:raw.files,repairs:raw.repairs});assert.equal(original.body.valid,false);assert.equal(original.body.issues.length,4);assert.ok(original.body.issues.every(i=>i.code==='INPUT / MACHINE_OPERATION_REFERENCE'));
 const p=await f.ok('/imports/preview',{revision:state.revision,files,repairs});assert.equal(p.valid,true,JSON.stringify(p));
 const saved=await f.ok('/imports/commit',{previewId:p.id});return {saved,files,repairs};
}
export async function illegalSavedPlan(f,plan,start=14){
 // Test-only corruption of saved fixed output: production exposes no arbitrary-plan injection.
 const file=path.join(f.dir,'business.json'),s=JSON.parse(f.bytes()),p=s.plans.find(p=>p.id===plan.id),task=p.tasks.find(t=>t.id==='B-MIX');task.start=start;task.end=start+30;
 fs.writeFileSync(file,JSON.stringify(s));return p;
}
test('original ten-table atomic import, readback, fixed calendar verification, export, reopen and version isolation',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});
 const initial=(await f.ok('/state')).data;
 const {saved,files,repairs}=await importStage(f),v=saved.revision;
 const state=await f.ok('/state');assert.deepEqual(state.data,saved.data);
 const inactive=defs.filter(d=>!files.some(f=>f.name===d.file)).map(d=>d.key);for(const key of inactive)assert.deepEqual(state.data[key],initial[key],key+' not silently imported or cleared');
 const before=f.bytes(),bad=files.map(f=>f.name.startsWith('04_')?{...f,text:f.text.replace('MIX02','UNKNOWN')}:f);
 const failed=(await f.call('/imports/preview',{revision:v,files:bad,repairs})).body;assert.equal(failed.valid,false);assert.equal(f.bytes(),before);
 assert.equal((await f.call('/imports/commit',{previewId:failed.id})).status,409);assert.equal(f.bytes(),before);
 const p=await f.ok('/calculate',{revision:v});assert.equal(p.tasks.length,4,JSON.stringify(p.findings));assert.deepEqual(p.tasks.map(t=>[t.id,t.start,t.end]),[['A-MIX',0,30],['A-FILL',30,60],['B-MIX',15,45],['B-FILL',45,75]]);
 const verified=await f.ok('/plans/'+p.id+'/verify',{});assert.equal(verified.verification.checks.calendar.status,'pass');
 await illegalSavedPlan(f,p);const badPlan=await f.ok('/plans/'+p.id+'/verify',{});const finding=badPlan.verification.findings.find(f=>f.code==='VERIFY / CALENDAR_INTERVAL');assert.ok(finding);assert.deepEqual(finding.taskIds,['B-MIX']);
 for(const table of ['orders','machines','calendars','downtime','rules']){const ref=finding.relatedRecords.find(r=>r.table===table);assert.ok(ref.csv,table+JSON.stringify(ref));assert.equal(ref.csv.physicalRow,table==='orders'||table==='machines'?3:table==='rules'?4:2);assert.ok(ref.csv.sha256);}
 await f.ok('/plans',{id:p.id});const reopened=(await f.ok('/plans')).find(x=>x.id===p.id);assert.deepEqual(reopened.verification,badPlan.verification);assert.ok(reopened.inputCsvSources.downtime.sha256);
 const csv=await f.ok('/export',{planId:p.id});assert.ok(csv.includes('CALENDAR_INTERVAL'));assert.ok(csv.includes('physicalRow'));
 // New data cannot repair or rebind an old finding.
 const changed=state.data.downtime.map(r=>({...r,'结束分钟':'10'}));await f.ok('/inputs',{revision:v,tables:{downtime:changed}});
 const old=(await f.ok('/plans')).find(x=>x.id===p.id);assert.deepEqual(old.verification,badPlan.verification);assert.equal(old.inputSnapshot.downtime[0]['结束分钟'],'15');assert.equal((await f.call('/plans/'+p.id+'/verify',{})).body.error,'stale_input');
 const actual=await f.ok('/state');const variant=structuredClone(state.data);variant.downtime[0]['起始分钟']='30';variant.downtime[0]['结束分钟']='60';
 const alt=calculate(variant,1,'2026-10-30T00:00:00Z',{mode:'supported',startMinute:15});const b=alt.tasks.find(t=>t.id==='B-MIX');assert.equal(b.start,60);assert.equal(b.end,90);assert.match(b.source,/设备停机/);
 assert.equal(actual.data.downtime[0]['结束分钟'],'10');
});

test('continuous shortage produces unplanned source rows with same task and no invented interval; unique inheritance reaches actual runtime',async t=>{
 const {problemInterval}=await import('../src/lib/task-linkage.mjs');const f=await fixture(t);const {saved}=await importStage(f);
 const state=(await f.ok('/state')).data;
 // Explicitly inherit the one calendar of F01, then verify actual schedule.
 const machines=state.machines.map(r=>({...r,'日历编号':''}));await f.ok('/inputs',{revision:saved.revision,tables:{machines}});
 const inherited=await f.ok('/calculate',{revision:saved.revision+1});assert.equal(inherited.tasks.length,4);const verified=await f.ok('/plans/'+inherited.id+'/verify',{});assert.equal(verified.verification.checks.calendar.status,'pass');
 const narrow=[{...state.calendars[0],'结束分钟':'20'},{...state.calendars[0],'起始分钟':'40','结束分钟':'60'}];await f.ok('/inputs',{revision:saved.revision+1,tables:{calendars:narrow}});
 const blocked=await f.ok('/calculate',{revision:saved.revision+2});assert.equal(blocked.tasks.length,0);const finding=blocked.findings.find(f=>f.code==='UNPLANNED / CALENDAR'&&f.taskIds.includes('B-MIX'));assert.ok(finding);assert.equal(problemInterval(blocked,finding),null);assert.ok(finding.relatedRecords.some(r=>r.table==='orders'&&r.csv?.physicalRow===3));assert.ok(finding.relatedRecords.filter(r=>r.table==='calendars').every(r=>r.associationGap&&!r.csv));
});
