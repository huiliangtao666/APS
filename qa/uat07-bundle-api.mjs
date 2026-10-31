import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {b2Host} from './b2-host.mjs';import {b2Worker} from './b2-fixture.mjs';import {uat07,selection} from './uat07-bundle-fixture.mjs';
const out=process.env.UAT07_OUT;fs.mkdirSync(out,{recursive:true});const dump=(n,x)=>fs.writeFileSync(out+'/'+n+'.json',JSON.stringify(x,null,2)),hash=x=>createHash('sha256').update(x).digest('hex'),checks=process.env.UAT07_CASES&&fs.existsSync(out+'/api-results.json')?JSON.parse(fs.readFileSync(out+'/api-results.json')).checks:[];
for(const name of (process.env.UAT07_CASES||'core,no-delay,capacity2,early5,calendar100,tool100,demand2-cap1,horizon69').split(',')){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat07-'+name+'-')),f=await b2Host({dir});
 try{
  const x=uat07(),d=x.data;dump('source-contract',x.source);
  if(name==='no-delay')d.resourceClaims.find(c=>c['订单编号']==='A'&&c['资源编号']==='G01')['后延占用分钟']='0';
  if(name==='capacity2')d.tools.find(t=>t['工装编码']==='G01')['可用数量']='2';
  if(name==='early5')d.resourceClaims.find(c=>c['订单编号']==='B'&&c['资源编号']==='G01')['提前占用分钟']='5';
  if(name==='calendar100')d.calendars.forEach(c=>c['起始分钟']='100');
  if(name==='tool100')d.tools.find(t=>t['工装编码']==='G01')['可用起始分钟']='100';
  if(name==='demand2-cap1')d.resourceClaims.find(c=>c['订单编号']==='B'&&c['资源编号']==='G01')['需求数量']='2';
  await f.ok('/state');await f.ok('/inputs',{revision:0,tables:d});const s=selection(d);if(name==='horizon69')s.endMinute=69;
  const r=await b2Worker(f,s),expected=['demand2-cap1','horizon69'].includes(name)?3:4;assert.equal(r.plan.tasks.length,expected,JSON.stringify(r));
  assert.deepEqual(r.input.conditions.enabledRuleIds,['MACHINE','PRECEDENCE','CALENDAR','MOLD']);
  const task=id=>r.plan.tasks.find(t=>t.id===id);
  if(name==='core'){assert.equal(task('A-FILL').end,60);assert.equal(task('B-FILL').start,70);}
  if(name==='no-delay')assert.equal(task('B-FILL').start,60);
  if(name==='capacity2')assert.equal(task('B-FILL').start,45);
  if(name==='early5')assert.equal(task('B-FILL').start,75);
  if(name==='calendar100')assert.ok(r.plan.tasks.every(t=>t.start>=100));
  if(name==='tool100')assert.ok(r.plan.tasks.filter(t=>t.operation==='FILL').every(t=>t.start>=100));
  if(expected===3)assert.ok(!task('B-FILL'));
  dump(name,{...r,data:d,verify:await f.ok('/plans/'+r.plan.id+'/verify',{}),frozen:await f.ok('/plans/'+r.plan.id+'/inputs')});checks.push({id:name,status:'PASS',runId:r.run.id,tasks:r.plan.tasks.length});
 }finally{dump('api-results',{checks});await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat07-guards-')),f=await b2Host({dir});try{
 const x=uat07();await f.ok('/state');await f.ok('/inputs',{revision:0,tables:x.data});const state=await f.ok('/state'),guards=[];
 for(const [id,body,role,code]of [['query-write',{tables:{tools:x.data.tools}},'query',403],['stale',{revision:0,tables:{tools:x.data.tools}},'planner',409],['missing-claims',{tables:{resourceClaims:[]}},'planner',400],['negative-capacity',{tables:{tools:x.data.tools.map(t=>({...t,'可用数量':'-1'}))}},'planner',400],['negative-return',{tables:{resourceClaims:x.data.resourceClaims.map(c=>({...c,'后延占用分钟':'-1'}))}},'planner',400],['unknown-rule',{tables:{rules:[...x.data.rules,{'规则编号':'UNKNOWN_UAT07','中文名称':'显式负例','是否启用':'是','参数JSON':'{}'}]}},'planner',400]]){
  const before=f.bytes(),r=await f.call('/inputs',{revision:state.revision,...body},role);assert.equal(r.status,code,JSON.stringify(r));assert.equal(f.bytes(),before);guards.push({id,status:'PASS',response:r,beforeSha256:hash(before),afterSha256:hash(f.bytes())});
 }dump('guards',guards);dump('api-results',{checks,guards,complete:true});
}finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
