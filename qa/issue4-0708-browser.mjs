import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';import {masterBatch,masterKeys,allKeys} from './issue4-0708-fixture.mjs';
const out='/evidence/0708-browser';fs.mkdirSync(out,{recursive:true});
const report={checks:[],requests:[],errors:[],identity:'Real React + Express + JSON persistence; isolated Docker; synthetic QA membership actor/runtime alias, no gateway/SSO/UAT claim'};
const dump=(name,value)=>fs.writeFileSync(out+'/'+name,typeof value==='string'?value:JSON.stringify(value,null,2));
let f,browser,page;const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
try{
 f=await fixture(null,{browser:true});await f.ok('/calculate',{revision:0});const initial=f.bytes();dump('initial-business.json',initial);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1450,height:1050}});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',async r=>{if(r.url().startsWith(f.url+'/api')){const e={path:new URL(r.url()).pathname,method:r.request().method(),status:r.status(),request:r.request().postData()};report.requests.push(e);e.response=await r.text().catch(()=>'<unavailable>');}});
 const open=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('Issue4 original 07/08 limited batch completion');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();};
 await open();const panel=page.locator('[data-csv-batch]'),confirm=panel.getByRole('button',{name:'确认整批导入',exact:true});
 const upload=async(files)=>{await panel.getByLabel('选择批量 CSV',{exact:true}).setInputFiles(files.map(f=>({name:f.name,mimeType:'text/csv',buffer:Buffer.from(f.text)})));await panel.getByRole('status').filter({hasText:'已读取文件'}).waitFor();await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();await panel.getByText('预览结果：',{exact:false}).waitFor();};
 const inspectDetails=async()=>{for(const detail of await panel.locator(':scope > details').all())await detail.locator('summary').first().click();};
 await check('07 and 08 existing single-table React previews retain original fields and cancellation writes nothing',async()=>{
  for(const [key,label] of [['products','产品与包装规格'],['materials','物料主数据']]){
   await page.locator('.data-tabs').getByRole('button',{name:new RegExp(label)}).click();
   const single=page.locator('[data-csv-single]'),file=filesOf(masterBatch(),[key])[0];
   await single.getByLabel('导入单表 CSV',{exact:true}).setInputFiles({name:file.name,mimeType:'text/csv',buffer:Buffer.from(file.text)});
   await single.getByText('校验通过；确认后才保存。',{exact:false}).waitFor();
   assert.equal(await single.getByRole('button',{name:'确认单表导入',exact:true}).isEnabled(),true);assert.equal(f.bytes(),initial);
   dump('single-'+key+'-dom.txt',await single.innerText());
   await single.getByRole('button',{name:'取消 / 关闭预览',exact:true}).click();assert.equal(f.bytes(),initial);
  }
 });
 const four=masterBatch();
 await check('07+08 original templates preview full columns, source files, physical lines, old/new contents; cancel and refresh write zero bytes',async()=>{
  await upload(filesOf(four,masterKeys).reverse());assert.equal(await confirm.isEnabled(),true);await inspectDetails();
  const product=panel.locator(':scope > details').filter({has:page.locator('summary').filter({hasText:'07_产品与包装规格.csv'})});
  const materials=panel.locator(':scope > details').filter({has:page.locator('summary').filter({hasText:'08_物料主数据.csv'})});
  for(const field of ['产品编号','产品名称','单支净重kg','每袋支数','总收率','模拟交付等待分钟'])assert.ok((await product.innerText()).includes(field));
  for(const field of ['物料编号','物料名称','单位','类别'])assert.ok((await materials.innerText()).includes(field));
  assert.match(await product.innerText(),/当前 2 条 → 文件 3 条/);assert.match(await materials.innerText(),/当前 5 条 → 文件 6 条/);
  assert.deepEqual(await materials.locator(':scope > .table-wrap tbody tr td:first-child').allTextContents(),['2','4','5','6','7','8']);
  await product.getByText('查看替换前内容（2 条）',{exact:true}).click();assert.match(await product.innerText(),/模拟火腿肠40g/);assert.match(await product.innerText(),/合成产品第一行/);assert.match(await materials.innerText(),/第二物理行/);assert.equal(f.bytes(),initial);
  dump('four-preview-dom.txt',await panel.innerText());await page.screenshot({path:out+'/four-preview.png',fullPage:true});
  await panel.getByRole('button',{name:'取消 / 关闭批量预览',exact:true}).click();assert.equal(await confirm.isEnabled(),false);assert.equal(f.bytes(),initial);
  await upload(filesOf(four,masterKeys));await page.reload();await page.getByText('当前权限：planner',{exact:false}).waitFor();assert.equal(f.bytes(),initial);await open();
 });
 const eleven=masterBatch();
 await check('React rejects zero net weight, negative yield and blank material unit with whole-store byte equality',async()=>{
  for(const [table,field,value,file] of [['products','单支净重kg','0','07_产品与包装规格.csv'],['products','总收率','-1','07_产品与包装规格.csv'],['materials','单位','','08_物料主数据.csv']]){
   const bad=structuredClone(eleven);bad[table][0][field]=value;await upload(filesOf(bad,allKeys));assert.equal(await confirm.isEnabled(),false);assert.equal(f.bytes(),initial);const text=await panel.getByRole('list',{name:'批量导入问题'}).innerText();assert.ok(text.includes(file)&&text.includes(field),text);dump('rejected-'+table+'-'+field+'.txt',await panel.innerText());
  }
 });
 await check('mixed bad eleven-file batch reports original materials physical line4 field/reason, keyboard location, complete zero writes then correction and re-preview',async()=>{
  const bad=structuredClone(eleven);bad.materials[1]['单位']='';await upload(filesOf(bad,allKeys).reverse());assert.equal(await confirm.isEnabled(),false);
  const error=panel.getByRole('button',{name:/定位 08_物料主数据.csv 第4行 · 单位：.*缺少单位/});await error.focus();await page.keyboard.press('Enter');
  const editor=panel.getByRole('textbox',{name:'批量 CSV 修正原文',exact:true});const selection=await editor.evaluate(e=>({text:e.value.slice(e.selectionStart,e.selectionEnd),focused:document.activeElement===e}));assert.equal(selection.focused,true);assert.match(selection.text,/模拟背膘/);assert.equal(f.bytes(),initial);dump('invalid-dom.txt',await panel.innerText());dump('invalid-selection.json',selection);await page.screenshot({path:out+'/invalid-materials.png',fullPage:true});
  await editor.fill((await editor.inputValue()).replace('"FAT","模拟背膘",""','"FAT","模拟背膘","kg"'));assert.equal(await confirm.isEnabled(),false);
  await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();await panel.getByText('检查通过，尚未导入。',{exact:true}).waitFor();assert.equal(await confirm.isEnabled(),true);assert.equal(f.bytes(),initial);
 });
 await check('eleven-file confirm persists one atomic revision, all original master fields, one audit batch; real React reload/reopen shows products and materials; identical reimport adds nothing',async()=>{
  const r=page.waitForResponse(r=>r.url().endsWith('/api/imports/commit'));await confirm.click();assert.equal((await r).status(),200);await panel.getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();
  const saved=await f.ok('/state');assert.equal(saved.revision,1);assert.equal(saved.data.products[0]['每袋支数'],'12');assert.equal(saved.data.products[0]['单支净重kg'],'0.05');assert.equal(saved.data.materials[1]['单位'],'kg');const disk=JSON.parse(f.bytes());assert.deepEqual(disk.plans,JSON.parse(initial).plans);assert.equal(new Set(disk.records.filter(r=>r.action==='import').map(r=>r.batchId)).size,1);dump('saved-business.json',f.bytes());
  await open();await page.locator('.data-tabs').getByRole('button',{name:/产品与包装规格/}).click();const grid=page.locator('.table-wrap').filter({has:page.locator('th').filter({hasText:'产品编号'})});assert.ok((await page.locator('body').innerText()).includes('SYN-P07'));dump('reopened-product-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/reopened-product.png',fullPage:true});
  await page.locator('.data-tabs').getByRole('button',{name:/物料主数据/}).click();assert.match(await page.locator('body').innerText(),/SYN-M08/);dump('reopened-materials-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/reopened-materials.png',fullPage:true});
  const before=f.bytes();await upload(filesOf(eleven,allKeys));await confirm.click();await panel.getByText('重复导入内容相同，没有新增数据或操作记录。',{exact:true}).waitFor();assert.equal(f.bytes(),before);dump('reopened-state.json',await f.ok('/state'));
 });
 await check('query role cannot import; narrow viewport renders actual field preview without runtime errors',async()=>{
  await page.setViewportSize({width:640,height:900});await upload(filesOf(eleven,['products','materials']));await inspectDetails();dump('narrow-dom.txt',await panel.innerText());await page.screenshot({path:out+'/narrow-preview.png',fullPage:true});const before=f.bytes();await open('query');assert.equal(await panel.getByLabel('选择批量 CSV',{exact:true}).isEnabled(),false);assert.equal(await confirm.isEnabled(),false);assert.equal(f.bytes(),before);assert.deepEqual(report.errors,[]);
 });
 report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}
finally{dump('report.json',report);await browser?.close();await f?.close();}
