import fs from 'node:fs';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';import {chromium} from 'playwright';import {startValidation} from './fr034-integration-runner.mjs';
const output=process.env.FR038_EVIDENCE_DIR||'/evidence';
let mode='busy';const report={checks:[],errors:[],identity:'fixed synthetic actor, genuine React/Express/membership; no signed gateway/SSO',requests:[]};
const run=await startValidation({runOptions:{runTimeoutMs:2500,workerFactory:data=>{
 if(mode==='real')return new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:data});
 const w=new Worker(mode==='crash'?'throw Error("private stack must not appear")':'const {parentPort}=require("node:worker_threads");parentPort.postMessage({kind:"progress"});while(true){}',{eval:true});
 if(mode==='busy'){const terminate=w.terminate.bind(w);w.terminate=async()=>{const result=await terminate();await new Promise(r=>setTimeout(r,1100));return result;};}return w;
}}});
let browser;
try{
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();const page=await browser.newPage({viewport:{width:1100,height:900},acceptDownloads:true});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/runs'))report.requests.push({url:r.url(),status:r.status()});});
 await page.goto(run.url);await page.getByLabel('操作原因',{exact:true}).fill('FR038 disposable browser verification');const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'计算范围与运行记录 · FR-018/038',exact:true})}).last();
 const state=await run.call('/state'),baseline=await run.call('/plans');
 async function start(){const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST'),panel.getByRole('button',{name:'另开计算（冻结当前输入）',exact:true}).click()]);assert.equal(response.status(),202);return response.json();}
 async function until(id,expected){for(let n=0;n<200;n++){const x=await run.call('/runs/'+id);if(expected.includes(x.status))return x;await new Promise(r=>setTimeout(r,25));}throw Error('run deadline');}
 const check=async(name,fn)=>{await fn();report.checks.push(name);};
 await check('real busy Worker cancellation visible until termination, no partial save',async()=>{
  const r=await start();report.cancelRun=r.id;const row=panel.getByRole('article',{name:'运行记录 '+r.id});await row.getByRole('button',{name:'取消运行',exact:true}).click();await page.getByRole('button',{name:'刷新数据与记录',exact:true}).isVisible();
  await row.getByText('已请求取消，正在停止计算',{exact:true}).waitFor();await page.screenshot({path:output+'/fr038-cancel-requested.png',fullPage:true});await row.screenshot({path:output+'/fr038-cancel-record.png'});await row.getByText('本次已取消，没有保存部分结果。原有方案和源数据保留。',{exact:true}).waitFor();assert.equal((await until(r.id,['cancelled'])).planId,undefined);assert.deepEqual(await run.call('/plans'),baseline);assert.deepEqual(await run.call('/state'),state);
 });
 await check('collapsed diagnostics, keyboard expansion, original identities/rules and CSV download',async()=>{
  const row=panel.getByRole('article',{name:'运行记录 '+report.cancelRun});const details=row.locator('details');assert.equal(await details.getAttribute('open'),null);await details.locator('summary').focus();await page.keyboard.press('Enter');assert.ok(await row.getByText('输入 ',{exact:false}).count());await row.getByRole('button',{name:'查看本次原始输入、实际规则与条件',exact:true}).click();await panel.getByText('不可变运行输入',{exact:true}).waitFor();assert.match(await panel.locator('pre').innerText(),new RegExp(report.cancelRun));await panel.getByRole('button',{name:'关闭输入详情',exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),row.getByRole('button',{name:'导出运行状态与原因',exact:true}).click()]);const file=output+'/fr038-cancel.csv';await download.saveAs(file);const bytes=fs.readFileSync(file,'utf8');assert.ok(bytes.startsWith('\ufeff'));assert.ok(bytes.includes(report.cancelRun)&&bytes.includes('user_cancelled'));report.csv=file;
 });
 await check('retry through UI executes original frozen Worker data with a new run identity',async()=>{
  mode='real';const old=await run.call('/runs/'+report.cancelRun);const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/retry')&&r.request().method()==='POST'),panel.getByRole('article',{name:'运行记录 '+old.id}).getByRole('button',{name:'用本次原输入复算',exact:true}).click()]);assert.equal(response.status(),202);const retry=await response.json();assert.equal(retry.retryOf,old.id);const terminal=await until(retry.id,['completed','partial']);assert.equal(terminal.outcome,'succeeded');assert.equal(terminal.snapshotHash,old.snapshotHash);report.retryRun=retry.id;await panel.getByRole('article',{name:'运行记录 '+retry.id}).getByRole('button',{name:'查看结果',exact:true}).waitFor();
 });
 await check('real Worker crash yields Chinese guidance, hidden code and no false result',async()=>{
  mode='crash';const r=await start();await until(r.id,['failed']);const row=panel.getByRole('article',{name:'运行记录 '+r.id});await row.getByText('本次计算未完成，请查看原输入及规则；重复失败时将技术详情提供给维护人员。',{exact:true}).waitFor();assert.equal(await row.getByRole('button',{name:'查看结果',exact:true}).count(),0);assert.equal(await row.getByText('worker_error',{exact:false}).isVisible(),false);assert.ok(!(await row.innerText()).includes('private stack'));report.crashRun=r.id;
 });
 await check('timeout guidance does not imply infeasibility and retains saved results',async()=>{
  const saved=await run.call('/plans');mode='timeout';const r=await start();await until(r.id,['timed_out']);await panel.getByRole('article',{name:'运行记录 '+r.id}).getByText('达到计算时限，本次没有可用结果；这不代表没有可行排法。可复查原输入，或调整范围后另开计算。',{exact:true}).waitFor();assert.deepEqual(await run.call('/plans'),saved);assert.deepEqual(await run.call('/state'),state);report.timeoutRun=r.id;
 });
 await check('640px viewport keyboard diagnostics and refresh retain immutable run identities',async()=>{
  await page.setViewportSize({width:640,height:900});const row=panel.getByRole('article',{name:'运行记录 '+report.timeoutRun});await row.locator('summary').focus();await page.keyboard.press('Enter');await row.getByText('time_limit',{exact:false}).waitFor();await page.screenshot({path:output+'/fr038-narrow.png',fullPage:true});await row.screenshot({path:output+'/fr038-timeout-record.png'});await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('FR038 reload');await panel.getByRole('article',{name:'运行记录 '+report.timeoutRun}).waitFor();
 });
 fs.writeFileSync(output+'/fr038-real-app.html',await page.content());fs.writeFileSync(output+'/fr038-real-app.aria.txt',await page.locator('body').ariaSnapshot());report.runs=await run.call('/runs');report.sourceHashes=run.manifest.sourceHashes;assert.deepEqual(report.errors,[]);report.complete=true;
} catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(output+'/fr038-browser-report.json',JSON.stringify(report,null,2));await browser?.close();await run.close();}
console.log('FR038_BROWSER_PASS '+report.checks.length+' groups');
