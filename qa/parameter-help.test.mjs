import test from 'node:test';
import assert from 'node:assert/strict';
import {parameterCatalog,atomicFields,specification,validateAtomic} from '../server/parameter-contract.mjs';
import {parameterHelp,relationParameterHelp} from '../server/parameter-help.mjs';
import {cpImpacts,fieldGuides} from '../server/parameter-help-content.mjs';
import {parameterMaintenanceView,parameterTabs} from '../server/parameter-maintenance.mjs';
const definition=cp=>parameterCatalog.find(c=>c['参数编号']===cp);
const help=(field,context={})=>{const spec=specification(field);return parameterHelp(definition(spec.cp),spec,context);};
test('all 181 catalogue items and all 77 executable fields have authored impact and value explanations',()=>{
 assert.equal(parameterCatalog.length,181);assert.equal(atomicFields.length,77);
 for(const c of parameterCatalog){assert.ok(cpImpacts[c['参数编号']],c['参数编号']);const h=parameterHelp(c);for(const key of ['meaning','impact','maintain','bounds','zero','one','blank','usage'])assert.ok(h[key]?.trim(),c['参数编号']+'/'+key);}
 for(const f of atomicFields){assert.ok(fieldGuides[f.name],f.name);const h=help(f.name);assert.equal(h.inputSpec.type,f.type);assert.equal(h.inputSpec.min,f.min);assert.equal(h.inputSpec.max,f.max);assert.equal(h.inputSpec.integer,f.integer);assert.equal(h.inputSpec.inclusive,f.inclusive);assert.ok(h.zero);assert.ok(h.one);}
});
test('CP179 is an enumeration, never a 0/1 switch; actual day-model non-use is explicit',()=>{
 const day=help('资源占用方式'),minute=help('资源占用方式',{productionContract:'workbook-minute-v2'});
 assert.deepEqual(day.options.map(o=>o.value),['独占','重量共享','重量容量共享']);assert.ok(day.zero.includes('不接受0'));assert.ok(day.one.includes('不接受1'));assert.ok(day.usage.includes('日模型'));assert.ok(!minute.usage.includes('当前数据按日模型'));
 assert.throws(()=>validateAtomic(specification('资源占用方式'),'1'));assert.equal(validateAtomic(specification('资源占用方式'),'重量共享'),'重量共享');
});
test('zero/one have different meanings for duration, ratios, counts, and day-minute offsets',()=>{
 assert.ok(help('跨日历时天数').zero.includes('仍消耗时间'));assert.ok(help('跨日历时天数').one.includes('1440'));assert.ok(help('跨日历时天数').usage.includes('不接受0.5'));
 assert.ok(help('到货剩余保质比例').one.includes('100%'));assert.ok(help('生产班次数').zero.includes('不允许新开工'));assert.ok(help('生产班次数').one.includes('1班'));
 assert.ok(help('第一班开始分钟').zero.includes('00:00'));assert.ok(help('第一班开始分钟').one.includes('00:01'));assert.ok(help('基准加工量千克').zero.includes('不合法'));
 assert.ok(help('甘特显示刻度分钟').one.includes('仅接受30'));assert.ok(help('计划起始日').one.includes('2026-11-01'));
});
test('reference and candidate fields do not claim to change the planner',()=>{
 assert.ok(help('仓储损耗参考率').usage.includes('不自动扣减库存'));assert.ok(help('服务优先级').usage.includes('不会仅因修改'));
 assert.ok(help('供应延期概率').usage.includes('不参与排程'));
 assert.ok(help('每班可用分钟',{productionContract:'workbook-minute-v2'}).usage.includes('未用此声明值替代窗口'));
 assert.ok(help('最大等待天数').bounds.includes('最小等待不得大于最大等待'));assert.ok(help('最高温度').bounds.includes('不得高于'));
});
test('every tab exposes help even for missing or readonly parameters without mutating input or expanding business versions',()=>{
 const d={id:'SYNTHETIC-HELP',version:1,tables:{},parameterRevision:0},before=JSON.stringify(d),seen=new Set();
 for(const tab of parameterTabs){const list=parameterMaintenanceView(d,{tab:tab.id});for(const c of list.definitions){const view=parameterMaintenanceView(d,{tab:tab.id,cp:c['参数编号']});for(const r of view.records){seen.add(r.cp);assert.ok(view.helpByField[r.cp+'|'+r['参数名称']],r.recordKey);}}}
 assert.equal(seen.size,181);assert.equal(JSON.stringify(d),before);
});
test('structured source editors reuse atomic definitions and document identities, derived values and expiry boundaries',()=>{
 const fields=[{name:'资源占用方式'},{name:'可用数量'},{name:'资源编号',type:'文字'},{name:'到期日',type:'整数日'},{name:'计算量',derived:true}],h=relationParameterHelp('设备与工装',fields);
 assert.deepEqual(h['资源占用方式'].inputSpec.values,['独占','重量共享','重量容量共享']);assert.ok(h['可用数量'].zero.includes('不可分配'));assert.ok(h['资源编号'].maintain.includes('不能在原记录中修改'));assert.ok(h['到期日'].meaning.includes('当天不再可用'));assert.equal(h['计算量'].usage,'派生字段只读。');
});
