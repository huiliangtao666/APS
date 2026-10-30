import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {stockData} from './issue9-fixture.mjs';
import {fixture} from './fr027-fixture.mjs';import {seed,calculate as calculateDiagnostic} from '../server/planner.ts';import {createHash} from 'node:crypto';
const out=process.env.G01_EVIDENCE||'qa/evidence/issue4-g01';fs.mkdirSync(out,{recursive:true});
const dump=(n,x)=>fs.writeFileSync(path.join(out,n),typeof x==='string'?x:JSON.stringify(x,null,2));
const report={checks:[],requests:[],errors:[],identity:'QA-only synthetic actor/runtime alias; real React/Express/Chromium; no production or SSO claim'};
let f,browser,page,original;
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
try{
 f=await fixture(null,{browser:true});await f.ok('/inputs',{revision:0,tables:structuredClone(seed)});
 await f.ok('/calculate',{revision:(await f.ok('/state')).revision});const disk=JSON.parse(f.bytes());disk.data.orders[1]['产线编号']='L02';
 // Explicit QA historical diagnostic: current API preflight now rejects cross-line input before a plan.
 // Direct core result + exact frozen input models an older retained diagnostic, never a successful API run.
 const version=createHash('sha256').update(JSON.stringify(disk.data)).digest('hex');
 original={...calculateDiagnostic(structuredClone(disk.data),disk.revision),id:'G01-QA-HISTORICAL',name:'QA historical global diagnostic',status:'draft',revision:disk.revision,inputVersionId:version};
 disk.inputVersions[version]={id:version,revision:disk.revision,data:structuredClone(disk.data)};disk.plans.unshift(original);
 fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(disk));dump('diagnostic-input.json',disk);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browser=browser.version();page=await browser.newPage({viewport:{width:1500,height:1100}});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(f.url+'/api'))report.requests.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method()});});
 const open=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR016 G01 explicitly authorized navigation test');};
 const choose=async id=>{await page.getByRole('button',{name:'排程工作台',exact:true}).click();await page.getByLabel('已保存方案').selectOption(id);};
 const calculate=async(expected=201)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/calculate'));await page.getByRole('button',{name:'同步计算全部（无取消）',exact:true}).click();const r=await response;assert.equal(r.status(),expected);return r.json();};
 const panel=()=>page.getByRole('region',{name:'问题关联记录',exact:true});
 await open();
 await check('G01 actual calculate -> global click opens true A/B list and highlights displayed first without writes',async()=>{
 const before=f.bytes();const blocked=await calculate(400);assert.ok(blocked.findings.some(f=>f.code==='SCOPE / MULTI_LINE'));assert.equal(f.bytes(),before);await page.locator('.issues-panel .finding').filter({hasText:'SCOPE / MULTI_LINE'}).click();
 await panel().waitFor();assert.deepEqual(await panel().locator('tbody tr').evaluateAll(rows=>rows.map(r=>({selected:r.getAttribute('aria-selected'),text:r.textContent}))),[{selected:'true',text:'选择 1订单与交期订单编号：A'},{selected:'false',text:'选择 2订单与交期订单编号：B'}]);assert.match(await panel().getByRole('region',{name:'关联记录详情'}).innerText(),/L01/);assert.equal(f.bytes(),before);dump('first-dom.txt',await panel().innerText());await panel().screenshot({path:out+'/first.png'});dump('preflight-response.json',blocked);dump('qa-historical-plan.json',original);
 });
 await check('select other record -> current query selects actual B -> edit current B -> save/reload -> recheck clears issue; original plan unchanged',async()=>{
 await panel().getByRole('button',{name:'选择关联记录 2',exact:true}).click();assert.equal(await panel().locator('tr[aria-selected="true"]').count(),1);assert.match(await panel().locator('tr[aria-selected="true"]').innerText(),/B/);
 await page.locator('.issues-panel .finding').filter({hasText:'SCOPE / MULTI_LINE'}).click();assert.match(await panel().locator('tr[aria-selected="true"]').innerText(),/A/);await panel().getByRole('button',{name:'选择关联记录 2',exact:true}).click();
 await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();await page.getByRole('heading',{name:'模拟数据与关联查询',exact:true}).waitFor();assert.match(await page.locator('.selected-row').last().innerText(),/B/);dump('query-dom.txt',await page.locator('body').innerText());
 await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).click();const editor=page.getByRole('region',{name:'模拟记录编辑'});assert.match(await editor.locator('.selected-row').innerText(),/订单编号：B/);
 await page.getByLabel('订单与交期 2 产线编号',{exact:true}).fill('L01');await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.getByText('保存完成，当前输入已更新；原方案及其输入保留。',{exact:true}).waitFor();dump('saved-business.json',f.bytes());await page.reload();await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR016 G01 recheck after correction');
 const state=await f.ok('/state');assert.equal(state.data.orders[1]['产线编号'],'L01');await choose(original.id);const retained=(await f.ok('/plans')).find(p=>p.id===original.id);assert.deepEqual(retained.findings,original.findings);assert.equal(retained.inputSnapshot.orders[1]['产线编号'],'L02');const corrected=await calculate();assert.ok(!corrected.findings.some(f=>f.code==='SCOPE / MULTI_LINE'));assert.ok(corrected.tasks.length);dump('rechecked-plan.json',corrected);await page.screenshot({path:out+'/rechecked.png',fullPage:true});
 });
 await check('query role can navigate both records, cannot edit; forged writes 403 and complete store unchanged',async()=>{
 await open('query');await choose(original.id);const before=f.bytes();await page.locator('.issues-panel .finding').filter({hasText:'SCOPE / MULTI_LINE'}).click();await panel().getByRole('button',{name:'选择关联记录 2',exact:true}).click();assert.equal(await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).isEnabled(),false);await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();assert.match(await page.locator('.selected-row').last().innerText(),/B/);
 const state=await f.ok('/state');assert.equal((await f.call('/inputs',{revision:state.revision,tables:{orders:state.data.orders},role:'supervisor'},'query',{'x-role':'supervisor'})).status,403);assert.equal(f.bytes(),before);dump('query-permissions.txt',await panel().innerText());await panel().screenshot({path:out+'/query-permissions.png'});
 });
 await check('legacy source missing associations opens explicit zero-list contract gap without fabricated rows or write',async()=>{
 const store=JSON.parse(f.bytes()),legacy={...store.plans.find(p=>p.id===original.id),id:'G01-LEGACY-NO-REFS',name:'QA explicit legacy no-reference plan',findings:[{code:'SCOPE / MULTI_LINE',message:'Legacy global finding without record references',taskIds:[]}]};store.plans.push(legacy);fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(store));await open();await choose(legacy.id);const before=f.bytes();await page.locator('.issues-panel .finding').filter({hasText:'Legacy global'}).click();assert.match(await panel().innerText(),/没有可定位的关联记录/);assert.equal(await panel().locator('tbody tr').count(),0);assert.equal(f.bytes(),before);dump('zero-dom.txt',await panel().innerText());await panel().screenshot({path:out+'/zero.png'});
 });
 await check('existing task-linked material finding retains focused task/interval navigation',async()=>{
 await open();const state=await f.ok('/state');await f.ok('/inputs',{revision:state.revision,tables:stockData()});await open();const plan=await calculate();const finding=plan.findings.find(f=>f.taskIds.length);assert.ok(finding);
 await page.locator('.issues-panel .finding').filter({hasText:finding.message}).click();assert.equal(await panel().count(),0);assert.match(await page.getByRole('status',{name:'问题区间详情'}).innerText(),new RegExp(finding.code));
 assert.equal(await page.locator('.fr034-problems button[aria-pressed="true"]').count(),1);dump('task-navigation-dom.txt',await page.getByRole('region',{name:'任务与问题联动核对'}).innerText());dump('task-plan.json',plan);await page.screenshot({path:out+'/task-navigation.png',fullPage:true});
 });
 assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}
finally{dump('browser-report.json',report);await browser?.close();await f?.close();}
