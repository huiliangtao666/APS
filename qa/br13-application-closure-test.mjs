import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {scenario,configure,tasks,planOf,policy,at} from './br13-application-closure-fixture.mjs';
import {assessApplicationChangeovers as check,verifyApplicationChangeovers,cleaningHistoryTransition} from '../src/lib/changeover-application.mjs';
import {calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {fixture} from './fr027-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';
const cond={ruleEvaluationAt:at,startMinute:0,endMinute:200};
const dump=(id,x)=>{if(process.env.BR13_OUT){fs.mkdirSync(process.env.BR13_OUT,{recursive:true});fs.writeFileSync(process.env.BR13_OUT+'/'+id+'.json',JSON.stringify(x,null,2));}};
const codes=x=>x.findings.map(f=>f.code+' '+f.message).join('\n');
const expectedWindows=(d,p)=>{ // independent literal interval scan, no application/domain imports
 const ins=p.changeoverAssessment.domain.inspections;
 for(const i of ins){const a=p.tasks.find(t=>t.id===i.taskIds[0]),b=p.tasks.find(t=>t.id===i.taskIds[1]),pol=JSON.parse(d.rules.find(r=>r['规则编号']==='CLEANING')['参数JSON']).policies.find(q=>q.from===a.productId&&q.to===b.productId);assert.ok(pol&&!pol.prohibited);assert.equal(i.start,a.end);assert.equal(i.end,a.end+pol.durationMinutes);assert.equal(i.readyAt,a.end+pol.durationMinutes+pol.validation.waitMinutes);assert.ok(b.start>=i.readyAt);}
 for(let minute=0;minute<200;minute++){const people=p.changeoverAssessment.groupEvidence.filter(r=>r.start<=minute&&r.end>minute);assert.ok(people.reduce((n,r)=>n+r.quantity,0)<=2);const machine=p.resourceReservations.filter(r=>r.type==='设备'&&r.start<=minute&&r.end>minute).reduce((n,r)=>n+Number(r.quantity),0)+p.changeoverAssessment.acceptedOccupations.filter(r=>r.kind==='resource'&&r.resourceId==='machine:M'&&r.start<=minute&&r.end>minute).reduce((n,r)=>n+r.quantity,0);assert.ok(machine<=1);}
};
test('direction, asymmetric duration/wait, prohibited and boundary wait independently checked',()=>{
 const d=scenario();for(const ab of [true,false]){const p=planOf(tasks(ab)),x=check(p,d,cond);assert.equal(x.status,'pass',codes(x));assert.deepEqual(x.domain.inspections.map(i=>[i.start,i.end,i.readyAt]),ab?[[10,20,25]]:[[10,14,16]]);}
 let p=planOf();p.tasks[1].start=24;assert.match(codes(check(p,d,cond)),/VALIDATION_WAIT/);
 configure(d,c=>c.policies[0].prohibited=true);assert.match(codes(check(planOf(),d,cond)),/PROHIBITED/);dump('directions',{data:d,result:check(planOf(),d,cond)});
});
test('completed historical cleaning is frozen source evidence, zero future debit, not recalculated at new policy duration',()=>{
 const d=scenario();configure(d,c=>{c.policies[0].durationMinutes=90;c.completedTransitions=[{id:'MOCK:H1',machineId:'M',fromTaskId:'A-OP',toTaskId:'B-OP',from:'A',to:'B',start:10,end:20,readyAt:25,observedAt:40,source:{id:'MOCK:cleaning-log:1',version:'historical-v1'}}];});
 const p=planOf(),x=check(p,d,{...cond,startMinute:40});assert.equal(x.status,'pass',codes(x));assert.equal(x.domain.requiredOccupations.length,0);assert.equal(x.historyEvidence[0].futureDebit,false);assert.equal(x.historyEvidence[0].end,20);assert.deepEqual(cleaningHistoryTransition(d,structuredClone(d)),[]);
 const changed=structuredClone(d);configure(changed,c=>c.completedTransitions[0].end=19);assert.match(cleaningHistoryTransition(d,changed)[0].message,/不可删除/);configure(changed,c=>c.completedTransitions=[]);assert.ok(cleaningHistoryTransition(d,changed).length);
 const future=check(p,d,{...cond,startMinute:39});assert.match(codes(future),/观测晚于/);dump('history',{data:d,plan:p,result:x});
});
test('multiple actual machine calendars, cleaning staff window and pool exceptions must all fit',()=>{
 const d=scenario();d.machines.push({...d.machines[0],'设备编号':'M2','日历编号':'C2'});d.calendars.push({...d.calendars[0],'日历编号':'C2','起始分钟':'50'});
 assert.equal(check(planOf(),d,cond).status,'pass'); // unrelated machine calendar never replaces M
 const p=planOf();p.tasks.forEach(t=>t.machine='M2');p.resourceReservations.forEach(r=>r.resourceId='M2');configure(d,c=>{for(const p of c.policies){p.resourceIds=['M2'];p.resources=[{type:'设备',id:'M2',quantity:1}];p.validation.resources=[{type:'设备',id:'M2',quantity:1}];}});
 assert.match(codes(check(p,d,cond)),/CALENDAR|GROUP_WINDOW|RESOURCE_WINDOW/);
 const e=scenario();e.calendars=[{...e.calendars[0],'结束分钟':'15'},{...e.calendars[0],'起始分钟':'15'}];assert.match(codes(check(planOf(),e,cond)),/CALENDAR|GROUP_WINDOW/); // cannot stitch two shifts
 const short=scenario();short.personnelGroups[0]['可用起始分钟']='11';assert.match(codes(check(planOf(),short,cond)),/GROUP_WINDOW/);
 const stop=scenario();stop.resourceStops=[{'例外编号':'S','资源类型':'人员池','资源编号':'P','起始分钟':'19','结束分钟':'20','原因':'仿真停用'}];assert.match(codes(check(planOf(),stop,cond)),/GROUP_WINDOW|CALENDAR/);
});
test('shared physical pool, group mutex, operation mutex and handover all include production and cleaning once',()=>{
 const d=scenario();d.personnelGroups.push({...d.personnelGroups[0],'人员组编号':'PROD','技能':'PROD'});
 const p=planOf();p.resourceReservations.push({type:'人员',resourceId:'PROD',quantity:'2',start:10,end:20,taskIds:['B-OP']});assert.match(codes(check(p,d,cond)),/CAPACITY_OVERLAP|POOL_HANDOVER/);
 p.resourceReservations.at(-1).quantity='1';assert.equal(check(p,d,cond).status,'pass');
 d.personnelPools[0]['允许共用']='否';d.personnelPools[0]['互斥粒度']='人员组互斥';assert.match(codes(check(p,d,cond)),/POOL_MUTEX/);
 d.personnelPools[0]['互斥粒度']='工序互斥';p.resourceReservations.at(-1).resourceId='CLEAN';assert.match(codes(check(p,d,cond)),/POOL_MUTEX/);
 d.personnelPools[0]['允许共用']='是';d.personnelPools[0]['互斥粒度']='无互斥';Object.assign(d.personnelPools[0],{'交接模式':'窗口容量上限','交接起始分钟':'10','交接结束分钟':'20','交接容量人数':'1'});assert.match(codes(check(p,d,cond)),/POOL_HANDOVER/);
 p.resourceReservations.pop();assert.equal(check(p,d,cond).status,'pass');d.personnelPools[0]['交接容量人数']='0';assert.match(codes(check(p,d,cond)),/POOL_HANDOVER/);dump('pool-conflicts',{data:d,plan:p,result:check(p,d,cond)});
});
test('planner inserts exact wait, independently verified; searches a legal reverse order and rejects true both-direction prohibition',()=>{
 const d=scenario(),input=freezeRunInput(d,{endMinute:200},at),p=calculate(input.executionData,1,at,input.conditions);assert.equal(p.findings.length,0,JSON.stringify(p.findings));assert.deepEqual(p.tasks.map(t=>[t.id,t.start,t.end]),[['A-OP',0,10],['B-OP',25,35]]);expectedWindows(d,p);
 const v=independentlyVerifyPlan(p,input.executionData.orders,input.executionData.routes,p.rules,at,input.executionData,input.conditions);assert.equal(v.checks.changeover.status,'pass',JSON.stringify(v));
 configure(d,c=>c.policies[0].prohibited=true);const i=freezeRunInput(d,{endMinute:200},at),reverse=calculate(i.executionData,1,at,i.conditions);assert.equal(reverse.findings.length,0,JSON.stringify(reverse));assert.deepEqual(reverse.tasks.map(t=>[t.id,t.start,t.end]),[['B-OP',0,10],['A-OP',16,26]]);assert.equal(reverse.changeoverSearch.status,'legal-alternative');expectedWindows(d,reverse);
 configure(d,c=>c.policies[1].prohibited=true);const n=freezeRunInput(d,{endMinute:200},at),no=calculate(n.executionData,1,at,n.conditions);assert.equal(no.changeoverSearch.status,'rejected');assert.ok(no.findings.length);assert.equal(no.changeoverSearch.attempts.length,2);dump('planner',{normal:p,verification:v,reverse,no});
});
test('saved-plan tampering and already-started successor without a historical cleaning record reject',()=>{
 const d=scenario(),p=planOf();p.changeoverAssessment=check(p,d,cond);assert.equal(verifyApplicationChangeovers(p,d,cond).status,'pass');p.changeoverAssessment.acceptedOccupations=[];assert.equal(verifyApplicationChangeovers(p,d,cond).status,'problem');
 d.executionFacts=[{'订单编号':'B','工序编号':'OP','状态':'已开始'}];assert.match(codes(check(planOf(),d,cond)),/HISTORY_REQUIRED/);
});

test('actual CSV import, maintenance, Worker, independent review, exact frozen source, native export and process reopen',async()=>{
 const {hostProcess}=await import('./b234-host-client.mjs');const {b2Worker}=await import('./b2-fixture.mjs');const {resourceLoad}=await import('../src/lib/resource-load.mjs');const os=await import('node:os');const path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'br13-application-'));let h=await hostProcess(dir);
 try{
  const d=scenario(),s=await h.ok('/state'),preview=await h.ok('/imports/preview',{revision:s.revision,files:scenarioFiles(d),inputStage:'supported'});assert.equal(preview.valid,true,JSON.stringify(preview.issues));await h.ok('/imports/commit',{previewId:preview.id});
  const first=await b2Worker(h,{endMinute:200});assert.equal(first.run.status,'completed',JSON.stringify(first));expectedWindows(d,first.plan);
  const verified=await h.ok('/plans/'+first.plan.id+'/verify',{});assert.equal(verified.verification.checks.changeover.status,'pass');assert.equal(verified.verification.findings.length,0,JSON.stringify(verified.verification));
  const snap=await h.ok('/runs/'+first.run.id+'/inputs');assert.ok((await h.ok('/plans/'+first.plan.id+'/inputs')).csvSources.rules.sha256);assert.deepEqual(first.plan.changeoverAssessment.configuration,JSON.parse(snap.originalInput.rules.find(r=>r['规则编号']==='CLEANING')['参数JSON']));
  const csv=await h.ok('/export',{planId:first.plan.id});assert.match(csv,/BR13实际相邻顺序/);assert.match(csv,/MOCK:BR13-application/);
  const load=resourceLoad({...first.plan,inputSnapshot:snap.executionData},{start:0,end:40});assert.equal(load.machines.find(m=>m.id==='M').busyMinutes,35);const pool=load.resources.find(r=>r.type==='物理人员池');assert.equal(pool.quantityMinutes.value,10);assert.equal(pool.peak.value,1);
  const state=await h.ok('/state');configure(d,c=>c.policies[0].durationMinutes=20);await h.ok('/inputs',{revision:state.revision,tables:{rules:d.rules}});const second=await b2Worker(h,{endMinute:200});assert.equal(second.plan.tasks[1].start,35);assert.equal(await h.ok('/export',{planId:first.plan.id}),csv);assert.deepEqual(await h.ok('/runs/'+first.run.id+'/inputs'),snap);
  const bytes=h.bytes(),denied=await h.call('/inputs',{revision:(await h.ok('/state')).revision,tables:{rules:d.rules}},'query');assert.equal(denied.status,403);assert.equal(h.bytes(),bytes);
  const pid=h.pid;await h.close();h=await hostProcess(dir);assert.notEqual(h.pid,pid);assert.equal(h.bytes(),bytes);assert.equal(await h.ok('/export',{planId:first.plan.id}),csv);assert.deepEqual(await h.ok('/runs/'+first.run.id+'/inputs'),snap);const reopened=(await h.ok('/plans')).find(p=>p.id===first.plan.id);assert.deepEqual(reopened.changeoverAssessment,first.plan.changeoverAssessment);
  dump('worker-api-reopen',{preview,first,verified,snap,csv,load,second,oldPid:pid,newPid:h.pid,denied,bytesUnchanged:true});
 }finally{await h.close();}
});

