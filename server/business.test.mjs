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
 const tables=structuredClone(start.data);tables.orders[0]['合格需求']='481';tables.rules[0]['是否启用']='否';tables.inventory=[];
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
