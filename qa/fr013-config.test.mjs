import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {configFixture,csvFiles,mapping} from './fr013-config-fixture.mjs';import {fixture} from './fr027-fixture.mjs';
import {freezeRunInput,inputHash} from '../server/run-input.mjs';import {calculate,defs} from '../server/planner.ts';import {validateInputs} from '../server/input-validation.mjs';import {validateResourceMappings,mappingFingerprintInput,resourceMappingDef} from '../src/lib/resource-mapping.mjs';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';import {verifyResourceMappingSnapshot} from '../src/lib/verify-resource-mapping.mjs';import {related} from '../src/lib/data-query.mjs';
const at='2026-10-30T12:00:00Z',solve=d=>{const f=freezeRunInput(d,{},at);return {f,p:calculate(f.executionData,1,at,f.conditions)};};
const spans=p=>p.tasks.map(t=>[t.start,t.end]).sort((a,b)=>a[0]-b[0]);
const wait=async(f,id)=>{let r;for(let i=0;i<300;i++){r=await f.ok('/runs/'+id);if(['completed','partial','failed'].includes(r.status))break;await new Promise(r=>setTimeout(r,10));}assert.ok(['completed','partial'].includes(r.status),JSON.stringify(r));return r;};
test('R-C01 tool typed identity, literal source, explicit different runtime alias, collision merge safe refusal',()=>{
 const d=configFixture('tool');assert.deepEqual(validateInputs(defs,d),[]);assert.notEqual(d.resourceMappings[0]['来源编号'],d.resourceMappings[0]['运行编号']);const {f,p}=solve(d);assert.equal(f.executionData.originalTools[0]['资源名称'],'带引号"\n同名工具');assert.deepEqual(spans(p),[[5,35],[50,80]]);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
 const second={...d.originalTools[0],'资源编号':'另一个','资源类型':'模具'};d.originalTools.push(second);d.resourceMappings.push(mapping('originalTools',second,d.tools[0]));assert.ok(validateResourceMappings(d).some(i=>i.field==='运行编号'));assert.throws(()=>freezeRunInput(d,{}),/NOT_READY_CONFIG/);
});
test('R-C02 groups keep distinct identity/skill/shift; two groups share one finite physical pool, never sum source counts',()=>{
 const d=configFixture(),r=solve(d);assert.deepEqual(validateInputs(defs,d),[]);assert.deepEqual(spans(r.p),[[0,30],[0,30]]);d.personnelPools[0]['总人数']='1';const r2=solve(d);assert.deepEqual(spans(r2.p),[[0,30],[30,60]]);assert.equal(verifyResourcePolicies(r2.p,r2.f.executionData,r2.f.conditions).status,'pass');
 for(const key of ['人员组名称','班次','poolId']){const x=configFixture();x.personnelGroups[0][key]='';x.resourceMappings[0]['运行记录JSON']=JSON.stringify(x.personnelGroups[0]);assert.ok(validateResourceMappings(x).length,key);}
});
test('R-C03 explicit current single-line global pool membership; local, unknown and cross-line scopes safely rejected',()=>{
 for(const [key,value] of [['适用产线','L02'],['适用产线',''],['范围模式','复制到各产线']]){const d=configFixture();d.resourceMappings[0][key]=value;assert.ok(validateResourceMappings(d).some(i=>i.field===key));}
 const d=configFixture();d.originalPersonnel[0]['共享范围']='L01,L02';Object.assign(d.resourceMappings[0],{'共享范围原文':'L01,L02','源记录JSON':JSON.stringify(d.originalPersonnel[0])});assert.throws(()=>freezeRunInput(d,{}),/NOT_READY_CONFIG/);
});
test('R-C04 supported P10 shared/mutex/handover upper bound; unsupported modes/units/capacity cannot activate',()=>{
 for(const [mode,expected] of [['无互斥',[[0,30],[0,30]]],['工序互斥',[[0,30],[30,60]]]]){const d=configFixture();Object.assign(d.personnelPools[0],{'允许共用':mode==='无互斥'?'是':'否','互斥粒度':mode});const r=solve(d);assert.deepEqual(spans(r.p),expected);assert.equal(verifyResourcePolicies(r.p,r.f.executionData,r.f.conditions).status,'pass');}
 for(const [field,value] of [['映射模式','SUM_POOL'],['容量单位','件'],['时间单位','小时']]){const d=configFixture();d.resourceMappings[0][field]=value;assert.throws(()=>freezeRunInput(d,{}),/NOT_READY_CONFIG/);}
 const d=configFixture();Object.assign(d.personnelPools[0],{'交接模式':'窗口容量上限','交接起始分钟':'0','交接结束分钟':'30','交接容量人数':'0'});assert.deepEqual(spans(solve(d).p),[[30,60],[30,60]]);
});
test('R-C05 explicit demand/table12/table23 required; blank, missing, wrong type and disabled MOLD rejected',()=>{
 const d=configFixture('tool');d.resourceClaims=[];assert.throws(()=>freezeRunInput(d,{}),/NOT_READY_CONFIG/);
 const x=configFixture();x.dependencies=x.dependencies.filter(d=>d['资源类型']!=='人员技能');assert.throws(()=>freezeRunInput(x,{}),/NOT_READY_CONFIG/);
 const y=configFixture('tool');assert.throws(()=>freezeRunInput(y,{enabledRuleIds:y.rules.filter(r=>r['是否启用']==='是'&&r['规则编号']!=='MOLD').map(r=>r['规则编号'])}),/NOT_READY_CONFIG/);
 const z=configFixture('tool');z.resourceClaims[0]['需求数量']='';z.resourceClaims[0]['参数来源']='逐项声明';assert.ok(validateInputs(defs,z).length);
});
test('R-C06 exact integer fixed minute windows, boundaries, delayed acquire/release; unsupported fractional/multiwindow/date rejected',()=>{
 const d=configFixture('tool');d.originalTools[0]['最早可用分钟']='10';d.tools[0]['可用起始分钟']='10';d.resourceMappings[0]=mapping('originalTools',d.originalTools[0],d.tools[0]);assert.deepEqual(spans(solve(d).p),[[15,45],[60,90]]);
 for(const v of ['0.5','2026-11-02','-1','525601']){const x=configFixture('tool');x.originalTools[0]['最早可用分钟']=v;x.resourceMappings[0]['源记录JSON']=JSON.stringify(x.originalTools[0]);assert.throws(()=>freezeRunInput(x,{}),/NOT_READY_CONFIG/);}
 const x=configFixture();x.originalPersonnel.push({...x.originalPersonnel[0],'起始分钟':'300'});assert.ok(validateInputs(defs,x).length);
});
test('R-C07 independent checker rejects source binding/ledger tamper; half-open release and shared pool protect competing tasks',()=>{
 const r=solve(configFixture());assert.equal(verifyResourcePolicies(r.p,r.f.executionData,r.f.conditions).status,'pass');const bad=structuredClone(r);bad.f.executionData.resourceMappings[0]['源记录JSON']='{}';assert.equal(verifyResourcePolicies(bad.p,bad.f.executionData,bad.f.conditions).status,'problem');
 const d=configFixture();d.personnelPools[0]['总人数']='1';const r2=solve(d);assert.deepEqual(spans(r2.p),[[0,30],[30,60]]);r2.p.resourceReservations.find(r=>r.type==='人员').quantity=2;assert.equal(verifyResourcePolicies(r2.p,r2.f.executionData,r2.f.conditions).status,'problem');
 const versioned=structuredClone(r.f.executionData);versioned.resourceMappings[0]['配置版本']='999';assert.ok(verifyResourceMappingSnapshot(versioned,r.f.conditions).length);
 assert.ok(verifyResourceMappingSnapshot(r.f.executionData,{...r.f.conditions,originalResourceContract:null}).length);
});
test('R-C08 missing required READY fields, bad mixed CSV physical lines, unsupported combos and source drift cause complete zero writes',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:configFixture('tool')});const s=await f.ok('/state');
 for(const field of resourceMappingDef.fields.filter(f=>f!=='别名')){const m={...s.data.resourceMappings[0],[field]:'','配置版本':'2'};if(field==='配置版本')m[field]='';const before=f.bytes(),r=await f.call('/inputs',{revision:s.revision,tables:{resourceMappings:[m]}});assert.equal(r.status,400,field+JSON.stringify(r));assert.equal(f.bytes(),before,field);assert.ok(r.body.issues.some(i=>i.table==='resourceMappings'),field);}
 const x=configFixture('tool');x.resourceMappings[0]['容量单位']='件';const files=csvFiles({originalTools:x.originalTools,resourceMappings:x.resourceMappings}),before=f.bytes();const preview=await f.call('/imports/preview',{revision:s.revision,files});assert.equal(preview.status,400);assert.ok(preview.body.issues.some(i=>i.file===resourceMappingDef.file&&i.row===2&&i.field==='容量单位'));assert.ok(!preview.body.id);assert.equal(f.bytes(),before);
 const changed=s.data.originalTools.map(s=>({...s,'可用数量':'2'}));assert.equal((await f.call('/inputs',{revision:s.revision,tables:{originalTools:changed}})).status,400);assert.equal(f.bytes(),before);
});
test('R-C09 preview owner/revision/permission, save+reopen, frozen old async plan; new config version changes new runs only',async t=>{
 const f=await fixture(t),d=configFixture();await f.ok('/inputs',{revision:0,tables:d});const s=await f.ok('/state');
 const m=s.data.resourceMappings.map(m=>({...m,'配置版本':'2','别名':'new alias'}));let before=f.bytes();const pv=await f.ok('/inputs/resource-policy-preview',{revision:s.revision,tables:{resourceMappings:m}});assert.equal(pv.persisted,false);assert.equal(pv.candidate.resourceVerification.status,'pass');assert.equal(f.bytes(),before);
 for(const role of ['query','outsider']){assert.equal((await f.call('/inputs',{revision:s.revision,tables:{resourceMappings:m}},role)).status,403);assert.equal(f.bytes(),before);}
 const run=await f.ok('/runs',{revision:s.revision});await wait(f,run.id);const old=await f.ok('/runs/'+run.id+'/inputs'),plans=await f.ok('/plans');
 await f.ok('/inputs',{revision:s.revision,tables:{resourceMappings:m,personnelPools:[{...s.data.personnelPools[0],'总人数':'1'}]}});const reopened=await f.ok('/state');assert.deepEqual(reopened.data.resourceMappings,m);assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),old);assert.deepEqual(await f.ok('/plans'),plans);
 const nr=await f.ok('/runs',{revision:reopened.revision});await wait(f,nr.id);const ni=await f.ok('/runs/'+nr.id+'/inputs'),np=(await f.ok('/plans')).find(p=>p.runId===nr.id);assert.notEqual(ni.conditions.originalResourceVersion,old.conditions.originalResourceVersion);assert.equal(ni.conditions.originalResourceVersion,inputHash(mappingFingerprintInput(ni.executionData)));assert.deepEqual(spans(np),[[0,30],[30,60]]);
 before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{resourceMappings:m}})).status,409);assert.equal(f.bytes(),before);assert.equal((await f.call('/inputs',{revision:reopened.revision,tables:{resourceMappings:m.map(x=>({...x,'别名':'same version edit'}))}})).status,400);assert.equal(f.bytes(),before);
 const audit=await f.ok('/operations');assert.ok(audit.some(a=>a.target==='resourceMappings'&&a.role==='planner'&&a.actor==='test#planner'&&a.fromVersion&&a.toVersion));
});
test('R-C10 current vs historical query CSV contains frozen source/config/line/unit, explicit typed links and new Worker fingerprint',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:configFixture('tool')});const s=await f.ok('/state'),run=await f.ok('/runs',{revision:s.revision});await wait(f,run.id);const plan=(await f.ok('/plans'))[0],old=await f.ok('/runs/'+run.id+'/inputs');
 assert.equal(old.conditions.originalResourceContract,'FR013-resource-map-v1');const mappings=s.data.resourceMappings.map(m=>({...m,'配置版本':'2','别名':'CURRENT ALIAS'}));await f.ok('/inputs',{revision:s.revision,tables:{resourceMappings:mappings}});const current=await f.ok('/state');
 for(const historical of [true,false]){const r=await f.call('/export',{query:{table:'resourceMappings',planId:plan.id,revision:current.revision,...(historical?{sourcePlanId:plan.id}:{})}});assert.equal(r.status,200);assert.match(r.body,/FR013-resource-map-v1/);assert.match(r.body,/L01/);assert.match(r.body,/原件-T/);assert.match(r.body,/套/);assert.equal(r.body.includes('CURRENT ALIAS'),!historical);}
 assert.ok(related(s.data,'resourceMappings',0).some(r=>r.table==='originalTools'));assert.ok(related(s.data,'originalTools',0).some(r=>r.table==='resourceMappings'));
});
test('source-only storage/draft remains literal; new runs refuse absent config, no fallback or store write; preview tokens owner/revision protected',async t=>{
 const f=await fixture(t),d=configFixture('tool');d.resourceMappings=[];await f.ok('/inputs',{revision:0,tables:d});const s=await f.ok('/state'),before=f.bytes();assert.equal((await f.call('/runs',{revision:s.revision})).status,400);assert.equal(f.bytes(),before);
 const files=csvFiles({originalTools:d.originalTools});const p=await f.ok('/imports/preview',{revision:s.revision,files});assert.equal(p.valid,true);assert.equal(f.bytes(),before);assert.equal((await f.call('/imports/commit',{previewId:p.id},'supervisor')).status,409);assert.equal(f.bytes(),before);await f.ok('/imports/commit',{previewId:p.id});assert.equal(f.bytes(),before);
});