test('confirmed historical cleaning maintenance rejects edits/deletes atomically and Worker keeps original intervals',async t=>{
 const f=await fixture(t);const d=scenario();d.executionFacts=tasks().map((task,i)=>({'事实编号':'F'+i,'订单编号':task.orderId,'工序编号':'OP','状态':'已完成','开始分钟':String(task.start),'完成分钟':String(task.end),'观测分钟':'40','工序完成数量':'1','数量单位':'支','剩余工时分钟':'0','当前设备':'M','暂停原因':'','累计报废数量':'0','报废补做口径':''}));
 configure(d,c=>{c.completedTransitions=[{id:'MOCK:H1',machineId:'M',fromTaskId:'A-OP',toTaskId:'B-OP',from:'A',to:'B',start:10,end:20,readyAt:25,observedAt:40,source:{id:'MOCK:actual-history','version':'1'}}];});await f.ok('/inputs',{revision:0,tables:d});
 const p=await f.ok('/calculate',{revision:1,selection:{startMinute:40,endMinute:200}});assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[0,10],[25,35]]);assert.equal(p.changeoverAssessment.status,'pass',JSON.stringify(p));assert.equal(p.changeoverAssessment.acceptedOccupations.length,0);
 const bytes=f.bytes();configure(d,c=>c.completedTransitions[0].end=19);const rejected=await f.call('/inputs',{revision:1,tables:{rules:d.rules}});assert.equal(rejected.status,409);assert.equal(f.bytes(),bytes);dump('history-api',{data:d,plan:p,rejected,unchanged:true});
});

