import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {b2Scenario,b2Worker,canon} from './b2-fixture.mjs';import {occupancyOracle} from './b2-oracle.mjs';
import {resourceClient,resourceRunView,resourceTables} from '../src/lib/resource-workbench.mjs';
import {twoTasks} from './p10-explicit-fixture.mjs';import {s06Fixture} from './s06-fixture.mjs';
import {csvFiles} from './fr013-config-fixture.mjs';import {stageInput} from './issue6-stage-input.mjs';
const save=(name,x)=>{if(process.env.B2_EVIDENCE){fs.mkdirSync(process.env.B2_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.B2_EVIDENCE,name+'.json'),JSON.stringify(x,null,2));}};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const times=p=>Object.fromEntries(p.tasks.map(t=>[t.id,[t.start,t.end]]));
async function check(f,result){const oracle=occupancyOracle(result.plan,result.input.executionData),v=await f.ok('/plans/'+result.plan.id+'/verify',{});assert.equal(v.verification.checks.resourcePolicies.status,'pass');return oracle;}
for(const id of ['03','04','06','07','08'])test('B2 UAT-'+id+' normalized resource scenario actual API/Worker/storage/independent oracle',async t=>{
 const f=await fixture(t),{data,provenance}=b2Scenario(id);await f.ok('/inputs',{revision:0,tables:data});
 const result=await b2Worker(f);assert.equal(result.plan.tasks.length,data.orders.length*2);const oracle=await check(f,result),ts=times(result.plan);
 if(id==='03')assert.deepEqual([ts['A-FILL'],ts['B-FILL']],[[30,60],[60,90]]);
 if(id==='04')assert.deepEqual(Object.values(ts),[[0,30],[30,60],[60,90],[90,120]]);
 if(id==='06'){const fills=result.plan.tasks.filter(t=>t.operation==='FILL');assert.equal(fills.filter(t=>t.start===30).length,2);assert.equal(fills.filter(t=>t.start===60).length,1);}
 if(id==='07'){assert.deepEqual(ts['A-FILL'],[30,60]);assert.deepEqual(ts['B-FILL'],[70,100]);assert.ok(result.plan.tasks.find(t=>t.id==='B-FILL').source.includes('容量'));}
 if(id==='08'){assert.deepEqual(ts['A-MIX'],[0,30]);assert.deepEqual(ts['B-MIX'],[30,60]);assert.equal(oracle.find(r=>r.kind==='物理池'&&r.id==='POOL-LP01').peak,2);assert.ok(!result.plan.resourceReservations.some(r=>r.resourceId==='LP-GENERAL'));}
 const before=f.bytes(),state=await f.ok('/state'),selection=result.run.conditions;
 const preview=await f.ok('/inputs/resource-policy-preview',{revision:state.revision,tables:Object.fromEntries(Object.keys(resourceTables).map(k=>[k,state.data[k]])),selection:Object.fromEntries(['mode','orderIds','startMinute','endMinute','priority','enabledRuleIds'].map(k=>[k,selection[k]]))});
 assert.equal(preview.persisted,false);assert.equal(f.bytes(),before);
 const api=resourceClient(f.ok),view=await api.reopen(result.run.id);assert.equal(view.version,result.run.conditions.resourcePolicyVersion);assert.deepEqual(view.reservations,result.plan.resourceReservations);
 const csv=await f.ok('/export',api.exportBody(view));assert.ok(csv.includes(result.run.id)&&csv.includes(result.run.snapshotHash)&&csv.includes(result.run.inputVersionId));assert.ok(csv.includes('G01'));
 save('scenario-'+id,{provenance,result,oracle,preview,view: {provenance:view.provenance,verification:view.verification},csv});
});

test('B2 demand3/capacity2, full/window occupancy, no double tool declaration and available endpoints',async t=>{
 const f=await fixture(t),{data}=b2Scenario('07');await f.ok('/inputs',{revision:0,tables:data});const original=await b2Worker(f);
 let s=await f.ok('/state'),claims=structuredClone(s.data.resourceClaims);claims.find(c=>c['订单编号']==='A'&&c['资源编号']==='G01')['需求数量']='3';
 await f.ok('/inputs',{revision:s.revision,tables:{resourceClaims:claims}});const shortage=await b2Worker(f);assert.ok(!shortage.plan.tasks.some(t=>t.id==='A-FILL'));assert.ok(shortage.plan.findings.some(x=>/容量|累计需求/.test(x.message)));occupancyOracle(shortage.plan,shortage.input.executionData);
 s=await f.ok('/state');claims=structuredClone(data.resourceClaims);for(const c of claims)if(c['资源编号']==='G01')Object.assign(c,{'占用口径':'明确窗口','窗口开始偏移分钟':'5','窗口结束偏移分钟':'5','后延占用分钟':'0'});
 await f.ok('/inputs',{revision:s.revision,tables:{resourceClaims:claims}});const window=await b2Worker(f);const rs=window.plan.resourceReservations.filter(r=>r.resourceId==='G01');assert.ok(rs.every(r=>r.end-r.start===20));assert.equal(rs.length,2);assert.equal((await check(f,window)).find(r=>r.id==='G01').minutes,40);
 s=await f.ok('/state');const before=f.bytes();const bad=await f.call('/inputs',{revision:s.revision,tables:{resourceClaims:[...claims,{...claims[0],'声明编号':'DUPLICATE'}]}});assert.equal(bad.status,400);assert.equal(f.bytes(),before);
 s=await f.ok('/state');const tools=structuredClone(s.data.tools);tools.find(t=>t['工装编码']==='G01')['可用起始分钟']='70';await f.ok('/inputs',{revision:s.revision,tables:{tools}});const available=await b2Worker(f);assert.ok(available.plan.resourceReservations.filter(r=>r.resourceId==='G01').every(r=>r.start>=70));await check(f,available);
 save('tool-boundaries',{original,shortage,window,available,rejected:bad});
});

