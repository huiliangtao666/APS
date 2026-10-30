import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {stageInput} from './issue6-stage-input.mjs';
const E=process.env.ISSUE6_EVIDENCE_DIR||'/evidence';fs.mkdirSync(E,{recursive:true});const dump=(n,x)=>fs.writeFileSync(path.join(E,n),typeof x==='string'?x:JSON.stringify(x,null,2));
const f=await fixture(null,{browser:true}),browser=await chromium.launch({headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
try{
 const {files,repairs,originals}=stageInput(process.env.ISSUE6_INPUT_DIR||'/inputs',{selectApplicableMachines:true,calendarOnlyDependencies:true});dump('input.json',{files,repairs,originals});
 await page.goto(f.url);await page.getByLabel('操作原因',{exact:true}).fill('Issue6 Dev synthetic operator');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();
 await page.locator('[data-csv-batch]').getByLabel('选择批量 CSV',{exact:true}).setInputFiles(files.map(x=>({name:x.name,mimeType:'text/csv',buffer:Buffer.from(x.text)})));
 await page.getByRole('status').filter({hasText:'已读取文件'}).waitFor();
 const preview=async()=>{const wait=page.waitForResponse(r=>r.url().endsWith('/api/imports/preview'));await page.getByRole('button',{name:'预览并检查整批',exact:true}).click();return (await wait).json();};
 const missing=await preview();assert.equal(missing.valid,false);assert.equal(missing.issues.length,6);dump('missing.json',missing);
 for(const row of [2,3])for(const [field,value] of [['是否允许拆分','否'],['需求类型','正式订单'],['订单状态','有效']])await page.getByLabel(`补录 第${row}行 ${field}`,{exact:true}).selectOption(value);
 const checked=await preview();assert.equal(checked.valid,true,JSON.stringify(checked));dump('preview.json',checked);await page.screenshot({path:E+'/01-preview.png',fullPage:true});
 const committed=page.waitForResponse(r=>r.url().endsWith('/api/imports/commit'));await page.getByRole('button',{name:'确认整批导入',exact:true}).click();assert.equal((await committed).status(),200);await page.getByRole('status').filter({hasText:'整批导入成功'}).waitFor();
 results.push({id:'UI-10-TABLES',status:'PASS',scope:'10 selected files, explicit six software selections; original03 subset, not full original acceptance'});
 await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('Issue6 Dev synthetic operator');await page.getByRole('button',{name:'同步计算全部（无取消）',exact:true}).click();
 await page.getByText('当前方案运行编号：',{exact:false}).waitFor();const plans=await f.ok('/plans'),p=plans[0];assert.equal(p.tasks.find(t=>t.id==='B-MIX').start,15);
 await page.getByRole('button',{name:'独立复核',exact:true}).click();await page.locator('.verification-check.pass').filter({hasText:'工厂日历 / 设备停机'}).waitFor();await page.screenshot({path:E+'/02-legal.png',fullPage:true});results.push({id:'UI-LEGAL-15',status:'PASS'});
 const disk=JSON.parse(f.bytes()),bad=disk.plans.find(x=>x.id===p.id),task=bad.tasks.find(t=>t.id==='B-MIX');task.start=14;task.end=44;fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(disk));
 await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('Issue6 fixed output invalid14 synthetic corruption');await page.getByLabel('已保存方案',{exact:true}).selectOption(p.id);await page.getByRole('button',{name:'独立复核',exact:true}).click();
 const linkage=page.getByRole('region',{name:'任务与问题联动核对',exact:true});await linkage.getByRole('button').filter({hasText:'CALENDAR_INTERVAL'}).click();await page.getByRole('status',{name:'问题区间详情'}).waitFor();
 assert.ok((await page.getByRole('status',{name:'问题区间详情'}).innerText()).includes('[14,15)'));
 const refs=page.getByRole('region',{name:'问题关联记录',exact:true});const sourceRows=refs.locator('tbody tr'),count=await sourceRows.count();let found=false;
 for(let i=0;i<count;i++)if((await sourceRows.nth(i).innerText()).includes('设备停机')){await sourceRows.nth(i).getByRole('button').click();found=true;break;}assert.ok(found);
 assert.ok((await refs.innerText()).includes('物理行 2'));await page.screenshot({path:E+'/03-illegal-source.png',fullPage:true});
 await refs.getByRole('button',{name:'查询关联记录',exact:true}).click();const query=page.getByRole('region',{name:'模拟数据查询',exact:true});await query.waitFor();assert.equal(await query.getByLabel('查询数据类别',{exact:true}).inputValue(),'downtime');assert.ok((await query.innerText()).includes('15'));
 await page.screenshot({path:E+'/04-frozen-query.png',fullPage:true});await query.getByRole('button',{name:'返回同任务 B-MIX',exact:true}).click();await page.locator('[aria-label="选中任务详情"]').waitFor();
 await linkage.getByLabel('仅显示问题任务',{exact:true}).check();await page.screenshot({path:E+'/05-return-filter.png',fullPage:true});results.push({id:'UI-PROBLEM-INPUT-RETURN',status:'PASS',taskId:'B-MIX',physicalRow:2});
 const result=page.getByRole('button').filter({hasText:'VERIFY / CALENDAR_INTERVAL'});assert.ok(await result.count()>=3); // ResultPanel, TaskLinkage, issue list
 const resultPanel=page.locator('section.panel').filter({has:page.locator('h2').filter({hasText:'结果状态与未排原因'})});
 await resultPanel.getByRole('button').filter({hasText:'VERIFY / CALENDAR_INTERVAL'}).click();assert.ok((await refs.innerText()).includes('B-MIX'));
 const timeline=page.getByRole('region',{name:'机器甘特图与任务时间表',exact:true});await timeline.getByLabel('机器筛选',{exact:true}).selectOption('MIX01');
 await timeline.getByRole('button').filter({hasText:'显示选中任务'}).click();assert.equal(await timeline.getByLabel('机器筛选',{exact:true}).inputValue(),'');
 await timeline.locator('.fr033-detail').filter({hasText:'任务详情：B-MIX'}).getByRole('button').filter({hasText:'查看方案输入 downtime'}).click();await query.getByRole('button',{name:'返回同任务 B-MIX',exact:true}).click();
 results.push({id:'UI-RESULT-TIMELINE-FILTER-RETURN',status:'PASS',taskId:'B-MIX'});
 await page.getByRole('button',{name:'保存快照',exact:true}).click();await page.reload();await page.getByLabel('已保存方案',{exact:true}).selectOption(p.id);await page.getByLabel('操作原因',{exact:true}).fill('Issue6 export frozen diagnosis');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出 CSV',exact:true}).click();await (await download).saveAs(E+'/plan.csv');assert.ok(fs.readFileSync(E+'/plan.csv','utf8').includes('CALENDAR_INTERVAL'));results.push({id:'UI-SAVE-REOPEN-EXPORT',status:'PASS'});
 const old=(await f.ok('/plans')).find(x=>x.id===p.id),current=await f.ok('/state');
 await f.ok('/inputs',{revision:current.revision,tables:{downtime:current.data.downtime.map(r=>({...r,'结束分钟':'10'}))}});
 await page.reload();await page.getByLabel('已保存方案',{exact:true}).selectOption(p.id);
 await linkage.getByRole('button').filter({hasText:'CALENDAR_INTERVAL'}).click();
 for(let i=0;i<await refs.locator('tbody tr').count();i++)if((await refs.locator('tbody tr').nth(i).innerText()).includes('设备停机')){await refs.locator('tbody tr').nth(i).getByRole('button').click();break;}
 assert.ok((await refs.innerText()).includes('15'));await refs.getByRole('button',{name:'查询关联记录',exact:true}).click();assert.ok((await query.innerText()).includes(old.inputVersionId));assert.ok((await query.innerText()).includes('15'));await query.getByRole('button',{name:'返回同任务 B-MIX',exact:true}).click();
 await page.screenshot({path:E+'/06-old-source-after-new-input.png',fullPage:true});results.push({id:'UI-OLD-SOURCE-NEW-INPUT',status:'PASS',frozenEnd:15,currentEnd:10});
 dump('store.json',JSON.parse(f.bytes()));dump('page.txt',await page.locator('body').innerText());assert.deepEqual(errors,[]);
}finally{dump('results.json',results);dump('runtime.json',{node:process.version,chromium:browser.version(),errors,identity:'synthetic fixture; not Portal SSO'});await browser.close();await f.close();}
