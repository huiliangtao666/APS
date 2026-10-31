import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {fixture,moveOrder} from './b16-test-fixture.mjs';
import {sharingContract,validateSharingProfile,lineCandidates,allocateSharingMaterials,checkSharingPlan,sharingMappingCsv} from '../src/lib/b16-sharing.mjs';
import {validateSingleLineScope} from '../src/lib/line-scope.mjs';
import {sourceFixture} from './b16-test-source.mjs';
const results=[];
const allocate=f=>({...f,plan:allocateSharingMaterials(f).plan});
const save=(id,f,result)=>results.push({id,input:structuredClone(f),result:structuredClone(result)});
const good=(id,f)=>{const allocated=allocateSharingMaterials(f);assert.equal(allocated.status,'pass',JSON.stringify(allocated.findings));f={...f,plan:allocated.plan};const result=checkSharingPlan(f);assert.equal(result.status,'pass',JSON.stringify(result.findings));save(id,f,result);return f;};
const bad=(id,f,pattern)=>{const result=checkSharingPlan(f);assert.equal(result.status,'problem');if(pattern)assert.match(JSON.stringify(result.findings),pattern);save(id,f,result);return result;};

test('B16-01 explicit profile, specified and automatic applicability',()=>{
 const f=fixture();assert.deepEqual(validateSharingProfile(f.profile,f.data),[]);
 assert.deepEqual(lineCandidates(f.profile,'P1',{mode:'automatic'}).candidates,['L01','L02']);
 assert.deepEqual(lineCandidates(f.profile,'P1',{mode:'specified',lineId:'L02'}).candidates,['L02']);
 for(const [product,s]of [['P2',{mode:'specified',lineId:'L01'}],['UNKNOWN',{mode:'automatic'}],['P1',{}],['P1',{mode:'automatic',lineId:'L01'}]])assert.equal(lineCandidates(f.profile,product,s).status,'problem');
 good('reference',f);
});
test('B16-02 shared inventory is 162.5 +162.5, exact remaining demand and conditional supply',()=>{
 const f=good('inventory',fixture()),lean=f.plan.materialDemands.filter(r=>r.materialId==='LEAN');
 assert.deepEqual(lean.map(r=>r.quantity),[162.5,162.5]);assert.deepEqual(lean.map(r=>r.exactQuantity),[{numerator:'325',denominator:'2'},{numerator:'325',denominator:'2'}]);
 assert.equal(lean[0].allocations[0].lotId,'LEAN-LOT');assert.equal(lean[1].allocations[0].supplyId,'S90');assert.equal(lean[1].allocations[0].conditional,true);assert.ok(lean.every(r=>r.committed));
});
test('B16-03 feed89 denied /90 legal, no speculative commit or input mutation',()=>{
 const f=moveOrder(fixture(),'B',89),before=JSON.stringify(f),r=allocateSharingMaterials(f);assert.equal(r.status,'problem');assert.equal(JSON.stringify(f),before);assert.ok(r.plan.materialDemands.every(r=>!r.committed));assert.equal(r.plan.materialDemands.find(r=>r.taskId==='B-MIX'&&r.materialId==='LEAN').shortage,162.5);save('feed89',f,r);
 good('feed90',fixture());
});
test('B16-04 third order cannot consume already exhausted global batch or supply',()=>{
 const f=fixture(),o={...f.data.orders[1],'订单编号':'C'};f.data.orders.push(o);f.profile.selections.push({orderId:'C',mode:'automatic'});
 f.data.dependencies.push(...f.data.dependencies.filter(r=>r['订单编号']==='B').map(r=>({...r,'订单编号':'C'})));f.data.resourceClaims.push({...f.data.resourceClaims[1],'声明编号':'C-G','订单编号':'C'});
 for(const t of f.plan.tasks.filter(t=>t.orderId==='B'))f.plan.tasks.push({...t,id:t.id.replace('B','C'),orderId:'C',start:t.start+60,end:t.end+60,predecessor:t.predecessor.replace('B','C')});
 for(const r of f.plan.resourceReservations.filter(r=>r.taskId.startsWith('B')))f.plan.resourceReservations.push({...r,id:r.id.replace('B','C'),taskId:r.taskId.replace('B','C'),taskIds:r.taskIds.map(id=>id.replace('B','C')),start:r.start+60,end:r.end+60,...(r.declarationId?{declarationId:'C-G'}:{roleSource:'C'})});
 const r=allocateSharingMaterials(f);assert.equal(r.status,'problem');assert.match(JSON.stringify(r.findings),/Global inventory/);assert.ok(r.plan.materialDemands.every(d=>!d.committed));save('third-order',f,r);
});
test('B16-05 alternate order arrangement accepted; reference screenshot not oracle',()=>{
 const f=fixture();f.data.inventory[0]['账面数量']='325';f.data.supplies=[];f.data.supplyUses=[];moveOrder(f,'B',0);moveOrder(f,'A',60);good('alternate',f);
});
test('B16-06 global G01 and LP01 capacity overlap despite separate idle machines',()=>{
 const f=fixture();f.data.inventory[0]['账面数量']='325';f.data.supplies=[];f.data.supplyUses=[];moveOrder(f,'B',0);const r=bad('overlap',allocate(f),/超容量/);
 for(const id of ['G01','LP01']){const finding=r.findings.find(x=>x.interval?.resourceId===id);assert.ok(finding);assert.deepEqual([finding.interval.start,finding.interval.end,finding.interval.demand,finding.interval.effectiveCapacity],[30,60,2,1]);assert.deepEqual(finding.taskIds,['A-FILL','B-FILL']);assert.ok(finding.relatedRecords.length);}
});
test('B16-07 exact adjacent handover legal, 1-minute overlap illegal',()=>{
 for(const [start,expected]of [[30,'pass'],[29,'problem']]){const f=fixture();f.data.inventory[0]['账面数量']='325';f.data.supplies=[];f.data.supplyUses=[];moveOrder(f,'B',start);if(expected==='pass')good('adjacent',f);else bad('overlap1',allocate(f),/超容量/);}
});
test('B16-08 capacity2 allows true cross-line simultaneous use without duplicate objects',()=>{
 const f=fixture();f.data.inventory[0]['账面数量']='325';f.data.supplies=[];f.data.supplyUses=[];moveOrder(f,'B',0);for(const r of f.profile.resources)r.capacity='2';f.data.tools[0]['可用数量']='2';f.data.personnelGroups[0]['人员数量']='2';good('capacity2',f);
});
test('B16-09 illegal/missing/duplicate profile and global identity fail closed',()=>{
 const cases=[p=>delete p.version,p=>p.mock=false,p=>p.lines.push({...p.lines[0]}),p=>p.lines[1].factoryId='F02',p=>p.products[0].lineIds.push('L99'),p=>p.products[0].lineIds=[],p=>p.products.push({...p.products[0]}),p=>p.resources.push({...p.resources[0],lineIds:['L02']}),p=>p.resources[0].allowCrossLine=false,p=>delete p.resources[1].allowCrossLine,p=>p.resources[0].capacity='0',p=>p.resources[1].capacity='1.5',p=>p.resources[0].capacity='2',p=>p.resources[0].unit='kg',p=>p.resources[0].lineIds=['L01','L01'],p=>p.materials.pop(),p=>p.materials.push({...p.materials[0]}),p=>p.selections=[],p=>p.selections.push({...p.selections[0]}),p=>p.selections[0].mode='guess'];
 for(const [i,change]of cases.entries()){const f=fixture();change(f.profile);assert.ok(validateSharingProfile(f.profile,f.data).length,'case '+i);bad('profile-invalid-'+i,f);}
 for(const [i,change]of [d=>d.inventory.push({...d.inventory[0]}),d=>d.tools.push({...d.tools[0]}),d=>d.personnelGroups[0]['人员数量']='',d=>d.supplies[0]['批次编号']='LEAN-LOT',d=>d.machines[0]['产线编号']='',d=>d.orders[0]['订单编号']=''].entries()){const f=fixture();change(f.data);bad('identity-invalid-'+i,f);}
});
test('B16-10 absent sharing permission, line and material scope deny use',()=>{
 for(const [id,change]of [['specified',f=>f.profile.selections[1].lineId='L01'],['machine',f=>f.plan.tasks[0].lineId='L02'],['line',f=>delete f.plan.tasks[0].lineId],['tool-scope',f=>{f.profile.resources[0].lineIds=['L01'];f.profile.resources[0].allowCrossLine=false;}],['material-scope',f=>f.profile.materials[0].lineIds=['L01']]]){const f=fixture();change(f);bad(id,f);}
});
test('B16-11 full demand/route coverage, quantities and durations cannot be fabricated',()=>{
 const base=allocate(fixture());
 for(const [id,change]of [['missing',f=>f.plan.tasks.pop()],['duplicate',f=>f.plan.tasks.push({...f.plan.tasks[0]})],['quantity',f=>f.plan.tasks[0].quantity='239.999999999999999999'],['duration',f=>{f.plan.tasks[0].end=29;f.plan.tasks[0].duration=29;}],['order',f=>f.plan.tasks[0].orderId='UNKNOWN'],['batch-gap',f=>f.plan.tasks[0].productionBatchId='new'],['blank-demand',f=>f.data.orders[0]['合格需求']=''],['due',f=>f.data.orders[1]['要求可交付分钟']='149'],['due-unknown',f=>delete f.data.orders[0]['要求可交付分钟']]]){const f=structuredClone(base);change(f);bad(id,f);}
});
test('B16-12 calendar, machine downtime, resource availability and skill stay binding',()=>{
 for(const [id,change,pattern]of [['calendar',f=>f.data.calendars[0]['结束分钟']='149',/CALENDAR|calendar/],['downtime',f=>f.data.downtime.push({'设备编号':'MIX2','起始分钟':'90','结束分钟':'91'}),/停机|calendar/],['tool-time',f=>f.data.tools[0]['可用结束分钟']='149',/可用|resourcePolicies/],['skill',f=>f.data.personnelGroups[0]['技能']='AUX',/技能/],['precedence',f=>{f.plan.tasks[1].predecessor='';},/precedence/],['resource-missing',f=>f.plan.resourceReservations.pop(),/覆盖/],['material-missing',f=>f.plan.materialDemands.pop(),/物料/]]){const f=allocate(fixture());change(f);bad(id,f,pattern);}
});
test('B16-13 material shortages/quality/explicit supply limits and delayed readiness',()=>{
 for(const [id,change]of [['gap0.1',f=>{f.data.supplies[0]['预计数量']='162.4';f.data.supplyUses[0]['使用数量']='162.4';}],['no-supply',f=>{f.data.supplies=[];f.data.supplyUses=[];}],['frozen-stock',f=>f.data.inventory[0]['质量状态']='冻结'],['late-supply',f=>{f.data.supplies[0]['预计到达时间']='2026-11-02T09:31:00+08:00';f.data.supplies[0]['预计可用时间']='2026-11-02T09:31:00+08:00';}],['use-limit',f=>f.data.supplyUses[0]['使用数量']='162.4']]){const f=fixture();change(f);const r=allocateSharingMaterials(f);assert.equal(r.status,'problem');save(id,f,r);}
 const f=fixture();f.data.supplies[0]['预计到达时间']='2026-11-02T09:31:00+08:00';f.data.supplies[0]['预计可用时间']='2026-11-02T09:31:00+08:00';moveOrder(f,'B',91);good('delayed-legal',f);
});
test('B16-14 independent checker detects duplicated material depletion and early conditional use',()=>{
 const base=allocate(fixture());
 const dup=structuredClone(base),a=dup.plan.materialDemands.find(r=>r.taskId==='A-MIX'&&r.materialId==='LEAN'),b=dup.plan.materialDemands.find(r=>r.taskId==='B-MIX'&&r.materialId==='LEAN');b.allocations=structuredClone(a.allocations);bad('double-depletion',dup,/累计分配/);
 const early=structuredClone(base);moveOrder(early,'B',89);for(const r of early.plan.materialDemands.filter(r=>r.orderId==='B'))r.feedMinute=89;bad('forged-early-supply',early,/供给未就绪/);
 const forged=structuredClone(base);forged.plan.materialDemands[0].allocations[0].quantity=162.4;bad('forged-quantity',forged,/分配数量/);
});
test('B16-15 invalid ledger IDs/quantities/intervals/unknown scopes rejected',()=>{
 const base=allocate(fixture());
 for(const [i,change]of [r=>delete r.id,r=>r.quantity='0',r=>r.quantity='-1',r=>r.quantity='NaN',r=>r.quantity='1.1',r=>r.start=r.end,r=>r.start=-1,r=>r.resourceId='UNKNOWN',r=>r.taskIds=['UNKNOWN'],r=>r.taskIds=['A-FILL','A-FILL']].entries()){const f=structuredClone(base);change(f.plan.resourceReservations[0]);bad('ledger-'+i,f);}
});
test('B16-16 P0 single-line guard preserved and offline contract never enables application',()=>{
 const f=good('p0-preserved',fixture()),r=checkSharingPlan(f);assert.ok(validateSingleLineScope(f.data.orders,f.data.machines).some(f=>f.code==='SCOPE / MULTI_LINE'));assert.equal(r.checks.legacySingleLine.review.status,'problem');assert.equal(r.checks.legacySingleLine.adoptedAsMultiLine,false);assert.equal(r.applicationEnabled,false);assert.equal(r.qaUat,'NOT_EXECUTED');
 for(const id of ['MOLD','MATERIAL','CALENDAR']){const x=structuredClone(f);x.conditions.enabledRuleIds=x.conditions.enabledRuleIds.filter(r=>r!==id);bad('rule-disabled-'+id,x,/RULE/);}
});
test('B16-17 JSON reopen preserves frozen historical profile and CSV literal mapping',()=>{
 const f=good('frozen',fixture()),saved=JSON.stringify(f);fs.writeFileSync(process.env.B16_OUT+'/saved.json',saved);const reopened=JSON.parse(fs.readFileSync(process.env.B16_OUT+'/saved.json','utf8'));assert.deepEqual(checkSharingPlan(reopened),checkSharingPlan(f));
 f.profile.resources[0].capacity='999';f.data.inventory[0]['账面数量']='0';assert.equal(JSON.stringify(reopened),saved);assert.equal(checkSharingPlan(reopened).status,'pass');assert.equal(allocateSharingMaterials(reopened).status,'problem');
 reopened.profile.source='mock, "source"\nline';const csv=sharingMappingCsv(reopened.profile);fs.writeFileSync(process.env.B16_OUT+'/mapping.csv',csv);fs.writeFileSync(process.env.B16_OUT+'/mapping-profile.json',JSON.stringify(reopened.profile));assert.ok(csv.includes('"mock, ""source""\nline"'));assert.ok(csv.includes(sharingContract));save('reopened',reopened,checkSharingPlan(reopened));
});
test('B16-18 actual Node domain Worker is equivalent; no application Worker claim',async()=>{
 const f=fixture(),worker=new Worker(new URL('./b16-test-worker.mjs',import.meta.url),{workerData:f});const r=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});const local=allocateSharingMaterials(f);assert.deepEqual(r.allocation,local);assert.deepEqual(r.check,checkSharingPlan({...f,plan:local.plan}));assert.equal(r.check.status,'pass');save('domain-worker',f,r);
});
test('B16-19 original UAT16 source-derived full LP01/T01/G01 and BOM checks',()=>{
 const f=sourceFixture();const original=JSON.stringify(f);const r=good('source-uat16',f);assert.equal(JSON.stringify(f),original);assert.deepEqual(r.plan.materialDemands.filter(r=>r.materialId==='LEAN').map(r=>r.quantity),[162.5,162.5]);assert.equal(r.plan.resourceReservations.filter(r=>r.resourceId==='LP01').length,4);assert.equal(r.provenance.length,19);save('source-provenance',f,{provenance:f.provenance,mappingNotes:f.mappingNotes});
 const early=sourceFixture();moveOrder(early,'B',89);const a=allocateSharingMaterials(early);assert.equal(a.status,'problem');save('source-feed89',early,a);
 // Original LP01 is needed by MIX too: A-FILL and B-MIX cannot overlap.
 const overlap=sourceFixture();overlap.data.inventory.find(r=>r['物料编号']==='LEAN')['账面数量']='325';overlap.data.supplies=[];overlap.data.supplyUses=[];moveOrder(overlap,'B',30);const check=bad('source-labor-overlap',allocate(overlap),/LP01/);assert.ok(check.findings.some(f=>f.interval?.resourceId==='LP01'&&f.interval.start===30&&f.interval.end===60));
 const adjacent=sourceFixture();adjacent.data.inventory.find(r=>r['物料编号']==='LEAN')['账面数量']='325';adjacent.data.supplies=[];adjacent.data.supplyUses=[];moveOrder(adjacent,'B',60);good('source-adjacent',adjacent);
});
test('B16-20 physical pool identity survives different line skill-group aliases',()=>{
 const f=fixture();f.data.inventory[0]['账面数量']='325';f.data.supplies=[];f.data.supplyUses=[];moveOrder(f,'B',0);
 f.data.personnelGroups.push({...f.data.personnelGroups[0],'人员组编号':'LP02'});for(const g of f.data.personnelGroups)g.poolId='PHYSICAL-LP';
 f.profile.resources.push({...f.profile.resources[1],resourceId:'LP02'});f.data.dependencies.find(r=>r['订单编号']==='B'&&r['资源类型']==='人员技能')['资源编号']='LP02';f.plan.resourceReservations.find(r=>r.taskId==='B-FILL'&&r.type==='人员').resourceId='LP02';
 f.data.personnelPools=[{poolId:'PHYSICAL-LP','池名称':'Explicit MOCK common people','总人数':'1','是否启用':'是','允许共用':'是','容量来源':'MOCK source','适用范围':'*','生效时间':'','策略版本':'P10-explicit-v2','策略来源':'Explicit MOCK','互斥粒度':'无互斥','交接模式':'不设交接限制','占用策略':'依赖声明','释放策略':'半开端点释放'}];
 f.conditions.personnelPoolContract='P10-explicit-v2';for(const r of f.plan.resourceReservations.filter(r=>r.type==='人员'))r.poolId='PHYSICAL-LP';
 // Keep tooling legal to isolate the personnel physical pool.
 f.profile.resources[0].capacity='2';f.data.tools[0]['可用数量']='2';
 const r=bad('physical-pool-overlap',allocate(f),/PHYSICAL-LP/);const conflict=r.findings.find(x=>x.code==='VERIFY / PHYSICAL_POOL');assert.ok(conflict);assert.deepEqual([conflict.interval.start,conflict.interval.end,conflict.interval.demand,conflict.interval.effectiveCapacity],[30,60,2,1]);
 const valid=structuredClone(f);valid.data.personnelPools[0]['总人数']='2';good('physical-pool2',valid);
 const duplicate=structuredClone(f);duplicate.data.personnelPools.push({...duplicate.data.personnelPools[0]});bad('pool-duplicate',duplicate);
});
test('B16-21 malformed records/missing rule contract refuse explicitly',()=>{
 for(const [i,change]of [f=>f.profile.lines.push(null),f=>f.data.orders.push(null),f=>f.plan.tasks.push(null),f=>f.plan.resourceReservations.push(null),f=>f.plan.resourceReservations[0].taskIds='A-FILL',f=>f.conditions.mode='minimal-r1',f=>delete f.conditions.workingWindowsContract].entries()){const f=allocate(fixture());change(f);assert.doesNotThrow(()=>bad('malformed-'+i,f));}
});
test('B16-22 explicit supply over-reference and 0.1kg shortage remain exact',()=>{
 const f=fixture();f.data.supplyUses.push({...f.data.supplyUses[0],'引用编号':'EXTRA'});bad('supply-over-reference',f,/计划使用总量/);
 const tiny=fixture();tiny.data.supplies[0]['预计数量']='162.4';tiny.data.supplyUses[0]['使用数量']='162.4';const r=allocateSharingMaterials(tiny);assert.equal(r.status,'problem');const row=r.plan.materialDemands.find(d=>d.taskId==='B-MIX'&&d.materialId==='LEAN');assert.equal(row.shortage,0.1);assert.deepEqual(row.exactShortage,{numerator:'1',denominator:'10'});assert.ok(r.plan.materialDemands.every(d=>!d.committed));save('exact-gap0.1',tiny,r);
});
test('B16-23 existing configuration validation is binding; unknown parameters never pass',()=>{
 for(const [i,change]of [f=>delete f.data.tools[0]['可用结束分钟'],f=>delete f.data.personnelGroups[0]['可用结束分钟'],f=>f.data.rules.find(r=>r['规则编号']==='MOLD')['参数JSON']='{}',f=>f.data.rules.push({'规则编号':'UNKNOWN','是否启用':'是','参数JSON':'{}'}),f=>f.data.rules[0]['生效时间']='bad',f=>delete f.conditions.ruleEvaluationAt,f=>f.conditions.enabledRuleIds.push('UNKNOWN')].entries()){const f=allocate(fixture());change(f);bad('config-unknown-'+i,f);}
});
test.after(()=>{fs.mkdirSync(process.env.B16_OUT,{recursive:true});fs.writeFileSync(process.env.B16_OUT+'/results.json',JSON.stringify(results,null,2));});
