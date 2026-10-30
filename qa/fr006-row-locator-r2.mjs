// Targeted real root React/Express regression. No production identity claim.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {fixture} from './fr027-fixture.mjs';
import {defs} from '../server/planner.ts';
const baseline=process.env.BASELINE==='1',out='/evidence';
const r={baseline,cases:[],pageerrors:[],identity:'root React/Express; isolated business.json; synthetic planner actor'};
const hash=x=>createHash('sha256').update(x).digest('hex');
const f=await fixture(null,{browser:true});let browser,page;
const tool={工装编码:'LOC-A',工装名称:'定位工装A',适用任务:'MIX',可用数量:'2',每任务需求数量:'1',提前占用分钟:'5',后延占用分钟:'10',是否启用:'是',说明:'定位测试',可用起始分钟:'0',可用结束分钟:'600'};
const tools=[tool,{...tool,工装编码:'LOC-B',工装名称:'定位工装B'}];
const editor=()=>page.getByRole('region',{name:'模拟记录编辑',exact:true});
const panel=()=>page.locator('[data-csv-single]');
const field=(i,k)=>editor().getByLabel(`工装配置 ${i+1} ${k}`,{exact:true});
const open=async()=>{await page.reload();await page.getByLabel('操作原因',{exact:true}).fill('Issue3 row locator r2');await page.getByRole('button',{name:'工装配置',exact:true}).click();await field(1,'工装编码').waitFor();};
const headers=defs.find(d=>d.key==='tools').fields;
const csv=rows=>[headers,...rows.map(row=>headers.map(k=>row[k]||''))].map(row=>row.map(v=>/[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v).join(',')).join('\r\n');
const verifyIssues=(issues,expected)=>{
 assert.ok(issues.length);const actual=new Set();
 for(const i of issues){assert.equal(i.file,'18_工装配置.csv');assert.equal(i.table,'tools');assert.ok(expected.includes(i.row+':'+i.field),JSON.stringify(i));actual.add(i.row+':'+i.field);}
 assert.deepEqual([...actual].sort(),[...expected].sort());
};
try{
 await f.ok('/inputs',{revision:0,tables:{tools}});assert.equal((await f.ok('/state')).revision,1);
 browser=await chromium.launch({headless:true});r.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',e=>r.pageerrors.push(e.message));await page.goto(f.url);
 const scenarios=[
  {id:'second-row-zero',changes:[[1,'可用数量','0']]},
  {id:'multi-row-multi-field',changes:[[0,'可用数量','0'],[0,'每任务需求数量','0'],[1,'可用数量','0'],[1,'每任务需求数量','0']]},
  {id:'strict-safe-decimal',changes:[[0,'可用数量','1e2'],[1,'每任务需求数量','9007199254740992']]},
  {id:'other-fields',changes:[[0,'工装名称',''],[1,'适用任务',''],[1,'后延占用分钟','-1']]}
 ];
 for(const sc of baseline?scenarios.slice(0,1):scenarios){
  await open();const before=f.bytes();for(const[i,k,v]of sc.changes)await field(i,k).fill(v);
  let pending=page.waitForResponse(x=>x.url().endsWith('/api/inputs')&&x.request().method()==='POST');await editor().getByRole('button',{name:'保存修改',exact:true}).click();let res=await pending;assert.equal(res.status(),400);const ui=await res.json();assert.equal(f.bytes(),before);
  const record={id:sc.id,status:400,uiIssues:ui.issues,beforeHash:hash(before),afterUIHash:hash(f.bytes()),uiClicks:[],csvClicks:[]};r.cases.push(record);
  if(!baseline)verifyIssues(ui.issues,sc.changes.map(([i,k])=>(i+2)+':'+k));
  for(const [index,issue] of ui.issues.entries()){const button=editor().getByRole('list',{name:'保存问题定位'}).getByRole('button').nth(index);await button.click();const focus=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label'),value:document.activeElement.value}));record.uiClicks.push({issue,focus});if(!baseline)assert.equal(focus.label,`工装配置 ${issue.row-1} ${issue.field}`);}
  const rows=structuredClone(tools);for(const[i,k,v]of sc.changes)rows[i][k]=v;
  // Quoted embedded newline makes the second record start at physical row 4.
  const multiline=sc.id!=='second-row-zero';if(multiline)rows[0]['说明']='第一物理行\r\n第二物理行';const text=csv(rows);fs.writeFileSync(out+'/'+sc.id+'.csv',text);
  pending=page.waitForResponse(x=>x.url().endsWith('/api/imports/preview'));await panel().getByLabel('导入单表 CSV',{exact:true}).setInputFiles({name:'18_工装配置.csv',mimeType:'text/csv',buffer:Buffer.from(text)});res=await pending;assert.equal(res.status(),400);const preview=await res.json();record.csvIssues=preview.issues;record.afterPreviewHash=hash(f.bytes());assert.equal(f.bytes(),before);assert.ok(!preview.id);assert.equal(await panel().getByRole('button',{name:'确认单表导入',exact:true}).isEnabled(),false);
  if(!baseline)verifyIssues(preview.issues,sc.changes.map(([i,k])=>(i===0?2:multiline?4:3)+':'+k));
  for(const [index,issue] of preview.issues.entries()){await panel().getByRole('list',{name:'单表导入问题'}).getByRole('button').nth(index).click();const selected=await panel().getByLabel('单表 CSV 原文',{exact:true}).evaluate(e=>({focused:document.activeElement===e,start:e.selectionStart,end:e.selectionEnd,text:e.value.slice(e.selectionStart,e.selectionEnd)}));record.csvClicks.push({issue,selected});if(!baseline){assert.equal(selected.focused,true);assert.ok(selected.text.includes(issue.row===2?'LOC-A':'LOC-B'));}}
  await page.screenshot({path:out+'/'+sc.id+'.png',fullPage:true});record.result=baseline?'REPRODUCED':'PASS';
 }
 if(!baseline){
  await open();const before=f.bytes(),rows=structuredClone(tools);rows[1]['可用数量']='3';const text=csv(rows);fs.writeFileSync(out+'/valid-two-row.csv',text);
  const pending=page.waitForResponse(x=>x.url().endsWith('/api/imports/preview'));await panel().getByLabel('导入单表 CSV',{exact:true}).setInputFiles({name:'18_工装配置.csv',mimeType:'text/csv',buffer:Buffer.from(text)});const res=await pending;assert.equal(res.status(),200);const preview=await res.json();assert.equal(preview.valid,true);assert.equal(f.bytes(),before);
  const commit=page.waitForResponse(x=>x.url().endsWith('/api/imports/commit'));await panel().getByRole('button',{name:'确认单表导入',exact:true}).click();assert.equal((await commit).status(),200);await page.getByRole('status').filter({hasText:'工装 CSV 导入已保存，请核对当前数据及版本。'}).waitFor();await open();const state=await f.ok('/state');assert.equal(state.revision,2);assert.deepEqual(state.data.tools,rows);assert.equal(await field(1,'可用数量').inputValue(),'3');r.cases.push({id:'valid-confirm-reopen',result:'PASS',previewStatus:200,commitStatus:200,fromRevision:1,toRevision:2,beforeHash:hash(before),afterHash:hash(f.bytes())});await page.screenshot({path:out+'/valid-reopen.png',fullPage:true});
 }
 assert.deepEqual(r.pageerrors,[]);r.complete=true;
}catch(e){r.failure=e.stack;if(page){r.visibleText=await page.locator('body').innerText();await page.screenshot({path:out+'/failure.png',fullPage:true});}throw e;}finally{fs.writeFileSync(out+'/row-locator-results.json',JSON.stringify(r,null,2));await browser?.close();await f.close();}
