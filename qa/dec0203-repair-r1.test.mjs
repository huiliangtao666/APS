import test from 'node:test';
import assert from 'node:assert/strict';
import {policyFixture,clone} from './dec0203-fixture.mjs';
import {fixture} from './fr027-fixture.mjs';
import {calculate,defs} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {assessRules} from '../src/lib/business-rules.mjs';
import {validatePolicyExecution} from '../src/lib/resource-policies.mjs';
import {personnelWindows} from '../src/lib/staffing.mjs';
import {independentlyVerifyPlan as verify} from '../src/lib/independent-verification.mjs';
const at='2026-10-29T05:00:00Z';
const compute=(d,selection={},time=at)=>{const f=freezeRunInput(d,selection,time);return {f,p:calculate(f.executionData,0,time,f.conditions)};};
const check=({p,f},data=f.executionData,conditions=f.conditions)=>verify(p,data?.orders,data?.routes,p.rules,'2100-01-01T00:00:00Z',data,conditions).checks.resourcePolicies;
function combined(){const d=policyFixture(),staff=policyFixture('personnel');for(const key of ['dependencies','personnelGroups','skillSubstitutions'])d[key]=staff[key];return d;}
const fact=(order='A',op='MIX')=>({'事实编号':'QA-F','订单编号':order,'工序编号':op,'状态':'已开始','开始分钟':'0','完成分钟':'','观测分钟':'0','工序完成数量':'0','数量单位':'kg','剩余工时分钟':'30','当前设备':'MIX01','暂停原因':''});
test('D01 frozen enabled MOLD cannot be removed alongside all tool ledger, with or without personnel',()=>{
 for(const d of [policyFixture(),combined()]){const a=compute(d);assert.equal(check(a).status,'pass');a.p.rules=a.p.rules.filter(id=>id!=='MOLD');a.p.resourceReservations=a.p.resourceReservations.filter(r=>r.type!=='工装');const v=check(a);assert.equal(v.status,'problem');assert.ok(v.details.some(s=>s.includes('MOLD')));assert.ok(v.details.some(s=>s.includes('缺失')));}
});
test('D01 frozen selection/time and minimal scope, explicit missing-input diagnostics',()=>{
 const d=policyFixture();const selected=d.rules.filter(r=>r['是否启用']==='是'&&r['规则编号']!=='MOLD').map(r=>r['规则编号']);
 const off=compute(d,{enabledRuleIds:selected});assert.equal(check(off).status,'not_checked');
 off.p.rules.push('MOLD');assert.equal(check(off).status,'problem');
 const minimal=compute(d,{mode:'minimal-r1'});assert.equal(check(minimal).status,'not_checked');
 d.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2099-01-01T00:00:00Z';
 const future=compute(d);assert.equal(check(future).status,'not_checked');
 const active=compute(d,{},'2099-01-01T00:00:00Z');assert.equal(check(active).status,'pass');
 const missing=check(active,null);assert.equal(missing.status,'not_checked');assert.match(missing.details.join(),/缺少冻结输入/);
 const noTime=clone(active);delete noTime.p.ruleSnapshot.at;assert.equal(check(noTime,noTime.f.executionData,{}).status,'not_checked');
 const partial=clone(active);delete partial.f.executionData.tools;assert.equal(check(partial).status,'not_checked');
 // Trusted run conditions override a falsified result copy's scope/time.
 const tamper=compute(policyFixture());tamper.p.conditions={mode:'minimal-r1',ruleEvaluationAt:'2000-01-01T00:00:00Z',enabledRuleIds:[]};tamper.p.rules=[];tamper.p.resourceReservations=[];assert.equal(check(tamper).status,'problem');
});
test('D02 named personnel windows reject each missing/bad endpoint but accept explicit zero; legacy unnamed preserved',()=>{
 for(const key of ['人员开始偏移','人员结束偏移'])for(const value of ['',undefined,' ','-1','NaN','Infinity','0.5','525601','9007199254740992']){
  const d=policyFixture('personnel'),r=d.dependencies.find(r=>r['资源类型']==='人员技能');r[key]=value;
  assert.ok(validateInputs(defs,d).some(i=>i.table==='dependencies'&&i.field===key),key+': '+value);
  assert.throws(()=>personnelWindows([r],0,30));
 }
 const d=policyFixture('personnel');for(const r of d.dependencies.filter(r=>r['资源类型']==='人员技能')){r['人员开始偏移']='0';r['人员结束偏移']='0';}
 assert.deepEqual(validateInputs(defs,d),[]);assert.equal(check(compute(d)).status,'pass');
 const r=d.dependencies.find(r=>r['资源类型']==='人员技能');delete r['人员参与阶段'];r['人员开始偏移']='';r['人员结束偏移']='';assert.deepEqual(validateInputs(defs,d),[]);assert.equal(personnelWindows([r],0,30)[0].start,0);
});
test('D02 API and CSV reject endpoints atomically, including entire mixed batch; repair with explicit zero',async t=>{
 const f=await fixture(t);let s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:policyFixture('personnel')});
 for(const key of ['人员开始偏移','人员结束偏移']){
  s=await f.ok('/state');const rows=clone(s.data.dependencies);rows.find(r=>r['资源类型']==='人员技能')[key]='';const before=f.bytes();
  const x=await f.call('/inputs',{revision:s.revision,tables:{dependencies:rows,personnelGroups:s.data.personnelGroups.map(r=>({...r,'人员数量':'2'}))}});assert.equal(x.status,400);assert.equal(f.bytes(),before);assert.ok(x.body.issues.some(i=>i.table==='dependencies'&&i.field===key));
  const def=defs.find(d=>d.key==='dependencies'),q=x=>'"'+String(x??'').replaceAll('"','""')+'"',csv=[def.fields,...rows.map(r=>def.fields.map(k=>r[k]))].map(r=>r.map(q).join(',')).join('\r\n');
  const imp=await f.call('/imports/preview',{revision:s.revision,files:[{name:def.file,text:csv}]});assert.ok(imp.status===400||imp.body.valid===false);assert.equal(f.bytes(),before);
  rows.find(r=>r['资源类型']==='人员技能')[key]='0';assert.equal((await f.call('/inputs',{revision:s.revision,tables:{dependencies:rows}})).status,200);
 }
});
test('D03 adopted execution guard uses instant, selected rule, exact operation and intrinsic personnel',()=>{
 const d=policyFixture();d.executionFacts=[fact()];const rule=d.rules.find(r=>r['规则编号']==='MOLD');rule['生效时间']='2099-01-01T00:00:00Z';
 assert.deepEqual(validatePolicyExecution(d,at),[]);assert.deepEqual(validatePolicyExecution(d,'2098-12-31T23:59:59Z'),[]);
 const exact=validatePolicyExecution(d,'2099-01-01T00:00:00Z');assert.equal(exact.length,1);assert.match(exact[0].message,/A\/MIX.*G40.*C-A/);
 assert.deepEqual(validatePolicyExecution(d,'2099-01-01T00:00:00Z','minimal-r1'),[]);
 rule['是否启用']='否';assert.deepEqual(validatePolicyExecution(d,'2100-01-01T00:00:00Z'),[]);
 rule['是否启用']='是';rule['生效时间']='';d.resourceClaims=d.resourceClaims.filter(c=>c['订单编号']!=='A');assert.deepEqual(validatePolicyExecution(d,at),[]);
 const p=policyFixture('personnel');p.executionFacts=[fact()];p.rules.find(r=>r['规则编号']==='LABOR')['是否启用']='否';assert.match(validatePolicyExecution(p,at)[0].message,/人员 G1/);
 const selected=freezeRunInput({...policyFixture(),executionFacts:[fact()]},{enabledRuleIds:policyFixture().rules.filter(r=>r['是否启用']==='是'&&r['规则编号']!=='MOLD').map(r=>r['规则编号'])},at);assert.ok(!assessRules(selected.executionData,at,true).issues.some(i=>i.message.includes('原始工装')));
});
test('D03 API future/disabled facts accepted, actual Worker/verify; enable-with-missing-ledger atomically blocked',async t=>{
 const f=await fixture(t),d=policyFixture();d.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2099-01-01T00:00:00Z';let s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:d});
 s=await f.ok('/state');assert.equal((await f.call('/inputs',{revision:s.revision,tables:{executionFacts:[fact()]}})).status,200);
 s=await f.ok('/state');const before=f.bytes(),rules=clone(s.data.rules);rules.find(r=>r['规则编号']==='MOLD')['生效时间']='';const x=await f.call('/inputs',{revision:s.revision,tables:{rules}});assert.equal(x.status,400);assert.equal(f.bytes(),before);assert.ok(x.body.issues.some(i=>i.table==='executionFacts'&&i.message.includes('C-A')));
 let run=await f.ok('/runs',{revision:s.revision,selection:{}});for(let i=0;i<300;i++){run=await f.ok('/runs/'+run.id);if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,20));}assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));
 const p=(await f.ok('/plans')).find(p=>p.runId===run.id);assert.ok(p);assert.ok(!p.resourceReservations.some(r=>r.type==='工装'));assert.equal((await f.ok('/plans/'+p.id+'/verify',{})).verification.checks.resourcePolicies.status,'not_checked');
 rules.find(r=>r['规则编号']==='MOLD')['是否启用']='否';s=await f.ok('/state');assert.equal((await f.call('/inputs',{revision:s.revision,tables:{rules}})).status,200);
});
