import fs from 'node:fs';import assert from 'node:assert/strict';import test from 'node:test';
import {resourceRunView,resourceTaskSources} from '../src/lib/resource-workbench.mjs';
const x=JSON.parse(fs.readFileSync(process.env.UAT07_OUT+'/api/core.json'));
function shifted(start){const p=structuredClone(x.plan),t=p.tasks.find(t=>t.id==='B-FILL'),delta=start-t.start;t.start+=delta;t.end+=delta;for(const r of p.resourceReservations)if(r.taskIds.includes(t.id)){r.start+=delta;r.end+=delta;}return p;}
for(const [start,expected]of [[60,'problem'],[69,'problem'],[70,'pass']])test('reopen independent checker finding is navigable at '+start,()=>{
 const p=shifted(start),before=JSON.stringify(p),v=resourceRunView(x.run,x.input,p);assert.equal(v.verification.status,expected);assert.equal(JSON.stringify(p),before);
 if(expected==='problem'){assert.ok(v.verification.findings.length);for(const f of v.verification.findings){assert.ok(v.findings.includes(f));assert.ok(f.taskIds.includes('A-FILL')&&f.taskIds.includes('B-FILL'));assert.match(f.message,/G01/);}}
 else assert.equal(v.findings.length,0);
});
test('scheduler and independent checker duplicate findings render once with source references preserved',()=>{
 const p=shifted(69),first=resourceRunView(x.run,x.input,p);p.findings=structuredClone(first.verification.findings);p.findings[0].relatedRecords=[{table:'originalDependencies',origin:{physicalRow:10}}];const v=resourceRunView(x.run,x.input,p);assert.equal(v.findings.length,first.verification.findings.length);assert.equal(v.findings[0].relatedRecords[0].origin.physicalRow,10);
});

test('frozen capacity source follows explicit mapping to original05 physical row without guessing identity',()=>{
 const ui=JSON.parse(fs.readFileSync(process.env.UAT07_OUT+'/ui/core.json')),v=resourceRunView(ui.run,ui.input,ui.plan),refs=resourceTaskSources(v,['A-FILL']);const source=refs.find(r=>r.table==='originalTools');assert.equal(source.row['资源编号'],'G01');assert.equal(source.row['可用数量'],'1');assert.equal(source.physicalRow,2);assert.equal(source.inputVersionId,ui.run.inputVersionId);assert.ok(refs.some(r=>r.table==='resourceMappings'&&r.row['来源编号']==='G01'));assert.ok(!refs.some(r=>r.table==='originalTools'&&r.row['资源编号']==='T01'));
 const noMap=structuredClone(ui.input);noMap.originalInput.resourceMappings=[];assert.ok(!resourceTaskSources(resourceRunView(ui.run,noMap,ui.plan),['A-FILL']).some(r=>r.table==='originalTools'));
});
