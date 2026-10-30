// Adapted from the preserved independent probe; assertions changed explicitly for the dispatched fix, original kept in evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {seed} from '../server/planner.ts';
import {migratePolicies} from '../src/lib/resource-policies.mjs';
import {problemInterval,taskEvidence} from '../src/lib/task-linkage.mjs';
import {fixture} from './fr027-fixture.mjs';
import {materialFixture} from './material-fixture.mjs';
const R={testOrigin:'24ba6884b3a5f07425a728b7733a677563c6aa44',product:'working source; bound by external provenance hash manifest',api:[],cases:[],browserErrors:[],identity:'Synthetic QA members and runtime alias through real business middleware; no Portal identity/UAT',negative:'Illegal saved-result copies injected ONLY into disposable QA business.json; never Worker outputs or product import'};
const copy=x=>structuredClone(x),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const save=()=>fs.writeFileSync('/evidence/results.json',JSON.stringify(R,null,2));
const f=await fixture(null,{browser:true});let browser;
async function api(path,body,role){const x=await f.call(path,body,role);R.api.push({path,body,status:x.status,response:x.body});save();assert.ok(x.status<300,JSON.stringify(x));return x.body;}
async function install(d){const s=await api('/state');return api('/inputs',{revision:s.revision,tables:d});}
async function worker(label){const s=await api('/state');let r=await api('/runs',{revision:s.revision,selection:{}});for(let i=0;i<500;i++){r=await f.ok('/runs/'+r.id);if(['completed','partial','failed','timed_out'].includes(r.status))break;await new Promise(resolve=>setTimeout(resolve,20));}assert.ok(['completed','partial'].includes(r.status),JSON.stringify(r));R.api.push({path:'/runs/'+r.id,status:200,response:r});const p=(await api('/plans')).find(p=>p.id===r.planId);const frozen=await api('/runs/'+r.id+'/inputs');const verified=await api('/plans/'+p.id+'/verify',{});return {label,run:r,plan:verified,frozen};}
function data(kind){const d=migratePolicies(seed);for(const k of ['routes','times','machines','dependencies'])d[k]=d[k].filter(x=>x['工序编号']==='MIX');d.resourceClaims=[];
 if(kind==='tool'){d.tools=[{'工装编码':'QA-T','工装名称':'仿真工装','适用任务':'MIX','可用数量':'1','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'10','是否启用':'是','说明':'仿真夹具，非现场批准值','可用起始分钟':'0','可用结束分钟':'200'}];d.resourceClaims=d.orders.map(o=>({'声明编号':'QA-'+o['订单编号'],'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'工装','资源编号':'QA-T','需求数量':'1','单位':'套','提前占用分钟':'0','后延占用分钟':'10','占用口径':'显式逐生产批完整区间','窗口开始偏移分钟':'0','窗口结束偏移分钟':'0','参数来源':'逐项声明'}));Object.assign(d.rules.find(r=>r['规则编号']==='MOLD'),{'是否启用':'是','生效时间':'','参数JSON':JSON.stringify({占用口径:'按表23逐项配置',数量口径:'每生产批声明数量',FR006任务默认:'由声明参数来源选择',参数契约:'CR-DEC02-03-v1'})});}
 else {d.personnelGroups=[{'人员组编号':'QA-G','人员组名称':'同一仿真人员池','人员数量':'1','技能':'mix','班次':'D','可用起始分钟':'0','可用结束分钟':'200'}];d.dependencies.push(...d.orders.map(o=>({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'QA-G','需求数量':'1','所需技能':'mix','所需班次':'D','人员参与阶段':'准备','人员开始偏移':'5','人员结束偏移':'20','窗口外释放':'是'})));}
 return d;}
