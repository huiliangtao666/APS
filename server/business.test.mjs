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
  const rows=structuredClone(current[key]);rows.at(-1)[field]=['预计数量','使用数量','合格需求','固定分钟','需求数量'].includes(field)?'2':'模拟修改';
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

test('FR015 snapshots preserve original full inputs across edit/delete/recompute/restore and restart',async t=>{
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
 r=await call('/inputs',{tables:old.data,revision:rev,operation:'restore'});assert.equal(r.status,200);assert.equal(r.body.data.orders[0]['合格需求'],'240');assert.equal(r.body.data.inventory.length,2);
 assert.equal((await call('/plans')).body.find(x=>x.id===p.id).inputSnapshot.orders[0]['合格需求'],'240');
});
test('FR015 simulated confirmed storage fixture protects original inputs; missing or corrupt historical inputs fail closed',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;
 const file=path.join(dir,'business.json');let s=JSON.parse(fs.readFileSync(file));
 // Test-only persistence fixture: no product route creates a confirmed plan.
 s.plans[0].status='confirmed';fs.writeFileSync(file,JSON.stringify(s));
 const tables=structuredClone(s.data);tables.inventory=[];
 assert.equal((await call('/inputs',{tables,revision:0})).status,200);
 assert.equal((await call('/plans/'+p.id+'/inputs')).body.data.inventory.length,2);
 for(const route of ['/plans','/plans/'+p.id+'/verify'])assert.equal((await call(route,{id:p.id,status:'draft',tasks:[]})).status,409);
 s=JSON.parse(fs.readFileSync(file));s.inputVersions[p.inputVersionId].data.inventory=[];fs.writeFileSync(file,JSON.stringify(s));
 assert.equal((await call('/plans/'+p.id+'/inputs')).status,409);
 const before=fs.readFileSync(file,'utf8');assert.equal((await call('/inputs',{tables,revision:1})).status,409);assert.equal(fs.readFileSync(file,'utf8'),before);
 assert.equal((await call('/plans/x/confirm',{},'supervisor')).status,501);
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
 for(let i=0;i<250;i++){const r=await call('/runs/'+id);if(!['queued','running'].includes(r.body.status))return r.body;await new Promise(resolve=>setTimeout(resolve,20));}
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
