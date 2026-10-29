// Real React/Express/Worker in an isolated QA container. Synthetic membership,
// actual role middleware; no Portal SSO claim. Run with /evidence writable.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {policyFixture} from './dec0203-fixture.mjs';import {defs} from '../server/planner.ts';
const f=await fixture(null,{browser:true}),out='/evidence',r={identity:'synthetic members, actual React/Express/Worker; no SSO or UAT',cases:[],errors:[]};
const hash=s=>createHash('sha256').update(s).digest('hex');let browser,page;
const editor=()=>page.getByRole('region',{name:'模拟记录编辑',exact:true});
const field=(key,i,k)=>editor().getByLabel(`${defs.find(d=>d.key===key).label} ${i+1} ${k}`,{exact:true});
async function category(key){await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:defs.find(d=>d.key===key).label,exact:false}).click();}
async function install(d){const s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:d});await page.goto(f.url);await page.getByLabel('操作原因',{exact:true}).fill('D01-D03 repair round1 browser');}
async function save(status){const before=f.bytes(),wait=page.waitForResponse(r=>r.url().endsWith('/api/inputs')&&r.request().method()==='POST');await editor().getByRole('button',{name:'保存修改',exact:true}).click();const response=await wait,body=await response.json();assert.equal(response.status(),status,JSON.stringify(body));if(status===400)assert.equal(f.bytes(),before);else await editor().getByRole('status').filter({hasText:/保存完成|内容相同/}).waitFor();return {status,body,beforeHash:hash(before),afterHash:hash(f.bytes())};}
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1050},extraHTTPHeaders:{'test-sub':'planner'}});page.on('pageerror',e=>r.errors.push(e.message));
 for(const k of ['人员开始偏移','人员结束偏移']){
  await install(policyFixture('personnel'));await category('dependencies');await field('dependencies',2,k).fill('');const rejected=await save(400);assert.equal(await field('dependencies',2,k).inputValue(),'');assert.ok(rejected.body.issues.some(i=>i.field===k));await page.screenshot({path:out+'/'+k+'-rejected.png',fullPage:true});
  await field('dependencies',2,k).fill('0');const accepted=await save(200);await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('explicit zero persisted');await category('dependencies');assert.equal(await field('dependencies',2,k).inputValue(),'0');r.cases.push({id:'D02 UI '+k,rejected,accepted,draftPreserved:true,explicitZeroReload:true});
 }
 const d=policyFixture();d.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2099-01-01T00:00:00Z';await install(d);await category('executionFacts');await editor().getByRole('button',{name:'新增一行',exact:true}).click();
 const fact={'事实编号':'UI-F','订单编号':'A','工序编号':'MIX','状态':'已开始','开始分钟':'0','观测分钟':'0','工序完成数量':'0','数量单位':'kg','剩余工时分钟':'30','当前设备':'MIX01'};
 for(const [k,v]of Object.entries(fact))await field('executionFacts',0,k).fill(v);
 const accepted=await save(200);await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('future execution persisted');await category('executionFacts');assert.equal(await field('executionFacts',0,'事实编号').inputValue(),'UI-F');
 let s=await f.ok('/state'),run=await f.ok('/runs',{revision:s.revision,selection:{}});for(let i=0;i<300;i++){run=await f.ok('/runs/'+run.id);if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,20));}assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));const p=(await f.ok('/plans')).find(p=>p.runId===run.id);assert.ok(!p.resourceReservations.some(r=>r.type==='工装'));const verification=(await f.ok('/plans/'+p.id+'/verify',{})).verification;assert.equal(verification.checks.resourcePolicies.status,'not_checked');
 await category('rules');s=await f.ok('/state');const index=s.data.rules.findIndex(x=>x['规则编号']==='MOLD');await field('rules',index,'生效时间').fill('');const activeRejected=await save(400);assert.ok(activeRejected.body.issues.some(i=>i.table==='executionFacts'&&i.message.includes('C-A')));await page.screenshot({path:out+'/D03-active-ledger-rejected.png',fullPage:true});
 r.cases.push({id:'D03 UI future execution then active guard',accepted,run,planId:p.id,verification,activeRejected});assert.deepEqual(r.errors,[]);r.complete=true;
}finally{fs.writeFileSync(out+'/repair-browser-results.json',JSON.stringify(r,null,2));await browser?.close();await f.close();}
