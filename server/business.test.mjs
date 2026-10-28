import test from 'node:test';
import { Worker } from 'node:worker_threads';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { praetorActor } from '@praetor/lite-app-server';
import { openStore } from './auth/store.mjs';
import { createAuthRouter } from './auth/routes.mjs';
import { createBusinessRouter } from './business.mjs';

async function fixture(t,real=false,runOptions={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fr037-'));const store=openStore(dir);store.initFirstAdmin('test#admin');
 for(const role of ['planner','supervisor','query']){const i=store.createInvite({role,createdBy:'test#admin',requireApproval:false});store.acceptInvite(i.token,'test#'+role);}
 // Fixture actor injection exists ONLY here; production uses SDK verification.
 const actor=real?praetorActor():(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:req.get('test-sub')||'query',requestId:'trusted-request'};next();};
 const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
 const app=express();app.use(express.json());app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember,...runOptions}));
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
 rows[0]['合格需求']='242';assert.equal((await call('/tables/orders',{rows,revision:1})).status,200);
 assert.equal((await call('/plans/'+id+'/verify',{})).status,409);
 const records=(await call('/operations')).body;assert.deepEqual(records.map(r=>r.action),['import','calculate','edit','edit','export','edit']);
 for(const r of records){assert.equal(r.actor,'test#planner');assert.equal(r.role,'planner');assert.equal(r.requestId,'trusted-request');assert.equal(r.reason,'test reason');assert.ok(Date.now()-Date.parse(r.at)<10000);}
 assert.equal(records[0].before[0]['合格需求'],'240');assert.equal(records[0].after[0]['合格需求'],'241');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'business.json'))).records,records);
});
test('supervisor-only downstream gates reject unknown plans without state changes',async t=>{
 const {call}=await fixture(t);
 for(const action of ['confirm','return','release']){
  assert.equal((await call('/plans/x/'+action,{},'planner')).status,403);
  const r=await call('/plans/x/'+action,{},'supervisor');assert.equal(r.status,404);assert.equal(r.body.error,'plan_not_found');
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
 await put('personnelGroups',[{'人员组编号':'G1','人员组名称':'模拟人员组','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'}]);
 await put('dependencies',[...initial.dependencies,{'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G1','需求数量':'2','所需技能':'mix','所需班次':'day','人员参与阶段':'操作','人员开始偏移':'0','人员结束偏移':'0'}]);
 r=await call('/calculate',{revision:rev});assert.ok(r.body.findings.length>0);assert.ok(!r.body.tasks.some(t=>t.id==='A-MIX'));
 // Server-side import guard preserves state and emits no success event on failure.
 const before=(await call('/operations')).body.length;
 assert.equal((await call('/tables/supplyUses',{rows:[{'引用编号':'BAD','供给编号':'NO'}],revision:rev,operation:'import'})).status,400);
 assert.equal((await call('/state')).body.revision,rev);assert.equal((await call('/operations')).body.length,before);
});
test('FR014 query export re-reads authoritative filtered rows, preserves grant and audit, rejects stale revision',async t=>{
 const {call}=await fixture(t);
 const state=(await call('/state',undefined,'query')).body;
 const order=state.data.orders[0]['订单编号'];
 const query={table:'orders',revision:state.revision,filters:{order}};
 assert.equal((await call('/export',{query},'query')).status,403);
 assert.equal((await call('/auth/members/export',{key:'test#query',canExport:true},'admin')).status,200);
 const r=await call('/export',{query,rows:[{'订单编号':'FORGED'}]},'query');assert.equal(r.status,200);
 assert.ok(r.body.includes('"'+order+'"'));assert.ok(!r.body.includes('FORGED'));assert.equal(r.body.split('\r\n').length,2);
 const logs=(await call('/operations')).body;assert.equal(logs[0].role,'query');assert.deepEqual(logs[0].query,query);
 assert.equal((await call('/export',{query:{...query,revision:999}},'query')).status,409);
 assert.equal((await call('/export',{query:{...query,filters:{text:[]}}},'query')).status,400);
 assert.equal((await call('/export',{query:{...query,table:'missing'}},'query')).status,404);
 assert.equal((await call('/export',{query:{...query,planId:'missing'}},'query')).status,404);
 assert.equal((await call('/state',undefined,'query')).body.revision,state.revision);
});
test('FR014 all UI category schemas match authoritative server definitions and can export current read view',async t=>{
 const {defs:uiDefs}=await import('../src/data-defs.ts');const {defs:serverDefs}=await import('./planner.ts');assert.deepEqual(uiDefs,serverDefs);
 const {call}=await fixture(t);const state=(await call('/state')).body;
 for(const def of uiDefs){const r=await call('/export',{query:{table:def.key,revision:state.revision,filters:{}}});assert.equal(r.status,200,def.key);assert.equal(r.body.split('\r\n').length,state.data[def.key].length+1,def.key);}
});

test('FR015 identical replacement imports are idempotent; no duplicate quantities or version/audit churn',async t=>{
 const {call,dir}=await fixture(t);const s=(await call('/state')).body;
 const rows=structuredClone(s.data.orders);rows[0]['合格需求']='241';
 const a=await call('/tables/orders',{rows,revision:0,operation:'import'});assert.equal(a.status,200);
 const bytes=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 const b=await call('/tables/orders',{rows,revision:1,operation:'import'});assert.equal(b.status,200);assert.equal(b.body.unchanged,true);assert.equal(b.body.revision,1);assert.equal(b.body.data.orders.length,2);
 assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),bytes);
});
test('FR015 edit/import/batch paths share validation, reject unknown fields and preserve state/audit on failure',async t=>{
 const {call,dir}=await fixture(t);const s=(await call('/state')).body;
 await call('/calculate',{revision:0});const bytes=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 for(const operation of ['edit','import','add','copy','delete','restore']){
  for(const kind of ['duplicate','quantity','unit','product']){
   const rows=structuredClone(s.data.orders);
   if(kind==='duplicate')rows.push({...rows[0]});if(kind==='quantity')rows[0]['合格需求']='-1';if(kind==='unit')rows[0]['数量单位']='未知';if(kind==='product')rows[0]['产品编号']='missing';
   for(const [url,body] of [['/tables/orders',{rows}],['/inputs',{tables:{orders:rows}}]]){
    const r=await call(url,{...body,operation,revision:0});assert.equal(r.status,400,operation+kind);assert.equal(r.body.error,'invalid_input');assert.ok(r.body.issues.every(i=>i.file&&Number.isInteger(i.row)&&i.field&&i.message));
   }
  }
 }
 for(const body of [{rows:[{...s.data.orders[0],status:'confirmed'}],revision:0},{rows:s.data.orders,revision:0,operation:'bypass'},{rows:[{x:1}],revision:0}])assert.equal((await call('/tables/orders',body)).status,400);
 assert.equal((await call('/inputs',{tables:{missing:[]},revision:0})).status,404);
 assert.equal((await call('/inputs',{tables:[],revision:0})).status,400);
 assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),bytes);
});
test('FR015 supply checks cannot be bypassed with edit or alternate batch writes',async t=>{
 const {call}=await fixture(t);for(const operation of ['edit','import','copy',undefined]){
  for(const [url,body] of [['/tables/supplyUses',{rows:[{'引用编号':'BAD','供给编号':'NO'}]}],['/inputs',{tables:{supplyUses:[{'引用编号':'BAD','供给编号':'NO'}]}}]]){
   assert.equal((await call(url,{...body,revision:0,operation})).status,400);
  }
 }
 assert.equal((await call('/state')).body.revision,0);assert.equal((await call('/operations')).body.length,0);
});
test('FR015 all 16 categories accept atomic creation and edits, valid copies, and rule-permitted deletion',async t=>{
 const {call}=await fixture(t);const initial=(await call('/state')).body.data;
 const additions={
 products:{...initial.products[0],'产品编号':'NEWP'},materials:{...initial.materials[0],'物料编号':'NEWM'},
 supplies:{'供给编号':'S1','物料编号':'LEAN','批次编号':'SUPLOT1','预计数量':'100','预计到达时间':'2026-11-02T09:00:00+08:00','预计可用时间':'2026-11-02T10:00:00+08:00'},
 supplyDelays:{'记录编号':'D1','供给编号':'S1','记录时间':'2026-11-02T08:00:00+08:00','调整后到达时间':'2026-11-02T11:00:00+08:00','调整后可用时间':'2026-11-02T12:00:00+08:00','原因':'模拟延期'},
 supplyUses:{'引用编号':'U1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'1'},
 inventory:{...initial.inventory[0],'批次编号':'NEWLOT'},orders:{...initial.orders[0],'订单编号':'NEWO'},
 bom:{'版本编号':'V1','产品编号':'HC40','生效日期':'2026-11-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':'LEAN','配置用量':'1','用量单位':'kg','用量基准':'总投入','收率/损耗口径备注':'模拟'},
 routes:{...initial.routes[0],'工序编号':'NEWOP'},times:{...initial.times[0],'工序编号':'NEWOP'},
 machines:{...initial.machines[0],'设备编号':'NEWMACHINE'},calendars:{...initial.calendars[0],'日历编号':'NEWCAL'},
 downtime:{'设备编号':'MIX01','起始分钟':'10','结束分钟':'20','原因':'模拟维护'},
 dependencies:{...initial.dependencies[0],'资源编号':'MIX03'},personnelGroups:{'人员组编号':'G1','人员组名称':'模拟组','人员数量':'2','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'},
 rules:{'规则编号':'NEW','中文名称':'模拟规则','是否启用':'否','参数JSON':'{}'}
 };
 const tables=Object.fromEntries(Object.entries(additions).map(([k,r])=>[k,[...initial[k],r]]));
 let r=await call('/inputs',{tables,revision:0,operation:'add'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.revision,1);
 const records=(await call('/operations')).body;assert.equal(records.length,16);assert.equal(new Set(records.map(r=>r.batchId)).size,1);
 // Every category has a persisted, editable record, including optional fields.
 let current=r.body.data,revision=1;
 const fields={products:'产品名称',materials:'物料名称',supplies:'预计数量',supplyDelays:'原因',supplyUses:'使用数量',inventory:'位置',orders:'合格需求',bom:'收率/损耗口径备注',routes:'工序名称',times:'固定分钟',machines:'设备名称',calendars:'说明',downtime:'原因',dependencies:'需求数量',personnelGroups:'人员组名称',rules:'中文名称'};
 for(const [key,field] of Object.entries(fields))await t.test(key,async()=>{
  const rows=structuredClone(current[key]);rows.at(-1)[field]=key==='dependencies'?'1.0':['预计数量','使用数量','合格需求','固定分钟','需求数量'].includes(field)?'2':'模拟修改';
  r=await call('/tables/'+key,{rows,revision,operation:'edit'},'supervisor');assert.equal(r.status,200,JSON.stringify(r.body));current=r.body.data;revision=r.body.revision;
 });
 // Copy all sixteen additions, changing their unique keys; route/time copies travel together.
 const copies=structuredClone(additions);
 const {recordKeys}=await import('./input-validation.mjs');
 for(const [key,row] of Object.entries(copies)){
  const f=recordKeys[key][0];
  if(key==='routes'||key==='times'){row['工序编号']='COPYOP';}
  else if(key==='bom')row['版本编号']='COPYV';
  else if(key==='downtime'){row['起始分钟']='30';row['结束分钟']='40';}
  else if(key==='dependencies')row['资源编号']='NEWMACHINE';
  else row[f]+='COPY';
 }
 copies.supplies['批次编号']='SUPLOT2';copies.supplyDelays['供给编号']='S1COPY';copies.supplyUses['供给编号']='S1COPY';
 copies.calendars['日历编号']='NEWCALCOPY';
 const copied=Object.fromEntries(Object.entries(copies).map(([k,row])=>[k,[...current[k],row]]));
 r=await call('/inputs',{tables:copied,revision,operation:'copy'});assert.equal(r.status,200,JSON.stringify(r.body));revision=r.body.revision;
 // Deleting a referenced current product must fail without a partial table write.
 const reject=await call('/tables/products',{rows:current.products.filter(p=>p['产品编号']!=='HC40'),revision,operation:'delete'});assert.equal(reject.status,400);
 r=await call('/inputs',{tables:initial,revision,operation:'delete'});assert.equal(r.status,200,JSON.stringify(r.body));
 for(const key of Object.keys(initial))assert.equal(r.body.data[key].length,initial[key].length,key);
});

test('FR015 snapshots preserve original full inputs across edit/delete/recompute and guarded restore',async t=>{
 const {call,dir}=await fixture(t);const start=(await call('/state')).body;
 const p=(await call('/calculate',{revision:0})).body;assert.match(p.inputVersionId,/^[a-f0-9]{64}$/);
 const old=(await call('/plans/'+p.id+'/inputs',undefined,'query')).body;assert.deepEqual(old.data,start.data);
 const tables=structuredClone(start.data);tables.orders[0]['合格需求']='481';tables.rules.find(r=>r['规则编号']==='INVENTORY')['参数JSON']='{"可用质量状态":["合格","条件放行"]}';tables.inventory=[];
 let r=await call('/inputs',{tables,revision:0});assert.equal(r.status,200);const rev=r.body.revision;
 assert.deepEqual((await call('/plans/'+p.id+'/inputs')).body,old);
 assert.equal((await call('/plans/'+p.id+'/verify',{})).status,409);
 const newPlan=(await call('/calculate',{revision:rev})).body;assert.notEqual(newPlan.inputVersionId,p.inputVersionId);
 const snap=(await call('/plans/'+newPlan.id+'/inputs')).body;assert.equal(snap.data.orders[0]['合格需求'],'481');assert.equal(snap.data.inventory.length,0);
 const exp=await call('/export',{query:{table:'orders',planId:p.id,sourcePlanId:p.id,revision:rev},rows:[{fake:'forged'}]});assert.equal(exp.status,200);assert.ok(exp.body.includes('"240"'));assert.ok(!exp.body.includes('"481"'));assert.ok(exp.body.includes(p.inputVersionId));assert.ok(exp.body.includes('原始输入快照'));
 const json=JSON.parse(fs.readFileSync(path.join(dir,'business.json')));assert.deepEqual(json.inputVersions[p.inputVersionId].data,start.data);
 r=await call('/inputs',{tables:old.data,revision:rev,operation:'restore'});assert.equal(r.status,409);assert.equal(r.body.error,'restore_blocked');assert.equal((await call('/state')).body.data.inventory.length,0);
 assert.equal((await call('/plans')).body.find(x=>x.id===p.id).inputSnapshot.orders[0]['合格需求'],'240');
});
test('FR015 simulated confirmed storage fixture protects original inputs; missing or corrupt historical inputs fail closed',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 const file=path.join(dir,'business.json');let s=JSON.parse(fs.readFileSync(file));
 // Legacy test-only persistence fixture; real FR030 lifecycle is tested separately.
 s.plans[0].status='confirmed';fs.writeFileSync(file,JSON.stringify(s));
 const tables=structuredClone(s.data);tables.inventory=[];
 assert.equal((await call('/inputs',{tables,revision:0})).status,200);
 assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.inventory.length,2);
 for(const route of ['/plans','/plans/'+p.id+'/verify'])assert.equal((await call(route,{id:p.id,status:'draft',tasks:[]})).status,409);
 s=JSON.parse(fs.readFileSync(file));s.inputVersions[p.inputVersionId].data.inventory=[];fs.writeFileSync(file,JSON.stringify(s));
 assert.equal((await call('/plans/'+p.id+'/inputs')).status,409);
 const before=fs.readFileSync(file,'utf8');assert.equal((await call('/inputs',{tables,revision:1})).status,409);assert.equal(fs.readFileSync(file,'utf8'),before);
 assert.equal((await call('/plans/x/confirm',{},'supervisor')).status,404);
});
test('FR015 concurrent stale actions, alternate endpoints and forged audit/plan fields cannot mutate history',async t=>{
 const {call}=await fixture(t);const s=(await call('/state')).body;
 for(const [url,body] of [['/inputs',{tables:s.data,revision:0}],['/tables/products',{rows:s.data.products,revision:0}]])assert.equal((await call(url,{...body,role:'supervisor'},'query')).status,403);
 const a=structuredClone(s.data.orders),b=structuredClone(a);a[0]['合格需求']='241';b[0]['合格需求']='242';
 const results=await Promise.all([call('/tables/orders',{rows:a,revision:0,actor:'fake',at:'fake'}),call('/inputs',{tables:{orders:b},revision:0})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const records=(await call('/operations')).body;assert.equal(records.length,1);assert.equal(records[0].actor,'test#planner');assert.notEqual(records[0].at,'fake');assert.ok(records[0].fromVersion&&records[0].toVersion);
 for(const url of ['/state','/operations','/plans/x/inputs','/inputVersions'])assert.equal((await call(url,{data:s.data,inputVersions:{fake:s.data},status:'confirmed'})).status,404);
 assert.equal((await call('/inputs',{tables:s.data,revision:1,reason:''})).status,400);
 assert.equal((await call('/inputs',{tables:s.data,revision:1},'planner',{'sec-fetch-site':'cross-site'})).status,403);
});

test('FR015 invalid cross references, calendar ranges, route cycles, rule parameters and BOM units fail atomically',async t=>{
 const {call}=await fixture(t);const initial=(await call('/state')).body.data;
 const cases=[
  ['line mismatch','machines',r=>r[0]['产线编号']='L02'],
  ['calendar reference','machines',r=>r[0]['日历编号']='missing'],
  ['calendar range','calendars',r=>r[0]['结束分钟']='0'],
  ['route cycle','routes',r=>r[0]['前序工序']='FILL'],
  ['route removal','routes',r=>r.splice(0,1)],
  ['time removal','times',r=>r.splice(0,1)],
  ['equipment mismatch','dependencies',r=>r[0]['资源编号']='FILL01'],
  ['invalid rule object','rules',r=>r[0]['参数JSON']='[]'],
  ['invalid rule enable','rules',r=>r[0]['是否启用']='true'],
  ['inventory over-reserved','inventory',r=>r[0]['已占用数量']='501'],
  ['BOM units','bom',r=>r.push({'版本编号':'V1','产品编号':'HC40','生效日期':'2026-11-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':'LEAN','配置用量':'1','用量单位':'袋','用量基准':'总投入'})]
 ];
 for(const [label,key,change] of cases)await t.test(label,async()=>{
  const rows=structuredClone(initial[key]);change(rows);
  const r=await call('/inputs',{tables:{[key]:rows},revision:0});assert.equal(r.status,400,JSON.stringify(r.body));assert.ok(r.body.issues.length>0);
 });
 assert.equal((await call('/state')).body.revision,0);assert.equal((await call('/operations')).body.length,0);
});

test('FR014 issue11 D2 malformed explicit filters return 400 invalid_query, no internal details or export audit',async t=>{
 const {call}=await fixture(t);
 for(const filters of [null,[],false,true,0,'',42,'text',{from:null}]){
  const r=await call('/export',{query:{table:'orders',revision:0,filters}});assert.equal(r.status,400,JSON.stringify(filters));assert.deepEqual(r.body,{error:'invalid_query'});
 }
 assert.equal((await call('/operations')).body.length,0);
 for(const table of ['missing'])assert.equal((await call('/export',{query:{table,revision:0}})).status,404);
 assert.equal((await call('/export',{query:{table:'orders',planId:'missing',revision:0}})).status,404);
 for(const filters of [undefined,{}])assert.equal((await call('/export',{query:{table:'orders',revision:0,filters}})).status,200);
});
test('FR014 issue11 D1 authenticated current and historical export reject impossible filter dates',async t=>{
 const {call}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 for(const source of [{},{planId:p.id,sourcePlanId:p.id}]){
  const r=await call('/export',{query:{table:'inventory',revision:0,...source,filters:{dateField:'有效期',from:'2026-02-30',to:'2026-02-30'}}});assert.equal(r.status,200);assert.equal(r.body.split('\r\n').length,1);
 }
});

test('FR017 server rejects unsupported enablement, mandatory bypass and missing data through both writes; no audit/version mutation',async t=>{
 const {call,dir}=await fixture(t);await call('/calculate',{revision:0});
 const before=fs.readFileSync(path.join(dir,'business.json'),'utf8');const state=(await call('/state')).body;
 for(const operation of ['edit','import','restore'])for(const id of ['MACHINE','PRECEDENCE','CALENDAR','MOLD','MATERIAL','UNKNOWN']){
  const rules=structuredClone(state.data.rules);let r=rules.find(r=>r['规则编号']===id);
  if(!r){r={'规则编号':id,'中文名称':'unknown','是否启用':'否','参数JSON':'{}'};rules.push(r);}
  r['是否启用']=['MACHINE','PRECEDENCE','CALENDAR'].includes(id)?'否':'是';
  for(const [url,body] of [['/inputs',{tables:{rules}}],['/tables/rules',{rows:rules}]])assert.equal((await call(url,{...body,revision:0,operation})).status,400,id);
 }
 const rules=structuredClone(state.data.rules);rules.find(r=>r['规则编号']==='LABOR')['是否启用']='是';
 assert.equal((await call('/inputs',{tables:{rules},revision:0})).status,400);
 assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),before);
 assert.equal((await call('/rules/capabilities',undefined,'query')).body.length,20);
});
test('FR017 actual sorting, future effective time, old settings, historical export and immutable audit are server-derived',async t=>{
 const {call,dir}=await fixture(t);const initial=(await call('/state')).body.data;
 const old=(await call('/calculate',{revision:0,ruleSnapshot:{forged:true}})).body;
 assert.ok(old.ruleSnapshot.settings.length);assert.ok(!old.ruleSnapshot.forged);
 const rules=[...initial.rules,{'规则编号':'SORT','中文名称':'任务排序','是否启用':'是','参数JSON':'{"排序方式":"要求日期"}','适用对象':'*','生效时间':''}];
 const orders=structuredClone(initial.orders);orders[0]['要求可交付分钟']='500';orders[1]['要求可交付分钟']='100';
 const dependencies=structuredClone(initial.dependencies);dependencies.find(r=>r['订单编号']==='B'&&r['工序编号']==='MIX')['资源编号']='MIX01';
 let r=await call('/inputs',{tables:{rules,orders,dependencies},revision:0});assert.equal(r.status,200,JSON.stringify(r.body));
 const p=(await call('/calculate',{revision:1})).body;assert.equal(p.tasks[0].orderId,'B');assert.equal(p.tasks.find(t=>t.id==='A-MIX').start,30);
 assert.ok(p.rules.includes('SORT'));assert.equal(p.ruleSnapshot.settings.find(r=>r.id==='SORT').active,true);
 const snapshot=structuredClone(p.ruleSnapshot);
 rules.at(-1)['生效时间']='2099-01-01T00:00:00Z';r=await call('/inputs',{tables:{rules},revision:1});assert.equal(r.status,200);
 const future=(await call('/calculate',{revision:2})).body;assert.equal(future.tasks[0].orderId,'A');assert.ok(!future.rules.includes('SORT'));assert.equal(future.ruleSnapshot.settings.find(r=>r.id==='SORT').status,'待生效');
 const list=(await call('/plans')).body;assert.deepEqual(list.find(x=>x.id===p.id).ruleSnapshot,snapshot);assert.deepEqual(list.find(x=>x.id===old.id).ruleSnapshot,old.ruleSnapshot);
 const exp=await call('/export',{planId:p.id,ruleSettings:true,settings:[{forged:true}]});assert.equal(exp.status,200);assert.ok(exp.body.includes('要求日期'));assert.ok(!exp.body.includes('2099'));assert.ok(!exp.body.includes('forged'));assert.ok(exp.body.includes(p.inputVersionId));
 const record=(await call('/operations')).body.find(r=>r.target==='rules');assert.equal(record.before.length,initial.rules.length);assert.equal(record.after.length,rules.length);assert.ok(record.fromVersion&&record.toVersion&&record.batchId);assert.equal(record.actor,'test#planner');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'business.json'))).plans.find(x=>x.id===p.id).ruleSnapshot,snapshot);
});
test('FR017 corrupt or incomplete stored inputs fail calculation without damaging previous plan; valid infeasibility does not disable constraints',async t=>{
 const {call,dir}=await fixture(t);const old=(await call('/calculate',{revision:0})).body;
 const file=path.join(dir,'business.json');const pristine=JSON.parse(fs.readFileSync(file));
 for(const mutate of [s=>s.data.rules.push({'规则编号':'MOLD','中文名称':'工装','是否启用':'是','参数JSON':'{}'}),s=>s.data.dependencies=[],s=>s.data.times[0]['固定分钟']='',s=>s.data.machines[0]['日历编号']='']){
  const s=structuredClone(pristine);mutate(s);fs.writeFileSync(file,JSON.stringify(s));const before=fs.readFileSync(file,'utf8');
  const r=await call('/calculate',{revision:0});assert.equal(r.status,422,JSON.stringify(r.body));assert.ok(r.body.issues.length);assert.equal(fs.readFileSync(file,'utf8'),before);assert.deepEqual((await call('/plans')).body[0].ruleSnapshot,old.ruleSnapshot);
 }
 fs.writeFileSync(file,JSON.stringify(pristine));const calendars=pristine.data.calendars.map(r=>({...r,'结束分钟':'1'}));
 assert.equal((await call('/inputs',{tables:{calendars},revision:0})).status,200);
 const p=(await call('/calculate',{revision:1})).body;assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('CALENDAR')));assert.ok(p.rules.includes('CALENDAR'));assert.equal(p.ruleSnapshot.settings.find(r=>r.id==='CALENDAR').active,true);
 assert.equal((await call('/state')).body.data.rules.find(r=>r['规则编号']==='CALENDAR')['是否启用'],'是');
});
test('FR017 enabled personnel constraint with complete data cannot auto-disable on capacity shortage',async t=>{
 const {call}=await fixture(t);const data=(await call('/state')).body.data;
 const group={'人员组编号':'G1','人员组名称':'组1','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'};
 const need={'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G1','需求数量':'2','所需技能':'mix','所需班次':'day','人员开始偏移':'0','人员结束偏移':'0'};
 const rules=structuredClone(data.rules);rules.find(r=>r['规则编号']==='LABOR')['是否启用']='是';
 const saved=await call('/inputs',{revision:0,tables:{rules,personnelGroups:[group],dependencies:[...data.dependencies,need]}});assert.equal(saved.status,200,JSON.stringify(saved.body));
 const p=(await call('/calculate',{revision:1})).body;assert.ok(p.findings.some(f=>f.code.includes('PERSONNEL')));assert.ok(!p.tasks.some(t=>t.id==='A-MIX'));assert.ok(p.rules.includes('LABOR'));
 assert.equal(p.ruleSnapshot.settings.find(r=>r.id==='LABOR').active,true);assert.equal((await call('/state')).body.data.rules.find(r=>r['规则编号']==='LABOR')['是否启用'],'是');
});

