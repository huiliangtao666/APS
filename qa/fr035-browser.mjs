import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {startValidation} from './fr034-integration-runner.mjs';import {reportCsv,scopedReport} from '../server/scoped-report.mjs';import {parseInputCsv} from '../src/lib/input-csv.mjs';import {openStore} from '../server/auth/store.mjs';
const output='/evidence',run=await startValidation(),report={sourceHashes:run.manifest.sourceHashes,checks:[],errors:[],downloads:[],requests:[],identity:'Real App/Express/membership with fixed synthetic actor and QA runtime alias; no gateway/SSO claim'};
const scratch=fs.readdirSync('/tmp').find(n=>n.startsWith('fr033-real-app-')),dir=path.join('/tmp',scratch,'data'),file=path.join(dir,'business.json'),store=openStore(dir),subject='fr033-test#synthetic-planner';
const disk=()=>JSON.parse(fs.readFileSync(file)),query=(kind,planId=run.manifest.jointPlanId,extra={})=>({kind,planId,start:0,end:120,text:'',order:'',...extra});
async function api(q){return run.call('/reports?query='+encodeURIComponent(JSON.stringify(q)));}
async function post(body,status=200,headers={}){const r=await fetch(run.url+'/api/export',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({reason:'FR035 browser/API scope acceptance',...body})});const text=Buffer.from(await r.arrayBuffer()).toString('utf8');report.requests.push({body,status:r.status,text:status===200?undefined:text});assert.equal(r.status,status,text);return text;}
async function check(name,fn){await fn();report.checks.push({name,pass:true});fs.writeFileSync(output+'/fr035-browser-report.json',JSON.stringify(report,null,2));}
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1100,height:900},acceptDownloads:true});page.on('pageerror',e=>report.errors.push(e.stack));
 await page.goto(run.url);await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.locator('body > aside').evaluateAll(es=>es.forEach(e=>e.remove()));
 await page.getByLabel('操作原因',{exact:true}).fill('FR035 真实应用下载比对');await page.getByRole('button',{name:'查询报表与导出',exact:true}).click();await page.getByLabel('报表方案',{exact:true}).selectOption(run.manifest.jointPlanId);
 const read=async()=>{const b=page.getByRole('button',{name:'查询当前报表',exact:true});await b.click();await page.locator('table[data-fr035-view]').waitFor();};
 for(const kind of ['orders','tasks','occupation','materials','unplanned','differences'])await check('real App downloadable bytes and DOM cells: '+kind,async()=>{
  const id=['materials','unplanned'].includes(kind)?run.manifest.materialPlanId:run.manifest.jointPlanId;
  await page.getByLabel('报表方案',{exact:true}).selectOption(id);await page.getByLabel('报表类别',{exact:true}).selectOption(kind);
  if(kind==='differences')await page.getByLabel('对比方案',{exact:true}).selectOption(run.manifest.historicalPlanId);
  await read();const q=query(kind,id,kind==='differences'?{otherPlanId:run.manifest.historicalPlanId}:{}),r=await api(q);
  assert.equal(await page.locator('table[data-fr035-view]').getAttribute('data-fr035-view'),r.viewId);
  assert.deepEqual(await page.locator('table[data-fr035-view] tbody tr').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('td')].map(c=>c.querySelector('[data-fr035-cell]')?.textContent??c.textContent))),r.rows);
  if(r.rows.length){const saved=JSON.parse(r.rows[0][1]),summary=await page.locator('table[data-fr035-view] tbody tr').first().locator('td').nth(1).locator('p').first().innerText();
   const quantity=kind==='orders'?saved.inputRecord['合格需求']:kind==='tasks'?saved.assessment?.quantity:kind==='occupation'?saved.record.busyMinutes:['materials','unplanned'].includes(kind)?saved.record.quantity:undefined;
   if(quantity!=null)assert.ok(summary.includes(String(quantity)),summary);if(kind==='tasks')assert.ok(summary.includes(saved.startAt)&&summary.includes(saved.endAt));
   assert.equal(await page.locator('table[data-fr035-view] tbody tr').first().locator('details').getAttribute('open'),null);
  }
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前报表 CSV',exact:true}).click();const download=await promise;await download.saveAs(output+'/'+kind+'.csv');const bytes=fs.readFileSync(output+'/'+kind+'.csv'),expected=Buffer.from('\ufeff'+reportCsv(r));assert.deepEqual(bytes,expected);assert.deepEqual(parseInputCsv(bytes.toString()).slice(6),r.rows);report.downloads.push({kind,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),viewId:r.viewId,rows:r.rows.length});
 });
 await check('keyboard filters, empty transitions, window, exact order scope, invalidation and CSV',async()=>{
  await page.getByLabel('报表类别',{exact:true}).selectOption('tasks');await page.getByLabel('报表方案',{exact:true}).selectOption(run.manifest.jointPlanId);await page.getByLabel('报表搜索',{exact:true}).focus();await page.keyboard.type('no-matching-task');assert.ok(await page.getByRole('button',{name:'导出当前报表 CSV',exact:true}).isDisabled());await read();assert.equal(await page.locator('table[data-fr035-view] tbody tr').count(),0);
  await page.getByLabel('报表搜索',{exact:true}).fill('');await page.getByLabel('报表订单',{exact:true}).fill('A');await page.getByLabel('报表结束分钟',{exact:true}).fill('30');
  const button=page.getByRole('button',{name:'查询当前报表',exact:true});await page.getByLabel('报表结束分钟',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await button.evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Enter');await page.locator('table[data-fr035-view]').waitFor();const r=await api(query('tasks',run.manifest.jointPlanId,{order:'A',end:30}));assert.ok(r.rows.length);assert.ok(r.rows.every(row=>JSON.parse(row[1]).orderId==='A'));assert.equal(await page.locator('table[data-fr035-view]').getAttribute('data-fr035-view'),r.viewId);
  const promise=page.waitForEvent('download');await page.keyboard.press('Tab');await page.keyboard.press('Enter');const d=await promise;await d.saveAs(output+'/filtered-tasks.csv');assert.deepEqual(fs.readFileSync(output+'/filtered-tasks.csv'),Buffer.from('\ufeff'+reportCsv(r)));
  await page.getByLabel('报表结束分钟',{exact:true}).fill('0');assert.ok(await button.isDisabled());assert.ok(await page.getByRole('button',{name:'导出当前报表 CSV',exact:true}).isDisabled());
 });
 await check('difference order filtering retains per-order impact, absent order stays empty',async()=>{
  for(const order of ['A','absent-order']){const r=await api(query('differences',run.manifest.jointPlanId,{otherPlanId:run.manifest.historicalPlanId,order}));if(order==='absent-order')assert.deepEqual(r.rows,[]);else assert.ok(r.rows.length);}
 });
 await check('narrow viewport native keyboard controls and readable result scroll',async()=>{
  await page.setViewportSize({width:640,height:900});await page.getByLabel('报表结束分钟',{exact:true}).fill('120');await read();
  const table=page.getByLabel('报表结果，可横向滚动',{exact:true});await table.focus();await page.keyboard.press('ArrowRight');assert.equal(await table.evaluate(e=>e===document.activeElement),true);fs.writeFileSync(output+'/fr035-narrow.aria.txt',await page.locator('body').ariaSnapshot());await page.screenshot({path:output+'/fr035-narrow.png',fullPage:true});report.narrow=await table.evaluate(e=>({clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth}));await page.setViewportSize({width:1100,height:900});
 });
 await check('real current40/50 history difference, frozen saved query unaffected by current input changes',async()=>{
  const q=query('tasks',run.manifest.historicalPlanId),before=await api(q),s=await run.call('/state'),old=disk().plans;
  const orders=structuredClone(s.data.orders);orders[0]['优先顺序']=String(Number(orders[0]['优先顺序'])+1);await run.call('/inputs',{revision:s.revision,tables:{orders}});assert.deepEqual(await api(q),before);assert.deepEqual(disk().plans,old);assert.deepEqual(await post({report:q,viewId:before.viewId}), '\ufeff'+reportCsv(before));
  assert.equal(run.manifest.fixture.savedFactQuantity,'40');assert.equal(run.manifest.fixture.currentFactQuantity,'50');
 });
 await check('fail closed: unknown keys, spoof, stale or widened view, CSRF, reason, damaged history',async()=>{
  const q=query('orders'),r=await api(q);await post({report:q,viewId:'stale'},409);await post({report:{...q,order:'A'},viewId:r.viewId},409);await post({report:{...q,actor:'admin'},viewId:r.viewId},400);await post({report:q,viewId:r.viewId,actor:'admin'},400);await post({report:q,viewId:r.viewId},403,{origin:'https://other.invalid'});await post({report:q,viewId:r.viewId},403,{'sec-fetch-site':'cross-site'});await post({report:q,viewId:r.viewId,reason:''},400);
  const s=disk();delete s.inputVersions[s.plans.find(p=>p.id===q.planId).inputVersionId];const original=fs.readFileSync(file);fs.writeFileSync(file,JSON.stringify(s));await post({report:q,viewId:r.viewId},409);fs.writeFileSync(file,original);
 });
 await check('stored query role export grant/revocation and removed member override forged claims',async()=>{
  const q=query('orders'),r=await api(q);store.setRole(subject,'query','fr033-test#admin');await post({report:q,viewId:r.viewId,role:'supervisor',canExport:true},403);assert.equal((await api(q)).viewId,r.viewId);
  store.setExport(subject,true,'fr033-test#admin');assert.equal(await post({report:q,viewId:r.viewId}),'\ufeff'+reportCsv(r));store.setExport(subject,false,'fr033-test#admin');await post({report:q,viewId:r.viewId},403);
  await page.reload();await page.getByText('当前权限：query',{exact:false}).waitFor();await page.getByRole('button',{name:'查询报表与导出',exact:true}).click();await page.getByLabel('报表方案',{exact:true}).selectOption(q.planId);await read();assert.ok(await page.getByRole('button',{name:'导出当前报表 CSV',exact:true}).isDisabled());
  store.remove(subject,'fr033-test#admin');await post({report:q,viewId:r.viewId},403);const denied=await fetch(run.url+'/api/reports?query='+encodeURIComponent(JSON.stringify(q)));assert.equal(denied.status,403);
 });
 await check('trusted audit contains exact query, view, input, snapshot and synthetic server actor',async()=>{const log=disk().records.filter(r=>r.action==='export'&&r.viewId);assert.ok(log.length>=9);assert.ok(log.every(r=>r.actor===subject&&r.reason&&r.requestId&&r.inputVersionId&&r.snapshotHash&&r.query));fs.writeFileSync(output+'/fr035-export-audit.json',JSON.stringify(log,null,2));});
 await page.screenshot({path:output+'/fr035-real-app.png',fullPage:true});fs.writeFileSync(output+'/fr035-real-app.html',await page.content());fs.writeFileSync(output+'/fr035-real-app.aria.txt',await page.locator('body').ariaSnapshot());assert.deepEqual(report.errors,[]);report.completed=true;
} catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(output+'/fr035-browser-report.json',JSON.stringify(report,null,2));await browser?.close();await run.close();}
console.log('FR035_BROWSER_PASS '+report.checks.length+' groups / '+report.downloads.length+' downloadable byte comparisons');
