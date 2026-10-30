import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';import {calendarBatch,fourKeys,nineKeys} from './issue4-0204-fixture.mjs';
const out='/evidence/0204-browser';fs.mkdirSync(out,{recursive:true});
const report={checks:[],requests:[],errors:[],identity:'Real React + Express + JSON persistence; isolated Docker; synthetic QA membership actor/runtime alias, no gateway/SSO/UAT claim'};
const dump=(name,value)=>fs.writeFileSync(out+'/'+name,typeof value==='string'?value:JSON.stringify(value,null,2));
let f,browser,page;const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
try{
 f=await fixture(null,{browser:true});await f.ok('/calculate',{revision:0});const initial=f.bytes();dump('initial-business.json',initial);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1450,height:1050}});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',async r=>{if(r.url().startsWith(f.url+'/api')){const e={path:new URL(r.url()).pathname,method:r.request().method(),status:r.status(),request:r.request().postData()};report.requests.push(e);e.response=await r.text().catch(()=>'<unavailable>');}});
 const open=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('Issue4 original 02/04 limited batch completion');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();};
 await open();const panel=page.locator('[data-csv-batch]'),confirm=panel.getByRole('button',{name:'确认整批导入',exact:true});
 const upload=async(files)=>{await panel.getByLabel('选择批量 CSV',{exact:true}).setInputFiles(files.map(f=>({name:f.name,mimeType:'text/csv',buffer:Buffer.from(f.text)})));await panel.getByRole('status').filter({hasText:'已读取文件'}).waitFor();await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();await panel.getByText('预览结果：',{exact:false}).waitFor();};
 const inspectDetails=async()=>{for(const detail of await panel.locator(':scope > details').all())await detail.locator('summary').first().click();};
 const four=calendarBatch();
 await check('01+02+03+04 original templates preview full columns, source files, physical lines, old/new contents; cancel and refresh write zero bytes',async()=>{
  await upload(filesOf(four,fourKeys).reverse());assert.equal(await confirm.isEnabled(),true);await inspectDetails();
  const calendar=panel.locator(':scope > details').filter({has:page.locator('summary').filter({hasText:'02_工厂工作日历.csv'})});
  const downtime=panel.locator(':scope > details').filter({has:page.locator('summary').filter({hasText:'04_设备停机与例外日历.csv'})});
  for(const field of ['日历编号','工厂编号','起始分钟','结束分钟','是否工作','说明'])assert.ok((await calendar.innerText()).includes(field));
  for(const field of ['设备编号','起始分钟','结束分钟','原因'])assert.ok((await downtime.innerText()).includes(field));
  assert.match(await calendar.innerText(),/当前 1 条 → 文件 1 条/);assert.match(await downtime.innerText(),/当前 0 条 → 文件 2 条/);
  assert.deepEqual(await downtime.locator(':scope > .table-wrap tbody tr td:first-child').allTextContents(),['2','4']);
  await calendar.getByText('查看替换前内容（1 条）',{exact:true}).click();assert.match(await calendar.innerText(),/FC01/);assert.match(await calendar.innerText(),/BATCH-C02/);assert.match(await downtime.innerText(),/第二物理行/);assert.equal(f.bytes(),initial);
  dump('four-preview-dom.txt',await panel.innerText());await page.screenshot({path:out+'/four-preview.png',fullPage:true});
  await panel.getByRole('button',{name:'取消 / 关闭批量预览',exact:true}).click();assert.equal(await confirm.isEnabled(),false);assert.equal(f.bytes(),initial);
  await upload(filesOf(four,fourKeys));await page.reload();await page.getByText('当前权限：planner',{exact:false}).waitFor();assert.equal(f.bytes(),initial);await open();
 });
 const nine=calendarBatch({newReferences:true});
 await check('React rejects calendar invalid end/wrong factory and downtime wrong machine with whole-store byte equality',async()=>{
  for(const [table,field,value,file] of [['calendars','结束分钟','0','02_工厂工作日历.csv'],['calendars','工厂编号','MISSING','02_工厂工作日历.csv'],['downtime','设备编号','MISSING','04_设备停机与例外日历.csv']]){
   const bad=structuredClone(nine);bad[table][0][field]=value;await upload(filesOf(bad,nineKeys));assert.equal(await confirm.isEnabled(),false);assert.equal(f.bytes(),initial);const text=await panel.getByRole('list',{name:'批量导入问题'}).innerText();assert.ok(text.includes(file)&&text.includes(field),text);dump('rejected-'+table+'-'+field+'.txt',await panel.innerText());
  }
 });
 await check('mixed bad nine-file batch reports original downtime physical line4 field/reason, keyboard location, complete zero writes then correction and re-preview',async()=>{
  const bad=structuredClone(nine);bad.downtime[1]['结束分钟']='90';await upload(filesOf(bad,nineKeys).reverse());assert.equal(await confirm.isEnabled(),false);
  const error=panel.getByRole('button',{name:/定位 04_设备停机与例外日历.csv 第4行 · 结束分钟：结束分钟须大于起始分钟/});await error.focus();await page.keyboard.press('Enter');
  const editor=panel.getByRole('textbox',{name:'批量 CSV 修正原文',exact:true});const selection=await editor.evaluate(e=>({text:e.value.slice(e.selectionStart,e.selectionEnd),focused:document.activeElement===e}));assert.equal(selection.focused,true);assert.match(selection.text,/第二段/);assert.equal(f.bytes(),initial);dump('invalid-dom.txt',await panel.innerText());dump('invalid-selection.json',selection);await page.screenshot({path:out+'/invalid-downtime.png',fullPage:true});
  await editor.fill((await editor.inputValue()).replace('"90","90"','"90","120"'));assert.equal(await confirm.isEnabled(),false);
  await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();await panel.getByText('检查通过，尚未导入。',{exact:true}).waitFor();assert.equal(await confirm.isEnabled(),true);assert.equal(f.bytes(),initial);
 });
 await check('nine-file confirm persists one atomic revision, all new cross-file references, one audit batch; real React reload/reopen shows calendars and downtime; identical reimport adds nothing',async()=>{
  const r=page.waitForResponse(r=>r.url().endsWith('/api/imports/commit'));await confirm.click();assert.equal((await r).status(),200);await panel.getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();
  const saved=await f.ok('/state');assert.equal(saved.revision,1);assert.equal(saved.data.calendars[0]['工厂编号'],'BATCH-F01');assert.equal(saved.data.machines[0]['日历编号'],'BATCH-C02');assert.equal(saved.data.downtime[1]['结束分钟'],'120');const disk=JSON.parse(f.bytes());assert.deepEqual(disk.plans,JSON.parse(initial).plans);assert.equal(new Set(disk.records.filter(r=>r.action==='import').map(r=>r.batchId)).size,1);dump('saved-business.json',f.bytes());
  await open();await page.locator('.data-tabs').getByRole('button',{name:/工厂工作日历/}).click();const grid=page.locator('.table-wrap').filter({has:page.locator('th').filter({hasText:'日历编号'})});assert.ok((await page.locator('body').innerText()).includes('BATCH-C02'));dump('reopened-calendar-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/reopened-calendar.png',fullPage:true});
  await page.locator('.data-tabs').getByRole('button',{name:/设备停机例外/}).click();assert.match(await page.locator('body').innerText(),/BATCH-M04/);dump('reopened-downtime-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/reopened-downtime.png',fullPage:true});
  const before=f.bytes();await upload(filesOf(nine,nineKeys));await confirm.click();await panel.getByText('重复导入内容相同，没有新增数据或操作记录。',{exact:true}).waitFor();assert.equal(f.bytes(),before);dump('reopened-state.json',await f.ok('/state'));
 });
 await check('query role cannot import; narrow viewport renders actual field preview without runtime errors',async()=>{
  await page.setViewportSize({width:640,height:900});await upload(filesOf(nine,['calendars','downtime']));await inspectDetails();dump('narrow-dom.txt',await panel.innerText());await page.screenshot({path:out+'/narrow-preview.png',fullPage:true});const before=f.bytes();await open('query');assert.equal(await panel.getByLabel('选择批量 CSV',{exact:true}).isEnabled(),false);assert.equal(await confirm.isEnabled(),false);assert.equal(f.bytes(),before);assert.deepEqual(report.errors,[]);
 });
 report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}
finally{dump('report.json',report);await browser?.close();await f?.close();}