async function waitRun(call,id){
 for(let i=0;i<250;i++){const r=await call('/runs/'+id);if(['completed','partial','cancelled','failed','timed_out'].includes(r.body.status))return r.body;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('run did not finish');
}
test('FR018 actual worker freezes selected input, horizon, ordering and adopted rules; edits allow a new run',async t=>{
 const {call}=await fixture(t);const initial=(await call('/state')).body;
 const selection={orderIds:['A'],startMinute:60,endMinute:100,priority:'要求日期',enabledRuleIds:['MACHINE','PRECEDENCE','CALENDAR']};
 const created=await call('/runs',{revision:0,selection,tasks:[{id:'forged'}],actor:'spoof'});assert.equal(created.status,202);const id=created.body.id;
 const rows=initial.data.orders.map(o=>({...o,'合格需求':'241'}));assert.equal((await call('/tables/orders',{rows,revision:0})).status,200);
 const done=await waitRun(call,id);assert.equal(done.status,'partial');assert.ok(done.planId);assert.equal(done.actor,'test#planner');
 const snapshot=(await call('/runs/'+id+'/inputs')).body;
 assert.equal(snapshot.originalInput.orders[0]['合格需求'],'240');assert.equal(snapshot.executionData.orders.length,1);assert.deepEqual(snapshot.conditions.orderIds,['A']);assert.equal(snapshot.executionData.rules.find(r=>r['规则编号']==='INVENTORY')['是否启用'],'否');
 const p=(await call('/plans')).body.find(p=>p.id===done.planId);assert.equal(p.runId,id);assert.equal(p.revision,0);assert.deepEqual(p.conditions,snapshot.conditions);assert.equal(p.snapshotHash,snapshot.snapshotHash);
 assert.deepEqual(p.tasks.map(t=>t.id),['A-MIX']);assert.equal(p.tasks[0].start,60);assert.ok(p.tasks[0].end<=100);assert.ok(p.findings.some(f=>f.code.includes('HORIZON')));assert.ok(!p.ruleSnapshot.settings.find(r=>r.id==='INVENTORY').active);
 assert.equal((await call('/runs/'+id+'/cancel',{})).status,409);
 const next=await call('/runs',{revision:1,selection:{orderIds:['B'],startMinute:0,endMinute:600}});assert.equal(next.status,202);assert.notEqual(next.body.id,id);assert.equal((await waitRun(call,next.body.id)).status,'completed');
 assert.deepEqual((await call('/runs/'+id+'/inputs')).body,snapshot);
 const log=(await call('/operations')).body;assert.ok(log.some(r=>r.action==='run_created'&&r.target===id&&r.snapshotHash===snapshot.snapshotHash));assert.ok(log.some(r=>r.action==='run_partial'&&r.target===id));
});
test('FR018 selection guards, role, CSRF and stale checks protect all run paths',async t=>{
 const {call}=await fixture(t);const s=(await call('/state')).body;
 for(const selection of [{orderIds:[]},{orderIds:['NO']},{orderIds:['A','A']},{startMinute:-1},{startMinute:'1'},{startMinute:60,endMinute:60},{endMinute:1e9},{priority:'optimize'},{enabledRuleIds:[]},{enabledRuleIds:['MACHINE','PRECEDENCE','CALENDAR','MOLD']},{unknown:1}]){
  const r=await call('/runs',{revision:0,selection});assert.ok([400,422].includes(r.status),JSON.stringify(r));
 }
 assert.equal((await call('/runs',{revision:99})).status,409);
 assert.equal((await call('/runs',{revision:0},'query')).status,403);
 assert.equal((await call('/runs/x/cancel',{},'query')).status,403);
 assert.equal((await call('/runs',{revision:0},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await call('/runs',{revision:0,reason:''})).status,400);
 assert.equal((await call('/runs/x')).status,404);assert.equal((await call('/runs/x/inputs')).status,404);
 assert.deepEqual((await call('/state')).body,s);assert.equal((await call('/runs')).body.length,0);assert.equal((await call('/operations')).body.length,0);
});
test('FR018 meaningful cancellation terminates a busy thread, preserves history and produces no result',async t=>{
 let worker,exited;const {call}=await fixture(t,false,{workerFactory:()=>{worker=new Worker('while(true){}',{eval:true});exited=new Promise(resolve=>worker.once('exit',resolve));return worker;}});
 const r=await call('/runs',{revision:0});const before=(await call('/state')).body;
 const cancelled=await call('/runs/'+r.body.id+'/cancel',{reason:'stop this computation'});assert.equal(cancelled.status,200);assert.equal(cancelled.body.status,'cancelled');
 await exited;assert.equal(worker.threadId,-1);assert.equal((await call('/runs/'+r.body.id)).body.failure.code,'user_cancelled');
 assert.equal((await call('/plans')).body.length,0);assert.deepEqual((await call('/state')).body,before);assert.equal((await call('/runs/'+r.body.id+'/cancel',{})).status,409);
 const log=(await call('/operations')).body;assert.equal(log.filter(r=>r.action==='run_cancelled').length,1);assert.equal(log.at(-1).reason,'stop this computation');assert.equal((await call('/runs/'+r.body.id+'/inputs')).status,200);
});
test('FR018 timeout kills computation and never asserts infeasibility; worker crash is a separate recorded failure',async t=>{
 const {call}=await fixture(t,false,{runTimeoutMs:30,workerFactory:()=>new Worker('while(true){}',{eval:true})});
 const created=await call('/runs',{revision:0});const done=await waitRun(call,created.body.id);assert.equal(done.status,'timed_out');assert.equal(done.failure.code,'time_limit');assert.match(done.failure.message,/不代表无可行/);assert.equal((await call('/plans')).body.length,0);
 const crash=await fixture(t,false,{workerFactory:()=>new Worker('throw Error("private input must not leak")',{eval:true})});
 const r=await crash.call('/runs',{revision:0});const failed=await waitRun(crash.call,r.body.id);assert.equal(failed.status,'failed');assert.equal(failed.failure.code,'worker_error');assert.ok(!JSON.stringify(failed).includes('private input'));assert.equal((await crash.call('/plans')).body.length,0);
});
test('FR018 two real active threads permit another run and enforce bounded capacity; cancel both',async t=>{
 const {call}=await fixture(t,false,{workerFactory:()=>new Worker('while(true){}',{eval:true})});
 const a=await call('/runs',{revision:0}),b=await call('/runs',{revision:0});assert.equal(a.status,202);assert.equal(b.status,202);assert.equal((await call('/runs',{revision:0})).status,429);
 for(const r of [a,b])assert.equal((await call('/runs/'+r.body.id+'/cancel',{})).body.status,'cancelled');
 assert.equal((await call('/plans')).body.length,0);
});
test('FR018 restart marks interrupted runs failed and detects corrupted persisted snapshots',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));const run=s.runs.find(r=>r.id===p.runId);run.status='running';delete run.finishedAt;fs.writeFileSync(file,JSON.stringify(s));
 createBusinessRouter({dataDir:dir,actorMiddleware:(_q,_s,next)=>next(),requireMember:()=> (_q,_s,next)=>next()});
 assert.equal((await call('/runs/'+run.id)).body.failure.code,'process_interrupted');assert.equal((await call('/plans')).body.length,1);
 const stored=JSON.parse(fs.readFileSync(file));stored.runs[0].executionData.orders[0]['合格需求']='999';fs.writeFileSync(file,JSON.stringify(stored));
 assert.equal((await call('/runs/'+run.id+'/inputs')).status,409);assert.equal((await call('/plans/'+p.id+'/verify',{})).status,409);
});
test('FR018 selected ordering changes actual machine schedule, fixed-axis start and immutable synchronous run',async t=>{
 const {call}=await fixture(t);const s=(await call('/state')).body;
 const deps=s.data.dependencies.map(r=>r['订单编号']==='B'&&r['工序编号']==='MIX'?{...r,'资源编号':'MIX01'}:r);
 const orders=s.data.orders.map(r=>({...r,'要求可交付分钟':r['订单编号']==='B'?'100':'480'}));
 assert.equal((await call('/inputs',{revision:0,tables:{dependencies:deps,orders}})).status,200);
 const byPriority=(await call('/calculate',{revision:1,selection:{startMinute:120,endMinute:600,priority:'优先顺序'}})).body;
 const byDue=(await call('/calculate',{revision:1,selection:{startMinute:120,endMinute:600,priority:'要求日期'}})).body;
 assert.equal(byPriority.tasks.find(t=>t.id==='A-MIX').start,120);assert.equal(byDue.tasks.find(t=>t.id==='B-MIX').start,120);assert.equal(byDue.tasks.find(t=>t.id==='A-MIX').start,150);
 assert.equal((await call('/runs/'+byDue.runId)).body.status,'completed');assert.equal((await call('/plans/'+byDue.id+'/verify',{})).status,200);
 const scoped=(await call('/calculate',{revision:1,selection:{orderIds:['A']}})).body;assert.equal((await call('/plans/'+scoped.id+'/verify',{})).status,200);
 const run=(await call('/runs/'+scoped.runId+'/inputs')).body;assert.equal(run.executionData.orders.length,1);assert.equal(run.originalInput.orders.length,2);
});
test('FR018 edit during a demonstrably active calculation and a second run cannot replace either frozen result',async t=>{
 const gate=new SharedArrayBuffer(4);const threads=[];
 const {call}=await fixture(t,false,{workerFactory:data=>{
  const worker=new Worker(`(async()=>{const {parentPort,workerData}=require('node:worker_threads');const {calculate}=await import(workerData.plannerUrl);parentPort.postMessage({kind:'progress'});Atomics.wait(new Int32Array(workerData.gate),0,0,5000);parentPort.postMessage({kind:'result',plan:calculate(workerData.executionData,workerData.revision,workerData.calculatedAt,workerData.conditions)});})().catch(()=>process.exit(1));`,{eval:true,workerData:{...data,gate,plannerUrl:new URL('./planner.ts',import.meta.url).href}});threads.push(worker);return worker;
 }});
 t.after(()=>Promise.all(threads.map(w=>w.terminate())));
 const initial=(await call('/state')).body;const first=await call('/runs',{revision:0,selection:{orderIds:['A']}});assert.equal(first.status,202);
 assert.ok(['queued','running'].includes((await call('/runs/'+first.body.id)).body.status));
 const times=initial.data.times.map(r=>({...r,'固定分钟':'45'}));assert.equal((await call('/tables/times',{rows:times,revision:0})).status,200);
 assert.ok(['queued','running'].includes((await call('/runs/'+first.body.id)).body.status));
 const second=await call('/runs',{revision:1,selection:{orderIds:['A']}});assert.equal(second.status,202);assert.notEqual(first.body.snapshotHash,second.body.snapshotHash);
 const original=(await call('/runs/'+first.body.id+'/inputs')).body;assert.equal(original.executionData.times[0]['固定分钟'],'30');
 Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0);
 const a=await waitRun(call,first.body.id),b=await waitRun(call,second.body.id);assert.equal(a.status,'completed');assert.equal(b.status,'completed');
 const plans=(await call('/plans')).body;assert.equal(plans.find(p=>p.id===a.planId).tasks[0].duration,30);assert.equal(plans.find(p=>p.id===b.planId).tasks[0].duration,45);
 assert.deepEqual((await call('/runs/'+first.body.id+'/inputs')).body,original);
});
test('FR018 timeout or cancellation preserves a previously saved plan, and exports exact run conditions',async t=>{
 const {call}=await fixture(t,false,{runTimeoutMs:25,workerFactory:()=>new Worker('while(true){}',{eval:true})});
 const p=(await call('/calculate',{revision:0,selection:{orderIds:['A'],startMinute:90,endMinute:300,priority:'要求日期'}})).body;
 const before=(await call('/plans')).body;const exported=await call('/export',{planId:p.id,ruleSettings:true});assert.equal(exported.status,200);assert.ok(exported.body.includes(p.runId));assert.ok(exported.body.includes('startMinute'));assert.ok(exported.body.includes('本次计算条件'));
 const pending=await call('/runs',{revision:0});assert.equal((await waitRun(call,pending.body.id)).status,'timed_out');
 assert.deepEqual((await call('/plans')).body,before);assert.equal((await call('/state')).body.revision,0);
 const done=(await call('/runs/'+pending.body.id)).body;assert.ok(done.finishedAt);assert.equal((await call('/runs/'+pending.body.id+'/inputs',undefined,'query')).status,200);
});

