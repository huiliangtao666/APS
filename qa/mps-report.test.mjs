import test from 'node:test';
import assert from 'node:assert/strict';
import {createMpsReport,MPS_METRICS,mpsSelected} from '../server/mps-report.mjs';
import {mpsReportDomain,mpsExcelChunks} from '../server/mps-report-domain.mjs';
import {workbookQueryContext,workbookQueryBoundContext} from '../server/workbook-query-report-context.mjs';
import {sourceHash} from '../server/query-reports/source-copy.mjs';
import {mpsFixture,mpsRun,mpsContext} from './mps-report-fixture.mjs';
const query={fromDate:'2026-11-01',toDateInclusive:'2026-11-14',filters:{}};
const cell=(c,id,key,date)=>c.metric(c.graph.materials.get(id),key,date);
test('MPS-01/20/21: full five-source read-only surface and 16 metrics; no cross-SKU sum',()=>{
 const v=mpsContext(),before=sourceHash(v),c=createMpsReport(v,query);
 assert.equal(MPS_METRICS.length,16);for(const t of ['demands','inventory','incoming','manufacturing','suggestions'])assert.ok(c.details[t].length,t);
 assert.equal(c.records.length,3);assert.equal(c.records.find(r=>r.id==='PK1').values.unit,'个');assert.equal(c.records.find(r=>r.id==='FG1').values.snapshotPhysical,100);
 assert.equal(c.records.find(r=>r.id==='FG1').values.queryOpening.value,null);assert.equal(sourceHash(v),before);
});
test('MPS-03/05: net demand uses factory date, preserves customer date; no duplicated identity',()=>{
 const v=mpsContext(),c=createMpsReport(v,query),d=c.details.demands[0];assert.equal(d.values.original,100);assert.equal(d.values.quantity,80);assert.equal(d.values.needDate,'2026-11-11');assert.equal(d.values.customerDate,'2026-11-12');
 assert.equal(cell(c,'FG1','independent','2026-11-11').value,80);assert.equal(cell(c,'FG1','independent','2026-11-12').value,0);
 v.input.tables['每日需求'].push({...v.input.tables['每日需求'][0]});assert.equal(cell(createMpsReport(v,query),'FG1','independent','2026-11-11').value,null);
});
test('MPS-02/03/19: explicit frozen context rejects mismatch and never reads current P',()=>{
 const input=mpsFixture(),run=mpsRun(input),current=structuredClone(input);current.version=2;current.tables['物料主数据'][0]['安全库存量']='999';
 const ctx={read:()=>({runs:[run]}),snapshot:()=>input,dataset:()=>current};
 const v=workbookQueryContext(ctx,{datasetId:input.id,version:1,runId:run.id});assert.equal(v.input.version,1);assert.equal(v.input.tables['物料主数据'][0]['安全库存量'],'50');
 assert.throws(()=>workbookQueryContext(ctx,{datasetId:input.id,version:2,runId:run.id}),e=>e.code==='CONTEXT_MISMATCH');assert.throws(()=>workbookQueryBoundContext(ctx,{...v.identity,inputHash:'changed'}),e=>e.code==='CONTEXT_MISMATCH');
 input.tables['每日需求'].push({需求编号:'FUTURE',成品编号:'FG1',需求日:'13',按要求日最晚发运日:'12',需求千克:'100',已发运千克:'0'});
 run.inputHash=sourceHash(input);const c=createMpsReport(mpsContext(input,run),query);assert.equal(c.details.demands.filter(r=>r.values.kind==='独立需求').length,1);
});
test('MPS-04/22: effective BOM expands display only, retains two-parent consumption',()=>{
 const v=mpsContext(),c=createMpsReport(v,{...query,filters:{materialId:{mode:'VALUES',values:['FG1']}},includeBom:true});
 assert.deepEqual(c.records.map(r=>r.id),['FG1','RM1','PK1']);assert.equal(cell(c,'RM1','dependent','2026-11-03').value,70);
 const empty=createMpsReport(v,{...query,filters:{materialId:{mode:'NONE'}},includeBom:true});assert.equal(empty.records.length,0);
 assert.equal(mpsSelected({mode:'ALL',exclude:['hidden']},'hidden'),false);assert.equal(mpsSelected({mode:'ALL'},'hidden'),true);
});
test('MPS-06/10: partial receipt uses net remainder; arrival and release are separate observations',()=>{
 const v=mpsContext(),c=createMpsReport(v,query);assert.equal(cell(c,'RM1','arrival','2026-11-02').value,100);assert.equal(cell(c,'RM1','purchase','2026-11-02').value,0);assert.equal(cell(c,'RM1','purchase','2026-11-03').value,100);
 delete v.input.tables['既有采购在途'][0]['已收数量'];const incomplete=createMpsReport(v,query);assert.equal(cell(incomplete,'RM1','arrival','2026-11-02').value,null);assert.equal(incomplete.details.incoming[0].values.ordered,120);
});
test('MPS-07/08/16: final operation counted once; WIP exclusive; no invented release',()=>{
 const d=mpsFixture(),v=mpsContext(d,mpsRun(d)),c=createMpsReport(v,query),r=c.details.manufacturing.find(r=>r.values.kind==='新增主计划');
 assert.equal(r.values.quantity,100);assert.equal(r.values.completionDate,'2026-11-02');assert.equal(r.values.completionTime,'2026-11-02T23:57:00+08:00');assert.equal(r.values.availableDate,null);
 assert.equal(c.details.manufacturing.filter(r=>r.id==='production:W1').length,0);assert.equal(cell(c,'FG1','mps','2026-11-02').value,null);
 assert.equal(cell(c,'RM1','dependent','2026-11-02').value,null);assert.ok(c.details.demands.some(r=>r.values.feedTime==='2026-11-02T23:59:00+08:00'));
});
test('MPS-09/10: suggestions stay separate from supply; adopted suggestion not counted again',()=>{
 const d=mpsFixture(),run=mpsRun(d),v=mpsContext(d,run),c=createMpsReport(v,query);assert.equal(cell(c,'RM1','suggestBuy','2026-11-03').value,5000);assert.equal(cell(c,'RM1','purchase','2026-11-03').value,100);assert.equal(cell(c,'RM1','balance','2026-11-03').value,null);
 d.drafts=[{id:'ADOPT',status:'adopted',sourceRun:run.id,suggestionId:'SH1'}];run.inputHash=sourceHash(d);const adopted=createMpsReport(mpsContext(d,run),query);assert.equal(cell(adopted,'RM1','suggestBuy','2026-11-03').value,0);assert.match(adopted.details.suggestions[0].values.status,/已转正式/);
});
test('MPS-11/12/13/14/15/17/18/24: PAB unruled, nonzero occupancy and expiry stay explicit',()=>{
 const c=createMpsReport(mpsContext(),query),stock=c.details.inventory[0];assert.equal(stock.values.free,50);assert.match(stock.values.condition,/占用归属待核对/);
 for(const key of ['opening','balance','shortage','safetyGap','expiry']){const value=cell(c,'FG1',key,'2026-11-03');assert.equal(value.value,null);assert.ok(value.reason);}
 assert.match(c.meta.note,/时点/);assert.equal(c.meta.ATP,'本期不提供');assert.equal(c.meta.formulaStatus,'PENDING_RULING');
});
test('MPS-19/20: missing source vs true zero vs NA vs uncovered remain different',()=>{
 const v=mpsContext(),c=createMpsReport(v,query);assert.equal(cell(c,'PK1','independent','2026-11-02').value,0);assert.equal(cell(c,'PK1','mps','2026-11-02').state,'NOT_APPLICABLE');assert.equal(cell(c,'FG1','mps','2026-11-02').state,'NOT_COVERED');
 delete v.input.tables['每日需求'];assert.equal(cell(createMpsReport(v,query),'FG1','independent','2026-11-02').state,'NOT_PROVIDED');
 const d=mpsFixture(),f=createMpsReport(mpsContext(d,mpsRun(d)),{...query,toDateInclusive:'2026-11-20'});assert.equal(cell(f,'FG1','completion','2026-11-20').state,'NOT_COVERED');
});
test('MPS-22/23: 1203 candidates, full filtered export, same identity and selected columns',()=>{
 const d=mpsFixture();d.tables['物料主数据']=Array.from({length:1203},(_,i)=>({...d.tables['物料主数据'][1],物料编号:'M'+i,物料名称:'物料'+i}));const v=mpsContext(d),q={...query,pageSize:100};
 const page=mpsReportDomain.query(v,q);assert.equal(page.total,1203);assert.ok(page.records.length<=100);assert.ok(page.nextOffset>0);
 const options=mpsReportDomain.options(v,{...q,field:'materialId'});assert.equal(options.total,1203);assert.equal(options.items.length,100);
 const csv=[...mpsReportDomain.export(v,{...q,queryFingerprint:page.queryFingerprint,columns:['id','unit'],format:'csv'}).chunks].join('');assert.match(csv,/M1202/);assert.match(csv,/同源身份/);assert.match(csv,/完整来源/);
 const xml=[...mpsReportDomain.export(v,{...q,filters:{materialId:{mode:'VALUES',values:['M1202']}},columns:['id'],format:'excel'}).chunks].join('');assert.match(xml,/Excel.Sheet/);assert.match(xml,/M1202/);
 assert.throws(()=>mpsReportDomain.export(v,{...q,queryFingerprint:'stale',format:'csv'}),e=>e.code==='MPS_QUERY_CHANGED');
});
test('MPS-22: single material matrix independent of overview paging; source supports full continuation',()=>{
 const v=mpsContext(),q={...query,materialId:'FG1',pageSize:100,table:'inventory'};const matrix=mpsReportDomain.matrix(v,q);assert.equal(matrix.records.length,16);
 const detail=mpsReportDomain.detail(v,q);const source=mpsReportDomain.source(v,{...q,id:detail.records[0].id});assert.match(source.text,/库存批次编号/);assert.match(source.text,/fingerprint/);
 assert.throws(()=>mpsReportDomain.query(v,{...q,pageSize:20}),e=>e.code==='MPS_PAGE_INVALID');assert.throws(()=>mpsReportDomain.matrix(v,{...q,filters:{materialId:{mode:'NONE'}}}),e=>e.code==='MPS_MATERIAL_NOT_SELECTED');
});
test('MPS-24: indexed safety lookup retains zero, unknown and independent frozen/input values over all dates',()=>{
 const d=mpsFixture();d.tables['物料主数据'][0]['安全库存量']='0';
 const frozen=mpsContext(d,mpsRun(d)),report=createMpsReport(frozen,query);
 for(const date of report.days){
  assert.equal(cell(report,'FG1','safety',date).value,0);
  assert.equal(cell(report,'RM1','safety',date).value,10);
  assert.equal(cell(report,'PK1','safety',date).state,'PENDING_REVIEW');
 }
 const later=structuredClone(d);later.tables['物料主数据'][0]['安全库存量']='999';
 const current=createMpsReport(mpsContext(later),query);
 assert.equal(cell(current,'FG1','safety','2026-11-03').value,999);
 assert.equal(cell(report,'FG1','safety','2026-11-03').value,0);
});

test('MPS-23: Excel 2003 XML splits large exports without dropping the 65,537th row',()=>{
 function* rows(){for(let i=0;i<65537;i++)yield ['来源',i];}
 const counts=[];let seen=0,last=-1;
 for(const chunk of mpsExcelChunks(rows())){
  if(chunk.startsWith('<Worksheet'))counts.push(0);
  if(chunk.startsWith('<Row>')){counts[counts.length-1]++;seen++;assert.ok(++last<65537);if(seen===65537)assert.match(chunk,/>65536<\/Data>/);}
 }
 assert.deepEqual(counts,[60000,5537]);assert.equal(seen,65537);assert.ok(counts.every(n=>n<=65536));
});
