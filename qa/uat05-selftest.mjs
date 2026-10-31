import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {b2Host} from './b2-host.mjs';import {b2Worker} from './b2-fixture.mjs';import {uat05,select} from './uat05-fixture.mjs';
import {calculateMaterialDemand,createMaterialAllocator,materialPolicy} from '../src/lib/material-allocation.mjs';import {verifyJointConditions} from '../src/lib/verify-joint-conditions.mjs';
const out=process.env.UAT05_OUT;fs.mkdirSync(out,{recursive:true});const dump=(n,x)=>fs.writeFileSync(out+'/'+n+'.json',JSON.stringify(x,null,2)),hash=x=>createHash('sha256').update(x).digest('hex');const report={scope:'UAT05 task selftest; explicit replaceable simulation; no QA UAT',checks:process.env.UAT05_CASES!==undefined&&fs.existsSync(out+'/api-results.json')?JSON.parse(fs.readFileSync(out+'/api-results.json')).checks:[]};
for(const name of (process.env.UAT05_CASES!==undefined?process.env.UAT05_CASES.split(',').filter(Boolean):['core','insufficient','gap01','supply-denied','delayed240','pending-stock','labor-start200','tool-start200','calendar-start200'])){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat05-'+name+'-')),f=await b2Host({dir});
 try{
  const fixture=uat05(),d=fixture.data;dump('choices',fixture.choices);
  if(name==='insufficient'){d.supplies=[];d.supplyUses=[];}
  if(name==='gap01'){d.supplies[0]['预计数量']='162.4';d.supplyUses[0]['使用数量']='162.4';}
  if(name==='supply-denied')d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify({...JSON.parse(d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']),'允许预计供给':false});
  if(name==='delayed240')d.supplies[0]['预计可用时间']='2026-11-02T12:00:00+08:00';
  if(name==='pending-stock')d.inventory.find(r=>r['物料编号']==='LEAN')['质量状态']='待检';
  if(name==='labor-start200')d.personnelGroups.forEach(r=>r['可用起始分钟']='200');
  if(name==='tool-start200')d.tools.find(r=>r['工装编码']==='T01')['可用起始分钟']='200';
  if(name==='calendar-start200')d.calendars.forEach(r=>r['起始分钟']='200');
  await f.ok('/state');await f.ok('/inputs',{revision:0,tables:d});const before=JSON.parse(f.bytes()).data;
  const result=await b2Worker(f,select(d));const planned=result.plan.tasks;
  const partial=['insufficient','gap01','supply-denied','pending-stock'].includes(name);assert.equal(planned.length,partial?2:4,JSON.stringify(result.plan));
  if(name==='core'){
   assert.deepEqual(result.input.conditions.enabledRuleIds,['MACHINE','PRECEDENCE','CALENDAR','MOLD','LABOR','MATERIAL']);
   assert.equal(result.plan.materialDemands.find(r=>r.orderId==='A'&&r.materialId==='LEAN').quantity,162.5);assert.equal(planned.find(t=>t.id==='B-MIX').start,180);
   const a=createMaterialAllocator(d,materialPolicy(d,result.plan.createdAt));a.preview(calculateMaterialDemand(d,d.orders[0],'MIX',0),0).commit();const p179=a.preview(calculateMaterialDemand(d,d.orders[1],'MIX',179),179),p180=a.preview(calculateMaterialDemand(d,d.orders[1],'MIX',180),180);assert.equal(p179.ok,false);assert.equal(p180.ok,true);dump('boundary',{at179:p179.rows,at180:p180.rows});
   const forged=structuredClone(result.plan),b=forged.tasks.find(t=>t.id==='B-MIX');b.start=179;b.end=209;const findings=verifyJointConditions(forged,result.input.executionData,result.input.conditions);assert.ok(findings.length);dump('forged179',{classification:'deliberately illegal diagnostic copy, not Worker result',plan:forged,findings});
  }
  if(name==='gap01'){const b=result.plan.materialDemands.find(r=>r.orderId==='B'&&r.materialId==='LEAN');assert.equal(b.shortage,0.1);assert.deepEqual(b.exactShortage,{numerator:'1',denominator:'10'});assert.equal(b.committed,false);}
  if(name==='delayed240')assert.equal(planned.find(t=>t.id==='B-MIX').start,240);
  if(name.endsWith('start200'))assert.ok(planned.every(t=>t.start>=200));
  assert.deepEqual(JSON.parse(f.bytes()).data,before,'calculation must not physically deduct input stock');
  const verified=await f.ok('/plans/'+result.plan.id+'/verify',{});dump(name,{...result,fixture:fixture.choices,data:d,frozen:await f.ok('/plans/'+result.plan.id+'/inputs'),verify:verified,stockBefore:before.inventory,stockAfter:(await f.ok('/state')).data.inventory});
  report.checks.push({id:name,status:'PASS',planned:planned.length,runId:result.run.id});
 }catch(e){report.failure={name,stack:e.stack};throw e;}finally{dump('api-results',report);await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}
// Source-only raw19 ingestion is real; active material source requires explicit replacement.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat05-import-')),f=await b2Host({dir});try{
 const x=uat05(),s=await f.ok('/state'),before=fs.existsSync(dir+'/business.json')?f.bytes():null;const blocked=await f.call('/imports/preview',{revision:s.revision,files:x.sourceBatch.files,repairs:x.sourceBatch.repairs,resourceRuleBinding:x.sourceBatch.resourceRuleBinding,inputStage:'supported'});assert.equal(blocked.status,400);assert.ok(blocked.body.issues.some(i=>i.code==='NOT_READY_ORIGINAL12'));assert.equal(fs.existsSync(dir+'/business.json')?f.bytes():null,before);dump('source-only-guard',{blocked,beforeSha256:hash(before||''),afterSha256:hash(fs.existsSync(dir+'/business.json')?f.bytes():'')});
 await f.ok('/inputs',{revision:0,tables:x.data});const imported=await f.ok('/state');
 const rejects=[];for(const [id,body,role,status]of [['query-write',{revision:imported.revision,tables:{inventory:x.data.inventory}},'query',403],['stale',{revision:0,tables:{inventory:x.data.inventory}},'planner',409],['negative',{revision:imported.revision,tables:{inventory:x.data.inventory.map((r,i)=>i? r:{...r,'账面数量':'-1'})}},'planner',400]]){const b=f.bytes(),response=await f.call('/inputs',body,role);assert.equal(response.status,status);assert.equal(f.bytes(),b);rejects.push({id,body,role,response,beforeSha256:hash(b),afterSha256:hash(f.bytes())});}dump('zero-write',rejects);report.checks.push({id:'raw19-source-guard-and-rejections',status:'PASS'});
}finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});dump('api-results',report);}
report.complete=true;dump('api-results',report);
