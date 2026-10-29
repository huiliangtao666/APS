// Readiness evidence only. Imports the inspected product, changes no product code.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defs} from '../../server/planner.ts';
import {policyFixture} from '../../qa/dec0203-fixture.mjs';
import {jointEnabledFixture} from '../../qa/r01r02-fixture.mjs';
import {fixture} from '../../qa/fr027-fixture.mjs';
import {validatePolicyExecution} from '../../src/lib/resource-policies.mjs';
const at='2026-10-30T00:00:00Z',out=process.env.N06_OUT||'/evidence';
const result={kind:'baseline readiness probe, NOT N06 acceptance',productSHA:'7a26732efc0fb440ca6f8ac7aa6261e33757eb81',cases:[]};
const hash=x=>createHash('sha256').update(x).digest('hex');
const fact=(state='已开始')=>({'事实编号':'N06-F','订单编号':'A','工序编号':'MIX','状态':state,'开始分钟':'0','完成分钟':state==='已完成'?'30':'','观测分钟':state==='已完成'?'30':'0','工序完成数量':state==='已完成'?'240':'0','数量单位':'kg','剩余工时分钟':state==='已完成'?'0':'30','当前设备':'MIX01','暂停原因':state==='暂停'?'合成暂停':''});
const d=jointEnabledFixture();
for(const state of ['已开始','部分完成','暂停','已完成']){
 d.executionFacts=[fact(state)];const issues=validatePolicyExecution(d,at);
 assert.equal(issues.length,1);for(const text of ['工装 G40','空间 COOL','人员 G1','人员 G2'])assert.ok(issues[0].message.includes(text));
 result.cases.push({id:'S-'+state,expected:'all adopted resources rejected without original ledger',actual:issues});
}
result.schemas=defs.filter(d=>['executionFacts','executionMaterials','executionSources','resourceClaims','dependencies','personnelPools'].includes(d.key));
assert.ok(!defs.some(d=>d.key==='executionResources'));
const f=await fixture(null);
try{
 let d=policyFixture();d.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2099-01-01T00:00:00Z';
 await f.ok('/inputs',{revision:0,tables:d});
 const created=await f.ok('/calculate',{revision:1});const old=(await f.ok('/plans')).find(p=>p.id===created.id);const oldInput=await f.ok('/plans/'+old.id+'/inputs');
 let s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{executionFacts:[fact()]}});
 s=await f.ok('/state');assert.equal(s.data.executionFacts[0]['事实编号'],'N06-F');
 result.savedFacts=s.data.executionFacts;
 const reject=async(id,tables,status,role='planner',revision=s.revision)=>{
  const before=f.bytes(),r=await f.call('/inputs',{tables,revision},role);assert.equal(r.status,status,JSON.stringify(r));assert.equal(f.bytes(),before);
  result.cases.push({id,response:r,beforeSHA256:hash(before),afterSHA256:hash(f.bytes())});return r;
 };
 const rules=structuredClone(s.data.rules);rules.find(r=>r['规则编号']==='MOLD')['生效时间']='';
 const a=await reject('API-enable-adopted-tool', {rules,tools:s.data.tools.map(t=>({...t,'可用数量':'2'}))},400);
 assert.ok(a.body.issues.some(i=>i.table==='executionFacts'&&i.message.includes('C-A')));
 await reject('API-unknown-ledger-table',{executionResources:[{'事实编号':'N06-F'}]},404);
 await reject('API-no-invented-ledger-field',{executionFacts:s.data.executionFacts.map(f=>({...f,'原始资源占用JSON':'[]'}))},400);
 await reject('API-query-denied',{rules},403,'query');
 await reject('API-outsider-denied',{rules},403,'outsider');
 await reject('API-stale-denied',{rules},409,'planner',0);
 await reject('API-delete-original-fact',{executionFacts:[]},409);
 const rollback=structuredClone(s.data.executionFacts);rollback[0]['开始分钟']='1';
 await reject('API-reanchor-fact-denied',{executionFacts:rollback},409);
 let run=await f.ok('/runs',{revision:s.revision,selection:{}});
 for(let i=0;i<300;i++){run=await f.ok('/runs/'+run.id);if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));
 const plan=(await f.ok('/plans')).find(p=>p.runId===run.id);assert.ok(plan);assert.ok(!plan.resourceReservations.some(r=>r.type==='工装'));
 const v=await f.ok('/plans/'+plan.id+'/verify',{});assert.equal(v.verification.checks.resourcePolicies.status,'not_checked');
 const inputs=await f.ok('/runs/'+run.id+'/inputs');assert.deepEqual(inputs.originalInput.executionFacts,s.data.executionFacts);
 assert.deepEqual(await f.ok('/plans/'+old.id+'/inputs'),oldInput);
 assert.deepEqual((await f.ok('/plans')).find(p=>p.id===old.id),old);
 result.cases.push({id:'API-worker-unadopted-only',run,plan,inputs,verification:v,note:'positive baseline only; resources not adopted. Does not prove N06.'});
 result.operations=await f.ok('/operations');result.historyUnchanged=true;result.complete=true;
}finally{fs.writeFileSync(out+'/n06-probe-results.json',JSON.stringify(result,null,2));await f.close();}
console.log(JSON.stringify({complete:result.complete,cases:result.cases.length,n06ProductImplemented:false}));
