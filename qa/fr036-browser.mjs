import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {startValidation} from './fr034-integration-runner.mjs';
const run=await startValidation(),report={identity:'Actual React App + Express + membership; fixed synthetic actor/QA runtime alias; no real gateway/SSO',checks:[],downloads:[],errors:[]};let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>report.errors.push(e.message));await page.goto(run.url);await page.getByText('当前权限：planner',{exact:false}).waitFor();
 await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();
 const guide=page.locator('[data-fr036-guide]');await guide.locator('summary').first().focus();await page.keyboard.press('Enter');assert.ok(await guide.getByText('全部为离线模拟',{exact:false}).isVisible());
 await guide.getByText('全部类别模板与模拟示例下载',{exact:true}).click();
 const links=await guide.locator('a').evaluateAll(es=>es.map(e=>({text:e.textContent,href:e.getAttribute('href')})));
 for(const l of links){const r=await fetch(run.url+l.href);assert.equal(r.status,200,l.href);const expected=fs.readFileSync('public'+decodeURI(l.href));assert.deepEqual(Buffer.from(await r.arrayBuffer()),expected,l.href);}
 report.checks.push({name:'PG01 keyboard-open Chinese guidance and every linked file exact HTTP bytes',count:links.length,pass:true});
 for(const label of ['下载当前类别 CSV 表头模板','主应用订单示例','重复订单反例','错单位反例','预计到料示例','错引用反例','错日期反例','方案差异导出示例（不可回导）']){const promise=page.waitForEvent('download');await guide.getByRole('link',{name:label,exact:true}).click();const download=await promise;const p='/evidence/fr036-download-'+report.downloads.length+'.csv';await download.saveAs(p);const href=await guide.getByRole('link',{name:label,exact:true}).getAttribute('href');assert.deepEqual(fs.readFileSync(p),fs.readFileSync('public'+decodeURI(href)));report.downloads.push({label,href,bytes:fs.statSync(p).size});}
 report.checks.push({name:'eight actual browser downloads byte parity',pass:true});
 // Real API mutation gate on disposable state: errors must not change any state or audit.
 const state=()=>run.call('/state'),post=async(tables,status)=>{const before=await state(),plans=await run.call('/plans'),log=await run.call('/operations');const r=await fetch(run.url+'/api/inputs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:before.revision,tables,operation:'import',reason:'FR036 disposable rejection'})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));if(status!==200){assert.deepEqual(await state(),before);assert.deepEqual(await run.call('/plans'),plans);assert.deepEqual(await run.call('/operations'),log);}return data;};
 const initial=await state(),orders=structuredClone(initial.data.orders);orders.push({...orders[0]});await post({orders},400);
 const unit=structuredClone(initial.data.orders);unit[0]['数量单位']='吨';await post({orders:unit},409); // Existing execution facts block demand/unit rebasing before ordinary field validation.
 const supplies=[{'供给编号':'SIM-S1','物料编号':'LEAN','批次编号':'SIM-LOT-NEW','预计数量':'100','预计到达时间':'2026-11-02T09:00:00+08:00','预计可用时间':'2026-11-02T10:00:00+08:00','质量状态':'合格','有效期':'2026-12-31'}];
 await post({supplies:[{...supplies[0],'物料编号':'NO_SUCH_MATERIAL'}]},400);await post({supplies:[{...supplies[0],'预计到达时间':'2026-02-30T09:00:00'}]},400);
 await post({supplies,orders:initial.data.orders},200);await post({supplies,orders:initial.data.orders},200);assert.equal((await state()).data.orders.length,initial.data.orders.length);assert.deepEqual((await state()).data.supplies,supplies);
 report.checks.push({name:'actual /inputs atomic reject duplicate/unit/reference/date; corrected repeated replace without duplicates',pass:true});
 await page.setViewportSize({width:640,height:900});await page.screenshot({path:'/evidence/fr036-pg01.png',fullPage:true});fs.writeFileSync('/evidence/fr036-pg01.html',await page.content());fs.writeFileSync('/evidence/fr036-pg01.aria.txt',await page.locator('body').ariaSnapshot());assert.deepEqual(report.errors,[]);report.complete=true;
}finally{fs.writeFileSync('/evidence/fr036-browser-report.json',JSON.stringify({...report,sourceHashes:run.manifest.sourceHashes},null,2));await browser?.close();await run.close();}
