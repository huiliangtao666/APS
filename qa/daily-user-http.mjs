// Finite developer HTTP smoke. It does not provide a user preview or sign UI/UAT.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {dailyFixture,branchBody} from './daily-fixture.mjs';
import {hash} from '../server/workbook-model.mjs';
const root='/workspace/apps/aps-daily-integration-runtime/qa/issue170-user',tag=randomUUID();
const state=path.join(root,'state',tag),uploads=path.join(root,'uploads',tag);
const directory=path.join(state,'workbooks');fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(uploads,{recursive:true});
const input=dailyFixture(),ref='opening.json.gz';
fs.writeFileSync(path.join(directory,ref),gzipSync(JSON.stringify(input)));
const opening={datasets:[{id:input.id,versions:[{...input,ref}],imports:[]}],previews:[],runs:[],records:[]};
fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify(opening));
fs.mkdirSync(path.join(root,'seed',tag,'workbooks'),{recursive:true});
for(const name of ['opening.json.gz','state.json'])fs.copyFileSync(path.join(directory,name),path.join(root,'seed',tag,'workbooks',name));
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
let server,requests=0,workers=0,starts=0,branch;
const checks=[];
const record=(id,detail)=>{checks.push({id,status:'PASS',detail});console.log(JSON.stringify({kind:'user-http-check',id,detail}));};
async function api(p,body,status=200){
 assert.ok(++requests<=120,'this smoke HTTP sub-budget');
 const response=await fetch(`http://127.0.0.1:${port}/api${p}`,{headers:{'Content-Type':'application/json','X-APS-Request':'workbench'},...(body?{method:'POST',body:JSON.stringify({reason:'EXPLICIT_MOCK #170 scoped developer self-test',...body})}:{}),signal:AbortSignal.timeout(60000)});
 const result=await response.json();assert.equal(response.status,status,p+' '+JSON.stringify(result).slice(0,2500));return result;
}
async function start(){
 assert.ok(++starts<=2,'initial start + one persistence reopen');
 server=spawn(process.execPath,['--max-old-space-size=384','dist/server.mjs'],{env:{...process.env,NODE_ENV:'production',API_PORT:String(port),PRAETOR_APP_DATA_DIR:state,PRAETOR_APP_UPLOADS_DIR:uploads},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>process.stdout.write(b));server.stderr.on('data',b=>process.stderr.write(b));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server start timeout')),10000);server.stdout.on('data',b=>{if(b.toString().includes('api listening')){clearTimeout(timer);resolve();}});server.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});});
}
async function stop(){if(!server||server.exitCode!==null)return;const ended=once(server,'exit');server.kill('SIGTERM');await ended;}
const refresh=async()=>branch=await api('/workbooks/daily/DAILY170');
async function action(name,body={},status=200){const request={requestId:randomUUID(),expectedRevision:branch.revision,...body},result=await api('/workbooks/daily/DAILY170/'+name,request,status);if(status===200)branch.revision=result.revision;return {request,result};}
const confirm=async()=>{for(const domain of ['demand','inventory','production','replenishment'])await action('confirm',{domain,unchanged:true,source:{kind:'EXPLICIT_LOCAL_MOCK'}});};
async function accept(domain,type,data){
 const fact={id:randomUUID(),type,data,source:{kind:'EXPLICIT_LOCAL_MOCK'},occurredDate:branch.date,knownDate:branch.date,effectiveDate:branch.date};
 const p=await api('/workbooks/daily/DAILY170/preview',{domain,channel:'online',facts:[fact]});await action('accept',{previewId:p.id});await refresh();
}
try{
 await start();await api('/session');
 branch=await api('/workbooks/daily/branches',{...branchBody,datasetId:input.id},201);
 assert.deepEqual(branch.balances.map(r=>r.physical),[0,0,85,70,1,1500]);record('opening-copy',{balances:branch.balances});
 const before=hash(fs.readFileSync(path.join(directory,'state.json')));await action('close',{noExecutionReason:'must reject without confirmations'},422);assert.equal(hash(fs.readFileSync(path.join(directory,'state.json'))),before);record('four-input-confirmation-gate',{atomic:true});
 await confirm();const d=await api('/workbooks/datasets/'+input.id),selection={startDay:1,currentDay:1,endDay:15};
 const ready=await api('/workbooks/datasets/'+input.id+'/readiness',{version:d.version,selection,parameterScope:'dataset',solver:'basic'});assert.equal(ready.ready,true,JSON.stringify(ready));
 let run=await api('/workbooks/datasets/'+input.id+'/run',{version:d.version,currentVersion:true,readinessToken:ready.token,selection,parameterScope:'dataset',solver:'basic'},202);workers++;
 const began=Date.now();while(['queued','running','cancelling'].includes(run.status)){assert.ok(Date.now()-began<60000,'Worker60s');await new Promise(r=>setTimeout(r,100));run=await api('/workbooks/runs/'+run.id);}
 assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));assert.equal(run.result.verification.status,'pass');
 await refresh();await action('plan',{runId:run.id,action:'save'});await action('plan',{runId:run.id,action:'adopt'});await refresh();
 assert.equal(branch.balances.find(r=>r.materialId==='RM101').physical,85);record('basic-plan-save-adopt-no-actual',{runId:run.id,status:run.status,inputHash:run.inputHash,resultHash:run.resultHash});
 const task=branch.state.tasks.find(t=>t.materialId==='FG101'&&t.limit>=20);assert.ok(task);
 for(const row of task.recipe){const lot=branch.state.lots.find(l=>l.materialId===row.materialId&&l.qualified>0);await accept('production','consume',{taskId:task.id,lotId:lot.id,cumulative:20*row.perOutput});}
 await accept('production','output',{taskId:task.id,lotId:'USER-FG20',cumulative:20,location:'LOC',expiresDate:'2026-12-01',quality:'qualified'});
 await accept('demand','ship',{demandId:'N1',lotId:'USER-FG20',cumulative:20});
 assert.deepEqual(branch.balances.filter(r=>['RM101','RM102','RM103','PM101'].includes(r.materialId)).map(r=>r.physical),[68,66,1,1300]);record('actual-consume-output-shipment',{physical:[68,66,1,1300],shipped:20});
 await accept('replenishment','purchase-draft',{id:'USER-PO100',materialId:'RM101',quantity:100,moq:50,multiple:50,supplierId:'S',relationId:'SUP-RM101',dueDate:'2026-11-02',receipt:{location:'LOC',expiresDate:'2026-12-01',quality:'pending',disposition:'explicit mock inspection'}});
 await accept('replenishment','purchase-issue',{id:'USER-PO100'});await accept('replenishment','receive',{id:'USER-PO100',quantity:30,receiptId:'USER-RCPT30'});
 const raw=branch.balances.find(r=>r.materialId==='RM101');assert.equal(raw.physical,98);assert.equal(raw.available,68);assert.equal(raw.transit,70);record('partial-receipt-pending-not-available',{physical:98,available:68,open:70});
 await confirm();const close=await action('close');await refresh();assert.equal(branch.date,'2026-11-02');
 const history=await api('/workbooks/daily/DAILY170/history/2026-11-01');assert.equal(history.state.purchases[0].received,30);assert.equal(history.balances.find(r=>r.materialId==='RM101').physical,98);assert.equal(history.balances.find(r=>r.materialId==='RM101').available,68);const frozenHash=hash(history);
 const mps=await api('/workbooks/mps-report/context?request='+encodeURIComponent(JSON.stringify({datasetId:input.id,version:(await api('/workbooks/datasets/'+input.id)).version})));assert.equal(mps.daily.date,'2026-11-02');
 record('close-history-daily-report',{receipt:close.request.requestId,day:branch.date,historyHash:frozenHash,mpsDailyDate:mps.daily.date});
 await stop();await start();await refresh();assert.equal(branch.date,'2026-11-02');assert.equal(hash(await api('/workbooks/daily/DAILY170/history/2026-11-01')),frozenHash);assert.equal((await api('/workbooks/daily/DAILY170/operations/'+close.request.requestId)).committed,true);const replay=await api('/workbooks/daily/DAILY170/close',close.request);assert.equal(replay.replayed,true);
 record('reopen-durable-history-and-idempotent-receipt',{historyHash:frozenHash,receipt:close.request.requestId});
 console.log(JSON.stringify({kind:'USER-HTTP-RESULT',status:'PASS',checks,requests,workers,starts,state,uploads,seed:path.join(root,'seed',tag),browser:'NOT_EXECUTED_NO_ISOLATED_PREVIEW',notUserEntry:true}));
}finally{
 await stop();const saved=JSON.parse(fs.readFileSync(path.join(directory,'state.json')));
 console.log(JSON.stringify({kind:'user-http-release',requests,workers,starts,owned:0,pending:saved.runs.filter(r=>['queued','running','cancelling'].includes(r.status)).length,state,uploads}));
}
