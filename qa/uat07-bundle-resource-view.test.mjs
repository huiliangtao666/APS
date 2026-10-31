import fs from 'node:fs';import assert from 'node:assert/strict';import test from 'node:test';
import {resourceRunView} from '../src/lib/resource-workbench.mjs';
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
