// Real browser + real HTTP/1 fixture. This does not execute business UAT.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.B15_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.B15_FIXTURE_URL,out=process.env.B15_TRANSPORT_EVIDENCE;
if(!base||!out)throw Error('explicit private fixture URL and evidence directory required');
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('fixture must be local');
const prefix='/__qa/baselines/SIM-LP01-PRE1-v1',id='SIM-LP01-PRE1-v1';
const report={scope:'engineering HTTP/1 fixture, not UAT',checks:[],failedRequests:[],errors:[],responses:[]};
const check=(name,value)=>{assert.ok(value,name);report.checks.push({name,result:'PASS'});};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.B15_CHROME?{executablePath:process.env.B15_CHROME}:{}),args:['--disable-gpu']});
 try{
 report.browser=browser.version();const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);
 const requestOffset=(await(await context.request.get(base+'/__fixture/requests')).json()).length;
 page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),method:r.method(),error:r.failure()}));
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(base))report.responses.push({url:r.url(),method:r.request().method(),status:r.status()});});
 if(process.env.B15_REPRO_BEFORE==='1'){
  await page.goto(base+prefix+'/role/planner?version=before');await page.click('#copy');
  await page.waitForFunction(()=>document.querySelector('#result').textContent);
  report.beforeUi=JSON.parse(await page.locator('#result').textContent());
  check('old adapter UI click fails before reaching HTTP/1 handler',!!report.beforeUi.error&&report.failedRequests.some(r=>r.error.errorText==='net::ERR_ALPN_NEGOTIATION_FAILED'));
 }
 await page.goto(base+prefix+'/role/planner');await page.click('#copy');
 await page.waitForFunction(()=>document.querySelector('#result').textContent);
 const ui=JSON.parse(await page.locator('#result').textContent());report.uiCopy=ui;
 check('real UI click JSON POST reaches HTTP/1',ui.status===200&&ui.reply.httpVersion==='1.1');
 check('JSON bytes and headers preserved',ui.reply.body===JSON.stringify({reason:'transport 中文',name:'isolated copy'})&&ui.reply.headers['content-type']==='application/json'&&ui.reply.headers['x-aps-request']==='workbench');
 check('baseline rewrite, scope and HttpOnly role cookie',ui.reply.path===prefix+'/api/plans/fixture/copy'&&ui.reply.headers['x-b15-simulation']===id&&ui.reply.headers.cookie.includes('b15Role=planner'));
 await page.screenshot({path:out+'/ui-post.png'});
 const result=await page.evaluate(async({base,prefix})=>{
  const get=async(input,init)=>{const r=await fetch(input,init);return{status:r.status,data:await r.json()};};
  const headers={'content-type':'application/json','x-aps-request':'workbench'};
  const req=new Request(base+'/api/echo?request=1',{method:'POST',headers,body:'{"original":true}',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',keepalive:true});
  const request=await get(req,{body:'{"override":"中文"}',headers:{...headers,'x-init':'override'},referrerPolicy:'no-referrer'});
  const requestOnly=await get(new Request(base+'/api/echo',{method:'POST',headers,body:'request-only',credentials:'omit',referrerPolicy:'no-referrer'}));
  const scoped=await get(prefix+'/api/echo?scope=already',{method:'POST',headers,body:'[]'});
  const empty=await get('/api/echo',{method:'POST',headers});
  const ordinary=await get('/api/echo?get=1');
  const head=await fetch('/api/echo',{method:'HEAD'});
  const staticPost=await get('/static/echo',{method:'POST',headers,body:'static-bytes'});
  const foreign=await get(base.replace('127.0.0.1','localhost')+'/api/echo?foreign=1',{method:'POST',headers,body:'foreign-bytes'});
  const controller=new AbortController();controller.abort();let abort;
  try{await fetch('/api/echo',{method:'POST',body:'abort',signal:controller.signal});}catch(e){abort=e.name;}
  const used=new Request(base+'/api/echo',{method:'POST',body:'used'});await used.text();let consumed;
  try{await fetch(used);}catch(e){consumed=e.name;}
  const excluded=await get('/apix/echo',{method:'POST',body:'not-api'});
  return{request,requestOnly,scoped,empty,ordinary,head:head.status,staticPost,foreign,abort,consumed,excluded};
 },{base,prefix});report.cases=result;
 check('Request + init body/headers overrides kept',result.request.status===200&&result.request.data.body==='{"override":"中文"}'&&result.request.data.headers['x-init']==='override'&&!result.request.data.headers.referer);
 check('Request-only body, omitted credentials and referrer policy kept',result.requestOnly.status===403&&result.requestOnly.data.body==='request-only'&&!result.requestOnly.data.headers.cookie&&!result.requestOnly.data.headers.referer);
 check('already scoped path is not doubled',result.scoped.data.path===prefix+'/api/echo'&&result.scoped.data.query==='?scope=already');
 check('empty POST and GET/HEAD work',result.empty.status===200&&result.empty.data.body===''&&result.ordinary.status===200&&result.head===200);
 check('same-origin static POST unchanged',result.staticPost.data.path==='/static/echo'&&result.staticPost.data.body==='static-bytes'&&!result.staticPost.data.headers['x-b15-simulation']);
 check('foreign POST unchanged',result.foreign.data.path==='/api/echo'&&result.foreign.data.body==='foreign-bytes'&&!result.foreign.data.headers['x-b15-simulation']);
 check('abort and consumed body remain rejected',result.abort==='AbortError'&&result.consumed==='TypeError');
 check('API prefix boundary unchanged',result.excluded.data.path==='/apix/echo'&&!result.excluded.data.headers['x-b15-simulation']);
 await page.goto(base+prefix+'/role/query');await page.click('#copy');await page.waitForFunction(()=>document.querySelector('#result').textContent);
 report.queryCopy=JSON.parse(await page.locator('#result').textContent());check('query role POST still rejected',report.queryCopy.status===403);
 const missing=await context.request.post(base+prefix+'/api/echo',{data:{negative:true}});check('missing explicit scope rejected by HTTP guard',missing.status()===400);
 await page.goto(base+'/');check('main page does not silently activate',await page.evaluate(()=>!document.documentElement.dataset.b15Simulation));
 await page.click('#copy');await page.waitForFunction(()=>document.querySelector('#result').textContent);
 check('main page POST is not routed into baseline',JSON.parse(await page.locator('#result').textContent()).status===405);
 await page.goto(base+'/main-guard');check('adapter refuses injection on main path',report.errors.some(e=>e.includes('explicit baseline UI path required'))&&await page.evaluate(()=>!document.documentElement.dataset.b15Simulation));
 const requests=(await(await context.request.get(base+'/__fixture/requests')).json()).slice(requestOffset);report.httpRequests=requests;
 if(process.env.B15_REPRO_BEFORE==='1')check('old failed POST never reached server',requests.filter(r=>r.path===prefix+'/api/plans/fixture/copy'&&r.method==='POST').length===2);
 // Prove a no-server-restart loading option: the old inline adapter captures
 // this reviewed, buffered fetch as its originalFetch in a NEW browser context.
 // Extract only our fixed setup from the private fixture, never from live 18251.
 const candidateHtml=await(await context.request.get(base+prefix+'/ui')).text();
 const setup=candidateHtml.match(/<head><script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(setup,'candidate baseline setup found');
 // addInitScript runs before <html> exists. Leave the banner/dataset assignment
 // to the original page's adapter; install only the transport at this phase.
 const decoration='document.documentElement.dataset.b15Simulation=id;';
 assert.ok(setup.includes(decoration),'known decoration assignment');
 const bootstrap=`(()=>{if(location.pathname!==${JSON.stringify(prefix+'/ui')})return;\n${setup.replace(decoration,'')}\n})();`;
 fs.writeFileSync(out+'/browser-init.js',bootstrap);
 await context.close();
 const compat=await browser.newContext();await compat.addInitScript({content:bootstrap});
 const compatPage=await compat.newPage();compatPage.setDefaultTimeout(10000);
 await compatPage.goto(base+prefix+'/role/planner?version=before');await compatPage.click('#copy');
 await compatPage.waitForFunction(()=>document.querySelector('#result').textContent);
 report.oldUiWithBootstrap=JSON.parse(await compatPage.locator('#result').textContent());
 const patched=report.oldUiWithBootstrap;
 check('no-restart preload + old inline adapter real UI POST',patched.status===200&&patched.reply.httpVersion==='1.1'&&patched.reply.path===prefix+'/api/plans/fixture/copy'&&patched.reply.body===ui.reply.body&&patched.reply.headers['x-b15-simulation']===id&&patched.reply.headers['x-aps-request']==='workbench'&&patched.reply.headers.cookie.includes('b15Role=planner'));
 await compatPage.screenshot({path:out+'/old-ui-with-bootstrap.png'});
 await compatPage.goto(base+prefix+'/role/query?version=before');await compatPage.click('#copy');await compatPage.waitForFunction(()=>document.querySelector('#result').textContent);
 check('preload + old inline adapter preserves query rejection',JSON.parse(await compatPage.locator('#result').textContent()).status===403);
 await compatPage.goto(base+'/');await compatPage.click('#copy');await compatPage.waitForFunction(()=>document.querySelector('#result').textContent);
 check('preload leaves main page unactivated and POST rejected',await compatPage.evaluate(()=>!document.documentElement.dataset.b15Simulation)&&JSON.parse(await compatPage.locator('#result').textContent()).status===405);
 report.bootstrapHttpRequests=(await(await compat.request.get(base+'/__fixture/requests')).json()).slice(requestOffset+requests.length);
 await compat.close();
 report.result='PASS';report.peakFixtureBodyBytes=128*1024;console.log(JSON.stringify({result:report.result,checks:report.checks.length,browser:report.browser,before:report.beforeUi}));
 }finally{await browser.close();fs.writeFileSync(out+'/browser.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