// FR019: exercise the integrated authoritative API, not a second scheduler.
async function minimalFixture(t){
 const f=await fixture(t);const data=(await f.call('/state')).body.data;
 data.machines=data.machines.filter(m=>['MIX01','FILL01'].includes(m['设备编号']));
 data.dependencies.forEach(d=>d['资源编号']=d['工序编号']==='MIX'?'MIX01':'FILL01');
 data.calendars[0]['起始分钟']='300';
 data.downtime=[{'设备编号':'MIX01','起始分钟':'300','结束分钟':'330','原因':'最小模式不判断停机'}];
 data.personnelGroups=[{'人员组编号':'G','人员组名称':'模拟人员','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'}];
 data.dependencies.push({'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'2','所需技能':'mix','所需班次':'day','人员参与阶段':'全工序','人员开始偏移':'0','人员结束偏移':'0'});
 data.supplies=[{'供给编号':'S','物料编号':'LEAN','批次编号':'LOT','预计数量':'100','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00'}];
 data.supplyUses=[{'引用编号':'U','订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'10'}];
 const r=await f.call('/inputs',{revision:0,tables:data});assert.equal(r.status,200,JSON.stringify(r.body));
 return {...f,data,revision:r.body.revision};
}
test('FR019 explicit minimal mode uses two assigned machines, fixed durations, nonoverlap and precedence despite closed calendar, unavailable personnel and late supply',async t=>{
 const {call,revision}=await minimalFixture(t);
 const r=await call('/calculate',{revision,selection:{mode:'minimal-r1',endMinute:90},tasks:[{id:'forged'}],conditions:{mode:'supported'}});
 assert.equal(r.status,201,JSON.stringify(r.body));const p=r.body;
 assert.equal(p.tasks.length,4);assert.equal(p.findings.length,0);
 assert.deepEqual(p.tasks.map(t=>[t.id,t.machine,t.start,t.end,t.duration]),[['A-MIX','MIX01',0,30,30],['A-FILL','FILL01',30,60,30],['B-MIX','MIX01',30,60,30],['B-FILL','FILL01',60,90,30]]);
 assert.equal(p.conditions.mode,'minimal-r1');assert.match(p.conditions.checkScope.machineAvailability,/连续可用/);assert.ok(p.conditions.checkScope.unchecked.some(s=>s.includes('人员')));
 assert.equal(p.ruleSnapshot.settings.find(s=>s.id==='CALENDAR').enabled,true);assert.equal(p.ruleSnapshot.settings.find(s=>s.id==='CALENDAR').active,false);assert.match(p.ruleSnapshot.settings.find(s=>s.id==='CALENDAR').status,/未检查/);
 assert.deepEqual(p.rules,['MACHINE','PRECEDENCE']);assert.equal(p.supplyConditions.length,0);
 assert.ok(p.tasks.every(t=>/最小模式/.test(t.source)&&!/工厂日历02/.test(t.source)));
 const v=await call('/plans/'+p.id+'/verify',{});assert.equal(v.status,200);assert.deepEqual(Object.values(v.body.verification.checks).map(c=>c.status),['pass','pass','pass']);assert.match(v.body.verification.scopeNote,/不代表完整业务/);
 for(const ruleSettings of [false,true]){const e=await call('/export',{planId:p.id,ruleSettings,conditions:{mode:'forged'}});assert.equal(e.status,200);for(const word of ['minimal-r1','日历与停机','人员','模具与工装','物料','不代表完整业务','运行快照'])assert.ok(e.body.includes(word),word);assert.ok(!e.body.includes('forged'));}
 const queryExport=await call('/export',{query:{table:'tasks',planId:p.id,revision}});assert.equal(queryExport.status,200);for(const word of ['R1 最小模式','尚未检查','日历与停机','不代表完整业务'])assert.ok(queryExport.body.includes(word),word);
 const run=(await call('/runs/'+p.runId)).body;assert.deepEqual(run.conditions,p.conditions);
 const input=(await call('/runs/'+p.runId+'/inputs')).body;assert.deepEqual(input.conditions,p.conditions);assert.equal(input.originalInput.dependencies.length,5);assert.equal(input.executionData.dependencies.length,5);
 const logs=(await call('/operations')).body;assert.ok(logs.every(l=>l.actor==='test#planner'&&l.reason==='test reason'));
});
test('FR019 supported default retains calendar, staffing and supply checks and never retries in minimal mode',async t=>{
 const {call,revision,data}=await minimalFixture(t);
 let p=(await call('/calculate',{revision})).body;assert.equal(p.conditions.mode,'supported');assert.ok(!p.tasks.some(t=>t.id==='A-MIX'));assert.ok(p.findings.some(f=>f.code.includes('PERSONNEL')));assert.equal(p.tasks.find(t=>t.id==='B-MIX').start,330);
 // Remove personnel demand; supported mode still obeys explicit supply and calendar.
 data.dependencies=data.dependencies.filter(d=>d['资源类型']==='设备');data.calendars[0]['起始分钟']='0';data.downtime=[];
 const saved=await call('/inputs',{revision,tables:data});assert.equal(saved.status,200);
 p=(await call('/calculate',{revision:saved.body.revision,selection:{mode:'supported',endMinute:120}})).body;
 assert.ok(!p.tasks.some(t=>t.id==='A-MIX'));assert.ok(p.findings.some(f=>f.code.includes('HORIZON')));assert.equal(p.conditions.mode,'supported');assert.equal(p.ruleSnapshot.settings.find(s=>s.id==='CALENDAR').active,true);
});
test('FR019 mode is validated, necessary rule bypass denied, admission failures preserve storage, roles and CSRF apply',async t=>{
 const {call,dir}=await fixture(t);await call('/calculate',{revision:0});const before=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 for(const mode of ['auto','full',null,{},1]){const r=await call('/runs',{revision:0,selection:{mode}});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_mode');}
 for(const mode of ['supported','minimal-r1'])for(const enabledRuleIds of [[],['MACHINE'],['MACHINE','PRECEDENCE']])assert.equal((await call('/calculate',{revision:0,selection:{mode,enabledRuleIds}})).status,400);
 assert.equal((await call('/runs',{revision:0,selection:{mode:'minimal-r1'}},'query')).status,403);
 assert.equal((await call('/runs',{revision:0,selection:{mode:'minimal-r1'}},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),before);
});
test('FR019 real Worker persists explicit scope and historical outputs after later edits and a supported run',async t=>{
 const {call,revision,data}=await minimalFixture(t);
 const r=await call('/runs',{revision,selection:{mode:'minimal-r1',orderIds:['A'],startMinute:600,endMinute:660}});assert.equal(r.status,202);
 let run;for(let i=0;i<200;i++){run=(await call('/runs/'+r.body.id)).body;if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(run.status,'completed',JSON.stringify(run));let p=(await call('/plans')).body.find(p=>p.id===run.planId);assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[600,630],[630,660]]);
 const old=JSON.stringify(p);const snapshot=(await call('/runs/'+run.id+'/inputs')).body;
 data.times[0]['固定分钟']='45';const saved=await call('/inputs',{revision,tables:data});assert.equal(saved.status,200);await call('/calculate',{revision:saved.body.revision});
 p=(await call('/plans')).body.find(p=>p.id===run.planId);assert.equal(JSON.stringify(p),old);assert.deepEqual((await call('/runs/'+run.id+'/inputs')).body,snapshot);
 assert.equal((await call('/plans/'+p.id+'/verify',{})).status,409);
 assert.ok((await call('/export',{planId:p.id})).body.includes('minimal-r1'));
 const created=(await call('/operations')).body.find(l=>l.action==='run_created');assert.equal(created.conditions.mode,'minimal-r1');
});
test('FR019 minimal horizon preserves exact duration and omits successors of unplanned tasks; cycles cannot pass',async t=>{
 const {call,revision}=await minimalFixture(t);
 const p=(await call('/calculate',{revision,selection:{mode:'minimal-r1',endMinute:30}})).body;
 assert.deepEqual(p.tasks.map(t=>t.id),['A-MIX']);assert.equal(p.tasks[0].duration,30);assert.ok(p.findings.some(f=>f.code.includes('HORIZON')));assert.ok(p.findings.some(f=>f.code.includes('PREDECESSOR')));
 const {calculate,seed}=await import('./planner.ts');const invalid=structuredClone(seed);invalid.routes[0]['前序工序']='FILL';
 const result=calculate(invalid,0,new Date().toISOString(),{mode:'minimal-r1'});assert.equal(result.tasks.length,0);assert.ok(result.findings.some(f=>/循环/.test(f.message)));
});
test('FR019 constructive scheduling remains valid for unsorted routes, shared machines, independent steps and fractional fixed durations',async()=>{
 const {calculate,seed}=await import('./planner.ts');const {independentlyVerifyPlan}=await import('../src/lib/independent-verification.mjs');
 for(let size=1;size<=20;size++){
  const d=structuredClone(seed);d.orders=Array.from({length:size},(_,i)=>({...d.orders[0],'订单编号':'T'+i,'优先顺序':String(size-i)}));
  d.routes=d.routes.filter(r=>r['产品编号']==='HC40').reverse();d.times=d.times.filter(r=>r['产品编号']==='HC40');d.times[0]['固定分钟']='0.5';
  d.dependencies=d.orders.flatMap(o=>['MIX','FILL'].map(op=>({'订单编号':o['订单编号'],'工序编号':op,'资源类型':'设备','资源编号':op+'01'})));
  const p=calculate(d,0,new Date().toISOString(),{mode:'minimal-r1',startMinute:7});assert.equal(p.tasks.length,size*2);assert.equal(p.findings.length,0);
  assert.ok(p.tasks.every(t=>t.start>=7&&t.end-t.start===Number(d.times.find(r=>r['工序编号']===t.operation)['固定分钟'])&&t.machine===t.operation+'01'));
  const v=independentlyVerifyPlan(p,d.orders,d.routes,p.rules);assert.deepEqual(Object.values(v.checks).map(c=>c.status),['pass','pass','pass']);
 }
});

// FR020 uses the real asynchronous Worker and canonical server input paths.
import {materialFixture} from '../qa/material-fixture.mjs';
test('FR020 inventory integration: server-authoritative25kg shortage, no deduction, repeat runs and immutable exports',async t=>{
 const {call}=await fixture(t);const initial=(await call('/state')).body,d=materialFixture(initial.data);
 Object.assign(d.inventory[0],{'账面数量':'400','已占用数量':'100'});
 const saved=await call('/inputs',{revision:0,tables:d});assert.equal(saved.status,200,JSON.stringify(saved.body));
 const state=(await call('/state')).body;
 const start=await call('/runs',{revision:1,selection:{endMinute:600},materialDemands:[{quantity:0}],materialChecked:false});assert.equal(start.status,202);
 const done=await waitRun(call,start.body.id);assert.equal(done.status,'partial');
 const p=(await call('/plans')).body.find(p=>p.id===done.planId);assert.equal(p.tasks.length,0);assert.equal(p.materialChecked,true);assert.equal(p.materialDemands[0].quantity,325);assert.equal(p.materialDemands[0].shortage,25);assert.equal(p.materialDemands[0].committed,false);assert.equal(p.materialDemands.find(r=>r.materialId==='BAG').quantity,1213);assert.equal(p.materialDemands.find(r=>r.materialId==='BAG').committed,false);assert.ok(p.findings.some(f=>f.code.includes('MATERIAL')&&f.message.includes('25')));
 assert.ok(p.conditions.checkScope.checked.some(s=>s.includes('BOM需求')));assert.equal(p.ruleSnapshot.settings.find(r=>r.id==='MATERIAL').active,true);
 assert.deepEqual((await call('/state')).body.data,state.data);
 const repeat=await call('/runs',{revision:1,selection:{endMinute:600}});const again=await waitRun(call,repeat.body.id);const p2=(await call('/plans')).body.find(p=>p.id===again.planId);assert.deepEqual(p.materialDemands,p2.materialDemands);
 const exported=await call('/export',{planId:p.id});assert.equal(exported.status,200);assert.ok(exported.body.includes('shortage')&&exported.body.includes('25')&&exported.body.includes('LEAN-LOT'));
 const snapshot=(await call('/runs/'+start.body.id+'/inputs')).body;
 const inventory=d.inventory.map(r=>({...r,'账面数量':'10000'}));assert.equal((await call('/tables/inventory',{revision:1,rows:inventory})).status,200);
 assert.deepEqual((await call('/runs/'+start.body.id+'/inputs')).body,snapshot);assert.deepEqual((await call('/plans')).body.find(x=>x.id===p.id),p);
 assert.equal((await call('/runs',{revision:2},'query')).status,403);assert.equal((await call('/export',{planId:p.id},'query')).status,403);
 assert.equal((await call('/runs',{revision:2},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 const audit=(await call('/operations')).body;assert.ok(audit.some(a=>a.action==='run_partial'&&a.target===start.body.id));assert.ok(audit.every(a=>a.actor==='test#planner'&&a.reason));
});
test('FR020 expected supply readiness/delay and policy produce conditional allocations; minimal retains unchecked',async t=>{
 const {call}=await fixture(t);const initial=(await call('/state')).body,d=materialFixture(initial.data);
 d.inventory[0]['账面数量']='0';const rule=d.rules.find(r=>r['规则编号']==='MATERIAL');rule['参数JSON']=rule['参数JSON'].replace('false','true');
 d.supplies=[{'供给编号':'S','物料编号':'LEAN','批次编号':'EXPECTED','预计数量':'325','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'U','订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'325'}];
 assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);
 const old=(await call('/calculate',{revision:1})).body;const storedOld=(await call('/plans')).body.find(x=>x.id===old.id);assert.equal(old.tasks[0].start,180);assert.equal(old.materialDemands[0].allocations[0].conditional,true);assert.equal(old.supplyConditions[0]['使用数量'],'325');assert.match(old.supplyConditions[0]['条件说明'],/未确认真实到货/);
 assert.equal((await call('/tables/supplyDelays',{revision:1,rows:[{'记录编号':'D','供给编号':'S','记录时间':'2026-11-01T00:00:00Z','调整后到达时间':'2026-11-02T11:00:00+08:00','调整后可用时间':'2026-11-02T12:00:00+08:00','原因':'延期模拟'}]})).status,200);
 const run=await call('/runs',{revision:2,selection:{endMinute:600}}),done=await waitRun(call,run.body.id);const p=(await call('/plans')).body.find(x=>x.id===done.planId);assert.equal(p.tasks[0].start,240);assert.equal(p.materialDemands[0].feedMinute,240);assert.ok(p.supplyConditions[0]['延期记录'].length);const csv=(await call('/export',{query:{table:'tasks',planId:p.id,revision:2,filters:{order:'A'}}})).body;assert.ok(csv.includes('物料需求与批次分配')&&csv.includes('EXPECTED')&&csv.includes('325'));
 assert.deepEqual((await call('/plans')).body.find(x=>x.id===old.id),storedOld);
 const minimal=await call('/runs',{revision:2,selection:{mode:'minimal-r1',endMinute:600}}),m=await waitRun(call,minimal.body.id);const mp=(await call('/plans')).body.find(x=>x.id===m.planId);assert.equal(mp.tasks[0].start,0);assert.equal(mp.materialChecked,false);assert.deepEqual(mp.materialDemands,[]);assert.ok(mp.conditions.checkScope.unchecked.includes('完整物料/BOM/库存分配'));assert.equal(mp.ruleSnapshot.settings.find(r=>r.id==='MATERIAL').active,false);
});
test('FR020 shared lots, feed-date recheck after machine/calendar shifts, rollback on horizon and remaining quantity',async t=>{
 const {calculate,seed}=await import('./planner.ts');const d=materialFixture(seed);
 d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'2'});d.dependencies.push(...d.dependencies.map(r=>({...r,'订单编号':'B'})));d.inventory[0]['账面数量']='325';
 let p=calculate(d,0,'2026-10-29T00:00:00Z');assert.equal(p.tasks.filter(t=>t.operation==='MIX').length,1);assert.equal(p.materialDemands.find(r=>r.orderId==='B').shortage,325);assert.equal(p.materialDemands.filter(r=>r.committed&&r.materialId==='LEAN').reduce((n,r)=>n+r.allocations.reduce((a,b)=>a+b.quantity,0),0),325);
 const fresh=materialFixture(seed);fresh.orders[0]['已完成合格数量']='240';p=calculate(fresh,0,'2026-10-29T00:00:00Z');assert.equal(p.materialDemands[0].quantity,162.5);
 p=calculate(fresh,0,'2026-10-29T00:00:00Z',{endMinute:10});assert.equal(p.tasks.length,0);assert.equal(fresh.inventory[0]['账面数量'],'10000');
 fresh.inventory[0]['有效期']='2026-11-02';fresh.calendars[0]['起始分钟']='1440';fresh.calendars[0]['结束分钟']='1600';p=calculate(fresh,0,'2026-10-29T00:00:00Z');assert.equal(p.tasks.length,0);assert.equal(p.materialDemands[0].shortage,162.5);
});

import {batchFixture} from '../qa/batch-fixture.mjs';
test('FR021 real Worker saved split identities, exports, input immutability and trusted role/audit paths',async t=>{
 const {call}=await fixture(t);const state=(await call('/state')).body,d=batchFixture(state.data);
 assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);
 const r=await call('/runs',{revision:1,selection:{endMinute:600},batchChecked:false,resourceBatches:[],tasks:[]});assert.equal(r.status,202);
 const done=await waitRun(call,r.body.id);assert.equal(done.status,'completed',JSON.stringify(done));
 const p=(await call('/plans')).body.find(p=>p.id===done.planId);assert.equal(p.batchChecked,true);assert.equal(p.tasks.length,4);assert.equal(p.productionBatches.length,2);assert.equal(p.materialDemands.reduce((n,r)=>n+r.quantity,0),500);
 const canonical=(await call('/state')).body.data;const historical=(await call('/runs/'+r.body.id+'/inputs')).body;assert.deepEqual(historical.executionData.orders,canonical.orders);
 const csv=(await call('/export',{query:{table:'tasks',planId:p.id,revision:1,filters:{order:'A'}}})).body;assert.ok(csv.includes('生产批编号')&&csv.includes('FR021-RB')&&csv.includes('240'));
 const verified=await call('/plans/'+p.id+'/verify',{});assert.equal(verified.status,200);assert.equal(verified.body.verification.checks.machineOverlap.status,'pass');assert.equal(verified.body.verification.checks.precedence.status,'pass');
 const saved=(await call('/plans')).body.find(x=>x.id===p.id);
 const inputBefore=(await call('/state')).body.data;assert.deepEqual(inputBefore,canonical);
 const again=await call('/runs',{revision:1,selection:{endMinute:600}});const againDone=await waitRun(call,again.body.id);const repeated=(await call('/plans')).body.find(x=>x.id===againDone.planId);assert.deepEqual(repeated.productionBatches,p.productionBatches);assert.deepEqual(repeated.materialDemands,p.materialDemands);
 const times=d.times.map(t=>({...t,'固定分钟':'45'}));assert.equal((await call('/tables/times',{revision:1,rows:times})).status,200);
 assert.deepEqual((await call('/runs/'+r.body.id+'/inputs')).body,historical);assert.deepEqual((await call('/plans')).body.find(x=>x.id===p.id),saved);
 assert.equal((await call('/runs',{revision:2},'query')).status,403);assert.equal((await call('/export',{planId:p.id},'query')).status,403);assert.equal((await call('/runs',{revision:2},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 const logs=(await call('/operations')).body;assert.ok(logs.some(l=>l.action==='run_completed'&&l.target===r.body.id));assert.ok(logs.every(l=>l.actor==='test#planner'&&l.reason));
});

test('FR021 group/program table validated atomically with actor grants and legacy empty-table export',async t=>{
 const {call,dir}=await fixture(t);const state=(await call('/state')).body;
 // Existing pre-FR021 states need not be rewritten just to expose an empty optional table.
 await call('/calculate',{revision:0});const file=path.join(dir,'business.json'),stored=JSON.parse(fs.readFileSync(file));delete stored.data.batchResources;fs.writeFileSync(file,JSON.stringify(stored));
 assert.equal((await call('/export',{table:'batchResources'})).status,200);
 const d=batchFixture(state.data);assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);
 const before=(await call('/state')).body;
 assert.equal((await call('/tables/batchResources',{revision:1,rows:[{...d.batchResources[0],'容量':'299'}]})).status,400);
 assert.deepEqual((await call('/state')).body,before);
 assert.equal((await call('/tables/batchResources',{revision:1,rows:d.batchResources},'query')).status,403);
 assert.equal((await call('/tables/batchResources',{revision:1,rows:[{...d.batchResources[0],'允许程序':'P;P'}]})).status,400);
});

import {jointFixture} from '../qa/joint-fixture.mjs';
test('FR022 canonical async runs persist joint occupancy, immutable histories and audited atomic declarations',async t=>{
 const {call}=await fixture(t);const initial=(await call('/state')).body.data;const d=jointFixture(initial);
 let s=await call('/inputs',{revision:0,tables:{tools:d.tools,resourceClaims:d.resourceClaims,orders:d.orders,dependencies:d.dependencies,rules:d.rules}});assert.equal(s.status,200,JSON.stringify(s.body));
 const bad=structuredClone(d.resourceClaims);bad[0]['后延占用分钟']='';
 const oldState=(await call('/state')).body,oldLog=(await call('/operations')).body;
 assert.equal((await call('/inputs',{revision:1,tables:{tools:[{...d.tools[0],'可用数量':'1'}],resourceClaims:bad}})).status,400);
 assert.deepEqual((await call('/state')).body,oldState);assert.deepEqual((await call('/operations')).body,oldLog);
 assert.equal((await call('/tables/tools',{revision:1,rows:d.tools},'query')).status,403);
 assert.equal((await call('/tables/resourceClaims',{revision:1,rows:d.resourceClaims},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 let run=await call('/runs',{revision:1,selection:{endMinute:600},resourceReservations:[{resourceId:'forged'}],actor:'spoof'});assert.equal(run.status,202,JSON.stringify(run.body));
 for(let i=0;i<200;i++){run=await call('/runs/'+run.body.id);if(['completed','partial','failed'].includes(run.body.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(run.body.status,'completed',JSON.stringify(run.body));
 const plans=(await call('/plans')).body,p=plans.find(p=>p.id===run.body.planId);assert.deepEqual(p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[0,0,30]);
 assert.equal(p.jointResourceChecks.MOLD,true);assert.ok(!p.resourceReservations.some(r=>r.resourceId==='forged'));assert.equal(p.ruleSnapshot.capabilityVersion,'FR022-v1');
 const snapshot=(await call('/runs/'+run.body.id+'/inputs')).body;assert.deepEqual(snapshot.executionData.resourceClaims,d.resourceClaims);assert.equal(snapshot.conditions.checkScope.checked.some(x=>x.includes('工装')),true);
 const csv=await call('/export',{planId:p.id});assert.equal(csv.status,200);assert.match(csv.body,/G40/);assert.match(csv.body,/联合资源占用/);
 const claims=structuredClone(d.resourceClaims);claims.forEach(c=>c['后延占用分钟']='10');assert.equal((await call('/tables/resourceClaims',{revision:1,rows:claims})).status,200);
 const oldAgain=(await call('/plans')).body.find(x=>x.id===p.id);assert.deepEqual(oldAgain,p);assert.deepEqual((await call('/runs/'+run.body.id+'/inputs')).body,snapshot);
 const next=(await call('/calculate',{revision:2})).body;assert.deepEqual(next.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[0,0,40]);
 const records=(await call('/operations')).body;assert.ok(records.some(r=>r.action==='run_completed'));assert.ok(records.every(r=>r.actor==='test#planner'&&r.reason==='test reason'&&r.requestId==='trusted-request'));
});

import {deliveryFixture} from '../qa/delivery-fixture.mjs';
test('FR023 canonical sync/async delivery reports, simulated-quality CRUD, immutable history, roles and audited export',async t=>{
 const {call}=await fixture(t),d=deliveryFixture((await call('/state')).body.data);
 assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);
 const initial=(await call('/state')).body;
 assert.equal((await call('/tables/deliveryConditions',{revision:1,rows:[{...d.deliveryConditions[0],'模拟质量可用时间':'2026-02-30T01:00:00Z'}]})).status,400);
 assert.deepEqual((await call('/state')).body,initial);
 for(const [sub,headers]of [['query',{}],['planner',{'sec-fetch-site':'cross-site'}]])assert.equal((await call('/tables/deliveryConditions',{revision:1,rows:d.deliveryConditions},sub,headers)).status,403);
 const selection={startMinute:180,endMinute:600};
 const sync=await call('/calculate',{revision:1,selection,deliveryAssessment:{orders:[{delayMinutes:0,promised:true}]}});assert.equal(sync.status,201);assert.equal(sync.body.deliveryAssessment.orders[0].delayMinutes,60);assert.equal(sync.body.deliveryAssessment.promised,false);
 const old=(await call('/plans')).body.find(p=>p.id===sync.body.id),snap=(await call('/runs/'+old.runId+'/inputs')).body;
 const async=await call('/runs',{revision:1,selection,deliveryAssessment:{promised:true}});assert.equal(async.status,202);const done=await waitRun(call,async.body.id);assert.equal(done.status,'completed');const p=(await call('/plans')).body.find(p=>p.id===done.planId);assert.deepEqual(p.deliveryAssessment,old.deliveryAssessment);assert.deepEqual(p.productionBatches,old.productionBatches);assert.deepEqual(p.materialDemands,old.materialDemands);
 assert.deepEqual(snap.executionData.deliveryConditions,d.deliveryConditions);assert.ok(p.conditions.checkScope.checked.some(x=>x.includes('交付')));
 assert.equal((await call('/export',{planId:p.id},'query')).status,403);
 const csv=await call('/export',{planId:p.id});assert.equal(csv.status,200);assert.match(csv.body,/订单完成与交期影响/);assert.match(csv.body,/conditional-late/);assert.match(csv.body,/模拟合格/);assert.match(csv.body,/FR023-v1/);
 const queried=await call('/export',{query:{table:'tasks',planId:p.id,revision:1,filters:{order:'A'}}});assert.equal(queried.status,200);assert.match(queried.body,/订单完成与交期影响/);
 const rows=[{...d.deliveryConditions[0],'模拟质量状态':'模拟预计可用','模拟质量可用时间':'2026-11-02T15:00:00+08:00'}];assert.equal((await call('/tables/deliveryConditions',{revision:1,rows})).status,200);
 const next=(await call('/calculate',{revision:2,selection})).body;assert.equal(next.deliveryAssessment.orders[0].expectedDeliverableMinute,420);
 assert.deepEqual((await call('/plans')).body.find(p=>p.id===old.id),old);assert.deepEqual((await call('/runs/'+old.runId+'/inputs')).body,snap);
 const audit=(await call('/operations')).body;assert.ok(audit.some(a=>a.action==='run_completed'));assert.ok(audit.some(a=>a.action==='export'));assert.ok(audit.every(a=>a.actor==='test#planner'&&a.reason==='test reason'&&a.requestId==='trusted-request'));
});
test('FR023 legacy plans and missing optional delivery table remain historical and exportable without invented assessment',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body,file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));delete s.data.deliveryConditions;delete s.plans[0].deliveryAssessment;fs.writeFileSync(file,JSON.stringify(s));
 const before=(await call('/plans')).body;assert.equal(before[0].deliveryAssessment,undefined);assert.equal((await call('/export',{table:'deliveryConditions'})).status,200);assert.equal((await call('/export',{planId:p.id})).status,200);assert.deepEqual((await call('/plans')).body,before);
});
test('FR024 real partial Worker result exports frozen task reasons with permission, audit and later-run integrity',async t=>{
 const {call}=await fixture(t);const input=(await call('/state')).body;
 const started=await call('/runs',{revision:0,selection:{orderIds:['A'],endMinute:45}});const run=await waitRun(call,started.body.id);
 assert.equal(run.resultState.code,'partial-unplanned');assert.equal(run.resultState.hasSavedResult,true);assert.equal(run.resultState.globalFeasibility,'unknown');
 const p=(await call('/plans')).body.find(p=>p.id===run.planId),snapshot=JSON.stringify(p);assert.equal(p.tasks.length,1);assert.equal(p.resultAssessment.unplannedCount,1);assert.ok(p.resultAssessment.tasks.find(t=>t.id==='A-FILL').reasons.some(r=>r.code.includes('HORIZON')));
 const denied=await call('/export',{runId:run.id},'query');assert.equal(denied.status,403);
 const out=await call('/export',{runId:run.id});assert.equal(out.status,200);for(const v of [run.id,run.snapshotHash,run.inputVersionId,'HORIZON','A-FILL','partial-unplanned'])assert.ok(out.body.includes(v));
 assert.equal((await call('/export',{runId:'missing'})).status,404);assert.equal((await call('/runs/'+run.id+'/cancel',{})).status,409);
 const rows=input.data.orders.map(o=>({...o,'合格需求':'241'}));assert.equal((await call('/tables/orders',{rows,revision:0})).status,200);
 const next=await call('/runs',{revision:1,selection:{orderIds:['A']}});assert.equal((await waitRun(call,next.body.id)).resultState.code,'scheduled');assert.equal(JSON.stringify((await call('/plans')).body.find(x=>x.id===p.id)),snapshot);
 const operations=(await call('/operations')).body;const exports=operations.filter(x=>x.action==='export'&&x.target===run.id);assert.equal(exports.length,1);assert.equal(exports[0].actor,'test#planner');assert.ok(operations.some(x=>x.action==='run_partial'&&x.snapshotHash===run.snapshotHash));
});
test('FR024 cancellation, timeout and crash preserve existing partial result and export distinct terminal evidence',async t=>{
 for(const mode of ['cancel','timeout','failure']){
  let count=0;const {call}=await fixture(t,false,{runTimeoutMs:mode==='timeout'?500:5000,workerFactory:data=>++count===1?new Worker(new URL('./calculation-worker.mjs',import.meta.url),{workerData:data}):new Worker(mode==='failure'?'throw Error("private data")':'while(true){}',{eval:true})});
  const first=await call('/runs',{revision:0,selection:{orderIds:['A'],endMinute:45}}),partial=await waitRun(call,first.body.id);assert.ok(partial.planId);const plans=(await call('/plans')).body,inputs=(await call('/state')).body;
  const second=await call('/runs',{revision:0});if(mode==='cancel')assert.equal((await call('/runs/'+second.body.id+'/cancel',{})).status,200);
  const done=await waitRun(call,second.body.id);assert.equal(done.resultState.code,{cancel:'user-cancellation',timeout:'time-limit-no-result',failure:'calculation-failure'}[mode]);assert.equal(done.resultState.hasSavedResult,false);assert.equal(done.resultState.globalFeasibility,'unknown');assert.equal(done.planId,undefined);
  const csv=await call('/export',{runId:done.id});assert.equal(csv.status,200);assert.ok(csv.body.includes(done.resultState.code));assert.ok(!csv.body.includes('private data'));if(mode==='timeout')assert.match(csv.body,/不代表业务无解/);
  assert.deepEqual((await call('/plans')).body,plans);assert.deepEqual((await call('/state')).body,inputs);assert.equal((await call('/runs/'+done.id+'/inputs')).status,200);assert.equal((await call('/runs/'+done.id+'/cancel',{})).status,409);
 }
});

test('FR026 exact copied inputs/results, isolated edits and current workspace unchanged, trusted provenance and audit',async t=>{
 const {call}=await fixture(t);const state=(await call('/state')).body,p=(await call('/calculate',{revision:0})).body;
 const original=(await call('/plans')).body.find(x=>x.id===p.id);
 const made=await call('/plans/'+p.id+'/copy',{actor:'forged',status:'confirmed',data:{},sourcePlanId:'forged'});assert.equal(made.status,201);const trial=made.body;
 assert.equal(trial.actor,'test#planner');assert.equal(trial.sourcePlanId,p.id);assert.equal(trial.sourceRunId,p.runId);assert.deepEqual(trial.data,state.data);
 const copied=(await call('/plans')).body.find(x=>x.id===trial.basePlanId);assert.notEqual(copied.id,p.id);assert.equal(copied.status,'draft');assert.deepEqual(copied.tasks,p.tasks);assert.deepEqual(copied.materialDemands,p.materialDemands);assert.deepEqual(copied.resultAssessment,p.resultAssessment);assert.deepEqual(copied.deliveryAssessment,p.deliveryAssessment);
 const rows=structuredClone(trial.data.orders);rows[0]['合格需求']='241';
 const edit=await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{orders:rows}});assert.equal(edit.status,200);assert.equal(edit.body.revision,1);
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{orders:rows}})).status,409);
 assert.deepEqual((await call('/state')).body,state);assert.deepEqual((await call('/plans')).body.find(x=>x.id===p.id),original);
 assert.deepEqual((await call('/plans/'+copied.id+'/inputs')).body.data,state.data);
 const exported=await call('/export',{planId:copied.id});assert.equal(exported.status,200);assert.ok(exported.body.includes(trial.id)&&exported.body.includes(p.id)&&exported.body.includes('尚未重算'));
 const calc=await call('/calculate',{revision:1,trialId:trial.id});assert.equal(calc.status,201);assert.equal(calc.body.trialId,trial.id);assert.notEqual(calc.body.runId,p.runId);assert.notEqual(calc.body.inputVersionId,p.inputVersionId);
 assert.equal((await call('/plans/'+calc.body.id+'/inputs')).body.data.orders[0]['合格需求'],'241');
 const logs=(await call('/operations')).body;assert.equal(logs.find(x=>x.action==='trial_created').sourcePlanId,p.id);assert.equal(logs.find(x=>x.trialId===trial.id).actor,'test#planner');
});

test('FR026 compare unchanged copies truthfully and edited runs expose input, task, allocation, due and unplanned differences',async t=>{
 const {call}=await fixture(t);const p=(await call('/calculate',{revision:0})).body,trial=(await call('/plans/'+p.id+'/copy',{})).body;
 let diff=(await call('/plans/'+p.id+'/compare/'+trial.basePlanId,undefined,'query')).body;
 assert.equal(diff.orderOutcome,'unchanged-no-delivery-improvement');assert.equal(diff.tasks.changes.length,0);assert.equal(diff.inputs.length,0);assert.equal(diff.materials.known,false);assert.equal(diff.materials.changes,null);
 const orders=structuredClone(trial.data.orders);orders[0]['要求可交付分钟']='10';orders[0]['合格需求']='241';
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{orders}})).status,200);
 const next=(await call('/calculate',{trialId:trial.id,revision:1,selection:{...trial.selection,startMinute:500,endMinute:510}})).body;
 diff=(await call('/plans/'+p.id+'/compare/'+next.id)).body;
 assert.equal(diff.conditions.changed,true);assert.ok(diff.tasks.changes.length);assert.ok(diff.resources.changes.length);assert.ok(diff.orders.changes.length);assert.ok(diff.unplanned.changes.length);assert.deepEqual(diff.inputs.map(x=>x.table),['orders']);assert.ok(diff.unplanned.after.every(x=>x.quantity!==null&&x.unit));
 assert.equal((await call('/plans/'+p.id+'/compare/missing')).status,404);
});

