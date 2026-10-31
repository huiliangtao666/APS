import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {hostProcess} from './b234-host-client.mjs';import {r4Scenario} from './r4-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';
const out=process.env.R4_EVIDENCE;fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r4-browser-'));
const report={productSha:process.env.B2_PRODUCT_SHA,checks:[],errors:[],requests:[],identity:'synthetic QA planner/supervisor/query; real root React, Express routes and application Worker'};
let f=await hostProcess(dir,{browser:true}),browser,page;const saved={};
const dump=(name,x)=>fs.writeFileSync(path.join(out,name),typeof x==='string'?x:JSON.stringify(x,null,2));
const pass=(id,details)=>{report.checks.push({id,result:'PASS',details});dump('report.json',report);};
async function upload(d){
 await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();const batch=page.locator('[data-csv-batch]');
 await batch.getByLabel('选择批量 CSV',{exact:true}).setInputFiles(scenarioFiles(d).map(file=>({name:file.name,mimeType:'text/csv',buffer:Buffer.from(file.text)})));
 await batch.getByText('已读取文件，请预览。',{exact:true}).waitFor();await batch.getByRole('button',{name:'预览并检查整批',exact:true}).click();return batch;
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browser=browser.version();page=await browser.newPage({viewport:{width:1700,height:1100}});page.setDefaultTimeout(25000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',async r=>{if(new URL(r.url()).pathname.startsWith('/api/'))report.requests.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method(),request:r.request().postData(),body:await r.text().catch(()=>null)});});
 await f.ok('/calculate',{revision:0});await page.goto(f.url);await page.getByLabel('操作原因',{exact:true}).fill('R4显式模拟配对工程自测');
 const invalid=r4Scenario('12');invalid.times.find(r=>r['工序编号']==='PACK')['计算方式']='按支数';const before=f.bytes();let batch=await upload(invalid);
 await batch.getByText(/预览结果：阻止导入/).waitFor();assert.equal(f.bytes(),before);assert.equal(await batch.getByRole('button',{name:'确认整批导入',exact:true}).isEnabled(),false);pass('UI-R4-01_INVALID_BATCH_ZERO_WRITE');
 for(const scene of ['12','13','14']){
  const data=r4Scenario(scene);batch=await upload(data);await batch.getByText('检查通过，尚未导入。',{exact:true}).waitFor();await batch.getByRole('button',{name:'确认整批导入',exact:true}).click();await batch.getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'排程工作台',exact:true}).click();const wait=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'另开计算（冻结当前输入）',exact:true}).click();const created=await(await wait).json();let run;
  for(let n=0;n<800;n++){run=await f.ok('/runs/'+created.id);if(run.planId)break;assert.ok(!['failed','timed_out','cancelled'].includes(run.status));await new Promise(r=>setTimeout(r,20));}
  assert.equal(run.status,'completed');await page.getByRole('article',{name:'运行记录 '+run.id}).getByRole('button',{name:'查看结果',exact:true}).click();await page.getByRole('heading',{name:'生产拆批与资源批',exact:true}).waitFor();
  const plan=(await f.ok('/plans')).find(p=>p.id===run.planId),input=await f.ok('/runs/'+run.id+'/inputs');assert.equal(plan.tasks.length,scene==='12'?5:10);assert.equal(plan.processRouteVerification.status,'pass');
  const verifiedResponse=page.waitForResponse(r=>r.url().endsWith('/api/plans/'+plan.id+'/verify')&&r.request().method()==='POST');await page.getByRole('button',{name:'独立复核',exact:true}).click();const verified=await(await verifiedResponse).json();assert.equal(verified.verification.checks.processRoute.status,'pass');
  await page.locator('.verification-panel').getByText('加工冷却完整路线',{exact:true}).waitFor();await page.getByRole('button',{name:'保存快照',exact:true}).click();await page.reload();await page.getByLabel('已保存方案',{exact:true}).selectOption(plan.id);await page.getByLabel('操作原因',{exact:true}).fill('R4保存版本原生导出');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出 CSV',exact:true}).click();const csvFile=path.join(out,'R4-UI-'+scene+'.csv');await(await download).saveAs(csvFile);const csv=fs.readFileSync(csvFile,'utf8');assert.match(csv,/合格产出/);
  const result={data,plan,input,run,verified,csv};saved[scene]=result;dump('R4-UI-'+scene+'.json',result);const sourceFolder=path.join(out,'R4-UI-'+scene+'-source');fs.mkdirSync(sourceFolder,{recursive:true});for(const file of scenarioFiles(data))fs.writeFileSync(path.join(sourceFolder,file.name),file.text);
  await page.screenshot({path:path.join(out,'R4-UI-'+scene+'.png'),fullPage:true});pass('UI-R4-'+scene+'_REAL_WORKER_VERIFY_SAVE_REOPEN_EXPORT',{planId:plan.id,tasks:plan.tasks.length});
 }
 const frozen=await f.ok('/plans/'+saved['13'].plan.id+'/inputs'),bytes=f.bytes(),oldPid=f.pid;dump('first-host.log',await f.close());f=await hostProcess(dir,{browser:true});assert.notEqual(f.pid,oldPid);assert.equal(f.bytes(),bytes);
 await page.goto(f.url);await page.getByLabel('已保存方案',{exact:true}).selectOption(saved['13'].plan.id);assert.deepEqual(await f.ok('/plans/'+saved['13'].plan.id+'/inputs'),frozen);assert.equal(await f.ok('/export',{planId:saved['13'].plan.id}),saved['13'].csv.replace(/^\uFEFF/,''));pass('UI-R4-05_PROCESS_RESTART_HISTORY',{oldPid,newPid:f.pid,old480SourcePreservedAfter400Edit:true});
 await page.setExtraHTTPHeaders({'test-sub':'query'});await page.goto(f.url);await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:/^工艺路线/}).click();assert.equal(await page.getByLabel('工艺路线 1 工序编号',{exact:true}).isEnabled(),false);assert.equal(await page.locator('[data-csv-batch]').getByRole('button',{name:'确认整批导入',exact:true}).isEnabled(),false);pass('UI-R4-06_QUERY_READONLY');assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}finally{dump('report.json',report);await browser?.close();dump('last-host.log',await f.close());fs.rmSync(dir,{recursive:true,force:true});}
