import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';import {seed} from '../server/planner.ts';
const out='/evidence/raw01-controls';fs.mkdirSync(out,{recursive:true});
const f=await fixture(null,{browser:true}),report={origin:'APS-Dev positive controls; actual React/Express, synthetic membership actors/runtime alias',checks:[],errors:[]};let browser,page;
const hash=s=>createHash('sha256').update(s).digest('hex'),visible=s=>s.replace(/\r\n?/g,'\n');
try{
 await f.ok('/calculate',{revision:0});
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(f.url);await page.getByLabel('操作原因',{exact:true}).fill('RAW01 round1 positive byte controls');await page.getByRole('button',{name:'数据与 CSV',exact:true}).click();
 const panel=page.locator('[data-csv-batch]'),editor=panel.getByRole('textbox',{name:'批量 CSV 修正原文',exact:true});
 const variants=[['CR','\r','selectall'],['LF','\n','selectall'],['CRLF','\r\n','selectall'],['mixed','\r\n','selectall'],['repeat','\r\n','selectall'],['range','\r\n','range'],['paste','\r\n','paste']];
 for(const [index,[label,nl,mode]] of variants.entries()){
  const d=structuredClone(seed);let name='START\r同一,"引号"\n🧪\r\nKEEP';
  if(label==='repeat')name='START\rKEEP\nKEEP\r\nKEEP\rKEEP\nKEEP\r\nKEEP';
  d.machines[0]['设备名称']=name;d.machines[1]['最大装载kg']='bad';d.orders[0]['优先顺序']=String(index+10);
  const files=filesOf(d);if(['CR','LF','CRLF'].includes(label)){for(const file of files)file.text=file.text.replace(/\r\n/g,nl);name=name.replace(/\r\n/g,nl);}
  const original=files.find(x=>x.name.startsWith('03_'));const before=f.bytes(),state=JSON.parse(before);
  await panel.getByLabel('选择批量 CSV',{exact:true}).setInputFiles(files.map(x=>({name:x.name,mimeType:'text/csv',buffer:Buffer.from(x.text)})));await panel.getByRole('status').filter({hasText:'已读取文件'}).waitFor();await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();
  const issue=panel.getByRole('list',{name:'批量导入问题'}).getByRole('button').filter({hasText:'最大装载kg'});await issue.focus();await page.keyboard.press('Enter');await editor.waitFor();
  // locate() intentionally selects in requestAnimationFrame, after mounting.
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='批量 CSV 修正原文');assert.ok(await editor.evaluate(e=>document.activeElement===e));
  const selected=await editor.evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,text:e.value.slice(e.selectionStart,e.selectionEnd)}));assert.ok(selected.text.includes('bad'));
  // Dispatch an unchanged input event: textarea normalization must cause no raw change.
  await editor.dispatchEvent('input');
  const changed=mode==='paste'?'CHANGED\nNEW,"quoted"\n文本':'CHANGED';
  const expected=original.text.replace('START',changed.replaceAll('"','""')).replace('"bad"','"1200"');
  if(mode==='range'){
   // Set the native range as a user would select text, then use real keyboard
   // Backspace and insertText. Product onChange and preview remain unmodified.
   for(const [old,replacement] of [['START','CHANGED'],['bad','1200']]){
    await editor.evaluate((e,needle)=>{const i=e.value.indexOf(needle);e.focus();e.setSelectionRange(i,i+needle.length);},old);
    await page.keyboard.press('Backspace');await page.keyboard.insertText(replacement);
   }
  }else{await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(visible(expected));}
  const request=page.waitForRequest(r=>r.url().endsWith('/api/imports/preview')&&r.method()==='POST');await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();const sent=(await request).postDataJSON();await panel.getByText('检查通过，尚未导入。',{exact:true}).waitFor();
  assert.deepEqual(sent.files,files.map(x=>({...x,text:x.name===original.name?expected:x.text})));assert.equal(f.bytes(),before);
  await panel.getByRole('button',{name:'确认整批导入',exact:true}).focus();await page.keyboard.press('Enter');await panel.getByText('整批导入成功，已保存新输入版本和操作记录。',{exact:true}).waitFor();
  const saved=await f.ok('/state'),after=f.bytes(),persisted=JSON.parse(after);assert.equal(saved.revision,index+1);assert.equal(saved.data.machines[0]['设备名称'],name.replace('START',changed));assert.equal(saved.data.machines[1]['最大装载kg'],'1200');assert.deepEqual(persisted.plans,state.plans);
  for(const key of ['executionFacts','executionMaterials','executionSources'])assert.deepEqual(saved.data[key],state.data[key]);
  fs.writeFileSync(out+'/'+label+'-original.csv',original.text);fs.writeFileSync(out+'/'+label+'-expected.csv',expected);fs.writeFileSync(out+'/'+label+'-actual.csv',sent.files.find(x=>x.name===original.name).text);fs.writeFileSync(out+'/'+label+'-business.json',after);
  report.checks.push({label,mode,selected,beforeSha256:hash(before),afterSha256:hash(after),expectedSha256:hash(expected),actualSha256:hash(sent.files.find(x=>x.name===original.name).text),savedName:saved.data.machines[0]['设备名称'],revision:saved.revision,previewZeroWrites:true,plansPreserved:true,factsPreserved:true});
 }
 const beforeRepeat=f.bytes();await panel.getByRole('button',{name:'预览并检查整批',exact:true}).click();await panel.getByText('检查通过，尚未导入。',{exact:true}).waitFor();await panel.getByRole('button',{name:'确认整批导入',exact:true}).click();await panel.getByText('重复导入内容相同，没有新增数据或操作记录。',{exact:true}).waitFor();assert.equal(f.bytes(),beforeRepeat);report.repeatNoOp=true;
 await page.screenshot({path:out+'/final.png',fullPage:true});assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page)await page.screenshot({path:out+'/failure.png',fullPage:true});throw e;}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();await f.close();}
console.log('RAW01_CONTROLS_PASS '+report.checks.length+' keyboard/byte/persist controls');
