// QA-only UAT04 task-level tests. Product modules are never changed.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {b2Host} from './b2-host.mjs';import {b2Scenario,b2Worker} from './b2-fixture.mjs';
const out=process.env.UAT04_OUT;if(!out)throw Error('UAT04_OUT required');fs.mkdirSync(out,{recursive:true});
const dump=(n,x)=>fs.writeFileSync(out+'/'+n+'.json',JSON.stringify(x,null,2));
const report={scope:'UAT04 independent task-level selftest; no QA UAT',cases:[]};
for(const name of ['core','demand2','wrong-skill','wrong-shift','later-shift','hp04-expand-first','hp04-check-first','hp04-post-shift']){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uat04-'+name+'-'));const f=await b2Host({dir});
 try{
  const fixture=b2Scenario('04'),d=fixture.data,rows=d.dependencies.filter(r=>r['资源类型']==='人员技能');
  if(name==='demand2')rows.forEach(r=>r['需求数量']='2');
  if(name==='wrong-skill')d.personnelGroups.find(g=>g['人员组编号']==='LP01')['技能']='普通辅助';
  if(name==='wrong-shift')d.personnelGroups.find(g=>g['人员组编号']==='LP01')['班次']='另一班';
  if(name==='later-shift')d.personnelGroups.find(g=>g['人员组编号']==='LP01')['可用起始分钟']='60';
  if(name.startsWith('hp04-')){
   rows.forEach(r=>Object.assign(r,{'人员占用基准':'参与窗口','人员检查顺序':name==='hp04-check-first'?'先检查可用性再扩展占用':'先扩展占用再检查可用性','提前占用分钟':'5','后延占用分钟':'10','人员配置来源':'qa/uat04-selftest.mjs 显式可替换仿真；非客户默认','人员配置版本':'MOCK-UAT04-HP04-r1'}));
   if(name==='hp04-post-shift')d.personnelGroups.find(g=>g['人员组编号']==='LP01')['可用结束分钟']='35';
  }
  await f.ok('/state');await f.ok('/inputs',{revision:0,tables:d});
  const s=await f.ok('/state');const r=await b2Worker(f,{orderIds:['A','B'],startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:s.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'});
  const planned=r.plan.tasks.filter(t=>t.start!=null&&t.end!=null&&t.machine);
  const negative=['demand2','wrong-skill','wrong-shift','hp04-post-shift'].includes(name);
  assert.equal(planned.length,negative?0:4,JSON.stringify({name,tasks:r.plan.tasks,unplanned:r.plan.unplanned}));
  if(!negative){const verified=await f.ok('/plans/'+r.plan.id+'/verify',{});dump(name+'-verify',verified);}
  dump(name,{name,fixture,mutatedInput:d,...r,frozen:await f.ok('/plans/'+r.plan.id+'/inputs'),store:JSON.parse(f.bytes())});
  report.cases.push({name,status:'PASS',planned:planned.length,runId:r.run.id});
 }catch(e){report.failure={name,stack:e.stack};throw e;}finally{dump('api-results',report);await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}
report.complete=true;dump('api-results',report);