test('pack/process route candidates include cleaning before committing a resource batch',async()=>{
 const {packScenario}=await import('./pack-batch-fixture.mjs');const d=packScenario('逐生产批'),base=scenario();d.personnelGroups.push({...base.personnelGroups[0],poolId:'BR13-POOL','可用结束分钟':'600'});d.personnelPools.push({...base.personnelPools[0],poolId:'BR13-POOL'});
 const ps=d.machines.map((m,i)=>({...policy('HC40','HC40',1,0),id:'SELF-'+i,resourceIds:[m['设备编号']],resources:[{type:'设备',id:m['设备编号'],quantity:1}],validation:{clock:'elapsed-minutes',waitMinutes:0,resources:[],personnel:[]}}));
 d.rules.push({'规则编号':'CLEANING','中文名称':'换型清洗','是否启用':'是','参数JSON':JSON.stringify({contract:'BR13-saved-order-v1',source:{id:'MOCK:pack-route-cleaning',version:'1'},startPolicy:'前序结束',policies:ps}),'适用对象':'*','生效时间':''});
 const input=freezeRunInput(d,{endMinute:600},at),p=calculate(input.executionData,1,at,input.conditions);assert.equal(p.findings.length,0,JSON.stringify(p.findings));assert.equal(p.changeoverAssessment.status,'pass');assert.ok(p.changeoverAssessment.domain.inspections.length>0);assert.ok(p.tasks.length>2);assert.equal(p.processRouteVerification.status,'pass');dump('pack-process-integration',{data:d,input,plan:p});
});

test('alternative order never moves locked positions or started tasks; bounded search reports its exact limit',()=>{
 const d=scenario();configure(d,c=>c.policies[0].prohibited=true);const input=freezeRunInput(d,{endMinute:200},at),positions=Object.fromEntries(tasks().map(t=>[t.id,t]));const p=calculate(input.executionData,1,at,{...input.conditions,taskPositions:positions});assert.ok(p.findings.length);assert.equal(p.changeoverSearch.status,'rejected');for(const t of p.tasks)assert.equal(t.start,positions[t.id].start);dump('locks',{positions,plan:p});
});