test('B2 2+1 shared pool not3, sharing switch/mutex, release windows and retained full operation',async t=>{
 const f=await fixture(t),data=twoTasks();const req=data.dependencies.filter(r=>r['资源类型']==='人员技能');req[0]['需求数量']='2';await f.ok('/inputs',{revision:0,tables:data});const combined=await b2Worker(f);assert.equal(combined.plan.tasks.length,2);assert.equal(combined.plan.tasks[1].start,30);assert.equal((await check(f,combined)).find(r=>r.kind==='物理池').peak,2);
 let s=await f.ok('/state'),ds=structuredClone(s.data.dependencies);ds.filter(r=>r['资源类型']==='人员技能').forEach((r,i)=>Object.assign(r,{'需求数量':'1','人员开始偏移':i?'15':'0','人员结束偏移':i?'0':'15'}));
 await f.ok('/inputs',{revision:s.revision,tables:{dependencies:ds}});const released=await b2Worker(f);assert.deepEqual(released.plan.tasks.map(t=>t.start),[0,0]);await check(f,released);
 s=await f.ok('/state');let pools=structuredClone(s.data.personnelPools);Object.assign(pools[0],{'允许共用':'否','互斥粒度':'工序互斥','占用策略':'全工序保留'});await f.ok('/inputs',{revision:s.revision,tables:{personnelPools:pools}});const retained=await b2Worker(f);assert.deepEqual(retained.plan.tasks.map(t=>t.start),[0,30]);assert.ok(retained.plan.resourceReservations.filter(r=>r.type==='人员').every(r=>r.end-r.start===30));await check(f,retained);
 save('shared-pool-windows',{combined,released,retained});
});

test('B2 directed substitute on/off, reverse forbidden, same-skill retained and source reason',async t=>{
 const f=await fixture(t),data=s06Fixture();data.personnelGroups.forEach(g=>g['人员数量']='2');data.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>{r['候选人员组']='';r['资源编号']='A';});await f.ok('/inputs',{revision:0,tables:data});const on=await b2Worker(f);assert.equal(on.plan.tasks.length,1);assert.ok(on.plan.resourceReservations.some(r=>r.relationId==='AB'&&r.providedSkill==='A'&&r.requiredSkill==='B'));await check(f,on);
 let s=await f.ok('/state'),edges=s.data.skillSubstitutions.map(e=>({...e,'是否启用':'否'}));await f.ok('/inputs',{revision:s.revision,tables:{skillSubstitutions:edges}});const off=await b2Worker(f);assert.equal(off.plan.tasks.length,0);
 s=await f.ok('/state');const ds=structuredClone(s.data.dependencies);ds.filter(r=>r['资源类型']==='人员技能').forEach(r=>r['所需技能']='A');await f.ok('/inputs',{revision:s.revision,tables:{dependencies:ds}});const same=await b2Worker(f);assert.equal(same.plan.tasks.length,1);assert.ok(same.plan.resourceReservations.every(r=>!r.relationId));
 s=await f.ok('/state');ds.filter(r=>r['资源类型']==='人员技能').forEach(r=>r['资源编号']='B');edges=s.data.skillSubstitutions.map(e=>({...e,'是否启用':'是'}));await f.ok('/inputs',{revision:s.revision,tables:{dependencies:ds,skillSubstitutions:edges}});const reverse=await b2Worker(f);assert.equal(reverse.plan.tasks.length,0);assert.ok(reverse.plan.findings.some(x=>/技能|人员/.test(x.message)));save('substitution',{on,off,same,reverse});
});

