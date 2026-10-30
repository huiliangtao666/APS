import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {defs} from '../server/planner.ts';import {recordKeys} from '../server/input-validation.mjs';import {filterOptions,filterRows,related,queryData} from '../src/lib/data-query.mjs';
import {fixture} from './fr027-fixture.mjs';import {categoryInputs,edits} from './fr014015-fixture.mjs';
const out='/evidence',f=await fixture(null,{browser:true});
const sourceManifest=JSON.parse(fs.readFileSync('qa/fr014015-source-sha256.json'));
const report={sourceHashes:sourceManifest.files,identity:'Actual React App/Express/membership; explicit synthetic QA actor and runtime alias. No real gateway/SSO/UAT claim.',checks:[],categories:[],requests:[],errors:[]};let browser,page;
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
const capture=()=>f.bytes();
try{
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(f.url+'/api')&&r.request().method()==='POST')report.requests.push({path:r.url().replace(f.url,''),status:r.status(),request:r.request().postDataJSON()});});
 const nav=async(name)=>page.getByRole('button',{name,exact:true}).click();
 const load=async(role='planner')=>{await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR014/015 可重复有限验收');};
 const editor=page.getByRole('region',{name:'模拟记录编辑',exact:true});
 const category=async(key)=>{await nav('数据与 CSV');await page.locator('.data-tabs').getByRole('button',{name:defs.find(d=>d.key===key).label,exact:false}).click();};
 const field=(key,n,name)=>editor.getByRole('textbox',{name:`${defs.find(d=>d.key===key).label} ${n} ${name}`,exact:true});
 async function save(expected=200){const wait=page.waitForResponse(r=>r.url().endsWith('/api/inputs')&&r.request().method()==='POST');await editor.getByRole('button',{name:'保存修改',exact:true}).click();const r=await wait;assert.equal(r.status(),expected,await r.text());if(expected===200)await editor.getByRole('status').filter({hasText:/保存完成|内容相同/}).waitFor();else await editor.getByRole('alert').waitFor();return r.json();}
 const cancel=async()=>editor.getByRole('button',{name:'取消修改',exact:true}).click();
 await load();
 let confirmed,originalPlan,originalInputs;
 await check('actual UI calculate, independent verify, planner submit and supervisor confirm (no confirmed fixtures)',async()=>{
  await nav('同步计算全部（无取消）');const plans=await f.ok('/plans');originalPlan=plans[0];
  await page.getByLabel('主管确认方案',{exact:true}).selectOption(originalPlan.id);await nav('独立复核所选方案');await page.getByText('本次已有支持范围检查通过。',{exact:true}).waitFor();
  await page.getByLabel('已核对规则、未排清单、条件供给及调整原因；接受列明的检查范围',{exact:true}).check();await nav('提交主管');await page.getByRole('heading',{name:'待主管确认',exact:true}).waitFor();
  await load('supervisor');await page.getByLabel('主管确认方案',{exact:true}).selectOption(originalPlan.id);await page.getByLabel('已核对规则、未排清单、条件供给及调整原因；接受列明的检查范围',{exact:true}).check();await nav('确认已排部分 / 全部');await page.getByRole('heading',{name:'已确认',exact:true}).waitFor();
  confirmed=(await f.ok('/plans/'+originalPlan.id+'/review')).confirmation;assert.equal(confirmed.actor,'test#supervisor');originalPlan=(await f.ok('/plans')).find(p=>p.id===originalPlan.id);originalInputs=await f.ok('/plans/'+originalPlan.id+'/inputs');
  report.confirmation={id:confirmed.id,planId:originalPlan.id,inputVersionId:originalInputs.id,actor:confirmed.actor};fs.writeFileSync(out+'/fr014015-original-confirmation.json',JSON.stringify(confirmed,null,2));await page.screenshot({path:out+'/fr014015-confirmed.png',fullPage:true});
 });
 const history=async()=>{assert.deepEqual(await f.ok('/confirmations/'+confirmed.id),confirmed);assert.deepEqual((await f.ok('/plans')).find(p=>p.id===originalPlan.id),originalPlan);assert.deepEqual(await f.ok('/plans/'+originalPlan.id+'/inputs'),originalInputs);};
 await f.ok('/inputs',{revision:0,tables:categoryInputs(false)});await load();
 // Every editable configuration category gets a real save and a rejected copy.
 for(const [key,[name,value]] of Object.entries(edits)){
  const evidence={key,label:defs.find(d=>d.key===key).label,operations:{}};report.categories.push(evidence);await category(key);await field(key,1,name).fill(value);await save();assert.equal((await f.ok('/state')).data[key][0][name],value);evidence.operations.edit='browser save200, persisted value checked';
  const bytes=capture();await editor.getByLabel('选择第1行',{exact:true}).check();await editor.getByRole('button',{name:'复制选中',exact:true}).click();await save(400);assert.equal(capture(),bytes);evidence.operations.copyDuplicate='browser400, exact persisted state/plans/audit unchanged';await cancel();await history();
 }
 await check('20 configuration categories: real edit/save and duplicate-copy rejection preserve confirmed plan/input/confirmation bytes',async()=>assert.equal(report.categories.length,20));
 // Positive add/copy/delete across ordinary, resource and material categories.
 for(const key of ['materials','tools','inventory']){
  await category(key);const rows=(await f.ok('/state')).data[key],n=rows.length+1,id=recordKeys[key][0],original=rows[0];await editor.getByLabel('选择第1行',{exact:true}).check();await editor.getByRole('button',{name:'复制选中',exact:true}).click();await field(key,n,id).fill('COPY-'+key);await save();assert.equal((await f.ok('/state')).data[key].length,n);
  await editor.getByLabel('选择第'+n+'行',{exact:true}).check();await editor.getByRole('button',{name:'删除选中',exact:true}).click();await save();assert.equal((await f.ok('/state')).data[key].length,n-1);
  await editor.getByRole('button',{name:'新增一行',exact:true}).click();for(const [name,value] of Object.entries(original))if(value)await field(key,n,name).fill(name===id?'ADD-'+key:value);await save();await editor.getByLabel('选择第'+n+'行',{exact:true}).check();await editor.getByRole('button',{name:'删除选中',exact:true}).click();await save();report.categories.find(e=>e.key===key).operations.addCopyDelete='browser add200/copy with new identity200/allowed delete200; row counts and original confirmation checked';await history();
 }
 await check('material master, tool and inventory positive add/copy/allowed delete use actual main editor',async()=>{});
 await check('allowed current deletion of an original confirmed-plan machine creates a new revision, preserving the original machine and task',async()=>{
  assert.ok(originalPlan.tasks.some(t=>t.machine==='MIX01'));await category('machines');const state=await f.ok('/state'),index=state.data.machines.findIndex(r=>r['设备编号']==='MIX01');assert.ok(index>=0);assert.ok(!state.data.dependencies.some(r=>r['资源类型']==='设备'&&r['资源编号']==='MIX01'));
  await editor.getByLabel('选择第'+(index+1)+'行',{exact:true}).check();await editor.getByRole('button',{name:'删除选中',exact:true}).click();await save();const after=await f.ok('/state');assert.equal(after.revision,state.revision+1);assert.ok(!after.data.machines.some(r=>r['设备编号']==='MIX01'));assert.ok((await f.ok('/plans/'+originalPlan.id+'/inputs')).data.machines.some(r=>r['设备编号']==='MIX01'));await history();report.categories.find(e=>e.key==='machines').operations.allowedDelete='browser200 current MIX01 deletion in new revision; actual confirmed task and original input machine retained byte-for-byte';
 });
 // Additional scenarios and the complete 24-category query matrix are below.
 await check('cross-category invalid save is atomic; keyboard error link switches table and focuses exact source field',async()=>{
  await category('machines');await field('machines',1,'设备名称').fill('');await page.locator('.data-tabs').getByRole('button',{name:/订单与交期/}).click();await field('orders',1,'优先顺序').fill('9');const before=capture();await save(400);assert.equal(capture(),before);
  const link=editor.getByRole('list',{name:'保存问题定位'}).getByRole('button',{name:/03_设备资源配置.csv.*第2行.*设备名称/});await link.focus();await page.keyboard.press('Enter');await field('machines',1,'设备名称').waitFor();assert.ok(await field('machines',1,'设备名称').evaluate(e=>document.activeElement===e));await field('machines',1,'设备名称').fill('模拟修正设备');await save();assert.equal((await f.ok('/state')).data.orders[0]['优先顺序'],'9');await history();await editor.screenshot({path:out+'/fr014015-corrected-editor.png'});
 });
 await check('browser reference, unit, impossible-date guards reject all writes; no-op saves keep persisted bytes unchanged',async()=>{
  for(const [key,name,value] of [['inventory','物料编号','NO-SUCH-MATERIAL'],['orders','数量单位','pcs'],['supplies','预计到达时间','2026-02-30T08:00:00+08:00']]){await category(key);const before=capture();await field(key,1,name).fill(value);await save(400);assert.equal(capture(),before);await cancel();}
  await category('orders');const same=await field('orders',1,'优先顺序').inputValue(),before=capture();await field('orders',1,'优先顺序').fill(same+'0');await field('orders',1,'优先顺序').fill(same);const result=await save();assert.equal(result.unchanged,true);assert.equal(capture(),before);
 });
 await check('browser referenced deletion is rejected; stale draft cannot overwrite a concurrent saved revision',async()=>{
  await category('materials');const before=capture();await editor.getByLabel('选择第1行',{exact:true}).check();await editor.getByRole('button',{name:'删除选中',exact:true}).click();await save(400);assert.equal(capture(),before);await cancel();
  await category('orders');await field('orders',1,'优先顺序').fill('10');const state=await f.ok('/state'),tools=structuredClone(state.data.tools);tools[0]['说明']='另一会话已修改';await f.ok('/inputs',{revision:state.revision,tables:{tools}});const concurrent=capture();await save(409);assert.equal(capture(),concurrent);await nav('刷新数据与记录');await editor.getByText(/服务端输入已变化/).waitFor();assert.equal(await editor.getByRole('button',{name:'保存修改',exact:true}).isEnabled(),false);await cancel();await history();
 });
 // Transition to real execution inputs through the public save validator. The
 // stageEvents code, not this runner, generates the persisted event effects.
 let state=await f.ok('/state');await f.ok('/inputs',{revision:state.revision,tables:categoryInputs(true)});await load();
 for(const [key,name,value,status] of [['executionFacts','工序完成数量','41',200],['executionMaterials','累计已用数量','41',200],['executionSources','来源说明','试图改写来源',409],['simulationEvents','原因','试图改写事件',409]]){
  const evidence={key,label:defs.find(d=>d.key===key).label,operations:{}};report.categories.push(evidence);await category(key);const before=capture();await field(key,1,name).fill(value);await save(status);if(status===409){assert.equal(capture(),before);await cancel();}else assert.equal((await f.ok('/state')).data[key][0][name],value);evidence.operations.edit=status===200?'browser cumulative advance200':'browser protected original overwrite409, persisted bytes unchanged';
  const saved=capture();await editor.getByLabel('选择第1行',{exact:true}).check();await editor.getByRole('button',{name:'删除选中',exact:true}).click();await save(409);assert.equal(capture(),saved);await cancel();evidence.operations.delete='browser protected execution/source/event deletion409, persisted bytes unchanged';await history();
 }
 await check('nontrivial cumulative execution updates and immutable sources/events: actual edit/delete guards and historical bytes',async()=>{});
 await check('execution references cannot be rebased by changing machine/master data; structured source mapping visible without raw JSON',async()=>{
  await category('machines');const before=capture();await field('machines',1,'设备名称').fill('试图重基');await save(409);assert.equal(capture(),before);await cancel();
  await category('executionSources');assert.ok(await editor.getByRole('textbox',{name:/原始分配 第1项 批次编号/}).isVisible());assert.equal(await field('executionSources',1,'原始分配JSON').isVisible(),false);
  await category('rules');const structured=editor.getByRole('textbox',{name:/排程规则 1 参数 .*|排程规则 1 参数$/}).first();assert.ok(await structured.isVisible());
 });
 await nav('排程工作台');await nav('同步计算全部（无取消）');const selectedPlan=(await f.ok('/plans'))[0];assert.ok(selectedPlan.materialChecked);assert.ok(selectedPlan.materialDemands.some(d=>d.allocations.length));
 await nav('模拟数据查询');const query=page.getByRole('region',{name:'模拟数据查询',exact:true});await query.getByLabel('查询方案',{exact:true}).selectOption(selectedPlan.id);
 const current=(await f.ok('/state')).data,all=queryData(current,[selectedPlan],selectedPlan.id);fs.mkdirSync(out+'/fr014015-csv',{recursive:true});
 for(const def of defs){
  const evidence=report.categories.find(e=>e.key===def.key);await query.getByLabel('查询数据类别',{exact:true}).selectOption(def.key);const rows=current[def.key];assert.ok(rows.length,def.key+' must be populated');assert.equal(await query.locator(':scope > .table-wrap tbody tr').count(),rows.length);evidence.query={list:rows.length};
  await query.getByLabel('查询关键词',{exact:true}).fill('NO-MATCH-014015');assert.equal(await query.locator(':scope > .table-wrap tbody tr').count(),0);await query.getByLabel('查询关键词',{exact:true}).fill('');
  const opts=filterOptions(def.fields);evidence.query.filters={keyword:'positive/negative'};
  for(const [kind,label,value] of [['product','查询产品','HC40'],['order','查询订单','A']])if(await query.getByLabel(label,{exact:true}).count()){
   await query.getByLabel(label,{exact:true}).selectOption(value);assert.equal(await query.locator(':scope > .table-wrap tbody tr').count(),filterRows(all,def.key,{[kind]:value}).length);evidence.query.filters[kind]='selected and row count checked';await query.getByRole('button',{name:'清除筛选',exact:true}).click();
  }
  if(opts.statusFields.length){const name=opts.statusFields.find(k=>rows.some(r=>r[k]));if(name){const value=rows.find(r=>r[name])[name];await query.getByLabel('查询状态字段',{exact:true}).selectOption(name);await query.getByLabel('查询状态',{exact:true}).selectOption(value);assert.equal(await query.locator(':scope > .table-wrap tbody tr').count(),rows.filter(r=>r[name]===value).length);evidence.query.filters.status={name,value};await query.getByRole('button',{name:'清除筛选',exact:true}).click();}}
  if(opts.dateFields.length){const name=opts.dateFields.find(k=>rows.some(r=>r[k]));if(name){const value=rows.find(r=>r[name])[name];await query.getByLabel('查询日期字段',{exact:true}).selectOption(name);await query.getByLabel('查询起值',{exact:true}).fill(value);await query.getByLabel('查询止值',{exact:true}).fill(value);assert.equal(await query.locator(':scope > .table-wrap tbody tr').count(),rows.filter(r=>r[name]===value).length);await query.getByLabel('查询起值',{exact:true}).fill('INVALID');assert.equal(await query.locator(':scope > .table-wrap tbody tr').count(),0);evidence.query.filters.date={name,value,invalid:'zero rows'};await query.getByRole('button',{name:'清除筛选',exact:true}).click();}}
  const id=recordKeys[def.key][0],value=rows[0][id];await query.getByLabel('查询关键词',{exact:true}).fill(value);assert.ok(await query.locator(':scope > .table-wrap tbody tr').count());
  const detail=query.getByRole('button',{name:'查看第1条详情',exact:true});await detail.focus();await page.keyboard.press('Enter');const heading=query.getByRole('region',{name:'记录详情'}).locator('h3').first();assert.ok(await heading.evaluate(e=>document.activeElement===e));assert.ok((await heading.innerText()).includes(value));evidence.query.detail='keyboard Enter focuses record identity heading; full Chinese fields rendered';
  const links=related(all,def.key,0);assert.equal(await query.locator('.query-links button').count(),links.length);evidence.query.related={count:links.length,targets:links.map(l=>l.table)};
  const [download]=await Promise.all([page.waitForEvent('download'),query.getByRole('button',{name:/导出筛选结果/}).click()]);await download.saveAs(out+'/fr014015-csv/'+def.key+'.csv');const csv=fs.readFileSync(out+'/fr014015-csv/'+def.key+'.csv','utf8');assert.ok(csv.includes(value)&&csv.includes('查询输入版本')&&csv.includes('模拟说明'));evidence.query.export={file:'fr014015-csv/'+def.key+'.csv',bytes:Buffer.byteLength(csv)};
  if(links.length){const first=query.locator('.query-links button').first();await first.focus();await page.keyboard.press('Enter');assert.equal(await query.getByLabel('查询数据类别',{exact:true}).inputValue(),links[0].table);assert.ok((await query.getByRole('region',{name:'记录详情'}).innerText()).includes('关联查询'));evidence.query.related.keyboard='first real link selected target and detail';}
 }
 await check('all24 populated categories: list, positive/negative applicable filters, keyboard detail/related navigation and actual CSV downloads',async()=>assert.equal(report.categories.filter(c=>c.query).length,24));
 await check('material allocation navigation keeps saved plan provenance; genuine confirmed snapshot retains original inputs after edits',async()=>{
  await query.getByLabel('查询数据类别',{exact:true}).selectOption('materials');await query.getByRole('button',{name:'查看第1条详情',exact:true}).click();const ledger=query.getByRole('region',{name:'所选方案模拟分配'});assert.ok((await ledger.innerText()).includes('EX-LOT'));await ledger.getByRole('button',{name:'查询原始批次 / 供给 EX-LOT',exact:true}).first().click();assert.equal(await query.getByLabel('查看所选方案计算时的输入',{exact:true}).isChecked(),true);assert.equal(await query.getByLabel('查询数据类别',{exact:true}).inputValue(),'inventory');assert.ok((await query.getByRole('region',{name:'记录详情'}).innerText()).includes('EX-LOT'));
  await query.getByLabel('查询方案',{exact:true}).selectOption(originalPlan.id);await query.getByLabel('查询数据类别',{exact:true}).selectOption('orders');await query.getByLabel('查看所选方案计算时的输入',{exact:true}).check();await query.getByRole('button',{name:'查看第1条详情',exact:true}).click();assert.ok((await query.getByRole('region',{name:'记录详情'}).innerText()).includes('240'));assert.equal((await f.ok('/state')).data.orders[0]['合格需求'],'100');await history();await query.screenshot({path:out+'/fr014015-confirmed-history-query.png'});
 });
 await check('query role read-only; explicit export grant/revoke, role spoof, member removal and audit trusted actor',async()=>{
  await load('query');await nav('数据与 CSV');assert.equal(await editor.getByRole('button',{name:'新增一行',exact:true}).isEnabled(),false);const state=await f.ok('/state'),before=capture();assert.equal((await f.call('/inputs',{revision:state.revision,tables:{orders:[]},role:'supervisor',actor:'test#admin'},'query',{'x-role':'supervisor'})).status,403);assert.equal(capture(),before);
  await nav('模拟数据查询');assert.equal(await query.getByRole('button',{name:/导出筛选结果/}).isEnabled(),false);assert.equal((await f.call('/export',{query:{table:'orders',planId:originalPlan.id,revision:state.revision,filters:{}}},'query')).status,403);
  await f.ok('/auth/members/export',{key:'test#query',canExport:true},'admin');await load('query');await nav('模拟数据查询');const [download]=await Promise.all([page.waitForEvent('download'),query.getByRole('button',{name:/导出筛选结果/}).click()]);await download.saveAs(out+'/fr014015-query-granted.csv');
  await f.ok('/auth/members/export',{key:'test#query',canExport:false},'admin');const deny=await page.request.post(f.url+'/api/export',{headers:{'test-sub':'query'},data:{reason:'stale grant UI',table:'orders'}});assert.equal(deny.status(),403);
  await f.ok('/auth/members/remove',{key:'test#query'},'admin');assert.equal((await f.call('/state',undefined,'query')).status,403);await page.reload();await page.getByText('需要托管身份和已授权业务成员。',{exact:true}).waitFor();
  const log=await f.ok('/operations');assert.ok(log.some(r=>r.action==='confirm'&&r.actor==='test#supervisor'));assert.ok(log.some(r=>r.action==='export'&&r.actor==='test#query'));assert.ok(!log.some(r=>r.actor==='test#admin'&&r.action==='edit'));report.audit=log;await history();
 });
 for(const c of report.categories){c.uniqueKey=recordKeys[c.key];c.operations.unexercised=['positive add/copy/delete not listed above remain unverified in this browser run'];c.boundary=['executionFacts','executionMaterials','executionSources','simulationEvents'].includes(c.key)?'Original execution/source/event protections apply; no automatic undo/rebase':'Current records form a new immutable input revision; original confirmed snapshot retained. Cross-table references validated.';}
 await load('supervisor');await category('tools');await field('tools',1,'工装名称').fill('主管模拟维护');await save();await history();report.checks.push('supervisor actual main editor save200 preserves confirmation');
 assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){await page.screenshot({path:out+'/fr014015-browser-failure.png',fullPage:true});report.visibleText=await page.locator('body').innerText();}throw e;}
finally{fs.writeFileSync(out+'/fr014015-browser-report.json',JSON.stringify(report,null,2));await browser?.close();await f.close();}
console.log('FR014015_BROWSER_PASS '+report.checks.length+' groups, '+report.categories.length+' category entries');
