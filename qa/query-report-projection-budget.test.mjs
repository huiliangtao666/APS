import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../server/workbook-model.mjs';
import {createReportSnapshot,LIMITS} from '../server/query-reports/context.mjs';
import {readReport} from '../server/query-reports/index.mjs';
const access={read:true,export:true};
const data=()=>({id:'projection-budget',version:1,fileHash:'synthetic',dayZero:'2026-10-31',tables:{'物料主数据':[{'物料编号':'FG','物料类别':'成品','物料名称':'原物料'}],'配置参数':[]},mapping:{version:'synthetic'}});
const request=d=>({dataset:d,datasetId:d.id,version:d.version});
test('large nonprojected input explanations retain full identity and source values',()=>{
 const d=data();d.parameterThreeWay={explanation:'x'.repeat(LIMITS.projectionBytes)};
 const inputHash=hash(d),s=createReportSnapshot(request(d),access);
 assert.equal(s.identity.inputHash,inputHash);assert.equal(s.input.parameterThreeWay.explanation,d.parameterThreeWay.explanation);
 assert.equal(readReport(s,{view:'bom.materials',fromDate:'2026-11-01',toDateInclusive:'2026-11-01'},access).total,1);
 assert.equal(hash(d),inputHash);
});
test('frozen provenance explanations are distinct from projected results; integrity checks remain',()=>{
 const d=data(),selection={startDay:1,endDay:2,currentDay:1};
 const result={status:'partial',dayZero:d.dayZero,timeUnit:'day',conditions:{...selection,interval:'[start,end)'},source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,mappingHash:hash(d.mapping),parameterHash:hash(d.tables['配置参数'])},tasks:[]};
 const run={id:'synthetic-run',datasetId:d.id,version:d.version,status:'partial',selection,inputHash:hash(d),result,resultHash:hash(result),provenance:{dayZero:d.dayZero,parameterScope:'dataset',effectiveParameters:'y'.repeat(LIMITS.projectionBytes)}};
 const args={frozenInput:d,run,datasetId:d.id,version:d.version};
 const s=createReportSnapshot(args,access);assert.equal(s.identity.resultHash,run.resultHash);assert.equal(s.run.provenance.effectiveParameters.length,LIMITS.projectionBytes);
 assert.throws(()=>createReportSnapshot({...args,run:{...run,inputHash:'corrupt'}},access),e=>e.code==='FROZEN_INPUT_CORRUPT');
});
test('the unchanged 32 MiB projection cap still rejects oversized table sources',()=>{
 const d=data();d.tables['物料主数据'][0]['物料名称']='z'.repeat(LIMITS.projectionBytes);
 assert.throws(()=>createReportSnapshot(request(d),access),e=>e.code==='PROJECTION_TOO_LARGE'&&e.status===413);
 assert.equal(LIMITS.projectionBytes,32*1024*1024);assert.equal(LIMITS.responseBytes,256*1024);
});