test('FR026 material shortage survives capacity-only trial, allocations retain exact quantities and never deduct current stock',async t=>{
 const {call}=await fixture(t);const s=(await call('/state')).body,d=materialFixture(s.data);Object.assign(d.inventory[0],{'账面数量':'400','已占用数量':'100'});
 assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);
 const p=(await call('/calculate',{revision:1})).body,trial=(await call('/plans/'+p.id+'/copy',{})).body;assert.equal(p.materialChecked,true);assert.equal(p.materialDemands[0].quantity,325);assert.equal(p.materialDemands[0].shortage,25);
 const groups=[{'人员组编号':'G-X','人员组名称':'增人试算','人员数量':'100','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'}];
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{personnelGroups:groups}})).status,200);
 const next=(await call('/calculate',{trialId:trial.id,revision:1})).body;
 const diff=(await call('/plans/'+p.id+'/compare/'+next.id)).body;assert.equal(diff.materials.known,true);assert.deepEqual(next.materialDemands,p.materialDemands);assert.equal(diff.orderOutcome,'unchanged-no-delivery-improvement');assert.deepEqual((await call('/state')).body.data.inventory,d.inventory);
 const changed=structuredClone(trial.data.inventory);changed[0]['账面数量']='425';assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:1,tables:{inventory:changed}})).status,200);
 const filled=(await call('/calculate',{trialId:trial.id,revision:2})).body,diff2=(await call('/plans/'+p.id+'/compare/'+filled.id)).body;assert.ok(diff2.materials.changes.length);assert.equal(filled.materialDemands[0].shortage,0);assert.deepEqual((await call('/state')).body.data.inventory,d.inventory);
});

