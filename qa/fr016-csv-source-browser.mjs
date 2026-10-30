import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';
import {sourceFile,invalidProducts,duplicateRoutes} from './fr016-csv-source-fixture.mjs';
import {seed} from '../server/planner.ts';
const out=process.env.EVIDENCE_DIR;fs.mkdirSync(out,{recursive:true});
const dump=(n,x)=>fs.writeFileSync(path.join(out,n),typeof x==='string'?x:JSON.stringify(x,null,2));
const report={checks:[],requests:[],pageerrors:[]};let f,browser,page;
const check=async(id,fn)=>{await fn();report.checks.push({id,result:'PASS'});console.log('PASS '+id);};
try{
 f=await fixture(null,{browser:true});await f.ok('/calculate',{revision:0});const initial=f.bytes();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1480,height:1100}});page.setDefaultTimeout(15000);report.browserVersion=browser.version();
 page.on('pageerror',e=>report.pageerrors.push(e.message));page.on('response',async r=>{if(r.url().includes('/api/'))report.requests.push({path:new URL(r.url()).pathname,status:r.status(),request:r.request().postData(),body:await r.text().catch(()=>null)});});
 const open=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR016 CSV source self-test');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();};
 const panel=()=>page.getByRole('region',{name:'问题关联记录',exact:true});
 const batch=()=>page.locator('[data-csv-batch]');
 const upload=async file=>{await batch().getByLabel('选择批量 CSV',{exact:true}).setInputFiles({name:file.name,mimeType:'text/csv',buffer:Buffer.from(file.text)});await batch().getByText('已读取文件，请预览。',{exact:true}).waitFor();await batch().getByRole('button',{name:'预览并检查整批',exact:true}).click();await batch().getByText('预览结果：',{exact:false}).waitFor();};
 const selection=()=>page.locator('[aria-label="批量 CSV 修正原文"]').evaluate(e=>({selected:e.value.slice(e.selectionStart,e.selectionEnd),focused:document.activeElement===e}));
 await check('B01 batch physical9 problem opens original record, SHA/field/reason and read-only candidate query',async()=>{
  await open();const {file}=invalidProducts();await upload(file);assert.ok(await batch().getByRole('button',{name:'确认整批导入',exact:true}).isDisabled());
  await batch().getByRole('button',{name:/定位 .* 第9行 · 总收率/}).first().click();await panel().waitFor();
  assert.match(await panel().innerText(),/物理行 9 · 字段 总收率/);assert.ok((await panel().innerText()).includes(createHash('sha256').update(file.text).digest('hex')));assert.equal(await panel().locator('tbody tr').first().getAttribute('aria-selected'),'true');
  assert.ok(await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).isDisabled());assert.ok(await panel().getByRole('button',{name:'查询当前唯一记录',exact:true}).isDisabled());
  await page.waitForFunction(()=>{const e=document.querySelector('[aria-label="批量 CSV 修正原文"]');return e?.value.slice(e.selectionStart,e.selectionEnd).includes('HC60')});dump('B01-selection.json',await selection());dump('B01-panel.txt',await panel().innerText());await panel().screenshot({path:path.join(out,'B01.png')});
  await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();const query=page.getByRole('region',{name:'模拟数据查询',exact:true});await query.waitFor();assert.match(await query.innerText(),/第 2 条详情/);assert.match(await query.innerText(),/1.01/);dump('B01-query.txt',await query.innerText());assert.equal(f.bytes(),initial);
 });
 await check('B02 single-table duplicate problem lists exact two source occurrences, highlights first and queries second',async()=>{
  await open();await page.locator('.data-tabs button').filter({hasText:'工艺路线'}).click();const {file}=duplicateRoutes();file.name='客户原路线.csv';const single=page.locator('[data-csv-single]');
  await single.getByLabel('导入单表 CSV',{exact:true}).setInputFiles({name:file.name,mimeType:'text/csv',buffer:Buffer.from(file.text)});
  const problem=single.getByRole('button',{name:/工艺路线.*重复|唯一键重复/}).first();await problem.waitFor();await problem.click();await panel().waitFor();assert.equal(await panel().locator('tbody tr').count(),2);assert.equal(await panel().locator('tbody tr').first().getAttribute('aria-selected'),'true');assert.match(await panel().innerText(),/客户原路线.csv · 物理行 2/);
  await panel().getByRole('button',{name:'选择关联记录 2',exact:true}).click();assert.match(await panel().innerText(),/客户原路线.csv · 物理行 7/);dump('B02-panel.txt',await panel().innerText());await panel().screenshot({path:path.join(out,'B02.png')});
  await page.getByRole('button',{name:'刷新数据与记录',exact:true}).click();assert.match(await panel().innerText(),/物理行 7/);await problem.click();assert.equal(await panel().locator('tbody tr').first().getAttribute('aria-selected'),'true');
  await panel().getByRole('button',{name:'选择关联记录 2',exact:true}).click();await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();const query=page.getByRole('region',{name:'模拟数据查询',exact:true});assert.match(await query.innerText(),/第 5 条详情/);dump('B02-query.txt',await query.innerText());assert.equal(f.bytes(),initial);
 });
 await check('B03 parser empty value displays pending; header format error has explicit gap and no invented query',async()=>{
  await open();const rows=structuredClone(seed.times);rows[0]['固定分钟']='';await upload(sourceFile('times',rows,{mixed:true,blank:true}));await batch().getByRole('button',{name:/第4行 · 固定分钟/}).click();await panel().waitFor();assert.match(await panel().innerText(),/待补充/);assert.match(await panel().innerText(),/物理行 4/);dump('B03-empty.txt',await panel().innerText());
  await upload({name:invalidProducts().file.name,text:'坏表头\r\n数据\r\n'});await batch().getByRole('list',{name:'批量导入问题'}).getByRole('button').first().click();assert.equal(await panel().getByRole('button',{name:'查询关联记录',exact:true}).count(),0);assert.match(await panel().innerText(),/未形成可验证的关联记录/);dump('B03-gap.txt',await panel().innerText());assert.equal(f.bytes(),initial);
 });
 await check('B04 exact CSV correction/re-preview/commit and full reload retain source bytes; old plans stay frozen',async()=>{
  await open();const {file,rows}=invalidProducts();await upload(file);await batch().getByRole('button',{name:/定位 .* 第9行 · 总收率/}).first().click();
  const editor=batch().getByRole('textbox',{name:'批量 CSV 修正原文',exact:true});rows[1]['总收率']='.8';const valid=sourceFile('products',rows,{mixed:true,blank:true});
  // Use real keyboard insertion on the invalid value; untouched mixed newlines
  // must remain exact through the existing CSV draft preservation path.
  const offset=await editor.evaluate(e=>e.value.indexOf('"1.01"')+1);await editor.evaluate((e,start)=>{e.focus();e.setSelectionRange(start,start+4)},offset);await page.keyboard.insertText('.8');
  await batch().getByRole('button',{name:'预览并检查整批',exact:true}).click();await batch().getByText('检查通过，尚未导入。',{exact:true}).waitFor();await batch().getByRole('button',{name:'确认整批导入',exact:true}).click();await batch().getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();await open();
  const after=JSON.parse(f.bytes());assert.equal(after.csvSources.products.originalText,valid.text);assert.equal(after.csvSources.products.sha256,createHash('sha256').update(valid.text).digest('hex'));assert.deepEqual(after.plans,JSON.parse(initial).plans);assert.deepEqual(after.runs,JSON.parse(initial).runs);dump('B04-persisted.json',after);
 });
 await check('B05 read-only role disables both CSV inputs and API mutation, preserving storage bytes',async()=>{
  const before=f.bytes();await open('query');assert.ok(await batch().getByLabel('选择批量 CSV',{exact:true}).isDisabled());assert.ok(await page.locator('[data-csv-single]').getByLabel('导入单表 CSV',{exact:true}).isDisabled());const r=await f.call('/imports/preview',{revision:1,files:[invalidProducts().file]},'query');assert.equal(r.status,403);assert.equal(f.bytes(),before);dump('B05-query.txt',await page.locator('body').innerText());
 });
 assert.deepEqual(report.pageerrors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure.txt',await page.locator('body').innerText());await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}throw e;}
finally{dump('report.json',report);await browser?.close();await f?.close();}
