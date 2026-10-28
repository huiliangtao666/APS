// Finite acceptance of the unchanged 21ff4dd FR034 product in the real disposable App.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startValidation} from './fr034-integration-runner.mjs';
const output=process.env.FR034_EVIDENCE_DIR||'/evidence';
const run=await startValidation(), report={productSHA:'21ff4dd72d9583ec591436b160a0b79931d81900',sourceHashes:run.manifest.sourceHashes,results:[],focus:[],audit:[],errors:[],console:[],network:[]};
let browser;
const longReason='键盘验收：仅用于一次性容器，核对任务来源、前后序与数量口径；'.repeat(8);
const longQuantity='原任务数量口径：保存的工序累计可用产出，不跨工序累加，不推断合格入库；'.repeat(6);
async function save(){fs.writeFileSync(output+'/keyboard-report.json',JSON.stringify(report,null,2));}
try {
 const dirs=fs.readdirSync('/tmp').filter(n=>n.startsWith('fr033-real-app-'));assert.equal(dirs.length,1);
 const file=path.join('/tmp',dirs[0],'data/business.json'),fixture=JSON.parse(fs.readFileSync(file));
 // Only labelled corrupt fixture metadata is lengthened; positive plans remain exact.
 const corrupt=fixture.plans.find(p=>p.id===run.manifest.corruptPlanId);
 corrupt.resultAssessment.tasks.find(t=>t.id==='A-MIX').quantityMeaning=longQuantity;
 corrupt.resultAssessment.tasks.find(t=>t.id==='A-MIX').reasons.push({code:'QA-LONG-REASON',message:longReason});
 fs.writeFileSync(file,JSON.stringify(fixture));
 const currentBefore=await run.call('/state');
 report.harnessHashes=Object.fromEntries(['qa/fr034-keyboard-browser.mjs','qa/fr034-keyboard-docker-browser.sh','qa/fr034-integration-runner.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
 report.fixture={longReason,longQuantity,corruptPlanId:corrupt.id,positivePlans:run.manifest.plans.map(p=>({id:p.id,sha256:createHash('sha256').update(JSON.stringify(p)).digest('hex')}))};
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browser=browser.version();
 for(const width of [640,1100]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on('pageerror',e=>report.errors.push({width,message:e.message}));
  page.on('console',m=>{if(['warning','error'].includes(m.type()))report.console.push({width,type:m.type(),text:m.text()});});
  page.on('response',r=>{if(r.url().includes('/api/'))report.network.push({width,method:r.request().method(),url:r.url(),status:r.status()});});
  const panel=page.locator('.fr034'),timeline=page.locator('.fr033'),picker=page.locator('.plan-list select');
  const stamp=async(name)=>{
   fs.writeFileSync(`${output}/${width}-${name}.html`,await page.content());
   fs.writeFileSync(`${output}/${width}-${name}.aria.txt`,await page.locator('body').ariaSnapshot());
   await page.screenshot({path:`${output}/${width}-${name}.png`});
  };
  const focus=async(target,name,observeOnly=false)=>{
   await target.waitFor({state:'visible'});
   let tabs=0;
   for(;!observeOnly&&tabs<900;tabs++) {if(await target.evaluate(e=>e===document.activeElement))break;await page.keyboard.press('Tab');}
   assert.ok(tabs<900,'not keyboard reachable: '+name);
   const entry=await target.evaluate(e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e),x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    let clip={left:x,top:y,right,bottom};
    for(let a=e.parentElement;a;a=a.parentElement){const c=getComputedStyle(a),q=a.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(c.overflowX)){clip.left=Math.max(clip.left,q.left);clip.right=Math.min(clip.right,q.right);}if(/hidden|auto|scroll|clip/.test(c.overflowY)){clip.top=Math.max(clip.top,q.top);clip.bottom=Math.min(clip.bottom,q.bottom);}}
    const hits=[];for(const fx of [.2,.5,.8])for(const fy of [.2,.5,.8]){const hit=document.elementFromPoint(clip.left+(clip.right-clip.left)*fx,clip.top+(clip.bottom-clip.top)*fy);hits.push(!!hit&&(hit===e||e.contains(hit)));}
    return {tag:e.tagName,text:(e.getAttribute('aria-label')||e.innerText||e.value||'').slice(0,220),active:e===document.activeElement,activeElement:{tag:document.activeElement?.tagName,text:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,120)},focusVisible:e.matches(':focus-visible'),outline:s.outline,rect:r.toJSON(),clip,unobscured:hits.some(Boolean),labels:[...(e.labels||[])].map(l=>l.innerText),documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
   });
   report.focus.push({width,name,tabs,...entry});
   // Record focus visibility as a separate audit result; never hide a reproduced failure.
   if(!entry.focusVisible||!entry.unobscured||entry.outline.startsWith('0px'))report.audit.push({width,kind:'focus',name,entry});
   return entry;
  };
  const activate=async(target,name,key='Enter')=>{await focus(target,name);await page.keyboard.press(key);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(await target.count()===1&&await target.isVisible())await focus(target,name+' after activation',true);};
  const choose=async(target,value,name)=>{
   const index=await target.evaluate((e,v)=>[...e.options].findIndex(o=>o.value===v),value);assert.ok(index>=0);
   await focus(target,name);
   // Avoid the empty "current calculation" option: the product deliberately retains the active saved plan for that value.
   const current=await target.evaluate(e=>e.selectedIndex),key=index<current?'ArrowUp':'ArrowDown';
   for(let i=0;i<Math.abs(index-current);i++){await page.keyboard.press(key);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}
   await page.keyboard.press('Enter');assert.equal(await target.inputValue(),value);
  };
  const check=async(name,fn)=>{try{await fn();report.results.push({width,name,pass:true});}catch(e){report.results.push({width,name,pass:false,error:e.stack});await stamp('FAIL-'+name.replace(/[^a-z0-9]/gi,'-'));throw e;}finally{await save();}};
  await page.goto(run.url);await page.getByText('当前权限：planner',{exact:false}).waitFor();
  await check('keyboard-long-operation-reason',async()=>{await focus(page.getByLabel('操作原因',{exact:true}),'operation reason');await page.keyboard.insertText(longReason);assert.equal(await page.getByLabel('操作原因',{exact:true}).inputValue(),longReason);});
  await choose(picker,corrupt.id,'saved-plan picker (unlabelled audit)');
  await check('keyboard-active-check',async()=>{
   await activate(panel.getByRole('button',{name:'主动运行独立检查',exact:true}),'active independent check');
   await panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}).waitFor();
   await focus(panel.getByRole('button',{name:'主动运行独立检查',exact:true}),'active check completed',true);
   const verified=(await run.call('/plans')).find(p=>p.id===corrupt.id);assert.equal(verified.verification.findings.length,2);assert.deepEqual(verified.tasks,corrupt.tasks);
  });
  await check('keyboard-overlap-task-identity',async()=>{
   await activate(panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}),'overlap problem');
   assert.match(await page.getByLabel('问题区间详情').innerText(),/\[20,30\)/);
   assert.deepEqual((await timeline.locator('.fr033-task[data-selected="true"]').evaluateAll(es=>es.map(e=>e.textContent.split(' · ')[0]))).sort(),['A-FILL','A-MIX']);
   await stamp('overlap-focus');
  });
  await check('keyboard-precedence-filter-long-quantity',async()=>{
   await activate(panel.locator('.finding').filter({hasText:'PRECEDENCE'}),'precedence problem');
   assert.match(await page.getByLabel('问题区间详情').innerText(),/前序结束 30 · 后序开始 20 · 违反时长 10/);
   await activate(panel.getByLabel('仅显示问题任务',{exact:true}),'problem-task filter','Space');assert.equal(await timeline.locator('.fr033-task').count(),2);
   await focus(timeline.getByLabel('搜索任务',{exact:true}),'task search');await page.keyboard.insertText('A-MIX');assert.equal(await timeline.locator('.fr033-task').count(),1);
   await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');
   assert.ok((await timeline.innerText()).includes(longQuantity));
   await stamp('filter-long-quantity');
   await activate(panel.getByLabel('仅显示问题任务',{exact:true}),'problem-task filter off','Space');
  });
  await check('keyboard-task-successor-predecessor',async()=>{
   await focus(timeline.getByRole('button',{name:'A-MIX',exact:true}).first(),'task row before long-text horizontal scroll');
   for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');
   await page.waitForTimeout(250);
   report.results.push({width,name:'long-quantity-keyboard-scroll-measurement',measurement:await timeline.locator('.table-wrap').last().evaluate(e=>({scrollLeft:e.scrollLeft,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth}))});
   await stamp('long-chinese-quantity');
   await activate(timeline.getByRole('button',{name:'A-MIX',exact:true}).first(),'saved task A-MIX');
   await page.getByRole('heading',{name:'任务详情：A-MIX',exact:true}).waitFor();
   await activate(timeline.locator('.fr033-detail').getByRole('button',{name:'A-FILL',exact:true}),'saved successor A-FILL');
   await page.getByRole('heading',{name:'任务详情：A-FILL',exact:true}).waitFor();
   await activate(timeline.locator('.fr033-detail').getByRole('button',{name:'A-MIX',exact:true}),'saved predecessor A-MIX');
   await page.getByRole('heading',{name:'任务详情：A-MIX',exact:true}).waitFor();
  });
  await check('keyboard-saved-source-provenance',async()=>{
   assert.ok((await panel.innerText()).includes(corrupt.snapshotHash));
   await activate(timeline.locator('.fr033-detail').getByRole('button',{name:/查看方案输入 orders/}).first(),'saved original order input');
   await page.locator('.query-panel').waitFor();assert.equal(await page.getByLabel('查看所选方案计算时的输入',{exact:true}).isChecked(),true);
   assert.equal(await page.getByLabel('查询方案',{exact:true}).inputValue(),corrupt.id);
   assert.match(await page.locator('.query-panel').innerText(),/关联输入来自方案原始快照/);await stamp('saved-source');
   await activate(page.getByRole('button',{name:'排程工作台',exact:true}),'return scheduling workbench');
  });
  await choose(picker,run.manifest.materialPlanId,'material saved-plan picker');
  await check('keyboard-unknown-material-identity-no-color-only',async()=>{
   const finding=panel.locator('.finding').filter({hasText:'UNPLANNED / MATERIAL'}).first();
   await activate(finding,'unknown material problem');const ids=await finding.innerText();
   assert.match(await page.getByLabel('问题区间详情').innerText(),/没有可验证的已排问题区间/);assert.equal(await timeline.locator('.fr034-interval').count(),0);
   const heading=await timeline.locator('.fr033-detail h3').innerText();assert.ok(ids.includes(heading.replace('任务详情：','')));
   assert.match(await panel.innerText(),/LEAN/);assert.match(await panel.innerText(),/缺口/);assert.match(await panel.innerText(),/未提交 \/ 候选检查/);
   assert.ok(await timeline.getByRole('button',{pressed:true}).count()>0);await stamp('material-unknown');
  });
  await choose(picker,run.manifest.historicalPlanId,'history saved-plan picker');
  await check('keyboard-current-versus-saved-immutable',async()=>{
   await activate(timeline.getByRole('button',{name:'A-MIX',exact:true}).first(),'history saved task');
   await activate(timeline.getByText('当前模拟事实对照（独立于历史方案）',{exact:true}),'current facts disclosure');
   assert.match(await timeline.locator('.fr033-detail').innerText(),/工序累计可用产出 40 kg/);
   assert.match(await timeline.locator('.fr033-detail details pre').innerText(),/"工序完成数量": "50"/);
   for(const p of run.manifest.plans)assert.deepEqual((await run.call('/plans')).find(x=>x.id===p.id),p);
   await stamp('history-current');
  });
  const controls=await page.locator('.fr033,.fr034,.plan-list').locator('input,select,button').evaluateAll(es=>es.map(e=>({tag:e.tagName,type:e.type,text:(e.getAttribute('aria-label')||e.innerText||'').slice(0,160),labels:[...(e.labels||[])].map(l=>l.innerText),labelledby:e.getAttribute('aria-labelledby'),title:e.title,outer:e.outerHTML.slice(0,600)})));
  fs.writeFileSync(`${output}/${width}-control-audit.json`,JSON.stringify(controls,null,2));
  report.audit.push(...controls.filter(c=>!c.text&&!c.labels.length&&!c.labelledby&&!c.title).map(c=>({width,kind:'unnamed-control',control:c})));
  await check('keyboard-focus-without-harness-banner',async()=>{
   await page.locator('body > aside').evaluate(e=>e.remove());
   await choose(picker,corrupt.id,'no-banner saved-plan picker');
   await activate(panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}),'no-banner overlap problem');
   await stamp('no-banner-overlap-focus');
   const currentAfter=await run.call('/state');assert.deepEqual(currentAfter.data,currentBefore.data);assert.equal(currentAfter.revision,currentBefore.revision);
  });
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.completed=true;await save();
 console.log('FR034_KEYBOARD_COMPLETED '+report.results.length+' functional groups; '+report.audit.length+' audit observations (review separately)');
} finally {await save();await browser?.close();await run.close();}
