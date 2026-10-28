import test from 'node:test';
import assert from 'node:assert/strict';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {problemInterval} from '../src/lib/task-linkage.mjs';
const orders=[{'订单编号':'A','产线编号':'L'}],routes=[{'产品编号':'P','工序编号':'MIX','前序工序':''},{'产品编号':'P','工序编号':'FILL','前序工序':'MIX'}];
const fixture=()=>({id:'saved',tasks:[{id:'A-MIX',orderId:'A',productId:'P',operation:'MIX',machine:'M',start:0,end:30},{id:'A-FILL',orderId:'A',productId:'P',operation:'FILL',machine:'M',start:20,end:45,predecessor:'A-MIX'}]});
const verify=p=>independentlyVerifyPlan(p,orders,routes);
const invalid=[undefined,null,'',' \t\n',NaN,Infinity,-Infinity,'Infinity','bad',false,[],{}];
test('invalid endpoint matrix never passes machine checks or produces geometry and leaves frozen data intact',()=>{
 for(const value of invalid)for(const i of [0,1])for(const key of ['start','end']){
  const p=fixture();p.tasks[i][key]=value;const before=structuredClone(p),old=verify(fixture()).findings;
  const r=verify(p);assert.equal(r.checks.machineOverlap.status,'problem');assert.equal(r.checks.precedence.status,'problem');assert.deepEqual(r.findings,[]);
  for(const f of old){assert.equal(problemInterval(p,f),null);const {interval,...legacy}=f;assert.equal(problemInterval(p,legacy),null);}
  assert.deepEqual(p,before);
 }
});
test('unknown first start with abutting successor cannot falsely pass',()=>{
 for(const value of invalid){const p=fixture();p.tasks[0].start=value;p.tasks[1].start=30;assert.equal(verify(p).checks.machineOverlap.status,'problem');}
});
test('zero, signed decimals and trimmed numeric strings retain valid overlap and precedence semantics',()=>{
 for(const zero of [0,'0',' 0 ','0.0','+0','0e0']){
  const p=fixture();p.tasks[0].start=zero;p.tasks[0].end='30';p.tasks[1].start='20.0';p.tasks[1].end='45';
  const r=verify(p);assert.equal(r.findings.length,2);for(const f of r.findings)assert.deepEqual(problemInterval(p,f),f.interval);
  p.tasks[1].start='30';assert.equal(verify(p).checks.machineOverlap.status,'pass');assert.equal(verify(p).checks.precedence.status,'pass');
 }
 const p=fixture();p.tasks[0].start='-2.5';p.tasks[1].start='0';assert.equal(verify(p).findings[0].interval.start,0);
});
test('invalid task excluded without hiding overlap between remaining valid tasks',()=>{
 const p=fixture();p.tasks.unshift({...p.tasks[0],id:'bad',start:null});const r=verify(p);assert.equal(r.findings.length,2);assert.ok(r.findings.every(f=>!f.taskIds.includes('bad')));
});
test('structured geometry must agree with raw task identity, machine, predecessor and every derived endpoint',()=>{
 for(const f of verify(fixture()).findings){
  for(const key of Object.keys(f.interval)){const p=fixture(),bad=structuredClone(f);bad.interval[key]=typeof bad.interval[key]==='number'?999:'wrong';assert.equal(problemInterval(p,bad),null);}
  const p=fixture();p.tasks[1].start=30;assert.equal(problemInterval(p,f),null);
  assert.equal(problemInterval(fixture(),{...f,taskIds:['A-MIX','missing']}),null);
  assert.equal(problemInterval(fixture(),{...f,code:'UNPLANNED / MATERIAL'}),null);
 }
});
