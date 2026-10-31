import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {b2Host} from './b2-host.mjs';import {b2Worker} from './b2-fixture.mjs';import {fixture,selection,hpolicy,executionMock,hash,sourceView} from './b08-test-fixture.mjs';
import {occupationOrders} from '../src/lib/personnel-occupation.mjs';import {resourceTaskSources} from '../src/lib/resource-workbench.mjs';import {resourceConflicts} from '../src/lib/resource-conflicts.mjs';
const out=process.env.B08_OUT;if(!out||!path.isAbsolute(out))throw Error('B08_OUT must be an absolute isolated output');fs.mkdirSync(out,{recursive:true});const dump=(n,x)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(x,null,2)),checks=[];
const cases=(process.env.B08_CASES||'core,arrival60,aux-denied,aux-directed,aux-disabled,pool1,hp04-expand,hp04-availability,phase,whole,shift,stop,horizon59,n06').split(',');
for(const name of cases){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b08-'+name+'-'));let f=await b2Host({dir});
 try{
  const x=fixture();let d=x.data;const people=d.dependencies.filter(r=>r['资源类型']==='人员技能');
  if(name==='arrival60')d.personnelGroups[0]['可用起始分钟']='60';
  if(name.startsWith('aux-')){people.forEach(r=>r['资源编号']='LP-GENERAL');if(name!=='aux-denied')d.skillSubstitutions=[{'关系编号':'B08-DIRECT','可提供技能':'普通辅助','所需技能':'综合操作','适用工序':'*','是否启用':'是'}];if(name==='aux-disabled')d.skillSubstitutions.push({'关系编号':'B08-DISABLED','可提供技能':'普通辅助','所需技能':'综合操作','适用工序':'MIX','是否启用':'否'});}
  if(name==='pool1')d.personnelPools[0]['总人数']='1';
  if(name.startsWith('hp04-'))people.forEach(r=>Object.assign(r,hpolicy(occupationOrders[name==='hp04-expand'?0:1])));
  if(['phase','whole'].includes(name))people.forEach(r=>Object.assign(r,{'人员参与阶段':'B08-explicit-first10','人员开始偏移':'0','人员结束偏移':'20','窗口外释放':name==='phase'?'是':'否'}));
  if(name==='shift')d.calendars=[{...d.calendars[0],'结束分钟':'45'},{...d.calendars[0],'起始分钟':'60'}];
  if(name==='stop')d.resourceStops=[{'例外编号':'B08-STOP','资源类型':'人员','资源编号':'LP01','起始分钟':'0','结束分钟':'60','原因':'B08 explicit availability boundary'}];
  if(name==='n06')d=executionMock();
  await f.ok('/state');await f.ok('/inputs',{revision:0,tables:d});const s=selection(d);if(name==='horizon59')s.endMinute=59;if(name==='n06')s.startMinute=40;
  const r=await b2Worker(f,s),task=id=>r.plan.tasks.find(t=>t.id===id),verify=await f.ok('/plans/'+r.plan.id+'/verify',{});
  const expected=['aux-denied','aux-disabled'].includes(name)?0:name==='pool1'?2:name==='horizon59'?1:4;assert.equal(r.plan.tasks.length,expected,name+': '+JSON.stringify(r.plan.findings));
  if(name==='core'){assert.equal(task('A-MIX').start,0);assert.equal(task('A-FILL').start,30);assert.equal(task('B-MIX').start,30);assert.equal(task('B-FILL').start,60);assert.deepEqual(r.input.conditions.enabledRuleIds,['MACHINE','PRECEDENCE','CALENDAR','MOLD','LABOR']);}
  if(['arrival60','stop'].includes(name))assert.ok(r.plan.resourceReservations.filter(r=>r.type==='人员').every(r=>r.start>=60));
  if(name.startsWith('hp04-')){assert.ok(task('A-MIX').start>=5);assert.ok(r.plan.resourceReservations.filter(r=>r.type==='人员').every(r=>r.start>=0&&r.occupationPolicies.every(p=>p.before===5&&p.after===10)));}
  if(name==='phase')assert.ok(r.plan.resourceReservations.filter(r=>r.type==='人员').every(r=>r.end-r.start===10));
  if(name==='whole')assert.ok(r.plan.resourceReservations.filter(r=>r.type==='人员').every(r=>r.end-r.start===30));
  if(name==='n06'){assert.equal(r.input.conditions.executionResourceContract,'N06-finite-v1');assert.ok(r.plan.tasks.filter(t=>t.id!=='A-MIX').every(t=>t.start>=40));}
  assert.equal(verify.verification.checks.resourcePolicies.status,expected?'pass':'not_checked');
  const view=sourceView(r,x),refs=resourceTaskSources(view,[r.plan.tasks[0]?.id||r.plan.findings[0]?.taskIds?.[0]]);
  if(name==='core')assert.ok(refs.some(r=>r.table==='originalPersonnel'));
  dump(name,{...r,data:d,raw:x.raw,provenance:x.provenance,dataFingerprint:hash(d),configFingerprint:hash({people:d.personnelGroups,pools:d.personnelPools,requirements:d.dependencies,substitutions:d.skillSubstitutions,rules:d.rules}),verify,sources:refs});
  if(name==='core'){
   const bad=structuredClone(r.plan);bad.tasks.find(t=>t.id==='B-MIX').start=0;bad.tasks.find(t=>t.id==='B-MIX').end=30;for(const rr of bad.resourceReservations.filter(rr=>(rr.taskIds||[rr.taskId]).includes('B-MIX'))){rr.start-=30;rr.end-=30;}
   const findings=resourceConflicts(bad,r.input.executionData,r.input.conditions);assert.ok(findings.some(f=>f.interval?.demand===3&&f.interval?.effectiveCapacity===2));dump('illegal-overlap',{plan:bad,findings,scope:'deliberate diagnostic mutation; not a Worker defect'});
   // Exercise persistence and re-open on the same frozen Worker output; private host uses production routers/store.
   const exported=await f.ok('/export',{planId:r.plan.id,resourceLoad:{start:0,end:600,kind:'resources'}});fs.writeFileSync(path.join(out,'core-export.csv'),exported);const bytes=f.bytes(),before=hash(bytes);await f.close();f=await b2Host({dir});const reopened=(await f.ok('/plans')).find(p=>p.id===r.plan.id);dump('reopen-comparison',{original:r.plan,reopened,storeBefore:JSON.parse(bytes),storeAfter:JSON.parse(f.bytes())});assert.equal(hash(reopened.tasks),hash(r.plan.tasks));assert.equal(hash(reopened.resourceReservations),hash(r.plan.resourceReservations));assert.equal(reopened.snapshotHash,r.plan.snapshotHash);assert.equal(reopened.inputVersionId,r.plan.inputVersionId);const again=await f.ok('/export',{planId:r.plan.id,resourceLoad:{start:0,end:600,kind:'resources'}});assert.equal(again,exported);fs.writeFileSync(path.join(out,'core-reopen-export.csv'),again);dump('reopen',{planId:reopened.id,snapshot:await f.ok('/runs/'+r.run.id+'/inputs'),storeHash:before,sourceRefs:resourceTaskSources(sourceView({...r,plan:reopened},x),['A-MIX'])});
  }
  checks.push({id:name,status:'PASS',tasks:expected,runId:r.run.id,dataFingerprint:hash(d)});dump('results',{checks});
 }finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b08-guards-')),f=await b2Host({dir});try{
 const d=fixture().data;await f.ok('/state');await f.ok('/inputs',{revision:0,tables:d});const state=await f.ok('/state'),guards=[];
 const variants=[['blank-offset',()=>({dependencies:d.dependencies.map(r=>r['资源类型']==='人员技能'?{...r,'人员开始偏移':''}:r)})],['negative-people',()=>({personnelGroups:d.personnelGroups.map(g=>({...g,'人员数量':'-1'}))})],['unknown-order',()=>({dependencies:d.dependencies.map(r=>r['资源类型']==='人员技能'?{...r,...hpolicy('unknown')}:r)})],['missing-skill',()=>({dependencies:d.dependencies.map(r=>r['资源类型']==='人员技能'?{...r,'所需技能':''}:r)})]];
 for(const [id,tables] of variants){const before=f.bytes(),response=await f.call('/inputs',{revision:state.revision,tables:tables()});assert.equal(response.status,400,JSON.stringify(response));assert.equal(f.bytes(),before);guards.push({id,status:'PASS',response,beforeSha256:hash(before),afterSha256:hash(f.bytes())});}dump('guards',guards);dump('results',{checks,guards,complete:true});
}finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
