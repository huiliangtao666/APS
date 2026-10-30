// Derived from APS-Test2 A05 probe; see issue26-feedback.md for fixture and failure injection details.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {Worker} from 'node:worker_threads';import express from 'express';import {build} from 'vite';import {chromium} from 'playwright';import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';import {seed} from '../server/planner.ts';
const out='/evidence',root=process.cwd(),dataDir='/tmp/issue26-store',events=[],samples=[];const mono=()=>Number(process.hrtime.bigint())/1e6;const mark=(kind,extra={})=>(events.push({kind,t:mono(),...extra}),save('live-events.json',events));const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');const save=(n,x)=>fs.writeFileSync(out+'/'+n,typeof x==='string'?x:JSON.stringify(x,null,2));
let browser,server;const resourceSamples=[];const resourceTimer=setInterval(()=>{resourceSamples.push({t:mono(),cpu:fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8'),memoryCurrent:fs.readFileSync('/sys/fs/cgroup/memory.current','utf8'),memoryPeak:fs.readFileSync('/sys/fs/cgroup/memory.peak','utf8'),memoryEvents:fs.readFileSync('/sys/fs/cgroup/memory.events','utf8')});save('resource-samples.json',resourceSamples);},500);
const report={productSHA:process.env.PRODUCT_SHA||'working-source',mode:process.env.PROBE_MODE||'fixed',samples,identity:'synthetic fixed planner via documented QA actor injection; real membership; runtime UI auth alias; no gateway/SSO',events,errors:[]};
try{
report.sourceHashes=Object.fromEntries(['src/App.tsx','src/index.css','server/business.mjs'].map(f=>[f,hash(fs.readFileSync(f).toString())]));
await build({root,base:'/',resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:path.join(root,'qa/fr033-integration-runtime.mjs')}]},build:{outDir:'/tmp/fr038-ui-dist',emptyOutDir:true}});
save('built-ui-artifacts.json',Object.fromEntries(fs.readdirSync('/tmp/fr038-ui-dist/assets').map(f=>[f,hash(fs.readFileSync('/tmp/fr038-ui-dist/assets/'+f).toString())])));fs.mkdirSync(dataDir,{recursive:true});fs.copyFileSync('/probe/test2/saved-business.json',dataDir+'/business.json');const store=openStore(dataDir);store.initFirstAdmin('fr033-test#admin');let i=store.createInvite({role:'planner',createdBy:'fr033-test#admin',requireApproval:false});store.acceptInvite(i.token,'fr033-test#synthetic-planner');
const actor=(req,res,next)=>{req.praetorActor={kind:'user',issuer:'fr033-test',sub:'synthetic-planner',requestId:'fr038-ui-512-completion-c1'};next();};const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
const rename=fs.renameSync;fs.renameSync=function(a,b){const t=mono();const r=rename.apply(this,arguments);if(b===dataDir+'/business.json'){const s=JSON.parse(fs.readFileSync(b));mark('persist_rename_done',{begin:t,runs:s.runs?.map(r=>({id:r.id,status:r.status,planId:r.planId})),planIds:s.plans?.map(p=>p.id)});}return r;};
let workerSeq=0;const app=express();app.use((req,res,next)=>{mark('http_in',{method:req.method,url:req.url});res.on('finish',()=>mark('http_out',{method:req.method,url:req.url,status:res.statusCode}));next();});app.use(express.json({limit:'2mb'}));app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir,actorMiddleware:actor,requireMember,workerFactory:data=>{const seq=++workerSeq;mark('worker_construct',{seq});const w=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:data});w.on('online',()=>mark('worker_online',{seq}));w.on('message',m=>mark('worker_message',{seq,kindMessage:m.kind,tasks:m.plan?.tasks?.length}));w.on('exit',code=>mark('worker_exit',{seq,code}));return w;}}));app.get('/favicon.ico',(_req,res)=>res.status(204).end());app.use(express.static('/tmp/fr038-ui-dist'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
const call=async(p,b)=>{const r=await fetch(url+'/api'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify({...b,reason:'FR038 UI C1 synthetic exploration'}):undefined});let j=await r.json();assert.ok(r.ok,p+': '+r.status+' '+JSON.stringify(j));return j;};
function fixture(n){const d=structuredClone(seed),order=seed.orders[0],dep=seed.dependencies.filter(x=>x['订单编号']==='A');d.orders=Array.from({length:n},(_,i)=>({...order,'订单编号':'S'+String(i+1).padStart(4,'0'),'优先顺序':String(i+1),'要求可交付分钟':'20000'}));d.dependencies=d.orders.flatMap((o,i)=>dep.map(x=>({...x,'订单编号':o['订单编号'],'资源编号':x['资源编号'].replace('01','0'+(i%3+1))})));d.calendars.forEach(c=>c['结束分钟']='20000');return d;}
report.environment={node:process.version,platform:process.platform,arch:process.arch,os:os.release(),cpus:os.cpus().map(x=>x.model),memory:os.totalmem(),cgroupCpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8'),cgroupMemory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8'),wallUTC:new Date().toISOString()};
browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox']});report.browser=browser.version();const context=await browser.newContext({viewport:{width:1280,height:1000},recordHar:{path:out+'/network.har',content:'omit'}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push({kind:'pageerror',message:e.stack}));page.on('console',m=>{if(m.type()==='error')report.errors.push({kind:'console',message:m.text()});});page.on('requestfailed',r=>report.errors.push({kind:'requestfailed',url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.url().endsWith('/api/plans')&&r.request().method()==='POST')mark('browser_post_response',{status:r.status()});});
await page.exposeFunction('recordUi',x=>mark('ui_event',x));
await page.addInitScript(()=>{const phrase='服务端排程快照已保存。';let last=false;const sample=()=>{const el=[...document.querySelectorAll('[role=status]')].find(e=>e.textContent?.includes(phrase));const visible=!!el&&!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';if(visible!==last){last=visible;window.recordUi({kind:'toast_visibility',visible,text:el?.textContent,t:performance.now()});}};new MutationObserver(sample).observe(document,{subtree:true,childList:true,characterData:true});document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.textContent?.includes('保存快照'))window.recordUi({kind:'save_click',t:performance.now()});},true);});
report.environment={node:process.version,platform:process.platform,arch:process.arch,os:os.release(),cpuMax:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim(),memoryMax:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),wallUTC:new Date().toISOString()};
const runId='5fad729f-ac9b-431d-b4fd-1e56f333c4db';
const run=await call('/runs/'+runId),plans=await call('/plans'),p=plans.find(p=>p.id===run.planId);assert.equal(p.tasks.length,1024);report.reopen={runId,status:run.status,planId:p.id,planHash:hash(p),tasks:p.tasks.length,findings:p.findings.length};
save('frozen-inputs.json',await call('/runs/'+runId+'/inputs'));
await page.goto(url);await page.getByLabel('操作原因',{exact:true}).fill('FR038 A05 Test2 restored store');await page.getByRole('article',{name:'运行记录 '+runId}).getByRole('button',{name:'查看结果',exact:true}).click();
await page.getByText('当前方案运行编号：'+runId,{exact:false}).waitFor({timeout:60000});
report.reopen.domTaskCount=Number(await page.locator('.metrics article').filter({has:page.getByText('已排任务',{exact:true})}).locator('b').innerText());assert.equal(report.reopen.domTaskCount,1024);
const originalHash=hash(p);const beforeState=await call('/state');
const baseline=process.env.PROBE_MODE==='baseline';
const saveButton=page.getByRole('button',{name:'保存快照',exact:true});
async function geometry(label,phrase){
 const toast=page.locator('.toast');await toast.waitFor({state:'visible',timeout:30000});assert.ok((await toast.innerText()).includes(phrase));
 const g=await toast.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight},scrollY,position:s.position,visibility:s.visibility,opacity:s.opacity};});
 const btn=await saveButton.boundingBox();g.saveButton=btn;g.inViewport=g.x>=0&&g.y>=0&&g.x+g.width<=g.viewport.width&&g.y+g.height<=g.viewport.height;
 g.overlapsSave=!!btn&&g.x<btn.x+btn.width&&g.x+g.width>btn.x&&g.y<btn.y+btn.height&&g.y+g.height>btn.y;
 g.closeHit=await toast.locator('button').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;});
 await page.screenshot({path:out+'/'+label+'.png',fullPage:false,timeout:30000});
 if(baseline){assert.equal(g.inViewport,false);}
 else{assert.equal(g.inViewport,true);assert.equal(g.overlapsSave,false);assert.equal(g.closeHit,true);}
 report[label]=g;save('report.json',report);return g;
}
async function dismiss(){await page.getByRole('button',{name:'关闭提示',exact:true}).click();await page.locator('.toast').waitFor({state:'detached'});}
async function saveClick(){await saveButton.scrollIntoViewIfNeeded();await saveButton.waitFor({state:'visible'});const before=await page.evaluate(()=>scrollY);const [r]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/plans')&&r.request().method()==='POST',{timeout:90000}),saveButton.click({timeout:90000})]);await r.finished();report.lastPost={status:r.status(),scrollBefore:before};return r;}
assert.equal((await saveClick()).status(),201);
await geometry('large-success','服务端排程快照已保存。');
report.large={planHashBefore:originalHash,planHashAfter:hash((await call('/plans')).find(x=>x.id===p.id)),orders:beforeState.data.orders.length,tasks:p.tasks.length};
assert.equal(report.large.planHashAfter,originalHash);assert.deepEqual(await call('/state'),beforeState);
if(!baseline){
 await dismiss();
 const persistedBefore=fs.readFileSync(dataDir+'/business.json','utf8');
 await page.route('**/api/plans',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();body.reason='';await route.continue({postData:JSON.stringify(body)});}else await route.continue();});
 assert.equal((await saveClick()).status(),400);await geometry('large-failure','请先填写操作原因');
 assert.equal(fs.readFileSync(dataDir+'/business.json','utf8'),persistedBefore);await dismiss();await page.unroute('**/api/plans');
 assert.equal((await saveClick()).status(),201);await geometry('large-retry','服务端排程快照已保存。');await dismiss();
 await page.reload();await page.getByRole('article',{name:'运行记录 '+runId}).getByRole('button',{name:'查看结果',exact:true}).click();await page.getByText('当前方案运行编号：'+runId,{exact:false}).waitFor({timeout:60000});
 report.large.reopenHash=hash((await call('/plans')).find(x=>x.id===p.id));assert.equal(report.large.reopenHash,originalHash);assert.deepEqual(await call('/state'),beforeState);
 // Change only the isolated test store through the real inputs API for the small-list regression.
 await call('/inputs',{tables:seed,revision:beforeState.revision});const smallState=await call('/state');const calculated=await call('/calculate',{revision:smallState.revision});const small=(await call('/plans')).find(x=>x.id===calculated.id);
 report.small={planId:small.id,runId:small.runId,tasks:small.tasks.length,orders:smallState.data.orders.length,hashBefore:hash(small)};
 await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('Issue26 small fixture save regression');
 await page.getByRole('article',{name:'运行记录 '+small.runId}).getByRole('button',{name:'查看结果',exact:true}).click();
 await page.getByText('当前方案运行编号：'+small.runId,{exact:false}).waitFor({timeout:30000});
 assert.equal((await saveClick()).status(),201);await geometry('small-success','服务端排程快照已保存。');await dismiss();
 // Narrow viewport: the same real React page, save and failure feedback must stay usable.
 await page.setViewportSize({width:390,height:844});
 assert.equal((await saveClick()).status(),201);await geometry('narrow-success','服务端排程快照已保存。');await dismiss();
 const smallPersisted=fs.readFileSync(dataDir+'/business.json','utf8');
 await page.route('**/api/plans',async route=>{if(route.request().method()==='POST')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'保存服务暂不可用，请重试'})});else await route.continue();});
 assert.equal((await saveClick()).status(),503);await geometry('narrow-failure','保存服务暂不可用，请重试');assert.equal(fs.readFileSync(dataDir+'/business.json','utf8'),smallPersisted);await dismiss();await page.unroute('**/api/plans');
 assert.equal((await saveClick()).status(),201);await geometry('narrow-retry','服务端排程快照已保存。');await dismiss();
 report.small.hashAfter=hash((await call('/plans')).find(x=>x.id===small.id));assert.equal(report.small.hashAfter,report.small.hashBefore);assert.deepEqual(await call('/state'),smallState);
 report.large.finalHash=hash((await call('/plans')).find(x=>x.id===p.id));assert.equal(report.large.finalHash,originalHash);
 await page.reload();await page.getByRole('article',{name:'运行记录 '+small.runId}).getByRole('button',{name:'查看结果',exact:true}).click();await page.getByText('当前方案运行编号：'+small.runId,{exact:false}).waitFor({timeout:30000});report.small.reopenHash=hash((await call('/plans')).find(x=>x.id===small.id));assert.equal(report.small.reopenHash,report.small.hashBefore);
}
report.success=true;await context.close();
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{clearInterval(resourceTimer);save('resource-samples.json',resourceSamples);save('report.json',report);await browser?.close();if(server)await new Promise(r=>server.close(r));}
