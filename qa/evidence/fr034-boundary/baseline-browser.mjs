// Finite FR034 keyboard regression in the real disposable App; no harness banner.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {resourceLoad,loadCsv} from '../src/lib/resource-load.mjs';
import {startValidation} from './fr034-integration-runner.mjs';
const output=process.env.FR034_EVIDENCE_DIR||'/evidence';
const run=await startValidation(), report={productSHA:process.env.FR034_PRODUCT_SHA||'working-source',mode:process.env.FR034_KBD_MODE||'observe',keyboard:[],sourceHashes:run.manifest.sourceHashes,results:[],focus:[],audit:[],errors:[],console:[],network:[]};
let browser;
const longReason='键盘验收：仅用于一次性容器，核对任务来源、前后序与数量口径；'.repeat(8);
const longQuantity='原任务数量口径：保存的工序累计可用产出，不跨工序累加，不推断合格入库；'.repeat(6);
async function save(){fs.writeFileSync(output+'/boundary-report.json',JSON.stringify(report,null,2));}
try {
 const dirs=fs.readdirSync('/tmp').filter(n=>n.startsWith('fr033-real-app-'));assert.equal(dirs.length,1);
 const file=path.join('/tmp',dirs[0],'data/business.json'),fixture=JSON.parse(fs.readFileSync(file));
 // Only labelled corrupt fixture metadata is lengthened; positive plans remain exact.
 const corrupt=fixture.plans.find(p=>p.id===run.manifest.corruptPlanId);
 corrupt.resultAssessment.tasks.find(t=>t.id==='A-MIX').quantityMeaning=longQuantity;
 corrupt.resultAssessment.tasks.find(t=>t.id==='A-MIX').reasons.push({code:'QA-LONG-REASON',message:longReason});
 const multi=structuredClone(corrupt);multi.id='FR034-SYNTHETIC-MULTILANE';multi.name=multi.id;
 const third=structuredClone(multi.tasks.find(t=>t.id==='A-MIX'));Object.assign(third,{id:'QA-THIRD',start:10,end:40});multi.tasks.push(third);
 const assessment=structuredClone(multi.resultAssessment.tasks.find(t=>t.id==='A-MIX'));assessment.id=third.id;multi.resultAssessment.tasks.push(assessment);
 fixture.plans.push(multi);
 fs.writeFileSync(file,JSON.stringify(fixture));
 const currentBefore=await run.call('/state');
 report.harnessHashes=Object.fromEntries(['qa/fr034-boundary-browser.mjs','qa/fr034-boundary-docker.sh','qa/fr034-integration-runner.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
 report.fixture={longReason,longQuantity,corruptPlanId:corrupt.id,positivePlans:run.manifest.plans.map(p=>({id:p.id,sha256:createHash('sha256').update(JSON.stringify(p)).digest('hex')}))};
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});report.browser=browser.version();
 for(const width of [640,1100]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on('pageerror',e=>report.errors.push({width,message:e.message}));
  page.on('console',m=>{if(['warning','error'].includes(m.type()))report.console.push({width,type:m.type(),text:m.text()});});
  page.on('response',r=>{if(r.url().includes('/api/'))report.network.push({width,method:r.request().method(),url:r.url(),status:r.status()});});
  const panel=page.locator('.fr034'),timeline=page.locator('.fr033'),picker=page.locator('.plan-list select');
  const cdp=await page.context().newCDPSession(page);
  const stamp=async(name)=>{
   fs.writeFileSync(`${output}/${width}-${name}.native-ax.json`,JSON.stringify(await cdp.send('Accessibility.getFullAXTree'),null,2));
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
  const check=async(name,fn)=>{try{await fn();report.results.push({width,name,pass:true});}catch(e){report.results.push({width,name,pass:false,error:e.stack});await stamp('FAIL-'+name.replace(/[^a-z0-9]/gi,'-'));}finally{await save();}};
  await page.goto(run.url);await page.getByText('当前权限：planner',{exact:false}).waitFor();await page.locator('body > aside').evaluateAll(es=>es.forEach(e=>e.remove()));

  await focus(page.getByLabel('操作原因',{exact:true}),'long Chinese operation reason');await page.keyboard.insertText(longReason);
  await choose(picker,corrupt.id,'saved picker');
  await check('native-AX-name-and-busy-Tab-away',async()=>{
   const ax=await cdp.send('Accessibility.getFullAXTree');
   assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='combobox'&&n.name?.value==='已保存方案'));
   let posts=0,release;const gate=new Promise(r=>release=r);
   await page.route('**/api/plans/*/verify',async route=>{posts++;await gate;await route.continue();});
   const button=panel.getByRole('button',{name:'主动运行独立检查',exact:true});
   await focus(button,'pending check');await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.querySelector('.fr034 > button')?.getAttribute('aria-disabled')==='true');
   await page.keyboard.press('Enter');await page.keyboard.press('Space');await page.keyboard.press('Tab');
   const next=panel.getByLabel('仅显示问题任务',{exact:true});assert.ok(await next.evaluate(e=>e===document.activeElement));
   await stamp('pending-tab-away');release();
   await page.waitForFunction(()=>document.querySelector('.fr034 > button')?.getAttribute('aria-disabled')==='false');
   assert.equal(posts,1);assert.ok(await next.evaluate(e=>e===document.activeElement));
   await stamp('completed-tab-away');await page.unroute('**/api/plans/*/verify');
  });
  const activeVisible=async(name)=>{
   const e=await focus(page.locator(':focus'),name,true);
   assert.ok(e.active&&e.focusVisible&&e.unobscured&&e.rect.top>=-1&&e.rect.bottom<=901,JSON.stringify(e));
  };
  await check('repeated-overlap-activation-and-end-scroll',async()=>{
   const problem=panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}).first();
   for(let i=0;i<3;i++){
    await activate(problem,'repeat overlap '+i);await activeVisible('repeat destination '+i);
    assert.equal(await timeline.locator('.fr033-task[data-selected="true"]').count(),2);
    assert.match(await page.getByLabel('问题区间详情').innerText(),/\[20,30\)/);
    const ax=await cdp.send('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='button'&&/^A-MIX /.test(n.name?.value)&&n.properties?.some(p=>p.name==='pressed'&&p.value.value==='true')));
   }
   await stamp('repeated-overlap');
   await focus(timeline.getByLabel('可滚动机器时间轴，任务同下方时间表',{exact:true}),'scroll region');
   await page.keyboard.press('Control+End');
   report.results.push({width,name:'end-scroll-position',measurement:await page.evaluate(()=>({y:scrollY,height:innerHeight,documentHeight:document.documentElement.scrollHeight}))});
   await activate(problem,'from document end overlap');await activeVisible('end-scroll destination');await stamp('end-scroll-overlap');
  });
  await check('selected-task-disappears-and-reappears',async()=>{
   const search=timeline.getByLabel('搜索任务',{exact:true});await focus(search,'empty-result search');await page.keyboard.insertText('FR034-NO-SUCH-TASK');
   assert.equal(await timeline.locator('.fr033-task').count(),0);
   assert.match(await timeline.innerText(),/筛选结果 0 \//);assert.match(await timeline.innerText(),/选中任务被筛选隐藏：A-MIX、A-FILL/);
   assert.ok(await search.evaluate(e=>e===document.activeElement));
   assert.equal(await timeline.locator('.fr033-detail').count(),2);await stamp('no-results-selected-hidden');
   await activate(timeline.getByRole('button',{name:'显示选中任务',exact:true}),'reveal selected');
   assert.equal(await timeline.locator('.fr033-task[data-selected="true"]').count(),2);
   assert.equal(await search.inputValue(),'');await activeVisible('reveal control focus');await stamp('selected-reappeared');
   assert.ok((await timeline.innerText()).includes(longReason));assert.ok((await timeline.innerText()).includes(longQuantity));
  });
  await check('multiple-overlapping-lanes',async()=>{
   await choose(picker,multi.id,'synthetic multilane saved plan');
   await activate(panel.getByRole('button',{name:'主动运行独立检查',exact:true}),'multilane check');
   await panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}).first().waitFor();
   const problem=panel.locator('.finding').filter({hasText:'MACHINE_OVERLAP'}).filter({hasText:'QA-THIRD'}).first();
   await activate(problem,'multilane problem');await activeVisible('multilane destination');
   const bars=await timeline.locator('.fr033-task').evaluateAll(es=>es.map(e=>({id:e.innerText.split(' · ')[0],top:e.getBoundingClientRect().top,rect:e.getBoundingClientRect().toJSON(),pressed:e.getAttribute('aria-pressed')})));
   report.results.push({width,name:'multilane-geometry',measurement:bars});
   const three=bars.filter(b=>['A-MIX','A-FILL','QA-THIRD'].includes(b.id));assert.equal(three.length,3);assert.equal(new Set(three.map(b=>b.top)).size,3);
   await stamp('multilane');
  });
  await check('no-problems-filter-empty-then-restore',async()=>{
   await choose(picker,run.manifest.jointPlanId,'positive saved plan');
   assert.equal(await panel.locator('.finding').count(),0);
   await activate(panel.getByLabel('仅显示问题任务',{exact:true}),'no problems filter','Space');
   assert.equal(await timeline.locator('.fr033-task').count(),0);assert.match(await panel.innerText(),/问题任务 0 个/);
   await stamp('no-problems-filter');
   await activate(panel.getByLabel('仅显示问题任务',{exact:true}),'restore all tasks','Space');
   assert.equal(await timeline.locator('.fr033-task').count(),4);await activeVisible('restored checkbox');
  });
  await check('saved-source-current-facts-unchanged',async()=>{
   await choose(picker,run.manifest.historicalPlanId,'historical saved plan');
   await activate(timeline.getByRole('button',{name:'A-MIX',exact:true}).first(),'saved history task');
   await activate(timeline.getByText('当前模拟事实对照（独立于历史方案）',{exact:true}),'current facts');
   assert.match(await timeline.locator('.fr033-detail').innerText(),/工序累计可用产出 40 kg/);
   assert.match(await timeline.locator('.fr033-detail details pre').innerText(),/"工序完成数量": "50"/);
   for(const p of run.manifest.plans)assert.deepEqual((await run.call('/plans')).find(x=>x.id===p.id),p);
   const after=await run.call('/state');assert.deepEqual(after.data,currentBefore.data);assert.equal(after.revision,currentBefore.revision);
   await stamp('history-current');
  });
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.completed=true;report.allPassed=report.results.filter(r=>r.pass!==undefined).every(r=>r.pass);await save();
 console.log('FR034_BOUNDARY_COMPLETED '+report.results.filter(r=>r.pass===true).length+' assertion groups');
} finally {await save();await browser?.close();await run.close();}
