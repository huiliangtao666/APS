// Prepared source tests. Do not run without the original #67 runtime window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {hash,rows} from '../server/workbook-model.mjs';
import {calculateWorkbook,verifyWorkbookPlan} from '../server/workbook-plan.mjs';
import {previewUrgent,demandInput,targetToken,executionLedger,DEMAND_FIELDS} from '../server/urgent-order-input.mjs';
import {freezeUrgent,urgentDemandOrder,verifyUrgent} from '../server/urgent-order-engine.mjs';
import {urgentImpact,queryUrgentImpact,urgentCsv} from '../server/urgent-order-impact.mjs';
import {registerUrgentOrders} from '../server/urgent-order-routes.mjs';
import {workbookTables} from '../server/parameter-workbook-export.mjs';
import {urgentBaseline,planOf,urgentRow,observed,selection} from './urgent-order-fixture.mjs';
const workbook=(values,extra=[])=>workbookTables([['每日需求',DEMAND_FIELDS,values.map(r=>DEMAND_FIELDS.map(f=>r[f]??''))],...extra]);
function withBatch(d,p,row=urgentRow()){p.batches.push({id:'B1',sequence:1,fileHash:'synthetic-urgent',fileName:'synthetic.xlsx',effectiveMinute:observed,demands:[row]});p.revision++;return demandInput(d,p);}
function harness(d,result,{hold=false,terminate=()=>{}}={}){
 const scheduled=new Map();let active;
 let state={datasets:[],records:[],runs:[{id:'BASE',status:result.status,datasetId:d.id,version:d.version,inputHash:hash(d),inputRef:'SOURCE',resultHash:hash(result),result,selection,provenance:{}}]};
 const blobs=new Map([['SOURCE',structuredClone(d)]]),handlers=new Map(),workers=new Map();
 const router=Object.fromEntries(['get','post'].map(method=>[method,(path,...fns)=>handlers.set(method+' '+path,fns.at(-1))]));
 registerUrgentOrders(router,{scheduleTimeout:fn=>{const id=scheduled.size+1;scheduled.set(id,fn);return id;},cancelTimeout:id=>scheduled.delete(id),dataset:()=>structuredClone(d),read:()=>structuredClone(state),write:s=>{state=structuredClone(s);},snapshot:ref=>structuredClone(blobs.get(ref)),persist:value=>{const ref='REF-'+blobs.size;blobs.set(ref,structuredClone(value));return ref;},permission:()=>()=>{},actorKey:()=> 'SYNTHETIC-OWNER',audit:()=>{},workers,workerFactory:input=>{const w=new EventEmitter();active=w;w.terminate=terminate;if(!hold)setImmediate(()=>w.emit('message',{kind:'result',plan:calculateWorkbook(input.workbookData,input.selection)}));return w;}});
 const call=(path,body={},params={})=>{let value,status=200;const res={status:n=>{status=n;return res;},json:x=>{value=x;return res;}};handlers.get('post '+path)({body,params},res,e=>{throw e;});return {status,value};};
 return {call,read:()=>structuredClone(state),workers,scheduled,send:message=>active.emit('message',message),timeout:()=>[...scheduled.values()][0]()};
}
test('UO-02/03/04 demand-only parse, master authority and source rows',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result),before=hash(d);
 const good=previewUrgent(workbook([urgentRow()], [['其他表',['未知业务列'],[['不可覆盖']]]]),d,p,{fileName:'test.xlsx',effectiveTime:'2026-11-01T09:17:00+08:00'});
 assert.equal(good.valid,true);assert.equal(good.demands[0]['需求千克'],'6');assert.equal(good.demands[0]._source.row,3);assert.equal(hash(d),before);
 const invalid=previewUrgent(workbook([{...urgentRow(),'成品编号':'UNKNOWN'},urgentRow()]),d,p,{fileName:'bad.xlsx',effectiveTime:'2026-11-01T09:17:00+08:00'});
 assert.equal(invalid.valid,false);assert.ok(invalid.issues.some(i=>i.field==='成品编号'&&i.row===3));assert.ok(invalid.issues.some(i=>i.field==='需求编号'&&i.row===4));
});
test('UO-05/06/19 atomic commit, retry and concurrent stale preview',()=>{
 const {d,result}=urgentBaseline(),h=harness(d,result),facts={observationTime:'2026-11-01T09:17:00+08:00',tasks:result.tasks.map(t=>({id:t.id,status:'not_started'})),completed:Object.fromEntries(result.demandResults.map(r=>[r.id,0]))};
 const created=h.call('/urgent/plans',{runId:'BASE',expectedResultHash:hash(result),facts});assert.equal(created.status,201);const p=created.value;
 const preview=h.call('/urgent/plans/:id/preview',{targetToken:p.targetToken,fileName:'d.xlsx',fileBase64:workbook([urgentRow()]).toString('base64'),effectiveTime:facts.observationTime},{id:p.id});assert.equal(preview.value.valid,true);
 const request={targetToken:p.targetToken,previewId:preview.value.id,fileHash:preview.value.fileHash},first=h.call('/urgent/plans/:id/commit',request,{id:p.id});assert.equal(first.value.plan.batches.length,1);
 const retry=h.call('/urgent/plans/:id/commit',request,{id:p.id});assert.equal(retry.value.idempotent,true);assert.equal(retry.value.batch.id,first.value.batch.id);assert.equal(h.read().runs[0].inputHash,hash(d));
 assert.equal(h.call('/urgent/plans/:id/facts',{targetToken:p.targetToken,facts},{id:p.id}).status,409);
 const changed=h.call('/urgent/plans/:id/preview',{targetToken:first.value.plan.targetToken,fileName:'changed.xlsx',fileBase64:workbook([{...urgentRow(),'需求箱数':'2'}]).toString('base64'),effectiveTime:facts.observationTime},{id:p.id});assert.equal(changed.value.valid,false);
});
test('UO-08/09/10/11/12 actual main program follows the 09:17 single-operation oracle',()=>{
 const {d,result:base}=urgentBaseline();assert.equal(base.verification.status,'pass');const p=planOf(d,base),input=freezeUrgent(withBatch(d,p),p,base),plan=calculateWorkbook(input,selection),job=id=>plan.tasks.find(t=>t.orderId===id);
 assert.deepEqual([job('U1').start,job('U1').end],[2040,2100]);assert.deepEqual([job('N1').start,job('N1').end],[2100,2160]);assert.deepEqual([job('N2').start,job('N2').end],[2160,2220]);
 const oldN3=base.tasks.find(t=>t.orderId==='N3');assert.equal(job('N3').start,oldN3.start);assert.equal(job('N3').machine,oldN3.machine);assert.equal(verifyWorkbookPlan(input,plan).status,'pass');assert.equal(plan.demandResults.length,4);
 const corrupt=structuredClone(plan);corrupt.tasks.find(t=>t.orderId==='U1').start=1997;assert.equal(verifyWorkbookPlan(input,corrupt).status,'problem');
});
test('UOP06 urgency, customer priority, deadline, effective order and ID remain stable',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);withBatch(d,p);d.urgentOrder={};
 const make=(id,sequence,day=2)=>({...urgentRow(id),'按要求日最晚发运日':String(day),_urgent:{sequence}});
 assert.deepEqual(urgentDemandOrder(d,[make('U2',2),{...make('N',0),_urgent:undefined},make('U1',1),make('U0',1)]).map(r=>r['需求编号']),['U0','U1','U2','N']);
});
test('UO-10/18 preserve completed facts, delivery quantity and historical allocations',()=>{
 const {d,result:base}=urgentBaseline(),p=planOf(d,base);p.facts.observationMinute=base.tasks.find(t=>t.orderId==='N1').end;
 const t=base.tasks.find(t=>t.orderId==='N1');p.facts.tasks.find(f=>f.id===t.id).status='completed';p.facts.completed.N1=6;p.facts.allocations=base.allocations.map((a,index)=>({index,sourceHash:hash(a),quantity:a.need==='N1'&&a.consumer==='N1'?a.quantity:0,kind:a.need==='N1'?'consumed':'none',feedMinute:a.feedMinute}));
 const input=withBatch(d,p);p.batches[0].effectiveMinute=p.facts.observationMinute;const frozen=freezeUrgent(demandInput(d,p),p,base),result=calculateWorkbook(frozen,selection);
 assert.equal(result.demandResults.find(r=>r.id==='N1').scheduledQuantity,0);assert.equal(result.demandResults.find(r=>r.id==='N1').completedQuantity,6);assert.equal(result.tasks.filter(x=>x.orderId==='N1').length,1);assert.equal(result.tasks.find(x=>x.id===t.id).start,t.start);assert.equal(verifyWorkbookPlan(frozen,result).status,'pass');assert.equal(input.id,d.id);
});
test('UO-13 supply reallocation cannot double-use 1000kg or erase original deficits',()=>{
 const {d}=urgentBaseline();d.tables['物料清单'].push({...d.tables['物料清单'][0],'用量关系编号':'BN1','清单版本编号':'BN1','父项编号':'P1'});d.tables['工序投料'].push({'投料映射编号':'FN1','用量关系编号':'BN1','路线工序编号':'RT-P1'});
 d.tables['每日需求'].find(r=>r['需求编号']==='N1')['需求箱数']='100';const base=calculateWorkbook(d,selection),p=planOf(d,base);withBatch(d,p,{...urgentRow(),'需求箱数':'150'});
 const frozen=freezeUrgent(demandInput(d,p),p,base),result=calculateWorkbook(frozen,selection),used=result.allocations.filter(a=>a.supplyId==='inventory:LOT-RM').reduce((n,a)=>n+a.quantity,0);
 assert.ok(used<=1000+1e-6);assert.equal(result.demandResults.find(r=>r.id==='U1').scheduledQuantity,900);assert.equal(result.demandResults.find(r=>r.id==='N1').unplannedQuantity,500);assert.equal(verifyWorkbookPlan(frozen,result).status,'pass');
});
test('UO-14/15 unsupported profile, future event and conflicting ledger fail closed',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);const bad={...d,productionContract:'day'};assert.throws(()=>previewUrgent(workbook([urgentRow()]),bad,p,{effectiveTime:'2026-11-01T09:17:00+08:00'}),e=>e.code==='URGENT_PROFILE_UNSUPPORTED');
 withBatch(d,p);p.batches[0].effectiveMinute=observed+1;assert.throws(()=>freezeUrgent(demandInput(d,p),p,result),e=>e.code==='URGENT_FUTURE_BATCH');
 assert.throws(()=>executionLedger(result,{observationTime:'2026-11-01T09:17:00+08:00',tasks:[],completed:{}}),e=>e.code==='URGENT_FACT_INCOMPLETE');
 const changed=structuredClone(d);changed.effectiveParameters.values=changed.effectiveParameters.values.filter(v=>v.field!=='重排保护时段');p.batches[0].effectiveMinute=observed;assert.throws(()=>freezeUrgent(demandInput(changed,p),p,result),/保护时段/);
});
test('UO-16/17/21 unchanged originals, lineage, all filtered export beyond pagination',()=>{
 const {d,result:base}=urgentBaseline(),p=planOf(d,base),input=freezeUrgent(withBatch(d,p),p,base),result=calculateWorkbook(input,selection),impact=urgentImpact(input,base,result,'NEW');
 assert.equal(impact.tabs.orders.length,3);assert.equal(impact.tabs.orders.find(r=>r.id==='N3').classification,'未变化');assert.equal(impact.stats.affectedOriginalDemands,2);assert.ok(impact.tabs.changes.find(r=>r.demandId==='N1').reasons.some(r=>r.kind==='direct'));
 const page=queryUrgentImpact(impact,{tab:'orders',filters:{demandId:['N1']}},input);assert.equal(page.total,1);assert.match(urgentCsv(page,['demandId']),/NEW/);assert.match(urgentCsv(page,['demandId']),/beforeTasks/);
 const big=structuredClone(impact);big.tabs.orders=Array.from({length:205},(_,i)=>({...impact.tabs.orders[0],id:'D'+i}));assert.equal(queryUrgentImpact(big,{tab:'orders',pageSize:100},input).total,205);assert.equal(urgentCsv(queryUrgentImpact(big,{tab:'orders'},input),['demandId']).split('\r\n').length,206);
 assert.equal(targetToken(p),targetToken(structuredClone(p)));assert.equal(rows(d,'每日需求').length,3);
});

