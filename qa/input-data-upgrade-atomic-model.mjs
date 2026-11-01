import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {refreshDerived,validateWorkbook,workbookSchema,hash} from '../server/workbook-model.mjs';

const dir=process.env.ATOMIC_FIXTURES;if(!dir)throw Error('ATOMIC_FIXTURES required');
const results=[];
function load(name){const p=parseWorkbook(fs.readFileSync(path.join(dir,name+'.xlsx')),workbookSchema);refreshDerived(p);return {...p,validation:validateWorkbook(p)};}
function check(id,fn){try{const details=fn();results.push({id,result:'PASS',details});}catch(e){results.push({id,result:'FAIL',message:e.message,stack:e.stack});}}
const issue=(d,code)=>[...d.issues,...d.validation].find(i=>i.code===code);
check('IN04-real-physical-FK-location',()=>{const d=load('unknown-child'),i=issue(d,'FOREIGN_KEY');assert.deepEqual([i.sheet,i.row,i.record,i.field,i.cell],['物料清单',3,'BM001','子项编号','E3']);assert.ok(i.message.includes('UNKNOWN99'));return i;});
check('IN05-sheet-Chinese-header-reorder-and-parameter-identity',()=>{
 const a=load('valid'),b=load('valid-reorder');assert.deepEqual(a.issues,[]);assert.deepEqual(a.validation,[]);assert.deepEqual(b.issues,[]);assert.deepEqual(b.validation,[]);
 const semantic=d=>Object.fromEntries(Object.keys(d.tables).sort().map(t=>[t,d.tables[t].map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('_')).sort()))]));
 assert.deepEqual(semantic(a),semantic(b));assert.equal(b.bindings[0].parameterId,'PA0001');b.tables['配置参数'][0]['参数值']='5';refreshDerived(b);assert.equal(b.tables['物料主数据'][0]['生产提前期天数'],'5');assert.equal(b.tables['物料主数据'][0]['累计提前期天数'],'14');return {semanticHash:hash(semantic(a)),parameterId:b.bindings[0].parameterId,afterParameterEdit:'14'};
});
check('IN05-parameter-value-column-shift',()=>{const d=load('valid-reorder-shift');assert.deepEqual(d.issues,[]);assert.deepEqual(d.validation,[]);assert.equal(d.bindings[0].parameterId,'PA0001');assert.equal(d.tables['配置参数'][0]._cells['参数值'],'C3');d.tables['配置参数'][0]['参数值']='5';refreshDerived(d);assert.equal(d.tables['物料主数据'][0]['累计提前期天数'],'14');return {parameterValueCell:'C3',parameterId:'PA0001',lead:'14'};});
for(const [name,code]of [['duplicate-header','DUPLICATE_HEADER'],['unknown-column','UNKNOWN_FIELD'],['unheaded-column','UNKNOWN_FIELD']])check('IN05-'+name,()=>{const i=issue(load(name),code);assert.ok(i?.cell);assert.equal(i.sheet,'物料清单');assert.ok(i.row>=2);return i;});
check('IN06-stale-cache-recompute-and-single-literal-source',()=>{const d=load('valid');assert.deepEqual(d.validation,[]);assert.equal(d.tables['配置参数'][0]['参数值'],'4');assert.equal(d.tables['物料主数据'][0]['生产提前期天数'],'4');assert.equal(d.tables['物料主数据'][0]['累计提前期天数'],'13');const w=d.warnings.find(i=>i.code==='STALE_CACHE');assert.deepEqual([w.sheet,w.cell,w.cached,w.value],['物料主数据','G3','3','4']);return {warning:w,FG001:'4+1+(2+1+(1+1+(2+1)))=13',old:'3+1+8=12',binding:d.bindings[0]};});
for(const name of ['parameter-known-formula','parameter-unknown-formula','parameter-external-formula','parameter-empty-formula','derived-unknown-formula','derived-external-formula'])check('IN06-'+name,()=>{const d=load(name),i=issue(d,'INVALID_FORMULA');assert.ok(i?.cell);const t=name.startsWith('parameter')?'配置参数':'物料主数据',field=t==='配置参数'?'参数值':'生产提前期天数';assert.equal(d.tables[t][0][field],'');if(t==='配置参数')assert.ok(d.validation.some(i=>i.sheet===t&&i.field==='参数值'));return {issue:i,rejectedCache:true};});
for(const name of ['sum','max','if','round','roundup'])check('IN06-existing-whitelist-'+name,()=>{const d=load('whitelist-'+name);assert.deepEqual(d.issues,[]);assert.deepEqual(d.validation,[]);assert.equal(d.tables['物料主数据'][0]['生产提前期天数'],'4');return {value:'4',functionsUnchanged:['SUM','MAX','IF','ROUND','ROUNDUP']};});
check('IN17-normal-four-level-BOM',()=>{const d=load('valid');assert.deepEqual(d.validation,[]);assert.deepEqual(d.tables['物料主数据'].map(r=>r['累计提前期天数']),['13','8','5','3']);return {chain:'FG001 → SF001 → SF002 → RM001',cumulative:['13','8','5','3']};});
for(const name of ['self-cycle','multilevel-cycle'])check('IN17-'+name,()=>{const d=load(name),i=issue(d,'BOM_CYCLE');assert.ok(i);assert.ok(i.chain?.length>=(name==='self-cycle'?2:4));assert.equal(i.chain[0],i.chain.at(-1));assert.equal(i.relations.length,i.chain.length-1);assert.ok(i.relations.every(r=>r.record&&r.cells['子项编号']&&r.effective==='0'&&r.expiry==='44'));return i;});
check('IN17-overlap-dates-versions-and-physical-locations',()=>{const i=issue(load('overlap'),'BOM_VERSION_OVERLAP');assert.deepEqual(i.overlap,[43,44]);assert.deepEqual(i.relations.map(r=>r.record),['BM001','BM004']);assert.deepEqual(i.relations.map(r=>r.cells['生效日']),['N3','N6']);return i;});
check('IN17-adjacent-half-open-versions',()=>{const d=load('adjacent');assert.deepEqual(d.issues,[]);assert.deepEqual(d.validation,[]);return {accepted:'[0,44),[44,45)',lead:d.tables['物料主数据'][0]['累计提前期天数']};});
check('IN17-empty-effective-interval',()=>{const d=load('empty-interval');assert.ok(d.validation.some(i=>i.field==='失效日'));return d.validation;});
const report={runtime:{node:process.version,heapLimitMiB:64,execArgv:process.execArgv},results,pass:results.filter(r=>r.result==='PASS').length,fail:results.filter(r=>r.result==='FAIL').length};
if(process.env.ATOMIC_REPORT)fs.writeFileSync(process.env.ATOMIC_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.fail)process.exitCode=1;
