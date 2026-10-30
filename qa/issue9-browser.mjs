import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {stockData,at} from './issue9-fixture.mjs';
const out=process.env.ISSUE9_EVIDENCE||'qa/evidence/issue9-v03';fs.mkdirSync(out,{recursive:true});
const report={checks:[],requests:[],errors:[],identity:'Isolated real Chromium, React/Express/Worker; QA-only synthetic membership actor and auth-runtime alias. Platform SSO and real multi-user sessions NOT_EXECUTED.'};
const dump=(n,x)=>fs.writeFileSync(out+'/'+n,typeof x==='string'?x:JSON.stringify(x,null,2));
let f,browser,page;const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
const lean=p=>p.materialDemands.find(r=>r.materialId==='LEAN');
try{
 f=await fixture(null,{browser:true});await f.ok('/inputs',{revision:0,tables:stockData()});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',async r=>{if(r.url().startsWith(f.url+'/api'))report.requests.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method()});});
 const open=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('Issue9 FR010 explicit simulation acceptance');};
 const inventory=async()=>{await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:/库存批次/}).click();await page.getByLabel('查询时点（工厂 +08:00）').fill('2026-11-02T08:00');};
 const run=async()=>{await page.getByRole('button',{name:'排程工作台',exact:true}).click();const response=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'另开计算（冻结当前输入）',exact:true}).click();const created=await(await response).json();assert.ok(created.id);let r;for(let i=0;i<100;i++){r=(await f.ok('/runs')).find(r=>r.id===created.id);if(r.planId)break;await new Promise(r=>setTimeout(r,100));}assert.ok(r.planId,JSON.stringify(r));await page.getByRole('article',{name:'运行记录 '+r.id}).getByRole('button',{name:'查看结果',exact:true}).click();return (await f.ok('/plans')).find(p=>p.id===r.planId);};
 await open();await inventory();
 await check('React stock query separates book400, reserved100, usable300 and configured simulation guards; API agrees',async()=>{
 const panel=page.locator('[data-inventory-view]');assert.match(await panel.innerText(),/累计模拟耗料/);assert.match(await panel.innerText(),/无 QA 在线审批或放行/);const rows=panel.locator('tbody tr');assert.deepEqual(await rows.first().locator('td').allTextContents(),['LEAN-LOT','LEAN','400','0','400','100','300','300','模拟库','2026-12-31','合格','','','满足本规则质量、效期与预计可用条件']);
 for(let i=5;i<9;i++){const cells=await rows.nth(i).locator('td').allTextContents();assert.equal(cells[6],'0');assert.equal(cells[7],'0');}
 const api=await f.ok('/inventory?asOf='+encodeURIComponent(at));assert.equal(api.rows[0]['当前可用数量'],300);dump('inventory-api.json',api);dump('inventory-dom.txt',await panel.innerText());await page.screenshot({path:out+'/inventory.png',fullPage:true});
 });
 let original;
 await check('React starts actual asynchronous Worker, saved plan retains demand325 allocation300 shortage25 and blocked lots cannot feed',async()=>{
 original=await run();assert.equal(lean(original).quantity,325);assert.equal(lean(original).shortage,25);assert.equal(lean(original).committed,false);assert.deepEqual(lean(original).allocations.map(a=>a.lotId),['LEAN-LOT']);const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'物料需求与批次分配',exact:true})}).last();assert.match(await panel.innerText(),/25 kg/);dump('shortage-plan.json',original);dump('shortage-dom.txt',await panel.innerText());await page.screenshot({path:out+'/shortage.png',fullPage:true});
 });
 await check('React edits simulation stock, saves and reloads; new Worker allocates325 while previous plan remains unchanged',async()=>{
 await inventory();await page.getByLabel('库存批次 1 账面数量',{exact:true}).fill('425');await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.getByText('保存完成，当前输入已更新；原方案及其输入保留。',{exact:true}).waitFor();await page.reload();await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('Issue9 saved-reopen simulation');await inventory();assert.equal(await page.getByLabel('库存批次 1 账面数量',{exact:true}).inputValue(),'425');assert.equal(await page.locator('[data-inventory-view] tbody tr').first().locator('td').nth(6).innerText(),'325');const next=await run();assert.equal(lean(next).shortage,0);assert.equal(lean(next).committed,true);assert.equal(lean(next).allocations[0].quantity,325);assert.equal(lean(next).allocations[0].remaining,0);assert.deepEqual((await f.ok('/plans')).find(p=>p.id===original.id),original);dump('complete-plan.json',next);dump('saved-business.json',f.bytes());await page.screenshot({path:out+'/allocated.png',fullPage:true});
 });
 await check('query role cannot edit/run/export/confirm and forged role writes leave complete store unchanged',async()=>{
 await open('query');await inventory();assert.equal(await page.getByLabel('库存批次 1 质量状态',{exact:true}).isEnabled(),false);assert.equal(await page.getByRole('button',{name:'保存修改',exact:true}).isEnabled(),false);const before=f.bytes(),state=await f.ok('/state');for(const [url,body]of [['/inputs',{revision:state.revision,tables:{inventory:state.data.inventory},role:'supervisor'}],['/runs',{revision:state.revision}],['/plans/'+original.id+'/confirm',{}],['/export',{table:'inventory'}]])assert.equal((await f.call(url,body,'query',{'x-role':'supervisor'})).status,403);assert.equal(f.bytes(),before);dump('query-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/query-disabled.png',fullPage:true});
 });
 assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}
finally{dump('browser-report.json',report);await browser?.close();await f?.close();}
