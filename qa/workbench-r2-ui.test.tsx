import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {InputData} from '../src/InputData';import {WorkbookRunView} from '../src/WorkbookRunView';
const api=async()=>{throw Error('SSR must not invoke API');};
test('SSR default workbench shows two separately named import cards and explicit no-target/readonly reasons',()=>{
 const html=renderToStaticMarkup(<InputData api={api} canWrite={false} canExport={false} reason=""/>);assert.match(html,/排程工作台 · Excel 日语义主线/);assert.match(html,/业务数据Excel导入/);assert.match(html,/配置参数Excel导入/);assert.match(html,/请先建立业务数据集/);assert.match(html,/角色只读/);assert.match(html,/候选不参与计算/);assert.match(html,/A1 数据准备/);assert.match(html,/disabled/);
});
test('SSR day-axis bars use only this workbook run tasks and retain exact boundaries in accessible labels',()=>{
 const run={id:'SYN-R',datasetId:'SYN-D',version:3,inputHash:'INPUT',resultHash:'RESULT',selection:{startDay:1,endDay:15},provenance:{timeUnit:'day',dayZero:'2026-10-31',fileHash:'BUSINESS',parameterHash:'PARAM',mappingHash:'MAP'},result:{timeUnit:'day',dayZero:'2026-10-31',source:{datasetId:'SYN-D',version:3,fileHash:'BUSINESS',parameterHash:'PARAM',mappingHash:'MAP'},tasks:[{id:'SYN-T',machine:'SYN-M',quantity:180,start:4,end:4.25,tools:['SYN-TOOL']}],findings:[],verification:{status:'pass'}}};
 const html=renderToStaticMarkup(<WorkbookRunView run={run} api={api}/>);assert.match(html,/data-run-id="SYN-R"/);assert.match(html,/data-input-hash="INPUT"/);assert.match(html,/data-result-hash="RESULT"/);assert.match(html,/SYN-T 180千克 开始日4 结束日4.25/);assert.match(html,/21.428571428571427%/);assert.match(html,/1.7857142857142856%/);assert.doesNotMatch(html,/原生分钟甘特/);
 const bad=structuredClone(run);bad.result.source.datasetId='NATIVE';const refused=renderToStaticMarkup(<WorkbookRunView run={bad} api={api}/>);assert.match(refused,/身份不一致/);assert.doesNotMatch(refused,/day-task/);
});
