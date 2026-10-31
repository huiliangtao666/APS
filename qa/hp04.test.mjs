import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {hp04Fixture,hp04Orders} from './hp04-fixture.mjs';
import {allocatePersonnel,personnelWindows} from '../src/lib/staffing.mjs';
import {freezeRunInput} from '../server/run-input.mjs';import {calculate,defs} from '../server/planner.ts';
import {validateInputs} from '../server/input-validation.mjs';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
import {fixture} from './fr027-fixture.mjs';import {decision} from './n06-fixture.mjs';
const out=process.env.HP04_OUT;const save=(name,value)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2));}};
const solve=(d,selection={orderIds:['A','B'],startMinute:0,endMinute:600})=>{const f=freezeRunInput(d,selection);return {f,p:calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions)}};
for(const order of hp04Orders)test('HP04 full-window pool capacity and half-open boundary: '+order,()=>{
 const d=hp04Fixture(order);assert.deepEqual(validateInputs(defs,d),[]);const {f,p}=solve(d);
 assert.equal(p.tasks.length,2,JSON.stringify(p.findings));assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[5,35],[50,80]]);
 assert.deepEqual(p.resourceReservations.filter(r=>r.type==='人员').map(r=>[r.start,r.end]),[[0,45],[45,90]]);
 assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
 const v=structuredClone(p);v.resourceReservations.find(r=>r.type==='人员').start=5;assert.equal(verifyResourcePolicies(v,f.executionData,f.conditions).status,'problem');
 const forged=structuredClone(p);forged.resourceReservations.find(r=>r.type==='人员').occupationPolicies[0].version='forged';assert.equal(verifyResourcePolicies(forged,f.executionData,f.conditions).status,'problem');
 save('full-'+hp04Orders.indexOf(order)+'.json',{data:d,frozen:f,plan:p});
});
test('HP04 configured scope, retained pool, overlap max and separate roles; no implicit minutes/order',()=>{
 const d=hp04Fixture(),r=d.dependencies.find(r=>r['资源类型']==='人员技能');Object.assign(r,{'人员开始偏移':'5','人员结束偏移':'5'});
 assert.deepEqual(personnelWindows([r],20,50).map(w=>[w.start,w.end]),[[20,55]]);
 r['人员占用基准']='完整工序';assert.deepEqual(personnelWindows([r],20,50).map(w=>[w.start,w.end]),[[15,60]]);
 r['人员占用基准']='参与窗口';r['窗口外释放']='否';assert.deepEqual(personnelWindows([r],20,50).map(w=>[w.start,w.end]),[[15,60]]);
 assert.equal(personnelWindows([r,{...r}],20,50)[0].count,1);
 for(const k of ['提前占用分钟','后延占用分钟','人员占用基准','人员检查顺序','人员配置来源','人员配置版本']){const bad=hp04Fixture();bad.dependencies.find(r=>r['资源类型']==='人员技能')[k]='';assert.ok(validateInputs(defs,bad).some(i=>i.field===k),k);}
 const bad=hp04Fixture();bad.dependencies.find(r=>r['资源类型']==='人员技能')['提前占用分钟']='-1';assert.ok(validateInputs(defs,bad).length);
});
for(const order of hp04Orders)test('HP04 base passes but outside availability/shift/stop/capacity fails or moves: '+order,()=>{
 const d=hp04Fixture(order),r=d.dependencies.filter(r=>r['资源类型']==='人员技能').slice(0,1),g=d.personnelGroups,p=d.personnelPools;
 const ctx={data:{...d,calendars:[{'日历编号':'C','起始分钟':'0','结束分钟':'100','是否工作':'是'}]},calendarId:'C'};
 g[0]['可用起始分钟']='10';let x=allocatePersonnel(r,g,10,40,[],[],p,ctx);assert.equal(x.ok,false);assert.equal(x.nextStart,15);
 x=allocatePersonnel(r,g,15,45,[],[],p,ctx);assert.equal(x.ok,true);
 x=allocatePersonnel(r,g,70,100,[],[],p,ctx);assert.equal(x.ok,false); // post10 exceeds shift
 ctx.data.resourceStops=[{'资源类型':'人员','资源编号':'A','起始分钟':'5','结束分钟':'10'}];g[0]['可用起始分钟']='0';
 assert.equal(allocatePersonnel(r,g,10,40,[],[],p,ctx).ok,false); // only pre occupation hits stop
 assert.equal(allocatePersonnel(r,g,15,45,[],[],p,ctx).ok,true);
 assert.equal(allocatePersonnel(r,g,15,45,[{groupId:'B',count:1,start:5,end:15}],[],p,ctx).ok,false); // pre portion in same pool
 r[0]['所需班次']='WRONG';assert.equal(allocatePersonnel(r,g,15,45,[],[],p,ctx).ok,false);
 save('negative-'+hp04Orders.indexOf(order)+'.json',{data:d,last:x});
});
test('HP04 API permission, safe missing configuration zero write, real Worker frozen save/reopen/export',async t=>{
 const host=await fixture(t),d=hp04Fixture();await host.ok('/inputs',{revision:0,tables:d});let state=await host.ok('/state');
 const bad=structuredClone(state.data.dependencies);bad.find(r=>r['资源类型']==='人员技能')['人员检查顺序']='';const bytes=host.bytes();
 assert.equal((await host.call('/inputs',{revision:state.revision,tables:{dependencies:bad}})).status,400);assert.equal(host.bytes(),bytes);
 assert.equal((await host.call('/inputs',{revision:state.revision,tables:{dependencies:d.dependencies}},'query')).status,403);assert.equal(host.bytes(),bytes);
 const initial=await host.ok('/runs',{revision:state.revision,selection:{orderIds:['A','B'],startMinute:0,endMinute:600}});let run;
 for(let n=0;n<400;n++){run=await host.ok('/runs/'+initial.id);if(['completed','partial','failed','timed_out'].includes(run.status))break;await new Promise(r=>setTimeout(r,15));}
 assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));const plan=(await host.ok('/plans')).find(p=>p.id===run.planId);assert.equal(plan.tasks.length,2);
 const snapshot=await host.ok('/runs/'+run.id+'/inputs');assert.equal(plan.resourceReservations.find(r=>r.type==='人员').start,0);
 await host.ok('/plans/'+plan.id+'/verify',{});const csv=await host.ok('/export',{planId:plan.id,resourceLoad:{start:0,end:600,kind:'resources'}});assert.ok(csv.includes('MOCK-hp04-r1')&&csv.includes(hp04Orders[0]));
 state=await host.ok('/state');const next=structuredClone(state.data.dependencies);next.filter(r=>r['资源类型']==='人员技能').forEach(r=>{r['提前占用分钟']='10';r['人员配置版本']='MOCK-hp04-r2'});await host.ok('/inputs',{revision:state.revision,tables:{dependencies:next}});
 assert.deepEqual(await host.ok('/runs/'+run.id+'/inputs'),snapshot);const old=(await host.ok('/plans')).find(p=>p.id===plan.id);assert.deepEqual(old.resourceReservations,plan.resourceReservations);
 save('api-worker.json',{run,plan,snapshot,csv,finalState:await host.ok('/state')});
});
test('HP04 explicit zero supported; all missing legacy fields do not activate extension or claim H-P04',()=>{
 const d=hp04Fixture(),r=d.dependencies.find(r=>r['资源类型']==='人员技能');r['提前占用分钟']='0';r['后延占用分钟']='0';assert.deepEqual(personnelWindows([r],0,30).map(w=>[w.start,w.end]),[[0,30]]);
 for(const k of ['人员占用基准','人员检查顺序','人员配置来源','人员配置版本'])r[k]='';assert.deepEqual(personnelWindows([r],0,30).map(w=>[w.start,w.end]),[[0,30]]);
});
