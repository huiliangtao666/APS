import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {workbookQueryContext} from '../server/workbook-query-report-context.mjs';
import {mpsReportDomain} from '../server/mps-report-domain.mjs';

const directory=process.argv[2];if(!directory)throw Error('Explicit preserved workbook state directory required');
const statePath=path.join(directory,'state.json'),stateBytes=fs.readFileSync(statePath),state=JSON.parse(stateBytes);
const runs=state.runs.filter(r=>['completed','partial'].includes(r.status)&&r.result);
assert.ok(runs.length,'No original successful run: do not compute a replacement');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const context={read:()=>state,snapshot:ref=>{
 const raw=fs.readFileSync(path.join(directory,ref));return JSON.parse(ref.endsWith('.gz')?zlib.gunzipSync(raw):raw);
},dataset:()=>{throw Error('REAL_SOURCE_TEST_CURRENT_FALLBACK_FORBIDDEN');}};
const results=[];
for(const run of runs){
 const v=workbookQueryContext(context,{datasetId:run.datasetId,version:run.version,runId:run.id},run.actor||''),catalog=mpsReportDomain.catalog(v);
 const q={fromDate:catalog.fromDate,toDateInclusive:catalog.toDateInclusive,pageSize:100,filters:{}};
 const page=mpsReportDomain.query(v,q);assert.ok(page.records.length);assert.equal(page.meta.identity.inputHash,run.inputHash);
 const materialId=page.records[0].id,matrix=mpsReportDomain.matrix(v,{...q,materialId,queryFingerprint:page.queryFingerprint});assert.equal(matrix.records.length,16);
 const detailCounts={};for(const table of Object.keys(catalog.tables)){
  const detail=mpsReportDomain.detail(v,{...q,materialId,table,queryFingerprint:page.queryFingerprint});detailCounts[table]=detail.total;
  if(detail.records.length){const source=mpsReportDomain.source(v,{...q,materialId,table,id:detail.records[0].id,queryFingerprint:page.queryFingerprint});assert.ok(source.text);}
 }
 const exportHash=createHash('sha256');let exportBytes=0;
 for(const chunk of mpsReportDomain.export(v,{...q,format:'csv',queryFingerprint:page.queryFingerprint,columns:catalog.columns.map(c=>c.key)}).chunks){exportHash.update(chunk);exportBytes+=Buffer.byteLength(chunk);}
 results.push({runId:run.id,version:run.version,inputHash:run.inputHash,resultHash:run.resultHash,queryFingerprint:page.queryFingerprint,materials:page.total,materialId,detailCounts,exportBytes,exportHash:exportHash.digest('hex'),firstOverview:page.records[0],matrixStates:[...new Set(matrix.records.flatMap(r=>Object.values(r.values).filter(v=>v&&typeof v==='object').map(v=>v.state)))]});
}
assert.equal(digest(fs.readFileSync(statePath)),digest(stateBytes),'Original state changed');
console.log(JSON.stringify({nature:'REAL_PRESERVED_FROZEN_SOURCE_MODULE_ONLY_NOT_UI_HTTP_UAT',results,stateSha256:digest(stateBytes),maxRSSKiB:process.resourceUsage().maxRSS},null,2));