function submitted(h,result){
 const facts={observationTime:'2026-11-01T09:17:00+08:00',tasks:result.tasks.map(t=>({id:t.id,status:'not_started'})),completed:Object.fromEntries(result.demandResults.map(r=>[r.id,0]))};
 const p=h.call('/urgent/plans',{runId:'BASE',expectedResultHash:hash(result),facts}).value;
 const preview=h.call('/urgent/plans/:id/preview',{targetToken:p.targetToken,fileName:'d.xlsx',fileBase64:workbook([urgentRow()]).toString('base64'),effectiveTime:facts.observationTime},{id:p.id}).value;
 return h.call('/urgent/plans/:id/commit',{targetToken:p.targetToken,previewId:preview.id,fileHash:preview.fileHash},{id:p.id}).value.plan;
}
test('UO-15 cancellation, timeout and failure release only this run and retain batches',()=>{
 const {d,result}=urgentBaseline(),h=harness(d,result,{hold:true}),p=submitted(h,result);
 const run=()=>h.call('/urgent/plans/:id/run',{targetToken:p.targetToken},{id:p.id}).value;
 const first=run();assert.equal(first.status,'queued');assert.equal(h.workers.size,1);
 assert.equal(h.call('/urgent/runs/:id/cancel',{}, {id:first.id}).value.status,'cancelled');assert.equal(h.workers.size,0);assert.equal(h.scheduled.size,0);
 const second=run();h.timeout();assert.equal(h.read().runs.find(r=>r.id===second.id).status,'timed_out');assert.equal(h.workers.size,0);assert.equal(h.scheduled.size,0);
 const third=run();h.send({kind:'failure',message:'controlled failure'});assert.equal(h.read().runs.find(r=>r.id===third.id).status,'failed');assert.equal(h.workers.size,0);assert.equal(h.scheduled.size,0);assert.equal(h.read().urgentPlans[0].batches.length,1);
});