test('FR026 restore current-state blockers preserve stock, completed quantities, facts, confirmed originals and all history byte-for-byte',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));
 s.plans[0].status='confirmed';s.data.inventory[0]['账面数量']='1';s.data.inventory[0]['已占用数量']='0';s.data.orders[0]['已完成合格数量']='10';s.executionFacts=[{id:'F1',taskId:p.tasks[0].id,startedAt:'2026-11-02T00:00:00Z',consumed:'5'}];s.revision++;
 fs.writeFileSync(file,JSON.stringify(s));const before=fs.readFileSync(file,'utf8');
 const r=await call('/plans/'+p.id+'/restore',{revision:1,currentProgressVersion:'invented',confirmed:true});assert.equal(r.status,409);assert.equal(r.body.error,'restore_blocked');assert.equal(r.body.currentRevision,1);assert.match(r.body.currentProgressVersion,/^[a-f0-9]{64}$/);assert.equal(r.body.sourceInputVersionId,p.inputVersionId);assert.equal(r.body.blockers.length,3);
 assert.equal((await call('/inputs',{revision:1,tables:(await call('/plans/'+p.id+'/inputs')).body.data,operation:'restore'})).status,409);
 assert.equal((await call('/tables/inventory',{revision:1,rows:s.data.inventory,operation:'restore'})).status,409);
 assert.equal((await call('/plans/'+p.id+'/restore',{revision:0})).body.error,'stale_input');assert.equal(fs.readFileSync(file,'utf8'),before);
 const trial=(await call('/plans/'+p.id+'/copy',{})).body;assert.equal((await call('/trials/'+trial.id+'/discard',{revision:0})).status,200);
 const after=JSON.parse(fs.readFileSync(file));assert.deepEqual(after.plans.find(x=>x.id===p.id),s.plans[0]);assert.deepEqual(after.data,s.data);assert.deepEqual(after.executionFacts,s.executionFacts);
});

