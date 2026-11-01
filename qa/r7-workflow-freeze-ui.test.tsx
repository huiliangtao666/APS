import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {WorkbookResult} from '../src/InputData';import {ProcessCoverage} from '../src/ConfirmationPanel';
const dir=process.env.R7_CORE_OUT!;
const actual=JSON.parse(fs.readFileSync(dir+'/small-freeze-chain.json','utf8'));
const text=(ui:any)=>ui;
async function renderRun(run:any){return renderToStaticMarkup(<WorkbookResult run={run} canWrite={false} canExport={true} api={async()=>{}} perform={async()=>{}} onRun={()=>{}} onLocate={()=>{}} onDraft={()=>{}} onExport={()=>{}}/>);}
test('actual saved Worker data renders selected version, source, successful/partial status and native source link',async()=>{
 const ui=await renderRun(actual.a),s=text(ui);for(const value of ['运行完成',actual.a.inputHash,actual.a.provenance.mappingHash,actual.a.provenance.parameterHash,'2026-11-01','2026-11-15','通过','部分未排不是全部完成'])assert.ok(s.includes(value),value);
 assert.ok(s.includes('source?version='+actual.a.version));
 const partial=await renderRun({...actual.a,status:'partial'});assert.ok(text(partial).includes('部分未排'));
});
test('failed and unchecked are distinct and retain frozen selection provenance',async()=>{
 const failure=JSON.parse(fs.readFileSync(dir+'/small-worker-failure.json','utf8')),failed=await renderRun(failure);for(const value of ['运行失败',failure.failure,failure.inputHash])assert.ok(text(failed).includes(value));assert.ok(!text(failed).includes('运行完成'));
 const notChecked=await renderRun({...actual.a,result:{...actual.a.result,verification:{status:'not_checked',scope:[],notChecked:['必要能力未检查']}}});assert.ok(text(notChecked).includes('未检查'));assert.ok(text(notChecked).includes('必要能力未检查'));
});
test('actual partial kg review makes incomplete route explicit in the confirmation component',()=>{
 const report=JSON.parse(fs.readFileSync(dir+'/core-partial-accepted.json','utf8'));
 const s=renderToStaticMarkup(<ProcessCoverage check={report.independentChecks.checks.processRoute}/>);
 assert.ok(s.includes('完整路线仍有'));assert.ok(s.includes('不能作为全部完成'));
 assert.equal(renderToStaticMarkup(<ProcessCoverage check={{coverage:'complete'}}/>),'');
});
