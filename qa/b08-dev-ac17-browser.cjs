const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const before=process.env.AC17_EXPECT_BEFORE==='1',out='/evidence',base='http://127.0.0.1:4317',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 const dump=(n,x)=>fs.writeFileSync(out+'/'+n,JSON.stringify(x,null,2));
 const api=async(p,b)=>{const r=await fetch(base+'/api'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify({reason:'AC17 explicit diagnostic COPY selftest; not Worker output',...b}):undefined});const text=await r.text();assert.ok(r.ok,p+' '+r.status+' '+text.slice(0,400));return r.headers.get('content-type')?.includes('json')?JSON.parse(text):text;};
 const meta=await api('/uat-build'),report={meta,before,checks:[],errors:[],network:[]};
 const state=await api('/state');const created=await api('/runs',{revision:state.revision,selection:{mode:'supported',orderIds:['A','B'],startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:state.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号'])}});
 let run;for(let i=0;i<600;i++){run=await api('/runs/'+created.id);if(run.planId)break;assert.ok(!['failed','cancelled','timed_out'].includes(run.status));await new Promise(r=>setTimeout(r,30));}assert.equal(run.status,'completed');
 const baseline=(await api('/plans')).find(p=>p.id===run.planId),snapshot=await api('/runs/'+run.id+'/inputs');dump('baseline.json',{run,plan:baseline,snapshot});
 assert.equal(baseline.tasks.length,4);assert.ok(!baseline.findings.length);
 const frozenBefore=hash(JSON.stringify(snapshot)),planCsv=await api('/export',{planId:baseline.id}),resourceCsv=await api('/export',{planId:baseline.id,resourceLoad:{start:0,end:600,kind:'resources'}});
 // Only this disposable state is edited. Keep a new identity and the unchanged
 // real API/Worker baseline; never claim this COPY is allocator output.
 const disk=JSON.parse(fs.readFileSync('/state/business.json'));
 const copyRun=structuredClone(disk.runs.find(r=>r.id===run.id)),copy=structuredClone(baseline);
 copyRun.id='DIAGNOSTIC-AC17-R1';copy.id='DIAGNOSTIC-AC17-PLAN-R1';copy.runId=copyRun.id;copyRun.planId=copy.id;
 for(const t of copy.tasks.filter(t=>['A-MIX','B-MIX'].includes(t.id))){t.start=0;t.end=30;}
 for(const r of copy.resourceReservations.filter(r=>(r.taskIds||[]).some(id=>['A-MIX','B-MIX'].includes(id)))){r.start=0;r.end=30;}
 disk.runs=disk.runs.filter(r=>r.id!==copyRun.id);disk.plans=disk.plans.filter(p=>p.id!==copy.id);disk.runs.unshift(copyRun);disk.plans.unshift(copy);fs.writeFileSync('/state/business.json',JSON.stringify(disk,null,2));
 const {resourceRunView}=await import('/workspace/apps/app/src/lib/resource-workbench.mjs');
 const diagnostic=resourceRunView(copyRun,{...snapshot,runId:copyRun.id},copy);
 const capacity=diagnostic.findings.find(f=>f.interval?.demand===3&&f.interval?.effectiveCapacity===2&&f.taskIds.includes('A-MIX')&&f.taskIds.includes('B-MIX'));
 assert.ok(capacity,JSON.stringify(diagnostic.findings));dump('diagnostic-copy.json',{run:copyRun,plan:copy,snapshot:{...snapshot,runId:copyRun.id},findings:diagnostic.findings});
 report.checks.push({id:'REAL-WORKER-AND-INDEPENDENT-3-GT-2',result:'PASS',tasks:baseline.tasks,finding:capacity});
 const {chromium}=require('/workspace/apps/app/node_modules/playwright'),browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--renderer-process-limit=1','--js-flags=--max-old-space-size=128']}),page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true});page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/'))report.network.push({url:r.url(),status:r.status()});});
 const hub=()=>page.getByRole('complementary',{name:'联合资源工作台',exact:true});
 async function open(role='planner'){
  await page.goto(base+'/__qa/role/'+role,{waitUntil:'networkidle'});await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:/^人员组与可用时间/}).click();
 }
 async function reopen(id){await hub().getByLabel('重开资源运行',{exact:true}).selectOption(id);await hub().getByRole('region',{name:'冻结资源结果',exact:true}).getByText(new RegExp('^运行 '+id+' · 方案 ')).waitFor();}
 try{
  await open();await reopen(copyRun.id);
  if(before){await page.waitForFunction(()=>!document.querySelector('#root')?.innerText.trim());assert.ok(report.errors.some(e=>/31|Objects are not valid/.test(e)));fs.writeFileSync(out+'/failure-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});report.checks.push({id:'BEFORE-REACT31-ROOT-EMPTY',result:'PASS',expectedFailure:true});return;}
  const region=hub().getByRole('region',{name:/^资源问题 /}).filter({hasText:capacity.message});await region.getByRole('button',{name:capacity.code+'：'+capacity.message,exact:true}).click();
  let source=hub().getByRole('region',{name:'冻结资源输入',exact:true}),text=await source.innerText();
  for(const expected of ['06_人员技能与班次.csv 原文件第 2 行','12_工序资源与物料依赖.csv 原文件第 4 行','12_工序资源与物料依赖.csv 原文件第 14 行','resourceMappings','personnelPools','LP01'])assert.ok(text.includes(expected),expected+' '+text);
  assert.ok((await hub().getByRole('table').first().innerText()).includes('A-MIX'));assert.ok((await hub().getByRole('table').first().innerText()).includes('B-MIX'));
  await region.getByRole('button',{name:/^定位冻结来源/}).first().click();assert.equal(await source.innerText(),text);
  for(const [table,line]of [['originalPersonnel',2],['originalDependencies',4],['originalDependencies',14]]){
   await source.getByRole('button',{name:new RegExp('^查看冻结原行：'+table+' .*原文件第 '+line+' 行$')}).click();const detail=hub().getByRole('region',{name:'冻结来源记录',exact:true});assert.match(await detail.innerText(),new RegExp('原文件第 '+line+' 行'));assert.match(await detail.innerText(),new RegExp(copyRun.inputVersionId));await detail.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/frozen-'+table+'-row'+line+'.png'});
  }
  await source.locator('p').filter({hasText:'"来源编号":"LP01"'}).getByRole('button',{name:/^查看冻结原行：resourceMappings /}).click();assert.match(await hub().getByRole('region',{name:'冻结来源记录',exact:true}).innerText(),/LP01/);
  for(const id of ['A-MIX','B-MIX']){await region.getByRole('button',{name:capacity.code+'：'+capacity.message,exact:true}).click();await hub().getByRole('button',{name:'定位任务 '+id,exact:true}).click();assert.match(await source.innerText(),new RegExp('选中任务与冻结输入：'+id));assert.equal(await hub().getByRole('button',{name:/^定位任务 /}).count(),1);}
  await region.getByRole('button',{name:capacity.code+'：'+capacity.message,exact:true}).click();fs.writeFileSync(out+'/finding-source-dom.txt',await hub().innerText());await page.screenshot({path:out+'/fixed-finding-sources.png',fullPage:false});report.checks.push({id:'AC17-FINDING-TO-FROZEN-06-12-MAPPING-TASKS',result:'PASS',original06:[2],original12:[4,14],frozenSources:text,inputVersionId:copyRun.inputVersionId,snapshotHash:copyRun.snapshotHash});
  // Save/reload/reopen uses the existing product persistence route.
  await api('/plans',{id:copy.id});await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:/^人员组与可用时间/}).click();await reopen(copyRun.id);await hub().getByRole('region',{name:/^资源问题 /}).filter({hasText:capacity.message}).waitFor();
  report.checks.push({id:'DIAGNOSTIC-SAVE-RELOAD-REOPEN',result:'PASS'});
  // A same-shape tool finding and missing-source results are fixture data,
  // not new business rules. Check the real result renderer and click handlers.
  const current=JSON.parse(fs.readFileSync('/state/business.json')),p=current.plans.find(p=>p.id===copy.id);
  p.resourceReservations.find(r=>r.type==='工装').quantity='99';p.resourceReservations.find(r=>r.type==='人员').end=601;
  p.findings.push({code:'AC17 TOOL SHAPE',message:'同形工装记录安全展示',taskIds:['A-MIX'],relatedRecords:[{table:'tools',row:current.data.tools[0],occurrence:{index:0}}]},
   {code:'AC17 SCALAR',message:'标量来源位置',taskIds:['A-MIX'],relatedRecords:[{table:'originalPersonnel',row:2}]},
   {code:'AC17 MISSING',message:'缺来源诊断仍保留',taskIds:['A-MIX'],relatedRecords:[null,{table:'personnelGroups',row:{unknown:'missing'}}]},
   {code:'AC17 NO SOURCE',message:'没有来源也不丢弃诊断',taskIds:[]});
  fs.writeFileSync('/state/business.json',JSON.stringify(current,null,2));await open();await reopen(copyRun.id);
  for(const label of ['AC17 TOOL SHAPE','AC17 SCALAR','AC17 MISSING','AC17 NO SOURCE'])await hub().getByRole('region',{name:/^资源问题 /}).filter({hasText:label}).waitFor();
  assert.ok((await hub().innerText()).includes('VERIFY / PERSONNEL_WINDOW'));assert.ok((await hub().innerText()).includes('合计需求 100 套 / 有效容量 3 套'));
  const scalar=hub().getByRole('region',{name:/^资源问题 /}).filter({hasText:'AC17 SCALAR'});assert.match(await scalar.innerText(),/06_人员技能与班次.csv 原文件第 2 行/);
  await scalar.getByRole('button',{name:/^定位冻结来源/}).click();assert.match(await hub().getByRole('region',{name:'冻结资源输入',exact:true}).innerText(),/06_人员技能与班次.csv 原文件第 2 行/);
  fs.writeFileSync(out+'/shape-negative-dom.txt',await hub().innerText());await page.screenshot({path:out+'/shape-negative.png',fullPage:false});report.checks.push({id:'TOOL-SCALAR-OBJECT-MISSING-SOURCES',result:'PASS'});
  await reopen(run.id);await hub().getByRole('region',{name:'冻结资源结果',exact:true}).waitFor();assert.equal(await hub().getByRole('region',{name:/^资源问题 /}).count(),0);report.checks.push({id:'NORMAL-NO-FINDING',result:'PASS'});
  assert.equal(hash(JSON.stringify(await api('/runs/'+run.id+'/inputs'))),frozenBefore);assert.equal(await api('/export',{planId:baseline.id}),planCsv);assert.equal(await api('/export',{planId:baseline.id,resourceLoad:{start:0,end:600,kind:'resources'}}),resourceCsv);
  fs.writeFileSync(out+'/baseline-plan.csv',planCsv);fs.writeFileSync(out+'/baseline-resource.csv',resourceCsv);
  report.checks.push({id:'API-WORKER-BASELINE-FROZEN-EXPORT-UNCHANGED',result:'PASS',planCsvSha256:hash(planCsv),resourceCsvSha256:hash(resourceCsv),frozenSha256:frozenBefore});
  const now=await api('/state'),draft=structuredClone(now.data);draft.personnelGroups[0]['可用起始分钟']='60';const {personnelMappingDraft}=await import('/workspace/apps/app/src/lib/b08-personnel-config.mjs');await api('/inputs',{revision:now.revision,tables:personnelMappingDraft(draft,now.data,{simulation:true,groupIds:['LP01']}).tables});
  await open();await reopen(copyRun.id);await hub().getByRole('region',{name:/^资源问题 /}).filter({hasText:capacity.message}).getByRole('button',{name:capacity.code+'：'+capacity.message,exact:true}).click();assert.equal(await hub().getByRole('region',{name:'冻结资源输入',exact:true}).innerText(),text);assert.equal(hash(JSON.stringify(await api('/runs/'+run.id+'/inputs'))),frozenBefore);report.checks.push({id:'CURRENT-MAPPING-EDIT-DOES-NOT-DRIFT-FROZEN-SOURCES',result:'PASS',currentAvailability:60,frozenAvailability:0});
  await open('query');await reopen(copyRun.id);await hub().getByRole('region',{name:/^资源问题 /}).filter({hasText:capacity.message}).waitFor();assert.equal(await hub().getByRole('button',{name:'冻结资源配置并新算',exact:true}).isEnabled(),false);report.checks.push({id:'QUERY-READONLY-DIAGNOSTIC',result:'PASS'});
  assert.deepEqual(report.errors,[]);report.complete=true;
 }catch(e){report.failure=e.stack;fs.writeFileSync(out+'/failure-dom.txt',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:out+'/failure.png',fullPage:false}).catch(()=>{});throw e;}
 finally{dump('browser.json',report);await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