test('FR026 discard cancels real worker and preserves immutable originals/results across late messages and restart',async t=>{
 const {call,dir}=await fixture(t,false,{workerFactory:()=>new Worker(`const {parentPort}=require('node:worker_threads');parentPort.postMessage({kind:'progress'});setInterval(()=>{},1000);`,{eval:true})});
 const p=(await call('/calculate',{revision:0})).body,trial=(await call('/plans/'+p.id+'/copy',{})).body;
 const original=(await call('/plans')).body.find(x=>x.id===p.id),state=(await call('/state')).body;
 const run=(await call('/runs',{trialId:trial.id,revision:0})).body;assert.ok(run.id);
 assert.equal((await call('/trials/'+trial.id+'/discard',{revision:0})).status,200);
 const terminal=(await call('/runs/'+run.id)).body;assert.equal(terminal.status,'cancelled');assert.equal(terminal.failure.code,'trial_discarded');assert.equal(terminal.planId,undefined);
 for(const [url,body] of [['/calculate',{trialId:trial.id,revision:1}],['/runs',{trialId:trial.id,revision:1}],['/trials/'+trial.id+'/inputs',{revision:1,tables:{orders:[]}}],['/plans/'+trial.basePlanId+'/copy',{}],['/plans/'+trial.basePlanId+'/verify',{}],['/plans',{id:trial.basePlanId}]])assert.equal((await call(url,body)).body.error,'trial_discarded');
 assert.equal((await call('/trials/'+trial.id+'/discard',{revision:1})).status,200);
 assert.deepEqual((await call('/state')).body,state);assert.deepEqual((await call('/plans')).body.find(x=>x.id===p.id),original);
 assert.equal((await call('/runs/'+run.id+'/inputs')).status,200);
 const stored=JSON.parse(fs.readFileSync(path.join(dir,'business.json')));assert.equal(stored.trials[0].status,'discarded');assert.equal(stored.plans.length,2);
 const bytes=fs.readFileSync(path.join(dir,'business.json'),'utf8');createBusinessRouter({dataDir:dir,actorMiddleware:(_q,_s,next)=>next(),requireMember:()=> (_q,_s,next)=>next()});assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),bytes);
});

test('FR026 all trial mutation routes require server write roles/reasons/CSRF and reject corrupt legacy copies',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 const trial=(await call('/plans/'+p.id+'/copy',{})).body;
 for(const [url,body] of [['/plans/'+p.id+'/copy',{}],['/plans/'+p.id+'/restore',{revision:0}],['/trials/'+trial.id+'/inputs',{revision:0,tables:{orders:trial.data.orders}}],['/trials/'+trial.id+'/discard',{revision:0}],['/runs',{revision:0,trialId:trial.id}]]){
  assert.equal((await call(url,{...body,role:'supervisor'},'query')).status,403);assert.equal((await call(url,{...body,reason:''})).status,400);assert.equal((await call(url,body,'planner',{'sec-fetch-site':'cross-site'})).status,403);
 }
 const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));delete s.runs[0].executionData;fs.writeFileSync(file,JSON.stringify(s));
 assert.equal((await call('/plans/'+p.id+'/copy',{})).status,409);assert.equal((await call('/plans/'+p.id+'/compare/'+trial.basePlanId)).status,409);
 assert.equal((await call('/calculate',{revision:0,trialId:'missing'})).status,404);
});

test('FR026 two real parallel trial Workers freeze distinct inputs while later trial and workspace edits remain isolated',async t=>{
 const {call}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 const one=(await call('/plans/'+p.id+'/copy',{})).body,two=(await call('/plans/'+p.id+'/copy',{})).body;
 for(const [trial,quantity] of [[one,'241'],[two,'242']]){const orders=structuredClone(trial.data.orders);orders[0]['合格需求']=quantity;assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{orders}})).status,200);}
 const started=await Promise.all([one,two].map(trial=>call('/runs',{trialId:trial.id,revision:1})));assert.ok(started.every(r=>r.status===202),JSON.stringify(started));
 const edited=structuredClone(one.data.orders);edited[0]['合格需求']='243';assert.equal((await call('/trials/'+one.id+'/inputs',{revision:1,tables:{orders:edited}})).status,200);
 const live=structuredClone(one.data.orders);live[0]['合格需求']='444';assert.equal((await call('/inputs',{revision:0,tables:{orders:live}})).status,200);
 const done=await Promise.all(started.map(r=>waitRun(call,r.body.id)));assert.ok(done.every(r=>['completed','partial'].includes(r.status)),JSON.stringify(done));
 for(let i=0;i<2;i++){const frozen=(await call('/runs/'+done[i].id+'/inputs')).body;assert.equal(frozen.originalInput.orders[0]['合格需求'],i===0?'241':'242');const plan=(await call('/plans')).body.find(p=>p.id===done[i].planId);assert.equal(plan.trialId,i===0?one.id:two.id);assert.equal(plan.revision,1);assert.equal(plan.runId,done[i].id);}
 assert.equal((await call('/trials')).body.find(t=>t.id===one.id).data.orders[0]['合格需求'],'243');assert.equal((await call('/state')).body.data.orders[0]['合格需求'],'444');assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.orders[0]['合格需求'],'240');
});

test('FR028 retain freezes exact comparison, does not adopt inputs, survives edits/discard and is audited',async t=>{
 const {call}=await fixture(t);const state=(await call('/state')).body,p=(await call('/calculate',{revision:0})).body,original=(await call('/plans')).body.find(x=>x.id===p.id),trial=(await call('/plans/'+p.id+'/copy',{})).body;
 assert.equal((await call('/trials/'+trial.id+'/retain',{revision:0,planId:trial.basePlanId})).body.error,'recalculated_current_trial_required');
 const orders=structuredClone(trial.data.orders);orders[0]['要求可交付分钟']='5';await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{orders}});
 const changes=(await call('/trials/'+trial.id+'/changes',undefined,'query')).body;assert.equal(changes.sourceSnapshotHash,p.snapshotHash);assert.equal(changes.revision,1);assert.ok(changes.changedConditions[0].fields.some(f=>f.field==='要求可交付分钟'&&f.after==='5'));
 const next=(await call('/calculate',{trialId:trial.id,revision:1})).body;
 const retained=await call('/trials/'+trial.id+'/retain',{revision:1,planId:next.id,actor:'fake',status:'confirmed'});assert.equal(retained.status,201);assert.equal(retained.body.actor,'test#planner');assert.equal(retained.body.snapshotHash,next.snapshotHash);assert.equal(retained.body.comparison.left.planId,p.id);assert.equal(retained.body.comparison.right.planId,next.id);
 orders[0]['要求可交付分钟']='6';await call('/trials/'+trial.id+'/inputs',{revision:1,tables:{orders}});
 assert.equal((await call('/trials/'+trial.id+'/retain',{revision:2,planId:next.id})).status,409);
 assert.equal((await call('/trials/'+trial.id+'/discard',{revision:2})).status,200);
 assert.deepEqual((await call('/trials')).body[0].retainedSnapshots,[retained.body]);assert.deepEqual((await call('/state')).body,state);assert.deepEqual((await call('/plans')).body.find(x=>x.id===p.id),original);
 assert.equal((await call('/trials/'+trial.id+'/retain',{revision:3,planId:next.id})).body.error,'trial_discarded');
 const audit=(await call('/operations')).body.find(x=>x.action==='trial_retained');assert.equal(audit.actor,'test#planner');assert.equal(audit.requestId,'trusted-request');assert.equal(audit.inputVersionId,next.inputVersionId);
});
test('FR028 retain requires server role, reason, CSRF, own current result and immutable source',async t=>{
 const {call,dir}=await fixture(t),p=(await call('/calculate',{revision:0})).body,a=(await call('/plans/'+p.id+'/copy',{})).body,b=(await call('/plans/'+p.id+'/copy',{})).body;
 const result=(await call('/calculate',{trialId:a.id,revision:0})).body,url='/trials/'+a.id+'/retain',body={revision:0,planId:result.id};
 assert.equal((await call(url,body,'query')).status,403);assert.equal((await call(url,{...body,reason:''})).status,400);assert.equal((await call(url,body,'planner',{'sec-fetch-site':'cross-site'})).status,403);assert.equal((await call(url,{...body,revision:1})).status,409);
 assert.equal((await call('/trials/'+b.id+'/retain',body)).status,409);assert.equal((await call('/trials/missing/changes')).status,404);assert.equal((await call('/trials/missing/retain',body)).status,404);
 const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));s.inputVersions[p.inputVersionId].data.orders[0]['合格需求']='forged';fs.writeFileSync(file,JSON.stringify(s));
 assert.equal((await call(url,body)).status,409);assert.equal((await call('/trials/'+a.id+'/changes')).status,409);
});


