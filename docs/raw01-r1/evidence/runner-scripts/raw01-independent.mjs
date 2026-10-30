import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';
import {filesOf} from './fr013-main-fixture.mjs';
import {seed,defs} from '../server/planner.ts';
import {inspectCsvBatch} from '../server/csv-batch.mjs';
const out='/evidence/independent',report={checks:[],failures:[],errors:[],proofs:[]};fs.mkdirSync(out,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
function snapshot(f){let raw=f.bytes(),s=JSON.parse(raw);return {whole:hash(raw),bytes:Buffer.byteLength(raw),revision:s.revision,data:hash(JSON.stringify(s.data)),plans:hash(JSON.stringify(s.plans)),audit:hash(JSON.stringify(s.records)),facts:hash(JSON.stringify([s.data.executionFacts,s.data.executionMaterials,s.data.executionSources]))};}
const f=await fixture(null,{browser:true});let browser;
async function denied(name,endpoint,body,status,role='planner',headers={}){let before=snapshot(f),r=await f.call(endpoint,body,role,headers),after=snapshot(f);assert.equal(r.status,status,JSON.stringify(r));assert.deepEqual(after,before);report.proofs.push({name,status,error:r.body.error,before,after});return r;}
try{
 await f.ok('/calculate',{revision:0});
 const p=await f.ok('/imports/preview',{revision:0,files:filesOf(seed)}),now=Date.now;Date.now=()=>now()+900001;
 try{await denied('15-minute expiry accelerated clock','/imports/commit',{previewId:p.id},409);}finally{Date.now=now;}
 await denied('forged serialized token','/imports/commit',{previewId:JSON.stringify({...p,actor:'test#planner',revision:0})},409);
 const owner=await f.ok('/imports/preview',{revision:0,files:filesOf(seed)});
 await denied('wrong genuine member owner','/imports/commit',{previewId:owner.id},409,'supervisor');
 await denied('query spoof','/imports/commit',{previewId:owner.id,actor:'planner',role:'supervisor'},403,'query',{'x-role':'supervisor'});
 await denied('CSRF','/imports/commit',{previewId:owner.id},403,'planner',{origin:'https://evil.invalid'});
 await denied('required reason','/imports/commit',{previewId:owner.id,reason:' \t '},400);
 for(const key of ['records','plans','data']){
  const p=await f.ok('/imports/preview',{revision:0,files:filesOf(seed)}),file=path.join(f.dir,'business.json'),s=JSON.parse(f.bytes());
  if(key==='records')s.records.push({...s.records[0],id:'independent-audit-only'});
  if(key==='plans')s.plans[0].independentProbe='changed';
  if(key==='data')s.data.orders[0]['优先顺序']='3';
  fs.writeFileSync(file,JSON.stringify(s));await denied('stale '+key+' unchanged revision','/imports/commit',{previewId:p.id},409);
 }
 report.checks.push('expiry/forged payload/owner/query/CSRF/reason and separate audit-plan-input stale guards');
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(f.url);await page.getByLabel('操作原因',{exact:true}).fill('APS-Test independent newline correction');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();
 const panel=page.locator('[data-csv-batch]'),editor=panel.getByRole('textbox',{name:'批量 CSV 修正原文',exact:true});
 async function upload(files){await panel.getByLabel('选择批量 CSV',{exact:true}).setInputFiles(files.map(x=>({name:x.name,mimeType:'text/csv',buffer:Buffer.from(x.text)})));await panel.getByRole('status').filter({hasText:'已读取文件'}).waitFor();await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();await panel.getByText('预览结果：',{exact:false}).waitFor();}
 async function repreview(){const pending=page.waitForRequest(r=>r.url().endsWith('/api/imports/preview')&&r.method()==='POST');await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();const req=await pending;await panel.getByText('检查通过，尚未导入。',{exact:true}).waitFor();return req.postDataJSON();}
 for(const [index,nl] of ['\r','\n','\r\n','mixed'].entries()){
  const d=structuredClone(seed);d.machines[0]['设备名称']='A,"Q"\rB\nC\r\nD';d.machines[1]['最大装载kg']='bad';d.orders[0]['优先顺序']=String(index+4);
  const files=filesOf(d);if(nl!=='mixed')for(const file of files)file.text=file.text.replace(/\r\n/g,nl);
  const machine=files.find(x=>x.name===defs.find(d=>d.key==='machines').file),scan=inspectCsvBatch(files,defs),row=scan.sources.machines.lines[1],before=snapshot(f);
  await upload(files);assert.deepEqual(snapshot(f),before);
  const issue=panel.getByRole('button',{name:new RegExp('定位 03_设备资源配置.csv 第'+row+'行 · 最大装载kg')});await issue.focus();await page.keyboard.press('Enter');await editor.waitFor();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='批量 CSV 修正原文');
  const actual=await editor.evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,text:e.value.slice(e.selectionStart,e.selectionEnd),focused:document.activeElement===e}));
  const normalized=machine.text.replace(/\r\n?/g,'\n'),lines=normalized.split('\n'),start=lines.slice(0,row-1).reduce((n,s)=>n+s.length+1,0),expected=lines[row-1]+(row<=lines.length-1?'\n':'');
  assert.deepEqual(actual,{start,end:start+expected.length,text:expected,focused:true});
  await editor.fill((await editor.inputValue()).replace('"bad"','"1200"'));const sent=await repreview(),expectedFiles=files.map(x=>({...x,text:x.text.replace('"bad"','"1200"')}));assert.deepEqual(sent.files,expectedFiles);assert.deepEqual(snapshot(f),before);
  fs.writeFileSync(out+'/physical-'+index+'.json',JSON.stringify({newline:nl,row,selection:actual,original:files,corrected:sent.files},null,2));
  await panel.getByRole('button',{name:'确认整批导入',exact:true}).click();await panel.getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();const saved=await f.ok('/state');assert.equal(saved.data.machines[0]['设备名称'],scan.tables.machines[0]['设备名称']);assert.equal(saved.data.machines[1]['最大装载kg'],'1200');
  report.proofs.push({name:'physical correction '+index,before,after:snapshot(f)});report.checks.push('exact physical selection and all unmodified raw files preserved '+JSON.stringify(nl));
 }
 // Two edits in one textarea replacement span include untouched mixed newlines.
 const d=structuredClone(seed);d.machines[0]['设备名称']='START\rKEEP_CR\nKEEP_LF\r\nKEEP_CRLF';d.machines[1]['最大装载kg']='bad';const files=filesOf(d),machine=files.find(x=>x.name.startsWith('03_'));await upload(files);
 await panel.getByRole('button',{name:/定位 03_设备资源配置.csv 第6行 · 最大装载kg/}).click();await editor.waitFor();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='批量 CSV 修正原文');
 const value=(await editor.inputValue()).replace('START','CHANGED').replace('"bad"','"1200"');await editor.fill(value);const sent=await repreview(),actual=sent.files.find(x=>x.name===machine.name).text,expected=machine.text.replace('START','CHANGED').replace('"bad"','"1200"');
 const bad={name:'two-separated-corrections preserve untouched mixed newline contents',original:machine.text,expected,actual,expectedParsed:inspectCsvBatch([{...machine,text:expected}],defs).tables.machines,actualParsed:inspectCsvBatch([{...machine,text:actual}],defs).tables.machines};
 fs.writeFileSync(out+'/multi-edit.json',JSON.stringify(bad,null,2));
 if(actual!==expected){report.failures.push({id:'FR013-MAIN-RAW01',...bad});await page.screenshot({path:out+'/multi-edit-before-commit.png',fullPage:true});await panel.getByRole('button',{name:'确认整批导入',exact:true}).click();await panel.getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();bad.saved=(await f.ok('/state')).data.machines[0]['设备名称'];fs.writeFileSync(out+'/multi-edit.json',JSON.stringify(bad,null,2));report.failures.at(-1).saved=bad.saved;}
 else report.checks.push(bad.name);
 // Removing the selected draft is cancellation and causes no business write.
 await upload(filesOf(seed));let before=snapshot(f);for(const name of filesOf(seed).map(x=>x.name))await panel.getByRole('button',{name:'移除 '+name,exact:true}).click();assert.deepEqual(snapshot(f),before);assert.equal(await panel.getByRole('button',{name:'确认整批导入',exact:true}).isEnabled(),false);report.checks.push('UI remove draft cancellation persists no business writes');
 assert.deepEqual(report.errors,[]);report.complete=true;
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();await f.close();}
console.log(JSON.stringify({checks:report.checks.length,failures:report.failures.map(x=>x.id),proofs:report.proofs.length,errors:report.errors}));
