import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {p06Fixture,work,stop} from './p06-fixture.mjs';
import {fixture} from './fr027-fixture.mjs';import {jointEnabledFixture} from './r01r02-fixture.mjs';import {defs} from '../server/planner.ts';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
const f=await fixture(null,{browser:true}),out='/evidence',report={cases:[],guards:[],errors:[],identity:'synthetic membership, real React/Express/async Worker; Dev self-test'},hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');let browser,page;
const editor=()=>page.getByRole('region',{name:'模拟记录编辑',exact:true});
const field=(key,i,k)=>editor().getByLabel(`${defs.find(d=>d.key===key).label} ${i+1} ${k}`,{exact:true});
async function category(key){await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:defs.find(d=>d.key===key).label,exact:false}).click();}
async function load(){await page.goto(f.url);await page.getByLabel('操作原因',{exact:true}).fill('P06显式合成输入，非现场默认值');}
async function save(status=200){
 if(status===200&&!await editor().getByRole('button',{name:'保存修改',exact:true}).isEnabled()){
  // P10 explicit policies require a zero-write draft preview before saving.
  const before=f.bytes();
  await editor().getByLabel('预览订单',{exact:true}).selectOption('A');
  await editor().getByLabel('预览工序',{exact:true}).fill('MIX');
  await editor().getByLabel('候选开始分钟',{exact:true}).fill('0');
  await editor().getByLabel('候选结束分钟',{exact:true}).fill('30');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/inputs/resource-policy-preview'));
  await editor().getByRole('button',{name:'预览人员策略影响',exact:true}).click();
  const response=await pending;assert.equal(response.status(),200,JSON.stringify(await response.json()));
  await editor().getByLabel('联合排程影响预览',{exact:true}).waitFor();
  assert.equal(f.bytes(),before);report.guards.push({label:'required P10 draft preview is zero-write'});
 }
 const before=f.bytes(),wait=page.waitForResponse(r=>r.url().endsWith('/api/inputs')&&r.request().method()==='POST');await editor().getByRole('button',{name:'保存修改',exact:true}).click();const r=await wait,body=await r.json();assert.equal(r.status(),status,JSON.stringify(body));if(status!==200)assert.equal(f.bytes(),before);else await editor().getByRole('status').filter({hasText:/保存完成|内容相同/}).waitFor();return {status,body,beforeHash:hash(before),afterHash:hash(f.bytes())};}
