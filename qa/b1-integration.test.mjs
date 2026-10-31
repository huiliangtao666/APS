import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';
import {stageInput} from './issue6-stage-input.mjs';
const reason='B1 isolated software verification; all configuration values simulated';
const fields=['是否允许拆分','需求类型','订单状态'];
export function configValues(){return Object.fromEntries(['A','B'].map(id=>[id,Object.fromEntries(fields.map((f,i)=>[f,{value:['否','正式订单','有效'][i],source:{kind:'simulation',reference:`B1 explicit simulated ${id}/${f}; 非客户事实`,version:`${id}-${i}-v1`}}]))]));}
const dump=(name,value)=>{if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,name+'.json'),JSON.stringify(value,null,2));}};
async function complete(f){const c=await f.ok('/r21/config');return f.ok('/r21/config',{revision:c.config.revision,values:configValues()});}
async function imported(f,scene='UAT-02'){
 const s=await f.ok('/state'),c=await complete(f),input=stageInput(path.join(process.env.B1_INPUT_DIR||'/b1-inputs',scene));
 const preview=await f.ok('/imports/preview',{revision:s.revision,files:input.files,r21ConfigRevision:c.config.revision,inputStage:scene==='UAT-01'?'minimal-r1':'supported'});
 assert.equal(preview.valid,true,JSON.stringify(preview));
 const saved=await f.ok('/imports/commit',{previewId:preview.id,r21ConfigRevision:999,repairs:[],inputStage:'forged'});
 return {saved,input,preview,config:c};
}
export async function worker(f,selection){const state=await f.ok('/state'),created=await f.ok('/runs',{revision:state.revision,...(selection?{selection}:{})});for(let i=0;i<600;i++){const run=await f.ok('/runs/'+created.id);if(['completed','partial'].includes(run.status)){const plan=(await f.ok('/plans')).find(p=>p.id===run.planId);return {run,plan,inputs:await f.ok('/runs/'+run.id+'/inputs')};}assert.ok(!['failed','timed_out','cancelled'].includes(run.status),JSON.stringify(run));await new Promise(r=>setTimeout(r,10));}throw Error('worker timeout');}
function invariant(plan,data){
 const expected=data.orders.flatMap(o=>data.routes.filter(r=>r['产品编号']===o['产品编号']).map(r=>({id:o['订单编号']+'-'+r['工序编号'],order:o['订单编号'],route:r})));
 assert.deepEqual(plan.tasks.map(t=>t.id).sort(),expected.map(t=>t.id).sort());
 for(const task of plan.tasks){assert.equal(task.end-task.start,30);assert.ok(task.start>=0);for(const other of plan.tasks)if(task.id!==other.id&&task.machine===other.machine)assert.ok(task.end<=other.start||other.end<=task.start,'machine overlap');const r=expected.find(x=>x.id===task.id).route;if(r['前序工序']){const pre=plan.tasks.find(t=>t.id===task.orderId+'-'+r['前序工序']);assert.ok(pre.end<=task.start,'order precedence');}}
}
test('B101 production business router exposes partial seed, independent six edits/source versions, invalid/null/stale/roles/CSRF zero-write and reopen',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const initial=await f.ok('/r21/config');assert.equal(Object.values(initial.config.values).flatMap(Object.values).filter(x=>x!==null).length,2);assert.equal(initial.validation.length,4);
 let before=f.bytes();assert.equal((await f.call('/r21/apply',{configRevision:0,inputRevision:0})).status,400);assert.equal(f.bytes(),before);
 let c=initial.config;const values=configValues();for(const id of ['A','B'])for(const field of fields){const previous=structuredClone(c);c= (await f.ok('/r21/config',{revision:c.revision,values:{...c.values,[id]:{...c.values[id],[field]:values[id][field]}}})).config;for(const i of ['A','B'])for(const k of fields)if(i!==id||k!==field)assert.deepEqual(c.values[i][k],previous.values[i][k]);}
 assert.deepEqual(c.values,values);before=f.bytes();
 for(const id of ['A','B'])for(const field of fields){const bad=structuredClone(c.values);bad[id][field].source.version='';assert.equal((await f.call('/r21/config',{revision:c.revision,values:bad})).status,400);assert.equal(f.bytes(),before);bad[id][field]=null;const result=await f.ok('/r21/config',{revision:c.revision,values:bad});assert.ok(result.validation.some(i=>i.orderId===id&&i.field===field));const current=f.bytes();assert.equal((await f.call('/r21/apply',{configRevision:result.config.revision,inputRevision:0})).status,400);assert.equal(f.bytes(),current);c=(await f.ok('/r21/config',{revision:result.config.revision,values})).config;before=f.bytes();}
 for(const [body,role,status,headers] of [[{revision:-1,values},'planner',409,{}],[{revision:c.revision,values},'query',403,{}],[{revision:c.revision,values},'planner',403,{origin:'https://unrelated.invalid'}]]){assert.equal((await f.call('/r21/config',body,role,headers)).status,status);assert.equal(f.bytes(),before);}
 assert.ok(!fs.existsSync(path.join(f.dir,'r21-config.json')));assert.deepEqual(JSON.parse(before).r21.config,c);dump('B101',{initial,final:c,store:JSON.parse(before)});
});
test('B102 all original03 rows, unused marker/query/source, original17 config physical provenance and same-transaction ledger',async t=>{
 const f=await fixture(t),x=await imported(f);const device=await f.ok('/r21/devices');assert.equal(device.devices.length,10);assert.equal(device.devices.filter(d=>d.usage==='unused').length,6);assert.equal(device.devices.filter(d=>d.usage==='unused'&&!d.operationInStageRoute).length,4);
 const disk=JSON.parse(f.bytes()),source=disk.csvSources.orders;assert.equal(source.originalText,x.input.files.find(f=>f.name.startsWith('17_')).text);assert.equal(source.repairs.length,6);assert.ok(source.repairs.every(p=>p.source.version&&p.source.kind==='simulation'));
 assert.equal(disk.r21.applications.length,1);assert.equal(disk.r21.applications[0].inputVersionId,x.saved.inputVersionId);assert.equal(disk.r21.applications[0].configFingerprint,x.config.fingerprint);for(const d of device.devices){assert.ok(d.source.line>=2);assert.ok(d.source.sha256);assert.deepEqual(d.row,d.source.originalValues);}
 const before=f.bytes(),data=x.saved.data;
 for(const mutate of [d=>d.machines[5]['设备编号']=d.machines[0]['设备编号'],d=>d.machines[5]['最大装载kg']='NaN',d=>d.dependencies.push({...d.dependencies[0],'资源编号':'HEAT01'})]){const proposed=structuredClone(data);mutate(proposed);const result=await f.call('/inputs',{revision:x.saved.revision,tables:{machines:proposed.machines,dependencies:proposed.dependencies}});assert.equal(result.status,400);assert.equal(f.bytes(),before);}
 dump('B102',{device,source,application:disk.r21.applications[0],saved:x.saved});
});
test('B103 configuration identity/invalid batches/stale preview and injected atomic rename failure preserve business bytes',async t=>{
 const f=await fixture(t),x=await imported(f),state=await f.ok('/state');const file=x.input.files.find(f=>f.name.startsWith('17_'));const before=f.bytes();
 for(const text of [file.text.replace(/\bA,/,'UNKNOWN,'),file.text.replace(/\bB,/,'A,'),file.text.replace('240','-1')]){const result=await f.call('/imports/preview',{files:[{...file,text}],revision:state.revision,r21ConfigRevision:x.config.config.revision});assert.equal(result.body.valid,false);assert.equal(f.bytes(),before);}
 const preview=await f.ok('/imports/preview',{files:[file],revision:state.revision,r21ConfigRevision:x.config.config.revision});await complete(f);const changed=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:preview.id})).status,409);assert.equal(f.bytes(),changed);
 const c=await f.ok('/r21/config'),originalRename=fs.renameSync;fs.renameSync=(a,b)=>{if(b===path.join(f.dir,'business.json'))throw Object.assign(Error('B1 injected pre-rename storage fault'),{code:'EIO'});return originalRename(a,b);};
 try{assert.equal((await f.call('/r21/apply',{configRevision:c.config.revision,inputRevision:state.revision})).status,500);assert.equal(f.bytes(),changed);}finally{fs.renameSync=originalRename;}
 assert.equal(fs.readdirSync(f.dir).filter(x=>x.includes('.tmp')).length,0);dump('B103',{unchanged:true,atomicFailure:'EIO before single rename; order data/config/application ledger all unchanged'});
});
for(const scene of ['UAT-01','UAT-02'])test('B104 '+scene+' original stage import -> Worker -> independent invariants -> save/reopen/export/frozen config',async t=>{
 const f=await fixture(t),x=await imported(f,scene);const result=await worker(f,scene==='UAT-01'?{mode:'minimal-r1'}:undefined);invariant(result.plan,x.saved.data);
 if(scene==='UAT-02'){assert.ok(result.plan.tasks.filter(t=>t.machine==='MIX02').every(t=>t.start>=15));assert.ok(result.plan.tasks.every(t=>t.end<=600));}else assert.equal(result.inputs.conditions.checkScope.mode,'minimal-r1');
 assert.deepEqual(result.inputs.conditions.r21OrderConfiguration.config,x.config.config);assert.equal(result.inputs.conditions.r21OrderConfiguration.configFingerprint,x.config.fingerprint);assert.deepEqual(result.inputs.executionData.r21OrderConfiguration,result.inputs.originalInput.r21OrderConfiguration);
 const verified=await f.ok('/plans/'+result.plan.id+'/verify',{});assert.equal(verified.verification.checks.machineOverlap.status,'pass');assert.equal(verified.verification.checks.precedence.status,'pass');if(scene==='UAT-02')assert.equal(verified.verification.checks.calendar.status,'pass');else assert.equal(verified.verification.checks.calendar.status,'not_checked');
 await f.ok('/plans',{id:result.plan.id});const frozenPlan=await f.ok('/plans/'+result.plan.id+'/inputs');const csv=await f.ok('/export',{planId:result.plan.id});assert.ok(csv.includes('configFingerprint'));assert.ok(csv.includes('simulation'));assert.ok(csv.includes('A-0-v1'));
 const oldInputs=await f.ok('/runs/'+result.run.id+'/inputs');const current=await f.ok('/r21/config'),values=structuredClone(current.config.values);values.B['需求类型'].value='预测';const saved=await f.ok('/r21/config',{revision:current.config.revision,values});await f.ok('/r21/apply',{configRevision:saved.config.revision,inputRevision:x.saved.revision});const next=await worker(f,scene==='UAT-01'?{mode:'minimal-r1'}:undefined);assert.deepEqual(next.run.conditions.orderIds,['A']);assert.ok(next.plan.tasks.every(t=>t.orderId==='A'));assert.deepEqual(await f.ok('/runs/'+result.run.id+'/inputs'),oldInputs);assert.deepEqual(await f.ok('/plans/'+result.plan.id+'/inputs'),frozenPlan);assert.ok((await f.ok('/export',{planId:result.plan.id})).includes('A-0-v1'));
 if(scene==='UAT-01'){const bytes=f.bytes();const denied=await f.call('/runs',{revision:(await f.ok('/state')).revision,selection:{mode:'supported'}});assert.ok([400,422].includes(denied.status));assert.equal(f.bytes(),bytes);}
 dump('B104-'+scene,{result,verified,next,csv,frozenPlan});
});