test('FR028 API actual improved calendar bottleneck stays comparable across separately timed runs and retained source',async t=>{
 const {deliveryFixture}=await import('../qa/delivery-fixture.mjs');const {call}=await fixture(t),state=(await call('/state')).body,d=deliveryFixture(state.data);
 d.downtime=[{'设备编号':d.machines[0]['设备编号'],'起始分钟':'0','结束分钟':'120','原因':'试算瓶颈'}];assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);
 const original=(await call('/calculate',{revision:1})).body,trial=(await call('/plans/'+original.id+'/copy',{})).body;
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{downtime:[]}})).status,200);
 const next=(await call('/calculate',{trialId:trial.id,revision:1})).body;assert.notEqual(original.conditions.ruleEvaluationAt,next.conditions.ruleEvaluationAt);
 const diff=(await call('/plans/'+original.id+'/compare/'+next.id)).body;assert.equal(diff.impact.orders[0].outcome,'earlier-conditional');assert.equal(diff.impact.orders[0].deliverableDeltaMinutes,-120);assert.ok(diff.impact.affectedTaskIds.length>0);
 const retained=await call('/trials/'+trial.id+'/retain',{revision:1,planId:next.id});assert.equal(retained.status,201);assert.deepEqual(retained.body.comparison,diff);
 assert.deepEqual((await call('/state')).body.data.downtime,d.downtime);assert.equal((await call('/plans/'+original.id+'/inputs')).body.data.downtime[0]['结束分钟'],'120');
});

import {executionFixture} from '../qa/execution-fixture.mjs';
async function putExecution(call,state='部分完成'){
 const s=(await call('/state')).body,d=executionFixture(s.data,state);
 const r=await call('/inputs',{tables:d,revision:s.revision,operation:'import'});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;
}
test('FR012 API atomic import, duplicate reimport idempotent, trusted audit and immutable original versions',async t=>{
 const {call,dir}=await fixture(t);let s=await putExecution(call);assert.equal(s.revision,1);
 const first=(await call('/execution')).body;assert.equal(first.simulation,true);assert.equal(first.remaining[0].remainingQuantity,60);assert.equal(first.history.length,2);assert.equal(first.inventory[0]['当前可用数量'],70);
 let r=await call('/inputs',{tables:{executionFacts:s.data.executionFacts,executionMaterials:s.data.executionMaterials},revision:1,operation:'import'});assert.equal(r.status,200);assert.equal(r.body.unchanged,true);assert.equal(r.body.revision,1);assert.equal((await call('/execution')).body.history.length,2);
 const original=JSON.parse(fs.readFileSync(path.join(dir,'business.json')));const oldVersion=Object.values(original.inputVersions).find(v=>v.data.executionFacts?.[0]);assert.ok(oldVersion);
 const rows=structuredClone(s.data.executionFacts);Object.assign(rows[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});
 r=await call('/tables/executionFacts',{rows,revision:1,operation:'edit',actor:'forged',at:'1900',role:'supervisor'});assert.equal(r.status,200);
 const history=(await call('/execution',undefined,'query')).body;assert.equal(history.history.length,3);const e=history.history.at(-1);assert.equal(e.before[0]['工序完成数量'],'40');assert.equal(e.after[0]['工序完成数量'],'50');assert.equal(e.actor,'test#planner');assert.equal(e.requestId,'trusted-request');assert.equal(e.reason,'test reason');assert.ok(e.fromVersion&&e.toVersion);
 const store=JSON.parse(fs.readFileSync(path.join(dir,'business.json')));assert.deepEqual(store.inputVersions[oldVersion.id],oldVersion);assert.equal(history.facts[0]['开始分钟'],'0');assert.notEqual(first.version,history.version);
});
test('FR012 API rollback, deletion, stale and invalid cumulative imports do not mutate facts, audit or version',async t=>{
 const {call,dir}=await fixture(t);const s=await putExecution(call),before=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 const rollback=structuredClone(s.data.executionFacts);rollback[0]['工序完成数量']='39';
 for(const body of [{rows:rollback,revision:1},{rows:[],revision:1},{rows:s.data.executionFacts,revision:0}])assert.equal((await call('/tables/executionFacts',body)).status,409);
 const bad=structuredClone(s.data.executionFacts);bad[0]['工序完成数量']='101';assert.equal((await call('/tables/executionFacts',{rows:bad,revision:1})).status,400);
 const consumption=structuredClone(s.data.executionMaterials);consumption[0]['单位']='g';assert.equal((await call('/tables/executionMaterials',{rows:consumption,revision:1})).status,409);
 assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),before);
});
test('FR012 API sync repeated runs keep facts and materials, snapshots and plan exports retain original execution',async t=>{
 const {call}=await fixture(t);const s=await putExecution(call);const facts=(await call('/execution')).body;
 const p=(await call('/calculate',{revision:s.revision})).body,q=(await call('/calculate',{revision:s.revision})).body;
 assert.deepEqual(p.materialDemands,q.materialDemands);assert.deepEqual(p.execution,q.execution);assert.equal(p.tasks[0].duration,20);assert.equal(p.status,'draft');
 const input=(await call('/plans/'+p.id+'/inputs')).body;assert.equal(input.data.executionMaterials[0]['累计已用数量'],'40');
 const csv=await call('/export',{planId:p.id});assert.equal(csv.status,200);assert.match(csv.body,/模拟执行事实版本/);assert.match(csv.body,/累计已用数量/);
 const now=(await call('/execution')).body;assert.equal(now.version,facts.version);assert.equal(now.history.length,2);assert.equal((await call('/state')).body.data.inventory[0]['账面数量'],'120');
});
test('FR012 API actual Worker freeze survives intervening forward correction and retains old/new execution snapshots',async t=>{
 const {call}=await fixture(t);await putExecution(call);
 const r=await call('/runs',{revision:1,selection:{orderIds:['A']}});assert.equal(r.status,202,JSON.stringify(r.body));
 const rows=(await call('/state')).body.data.executionFacts;Object.assign(rows[0],{'工序完成数量':'50','剩余工时分钟':'15','观测分钟':'35'});assert.equal((await call('/tables/executionFacts',{rows,revision:1})).status,200);
 let run;for(let n=0;n<100;n++){run=(await call('/runs/'+r.body.id)).body;if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(run.status,'completed',JSON.stringify(run));const plans=(await call('/plans')).body,p=plans.find(p=>p.id===run.planId);assert.equal(p.tasks[0].duration,20);assert.equal(p.execution.facts[0]['工序完成数量'],'40');
 assert.equal((await call('/state')).body.data.executionFacts[0]['工序完成数量'],'50');const newer=await call('/calculate',{revision:2});assert.equal(newer.status,201);assert.equal(newer.body.tasks[0].duration,15);
 const snapshot=(await call('/runs/'+run.id+'/inputs')).body;assert.equal(snapshot.originalInput.executionFacts[0]['工序完成数量'],'40');assert.notEqual(snapshot.conditions.executionFactsVersion,newer.body.conditions.executionFactsVersion);
});
test('FR012 API trial copy/edit/retain/discard never rewrites current facts; stale facts block recalculation and retention',async t=>{
 const {call}=await fixture(t);await putExecution(call);const p=(await call('/calculate',{revision:1})).body;
 const trial=(await call('/plans/'+p.id+'/copy',{revision:1})).body;assert.ok(trial.id);
 assert.equal((await call('/trials/'+trial.id+'/inputs',{tables:{executionFacts:trial.data.executionFacts},revision:0})).status,409);
 const q=await call('/calculate',{trialId:trial.id,revision:0});assert.equal(q.status,201,JSON.stringify(q.body));assert.equal((await call('/trials/'+trial.id+'/retain',{revision:0,planId:q.body.id})).status,201);
 const rows=structuredClone(trial.data.executionFacts);rows[0]['剩余工时分钟']='15';assert.equal((await call('/tables/executionFacts',{rows,revision:1})).status,200);
 assert.equal((await call('/calculate',{trialId:trial.id,revision:0})).body.error,'current_execution_changed');assert.equal((await call('/trials/'+trial.id+'/retain',{revision:0,planId:q.body.id})).body.error,'current_execution_changed');
 const before=(await call('/state')).body;const restore=await call('/plans/'+p.id+'/restore',{revision:2});assert.equal(restore.status,409);assert.ok(restore.body.executionFactsVersion);assert.ok(restore.body.blockers.some(b=>b.code==='EXECUTION_RECONCILIATION_REQUIRED'));
 assert.equal((await call('/trials/'+trial.id+'/discard',{revision:0})).status,200);assert.deepEqual((await call('/state')).body,before);assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.executionFacts[0]['剩余工时分钟'],'20');
});
test('FR012 API old plan trial cannot reintroduce missing execution facts; restore/import/history retain current originals',async t=>{
 const {call}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;await putExecution(call);
 const trial=(await call('/plans/'+p.id+'/copy',{revision:1})).body;assert.ok(trial.id);assert.equal((await call('/runs',{trialId:trial.id,revision:0})).body.error,'current_execution_changed');
 const before=(await call('/state')).body;assert.equal((await call('/inputs',{tables:{executionFacts:[]},revision:1,operation:'restore'})).status,409);assert.deepEqual((await call('/state')).body,before);assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.executionFacts.length,0);
});
test('FR012 API role, removal, CSRF and reason protections cover facts, history and query/export',async t=>{
 const {call,store}=await fixture(t);const s=await putExecution(call);
 assert.equal((await call('/execution',undefined,'query')).status,200);assert.equal((await call('/tables/executionFacts',{rows:s.data.executionFacts,revision:1},'query')).status,403);
 assert.equal((await call('/tables/executionFacts',{rows:s.data.executionFacts,revision:1},'planner',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await call('/tables/executionFacts',{rows:s.data.executionFacts,revision:1,reason:''})).status,400);
 assert.equal((await call('/export',{query:{table:'executionFacts',revision:1,filters:{order:'A'}}},'query')).status,403);
 assert.equal((await call('/auth/members/export',{key:'test#query',canExport:true},'admin')).status,200);
 const csv=await call('/export',{query:{table:'executionFacts',revision:1,filters:{order:'A'}}},'query');assert.equal(csv.status,200);assert.match(csv.body,/F-A-MIX/);
 store.remove('test#query');assert.equal((await call('/execution',undefined,'query')).status,403);
});
test('FR012 API pause and completed fact have truthful remaining-work outcomes and immutable completion',async t=>{
 for(const state of ['暂停','已完成']){const {call}=await fixture(t);const s=await putExecution(call,state);const p=await call('/calculate',{revision:1});assert.equal(p.status,201,JSON.stringify(p.body));
  if(state==='暂停'){assert.equal(p.body.tasks.length,0);assert.equal(p.body.findings.some(f=>f.code.includes('EXECUTION_PAUSED')),true);}else{assert.equal(p.body.tasks[0].start,0);assert.equal(p.body.tasks[0].end,30);const rows=structuredClone(s.data.executionFacts);rows[0]['完成分钟']='31';assert.equal((await call('/tables/executionFacts',{rows,revision:1})).status,409);}
 }
});
test('FR012 raw original UAT15 aggregate CSV fields fail closed without task/material/lot reconciliation',async t=>{
 const {call,dir}=await fixture(t);const before=(await call('/state')).body;
 const r=await call('/tables/executionFacts',{revision:0,operation:'import',rows:[{'任务编号':'A-MIX','状态':'已完成','实际开始分钟':'0','实际结束分钟':'30','已用投入kg':'250','说明':'不可改写的模拟事实'}]});assert.equal(r.status,400);assert.equal(r.body.error,'unknown_fields');assert.deepEqual((await call('/state')).body,before);assert.equal((await call('/operations')).body.length,0);assert.equal(fs.existsSync(path.join(dir,'business.json')),false);
});
test('FR012 consumed-lot quality update flags execution while old trial cannot restore usable stock or clear current risk',async t=>{
 const {call}=await fixture(t);const s=await putExecution(call);const p=(await call('/calculate',{revision:1})).body,trial=(await call('/plans/'+p.id+'/copy',{revision:1})).body;const q=await call('/calculate',{trialId:trial.id,revision:0});assert.equal(q.status,201);
 const rows=structuredClone(s.data.inventory);rows[0]['质量状态']='冻结';assert.equal((await call('/tables/inventory',{rows,revision:1})).status,200);
 const before=(await call('/state')).body;const blocked=await call('/calculate',{trialId:trial.id,revision:0});assert.equal(blocked.status,409);assert.equal(blocked.body.issues[0].code,'TRIAL_CONSUMED_STOCK_PROTECTED');assert.equal((await call('/trials/'+trial.id+'/retain',{revision:0,planId:q.body.id})).status,409);
 const next=await call('/calculate',{revision:2});assert.equal(next.status,201);assert.equal(next.body.tasks.length,0);assert.ok(next.body.execution.risks.length);assert.deepEqual((await call('/state')).body,before);assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.inventory[0]['质量状态'],'合格');
});

