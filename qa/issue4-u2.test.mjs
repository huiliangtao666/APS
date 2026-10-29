import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {validateBomConfig} from '../src/lib/bom-config.mjs';import {validateExpectedSupply} from '../src/lib/expected-supply.mjs';import {assessRules} from '../src/lib/business-rules.mjs';
import {bindProblemSource,currentRecord} from '../src/lib/problem-records.mjs';import {inputHash,freezeRunInput} from '../server/run-input.mjs';import {validateInputs} from '../server/input-validation.mjs';import {seed,defs,calculate} from '../server/planner.ts';
import {fixture} from './fr027-fixture.mjs';import {materialFixture} from './material-fixture.mjs';import {u2Data,supplyInput,delay} from './issue4-u2-fixture.mjs';
const positions=f=>f.relatedRecords.map(r=>[r.table,r.occurrence.index]);
const source=d=>({domain:'current',inputVersionId:inputHash(d),revision:0,checkedAt:'2026-10-30T00:00:00Z'});
const dump=(n,x)=>{if(process.env.G01_EVIDENCE)fs.writeFileSync(path.join(process.env.G01_EVIDENCE,n),JSON.stringify(x,null,2));};
test('U2 Design original supply30 vs20+15 exact full membership excludes unrelated T/U3, inputs unchanged',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('./issue4-u2-design-input.json',import.meta.url))),d=u2Data(),before=JSON.stringify(d);
 assert.deepEqual(d.supplies.map(r=>[r['供给编号'],r['预计数量']]),original.tables.V1.supplies.map(r=>[r['供给编号'],r['预计数量']]).concat([['T','9']]));
 assert.deepEqual(d.supplyUses.map(r=>[r['引用编号'],r['供给编号'],r['使用数量']]),original.tables.V1.supplyUses.map(r=>[r['引用编号'],r['供给编号'],r['使用数量']]));
 const f=validateExpectedSupply(supplyInput(d)).find(f=>f.code==='SUPPLY_OVERALLOCATED');assert.deepEqual(positions(f),[['supplies',0],['supplyUses',0],['supplyUses',1]]);assert.equal(20+15-30,5);assert.equal(JSON.stringify(d),before);
 assert.equal(f.table,'supplies');assert.equal(f.row,2);assert.equal(f.field,'预计数量 / 使用数量');dump('supply-membership.json',{designOriginal:original,checked:d,expected:[['supplies',0],['supplyUses',0],['supplyUses',1]],actual:f,excess:5});
});
test('U2 BOM version group excludes other versions/products; duplicate includes every identical occurrence; unit baseline is actual last-map material',()=>{
 const d=materialFixture(seed);d.bom=[d.bom[0],{...d.bom[1],'生效日期':'2026-02-01'},{...d.bom[2],'版本编号':'OTHER'},{...d.bom[0]}];
 let f=validateBomConfig(d);assert.deepEqual(positions(f.find(f=>f.code.endsWith('BOM_VERSION_DATE'))),[['bom',0],['bom',1],['bom',3]]);assert.deepEqual(positions(f.find(f=>f.code.endsWith('BOM_LINE_DUPLICATE'))),[['bom',0],['bom',3]]);
 d.materials.push({...d.materials.find(m=>m['物料编号']===d.bom[0]['物料编号']),'单位':'wrong'});f=validateBomConfig(d).find(f=>f.code.endsWith('BOM_UNIT_MISMATCH'));assert.deepEqual(positions(f),[['bom',0],['materials',d.materials.length-1]]);assert.equal(f.relatedRecords[1].occurrence.keyCount,2);dump('bom-membership.json',{data:d,f});
});
test('U2 duplicate supply/use/delay and event-time groups retain complete occurrences including repeated object references',()=>{
 const d=u2Data();d.supplies=[d.supplies[0],d.supplies[0],{...d.supplies[0]}];d.supplyUses=[d.supplyUses[0],{...d.supplyUses[0]},d.supplyUses[0]];d.supplyDelays=[delay('D','10:00','10:00','11:00'),delay('D','10:00','11:00','12:00')];
 const f=validateExpectedSupply(supplyInput(d)).filter(f=>f.code==='SUPPLY_DUPLICATE');for(const issue of f){const count=issue.table==='supplyDelays'?2:3;assert.deepEqual(issue.relatedRecords.map(r=>r.occurrence.index),Array.from({length:count},(_,i)=>i));}
});
test('U2 delay compares original supply then immediately preceding consumed event, positions retain unsorted input order',()=>{
 const d=u2Data();d.supplyDelays=[delay('LATER','12:00','09:00','10:00'),delay('FIRST','10:00','07:00','08:00'),delay('MIDDLE','11:00','10:00','11:00')];
 const f=validateExpectedSupply(supplyInput(d)).filter(f=>f.code==='SUPPLY_DELAY');assert.deepEqual(f.map(positions),[[['supplyDelays',1],['supplies',0]],[['supplyDelays',0],['supplyDelays',2]]]);dump('delay-membership.json',{data:d,findings:f});
});
test('U2 missing targets remain metadata; no fabricated records, absent order route includes actual order baseline',()=>{
 const d=u2Data();d.supplyUses[0]['供给编号']='ABSENT';d.supplyUses[1]['工序编号']='ABSENT';
 const f=validateExpectedSupply(supplyInput(d));assert.deepEqual(positions(f.find(f=>f.code==='SUPPLY_REFERENCE')),[['supplyUses',0]]);assert.equal(f.find(f=>f.code==='SUPPLY_REFERENCE').missingTarget.key,'ABSENT');assert.deepEqual(positions(f.find(f=>f.code==='SUPPLY_OPERATION')),[['supplyUses',1],['orders',0]]);
});
test('U2 enabled-rule missing data retains trigger; missing mandatory rule is certified zero records; coverage retains existing triggers and read baseline',()=>{
 const d=structuredClone(seed);d.rules=d.rules.filter(r=>r['规则编号']!=='MACHINE');d.bom=[];d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='是';
 let f=assessRules(d).issues;const absent=f.find(f=>f.message==='必要规则 MACHINE 不得删除');assert.equal(absent.associationState,'known-absent');assert.deepEqual(absent.relatedRecords,[]);assert.equal(absent.row,0);
 assert.deepEqual(positions(f.find(f=>f.message==='启用物料规则须先配置 BOM')),[['rules',d.rules.findIndex(r=>r['规则编号']==='MATERIAL')]]);
 d.times=[];d.dependencies=[];f=assessRules(d,undefined,true).issues;const duration=f.find(f=>f.message.includes('缺少有效固定工时'));assert.deepEqual(positions(duration),[['orders',0],['routes',0]]);const deps=f.find(f=>f.message.includes('须配置唯一、有效的设备依赖'));assert.deepEqual(positions(deps),[['orders',0],['routes',0]]);dump('rules-membership.json',{data:d,findings:f});
});
test('U2 collect and planner carry native positions and exact participants, source binding rejects duplicate/delete/rename/reuse/trial domains',()=>{
 const d=u2Data();for(const f of [validateInputs(defs,d).find(f=>f.code==='SUPPLY_OVERALLOCATED'),calculate(d,1).findings.find(f=>f.code==='SUPPLY_OVERALLOCATED')])assert.deepEqual(positions(f),[['supplies',0],['supplyUses',0],['supplyUses',1]]);
 const f=bindProblemSource(validateExpectedSupply(supplyInput(d)).find(f=>f.code==='SUPPLY_OVERALLOCATED'),source(d));for(const ref of f.relatedRecords)assert.ok(currentRecord(ref,d,{inputVersionId:inputHash(d),operations:[]}));
 const ref=f.relatedRecords[1],changed=structuredClone(d);changed.supplyUses.reverse();const operations=[{batchId:'b',fromVersion:inputHash(d),toVersion:inputHash(changed),toRevision:1,target:'supplyUses',before:d.supplyUses,after:changed.supplyUses}];assert.equal(currentRecord(ref,changed,{inputVersionId:inputHash(changed),operations}).index,2);
 for(const rows of [[],[{...ref.row,'引用编号':'RENAMED'}],[ref.row,ref.row]]){const after={...d,supplyUses:rows};assert.equal(currentRecord(ref,after,{inputVersionId:inputHash(after),operations:[]}),null);}
 const trial=bindProblemSource({...f,relatedRecords:[{...ref,origin:undefined}]},{...source(d),domain:'trial:T'});assert.equal(currentRecord(trial.relatedRecords[0],d,{inputVersionId:inputHash(d)}),null);
});
test('U2 real HTTP preflight freezes membership; unauthorized, invalid, stale writes preserve full storage and old history',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const original=JSON.parse(f.bytes()),oldPlans=structuredClone(original.plans),d=u2Data();original.data=d;fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(original));
 const before=f.bytes(),r=await f.call('/calculate',{revision:0});assert.equal(r.status,422);assert.equal(f.bytes(),before);const issue=r.body.findings.find(x=>x.code==='SUPPLY_OVERALLOCATED');assert.deepEqual(positions(issue),[['supplies',0],['supplyUses',0],['supplyUses',1]]);for(const ref of issue.relatedRecords){assert.equal(ref.origin.inputVersionId,inputHash(d));assert.deepEqual(ref.row,d[ref.table][ref.origin.occurrence.index]);}
 assert.equal((await f.call('/inputs',{revision:0,tables:{supplyUses:d.supplyUses}})).status,400);assert.equal(f.bytes(),before);assert.equal((await f.call('/inputs',{revision:0,tables:{supplies:d.supplies}},'query',{'x-role':'supervisor'})).status,403);assert.equal(f.bytes(),before);assert.equal((await f.call('/inputs',{revision:999,tables:{supplies:d.supplies}})).status,409);assert.equal(f.bytes(),before);
 const corrected=d.supplyUses.map(r=>r['引用编号']==='U2'?{...r,'使用数量':'10'}:r);await f.ok('/inputs',{revision:0,tables:{supplyUses:corrected}});assert.deepEqual(JSON.parse(f.bytes()).plans,oldPlans);assert.deepEqual(r.body.checkedInput.data,d);const recheck=await f.call('/calculate',{revision:1});assert.equal(recheck.status,201,JSON.stringify(recheck.body));assert.ok(!recheck.body.findings.some(f=>f.code==='SUPPLY_OVERALLOCATED'));dump('http-u2.json',{preflight:r,corrected,recheck});
});
test('U2 production bundled Worker preserves aggregate source members; separate valid HTTP run freezes original history',async t=>{
 const {Worker}=await import('node:worker_threads');const d=u2Data(),frozen=freezeRunInput(d,{orderIds:['A']});const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{executionData:frozen.executionData,revision:0,conditions:frozen.conditions,calculatedAt:'2026-10-30T00:00:00Z'}});
 try{const plan=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(JSON.stringify(m)));});worker.on('error',reject);});const issue=plan.findings.find(f=>f.code==='SUPPLY_OVERALLOCATED');assert.deepEqual(positions(issue),[['supplies',0],['supplyUses',0],['supplyUses',1]]);dump('worker-u2.json',{classification:'Direct bundled Worker invalid diagnostic fixture; not a persisted HTTP invalid plan',frozen,plan});}finally{await worker.terminate();}
 const f=await fixture(t);d.supplyUses[1]['使用数量']='10';await f.ok('/inputs',{revision:0,tables:d});const s=await f.ok('/state'),run=await f.ok('/runs',{revision:s.revision});let done;for(let i=0;i<200;i++){done=await f.ok('/runs/'+run.id);if(done.planId)break;await new Promise(r=>setTimeout(r,25));}assert.ok(done.planId);const history=await f.ok('/runs/'+run.id+'/inputs');await f.ok('/inputs',{revision:s.revision,tables:{supplies:d.supplies.map(r=>({...r,'预计数量':'31'}))}});assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),history);dump('worker-u2-valid-http.json',{run,done,history});
});

test('U2 real early invalid_rule_selection remains400 with certified absent-rule zero-record finding',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const s=JSON.parse(f.bytes());s.data.rules=s.data.rules.filter(r=>r['规则编号']!=='MACHINE');fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));const before=f.bytes(),r=await f.call('/calculate',{revision:0});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_rule_selection');const issue=r.body.findings.find(x=>x.associationState==='known-absent');assert.ok(issue);assert.deepEqual(issue.relatedRecords,[]);assert.equal(issue.missingTarget.key,'MACHINE');assert.equal(issue.source.inputVersionId,inputHash(s.data));assert.deepEqual(r.body.checkedInput.data,s.data);assert.equal(f.bytes(),before);dump('http-zero-early400.json',r);
});
