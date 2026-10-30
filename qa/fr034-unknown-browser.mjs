// Deliberate saved-output corruption is restricted to this disposable runner's storage.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startValidation} from './fr034-integration-runner.mjs';
const run=await startValidation(),output=process.env.FR034_EVIDENCE_DIR||'/evidence',results=[],errors=[];
let browser;
try{
 const dirs=fs.readdirSync('/tmp').filter(n=>n.startsWith('fr033-real-app-'));assert.equal(dirs.length,1);
 const file=path.join('/tmp',dirs[0],'data/business.json'),baseline=JSON.parse(fs.readFileSync(file));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 const panel=page.locator('.fr034'),timeline=page.locator('.fr033');
 const open=async()=>{await page.goto(run.url);await page.getByLabel('操作原因',{exact:true}).fill('FR034 UNKNOWN01 disposable corrupt output');await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.locator('.plan-list select').selectOption(run.manifest.corruptPlanId);};
 // Stored pre-fix structured findings cannot override a raw null endpoint before rechecking.
 const stale=structuredClone(baseline),sp=stale.plans.find(p=>p.id===run.manifest.corruptPlanId);sp.tasks.find(t=>t.id==='A-FILL').start=null;
 const f={code:'VERIFY / PRECEDENCE',message:'QA persisted pre-fix fabricated interval',taskIds:['A-MIX','A-FILL'],interval:{kind:'precedence',start:0,end:30,priorEnd:30,nextStart:0,violationDuration:30}};
 sp.verification={checkedAt:'2026-10-29T00:00:00Z',planId:sp.id,findings:[f],checks:Object.fromEntries(['lineScope','machineOverlap','precedence'].map(key=>[key,{status:'problem',details:['QA persisted pre-fix report']}]))};fs.writeFileSync(file,JSON.stringify(stale));
 await open();await panel.locator('.finding').filter({hasText:'PRECEDENCE'}).click();
 assert.match(await page.getByLabel('问题区间详情').innerText(),/没有可验证的已排问题区间/);assert.equal(await timeline.locator('.fr034-interval').count(),0);
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/03-stale-structured-unknown.png'});results.push({scenario:'persisted fabricated structured interval over raw null',passed:true});
 const variants=[{name:'null',value:null},{name:'empty',value:''},{name:'whitespace',value:' \t '},{name:'absent',value:undefined},{name:'nonfinite-string',value:'Infinity'}];
 for(const variant of variants)for(const taskId of ['A-MIX','A-FILL'])for(const endpoint of ['start','end']){
  const state=structuredClone(baseline),p=state.plans.find(p=>p.id===run.manifest.corruptPlanId),task=p.tasks.find(t=>t.id===taskId);
  if(variant.value===undefined)delete task[endpoint];else task[endpoint]=variant.value;
  if(taskId==='A-MIX'&&endpoint==='start')p.tasks.find(t=>t.id==='A-FILL').start=30;
  delete p.verification;fs.writeFileSync(file,JSON.stringify(state));
  await open();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/plans')&&r.request().method()==='GET'),panel.getByRole('button',{name:'主动运行独立检查',exact:true}).click()]);
  await page.getByRole('button',{name:'主动运行独立检查',exact:true}).isEnabled();
  const saved=(await run.call('/plans')).find(x=>x.id===p.id);
  assert.deepEqual(saved.tasks,p.tasks);assert.equal(saved.verification.checks.machineOverlap.status,'problem');assert.equal(saved.verification.checks.precedence.status,'problem');assert.deepEqual(saved.verification.findings,[]);
  assert.equal(await timeline.locator('.fr034-interval').count(),0);
  for(const original of run.manifest.plans)assert.deepEqual((await run.call('/plans')).find(x=>x.id===original.id),original);
  results.push({variant:variant.name,taskId,endpoint,passed:true,verification:saved.verification,tasks:saved.tasks});
  if(variant.name==='null'&&taskId==='A-FILL'&&endpoint==='start'){await panel.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/04-active-null-no-geometry.png'});}
 }
 for(const zero of [0,'0',' 0.0 ']){
  const state=structuredClone(baseline),p=state.plans.find(p=>p.id===run.manifest.corruptPlanId);p.tasks.find(t=>t.id==='A-MIX').start=zero;delete p.verification;fs.writeFileSync(file,JSON.stringify(state));
  await open();await panel.getByRole('button',{name:'主动运行独立检查',exact:true}).click();await panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}).waitFor();
  await panel.locator('.finding').filter({hasText:'PRECEDENCE'}).click();assert.match(await page.getByLabel('问题区间详情').innerText(),/违反时长 10/);
  assert.ok(await timeline.locator('.fr034-interval').count()>0);
  const saved=(await run.call('/plans')).find(x=>x.id===p.id);assert.deepEqual(saved.tasks,p.tasks);assert.equal(saved.verification.findings.length,2);
  results.push({scenario:'valid zero '+JSON.stringify(zero),passed:true});
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/unknown-browser-report.json',JSON.stringify({results,errors,browser:browser.version(),source:run.manifest.productSourceSHA,hashes:run.manifest.sourceHashes,identity:'synthetic fixed planner; no signed gateway identity',fixture:'only deliberately corrupted disposable saved output; not scheduler-generated malformed data'},null,2));
 console.log('FR034_UNKNOWN_BROWSER_PASS '+results.length+' groups (20 endpoint cases, stale structured defense, 3 valid zero controls)');
}finally{await browser?.close();await run.close();}
