import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {seed} from '../server/planner.ts';
const out=process.env.G01_EVIDENCE||'/evidence';fs.mkdirSync(out,{recursive:true});const dump=(n,x)=>fs.writeFileSync(path.join(out,n),typeof x==='string'?x:JSON.stringify(x,null,2));
const report={checks:[],requests:[],errors:[],identity:'QA synthetic members/runtime alias only; real React/Express/Chromium; not platform SSO or UAT'};
let f,browser,page;
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
try{
 f=await fixture(null,{browser:true});await f.ok('/inputs',{revision:0,tables:structuredClone(seed)});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browser=browser.version();page=await browser.newPage({viewport:{width:1500,height:1100}});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(f.url+'/api'))report.requests.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method()});});
 const open=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR016 U1 source identity closed loop');};
 const panel=()=>page.getByRole('region',{name:'问题关联记录',exact:true});
 const mutate=fn=>{const d=JSON.parse(f.bytes());fn(d);fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(d));return d;};
 const calc=async(status=422)=>{await page.getByRole('button',{name:'排程工作台',exact:true}).click();const wait=page.waitForResponse(r=>r.url().endsWith('/api/calculate'));await page.getByRole('button',{name:'同步计算全部（无取消）',exact:true}).click();const r=await wait;assert.equal(r.status(),status);return r.json();};
 const click=async code=>{await page.locator('.issues-panel .finding').filter({hasText:code}).first().click();await panel().waitFor();};
 await check('U1 actual master required -> original detail/query -> current unique query -> authorized edit save/reload/recheck; read-only clicks preserve complete bytes',async()=>{
  mutate(d=>d.data.products[0]['产品名称']='');await open();const before=f.bytes(),r=await calc();dump('required-preflight.json',r);await click('MASTER_REQUIRED');
  assert.equal(await panel().locator('tbody tr').count(),1);assert.equal(await panel().locator('tr[aria-selected="true"]').count(),1);assert.match(await panel().innerText(),/待补充/);assert.match(await panel().innerText(),/逻辑记录 1/);
  await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();const query=page.getByRole('region',{name:'模拟数据查询',exact:true});assert.match(await query.innerText(),/该次检查封存输入/);assert.match(await query.getByRole('region',{name:'记录详情',exact:true}).innerText(),/产品名称\s+未填写/);assert.equal(f.bytes(),before);
  await panel().getByRole('button',{name:'查询当前唯一记录',exact:true}).click();assert.match(await query.innerText(),/关联输入显示当前数据/);assert.equal(await query.locator('tr.selected-row').count(),1);
  await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).click();await page.getByLabel('产品与包装规格 1 产品名称',{exact:true}).fill('U1 corrected product');await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.getByText('保存完成，当前输入已更新；原方案及其输入保留。',{exact:true}).waitFor();
  assert.match(await panel().innerText(),/待补充/);assert.match(await panel().innerText(),/当前记录已变化/);dump('required-original-dom.txt',await panel().innerText());await panel().screenshot({path:out+'/required-original.png'});await page.reload();await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('U1 recheck');const corrected=await calc(201);assert.ok(!corrected.findings.some(f=>f.code.includes('MASTER_REQUIRED')));dump('required-recheck.json',corrected);dump('required-saved-business.json',f.bytes());
 });
 await check('U1 master value source preserves numeric raw input and original field; legacy text not used',async()=>{
  mutate(d=>d.data.products[0]['单支净重kg']='not-a-number');await open();const before=f.bytes(),r=await calc();await click('MASTER_VALUE');assert.match(await panel().innerText(),/not-a-number/);assert.equal(await panel().locator('tbody tr').count(),1);assert.equal(f.bytes(),before);dump('value-preflight.json',r);dump('value-dom.txt',await panel().innerText());
  mutate(d=>d.data.products[0]['单支净重kg']='0.04');
 });
 await check('U1 original duplicate group retains both byte-identical occurrences; original second query stays second; delete-one never authorizes inherited identity',async()=>{
  mutate(d=>d.data.products.push({...d.data.products[0]}));await open();const before=f.bytes(),r=await calc();await click('MASTER_DUPLICATE');assert.equal(await panel().locator('tbody tr').count(),2);await panel().getByRole('button',{name:'选择关联记录 2',exact:true}).click();assert.equal(await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).isEnabled(),false);
  await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();const query=page.getByRole('region',{name:'模拟数据查询',exact:true});assert.match(await query.getByRole('region',{name:'记录详情',exact:true}).innerText(),new RegExp('第 '+(r.findings.find(f=>f.code.includes('MASTER_DUPLICATE')).relatedRecords[1].origin.occurrence.index+1)+' 条详情'));assert.equal(f.bytes(),before);
  const s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{products:s.data.products.slice(0,-1)}});const refreshed=page.waitForResponse(r=>r.url().endsWith('/api/operations'));await page.getByRole('button',{name:'刷新数据与记录',exact:true}).click();await refreshed;assert.equal(await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).isEnabled(),false);assert.equal(await panel().getByRole('button',{name:'查询当前唯一记录',exact:true}).isEnabled(),false);assert.equal(await panel().locator('tbody tr').count(),2);dump('duplicate-preflight.json',r);dump('duplicate-after-delete-dom.txt',await panel().innerText());await panel().screenshot({path:out+'/duplicate-after-delete.png'});
 });
 await check('U1 audited reorder/nonkey edit query follows unique original key to new index and retains original empty field',async()=>{
  const s=await f.ok('/state'),products=[...s.data.products,{...s.data.products[0],'产品编号':'SECOND','产品名称':'Second product'}];await f.ok('/inputs',{revision:s.revision,tables:{products}});
  mutate(d=>d.data.products[0]['产品名称']='');await open();const old=await calc();await click('MASTER_REQUIRED');
  const state=await f.ok('/state');await f.ok('/inputs',{revision:state.revision,tables:{products:state.data.products.map((p,i)=>i===0?{...p,'产品名称':'Changed after check'}:p).reverse()}});
  const refresh=page.waitForResponse(r=>r.url().endsWith('/api/operations'));await page.getByRole('button',{name:'刷新数据与记录',exact:true}).click();await refresh;await panel().getByRole('button',{name:'查询当前唯一记录',exact:true}).click();const query=page.getByRole('region',{name:'模拟数据查询',exact:true});assert.match(await query.getByRole('region',{name:'记录详情',exact:true}).innerText(),new RegExp('第 '+state.data.products.length+' 条详情'));assert.match(await query.getByRole('region',{name:'记录详情',exact:true}).innerText(),/Changed after check/);assert.match(await panel().innerText(),/待补充/);dump('reordered-original-preflight.json',old);dump('reordered-dom.txt',await page.locator('body').innerText());await panel().screenshot({path:out+'/reordered-original.png'});
 });
 await check('U1 known delete/rename/reuse is denied using real input audit; original snapshot remains queryable',async()=>{
  const original=await f.ok('/state');const extra={...original.data.products[0],'产品编号':'REUSE','产品名称':'Reusable diagnostic'};
  await f.ok('/inputs',{revision:original.revision,tables:{products:[...original.data.products,extra]}});mutate(d=>d.data.products[d.data.products.length-1]['产品名称']='');await open();const blocked=await calc();await click('MASTER_REQUIRED');
  let state=await f.ok('/state');await f.ok('/inputs',{revision:state.revision,tables:{products:state.data.products.filter(p=>p['产品编号']!=='REUSE')}});state=await f.ok('/state');await f.ok('/inputs',{revision:state.revision,tables:{products:[...state.data.products,extra]}});
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/operations'));await page.getByRole('button',{name:'刷新数据与记录',exact:true}).click();await wait;
  assert.equal(await panel().getByRole('button',{name:'编辑当前关联记录',exact:true}).isEnabled(),false);assert.equal(await panel().getByRole('button',{name:'查询当前唯一记录',exact:true}).isEnabled(),false);await panel().getByRole('button',{name:'查询关联记录',exact:true}).click();assert.match(await page.getByRole('region',{name:'记录详情',exact:true}).innerText(),/REUSE/);assert.match(await panel().innerText(),/待补充/);dump('reuse-preflight.json',blocked);dump('reuse-operations.json',await f.ok('/operations'));dump('reuse-dom.txt',await panel().innerText());
 });
 await check('U1 missing product reference lists only order referrer and never fabricates product; original values remain',async()=>{
  mutate(d=>d.data.orders[1]['产品编号']='ABSENT');await open();const before=f.bytes(),r=await calc();await click('PRODUCT_REFERENCE');assert.equal(await panel().locator('tbody tr').count(),1);assert.match(await panel().innerText(),/订单编号：B/);assert.match(await panel().innerText(),/ABSENT/);assert.equal(f.bytes(),before);dump('reference-preflight.json',r);dump('reference-dom.txt',await panel().innerText());
 });
 await check('U1 query-role forged write denied and complete storage bytes unchanged',async()=>{
  const before=f.bytes(),s=await f.ok('/state');assert.equal((await f.call('/inputs',{revision:s.revision,tables:{products:s.data.products},role:'supervisor'},'query',{'x-role':'supervisor'})).status,403);assert.equal(f.bytes(),before);await open('query');assert.equal(await page.getByRole('button',{name:'同步计算全部（无取消）',exact:true}).isEnabled(),false);dump('query-role-dom.txt',await page.locator('body').innerText());
 });
 assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){dump('failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}
finally{dump('browser-report.json',report);await browser?.close();await f?.close();}