test('UO-02/04 empty input, overflow, unsupported day and ignored version sheet',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result),options={fileName:'boundary.xlsx',effectiveTime:'2026-11-01T09:17:00+08:00'};
 const empty=previewUrgent(workbook([]),d,p,options);
 assert.equal(empty.valid,false);assert.deepEqual(empty.demands,[]);
 for(const row of [{...urgentRow(),'需求箱数':'1e308'},{...urgentRow(),'需求日':'0'}]){
  const preview=previewUrgent(workbook([row]),d,p,options);
  assert.equal(preview.valid,false);assert.ok(preview.issues.some(i=>i.row===3));
 }
 // An ignored worksheet has bad CRC deliberately. Demand-only parsing must
 // never decode it, including the workbook version-detection shortcut.
 const bytes=workbook([urgentRow()],[['版本与使用',['说明'],[['ignored-version-marker']]]]);
 const at=bytes.indexOf('ignored-version-marker');assert.ok(at>=0);bytes[at]=88;
 assert.equal(previewUrgent(bytes,d,p,options).valid,true);
});

test('UO-11/17 checker rejects filtered, nonfinite, negative and false-full coverage',()=>{
 const {d,result:base}=urgentBaseline(),p=planOf(d,base),input=freezeUrgent(withBatch(d,p),p,base),plan=calculateWorkbook(input,selection);
 assert.throws(()=>calculateWorkbook(input,{...selection,demandIds:['U1']}),/全部原单/);
 const filtered=structuredClone(plan);filtered.conditions.demandIds=['U1'];
 assert.ok(verifyUrgent(input,filtered).some(i=>i.includes('筛除')));
 for(const value of [NaN,Infinity,-1]){
  const corrupt=structuredClone(plan);corrupt.demandResults[0].scheduledQuantity=value;
  assert.ok(verifyUrgent(input,corrupt).some(i=>i.includes('净量')));
 }
 const corrupt=structuredClone(plan),r=corrupt.demandResults[0];
 r.scheduledQuantity=0;r.unplannedQuantity=r.quantity;r.status='scheduled';
 assert.ok(verifyUrgent(input,corrupt).some(i=>i.includes('状态')));
});

