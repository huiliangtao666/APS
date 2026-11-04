// Same-input finite localhost benchmark. Explicit scratch copy; no solver or public listener.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';import {createRequire} from 'node:module';
const [source,stateDir,datasetId,versionArg,runId,outFile]=process.argv.slice(2);
if(!outFile)throw Error('Usage: node qa/data-read-benchmark.mjs SOURCE_ROOT WORKBOOK_STATE_DIR DATASET_ID VERSION RUN_ID OUTPUT_JSON');
const label=path.basename(outFile,'.json'),started=performance.now(),out={label,source,node:process.version,coldDefinition:'first access in a fresh router/process cache; OS cache NOT flushed',warmDefinition:'second/third identical HTTP reads on same router',requests:[],segments:{}};
const load=n=>import(pathToFileURL(path.join(source,n)));const require=createRequire(path.join(source,'package.json'));const express=require('express');
const {createWorkbookRouter}=await load('server/workbook-router.mjs');const {sourceHash,copyReportSource}=await load('server/query-reports/source-copy.mjs');
const {workbookQueryContext}=await load('server/workbook-query-report-context.mjs');const {workbookReportDomain}=await load('server/workbook-query-report-adapter.mjs');
const realState=JSON.parse(fs.readFileSync(path.join(stateDir,'state.json'))),set=realState.datasets.find(d=>d.id===datasetId),version=Number(versionArg),meta=set?.parameterWorkspaces?.[version]||set?.versions.find(v=>v.version===version),run=realState.runs.find(r=>r.id===runId);
if(!meta||!run||run.datasetId!==datasetId||run.version!==version)throw Error('Explicit dataset/version/run required');
const selected={meta,run};
const sha=b=>createHash('sha256').update(b).digest('hex');
function segment(n,fn){const start=performance.now(),result=fn();out.segments[n]=performance.now()-start;return result;}
const compressed=segment('snapshotDiskRead',()=>fs.readFileSync(path.join(stateDir,selected.meta.ref)));const raw=segment('gunzip',()=>gunzipSync(compressed));const input=segment('parse',()=>JSON.parse(raw));
out.input={datasetId:input.id,version:input.version,fileHash:input.fileHash,bytes:raw.length,gzipBytes:compressed.length,gzipSha256:sha(compressed),rawSha256:sha(raw),tables:Object.fromEntries(Object.entries(input.tables).map(([k,v])=>[k,v.length])),runId:selected.run.id,inputHash:selected.run.inputHash,resultHash:selected.run.resultHash,parameterHash:selected.run.provenance?.parameterHash,mappingHash:selected.run.provenance?.mappingHash};
const original=fs.readFileSync(path.join(stateDir,input.fileHash+'.xlsx'));out.input.originalXlsxBytes=original.length;out.input.originalXlsxSha256=sha(original);
segment('sourceHash',()=>sourceHash(input));segment('copy',()=>copyReportSource(input));
const ctx={read:()=>realState,dataset:()=>input,snapshot:ref=>JSON.parse(gunzipSync(fs.readFileSync(path.join(stateDir,ref)))),actorKey:()=> 'issue147-benchmark'};
let value=segment('queryContext',()=>workbookQueryContext(ctx,{datasetId:input.id,version:input.version},'issue147-benchmark'));const cat=segment('queryCatalogProjection',()=>workbookReportDomain.catalog(value));
const query={view:'demand.details',fromDate:cat.fromDate,toDateInclusive:cat.toDateInclusive,bomAsOfDate:cat.fromDate,knownAsOfDate:cat.fromDate,pageSize:100,identity:value.identity};
const result=segment('businessProjection',()=>workbookReportDomain.query(value,query));segment('querySerialization',()=>JSON.stringify(result));
// Router receives a new isolated directory containing byte-identical original
// state and compressed snapshots; all mutations, if any, remain in this scratch.
const temp=fs.mkdtempSync('/tmp/aps147-'+label+'-');fs.mkdirSync(temp+'/workbooks');for(const name of fs.readdirSync(stateDir))if(fs.statSync(path.join(stateDir,name)).isFile())fs.copyFileSync(path.join(stateDir,name),temp+'/workbooks/'+name);
const app=express();app.use(express.json());app.use('/api/workbook',createWorkbookRouter({dataDir:temp,permission:()=> (_req,_res,next)=>next(),actorKey:()=> 'issue147-benchmark',requestId:()=> 'issue147',workerFactory:()=>{throw Error('No solver permitted');}}));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const base='http://127.0.0.1:'+server.address().port+'/api/workbook';
const originalRead=fs.readFileSync;let io=null;
fs.readFileSync=function(file,...args){const begin=performance.now(),value=originalRead.call(fs,file,...args);if(io){io.reads++;io.bytes+=Buffer.isBuffer(value)?value.length:Buffer.byteLength(value);io.ms+=performance.now()-begin;if(String(file).endsWith('.gz'))io.snapshotReads++;}return value;};
async function get(name,url){io={reads:0,bytes:0,ms:0,snapshotReads:0};const start=performance.now(),r=await fetch(base+url),body=Buffer.from(await r.arrayBuffer());const row={name,status:r.status,ms:performance.now()-start,bytes:body.length,sha256:sha(body),requestBytes:Buffer.byteLength(url),memory:process.memoryUsage(),io:{...io}};io=null;out.requests.push(row);if(r.status!==200)throw Error(name+' '+r.status+' '+body.toString().slice(0,400));return JSON.parse(body);}
try{
 let identity;
 for(let i=0;i<3;i++){
  const suffix='?version='+input.version;
  await get('open-'+i,'/datasets/'+input.id+suffix);
  await get('parameters-'+i,'/datasets/'+input.id+'/parameters'+suffix+'&offset=0&limit=25');
  const c=await get('context-'+i,'/query-reports/context?request='+encodeURIComponent(JSON.stringify({datasetId:input.id,version:input.version})));identity=c.identity;
  await get('query-'+i,'/query-reports/query?request='+encodeURIComponent(JSON.stringify({...query,identity})));
  await get('page-'+i,'/query-reports/query?request='+encodeURIComponent(JSON.stringify({...query,identity,offset:100})));
 }
 for(let i=0;i<3;i++)await get('frozen-open-'+i,'/runs/'+selected.run.id);
 out.peakRSS=process.resourceUsage().maxRSS*1024;out.memory=process.memoryUsage();out.elapsedMs=performance.now()-started;fs.writeFileSync(outFile,JSON.stringify(out,null,2));console.log(JSON.stringify({label,output:outFile,requests:out.requests.length,peakRSS:out.peakRSS,elapsedMs:out.elapsedMs}));
}finally{fs.readFileSync=originalRead;await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
