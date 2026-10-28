import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { praetorActor } from '@praetor/lite-app-server';
import { openStore } from './auth/store.mjs';
import { createAuthRouter } from './auth/routes.mjs';
import { createBusinessRouter } from './business.mjs';

async function fixture(t,real=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fr037-'));const store=openStore(dir);store.initFirstAdmin('test#admin');
 for(const role of ['planner','supervisor','query']){const i=store.createInvite({role,createdBy:'test#admin',requireApproval:false});store.acceptInvite(i.token,'test#'+role);}
 // Fixture actor injection exists ONLY here; production uses SDK verification.
 const actor=real?praetorActor():(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:req.get('test-sub')||'query',requestId:'trusted-request'};next();};
 const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
 const app=express();app.use(express.json());app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const call=async(url,body,sub='planner',headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api`+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','test-sub':sub,...headers},body:body?JSON.stringify({reason:'test reason',...body}):undefined});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};};
 return {call,store,dir};
}
test('query role denied on every write/alternate path, client role and audit spoof ignored',async t=>{
 const {call}=await fixture(t);
 for(const [url,body] of [['/tables/orders',{rows:[],revision:0}],['/calculate',{revision:0}],['/plans',{id:'forged',status:'confirmed',tasks:[],findings:[]}],['/plans/x/verify',{}],['/plans/x/confirm',{}],['/plans/x/return',{}],['/plans/x/release',{}],['/export',{table:'orders'}]]){
  assert.equal((await call(url,{...body,role:'supervisor',actor:'fake'},'query',{'x-role':'supervisor','x-praetor-user-id':'supervisor'})).status,403,url);
 }
 assert.equal((await call('/plans',undefined,'query')).status,200);
 assert.equal((await call('/operations',undefined,'query')).body.length,0);
 assert.equal((await call('/auth/members/role',{key:'test#query',role:'supervisor'},'query')).status,403);
 assert.equal((await call('/operations',{records:[{actor:'fake'}]},'planner')).status,404);
});
test('import/edit/calculate/save/verify/export records actor, server time and reason atomically; persistent and stale protected',async t=>{
 const {call,dir}=await fixture(t);let s=(await call('/state')).body;
 const rows=s.data.orders.map(r=>({...r}));rows[0]['合格需求']='241';
 let r=await call('/tables/orders',{rows,revision:0,operation:'import',actor:'fake',at:'1900',requestId:'fake',role:'supervisor'});assert.equal(r.status,200);
 assert.equal((await call('/tables/orders',{rows:[],revision:0})).status,409);
 assert.equal((await call('/tables/orders',{rows,revision:1,reason:''})).status,400);
 r=await call('/calculate',{revision:1,tasks:[{id:'forged'}],status:'confirmed'});assert.equal(r.status,201);assert.equal(r.body.status,'draft');assert.ok(r.body.tasks.length>0);assert.ok(!r.body.tasks.some(t=>t.id==='forged'));const id=r.body.id;
 assert.equal((await call('/plans',{id,tasks:[],status:'confirmed'})).status,201);
 assert.equal((await call('/plans/'+id+'/verify',{})).status,200);
 assert.equal((await call('/export',{planId:id})).status,200);
 assert.equal((await call('/tables/orders',{rows,revision:1})).status,200);
 assert.equal((await call('/plans/'+id+'/verify',{})).status,409);
 const records=(await call('/operations')).body;assert.deepEqual(records.map(r=>r.action),['import','calculate','edit','edit','export','edit']);
 for(const r of records){assert.equal(r.actor,'test#planner');assert.equal(r.role,'planner');assert.equal(r.requestId,'trusted-request');assert.equal(r.reason,'test reason');assert.ok(Date.now()-Date.parse(r.at)<10000);}
 assert.equal(records[0].before[0]['合格需求'],'240');assert.equal(records[0].after[0]['合格需求'],'241');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'business.json'))).records,records);
});
test('supervisor-only downstream gates fail closed without inventing R7 confirmation',async t=>{
 const {call}=await fixture(t);
 for(const action of ['confirm','return','release']){
  assert.equal((await call('/plans/x/'+action,{},'planner')).status,403);
  const r=await call('/plans/x/'+action,{},'supervisor');assert.equal(r.status,501);assert.equal(r.body.error,'workflow_not_supported');
 }
 assert.equal((await call('/operations')).body.length,0);
});
test('query export requires explicit stored grant; demotion/removal takes effect next action',async t=>{
 const {call,store}=await fixture(t);
 assert.equal((await call('/export',{table:'orders'},'query')).status,403);
 assert.equal((await call('/auth/members/export',{key:'test#query',canExport:true},'admin')).status,200);
 assert.equal((await call('/export',{table:'orders'},'query')).status,200);
 store.setRole('test#planner','query','test#admin');assert.equal((await call('/calculate',{revision:0})).status,403);
 store.remove('test#supervisor');assert.equal((await call('/state',undefined,'supervisor')).status,403);
 assert.equal((await call('/state',undefined,'admin')).status,403); // membership admin is not a fourth business role
});
test('CSRF write denied and SDK rejects unsigned/plaintext impersonation',async t=>{
 const {call}=await fixture(t);assert.equal((await call('/calculate',{revision:0},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 const real=await fixture(t,true);
 for(const header of [{},{'x-praetor-user-id':'supervisor','x-role':'supervisor'},{'X-Praetor-App-Context':'forged'}]){
  const r=await real.call('/calculate',{revision:0},'supervisor',header);assert.ok([401,503].includes(r.status),JSON.stringify(r));
 }
});
test('integrated server scheduler preserves expected supply waits, downtime reason and staffing constraints',async t=>{
 const {call}=await fixture(t);let rev=0;const initial=(await call('/state')).body.data;
 async function put(table,rows,operation='edit'){const r=await call('/tables/'+table,{rows,revision:rev,operation});assert.equal(r.status,200,JSON.stringify(r.body));rev++;}
 await put('supplies',[{'供给编号':'S1','物料编号':'LEAN','批次编号':'LOT1','预计数量':'100','预计到达时间':'2026-11-02T09:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00'}],'import');
 await put('supplyUses',[{'引用编号':'U1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'40'}],'import');
 let r=await call('/calculate',{revision:rev});assert.equal(r.status,201);assert.equal(r.body.tasks.find(t=>t.id==='A-MIX').start,180);assert.equal(r.body.supplyConditions.length,1);
 await put('downtime',[{'设备编号':'MIX02','起始分钟':'0','结束分钟':'60','原因':'模拟维护'}]);
 r=await call('/calculate',{revision:rev});assert.equal(r.body.tasks.find(t=>t.id==='B-MIX').start,60);assert.match(r.body.tasks.find(t=>t.id==='B-MIX').source,/模拟维护/);
 await put('dependencies',[...initial.dependencies,{'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G1','需求数量':'2','所需技能':'mix','所需班次':'day','人员参与阶段':'操作','人员开始偏移':'0','人员结束偏移':'0'}]);
 await put('personnelGroups',[{'人员组编号':'G1','人员组名称':'模拟人员组','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'}]);
 r=await call('/calculate',{revision:rev});assert.ok(r.body.findings.length>0);assert.ok(!r.body.tasks.some(t=>t.id==='A-MIX'));
 // Server-side import guard preserves state and emits no success event on failure.
 const before=(await call('/operations')).body.length;
 assert.equal((await call('/tables/supplyUses',{rows:[{'引用编号':'BAD','供给编号':'NO'}],revision:rev,operation:'import'})).status,400);
 assert.equal((await call('/state')).body.revision,rev);assert.equal((await call('/operations')).body.length,before);
});