test('B2 atomic invalid/unknown/negative/unauthorized/stale rejection, source hash mismatch and history protection',async t=>{
 const f=await fixture(t),{data}=b2Scenario('07');await f.ok('/inputs',{revision:0,tables:data});const old=await b2Worker(f),oldInputs=await f.ok('/plans/'+old.plan.id+'/inputs'),oldHash=hash(old);
 await f.ok('/plans/'+old.plan.id+'/verify',{});
 for(const action of ['submit','confirm']){const review=await f.ok('/plans/'+old.plan.id+'/review');await f.ok('/plans/'+old.plan.id+'/'+action,{revision:(await f.ok('/state')).revision,workflowRevision:review.workflow.revision,reviewHash:review.reviewHash,submissionId:review.workflow.submission?.id,unplannedIds:review.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true},action==='confirm'?'supervisor':'planner');}
 const confirmations=await f.ok('/confirmations');assert.equal(confirmations.length,1);
 let s=await f.ok('/state');const errors=[];
 for(const [tables,role,revision,status] of [
  [{tools:s.data.tools.map((r,i)=>i===0?{...r,'可用数量':'-1'}:r)},'planner',s.revision,400],
  [{tools:s.data.tools.map((r,i)=>i===0?{...r,'可用起始分钟':''}:r)},'planner',s.revision,400],
  [{resourceClaims:s.data.resourceClaims.map((r,i)=>i===0?{...r,'占用口径':'未支持动态'}:r)},'planner',s.revision,400],
  [{unknownTable:[]},'planner',s.revision,404],[{tools:s.data.tools},'query',s.revision,403],[{tools:s.data.tools},'outsider',s.revision,403],[{tools:s.data.tools},'planner',0,409]
 ]){const bytes=f.bytes(),r=await f.call('/inputs',{tables,revision},role);assert.equal(r.status,status,JSON.stringify(r));assert.equal(f.bytes(),bytes);errors.push(r);}
 const invalidCsv=csvFiles({tools:s.data.tools.map((r,i)=>i===0?{...r,'可用结束分钟':''}:r)})[0],bytes=f.bytes();const csv=await f.call('/imports/preview',{revision:s.revision,table:'tools',files:[invalidCsv]});assert.equal(csv.status,400);assert.ok(!csv.body.id);assert.equal(f.bytes(),bytes);
 const tools=s.data.tools.map(r=>r['工装编码']==='G01'?{...r,'可用数量':'2'}:r);await f.ok('/inputs',{revision:s.revision,tables:{tools}});const next=await b2Worker(f);assert.notEqual(next.run.conditions.resourcePolicyVersion,old.run.conditions.resourcePolicyVersion);assert.deepEqual(await f.ok('/runs/'+old.run.id+'/inputs'),old.input);assert.deepEqual(await f.ok('/plans/'+old.plan.id+'/inputs'),oldInputs);assert.equal(hash(old),oldHash);
 assert.throws(()=>resourceRunView(next.run,old.input,old.plan),/不一致/);
 assert.deepEqual(await f.ok('/confirmations'),confirmations);const records=await f.ok('/operations');assert.ok(records.filter(r=>r.target==='tools'&&r.fromVersion).every(r=>r.actor&&r.role&&r.reason&&r.fromVersion&&r.toVersion));save('negative-history',{errors,csv,old,next,oldInputs,records,confirmations});
});

test('B2 canonical resource CSV provenance survives Worker/reopen/export and invalid preview has no token',async t=>{
 const f=await fixture(t),{data}=b2Scenario('07');await f.ok('/inputs',{revision:0,tables:data});const before=await b2Worker(f),s=await f.ok('/state'),tools=s.data.tools.map(r=>r['工装编码']==='G01'?{...r,'可用数量':'2'}:r),csv=csvFiles({tools})[0];
 const bytes=f.bytes(),preview=await f.ok('/imports/preview',{table:'tools',revision:s.revision,files:[csv]});assert.equal(preview.valid,true);assert.equal(f.bytes(),bytes);await f.ok('/imports/commit',{previewId:preview.id});
 const next=await b2Worker(f);await check(f,next);const input=await f.ok('/plans/'+next.plan.id+'/inputs');assert.equal(input.csvSources.tools.originalText,csv.text);assert.equal(input.csvSources.tools.sha256,createHash('sha256').update(csv.text).digest('hex'));assert.equal(input.csvSources.tools.records[0].line,2);
 const view=await resourceClient(f.ok).reopen(next.run.id),exported=await f.ok('/export',resourceClient(f.ok).exportBody(view));assert.ok(exported.includes(next.run.snapshotHash)&&exported.includes('G01'));assert.deepEqual(await f.ok('/runs/'+before.run.id+'/inputs'),before.input);save('csv-provenance',{before,next,input,exported});
});

test('B2 original stage import observed independently and retained as an integration slice',async t=>{
 const f=await fixture(t),s=await f.ok('/state'),dir=path.join(process.env.B2_INPUTS,'UAT-07'),staged=stageInput(dir),before=fs.existsSync(path.join(f.dir,'business.json'))?f.bytes():null;
 const r=await f.call('/imports/preview',{revision:s.revision,files:staged.files,repairs:staged.repairs});
 if(r.status===200&&r.body.valid){assert.ok(r.body.id);}else assert.ok(r.status===400||r.body.valid===false,JSON.stringify(r));
 assert.equal(fs.existsSync(path.join(f.dir,'business.json'))?f.bytes():null,before);save('original19-import',{request:staged,result:r,classification:r.status===200&&r.body.valid?'PREVIEW_ONLY':'INTEGRATION_DEPENDENCY'});
});