async function putProgress(call,{mapped=false,pending=false}={}){
 const s=(await call('/state')).body,d=executionFixture(s.data);Object.assign(d.executionFacts[0],{'累计报废数量':'10','报废补做口径':pending?'待核对':'按本工序BOM补做'});d.executionMaterials[0]['累计已用数量']='50';d.inventory[0]['账面数量']='140';
 if(mapped)d.executionSources=[{'来源编号':'UAT15-1','原始任务编号':'original-A-MIX','事实编号':'F-A-MIX','原始汇总耗料':'50','耗料单位':'kg','来源说明':'手动核对原始累计来源，仅模拟','原始分配JSON':JSON.stringify([{'记录编号':'C1','批次编号':'EX-LOT','物料编号':'LEAN','数量':'50','单位':'kg'}])}];
 const r=await call('/inputs',{tables:d,revision:s.revision,operation:'import'});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;
}
test('FR031 API mapped source/scrap reimport is idempotent; exports and history preserve source originals',async t=>{
 const {call,dir}=await fixture(t);const s=await putProgress(call,{mapped:true}),first=(await call('/execution')).body;assert.equal(first.sources[0]['原始汇总耗料'],'50');assert.equal(first.history.length,3);const disk=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 const repeated=await call('/inputs',{revision:1,operation:'import',tables:{executionFacts:s.data.executionFacts,executionMaterials:s.data.executionMaterials,executionSources:s.data.executionSources}});assert.equal(repeated.status,200);assert.equal(repeated.body.unchanged,true);assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),disk);
 const p=await call('/calculate',{revision:1});assert.equal(p.status,201);assert.equal(p.body.materialDemands[0].quantity,60);assert.equal(p.body.execution.orderImpact[0].remainingQualifiedOrder,100);assert.ok(p.body.execution.projectedTasks.some(x=>x.taskId==='A-FILL'&&x.start===50));
 for(const table of ['executionFacts','executionSources']){const csv=await call('/export',{query:{table,revision:1,filters:{}}});assert.equal(csv.status,200);assert.match(csv.body,table==='executionFacts'?/累计报废数量/:/原始分配JSON/);}
 const ex=await call('/export',{planId:p.body.id});assert.equal(ex.status,200);assert.match(ex.body,/scrapQuantity/);assert.match(ex.body,/UAT15-1/);
});
test('FR031 API source intake lacking explicit lot mapping blocks atomically with file/row/field details',async t=>{
 const {call,dir}=await fixture(t);const s=await putProgress(call,{mapped:true}),before=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 const raw=[{...s.data.executionSources[0],'来源编号':'another','事实编号':'missing','原始分配JSON':''}];
 const r=await call('/tables/executionSources',{revision:1,rows:[...s.data.executionSources,...raw]});assert.equal(r.status,400);assert.ok(r.body.issues.some(i=>i.code==='EXECUTION_SOURCE_MAPPING_REQUIRED'&&i.row===3&&i.file==='27_模拟进度来源对账.csv'));assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),before);
});
test('FR031 API correction history retains original mapping while current consumed/scrap/remainder advance',async t=>{
 const {call}=await fixture(t);const s=await putProgress(call,{mapped:true}),first=(await call('/execution')).body;const f=structuredClone(s.data.executionFacts),c=structuredClone(s.data.executionMaterials);Object.assign(f[0],{'累计报废数量':'20','工序完成数量':'50','观测分钟':'35','剩余工时分钟':'25'});c[0]['累计已用数量']='70';
 const r=await call('/inputs',{revision:1,operation:'edit',tables:{executionFacts:f,executionMaterials:c},reason:'核对后累计补做修订'});assert.equal(r.status,200,JSON.stringify(r.body));const current=(await call('/execution')).body;assert.notEqual(current.version,first.version);assert.equal(current.revision,2);assert.deepEqual(current.sources,first.sources);assert.equal(current.history.length,5);assert.equal(current.history.at(-2).before[0]['累计报废数量'],'10');assert.equal(current.history.at(-2).after[0]['累计报废数量'],'20');assert.equal(current.history.at(-1).actor,'test#planner');
 const p=await call('/calculate',{revision:2});assert.equal(p.status,201);assert.equal(p.body.tasks[1].start,60);assert.equal(p.body.materialDemands[0].quantity,50);
});
test('FR031 API negative scrap, regression and overorder output never mutate accepted facts',async t=>{
 const {call,dir}=await fixture(t);const s=await putProgress(call),disk=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 for(const [patch,status] of [[{'累计报废数量':'9'},409],[{'工序完成数量':'101'},400],[{'状态':'已开始'},409],[{'累计报废数量':'-1'},400]]){const rows=structuredClone(s.data.executionFacts);Object.assign(rows[0],patch);const r=await call('/tables/executionFacts',{revision:1,rows});assert.equal(r.status,status,JSON.stringify(r));assert.ok(r.body.issues.length);assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),disk);}
});
test('FR031 API pending scrap keeps source facts but prevents both synchronous and asynchronous scheduling',async t=>{
 const {call}=await fixture(t);await putProgress(call,{pending:true});const ex=(await call('/execution')).body;assert.equal(ex.orderImpact[0].reconciliationRequired,true);for(const url of ['/calculate','/runs']){const r=await call(url,{revision:1});assert.equal(r.status,422,JSON.stringify(r.body));assert.match(JSON.stringify(r.body),/报废/);}assert.equal((await call('/plans')).body.length,0);assert.equal((await call('/execution')).body.version,ex.version);
});
test('FR031 API facts/source protections enforce membership, CSRF, reason, stale writes and immutable originals',async t=>{
 const {call,store}=await fixture(t);const s=await putProgress(call,{mapped:true});const body={revision:1,rows:s.data.executionSources};assert.equal((await call('/tables/executionSources',body,'query')).status,403);assert.equal((await call('/tables/executionSources',body,'planner',{'sec-fetch-site':'cross-site'})).status,403);assert.equal((await call('/tables/executionSources',{...body,reason:''})).status,400);assert.equal((await call('/tables/executionSources',{...body,revision:0})).status,409);
 const original=(await call('/execution')).body;for(const rows of [[],[{...body.rows[0],'原始汇总耗料':'40'}]])assert.equal((await call('/tables/executionSources',{revision:1,rows})).status,409);assert.equal((await call('/execution')).body.version,original.version);
 assert.equal((await call('/export',{query:{table:'executionSources',revision:1,filters:{}}},'query')).status,403);assert.equal((await call('/auth/members/export',{key:'test#query',canExport:true},'admin')).status,200);assert.equal((await call('/export',{query:{table:'executionSources',revision:1,filters:{}}},'query')).status,200);store.remove('test#query');assert.equal((await call('/execution',undefined,'query')).status,403);
});
test('FR031 API changed scrap stales trial retain/recalculate; discard and restore cannot erase current simulated facts',async t=>{
 const {call}=await fixture(t);const s=await putProgress(call,{mapped:true});const p=(await call('/calculate',{revision:1})).body,trial=(await call('/plans/'+p.id+'/copy',{revision:1})).body,q=(await call('/calculate',{trialId:trial.id,revision:0})).body;
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{executionSources:trial.data.executionSources}})).status,409);
 const rows=structuredClone(s.data.executionFacts);rows[0]['累计报废数量']='20';rows[0]['剩余工时分钟']='25';assert.equal((await call('/tables/executionFacts',{revision:1,rows})).status,200);const current=(await call('/execution')).body;
 assert.equal((await call('/runs',{trialId:trial.id,revision:0})).body.error,'current_execution_changed');assert.equal((await call('/trials/'+trial.id+'/retain',{revision:0,planId:q.id})).body.error,'current_execution_changed');assert.equal((await call('/plans/'+p.id+'/restore',{revision:2})).status,409);assert.equal((await call('/trials/'+trial.id+'/discard',{revision:0})).status,200);assert.equal((await call('/execution')).body.version,current.version);assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.executionFacts[0]['累计报废数量'],'10');
});
test('FR031 API actual Worker freezes scrap and aggregate source across intervening correction',async t=>{
 const {call}=await fixture(t);const s=await putProgress(call,{mapped:true});const r=await call('/runs',{revision:1});assert.equal(r.status,202,JSON.stringify(r.body));const rows=structuredClone(s.data.executionFacts);rows[0]['累计报废数量']='20';rows[0]['剩余工时分钟']='25';assert.equal((await call('/tables/executionFacts',{rows,revision:1})).status,200);
 let run;for(let n=0;n<100;n++){run=(await call('/runs/'+r.body.id)).body;if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,10));}assert.equal(run.status,'completed',JSON.stringify(run));const p=(await call('/plans')).body.find(p=>p.id===run.planId);assert.equal(p.execution.remaining[0].scrapQuantity,10);assert.equal(p.execution.sources[0]['原始汇总耗料'],'50');assert.equal(p.materialDemands[0].quantity,60);const next=(await call('/calculate',{revision:2})).body;assert.equal(next.materialDemands[0].quantity,70);assert.equal(next.tasks[0].duration,25);assert.notEqual(p.conditions.executionFactsVersion,next.conditions.executionFactsVersion);
});

import {event} from '../qa/event-fixture.mjs';
const eventTables=(s,e=event())=>({executionFacts:s.data.executionFacts,simulationEvents:[...(s.data.simulationEvents||[]),e]});
test('FR029 API event/progress/effects atomically versioned, reimport unchanged, trusted history and query export',async t=>{
 const {call,dir}=await fixture(t);let s=await putExecution(call);const original=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 let r=await call('/inputs',{revision:1,tables:eventTables(s),operation:'import',actor:'forged'});assert.equal(r.status,200,JSON.stringify(r.body));s=r.body;assert.equal(s.revision,2);assert.equal(s.data.downtime.at(-1)['起始分钟'],'30');assert.equal(s.data.simulationEvents[0]['需处理事实JSON'],'["F-A-MIX"]');
 const bytes=fs.readFileSync(path.join(dir,'business.json'),'utf8');r=await call('/inputs',{revision:2,tables:{simulationEvents:s.data.simulationEvents,executionFacts:s.data.executionFacts},operation:'import'});assert.equal(r.status,200);assert.equal(r.body.unchanged,true);assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),bytes);
 const report=(await call('/execution',undefined,'query')).body;assert.equal(report.events.rows.length,1);assert.ok(report.risks.some(r=>r.eventId==='E1'));assert.equal(report.facts[0]['工序完成数量'],'40');assert.equal(report.inventory[0]['扣耗后余额'],80);assert.equal(report.orderImpact[0].qualifiedCompleted,0);
 const hist=report.history.find(r=>r.target==='simulationEvents');assert.equal(hist.actor,'test#planner');assert.equal(hist.requestId,'trusted-request');assert.equal(hist.reason,'test reason');assert.deepEqual(hist.before,[]);assert.ok(hist.fromVersion&&hist.toVersion);
 const p=(await call('/calculate',{revision:2})).body;assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('E1')));assert.equal((await call('/export',{table:'simulationEvents'},'planner')).status,200);assert.notEqual(original,bytes);
});
test('FR029 API invalid mixed events, stale facts, forged impacts, missing snapshot and unknown rush fields reject byte-atomically',async t=>{
 const {call,dir}=await fixture(t);const s=await putExecution(call),before=fs.readFileSync(path.join(dir,'business.json'),'utf8');
 const variants=[{simulationEvents:[event()]},eventTables(s,event('设备故障',{machineId:'unknown',endMinute:60})),eventTables(s,event('设备故障',{machineId:'MIX01',endMinute:60},{'需处理事实JSON':'["fake"]'})),eventTables(s,event('插单',{order:{...s.data.orders[0],'订单编号':'R','unknown':'bad'},dependencies:s.data.dependencies.map(d=>({...d,'订单编号':'R'}))})),{...eventTables(s),executionFacts:s.data.executionFacts.map(f=>({...f,'观测分钟':'29'}))}];
 for(const tables of variants){const r=await call('/inputs',{revision:1,tables});assert.ok([400,409].includes(r.status),JSON.stringify(r));assert.equal(fs.readFileSync(path.join(dir,'business.json'),'utf8'),before);}
});
test('FR029 API existing roles, CSRF, reason and stale revision protect event writes; body role cannot grant access',async t=>{
 const {call}=await fixture(t),s=await putExecution(call),body={revision:1,tables:eventTables(s),role:'supervisor'};
 assert.equal((await call('/inputs',body,'query')).status,403);assert.equal((await call('/inputs',{...body,reason:''})).status,400);assert.equal((await call('/inputs',body,'planner',{'sec-fetch-site':'cross-site'})).status,403);assert.equal((await call('/inputs',{...body,revision:0})).status,409);assert.equal((await call('/inputs',body,'supervisor')).status,200);
});
test('FR029 API accepted events stale trials, prohibit trial edits/retain/restore, preserve pre-event plan inputs',async t=>{
 const {call}=await fixture(t),s=await putExecution(call),p=(await call('/calculate',{revision:1})).body,trial=(await call('/plans/'+p.id+'/copy',{revision:1})).body,q=(await call('/calculate',{trialId:trial.id,revision:0})).body;
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{simulationEvents:[event()]}})).status,409);assert.equal((await call('/inputs',{revision:1,tables:eventTables(s)})).status,200);
 assert.equal((await call('/runs',{trialId:trial.id,revision:0})).body.error,'current_execution_changed');assert.equal((await call('/trials/'+trial.id+'/retain',{revision:0,planId:q.id})).body.error,'current_execution_changed');assert.equal((await call('/plans/'+p.id+'/restore',{revision:2})).status,409);assert.equal((await call('/trials/'+trial.id+'/discard',{revision:0})).status,200);assert.equal((await call('/execution')).body.events.rows.length,1);assert.deepEqual((await call('/plans/'+p.id+'/inputs')).body.data.simulationEvents,[]);
});
test('FR029 API actual asynchronous Worker freezes pre-event facts while new run reports affected task',async t=>{
 const {call}=await fixture(t),s=await putExecution(call);const r=await call('/runs',{revision:1});assert.equal(r.status,202);assert.equal((await call('/inputs',{revision:1,tables:eventTables(s)})).status,200);
 let run;for(let n=0;n<100;n++){run=(await call('/runs/'+r.body.id)).body;if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,10));}assert.equal(run.status,'completed',JSON.stringify(run));const p=(await call('/plans')).body.find(p=>p.id===run.planId);assert.equal(p.execution.events.rows.length,0);assert.equal(p.tasks[0].start,30);const fresh=(await call('/calculate',{revision:2})).body;assert.equal(fresh.execution.events.rows.length,1);assert.equal(fresh.tasks.length,0);assert.notEqual(p.conditions.executionFactsVersion,fresh.conditions.executionFactsVersion);
});

test('FR032 load export uses saved snapshot/window/category, preserves history and enforces permission/reason/audit',async t=>{
 const {call,store}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;assert.equal((await call('/plans',{id:p.id})).status,201);
 const prior=(await call('/plans')).body;const target={planId:p.id,resourceLoad:{start:0,end:100,kind:'machines'}};
 assert.equal((await call('/export',target,'query')).status,403);
 assert.equal((await call('/export',{...target,reason:''})).status,400);
 assert.equal((await call('/export',target,'planner',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await call('/export',{...target,resourceLoad:{start:null,end:100,kind:'all'}})).status,400);
 assert.equal((await call('/export',{...target,resourceLoad:{start:0,end:100,kind:'bad'}})).status,400);
 assert.equal((await call('/export',{...target,planId:'absent'})).status,404);
 const s=(await call('/state')).body;const rows=structuredClone(s.data.machines);rows[0]['设备名称']='CURRENT ONLY';assert.equal((await call('/tables/machines',{rows,revision:0})).status,200);
 store.setExport('test#query',true);
 const ex=await call('/export',target,'query');assert.equal(ex.status,200);assert.match(ex.body,/FR032/);assert.match(ex.body,/L01/);assert.match(ex.body,/100/);assert.ok(!ex.body.includes('CURRENT ONLY'));assert.ok(!ex.body.includes('"materials"'));
 assert.deepEqual((await call('/plans')).body,prior);
 const audit=(await call('/operations')).body.at(-1);assert.equal(audit.action,'export');assert.deepEqual(audit.resourceLoad,target.resourceLoad);
});
