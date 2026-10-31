import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate,seed,defs} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {jointFixture} from './joint-fixture.mjs';
import {maxLagFixture} from './fr022-maxlag-contract-fixture.mjs';
const at='2026-10-31T00:00:00Z',results=[];
const save=(id,r)=>results.push({id,...r});
const audit=(p,f)=>independentlyVerifyPlan(p,f.executionData.orders,f.executionData.routes,p.rules,at,f.executionData,f.conditions);
const run=(d,selection={})=>{const input=freezeRunInput(d,selection,at),plan=calculate(input.executionData,1,at,input.conditions);return {data:d,input,plan,verification:audit(plan,input)};};
const maxStatus=v=>v.ruleStatuses.find(r=>r.id==='MAX_LAG');
const rule=(d,id)=>d.rules.find(r=>r['规则编号']===id);
const peak=(rows,id)=>Math.max(0,...rows.filter(r=>r.resourceId===id).map(a=>rows.filter(r=>r.resourceId===id&&r.start<=a.start&&r.end>a.start).reduce((s,r)=>s+Number(r.quantity),0)));

test('MAXLAG-C01 old six identities have no declared wait; activation exposes explicit rejection, never PASS',()=>{
 const d=jointFixture(seed);rule(d,'MOLD')['生效时间']='2027-01-01T00:00:00Z';
 const before=run(d);
 assert.deepEqual(before.plan.tasks.map(t=>[t.id,t.operation,t.start,t.end]),['A','B','C'].flatMap(id=>[[id+'-MIX','MIX',0,30],[id+'-FILL','FILL',30,60]]));
 assert.ok(d.routes.every(r=>!String(r['最大等待分钟']||'').trim()));
 const raw=structuredClone(d);rule(d,'MAX_LAG')['是否启用']='是';const rejected=run(d);
 assert.equal(rejected.plan.name,'规则配置阻止计算');assert.deepEqual(rejected.plan.tasks,[]);assert.deepEqual(rejected.plan.resourceReservations,[]);
 assert.ok(rejected.plan.findings.some(f=>f.code==='RULE / CONFIG'&&/MAX_LAG须有显式加工\/冷却顺序配对/.test(f.message)));
 assert.ok(validateInputs(defs,d).some(f=>f.code==='INPUT / PROCESS_PAIR'));
 assert.equal(maxStatus(rejected.verification).status,'not_checked');
 assert.ok(Object.values(rejected.verification.checks).every(c=>c.status!=='pass'));
 save('old-six',{before,rawBeforeMax:raw,rejected});
});

test('MAXLAG-C02 full five operations retain every enabled resource, fixed durations and quantities from source',()=>{
 const d=maxLagFixture(),raw=JSON.stringify(d),r=run(d);assert.equal(JSON.stringify(d),raw);assert.deepEqual(validateInputs(defs,d),[]);assert.deepEqual(r.plan.findings,[]);
 const names=['MIX','FILL','HEAT','COOL','PACK'];
 assert.deepEqual(r.plan.tasks.map(t=>t.operation),names);
 for(const [i,name]of names.entries()){
  const t=r.plan.tasks[i],source=d.times.find(x=>x['工序编号']===name);
  assert.equal(t.id,JSON.stringify(['A',1,name]));assert.equal(t.duration,Number(source['固定分钟']));assert.equal(t.end-t.start,t.duration);assert.equal(t.quantity,240);
  assert.equal(t.predecessor,i?JSON.stringify(['A',1,names[i-1]]):'');
  if(i)assert.ok(t.start>=r.plan.tasks[i-1].end);
 }
 const h=r.plan.tasks[2],c=r.plan.tasks[3];assert.ok(c.start>=210);assert.ok(h.start>=80,'180-minute earliest end must move to >=200 to respect cold-open210/max10');
 assert.ok(c.start-h.end>=0&&c.start-h.end<=10);assert.equal(h.loadKg,250);assert.equal(c.loadKg,240);
 assert.equal(r.plan.productionBatches.reduce((s,b)=>s+b.quantity,0),240);
 assert.equal(r.plan.materialDemands.filter(m=>m.unit==='kg'&&m.committed).reduce((s,m)=>s+m.quantity,0),250);
 const required=['MACHINE','PRECEDENCE','CALENDAR','LABOR','MATERIAL','MOLD','CAPACITY','PROGRAM','MAX_LAG','STORAGE'];
 assert.ok(required.every(id=>r.plan.rules.includes(id)));
 assert.equal(maxStatus(r.verification).status,'pass');assert.ok(Object.values(r.verification.checks).every(c=>c.status==='pass'),JSON.stringify(r.verification));
 assert.equal(peak(r.plan.resourceReservations,'MAXLAG-T'),1);assert.equal(peak(r.plan.resourceReservations,'MAXLAG-G'),1);assert.equal(peak(r.plan.resourceReservations,'COLD'),240);
 for(const type of ['设备','工装','人员','空间'])assert.ok(r.plan.resourceReservations.some(row=>row.type===type));
 const reopened=JSON.parse(JSON.stringify(r));assert.deepEqual(audit(reopened.plan,reopened.input),r.verification);
 save('legal-five-all-resources',r);
});