async function change(key,i,k,v){await category(key);await field(key,i,k).fill(v);const s=await save();await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('P06保存后刷新');await category(key);assert.equal(await field(key,i,k).inputValue(),v);report.guards.push({label:`UI save/reload ${key}[${i}].${k}=${v}`,s});}
async function worker(label,count){
 await page.getByRole('button',{name:'排程工作台',exact:true}).click();
 const wait=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'另开计算（冻结当前输入）',exact:true}).click();let r=await (await wait).json();assert.ok(r.id,JSON.stringify(r));
 for(let i=0;i<300;i++){r=await f.ok('/runs/'+r.id);if(['completed','partial','failed','timed_out'].includes(r.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.ok(['completed','partial'].includes(r.status),JSON.stringify(r));const p=(await f.ok('/plans')).find(p=>p.runId===r.id),v=await f.ok('/plans/'+p.id+'/verify',{}),input=await f.ok('/runs/'+r.id+'/inputs');assert.equal(p.tasks.length,count,label+JSON.stringify(p.findings));
 assert.equal(v.verification.checks.jointConditions.status,count?'pass':'not_checked',JSON.stringify(v));assert.equal(v.verification.checks.resourcePolicies.status,count?'pass':'not_checked',JSON.stringify(v));
 if(!count){assert.equal(p.resourceReservations.length,0);assert.ok(p.materialDemands.every(m=>!m.committed));const before=f.bytes();assert.equal((await f.call('/plans/'+p.id+'/submit',{})).status,409);assert.equal(f.bytes(),before);}
 await page.getByRole('article',{name:'运行记录 '+r.id,exact:true}).getByRole('button',{name:'查看结果',exact:true}).click();
 const downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:'导出 CSV',exact:true}).click();const download=await downloadWait,csv=fs.readFileSync(await download.path(),'utf8');fs.writeFileSync(out+'/p06-'+report.cases.length+'.csv',csv);assert.match(csv,/联合候选与保守回退/);assert.match(csv,/P06-windows-v1/);if(!count)assert.match(csv,/unscheduled|horizon/);
 report.cases.push({label,run:r,p,input,verification:v,configHash:hash(input.executionData),exportHash:hash(csv)});return report.cases.at(-1);
}
const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:1100},extraHTTPHeaders:{'test-sub':'planner'}});page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 const d=p06Fixture();d.calendars=[work(0,20),work(30,50)];await f.ok('/inputs',{revision:0,tables:d});await load();await worker('gap negative: no shift fits one complete operation',0);
 await change('calendars',1,'结束分钟','240');await change('calendars',1,'起始分钟','60');const good=await worker('two-shift positive: all four member operations legally in second shift',4);assert.deepEqual(good.p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[60,60]);assert.equal(good.input.conditions.workingWindowsContract,'P06-windows-v1');
 let review=await f.ok('/plans/'+good.p.id+'/review');assert.deepEqual(review.blockers,[],JSON.stringify(review));await f.ok('/plans/'+good.p.id+'/submit',decision(review));review=await f.ok('/plans/'+good.p.id+'/review');await f.ok('/plans/'+good.p.id+'/confirm',decision(review),'supervisor');const conf=(await f.ok('/plans/'+good.p.id+'/review')).confirmation;
 const history=async()=>({plan:(await f.ok('/plans')).find(p=>p.id===good.p.id),confirmation:await f.ok('/confirmations/'+conf.id),input:await f.ok('/runs/'+good.run.id+'/inputs'),facts:(await f.ok('/state')).data.executionFacts});report.historyBefore=await history();
 // New exceptions are maintained through the real generic React editor.
 await category('resourceStops');await editor().getByRole('button',{name:'新增一行',exact:true}).click();for(const [k,v] of Object.entries(stop('工装','G40',60,100)))await field('resourceStops',0,k).fill(v);await save();await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('P06保存后刷新');await category('resourceStops');assert.equal(await field('resourceStops',0,'结束分钟').inputValue(),'100');report.guards.push({label:'UI create/save/reload tool exception [60,100)'});
 const delayed=await worker('tool stop60-100: fresh joint candidate starts100, complete tool release140',4);assert.deepEqual(delayed.p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[100,100]);await page.screenshot({path:out+'/p06-tool-delay.png',fullPage:true});
 await change('resourceStops',0,'结束分钟','240');await worker('tool stop covers all second shift, no ghost commitments',0);
 await category('resourceStops');await field('resourceStops',0,'资源类型').fill('人员');await field('resourceStops',0,'资源编号').fill('G1');await save();await load();await worker('personnel stop covers all second shift, no ghost commitments',0);
 await change('resourceStops',0,'结束分钟','100');const labor=await worker('personnel stop60-100: later legal same-window cycle starts100',4);assert.deepEqual(labor.p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[100,100]);
 await change('personnelGroups',0,'技能','WRONG');await worker('required skill absent in available personnel: zero commit',0);await change('personnelGroups',0,'技能','MIX');
 await change('personnelGroups',0,'可用结束分钟','90');await worker('required personnel end90 but stop through100: zero commit',0);await change('personnelGroups',0,'可用结束分钟','600');
 const boundary=p06Fixture();boundary.calendars=[work(0,40),work(40,240)];boundary.resourceStops=[stop('工装','G40',40,60)];await f.ok('/inputs',{revision:(await f.ok('/state')).revision,tables:boundary});await load();const edge=await worker('half-open: tool release40 equals stop start40; FILL moves intact to40',4);assert.deepEqual(edge.p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[0,0]);assert.ok(edge.p.tasks.filter(t=>t.operation==='FILL').every(t=>t.start===40));await page.screenshot({path:out+'/p06-boundary.png',fullPage:true});

 assert.deepEqual(await history(),report.historyBefore);report.historyAfter=await history();assert.equal(verifyResourcePolicies(good.p,good.input.executionData,good.input.conditions).status,'pass');
 await category('resourceStops');await field('resourceStops',0,'起始分钟').fill('40.5');report.invalid=await save(400);await editor().getByRole('button',{name:'取消修改',exact:true}).click();
 const s=await f.ok('/state');for(const [role,revision,status] of [['query',s.revision,403],['outsider',s.revision,403],['planner',0,409]]){const before=f.bytes(),r=await f.call('/inputs',{revision,tables:{resourceStops:[stop('工装','G40',40,60)]}},role);assert.equal(r.status,status);assert.equal(f.bytes(),before);report.guards.push({role,r,beforeHash:hash(before),afterHash:hash(f.bytes())});}
 await page.setExtraHTTPHeaders({'test-sub':'query'});await load();await category('resourceStops');assert.equal(await field('resourceStops',0,'起始分钟').isEnabled(),false);await page.screenshot({path:out+'/p06-query-readonly.png',fullPage:true});report.audit=await f.ok('/operations');assert.ok(report.audit.some(a=>a.actor==='test#planner'&&a.reason&&a.fromVersion&&a.toVersion));assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){await page.screenshot({path:out+'/p06-failure.png',fullPage:true});report.visible=await page.locator('body').innerText();}throw e;}finally{fs.writeFileSync(out+'/p06-browser-results.json',JSON.stringify(report,null,2));await browser?.close();await f.close();}
