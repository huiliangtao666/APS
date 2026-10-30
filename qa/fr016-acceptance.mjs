import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {defs} from '../server/planner.ts';import {ruleCatalog,assessRules} from '../src/lib/business-rules.mjs';
import {fixture} from './fr027-fixture.mjs';import {profile,omissions,pin,clone} from './fr016-contracts.mjs';
import {seed} from '../server/planner.ts';import {executionFixture} from './execution-fixture.mjs';import {timetable} from '../src/lib/timetable.mjs';
const out='/evidence',hash=x=>createHash('sha256').update(x).digest('hex');
const f=await fixture(null,{browser:true});let browser,page;
const report={productSHA:pin,identity:'Synthetic QA actors; genuine React/Express/membership APIs; no gateway/SSO or real business data.',matrix:[],checks:[],errors:[],requests:[],gaps:[],proofs:[]};
const persist=()=>fs.writeFileSync(out+'/fr016-report.json',JSON.stringify(report,null,2));
const check=async(name,fn)=>{await fn();report.checks.push(name);persist();console.log('PASS '+name);};
const state=()=>f.ok('/state');
async function install(d){const s=await state();await f.ok('/inputs',{revision:s.revision,tables:d});}
async function load(role='planner'){await page.setExtraHTTPHeaders({'test-sub':role});await page.goto(f.url);await page.getByText('当前权限：'+role,{exact:false}).waitFor();await page.getByLabel('操作原因',{exact:true}).fill('FR016 finite synthetic acceptance');}
const nav=name=>page.getByRole('button',{name,exact:true}).click();
const editor=()=>page.getByRole('region',{name:'模拟记录编辑',exact:true});
async function category(key){await nav('数据与 CSV');await page.locator('.data-tabs').getByRole('button',{name:defs.find(d=>d.key===key).label,exact:false}).click();}
const field=(key,i,name)=>editor().getByRole('textbox',{name:`${defs.find(d=>d.key===key).label} ${i+1} ${name}`,exact:true});
async function save(expected){const before=f.bytes(),wait=page.waitForResponse(r=>r.url().endsWith('/api/inputs')&&r.request().method()==='POST');await editor().getByRole('button',{name:'保存修改',exact:true}).click();const response=await wait,body=await response.json();assert.equal(response.status(),expected,JSON.stringify(body));if(expected===400){assert.equal(f.bytes(),before);report.proofs.push({kind:'UI rejected edit: complete business bytes unchanged',sha256:hash(before),issues:body.issues});}else await editor().getByRole('status').filter({hasText:/保存完成|内容相同/}).waitFor();return body;}
async function cancel(){await editor().getByRole('button',{name:'取消修改',exact:true}).click();}
async function probe(d,label,expected=400){const s=await state(),before=f.bytes(),r=await f.call('/inputs',{revision:s.revision,tables:d});assert.equal(r.status,expected,label+' '+JSON.stringify(r.body));if(expected===400){assert.equal(f.bytes(),before);report.proofs.push({kind:label,sha256:hash(before)});}return {status:r.status,issues:r.body.issues||[],unchanged:r.body.unchanged};}
async function activate(target){await target.focus();await page.keyboard.press('Enter');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
try{
 browser=await chromium.launch({headless:true});report.browser=browser.version();page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.request().method()==='POST')report.requests.push({path:new URL(r.url()).pathname,status:r.status()});});
 assert.deepEqual(await f.ok('/rules/capabilities'),ruleCatalog);
 // Genuine workflow creates the immutable history used throughout this run.
 await load();await nav('同步计算全部（无取消）');await page.getByLabel('主管确认方案',{exact:true}).waitFor();
 const original=(await f.ok('/plans'))[0];assert.ok(original?.tasks.length);await page.getByLabel('主管确认方案',{exact:true}).selectOption(original.id);await nav('独立复核所选方案');await page.getByText('本次已有支持范围检查通过。',{exact:true}).waitFor();
 const ack='已核对规则、未排清单、条件供给及调整原因；接受列明的检查范围';await page.getByLabel(ack,{exact:true}).check();await nav('提交主管');await page.getByRole('heading',{name:'待主管确认',exact:true}).waitFor();await load('supervisor');await page.getByLabel('主管确认方案',{exact:true}).selectOption(original.id);await page.getByLabel(ack,{exact:true}).check();await nav('确认已排部分 / 全部');await page.getByRole('heading',{name:'已确认',exact:true}).waitFor();
 const confirmed=(await f.ok('/plans/'+original.id+'/review')).confirmation,frozen=(await f.ok('/plans')).find(p=>p.id===original.id),inputs=await f.ok('/plans/'+original.id+'/inputs');
 async function history(){assert.deepEqual(await f.ok('/confirmations/'+confirmed.id),confirmed);assert.deepEqual((await f.ok('/plans')).find(p=>p.id===original.id),frozen);assert.deepEqual(await f.ok('/plans/'+original.id+'/inputs'),inputs);}
 report.confirmation={id:confirmed.id,planId:original.id,inputVersion:inputs.id,actor:confirmed.actor,planHash:hash(JSON.stringify(frozen)),inputsHash:hash(JSON.stringify(inputs))};
 for(const c of [...ruleCatalog,{id:'QA_UNKNOWN',supported:false,required:false,scope:'unknown',parameters:'{}'}]){
  const d=profile(c.id),index=d.rules.findIndex(r=>r['规则编号']===c.id),row=d.rules[index],entry={...c,source:'src/lib/business-rules.mjs ruleCatalog / assessRules; server /rules/capabilities',operations:{},limits:[]};report.matrix.push(entry);
  await install(d);await load();await category('rules');
  const support=page.getByRole('region',{name:'规则支持范围',exact:true});
  if(c.supported){
   assert.match(await support.innerText(),/已支持切片/);
   // Every exposed supported switch is exercised through the actual main editor.
   await field('rules',index,'是否启用').fill('否');
   const disableStatus=c.required||['CAPACITY','PROGRAM','MATERIAL'].includes(c.id)&&d.rules.some(r=>['CAPACITY','PROGRAM'].includes(r['规则编号'])&&r['是否启用']==='是')?400:200;
   const disabled=await save(disableStatus);entry.operations.disable={status:disableStatus,issues:disabled.issues||[]};
   if(disableStatus===400)await cancel();else{const s=await state(),p=await f.ok('/calculate',{revision:s.revision});entry.operations.disable.savedSetting=p.ruleSnapshot.settings.find(r=>r.id===c.id);entry.operations.disable.intrinsic=p.ruleSnapshot.intrinsicChecks;assert.equal(entry.operations.disable.savedSetting.active,false);await field('rules',index,'是否启用').fill('是');await save(200);}
   await field('rules',index,'是否启用').fill('否');await field('rules',index,'是否启用').fill('是');await save(200);
   entry.operations.enable={status:200,source:'actual main UI enabled value saved (may be unchanged no-op)'};
   const bad=clone(d);bad.rules[index]['参数JSON']=JSON.stringify({...JSON.parse(row['参数JSON']),QA_UNSUPPORTED_PARAMETER:true});entry.operations.unsupportedParameter=await probe(bad,c.id+' unsupported parameter');
   const parameterNames=Object.keys(JSON.parse(row['参数JSON']));if(parameterNames.length){const missingParam=clone(d),params=JSON.parse(row['参数JSON']);delete params[parameterNames[0]];missingParam.rules[index]['参数JSON']=JSON.stringify(params);entry.operations.missingParameter=await probe(missingParam,c.id+' missing explicit parameter');}else entry.operations.missingParameter={status:'not-applicable',reason:'Fixed empty object; no supported tunable parameter'};
   if(['MATERIAL','INVENTORY'].includes(c.id)){const alternative=clone(d),params=JSON.parse(row['参数JSON']);if(c.id==='MATERIAL')params['允许预计供给']=true;else params['可用质量状态'].push('条件放行');alternative.rules[index]['参数JSON']=JSON.stringify(params);entry.operations.validParameterChange=await probe(alternative,c.id+' valid parameter',200);await install(d);await load();await category('rules');}else entry.operations.validParameterChange={status:'not-applicable-or-not-exercised',reason:c.id==='SORT'?'Structured UI change exercised separately':'Only documented fixed constants/empty object in this slice; no alternate business semantics invented'};
   const scope=clone(d);scope.rules[index]['适用对象']='NO_SUCH_OBJECT';entry.operations.invalidScope=await probe(scope,c.id+' invalid scope');
   const omit=clone(d),[key,position,name]=omissions[c.id],i=position<0?index:position;
   if(c.id==='SORT')omit.rules[index]['参数JSON']='{}';else omit[key][i][name]='';
   entry.operations.necessaryOmission={table:key,row:i+2,field:name,...await probe(omit,c.id+' omission '+name)};
   if(c.id==='PROGRESS')entry.limits.push('No facts in this profile: only rule-row required name; execution necessary-field protection separately retained, not certified here.');
   // Name omission proves exact file/row/field keyboard destination for every supported rule.
   await field('rules',index,'中文名称').fill('');await save(400);const link=editor().getByRole('list',{name:'保存问题定位'}).getByRole('button',{name:new RegExp('第'+(index+2)+'行.*中文名称')});await activate(link);assert.equal(await field('rules',index,'中文名称').evaluate(e=>e===document.activeElement),true);entry.operations.keyboardRuleIssue={file:'16_排程规则配置.csv',row:index+2,field:'中文名称',focused:true};await cancel();
   const future=clone(d);future.rules[index]['生效时间']='2099-01-01T00:00:00Z';entry.operations.future=await probe(future,c.id+' future',c.required||['CAPACITY','PROGRAM','MATERIAL'].includes(c.id)&&d.rules.some(r=>['CAPACITY','PROGRAM'].includes(r['规则编号'])&&r['是否启用']==='是')?400:200);
   await install(d);
   const s=await state(),p=await f.ok('/calculate',{revision:s.revision});entry.calculation={id:p.id,tasks:p.tasks.length,findings:p.findings,setting:p.ruleSnapshot.settings.find(r=>r.id===c.id),checked:p.ruleSnapshot.checkScope.checked,unchecked:p.ruleSnapshot.checkScope.unchecked,intrinsic:p.ruleSnapshot.intrinsicChecks,...(c.id==='DELIVERY'?{deliveryAssessment:p.deliveryAssessment}:{})};assert.equal(entry.calculation.setting.active,true);
   entry.limits.push('Rule adoption is not full independent verification; independent verifier covers line/machine/precedence only.');
  }else{
   assert.match(await support.innerText(),c.id==='QA_UNKNOWN'?/未知类别，未实现\/未检查/:/未支持可配置启用/);
   await field('rules',index,'是否启用').fill('是');const rejected=await save(400);entry.operations.enable={status:400,issues:rejected.issues};await cancel();entry.operations.disable={status:200,setting:assessRules(d).settings.find(r=>r.id===c.id)};assert.equal(entry.operations.disable.setting.status,'未实现/未检查');
  }
  await history();persist();console.log('RULE '+c.id+' complete');
 }
 // Additional main UI condition classes from original FR016, with real issue links.
 await install(profile('LABOR'));await load();
 const conditions=[['required','machines',0,'设备名称',''],['reference','inventory',0,'物料编号','NO-SUCH'],['quantity','orders',0,'合格需求',''],['date','supplies',0,'预计到达时间','2026-02-30T08:00:00+08:00'],['unit','orders',0,'数量单位','pcs'],['precedence','routes',1,'前序工序','NO-SUCH'],['missing-duration','times',0,'固定分钟',''],['missing-capacity','machines',0,'最大装载kg','']];
 report.inputConditions=[];
 for(const [kind,key,i,name,value]of conditions){await category(key);await field(key,i,name).fill(value);const result=await save(400),links=editor().getByRole('list',{name:'保存问题定位'}).getByRole('button');assert.ok(await links.count());const first=result.issues[0];await activate(links.first());const focused=await page.locator(':focus').getAttribute('aria-label');report.inputConditions.push({kind,changed:{table:key,row:i+2,field:name},issues:result.issues,keyboard:{reported:first,focused},rawDraftValue:await field(key,i,name).inputValue()});await cancel();}
 await category('machines');await editor().getByLabel('选择第1行',{exact:true}).check();await editor().getByRole('button',{name:'复制选中',exact:true}).click();const duplicate=await save(400);report.inputConditions.push({kind:'duplicate',issues:duplicate.issues});await cancel();
 await check('seven original input condition classes plus duration/capacity omissions reject atomically; eight issue links activated by Enter',async()=>{assert.equal(report.inputConditions.length,9);for(const e of report.inputConditions.filter(e=>['quantity','missing-duration','missing-capacity'].includes(e.kind)))assert.equal(e.rawDraftValue,'');});
 await page.screenshot({path:out+'/fr016-editor.png',fullPage:true});
 // Actual structured parameter change in main UI, including saved/current separation.
 await install(profile('SORT'));await load();await category('rules');const sortIndex=(await state()).data.rules.findIndex(r=>r['规则编号']==='SORT');await editor().getByRole('textbox',{name:`排程规则 ${sortIndex+1} 参数 排序方式`,exact:true}).fill('要求日期');await save(200);assert.equal(JSON.parse((await state()).data.rules[sortIndex]['参数JSON'])['排序方式'],'要求日期');await history();
 await check('main structured SORT parameter edit persists; confirmed settings and original inputs remain immutable',async()=>{});
 // Minimal mode explicitly records excluded rules, even when configured enabled.
 report.navigation=[];
 async function inspect(p,label,problem=false){
  await load();await page.locator('.plan-list select').selectOption(p.id);
  const timeline=page.locator('.fr033'),panel=page.locator('.fr034'),model=timetable(p);
  await timeline.waitFor();let task=label==='positive-LABOR'?model.tasks.find(t=>t.id==='A-FILL'):model.tasks[0],finding;
  if(problem){finding=p.findings.find(f=>f.taskIds?.some(id=>model.tasks.some(t=>t.id===id)));if(finding){task=model.tasks.find(t=>finding.taskIds.includes(t.id));await activate(panel.locator('.finding').filter({hasText:finding.code}).first());await page.getByRole('heading',{name:'任务详情：'+task.id,exact:true}).waitFor();}}
  const entry={label,planId:p.id,inputVersion:p.inputVersionId||p.inputVersion,snapshotHash:p.snapshotHash,findings:p.findings,scheduled:p.tasks.length,problemActivated:!!finding};report.navigation.push(entry);
  if(problem&&!finding)entry.gap='Global finding has order context but empty taskIds; task-first navigation works separately, not issue-to-same-task linkage. No new defect inferred.';
  if(!task){entry.gap='No task identity exists in saved result; global configuration finding cannot promise task navigation';return;}
  await activate(timeline.getByRole('button',{name:task.id,exact:true}).first());await page.getByRole('heading',{name:'任务详情：'+task.id,exact:true}).waitFor();
  entry.task={id:task.id,start:task.start,end:task.end,quantity:task.quantity,unit:task.unit,unknownInterval:task.start===null||task.end===null};entry.detail=await timeline.locator('.fr033-detail').innerText();entry.resourceEvidence=await panel.innerText();
  assert.ok(entry.detail.includes(task.id));assert.ok(entry.resourceEvidence.includes('资源需求与判断依据：'+task.id));
  if(entry.task.unknownInterval){assert.ok(entry.detail.includes('未知'));assert.equal(await timeline.locator('.fr033-task[data-selected="true"]').count(),0);}
  await timeline.getByLabel('搜索任务',{exact:true}).fill(task.id);
  assert.equal(await page.getByRole('heading',{name:'任务详情：'+task.id,exact:true}).count(),1);await timeline.getByLabel('搜索任务',{exact:true}).fill('');
  const links=timeline.locator('.fr033-detail').getByRole('button',{name:/查看方案输入 /});entry.sourceLinks=await links.allTextContents();
  if(await links.count()){
   const targetTable=/CALENDAR|calendar/.test(label)?'calendars':/MOLD|tool/.test(label)?'tools':/LABOR|personnel/.test(label)?'personnelGroups':/MATERIAL|material/.test(label)?'inventory':/CAPACITY|capacity|PROGRAM|program/.test(label)?'batchResources':'orders';
   let sourceLink=links.filter({hasText:'查看方案输入 '+targetTable+' /'}).first(),viaDependency=false;
   if(targetTable==='personnelGroups'&&!await sourceLink.count()){sourceLink=links.filter({hasText:'查看方案输入 dependencies /'}).last();viaDependency=true;}
   assert.equal(await sourceLink.count(),1);await activate(sourceLink);const query=page.locator('.query-panel');await query.waitFor();
   assert.equal(await page.getByLabel('查看所选方案计算时的输入',{exact:true}).isChecked(),true);assert.equal(await page.getByLabel('查询方案',{exact:true}).inputValue(),p.id);
   if(viaDependency){await activate(query.locator('.query-links button').filter({hasText:defs.find(d=>d.key==='personnelGroups').label}).first());entry.sourceRoute='saved personnel dependency -> explicit related personnel group (no direct task source link on successful personnel task)';}
   assert.equal(await page.getByLabel('查询数据类别',{exact:true}).inputValue(),targetTable);
   entry.source={planId:await page.getByLabel('查询方案',{exact:true}).inputValue(),table:await page.getByLabel('查询数据类别',{exact:true}).inputValue(),detail:await query.getByRole('region',{name:'记录详情'}).innerText()};assert.match(await query.innerText(),/关联输入来自方案原始快照/);
  }else entry.gap='Saved task has no per-task input references; no fabricated source navigation';
  await page.screenshot({path:out+'/navigation-'+label+'.png',fullPage:true});await history();
 }
 for(const id of ['CALENDAR','MOLD','LABOR','MATERIAL','CAPACITY','PROGRAM']){const e=report.matrix.find(r=>r.id===id);await inspect((await f.ok('/plans')).find(p=>p.id===e.calculation.id),'positive-'+id);}
 const negative=[['calendar-window','CALENDAR',d=>d.calendars[0]['结束分钟']='10'],['tool-shortage','MOLD',d=>d.resourceClaims[0]['需求数量']='3'],['personnel-shortage','LABOR',d=>d.dependencies.find(r=>r['资源类型']==='人员技能')['需求数量']='3'],['material-shortage','MATERIAL',d=>d.inventory.forEach(r=>r['账面数量']='0')],['capacity-under-min','CAPACITY',d=>d.machines.forEach(m=>m['最小装载kg']='260')],['capacity-no-common-range','CAPACITY',d=>d.machines.forEach(m=>m['最小装载kg']=m['最大装载kg'])],['program-not-whitelisted','PROGRAM',d=>d.batchResources.forEach(r=>r['允许程序']='OTHER')]];
 for(const [label,id,mutate]of negative){const d=profile(id);mutate(d);await install(d);const s=await state(),p=await f.ok('/calculate',{revision:s.revision});assert.ok(p.findings.length,label+' must report a problem');await inspect(p,label,true);}
 await check('six positive rule families and seven actual scheduler problem cases: keyboard task/detail/saved-source navigation with explicit global-finding gaps',async()=>assert.equal(report.navigation.length,13));
 const sMin=await state(),minimal=await f.ok('/calculate',{revision:sMin.revision,selection:{mode:'minimal-r1'}});report.minimal= {scope:minimal.ruleSnapshot.checkScope,settings:minimal.ruleSnapshot.settings};
 await check('minimal-r1 does not present calendar or personnel as checked',async()=>{assert.equal(minimal.ruleSnapshot.checkScope.mode,'minimal-r1');assert.ok(minimal.ruleSnapshot.checkScope.unchecked.includes('日历与停机'));});
 // An original confirmed plan still navigates to its own input, after many current changes.
 await inspect(frozen,'confirmed-history');await history();
 const ex=executionFixture(seed);await install(ex);const sEx=await state(),pEx=await f.ok('/calculate',{revision:sEx.revision});const changed=clone(ex.executionFacts);Object.assign(changed[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});await f.ok('/inputs',{revision:sEx.revision,tables:{executionFacts:changed}});await inspect(pEx,'saved-execution-vs-current');await nav('排程工作台');await activate(page.locator('.fr033-detail').getByText('当前模拟事实对照（独立于历史方案）',{exact:true}));assert.match(await page.locator('.fr033-detail').innerText(),/工序累计可用产出 40 kg/);assert.match(await page.locator('.fr033-detail details pre').innerText(),/"工序完成数量": "50"/);await page.screenshot({path:out+'/saved-vs-current.png',fullPage:true});
 const missing=clone(changed);missing[0]['剩余工时分钟']='';report.executionOmission=await probe({executionFacts:missing},'PROGRESS missing remaining duration');await history();
 const s=await state(),before=f.bytes(),blockedMinimal=await f.call('/calculate',{revision:s.revision,selection:{mode:'minimal-r1'}});assert.equal(blockedMinimal.status,422);assert.equal(f.bytes(),before);report.executionMinimalGuard=blockedMinimal;
 await history();assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page){report.visibleText=await page.locator('body').innerText();await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}
finally{persist();await browser?.close();await f.close();}
console.log('FR016_FINITE_PASS '+report.matrix.length+' rule rows, '+report.checks.length+' groups');
