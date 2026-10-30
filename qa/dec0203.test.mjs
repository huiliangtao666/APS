import test from 'node:test';import assert from 'node:assert/strict';
import {calculate,defs} from '../server/planner.ts';import {validateInputs} from '../server/input-validation.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {freezeRunInput} from '../server/run-input.mjs';import {skillMatch} from '../src/lib/resource-policies.mjs';
import {policyFixture,clone} from './dec0203-fixture.mjs';
const at='2026-10-29T05:00:00Z';
const compute=d=>{assert.deepEqual(validateInputs(defs,d),[]);const f=freezeRunInput(d,{},at),p=calculate(f.executionData,0,at,f.conditions);return {p,f};};
const times=p=>p.tasks.map(t=>t.start);
const check=({p,f})=>{const v=independentlyVerifyPlan(p,f.executionData.orders,f.executionData.routes,p.rules,at,f.executionData);assert.equal(v.checks.resourcePolicies.status,'pass',JSON.stringify(v));};
test('tool whole, phase, capacity, acquire/return boundaries, availability and immutable run input',()=>{
 const d=policyFixture(),a=compute(d);assert.deepEqual(times(a.p),[5,50]);check(a);
 assert.deepEqual(a.p.resourceReservations.filter(r=>r.type==='工装').map(r=>[r.start,r.end]),[[0,45],[45,90]]);
 d.resourceClaims.forEach(c=>Object.assign(c,{'占用口径':'明确窗口','窗口结束偏移分钟':'20'}));const b=compute(d);assert.deepEqual(times(b.p),[5,30]);check(b);
 d.tools[0]['可用数量']='2';const c=compute(d);assert.deepEqual(times(c.p),[5,5]);check(c);
 d.tools[0]['可用起始分钟']='10';const e=compute(d);assert.deepEqual(times(e.p),[15,15]);check(e);
 assert.equal(a.f.executionData.tools[0]['可用数量'],'1');
 const tamper=clone(a);tamper.p.resourceReservations=tamper.p.resourceReservations.filter(r=>r.type!=='工装');const v=independentlyVerifyPlan(tamper.p,d.orders,d.routes,tamper.p.rules,at,a.f.executionData);assert.equal(v.checks.resourcePolicies.status,'problem');
});
test('personnel phase vs retained full interval, shared skill capacity, directional disabled override and no transitivity',()=>{
 const d=policyFixture('personnel'),a=compute(d);assert.deepEqual(times(a.p),[0,10]);check(a);
 d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>r['窗口外释放']='否');const b=compute(d);assert.deepEqual(times(b.p),[0,30]);check(b);
 d.personnelGroups[0]['人员数量']='2';d.personnelGroups[0]['技能']='A,C';
 d.dependencies.push(...d.dependencies.filter(r=>r['资源类型']==='人员技能').map(r=>({...r,'所需技能':'C','人员参与阶段':'另一个技能岗位'})));
 const c=compute(d);assert.deepEqual(times(c.p),[0,30]);check(c);
 d.skillSubstitutions[0]['是否启用']='否';assert.equal(compute(d).p.tasks.length,0);
 const group={'技能':'B'};assert.equal(skillMatch(group,'A','MIX',[{'可提供技能':'A','所需技能':'B','适用工序':'*','是否启用':'是'}]),null);
 assert.equal(skillMatch({'技能':'A'},'C','MIX',[{'可提供技能':'A','所需技能':'B','适用工序':'*','是否启用':'是'},{'可提供技能':'B','所需技能':'C','适用工序':'*','是否启用':'是'}]),null);
 d.skillSubstitutions[0]['是否启用']='是';d.skillSubstitutions.push({...d.skillSubstitutions[0],'关系编号':'DENY-MIX','适用工序':'MIX','是否启用':'否'});assert.equal(compute(d).p.tasks.length,0);
});
test('multiple personnel windows release gap, overlapping named windows not double-counted and shift boundary',()=>{
 const d=policyFixture('personnel');d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>r['人员结束偏移']='25');
 d.dependencies.push(...d.dependencies.filter(r=>r['资源类型']==='人员技能').map(r=>({...r,'人员参与阶段':'明确卸载','人员开始偏移':'25','人员结束偏移':'0'})));
 const a=compute(d);assert.deepEqual(times(a.p),[0,5]);check(a);
 d.dependencies.push(...d.dependencies.filter(r=>r['人员参与阶段']==='明确准备窗口').map(r=>({...r,'人员参与阶段':'重叠阶段','人员开始偏移':'2'})));check(compute(d));
 d.personnelGroups[0]['可用起始分钟']='60';assert.deepEqual(times(compute(d).p),[60,65]);
 d.personnelGroups[0]['可用结束分钟']='90';assert.equal(compute(d).p.tasks.length,1);
});
test('invalid and contradictory resource policy configurations cannot be enabled/saved',()=>{
 for(const mutate of [d=>d.resourceClaims[0]['窗口结束偏移分钟']='31',d=>d.tools[0]['可用结束分钟']='',d=>d.resourceClaims[0]['需求数量']='2',d=>d.resourceClaims[0]['占用口径']='下游动态释放',d=>d.tools[0]['可用数量']='Infinity']){const d=policyFixture();mutate(d);assert.ok(validateInputs(defs,d).length);}
 const d=policyFixture('personnel');d.skillSubstitutions.push(clone(d.skillSubstitutions[0]));assert.ok(validateInputs(defs,d).length);
});
import {batchFixture} from './batch-fixture.mjs';import {seed} from '../server/planner.ts';import {migratePolicies} from '../src/lib/resource-policies.mjs';
test('batch members keep separate personnel role sources while sharing the same physical pool',()=>{
 const d=migratePolicies(batchFixture(seed));d.personnelGroups=[{'人员组编号':'POOL','人员组名称':'合批测试组','人员数量':'20','技能':'A','班次':'S','可用起始分钟':'0','可用结束分钟':'600'}];
 d.dependencies.push(...d.orders.map(o=>({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'POOL','需求数量':'1','所需技能':'A','所需班次':'S','人员参与阶段':'明确窗口','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是'})));
 const a=compute(d);assert.ok(a.p.tasks.length);check(a);
 const slots=a.p.resourceReservations.filter(r=>r.type==='人员');assert.ok(slots.length);assert.ok(slots.every(r=>r.roleSource));
 assert.equal(new Set(slots.map(r=>r.roleSource)).size,a.p.productionBatches.length);
 const tamper=clone(a);tamper.p.resourceReservations=tamper.p.resourceReservations.filter(r=>r!==tamper.p.resourceReservations.find(x=>x.type==='人员'));
 assert.equal(independentlyVerifyPlan(tamper.p,d.orders,d.routes,tamper.p.rules,at,a.f.executionData).checks.resourcePolicies.status,'problem');
});
test('unsupported multi-window tooling and execution/resource mixes reject explicitly instead of ignoring saved data',()=>{
 const d=policyFixture();d.resourceClaims.push({...d.resourceClaims[0],'声明编号':'SECOND'});assert.ok(validateInputs(defs,d).some(i=>i.message.includes('仅允许一条')));
 const f=policyFixture();f.executionFacts=[{'事实编号':'F','订单编号':'A','工序编号':'MIX'}];assert.ok(validateInputs(defs,f).some(i=>i.message.includes('不把阶段偏移重置')));
 const p=policyFixture('personnel');p.dependencies[0]['窗口外释放']='否';assert.ok(validateInputs(defs,p).some(i=>i.message.includes('仅适用于人员技能')));
});
test('fixed-output independent checker detects forged direction, count, coverage and shift',()=>{
 const base=compute(policyFixture('personnel'));
 for(const mutate of [r=>r.providedSkill='B',r=>r.quantity='2',r=>r.end-=1,r=>r.start=-1]){
  const c=clone(base);mutate(c.p.resourceReservations.find(r=>r.type==='人员'));assert.equal(independentlyVerifyPlan(c.p,c.f.executionData.orders,c.f.executionData.routes,c.p.rules,at,c.f.executionData).checks.resourcePolicies.status,'problem');
 }
 const c=clone(base);c.f.executionData.personnelGroups[0]['班次']='另一班';assert.equal(independentlyVerifyPlan(c.p,c.f.executionData.orders,c.f.executionData.routes,c.p.rules,at,c.f.executionData).checks.resourcePolicies.status,'problem');
});
import {legacyJointParameters,jointParameters} from '../src/lib/joint-policy.mjs';
test('old rule protocol remains accepted while new effective snapshot declares per-claim configurable policy',()=>{
 const d=policyFixture(),rule=d.rules.find(r=>r['规则编号']==='MOLD');rule['参数JSON']=JSON.stringify(legacyJointParameters);d.resourceClaims.forEach(c=>Object.assign(c,{'占用口径':'明确窗口','窗口结束偏移分钟':'20'}));
 const a=compute(d);assert.deepEqual(times(a.p),[5,30]);check(a);assert.equal(a.f.executionData.rules.find(r=>r['规则编号']==='MOLD')['参数JSON'],JSON.stringify(legacyJointParameters));assert.deepEqual(a.p.ruleSnapshot.settings.find(r=>r.id==='MOLD').parameters,jointParameters);
});
