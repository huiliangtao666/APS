const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const before=process.env.AC15_BEFORE==='1',base='http://127.0.0.1:4317',out='/evidence';
 const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex'),dump=(n,x)=>fs.writeFileSync(out+'/'+n,JSON.stringify(x,null,2));
 const api=async(p,b)=>{const r=await fetch(base+'/api'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify({reason:'AC15 explicit simulation export and frozen history selftest',...b}):undefined});const bytes=Buffer.from(await r.arrayBuffer());assert.ok(r.ok,p+' '+r.status+' '+bytes.toString().slice(0,400));return r.headers.get('content-type')?.includes('json')?JSON.parse(bytes):bytes;};
 const report={before,meta:await api('/uat-build'),checks:[],errors:[],downloads:[],network:[]};
 const {chromium}=require('/workspace/apps/app/node_modules/playwright'),browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--renderer-process-limit=1','--js-flags=--max-old-space-size=128']}),page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true});page.setDefaultTimeout(22000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/api/')&&r.request().method()==='POST')report.network.push({url:r.url(),status:r.status(),request:r.request().postData()});});
 const hub=()=>page.getByRole('complementary',{name:'联合资源工作台',exact:true});
 async function open(tab='工序资源依赖'){
  await page.goto(base+'/__qa/role/planner',{waitUntil:'networkidle'});await page.getByLabel('操作原因',{exact:true}).fill('AC15 isolated profile export and history preservation');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();await page.locator('.data-tabs').getByRole('button',{name:new RegExp('^'+tab)}).click();
 }
 async function reopen(id){await hub().getByLabel('重开资源运行',{exact:true}).selectOption(id);await hub().getByRole('region',{name:'冻结资源结果',exact:true}).getByText(new RegExp('^运行 '+id+' · 方案 ')).waitFor();}
 async function run(){
  for(const id of ['A','B'])await hub().getByLabel('资源订单 '+id,{exact:true}).check();await hub().getByLabel('资源开始分钟',{exact:true}).fill('0');await hub().getByLabel('资源结束分钟',{exact:true}).fill('600');
  const preview=page.waitForResponse(r=>r.url().endsWith('/api/inputs/resource-policy-preview'));await hub().getByRole('button',{name:'预览已保存资源与排程（零写入）',exact:true}).click();assert.equal((await preview).status(),200);
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');await hub().getByRole('button',{name:'冻结资源配置并新算',exact:true}).click();const created=await(await wait).json();let r;
  for(let i=0;i<600;i++){r=await api('/runs/'+created.id);if(r.planId)break;assert.ok(!['failed','cancelled','timed_out'].includes(r.status),JSON.stringify(r));await new Promise(r=>setTimeout(r,30));}assert.equal(r.status,'completed');await reopen(r.id);
  const plan=(await api('/plans')).find(p=>p.id===r.planId);assert.equal(plan.tasks.length,4);return {run:r,plan,snapshot:await api('/runs/'+r.id+'/inputs')};
 }
 async function download(id,name){
  await reopen(id);const wait=page.waitForEvent('download');await hub().getByRole('button',{name:'导出本运行资源账与来源',exact:true}).click();const d=await wait;await d.saveAs(out+'/'+name);assert.equal(await d.failure(),null);const bytes=fs.readFileSync(out+'/'+name),line4=bytes.toString('utf8').split(/\r?\n/)[3];report.downloads.push({name,suggestedFilename:d.suggestedFilename(),runId:id,bytes:bytes.length,sha256:hash(bytes),physicalLine4:line4,url:d.url()});return bytes;
 }
 try{
  await open();
  if(before){
   const old=await run();await api('/plans',{id:old.plan.id});old.plan=(await api('/plans')).find(p=>p.id===old.plan.id);dump('old.json',old);const bytes=await download(old.run.id,'before-native.csv');assert.match(bytes.toString().split(/\r?\n/)[3],/DEC03 人员阶段\/技能替代.*仍待确认/);fs.writeFileSync(out+'/before-dom.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/before.png'});report.checks.push({id:'BEFORE-NATIVE-LINE4-STALE',result:'PASS',expectedFailure:true,snapshotHash:old.run.snapshotHash});
  }else{
   const old=JSON.parse(fs.readFileSync('/reference/old.json')),oldBytes=fs.readFileSync('/reference/before-native.csv');
   assert.deepEqual(await api('/runs/'+old.run.id+'/inputs'),old.snapshot);assert.deepEqual((await api('/plans')).find(p=>p.id===old.plan.id),old.plan);
   const profile=page.getByRole('group',{name:'显式人员占用配置',exact:true});await profile.getByRole('checkbox',{name:/^profile依赖 A\/MIX\//}).check();await profile.getByLabel('profile 人员占用基准',{exact:true}).selectOption('完整工序');await profile.getByLabel('profile 人员检查顺序',{exact:true}).selectOption('先检查可用性再扩展占用');
   for(const[f,v]of Object.entries({'提前占用分钟':'0','后延占用分钟':'10','人员配置来源':'MOCK:AC15 native export history selftest','人员配置版本':'AC15-r1'}))await profile.getByLabel('profile '+f,{exact:true}).fill(v);
   await profile.getByRole('button',{name:'应用人员profile到所选草稿',exact:true}).click();const waitPreview=page.waitForResponse(r=>r.url().endsWith('/api/inputs/resource-policy-preview'));await page.getByRole('button',{name:'预览人员修改（零写入）',exact:true}).click();assert.equal((await waitPreview).status(),200);await page.getByText('人员联合预览通过，可以保存当前草稿。',{exact:true}).waitFor();const save=page.waitForResponse(r=>r.url().endsWith('/api/inputs'));await page.getByRole('button',{name:'保存修改',exact:true}).click();assert.equal((await save).status(),200);await page.getByText('保存完成，当前输入已更新；原方案及其输入保留。',{exact:true}).waitFor();
   await open();const state=await api('/state');assert.equal(state.data.dependencies.find(r=>r['订单编号']==='A'&&r['工序编号']==='MIX'&&r['资源类型']==='人员技能')['后延占用分钟'],'10');
   const fresh=await run();dump('new.json',fresh);assert.notEqual(fresh.run.snapshotHash,old.run.snapshotHash);const ar=fresh.plan.resourceReservations.find(r=>r.type==='人员'&&r.taskIds.includes('A-MIX'));assert.equal(ar.end,fresh.plan.tasks.find(t=>t.id==='A-MIX').end+10);report.checks.push({id:'UI-PROFILE-SAVE-REOPEN-REAL-WORKER',result:'PASS',oldSnapshotHash:old.run.snapshotHash,newSnapshotHash:fresh.run.snapshotHash,actualOccupation:ar});
   const freshBytes=await download(fresh.run.id,'after-new-native.csv'),freshLine=freshBytes.toString().split(/\r?\n/)[3];
   for(const text of ['DEC02 工装整工序/明确窗口占用及窗口外释放','DEC03 人员整段/阶段参与','定向技能替代','唯一物理池','H-P04 提前/后延占用和两种检查顺序','N06','明确模拟','最大等待仅在本方案保存了工艺路线检查合同','下游动态释放未实现','不推定未配置或未启用'])assert.ok(freshLine.includes(text),text);assert.ok(!freshLine.includes('仍待确认'));assert.ok(!freshLine.includes('全部已支持'));report.checks.push({id:'AFTER-NATIVE-PHYSICAL-LINE4-CAPABILITIES-AND-LIMITS',result:'PASS',line4:freshLine});
   const oldAfter=await download(old.run.id,'after-old-native.csv'),oldLines=oldBytes.toString().split(/\r?\n/),newLines=oldAfter.toString().split(/\r?\n/);assert.equal(oldLines.length,newLines.length);assert.equal(newLines[3],freshLine);assert.notEqual(oldLines[3],newLines[3]);oldLines.splice(3,1);newLines.splice(3,1);assert.deepEqual(newLines,oldLines);
   assert.deepEqual(await api('/runs/'+old.run.id+'/inputs'),old.snapshot);assert.deepEqual((await api('/plans')).find(p=>p.id===old.plan.id),old.plan);assert.deepEqual((await api('/runs/'+old.run.id)),old.run);dump('old-reopened.json',{run:await api('/runs/'+old.run.id),plan:(await api('/plans')).find(p=>p.id===old.plan.id),snapshot:await api('/runs/'+old.run.id+'/inputs')});
   report.checks.push({id:'OLD-FROZEN-INPUT-CONFIG-SOURCES-QUANTITIES-LEDGER-UNCHANGED',result:'PASS',oldSnapshotHash:old.run.snapshotHash,oldPlanHash:hash(old.plan),oldSnapshotObjectHash:hash(old.snapshot),csvDifferenceOnlyPhysicalLine:4});
   await api('/plans',{id:fresh.plan.id});await page.reload({waitUntil:'networkidle'});await page.getByLabel('操作原因',{exact:true}).fill('AC15 saved snapshot native UI evidence');await page.getByLabel('已保存方案',{exact:true}).selectOption(fresh.plan.id);const body=await page.locator('body').innerText();assert.ok(body.includes('下游动态释放未实现'));assert.ok(body.includes('H-P04'));assert.ok(!body.includes('完整联合规则仍待确认'));fs.writeFileSync(out+'/after-saved-ui-dom.txt',body);await page.screenshot({path:out+'/after-saved-ui.png'});
   dump('restart-reference.json',{old,newRun:fresh.run,newPlanId:fresh.plan.id,oldResourceHash:hash(oldAfter),newResourceHash:hash(freshBytes),oldPlanCsvHash:hash(await api('/export',{planId:old.plan.id})),stateFingerprint:hash(await api('/state'))});report.checks.push({id:'SAVED-PLAN-UI-CAPABILITY-LIMIT-CONSISTENCY',result:'PASS'});
  }
  assert.deepEqual(report.errors,[]);report.complete=true;
 }catch(e){report.failure=e.stack;fs.writeFileSync(out+'/failure-dom.txt',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
 finally{dump('browser.json',report);await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
