import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const out='/evidence',base='http://127.0.0.1:4317/api',hash=x=>createHash('sha256').update(x).digest('hex'),dump=(n,x)=>fs.writeFileSync(out+'/'+n,JSON.stringify(x,null,2));
const call=async(p,b,role='planner')=>{const r=await fetch(base+p,{method:b?'POST':'GET',headers:{'content-type':'application/json','X-UAT-Synthetic-Role':role},body:b?JSON.stringify({reason:'UAT07 isolated configurable boundary and negative selftest',...b}):undefined});return {status:r.status,body:await r.json()};};
const ok=async(...args)=>{const x=await call(...args);assert.ok(x.status<300,JSON.stringify(x).slice(0,1200));return x.body;};
const old=JSON.parse(fs.readFileSync(out+'/positive-result.json')),state=await ok('/state'),before=fs.readFileSync('/state/business.json');
const raw=JSON.parse(fs.readFileSync('/fixtures/RAW19-IMPORT-REQUEST.json'));raw.revision=state.revision;const bad=await call('/imports/preview',raw);assert.equal(bad.body.valid,false);assert.ok(fs.readFileSync('/state/business.json').equals(before));
const cases=[];
for(const[name,path,b,role,status]of[
 ['query cannot edit','/inputs',{revision:state.revision,tables:{tools:state.data.tools}},'query',403],
 ['query cannot run','/runs',{revision:state.revision,selection:{orderIds:['A','B'],startMinute:0,endMinute:600,mode:'supported'}},'query',403],
 ['stale revision','/inputs',{revision:0,tables:{resourceClaims:state.data.resourceClaims}},'planner',409],
 ['missing claims','/inputs',{revision:state.revision,tables:{resourceClaims:[]}},'planner',400],
 ['missing mapping','/inputs',{revision:state.revision,tables:{resourceMappings:[]}},'planner',400],
 ['negative capacity','/inputs',{revision:state.revision,tables:{tools:state.data.tools.map(t=>({...t,'可用数量':'-1'}))}},'planner',400],
 ['unknown enabled rule','/inputs',{revision:state.revision,tables:{rules:[...state.data.rules,{'规则编号':'UNAPPROVED_UAT07','中文名称':'unknown','是否启用':'是','参数JSON':'{}','生效时间':''}]}},'planner',400]
]){const x=await call(path,b,role);assert.equal(x.status,status,name);assert.ok(fs.readFileSync('/state/business.json').equals(before));cases.push({name,path,request:b,role,...x,zeroStoreWrite:true});}
dump('atomic-negatives.json',{unconfiguredRaw19:bad,cases,before:hash(before),after:hash(fs.readFileSync('/state/business.json')),classification:'required safe refusals, not product failures; configured positive chain is supported'});
// Actual native trial preview is checked by the product checker against the SAME frozen configuration.
const trial=await ok('/plans/'+old.plan.id+'/copy',{}),pos=await ok('/trials/'+trial.id+'/positions'),task=pos.tasks.find(t=>t.id==='B-FILL'),boundaries=[];
for(const start of [60,69,70]){
 const disk=fs.readFileSync('/state/business.json'),p=await ok('/trials/'+trial.id+'/move-preview',{revision:pos.revision,planId:pos.planId,planHash:pos.planHash,taskId:task.id,start,machine:task.machine}),check=await ok('/trials/'+trial.id+'/previews/'+p.id+'/recheck',{});
 assert.equal(check.valid,start===70,JSON.stringify(check).slice(0,800));assert.ok(fs.readFileSync('/state/business.json').equals(disk));
 if(start<70){const rejected=await call('/trials/'+trial.id+'/previews/'+p.id+'/commit',{});assert.equal(rejected.status,409);assert.ok(fs.readFileSync('/state/business.json').equals(disk));boundaries.push({start,preview:p,check,commit:rejected,zeroWrite:true});}
 else boundaries.push({start,preview:p,check,zeroWrite:true});
 await ok('/trials/'+trial.id+'/previews/'+p.id+'/cancel',{});
}
dump('native-api-boundary-60-69-70.json',{trial,position:pos,boundaries,sourcePlan:old.plan.id,sourceSnapshot:old.run.snapshotHash,sourceInputVersion:old.run.inputVersionId,scope:'native preview/recheck/invalid commit control; real Worker boundary separately in positive-result'});
// Change explicit simulation source AND runtime claim together; retained csvSources remain immutable.
async function worker(tables){let s=await ok('/state');await ok('/inputs',{revision:s.revision,tables});s=await ok('/state');const c=await ok('/runs',{revision:s.revision,selection:{orderIds:['A','B'],startMinute:0,endMinute:600,mode:'supported'}});let r;for(let i=0;i<600;i++){r=await ok('/runs/'+c.id);if(r.planId)break;assert.ok(!['failed','timed_out','cancelled'].includes(r.status));await new Promise(f=>setTimeout(f,20));}assert.equal(r.status,'completed');return {run:r,plan:(await ok('/plans')).find(p=>p.id===r.planId),input:await ok('/runs/'+r.id+'/inputs')};}
const baseState=await ok('/state'),data=baseState.data,claims=structuredClone(data.resourceClaims),deps=structuredClone(data.originalDependencies);
claims.find(r=>r['订单编号']==='A'&&r['资源编号']==='G01')['后延占用分钟']='0';deps.find(r=>r['订单编号']==='A'&&r['资源编号']==='G01')['后延占用分钟']='0';
const noDelay=await worker({resourceClaims:claims,originalDependencies:deps});assert.equal(noDelay.plan.tasks.find(t=>t.id==='B-FILL').start,60);
const earlyClaims=structuredClone(data.resourceClaims),earlyDeps=structuredClone(data.originalDependencies);earlyClaims.find(r=>r['订单编号']==='B'&&r['资源编号']==='G01')['提前占用分钟']='5';earlyDeps.find(r=>r['订单编号']==='B'&&r['资源编号']==='G01')['提前占用分钟']='5';
const early=await worker({resourceClaims:earlyClaims,originalDependencies:earlyDeps});assert.equal(early.plan.tasks.find(t=>t.id==='B-FILL').start,75);assert.equal(early.plan.resourceReservations.find(r=>r.resourceId==='G01'&&r.taskIds.includes('B-FILL')).start,70);
const restored=await worker({resourceClaims:data.resourceClaims,originalDependencies:data.originalDependencies});assert.equal(restored.plan.tasks.find(t=>t.id==='B-FILL').start,70);assert.deepEqual(await ok('/plans/'+old.plan.id+'/inputs'),old.frozen);
dump('worker-delay-early-variants.json',{label:'explicit replaceable simulation variants; not customer adopted defaults',noDelay,early,restored,oldFrozenUnchanged:true});console.log('PASS raw/config negative zero writes; native API 60/69 reject70 legal; real Worker post0->60/post10->70/early5->process75 acquire70');