test('UO-17/18 prior urgent tasks stay separate from original-order statistics',()=>{
 const {d,result:base}=urgentBaseline(),p=planOf(d,base),input=freezeUrgent(withBatch(d,p),p,base),first=calculateWorkbook(input,selection),second=structuredClone(first);
 const task=second.tasks.find(t=>t.orderId==='U1');task.start+=1;task.end+=1;
 // This is only a comparison-unit fixture; it does not certify a schedule.
 const impact=urgentImpact(input,first,second,'COMPARE-SECOND');
 assert.equal(impact.tabs.urgent.length,1);assert.equal(impact.tabs.orders.length,3);
 assert.equal(impact.stats.affectedOriginalDemands,0);
 assert.equal(impact.stats.changedOriginalOperations,0);
 assert.ok(impact.tabs.changes.some(c=>c.isUrgent&&c.changed));
});

test('UO-15 cancellation holds the busy gate until exact worker exit',async()=>{
 let released;const pending=new Promise(resolve=>{released=resolve;});
 const {d,result}=urgentBaseline(),h=harness(d,result,{hold:true,terminate:()=>pending}),p=submitted(h,result);
 const first=h.call('/urgent/plans/:id/run',{targetToken:p.targetToken},{id:p.id}).value;
 assert.equal(h.call('/urgent/runs/:id/cancel',{}, {id:first.id}).value.pendingWorker,true);
 assert.equal(h.workers.size,1);assert.equal(h.scheduled.size,0);
 assert.equal(h.call('/urgent/plans/:id/run',{targetToken:p.targetToken},{id:p.id}).status,429);
 released();await pending;await Promise.resolve();assert.equal(h.workers.size,0);
 assert.equal(h.read().urgentPlans[0].batches.length,1);
});

