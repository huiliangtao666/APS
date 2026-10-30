import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';
import {sourceFile,invalidProducts,duplicateRoutes} from './fr016-csv-source-fixture.mjs';
import {seed,defs} from '../server/planner.ts';
import {currentRecord,bindProblemSource} from '../src/lib/problem-records.mjs';
import {inputHash} from '../server/run-input.mjs';
import {inspectSingleCsv} from '../server/csv-single.mjs';
import {checkedCsvSources,csvProblemEvidence} from '../server/csv-problems.mjs';
import {sourceRefs} from '../src/lib/problem-records.mjs';
const out=process.env.EVIDENCE_DIR;
const hash=x=>createHash('sha256').update(x).digest('hex');
function dump(name,value){if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2));}}
async function checked(t){const f=await fixture(t);await f.ok('/calculate',{revision:0});return f;}
const preview=(f,file,extra={})=>f.call('/imports/preview',{revision:0,files:[file],...extra});
function provenance(ref,file,line,field){assert.equal(ref.csv.file,file.name);assert.equal(ref.csv.physicalRow,line);assert.equal(ref.csv.sha256,hash(file.text));assert.equal(ref.csv.field,field);assert.equal(ref.origin.occurrence.index,ref.csv.occurrence);}

test('S01 batch semantic error retains exact BOM/mixed-newline original file and physical row in both issues/findings',async t=>{
 const f=await checked(t),before=f.bytes(),{file,rows}=invalidProducts(),r=await preview(f,file);
 assert.equal(r.status,400);assert.equal(r.body.valid,false);assert.ok(!r.body.id);assert.deepEqual(r.body.issues,r.body.findings);
 const issue=r.body.issues.find(x=>x.field==='总收率');assert.ok(issue);assert.equal(issue.row,9);assert.equal(issue.file,file.name);assert.ok(issue.reason);assert.deepEqual(issue.taskIds,[]);
 assert.equal(issue.relatedRecords.length,1);provenance(issue.relatedRecords[0],file,9,'总收率');assert.deepEqual(issue.relatedRecords[0].row,rows[1]);
 assert.equal(issue.relatedRecords[0].origin.domain,'candidate:current');assert.equal(issue.relatedRecords[0].origin.inputVersionId,inputHash(r.body.checkedInput.data));
 assert.equal(r.body.sources.products.originalText,file.text);assert.deepEqual(r.body.sources.products.lines,[4,9]);assert.equal(f.bytes(),before);
 dump('S01.json',{file,response:r,before,after:f.bytes()});
});
test('S02 single-table custom filename and duplicate group retain every original occurrence, field and reason',async t=>{
 const f=await checked(t),before=f.bytes(),{file,lines}=duplicateRoutes();file.name='客户原路线.csv';
 const r=await preview(f,file,{table:'routes'});assert.equal(r.status,400);
 const issue=r.body.findings.find(x=>x.code==='INPUT / ROUTE_DUPLICATE');assert.ok(issue);assert.deepEqual(issue.taskIds,[]);
 assert.deepEqual(issue.relatedRecords.map(r=>r.origin.occurrence.index),[0,4]);
 for(const [n,ref] of issue.relatedRecords.entries()){provenance(ref,file,lines[n?4:0],'产品编号 + 工序编号');assert.equal(currentRecord(ref,seed),null);}
 assert.equal(f.bytes(),before);dump('S02.json',{file,response:r,before,after:f.bytes()});
});
test('S03 parser-required and column-count errors use physical rows once and link only actual parsed records',async t=>{
 const f=await checked(t),before=f.bytes(),rows=structuredClone(seed.times);rows[0]['固定分钟']='';
 const file=sourceFile('times',rows,{mixed:true,blank:true}),r=await preview(f,file);assert.equal(r.status,200);
 const issue=r.body.issues.find(x=>x.field==='固定分钟');assert.equal(issue.row,4);assert.equal(issue.index,0);provenance(issue.relatedRecords[0],file,4,'固定分钟');assert.equal(issue.relatedRecords[0].row['固定分钟'],'');
 const short={...file,text:file.text.replace('"HC40","MIX","固定","","120"','"HC40","MIX","固定",""')};
 const bad=await preview(f,short);const columns=bad.body.issues.find(x=>x.field==='整行');assert.equal(columns.row,4);provenance(columns.relatedRecords[0],short,4,'整行');assert.equal(f.bytes(),before);dump('S03.json',{required:r,columns:bad,before,after:f.bytes()});
});
test('S04 header, malformed quoting, unsupported filename and invalid repair never fabricate a record or task',async t=>{
 const f=await checked(t),before=f.bytes(),def=defs.find(d=>d.key==='products'),results=[];
 for(const file of [{name:def.file,text:'坏表头\r\nHC40\r\n'},{name:def.file,text:'"未闭合\r\n第二行'},{name:'未知.csv',text:'A\r\nB\r\n'}]){
  const r=await preview(f,file);assert.equal(r.body.valid,false);assert.ok(!r.body.id);for(const x of r.body.issues){assert.deepEqual(x.relatedRecords,[]);assert.deepEqual(x.taskIds,[]);assert.ok(x.associationGap);}results.push(r);
 }
 const bad=await preview(f,sourceFile('products',seed.products),{repairs:[{file:'其他.csv',row:999,field:'订单状态',value:'有效'}]});assert.deepEqual(bad.body.issues[0].relatedRecords,[]);assert.equal(f.bytes(),before);dump('S04.json',{results,bad,before,after:f.bytes()});
});
test('S05 query/outsider, stale revision and forged commit reject without any storage write',async t=>{
 const f=await checked(t),before=f.bytes(),{file}=invalidProducts(),results=[];
 for(const [role,revision,status] of [['query',0,403],['outsider',0,403],['planner',999,409]]){
  const r=await f.call('/imports/preview',{revision,files:[file]},role);assert.equal(r.status,status);assert.equal(f.bytes(),before);results.push({role,r});
 }
 const forged=await f.call('/imports/commit',{previewId:'invented',tables:{products:seed.products}});assert.equal(forged.status,409);assert.equal(f.bytes(),before);dump('S05.json',{results,forged,before,after:f.bytes()});
});
test('S06 valid CSV commit/reopen persists original bytes; Worker and later input edits freeze old plans/runs/sources',async t=>{
 const f=await checked(t),initial=JSON.parse(f.bytes()),{rows}=invalidProducts();rows[1]['总收率']='.8';
 const file=sourceFile('products',rows,{mixed:true,blank:true});const p=await preview(f,file);assert.equal(p.body.valid,true);await f.ok('/imports/commit',{previewId:p.body.id});
 const saved=JSON.parse(f.bytes());assert.equal(saved.csvSources.products.originalText,file.text);assert.equal(saved.csvSources.products.sha256,hash(file.text));assert.deepEqual(saved.csvSources.products.lines,[4,9]);assert.deepEqual(saved.plans,initial.plans);
 const input=await f.ok('/state'),run=await f.ok('/runs',{revision:input.revision});let done;
 for(let i=0;i<500;i++){done=await f.ok('/runs/'+run.id);if(['completed','partial'].includes(done.status))break;assert.ok(!['failed','timed_out'].includes(done.status));await new Promise(r=>setTimeout(r,10));}
 assert.ok(['completed','partial'].includes(done.status));const snapshot=await f.ok('/runs/'+run.id+'/inputs'),frozen=JSON.parse(f.bytes());
 const next=structuredClone(input.data.products);next[0]['产品名称']='新输入名称';await f.ok('/inputs',{revision:input.revision,tables:{products:next}});
 const after=JSON.parse(f.bytes());for(const key of ['plans','runs'])assert.deepEqual(after[key],frozen[key]);assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),snapshot);assert.deepEqual(after.inputVersions[run.inputVersionId],frozen.inputVersions[run.inputVersionId]);assert.equal(after.csvSources.products,undefined);
 // A fresh router reads the exact persisted store; it cannot reconstruct from current rows.
 const express=(await import('express')).default,{createBusinessRouter}=await import('../server/business.mjs'),app=express();app.use('/api',createBusinessRouter({dataDir:f.dir,actorMiddleware:(q,s,n)=>n(),requireMember:()=> (q,s,n)=>{q.member={role:'query'};n();}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const plans=await (await fetch('http://127.0.0.1:'+server.address().port+'/api/plans')).json();
 const plan=plans.find(x=>x.runId===run.id);assert.equal(plan.inputCsvSources.products.originalText,file.text);assert.deepEqual(plan.inputSnapshot.products,rows);dump('S06.json',{file,initial,saved,snapshot,frozen,after,plan});
});
test('S07 stale/incomplete CSV provenance is not promoted to a physical row or current editable identity',()=>{
 const row=seed.products[0],ref={table:'products',row,field:'产品名称',occurrence:{index:0,logicalRow:2,keyCount:1}},source={domain:'candidate:current',inputVersionId:'x',revision:0};
 for(const csv of [{file:'old.csv',canonicalRows:[{...row,'产品名称':'旧'}],lines:[99],sha256:'old'},{file:'missing.csv',canonicalRows:[row],sha256:'x'},{file:'zero.csv',canonicalRows:[row],lines:[0],sha256:'x'}]){
  const result=bindProblemSource({relatedRecords:[ref]},source,undefined,undefined,{products:csv}).relatedRecords[0];assert.equal(result.csv,undefined);assert.ok(result.associationGap);assert.equal(currentRecord(result,seed),null);
 }dump('S07.json',{checked:'mismatched row / missing line / zero line all retain explicit provenance gap'});
});
test('S08 filtered real Worker findings retain original physical rows, freeze history and remain queryable by read-only members',async t=>{
 const f=await checked(t),data=structuredClone(seed);data.calendars[0]['结束分钟']='5';data.calendars[0]['说明']='原日历\r\n换行说明';
 const keys=['orders','routes','times','machines','dependencies','rules','calendars'],files=keys.map(k=>sourceFile(k,data[k],{mixed:true,blank:true}));
 const p=await f.ok('/imports/preview',{revision:0,files});assert.equal(p.valid,true);const saved=await f.ok('/imports/commit',{previewId:p.id});
 const run=await f.ok('/runs',{revision:saved.revision,selection:{orderIds:['B']}});let result;
 for(let i=0;i<500;i++){result=await f.ok('/runs/'+run.id);if(['completed','partial'].includes(result.status))break;assert.ok(!['failed','timed_out'].includes(result.status));await new Promise(r=>setTimeout(r,10));}
 assert.ok(['completed','partial'].includes(result.status));const plans=await f.ok('/plans',undefined,'query'),plan=plans.find(x=>x.runId===run.id),finding=plan.findings.find(f=>f.code==='UNPLANNED / CALENDAR');assert.ok(finding);
 const order=finding.relatedRecords.find(r=>r.table==='orders'),calendar=finding.relatedRecords.find(r=>r.table==='calendars');
 provenance(order,files[0],6,'合格需求');assert.equal(order.origin.occurrence.index,1);assert.equal(order.row['订单编号'],'B');provenance(calendar,files.at(-1),4,'起始分钟');
 assert.deepEqual(finding.taskIds,['B-MIX']);assert.equal(calendar.origin.inputVersionId,run.inputVersionId);
 const before=JSON.parse(f.bytes()),oldInput=await f.ok('/runs/'+run.id+'/inputs');data.calendars[0]['结束分钟']='600';await f.ok('/inputs',{revision:saved.revision,tables:{calendars:data.calendars}});
 const after=JSON.parse(f.bytes());assert.deepEqual(after.plans,before.plans);assert.deepEqual(after.runs,before.runs);assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),oldInput);const reopened=(await f.ok('/plans',undefined,'query')).find(p=>p.id===plan.id);assert.deepEqual(reopened.findings,plan.findings);assert.equal(reopened.inputCsvSources.calendars.originalText,files.at(-1).text);
 dump('S08.json',{files,run,plan,before,after,oldInput,reopened});
});
test('S09 before/after source binding keeps distinct original files and physical positions without crossing domains',()=>{
 // Isolated provenance protocol fixture, not reconstructed historical business data.
 const before=structuredClone(seed),after=structuredClone(seed);after.products[0]['产品名称']='新名称';
 const original=sourceFile('products',before.products,{mixed:true,blank:true,name:'旧原件.csv'}),candidate=sourceFile('products',after.products,{name:'本次原件.csv'}),def=defs.find(d=>d.key==='products');
 const old=inspectSingleCsv(original,def),inspection=inspectSingleCsv(candidate,def),side=(domain,data)=>({domain,inputVersionId:inputHash(data),revision:1,data});
 const refs=[...sourceRefs('products',[before.products[0]],before.products).map(r=>({...r,versionSide:'before',origin:side('current',before)})),...sourceRefs('products',[after.products[0]],after.products).map(r=>({...r,versionSide:'after',origin:side('candidate:current',after)}))];
 const body={issues:[{table:'products',row:2,field:'产品名称',message:'保护示例',relatedRecords:refs}],checkedInputs:{before:side('current',before),after:side('candidate:current',after)}};
 const result=csvProblemEvidence(body,inspection,{data:before,revision:1,csvSources:checkedCsvSources(before,{},old.sources)},defs);
 const [a,b]=result.findings[0].relatedRecords;provenance(a,original,4,'产品名称');provenance(b,candidate,2,'产品名称');assert.equal(a.origin.inputVersionId,inputHash(before));assert.equal(b.origin.inputVersionId,inputHash(after));assert.equal(result.issues[0].row,2);assert.equal(result.issues[0].file,candidate.name);dump('S09.json',{original,candidate,result});
});
