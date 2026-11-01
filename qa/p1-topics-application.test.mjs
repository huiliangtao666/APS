import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {defs} from '../server/planner.ts';
import {createBusinessRouter} from '../server/business.mjs';import express from 'express';
import {topicFixture} from './p1-topics-fixture.mjs';import {fixture as apiFixture} from './fr027-fixture.mjs';
import {p1Capabilities,p1InitialStrategies} from '../src/lib/p1-topics-contract.mjs';
const dump=(name,x)=>{if(process.env.P1_OUT){fs.mkdirSync(process.env.P1_OUT,{recursive:true});fs.writeFileSync(process.env.P1_OUT+'/'+name+'.json',JSON.stringify(x,null,2));}};
test('HTTP/real Worker save, reopen, query, export and immutable historical scope',async t=>{
 const f=await apiFixture(t),mock=topicFixture();let state=await f.ok('/inputs',{revision:0,tables:mock.data});
 const cap=await f.ok('/p1/capabilities');assert.deepEqual(cap,p1Capabilities);
 const started=await f.ok('/runs',{revision:state.revision,selection:mock.selection});let final;
 for(let n=0;n<300;n++){final=await f.ok('/runs/'+started.id);if(!['queued','running'].includes(final.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(final.status,'completed',JSON.stringify(final));let plan=(await f.ok('/plans')).find(p=>p.id===final.planId);assert.ok(plan.tasks.length);assert.ok(plan.tasks.every(t=>t.orderId==='MOCK:P1:F1'));
 await f.ok('/plans',{id:plan.id});await f.ok('/plans/'+plan.id+'/verify',{});const inputs=await f.ok('/runs/'+final.id+'/inputs');assert.equal(inputs.originalInput.orders.at(-1)['需求类型'],'预测');
 const blocked=f.bytes();const workflow=await f.call('/plans/'+plan.id+'/submit',{});assert.equal(workflow.status,409);assert.equal(workflow.body.error,'p1_simulation_only');assert.equal(f.bytes(),blocked);
 const exported=await f.call('/export',{planId:plan.id});assert.equal(exported.status,200);assert.match(exported.body,/MOCK:forecast-01/);
 state=await f.ok('/state');const query=await f.call('/export',{query:{table:'p1DemandSources',revision:state.revision}});assert.equal(query.status,200);assert.match(query.body,/MOCK:forecast-01/);
 mock.data.p1Profiles[0]['配置版本']='mock-v2';await f.ok('/inputs',{revision:state.revision,tables:{p1Profiles:mock.data.p1Profiles}});
 assert.deepEqual(await f.ok('/runs/'+final.id+'/inputs'),inputs);assert.equal((await f.ok('/plans')).find(p=>p.id===plan.id).conditions.p1Topic.profile['配置版本'],'mock-v1');
 const reopened=express();reopened.use('/api',createBusinessRouter({dataDir:f.dir,accessMode:'shared'}));const server=reopened.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const reopenUrl='http://127.0.0.1:'+server.address().port+'/api';const diskPlan=(await(await fetch(reopenUrl+'/plans')).json()).find(p=>p.id===plan.id);assert.equal(diskPlan.conditions.p1Topic.profile['配置版本'],'mock-v1');assert.equal((await(await fetch(reopenUrl+'/state')).json()).data.p1Profiles[0]['配置版本'],'mock-v2');
 const disk=JSON.parse(f.bytes());assert.deepEqual(disk.data.orders.filter(o=>o['需求类型']==='正式订单'),mock.data.orders.filter(o=>o['需求类型']==='正式订单'));
 dump('api-worker',{final,plan,inputs,workflow,query,exportCsv:exported.body,persisted:disk});
});
test('API rejects unsupported updates, invalid runs, query writes and stale edits atomically',async t=>{
 const f=await apiFixture(t),mock=topicFixture(),state=await f.ok('/inputs',{revision:0,tables:mock.data});
 const unchanged=f.bytes();const bad=structuredClone(mock.data.p1Profiles);bad[0]['策略JSON']=JSON.stringify({...p1InitialStrategies,forecastConsumption:'ENABLED'});
 const update=await f.call('/inputs',{revision:state.revision,tables:{p1Profiles:bad}});assert.equal(update.status,400);assert.match(JSON.stringify(update.body),/预测冲减/);assert.equal(f.bytes(),unchanged);
 assert.equal((await f.call('/inputs',{revision:state.revision,tables:{p1Profiles:mock.data.p1Profiles}},'query')).status,403);assert.equal(f.bytes(),unchanged);
 assert.equal((await f.call('/inputs',{revision:0,tables:{p1Profiles:mock.data.p1Profiles}})).status,409);assert.equal(f.bytes(),unchanged);
 assert.equal((await f.call('/runs',{revision:state.revision,selection:{...mock.selection,orderIds:['A']}})).status,400);assert.equal(f.bytes(),unchanged);dump('atomic-rejections',update);
});

test('native CSV preview/commit integrates all source/profile rows and preserves provenance',async t=>{
 const f=await apiFixture(t),mock=topicFixture();const csv=(fields,rows)=>[fields,...rows.map(r=>fields.map(k=>r[k]||''))].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');
 const files=defs.map(d=>({name:d.file,text:csv(d.fields,mock.data[d.key]||[])}));
 const preview=await f.ok('/imports/preview',{revision:0,files,inputStage:'supported'});assert.equal(preview.valid,true,JSON.stringify(preview));await f.ok('/imports/commit',{previewId:preview.id});
 const state=await f.ok('/state');assert.equal(state.data.p1Profiles[0]['配置版本'],'mock-v1');assert.equal(state.data.orders.at(-1)['需求类型'],'预测');
 const output=await f.call('/export',{query:{table:'p1DemandSources',revision:state.revision}});assert.equal(output.status,200);assert.match(output.body,/MOCK:forecast-01/);dump('native-csv',{preview,state,output});
});
