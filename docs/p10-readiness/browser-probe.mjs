import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from '../../qa/fr027-fixture.mjs';
import {s06Fixture} from '../../qa/s06-fixture.mjs';
const f=await fixture(null,{browser:true});let browser;
try{
 await f.ok('/inputs',{revision:0,tables:s06Fixture()});
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1000},extraHTTPHeaders:{'test-sub':'planner'}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.url);await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();
 await page.locator('.data-tabs').getByRole('button',{name:'人员组与可用时间',exact:false}).click();
 await page.getByRole('region',{name:'模拟记录编辑',exact:true}).waitFor();
 const labels=await page.getByRole('region',{name:'模拟记录编辑',exact:true}).locator('input,select,textarea').evaluateAll(xs=>xs.map(x=>x.getAttribute('aria-label')));
 assert.ok(labels.some(x=>x?.includes('人员数量')));
 assert.ok(!labels.some(x=>/poolId|物理池|交接|共用/.test(x||'')));
 await page.reload();await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();
 await page.locator('.data-tabs').getByRole('button',{name:'人员组与可用时间',exact:false}).click();
 await page.getByRole('region',{name:'模拟记录编辑',exact:true}).waitFor();
 await page.screenshot({path:'/evidence/current-personnel-ui.png',fullPage:true});
 assert.deepEqual(errors,[]);
 fs.writeFileSync('/evidence/browser-probe-results.json',JSON.stringify({scope:'Existing P08/P09 base UI readiness, NOT P10 acceptance',syntheticIdentity:true,labels,errors,reloaded:true,assertion:'Personnel group quantity exists; pool identity/total/sharing/handover fields absent'},null,2));
}finally{await browser?.close();await f.close();}
