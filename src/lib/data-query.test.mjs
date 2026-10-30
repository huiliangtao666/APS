import test from 'node:test';
import assert from 'node:assert/strict';
import {queryData,related,filterRows,filterOptions,queryCsv,displayValue} from './data-query.mjs';
const data={products:[{'产品编号':'P1'},{'产品编号':'P2'}],orders:[{'订单编号':'O1','产品编号':'P1','订单状态':'正式','要求可交付分钟':'120'},{'订单编号':'O2','产品编号':'P2','订单状态':'取消','要求可交付分钟':'240'}],routes:[{'产品编号':'P1','工序编号':'OP'},{'产品编号':'P2','工序编号':'OP'}],times:[{'产品编号':'P1','工序编号':'OP'}],machines:[{'设备编号':'M1','工序编号':'OP','日历编号':'C'}],calendars:[{'日历编号':'C'}],downtime:[{'设备编号':'M1'}],materials:[{'物料编号':'MAT'}],inventory:[{'物料编号':'MAT','批次编号':'B','已占用数量':'5','质量状态':'冻结','有效期':'2026-11-02'}],supplies:[{'供给编号':'S','物料编号':'MAT','预计可用时间':'2026-11-02T08:00:00+08:00'}],supplyDelays:[{'记录编号':'D','供给编号':'S'}],supplyUses:[{'引用编号':'U','供给编号':'S','订单编号':'O1','工序编号':'OP'}],bom:[{'产品编号':'P1','投料工序编号':'OP','物料编号':'MAT'}],dependencies:[{'订单编号':'O1','工序编号':'OP','资源类型':'人员技能','资源编号':'M1'}],personnelGroups:[{'人员组编号':'M1'}],rules:[{'规则编号':'R','参数JSON':'{"可用质量状态":["合格","条件放行"]}'}]};
const plans=[{id:'plan1',rules:['R'],revision:3,status:'draft',tasks:[{id:'T1',orderId:'O1',productId:'P1',operation:'OP',machine:'M1',start:0,end:30}]},{id:'old',status:'legacy',tasks:[{id:'T2',orderId:'O2',productId:'P2',operation:'OP',machine:'M1',start:60,end:90}]}];
const all=queryData(data,plans,'plan1');
const has=(links,table,index)=>links.some(l=>l.table===table&&l.index===index);
test('all sixteen input categories and selected-plan tasks list, search, detail and export keep every field',()=>{
 assert.equal(Object.keys(data).length,16);
 for(const [table,records] of Object.entries(all)){
  const result=filterRows(all,table);assert.equal(result.length,records.length);assert.deepEqual(result[0].row,records[0]);
  const value=Object.values(records[0])[0];assert.ok(filterRows(all,table,{text:value}).length);
  assert.equal(filterRows(all,table,{text:'no-such-record-xyz'}).length,0);
  assert.ok(queryCsv([{key:table,fields:Object.keys(records[0])}],data,plans,3,{table,planId:'plan1'}).includes('模拟数据'));
 }
});
test('relations retain product and resource-type namespaces and navigate both directions',()=>{
 const links=related(all,'routes',0);assert.ok(has(links,'machines',0));assert.ok(has(links,'times',0));assert.ok(has(links,'dependencies',0));assert.ok(has(links,'bom',0));
 assert.ok(!has(related(all,'routes',1),'dependencies',0));assert.ok(!has(related(all,'routes',1),'tasks',0));
 assert.ok(has(related(all,'dependencies',0),'personnelGroups',0));assert.ok(!has(related(all,'dependencies',0),'machines',0));
 assert.ok(has(related(all,'orders',0),'tasks',0));assert.ok(has(related(all,'tasks',0),'orders',0));
 assert.ok(has(related(all,'materials',0),'inventory',0));assert.ok(has(related(all,'materials',0),'supplies',0));assert.ok(has(related(all,'supplies',0),'supplyDelays',0));
 assert.ok(has(related(all,'machines',0),'calendars',0));assert.ok(has(related(all,'machines',0),'downtime',0));
 assert.ok(has(related(all,'rules',0),'tasks',0));assert.deepEqual(related(all,'orders',999),[]);
});
test('AND filters match product/order references, status, inclusive minute/date/time bounds; blanks and invalid ranges excluded',()=>{
 assert.equal(filterRows(all,'orders',{product:'P1',order:'O1',statusField:'订单状态',status:'正式',dateField:'要求可交付分钟',from:'120',to:'120'}).length,1);
 assert.equal(filterRows(all,'orders',{product:'P2',order:'O1'}).length,0);
 assert.equal(filterRows(all,'dependencies',{product:'P1'}).length,1);
 assert.equal(filterRows(all,'routes',{order:'O2'})[0].index,1);
 assert.equal(filterRows(all,'supplies',{dateField:'预计可用时间',from:'2026-11-02T00:00:00Z',to:'2026-11-02T00:00:00Z'}).length,1);
 assert.equal(filterRows(all,'inventory',{dateField:'有效期',from:'2026-11-02',to:'2026-11-02'}).length,1);
 for(const from of ['invalid','999'])assert.equal(filterRows(all,'orders',{dateField:'要求可交付分钟',from}).length,0);
 assert.equal(filterRows({...all,orders:[{}]},'orders',{dateField:'要求可交付分钟',from:'0'}).length,0);
 assert.ok(filterOptions(['质量状态','有效期','起始分钟','固定分钟']).dateFields.includes('起始分钟'));
});
test('plan changes isolate task snapshots; missing relation is empty and rule parameters are human readable',()=>{
 assert.equal(queryData(data,plans,'old').tasks[0]['任务编号'],'T2');assert.equal(queryData(data,plans,'missing').tasks.length,0);
 assert.equal(displayValue('参数JSON',data.rules[0]['参数JSON']),'可用质量状态：合格、条件放行');assert.ok(!displayValue('参数JSON','bad').includes('bad'));
});
test('filtered CSV matches rows and preserves fields, plan, revision, units/time and Chinese simulation labels',()=>{
 const csv=queryCsv([{key:'orders',fields:['订单编号','产品编号','订单状态','要求可交付分钟']}],data,plans,3,{table:'orders',planId:'plan1',filters:{product:'P1'}});
 assert.ok(csv.includes('"O1"'));assert.ok(!csv.includes('"O2"'));assert.ok(csv.includes('"plan1"'));assert.ok(csv.includes('"3"'));assert.ok(csv.includes('分钟基准'));
 const malicious=queryCsv([{key:'x',fields:['text']}],{x:[{text:'=1+2'},{text:'a,"b\nc'}]},[],0,{table:'x'});assert.ok(malicious.includes("'=1+2"));assert.ok(malicious.includes('a,""b\nc'));
 assert.throws(()=>queryCsv([],data,plans,0,{table:'missing'}),/unknown_table/);
 assert.throws(()=>queryCsv([{key:'orders',fields:[]}],data,plans,0,{table:'orders',planId:'nope'}),/plan_not_found/);
});