// Independent AC14 oracle: fixed COOL [210,270), HEAT duration120,
// FILL completion60. HEAT=[90-w,210-w); wait = 210-(210-w) = w.
// Move every HEAT resource ledger to that raw interval; do not ask a scheduler
// for an expected wait or alter duration/config/remaining tasks to hide gaps.
for(const wait of [0,10,11,30])test(`MAXLAG-W${wait} fixed output wait${wait} is ${wait<=10?'legal':'illegal'}`,()=>{
 const r=run(maxLagFixture()),p=structuredClone(r.plan),h=p.tasks.find(t=>t.operation==='HEAT'),c=p.tasks.find(t=>t.operation==='COOL');
 assert.equal(c.start,210);assert.equal(h.duration,120);h.start=90-wait;h.end=210-wait;
 for(const row of p.resourceReservations.filter(row=>row.taskIds.includes(h.id))){row.start=h.start;row.end=h.end;}
 assert.equal(c.start-h.end,wait);assert.ok(h.start>=60);
 const verification=audit(p,r.input),s=maxStatus(verification);assert.equal(s.status,wait<=10?'pass':'problem');
 const gaps=verification.findings.filter(f=>/最大等待|等待 \d+ >/.test(f.message));
 if(wait>10){assert.ok(gaps.length);assert.ok(gaps.some(f=>f.taskIds.includes(c.id)));assert.equal(verification.checks.batchAndWait.status,'problem');assert.ok(verification.findings.some(f=>f.code==='VERIFY / MAX_LAG'&&f.message.includes('缺口 '+(wait-10))));}
 else assert.ok(Object.values(verification.checks).every(c=>c.status==='pass'),JSON.stringify(verification));
 save('wait-'+wait,{input:r.input,plan:p,rawOracle:{heatStart:90-wait,heatEnd:210-wait,coolingStart:210,maximum:10,wait,expectedGap:Math.max(0,wait-10)},verification});
});

test('MAXLAG-C03 explicit zero max is legal and enforced without inventing a missing default',()=>{
 const d=maxLagFixture();d.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']='0';const r=run(d);
 assert.deepEqual(r.plan.findings,[]);const h=r.plan.tasks.find(t=>t.operation==='HEAT'),c=r.plan.tasks.find(t=>t.operation==='COOL');assert.equal(c.start-h.end,0);assert.equal(maxStatus(r.verification).status,'pass');save('explicit-zero-max',r);
});

const bad=[
 ['missing-pair',d=>d.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']=''],
 ['missing-predecessor',d=>d.routes.find(r=>r['工序编号']==='COOL')['前序工序']='MISSING'],
 ['wrong-predecessor',d=>d.routes.find(r=>r['工序编号']==='COOL')['前序工序']='MIX'],
 ['missing-cold-claim',d=>d.resourceClaims=d.resourceClaims.filter(r=>r['资源类型']!=='空间')],
 ['wrong-cold-quantity',d=>d.resourceClaims.find(r=>r['资源类型']==='空间')['需求数量']='250'],
 ['invalid-max-negative',d=>d.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']='-1'],
 ['invalid-max-nan',d=>d.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']='NaN'],
 ['invalid-max-json',d=>rule(d,'MAX_LAG')['参数JSON']='{'],
 ['unsupported-max-parameter',d=>rule(d,'MAX_LAG')['参数JSON']='{"defaultWait":10}'],
 ...['MATERIAL','CAPACITY','PROGRAM','STORAGE','CALENDAR'].map(id=>['missing-required-'+id,d=>d.rules=d.rules.filter(r=>r['规则编号']!==id)])
];
for(const [id,change]of bad)test('MAXLAG-N '+id+' rejects explicitly and atomically',()=>{
 const d=maxLagFixture();change(d);assert.ok(validateInputs(defs,d).length);
 if(id==='missing-required-CALENDAR'){assert.throws(()=>freezeRunInput(d,{},at),/invalid_rule_selection/);const p=calculate(d,1,at);assert.deepEqual(p.tasks,[]);assert.ok(p.findings.some(f=>/CALENDAR/.test(f.message)));save(id,{data:d,validation:validateInputs(defs,d),admissionError:'invalid_rule_selection',plan:p});return;}
 const r=run(d);assert.deepEqual(r.plan.tasks,[]);assert.deepEqual(r.plan.resourceReservations,[]);assert.ok(r.plan.findings.some(f=>f.message&&/CONFIG|PROCESS_ROUTE/.test(f.code)),JSON.stringify(r.plan.findings));
 assert.notEqual(maxStatus(r.verification)?.status,'pass');save(id,r);
});
for(const state of ['disabled','future','missing','minimal'])test('MAXLAG-S '+state+' never reports max wait PASS',()=>{
 const d=maxLagFixture();if(state==='disabled')rule(d,'MAX_LAG')['是否启用']='否';if(state==='future')rule(d,'MAX_LAG')['生效时间']='2027-01-01T00:00:00Z';if(state==='missing')d.rules=d.rules.filter(r=>r['规则编号']!=='MAX_LAG');
 const r=run(d,state==='minimal'?{mode:'minimal-r1'}:{}),status=maxStatus(r.verification);
 assert.ok(status===undefined||status.status==='not_checked',JSON.stringify(status));
 assert.notEqual(r.verification.checks.processRoute?.status,'pass');save('state-'+state,r);
});
test.after(()=>{if(process.env.FR022_OUT){fs.mkdirSync(process.env.FR022_OUT,{recursive:true});fs.writeFileSync(process.env.FR022_OUT+'/contract-results.json',JSON.stringify(results,null,2));}});
