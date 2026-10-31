import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {seed,defs,calculate} from '../server/planner.ts';
import {freezeRunInput,inputHash} from '../server/run-input.mjs';
import {contentHash,reviewPlan} from '../server/confirmation.mjs';
import {recordKeys} from '../server/input-validation.mjs';
import {materialFixture} from './material-fixture.mjs';
import {queryData,queryCsv} from '../src/lib/data-query.mjs';
import {assessResult,resultCsv} from '../src/lib/result-assessment.mjs';
import {assessDelivery} from '../src/lib/delivery-assessment.mjs';
import {comparePlans} from '../src/lib/plan-comparison.mjs';
import {parseInputCsv} from '../src/lib/input-csv.mjs';
import {currentExchangeContract,exchangeCsvTemplate,savedResultCoverage,querySavedReport,savedReportCsv,assessHandoff,recordedPackageStatus,inspectExchangeContract} from '../src/lib/r7-handoff.mjs';
const AT='2026-10-29T00:00:00Z';
const out=process.env.R7_EVIDENCE;
function save(name,x){if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(x,null,2)+'\n');}}
function fixture(selection={}){
 const data=materialFixture(seed),f=freezeRunInput(data,selection,AT),v=inputHash(data);
 const plan={...calculate(f.executionData,0,AT,f.conditions),conditions:f.conditions,id:'P',runId:'R',revision:0,status:'draft',inputVersionId:v,snapshotHash:f.snapshotHash};
 plan.verification={contentHash:contentHash(plan)};
 return {data,revision:0,plans:[plan],runs:[{id:'R',planId:'P',revision:0,status:plan.resultAssessment.status==='scheduled'?'completed':'partial',createdAt:AT,inputVersionId:v,snapshotHash:f.snapshotHash,conditions:f.conditions,executionData:f.executionData}],inputVersions:{[v]:{data:structuredClone(data)}},records:[{action:'calculate',target:'R',reason:'显式合成mock，非现场账'}],workflows:{},confirmations:[]};
}
const q=(kind,extra={})=>({kind,planId:'P',start:0,end:120,text:'',order:'',...extra});
const decision=p=>({allowPartial:true,unplannedIds:p.resultAssessment.tasks.filter(t=>t.status==='unplanned').map(t=>t.id),acceptConditionalSupply:true,acknowledgeScope:true});
const gate=s=>assessHandoff(s,'P',decision(s.plans[0]),AT);
test('R7-01 six saved views reuse exact records, units, line, simulation, input and CSV identifiers',()=>{
 const s=fixture(),before=JSON.stringify(s),reports={};
 for(const kind of ['orders','tasks','occupation','materials','unplanned','differences']){
  const r=querySavedReport(s,q(kind,kind==='differences'?{otherPlanId:'P'}:{}));reports[kind]=r;
  assert.equal(r.provenance.inputVersionId,s.plans[0].inputVersionId);assert.ok(r.provenance.simulation.includes('模拟'));assert.ok(r.provenance.lines.length);assert.equal(r.coverage.status,'complete');
  const csv=parseInputCsv(savedReportCsv(r));assert.equal(csv[1][1],r.viewId);assert.equal(csv.length,r.rows.length+6);assert.deepEqual(csv.slice(6),r.rows);
 }
 assert.equal(JSON.stringify(s),before);save('six-views',reports);
});
test('R7-02 frozen reports survive live quantity/line/config edits and detach from callers',()=>{
 const s=fixture(),a=querySavedReport(s,q('orders')),b=querySavedReport(s,q('tasks'));
 s.data=structuredClone(s.data);s.data.orders[0]['合格需求']='999';s.data.orders[0]['产线编号']='NEW-LINE';s.revision++;
 assert.deepEqual(querySavedReport(s,q('orders')),a);assert.deepEqual(querySavedReport(s,q('tasks')),b);
 a.rows[0][1]='changed';assert.notDeepEqual(querySavedReport(s,q('orders')),a);assert.throws(()=>savedReportCsv(a),/report_changed/);
 save('frozen-history',{old:b,currentOrder:s.data.orders[0],gate:gate(s)});assert.ok(gate(s).blockers.some(b=>b.code==='stale_input'));
});
test('R7-03 time half-open, order/text AND filters, empty result and equal key order retain scope',()=>{
 const s=fixture(),all=querySavedReport(s,q('tasks')),first=JSON.parse(all.rows[0][1]).record,start=Number(first['开始分钟']);
 const endAt=querySavedReport(s,q('tasks',{start:Math.max(0,start-1),end:start||1}));
 if(start>0)assert.ok(endAt.rows.every(r=>Number(JSON.parse(r[1]).record['开始分钟'])<start));
 const empty=querySavedReport(s,q('tasks',{order:'ABSENT',text:'no-such'}));assert.equal(empty.rows.length,0);assert.ok(savedReportCsv(empty).includes(s.plans[0].inputVersionId));assert.equal(empty.coverage.scheduledCount,s.plans[0].tasks.length);
 const a=q('orders'),b=Object.fromEntries(Object.entries(a).reverse());assert.deepEqual(querySavedReport(s,a),querySavedReport(s,b));
 assert.throws(()=>querySavedReport(s,q('tasks',{start:30,end:30})));save('empty-query',empty);
});
test('R7-04 exact quantity literals, source direction and historical CSV revision do not borrow current revision',()=>{
 const d={orders:[{'订单编号':'O','产线编号':'L','数量单位':'kg','合格需求':'0.1000000000000000001'}]};
 const p={id:'OLD',revision:3,inputVersionId:'a'.repeat(64),tasks:[]};
 const csv=parseInputCsv(queryCsv([{key:'orders',fields:Object.keys(d.orders[0])}],d,[p],999,{table:'orders',planId:'OLD',sourcePlanId:'OLD'})),m=Object.fromEntries(csv[0].map((h,i)=>[h,csv[1][i]]));
 assert.equal(m['合格需求'],'0.1000000000000000001');assert.equal(m['查询输入版本'],'3');assert.equal(m['请求时当前输入版本'],'999');assert.equal(m['原始输入版本SHA256'],p.inputVersionId);
 const history={...p,tasks:[{id:'T',orderId:'O',productId:'P',operation:'OP',machine:'M',start:0,end:1,duration:1}],conditions:{checkScope:{}},resourceReservations:[{taskId:'T'}],deliveryAssessment:{}};
 const t=queryData(d,[history],'OLD').tasks[0];assert.equal(t['数量单位'],'kg');assert.equal(t['产线编号'],'L');assert.equal(t['输入版本SHA256'],p.inputVersionId);assert.equal(JSON.parse(t['联合资源占用']).length,1);
 const injected=parseInputCsv(queryCsv([{key:'x',fields:['v']}],{x:[{v:'  =HYPERLINK("x")'},{v:'\t+CMD'},{v:'a,"b\nc'}]},[],0,{table:'x'}));assert.ok(injected[1][0].startsWith("'"));assert.ok(injected[2][0].startsWith("'"));assert.equal(injected[3][0],'a,"b\nc');save('csv-values',{m,task:t,injected});
});
test('R7-05 original hash, run hash, conditions, missing history and comparison-side corruption fail closed',()=>{
 for(const kind of ['original','execution','conditions','missing']){const s=fixture();if(kind==='original')s.inputVersions[s.plans[0].inputVersionId].data.orders=[];if(kind==='execution')s.runs[0].executionData={};if(kind==='conditions')s.plans[0].conditions={};if(kind==='missing')s.inputVersions={};assert.throws(()=>querySavedReport(s,q('orders')),/historical_inputs_unavailable/,kind);assert.equal(gate(s).dataGatePassed,false);}
 const s=fixture();assert.throws(()=>querySavedReport(s,q('differences',{otherPlanId:'ABSENT'})),/plan_not_found/);
});
test('R7-06 complete data gate retains actual independent checks and never executes workflow',()=>{
 const s=fixture(),before=JSON.stringify(s),r=gate(s);assert.deepEqual(r.blockers,[]);assert.equal(r.dataGatePassed,true);assert.equal(r.finalIndependentReviewRequired,true);assert.equal(r.workflowActionPerformed,false);assert.ok(r.independentChecks.checks.machineOverlap.status==='pass');assert.ok(r.changeReasons.length);assert.equal(JSON.stringify(s),before);save('complete-gate',r);
});
test('R7-07 explicit complete partial list, reasons, quantities and scope acknowledgement required',()=>{
 const s=fixture({endMinute:35}),p=s.plans[0],d=decision(p),r=assessHandoff(s,'P',d,AT);assert.ok(r.unplanned.length);assert.deepEqual(r.blockers,[]);
 for(const patch of [{allowPartial:false},{unplannedIds:[]},{unplannedIds:[...d.unplannedIds,'forged']},{unplannedIds:[...d.unplannedIds,d.unplannedIds[0]]},{acknowledgeScope:false}])assert.equal(assessHandoff(s,'P',{...d,...patch},AT).dataGatePassed,false);
 save('partial-gate',r);
});
test('R7-08 missing execution fields, demand, saved tasks/reasons/counts cannot masquerade as complete',()=>{
 const results=[];
 for(const kind of ['task-machine','task-time','report-missing','report-ghost','count','order-unit','order-demand','delivery','scope','no-tasks','invalid-quantity']){
  const s=fixture(),p=s.plans[0];
  if(kind==='task-machine')delete p.tasks[0].machine;if(kind==='task-time')delete p.tasks[0].end;if(kind==='report-missing')delete p.resultAssessment;if(kind==='report-ghost')p.resultAssessment.tasks[0].id='GHOST';if(kind==='count')p.resultAssessment.scheduledCount++;
  if(kind==='order-unit')delete s.inputVersions[p.inputVersionId].data.orders[0]['数量单位'];if(kind==='order-demand')delete s.inputVersions[p.inputVersionId].data.orders[0]['合格需求'];if(kind==='delivery')delete p.deliveryAssessment;if(kind==='scope'){delete p.conditions.checkScope;delete p.ruleSnapshot.checkScope;}if(kind==='no-tasks')p.tasks=[];if(kind==='invalid-quantity')p.resultAssessment.tasks[0].quantity=null;
  const r=assessHandoff(s,'P',{acknowledgeScope:true},AT);assert.equal(r.dataGatePassed,false,kind);results.push({kind,codes:r.blockers.map(b=>b.code)});
 }
 for(const key of ['reasons','unit','quantity']){const s=fixture({endMinute:35}),p=s.plans[0],t=p.resultAssessment.tasks.find(t=>t.status==='unplanned');delete t[key];assert.equal(assessHandoff(s,'P',{},AT).dataGatePassed,false);}
 save('missing-fields',results);
});
test('R7-09 result/input revisions, absent verification, conflicts and unchecked mode require a fresh submission',()=>{
 const results=[];
 for(const kind of ['result','input','verification','conflict','minimal','corrupt-check']){
  const s=fixture(kind==='minimal'?{mode:'minimal-r1'}:{}),p=s.plans[0];s.workflows.P={revision:1,state:'submitted',submission:{id:'S',contentHash:contentHash(p),inputVersionId:p.inputVersionId},events:[]};
  if(kind==='result')p.tasks[0].source='changed-result';if(kind==='input'){s.data=structuredClone(s.data);s.data.orders[0]['合格需求']='241';s.revision++;}if(kind==='verification')delete p.verification;if(kind==='conflict')p.findings.push({code:'CONFLICT',message:'已启用规则冲突',taskIds:[p.tasks[0].id]});if(kind==='corrupt-check')p.ruleSnapshot=null;
  const r=gate(s);assert.equal(r.dataGatePassed,false,kind);if(kind==='result')assert.equal(r.requiresResubmission,true);if(kind==='input')assert.ok(r.blockers.some(b=>b.code==='stale_input'));results.push({kind,blockers:r.blockers});
 }
 save('revision-conflicts',results);
});
test('R7-10 expected supply and unknown delivery stay conditions; acknowledgement cannot cure missing data',()=>{
 const s=fixture(),p=s.plans[0];p.supplyConditions=[{'订单编号':p.conditions.orderIds[0],'供给编号':'MOCK-S','预计可用时间':'2026-11-02T11:00:00+08:00','模拟说明':'预计，非到货'}];p.verification={contentHash:contentHash(p)};
 const r=assessHandoff(s,'P',{...decision(p),acceptConditionalSupply:false},AT);assert.equal(r.dataGatePassed,false);assert.deepEqual(r.conditionalSupply,p.supplyConditions);assert.ok(r.blockers.some(b=>b.code==='CONDITIONAL_SUPPLY_ACK_REQUIRED'));
 const d=structuredClone(s.runs[0].executionData);d.products[0]['模拟交付等待分钟']='';const a=assessDelivery(d,p,AT,p.conditions),o=a.orders[0];assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.promised,false);assert.ok(o.reasons.some(r=>r.code==='WAIT_UNKNOWN'));
 const noTasks=assessDelivery(d,{...p,tasks:undefined,findings:undefined},AT,p.conditions);assert.equal(noTasks.orders[0].completionMinute,null);save('conditional-and-unknown',{gate:r,delivery:a,noTasks});
});
test('R7-11 invalid quantity, route and huge candidate times are explicit unknowns without throwing',()=>{
 const s=fixture(),p=s.plans[0],d=structuredClone(s.runs[0].executionData);d.orders[0]['合格需求']='bad';let r=assessResult(d,p,p.conditions);assert.equal(r.status,'partial-unplanned');assert.equal(r.orders[0].status,'unknown-quantity');
 d.orders[0]['合格需求']='240';d.routes=[];r=assessResult(d,p,p.conditions);assert.equal(r.status,'partial-unplanned');assert.equal(r.orders[0].status,'unknown-route');
 const partial=fixture({endMinute:35}),pp=partial.plans[0];pp.findings=[{message:'缺少编号的历史原因',taskIds:[pp.resultAssessment.tasks[0].id],context:{candidateMinute:1e300}}];r=assessResult(partial.runs[0].executionData,pp,pp.conditions);assert.equal(r.tasks.find(t=>t.candidateMinute===1e300).candidateAt,null);
 const csv=parseInputCsv(resultCsv({id:' =HYPERLINK("x")',status:'failed'},null));assert.ok(csv.find(row=>row[0]==='运行编号')[1].startsWith("'"));save('unknown-result',r);
});
test('R7-12 differences use existing comparison scope and full shared physical rows without causal claims',()=>{
 const s=fixture(),a=s.plans[0],b=structuredClone(a);b.id='P2';b.runId='R2';b.conditions=structuredClone(a.conditions);b.conditions.checkScope={...b.conditions.checkScope,label:'different saved scope'};const run={...structuredClone(s.runs[0]),id:'R2',planId:'P2',conditions:b.conditions};run.snapshotHash=inputHash({conditions:run.conditions,executionData:run.executionData});b.snapshotHash=run.snapshotHash;s.plans.push(b);s.runs.push(run);
 const r=querySavedReport(s,q('differences',{otherPlanId:'P2'})),existing=comparePlans(a,s.inputVersions[a.inputVersionId].data,b,s.inputVersions[b.inputVersionId].data);assert.deepEqual(r.comparison.scope,existing.scope);assert.equal(r.comparison.scope.comparable,false);assert.equal(r.comparison.impact.noAutomaticImprovement,true);assert.equal(r.comparison.impact.claim,existing.impact.claim);save('scope-difference',r);
});
test('R7-13 archived/Done only reports actual records and never supplies a QA PASS',()=>{
 assert.equal(recordedPackageStatus({status:'Done',archived:true}).qaVerdict,'NOT_EXECUTED');assert.equal(recordedPackageStatus(null).status,'unknown');
 const record={issue:41,status:'In progress',sourceSha:'a'.repeat(40),taskResult:{result:'PASS',scope:'domain only'},qa:{verdict:'PARTIAL',sourceSha:'b'.repeat(40),evidence:'actual-record'}};const r=recordedPackageStatus(record);assert.equal(r.qaVerdict,'PARTIAL');assert.equal(r.qa.sourceSha,'b'.repeat(40));r.qa.verdict='PASS';assert.equal(record.qa.verdict,'PARTIAL');save('package-records',{absent:recordedPackageStatus({status:'Done'}),actual:recordedPackageStatus(record)});
});
test('R7-14 FR036 existing 19 categories, fields, record keys, source direction and exact original mappings are reused',()=>{
 const m=JSON.parse(fs.readFileSync('public/fr036/matrix.json')),r=inspectExchangeContract(m,defs,recordKeys);assert.equal(r.status,'gaps');assert.equal(r.chapter9.length,19);assert.deepEqual(r.inbound,m.inbound);assert.deepEqual(r.outbound,m.outbound);assert.equal(r.realConnection,false);assert.equal(r.externalWrite,false);
 const copy=structuredClone(m);copy.inbound[0].fields=['invented'];delete copy.inbound[1].direction;const bad=inspectExchangeContract(copy,defs,recordKeys);assert.ok(bad.gaps.some(g=>g.code==='CONTRACT_DRIFT'));assert.ok(bad.gaps.some(g=>g.code==='SOURCE_DIRECTION_MISSING'));const current=currentExchangeContract(m,defs,recordKeys);assert.equal(current.currentSchemaStatus,'complete');assert.equal(current.inbound.length,defs.length);for(const def of defs){const row=current.inbound.find(r=>r.key===def.key);assert.deepEqual(row.fields,def.fields);assert.deepEqual(row.uniqueKey,recordKeys[def.key]);assert.deepEqual(parseInputCsv(exchangeCsvTemplate(current,def.key))[0],def.fields);}save('exchange-contract',{historical:r,current});
});
test('R7-15 explicit one-line mock query profile reports elapsed environment only, with no AC27 threshold',()=>{
 const s=fixture(),n=100,start=performance.now();let rows=0;for(let i=0;i<n;i++)rows+=querySavedReport(s,q('tasks')).rows.length;
 const result={profile:'explicit-materialFixture-seed-one-line',iterations:n,orders:s.data.orders.length,machines:s.data.machines.length,enabledRules:s.plans[0].rules,taskRows:rows,elapsedMs:performance.now()-start,node:process.version,platform:process.platform,arch:process.arch,ac27Verdict:'NOT_EXECUTED_AGREED_PROFILE_REQUIRED',threshold:null};assert.equal(rows,n*s.plans[0].tasks.length);save('performance-profile',result);
});