test('FR014 issue11 D1 rejects impossible dates in filters and records without normalizing to another day',()=>{
 const rows={inventory:[{'有效期':'2026-03-02'},{'有效期':'2026-02-30'}]};
 for(const bad of ['2026-02-30','2026-02-29','2026-04-31','2026-13-01','2026-00-01']){
  assert.equal(filterRows(rows,'inventory',{dateField:'有效期',from:bad}).length,0,bad);
  assert.equal(filterRows(rows,'inventory',{dateField:'有效期',to:bad}).length,0,bad);
 }
 assert.equal(filterRows(rows,'inventory',{dateField:'有效期',from:'2026-03-02',to:'2026-03-02'}).length,1);
 const csv=queryCsv([{key:'inventory',fields:['有效期']}],rows,[],0,{table:'inventory',filters:{dateField:'有效期',from:'2026-02-30',to:'2026-02-30'}});assert.equal(csv.split('\r\n').length,1);
});
test('FR014 issue11 D1 preserves leap years and offset-equivalent timestamps, validates local rather than UTC calendar',()=>{
 const leap={inventory:[{'有效期':'2024-02-29'},{'有效期':'2024-03-01'}]};
 assert.equal(filterRows(leap,'inventory',{dateField:'有效期',from:'2024-02-29',to:'2024-02-29'}).length,1);
 const supplied={supplies:[{'预计可用时间':'2024-03-01T00:30:00+08:00'},{'预计可用时间':'2024-02-29T23:30:00-08:00'}]};
 assert.equal(filterRows(supplied,'supplies',{dateField:'预计可用时间',from:'2024-02-29T16:30:00Z',to:'2024-02-29T16:30:00Z'}).length,1);
 assert.equal(filterRows(supplied,'supplies',{dateField:'预计可用时间',from:'2024-03-01T07:30:00Z',to:'2024-03-01T07:30:00Z'}).length,1);
 for(const bad of ['2026-02-30T00:30:00+08:00','2026-02-29T23:30:00-08:00','2024-03-01T24:00:00Z','2024-03-01T10:60:00Z','2024-03-01T10:10:60Z','2024-03-01T10:10:00'])assert.equal(filterRows(supplied,'supplies',{dateField:'预计可用时间',from:bad}).length,0,bad);
});