async function confirm(p){const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});let r=await api('/plans/'+p.id+'/review');assert.deepEqual(r.blockers,[]);await api('/plans/'+p.id+'/submit',decision(r));r=await api('/plans/'+p.id+'/review');await api('/plans/'+p.id+'/confirm',decision(r),'supervisor');return (await api('/plans/'+p.id+'/review')).confirmation;}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>R.browserErrors.push(e.message));page.setDefaultTimeout(15000);
 async function open(id){await page.goto(f.url);await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR034 disposable limited acceptance');await page.locator('.plan-list select').selectOption(id);}
 const panel=page.locator('.fr034'),timeline=page.locator('.fr033');
 const originals=[],confirmations=[];
 for(const kind of ['tool','person']){
  await install(data(kind));const w=await worker(kind);assert.equal(w.plan.verification.checks.resourcePolicies.status,'pass');assert.equal(w.plan.tasks.length,2);
  const rr=w.plan.resourceReservations.filter(r=>r.type===(kind==='tool'?'工装':'人员'));assert.equal(rr.length,2);const sorted=[...rr].sort((a,b)=>a.start-b.start);assert.ok(sorted[0].end<=sorted[1].start,'Legal Worker must avoid shared-capacity overlap');
  const confirmation=await confirm(w.plan);confirmations.push(confirmation);const original=(await api('/plans')).find(p=>p.id===w.plan.id);originals.push(original);
  const trial=await api('/plans/'+original.id+'/copy',{}),pos=await api('/trials/'+trial.id+'/positions');const t=original.tasks[1],first=original.tasks[0];
  const pv=await api('/trials/'+trial.id+'/move-preview',{revision:pos.revision,planId:pos.planId,planHash:pos.planHash,taskId:t.id,start:first.start,machine:t.machine});const checked=await api('/trials/'+trial.id+'/previews/'+pv.id+'/recheck',{});
  const illegal=copy(original);illegal.id='FR034-ILLEGAL-'+kind;illegal.name='FR034 手工非法方案副本 '+kind;illegal.status='draft';illegal.findings=[];delete illegal.verification;
  const moved=illegal.tasks[1],delta=first.start-moved.start;moved.start+=delta;moved.end+=delta;
  for(const r of illegal.resourceReservations)if((r.taskIds||[r.taskId]).includes(moved.id)){r.start+=delta;r.end+=delta;}
  const r2=illegal.resourceReservations.filter(r=>r.type===(kind==='tool'?'工装':'人员'));const expected={resource:r2[0].resourceId,start:Math.max(...r2.map(r=>r.start)),end:Math.min(...r2.map(r=>r.end)),demand:r2.reduce((s,r)=>s+Number(r.quantity),0),effectiveCapacity:1,unit:kind==='tool'?'套':'人'};assert.ok(expected.end>expected.start);assert.equal(expected.demand,2);
  const state=JSON.parse(f.bytes());state.plans.push(illegal);fs.writeFileSync(f.dir+'/business.json',JSON.stringify(state));
  await open(illegal.id);await panel.getByRole('button',{name:'主动运行独立检查',exact:true}).click();await panel.locator('.finding').filter({hasText:'超容量'}).first().waitFor();await panel.locator('.finding').filter({hasText:'超容量'}).first().click();
  const selected=await timeline.locator('.fr033-task[data-selected="true"]').count();const geometry=await page.getByLabel('问题区间详情').innerText();const ui=await panel.innerText();
  const verified=(await api('/plans')).find(p=>p.id===illegal.id),findings=verified.verification.findings.filter(x=>x.code.includes('RESOURCE_POLICY'));
  assert.ok(findings.some(x=>x.message.includes('超容量 1')));assert.ok(!geometry.includes('没有可验证的已排问题区间'));
  const structured=findings.find(x=>x.interval?.kind==='resource-capacity');assert.ok(structured,JSON.stringify(findings));
  const interval=problemInterval(verified,structured);assert.ok(interval);assert.equal(interval.start,expected.start);assert.equal(interval.end,expected.end);assert.equal(interval.demand,2);assert.equal(interval.effectiveCapacity,1);assert.equal(interval.unit,expected.unit);assert.deepEqual(interval.taskIds,[...original.tasks.map(t=>t.id)].sort());assert.match(geometry,/窗口合计需求 2/);assert.match(geometry,/有效容量 1/);assert.equal(selected,2);assert.ok(await timeline.getByRole('img',{name:`问题区间 ${expected.start} 至 ${expected.end}，${expected.end-expected.start} 分钟`,exact:true}).count()>0);
  const projected=verified.tasks.map(t=>taskEvidence(verified,t.id));await panel.getByRole('checkbox',{name:'仅显示问题任务'}).check();
  await panel.screenshot({path:'/evidence/'+kind+'-problem-detail.png'});await timeline.screenshot({path:'/evidence/'+kind+'-timeline.png'});await page.screenshot({path:'/evidence/'+kind+'-problem.png',fullPage:true});fs.writeFileSync('/evidence/'+kind+'-problem.html',await page.content());
  await timeline.locator('.fr033-detail').getByRole('button',{name:/查看方案输入 orders/}).first().click();await page.locator('.query-panel').waitFor();assert.equal(await page.getByLabel('查看所选方案计算时的输入',{exact:true}).isChecked(),true);const queryText=await page.locator('.query-panel').innerText();await page.screenshot({path:'/evidence/'+kind+'-input.png',fullPage:true});
  R.cases.push({kind,worker:w,preview:{trial,pos,pv,checked},illegal,expected,verified,projected,selected,geometry,ui,queryText,status:'PASS',fixed:'structured actual ledger interval and aggregate demand/capacity rendered, source links preserved',historyInputs:await api('/plans/'+illegal.id+'/inputs')});save();
 }
 const md=materialFixture(seed);md.inventory.find(r=>r['物料编号']==='LEAN')['账面数量']='0';await install(md);const material=await worker('material');
 await open(material.plan.id);await panel.locator('.finding').filter({hasText:'UNPLANNED / MATERIAL'}).first().click();const materialUI=await panel.innerText();assert.match(materialUI,/需求 325 kg/);assert.match(materialUI,/本次分配可用 0/);assert.match(materialUI,/缺口 325/);const materialGeometry=await page.getByLabel('问题区间详情').innerText();assert.match(materialGeometry,/没有可验证的已排问题区间/);
 await panel.getByText('BOM公式 / 批次质量与效期 / 条件供给依据',{exact:true}).first().click();await page.screenshot({path:'/evidence/material-problem.png',fullPage:true});fs.writeFileSync('/evidence/material-problem.html',await page.content());
 await timeline.locator('.fr033-detail').getByRole('button',{name:/查看方案输入 orders/}).first().click();await page.locator('.query-panel').waitFor();assert.equal(await page.getByLabel('查看所选方案计算时的输入',{exact:true}).isChecked(),true);
 R.cases.push({kind:'material',status:'PASS',worker:material,materialUI,geometry:materialGeometry,queryText:await page.locator('.query-panel').innerText(),input:await api('/plans/'+material.plan.id+'/inputs')});
 const all=await api('/plans');for(const old of originals)assert.deepEqual(all.find(p=>p.id===old.id),old);for(const c of confirmations)assert.deepEqual(await api('/confirmations/'+c.id),c);
 R.preservation={status:'PASS',plans:originals,confirmations,hashes:originals.map(p=>({id:p.id,sha256:hash(p)})),confirmationHashes:confirmations.map(c=>({id:c.id,sha256:hash(c)}))};R.complete=true;assert.deepEqual(R.browserErrors,[]);save();console.log(JSON.stringify({complete:R.complete,cases:R.cases.map(c=>({kind:c.kind,status:c.status,expected:c.expected,geometry:c.geometry})),preservation:R.preservation.status}));
}catch(e){R.executionError=e.stack;save();console.error(e);process.exitCode=1;}finally{await browser?.close();await f.close();}