test('UO-15 unknown completion status and null worker message cannot complete a run',()=>{
 const {d,result}=urgentBaseline(),h=harness(d,result,{hold:true}),p=submitted(h,result);
 for(const message of [{kind:'result',plan:{status:'unknown'}},null]){
  const run=h.call('/urgent/plans/:id/run',{targetToken:p.targetToken},{id:p.id}).value;
  h.send(message);assert.equal(h.read().runs.find(r=>r.id===run.id).status,'failed');
  assert.equal(h.workers.size,0);assert.equal(h.scheduled.size,0);
 }
});

test('UO-19/22 explicit same-version configuration invalidates old preview tokens',()=>{
 const {d,result}=urgentBaseline(),h=harness(d,result,{hold:true}),p=submitted(h,result),inputHash=h.read().runs.find(r=>r.id==='BASE').inputHash;
 const changed=h.call('/urgent/plans/:id/configuration',{targetToken:p.targetToken,version:d.version,parameterRevision:0},{id:p.id});
 assert.equal(changed.status,200);assert.notEqual(changed.value.targetToken,p.targetToken);
 assert.equal(changed.value.revision,p.revision+1);
 assert.equal(h.call('/urgent/plans/:id/run',{targetToken:p.targetToken},{id:p.id}).status,409);
 assert.equal(h.read().runs.find(r=>r.id==='BASE').inputHash,inputHash);
});
