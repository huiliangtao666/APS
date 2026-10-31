import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {b2Host} from './b2-host.mjs';import {b2Worker} from './b2-fixture.mjs';import {uat06,select} from './uat06-fixture.mjs';
const out=process.env.UAT06_OUT;fs.mkdirSync(out,{recursive:true});const dump=(n,x)=>fs.writeFileSync(out+'/'+n+'.json',JSON.stringify(x,null,2)),hash=x=>createHash('sha256').update(x).digest('hex');const report={scope:'UAT06 independent task selftest; no QA UAT',checks:process.env.UAT06_CASES&&fs.existsSync(out+'/api-results.json')?JSON.parse(fs.readFileSync(out+'/api-results.json')).checks:[]};
for(const name of (process.env.UAT06_CASES?process.env.UAT06_CASES.split(','):['core','mix-cap2','single-set','late-return10','calendar-start100','machine-stop','tool-window100','demand3-cap2','rule-disabled'])){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat06-'+name+'-')),f=await b2Host({dir});
 try{
  const x=uat06(),d=x.data;dump('choices',x.choices);
  if(name==='mix-cap2')d.tools.find(t=>t['工装编码']==='T01')['可用数量']='2';
  if(name==='single-set')d.tools.find(t=>t['工装编码']==='G01')['可用数量']='1';
  if(name==='late-return10')d.resourceClaims.filter(c=>c['资源编号']==='G01').forEach(c=>c['后延占用分钟']='10');
  if(name==='calendar-start100')d.calendars.forEach(c=>c['起始分钟']='100');
  if(name==='machine-stop')d.downtime.push({'设备编号':'MIX01','起始分钟':'0','结束分钟':'100','原因':'explicit UAT06 negative calendar simulation'});
  if(name==='tool-window100')d.tools.find(t=>t['工装编码']==='G01')['可用起始分钟']='100';
  if(name==='demand3-cap2')d.resourceClaims.find(c=>c['订单编号']==='A'&&c['资源编号']==='G01')['需求数量']='3';
  if(name==='rule-disabled')d.rules.find(r=>r['规则编号']==='MOLD')['是否启用']='否';
  await f.ok('/state');await f.ok('/inputs',{revision:0,tables:d});const r=await b2Worker(f,select(d));
  assert.equal(r.plan.tasks.length,name==='demand3-cap2'?5:6,JSON.stringify(r));
  if(name==='core')assert.deepEqual(r.input.conditions.enabledRuleIds,['MACHINE','PRECEDENCE','CALENDAR','MOLD']);
  if(name==='mix-cap2'){const mix=r.plan.tasks.filter(t=>t.opId==='MIX'||t.id.endsWith('-MIX'));assert.ok(mix.some(t=>t.start>=30));}
  if(name==='late-return10')assert.ok(Math.max(...r.plan.tasks.filter(t=>t.id.endsWith('-FILL')).map(t=>t.start))>=70);
  if(name==='calendar-start100')assert.ok(r.plan.tasks.every(t=>t.start>=100));
  if(name==='machine-stop')assert.ok(r.plan.tasks.find(t=>t.id==='A-MIX').start>=100);
  if(name==='tool-window100')assert.ok(r.plan.tasks.filter(t=>t.id.endsWith('-FILL')).every(t=>t.start>=100));
  if(name==='demand3-cap2'){assert.ok(!r.plan.tasks.some(t=>t.id==='A-FILL'));assert.ok(r.plan.unplannedOrderIds?.includes('A')||r.plan.findings?.length||r.run.status==='partial');}
  const verification=await f.ok('/plans/'+r.plan.id+'/verify',{});dump(name,{...r,data:d,verify:verification,frozen:await f.ok('/plans/'+r.plan.id+'/inputs')});report.checks.push({id:name,status:'PASS',runId:r.run.id,planned:r.plan.tasks.length});
 }catch(e){report.failure={name,stack:e.stack};throw e;}finally{dump('api-results',report);await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat06-guards-')),f=await b2Host({dir});try{
 const x=uat06();await f.ok('/state');await f.ok('/inputs',{revision:0,tables:x.data});const s=await f.ok('/state'),checks=[];
 const cases=[['query-write',{tables:{tools:x.data.tools}},'query',403],['stale',{revision:0,tables:{tools:x.data.tools}},'planner',409],['missing-claims',{tables:{resourceClaims:[]}},'planner',400],['negative-capacity',{tables:{tools:x.data.tools.map(t=>({...t,'可用数量':'-1'}))}},'planner',400],['unknown-rule',{tables:{rules:[...x.data.rules,{'规则编号':'UNKNOWN_UAT06','中文名称':'unsupported simulation','是否启用':'是','参数JSON':'{}'}]}},'planner',400]];
 for(const [id,body,role,status]of cases){const before=f.bytes(),r=await f.call('/inputs',{revision:s.revision,...body},role);assert.equal(r.status,status,JSON.stringify(r));assert.equal(f.bytes(),before);checks.push({id,status:'PASS',response:r,beforeSha256:hash(before),afterSha256:hash(f.bytes())});}
 dump('zero-write',checks);report.checks.push(...checks.map(({id,status})=>({id,status})));report.complete=true;
}finally{dump('api-results',report);await f.close();fs.rmSync(dir,{recursive:true,force:true});}
