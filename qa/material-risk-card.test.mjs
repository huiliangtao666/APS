import test from 'node:test';import assert from 'node:assert/strict';
import {equipmentDomain} from '../server/workbook-equipment.mjs';import {hash} from '../server/workbook-model.mjs';
function fixture(){return {identity:{datasetId:'SYN',version:1,runId:'RISK-SYN',fingerprint:'F',dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00'},input:{tables:{'物料主数据':[{'物料编号':'CORN','物料名称':'玉米粒','基础单位':'千克'},{'物料编号':'FG','物料名称':'成品','基础单位':'千克'}],'每日需求':[{'需求编号':'D','成品编号':'FG','需求日':'4','客户名称':'演示客户'}],'期初库存':[{'库存批次编号':'L','物料编号':'CORN','当前数量':'99','数量单位':'千克','质量状态':'待检','期初可用量':'0','到期日':'9'}],'物料清单':[{'用量关系编号':'B','父项编号':'FG','子项编号':'CORN','子项基准用量':'12','数量单位':'千克'}]},mapping:{wip_remaining:[]}},run:{id:'RISK-SYN',selection:{startDay:1,endDay:15,currentDay:1},result:{timeUnit:'day',tasks:[],demandResults:[{id:'D',productId:'FG',quantity:70,unit:'千克',status:'unplanned',latestArrivalDay:5}],shortages:[{id:'S',materialId:'CORN',need:'D',needDay:4,quantity:12,unit:'千克'}],findings:[],allocations:[],suggestions:[{id:'S',materialId:'CORN',need:'D',needDay:4,quantity:20,netGap:12,unit:'千克',orderDay:3,availableDay:6}],verification:{status:'pass',scope:['合成检查'],notChecked:[],issues:[]}}}};}
const query={view:'E5',fromDate:'2026-11-01',toDateInclusive:'2026-11-14',pageSize:500,riskScope:'all'};
function card(v,id='shortage:S',section='overview',extra={}){const page=equipmentDomain.query(v,query),r=page.records.find(r=>r.id===id);return equipmentDomain.detail(v,{query,queryFingerprint:page.queryFingerprint,id,table:'risk-card',section,node:{id,kind:'risk',resource:r.values.materialId||r.need||r.id},...extra});}
test('risk overview shows saved dates and quantity, keeps original inventory/BOM distinct from allocation',()=>{
 const v=fixture(),before=hash(v),c=card(v);assert.equal(c.fields.find(f=>f.label==='需料日期').value,'2026-11-04');assert.equal(c.fields.find(f=>f.label==='预计可用日期').value,null);assert.equal(c.fields.find(f=>f.label==='本记录数量').value,'12 千克');
 assert.equal(c.demandTotal,1);assert.equal(c.groups.find(g=>g.id==='allocations').total,0);assert.equal(c.groups.find(g=>g.id==='inventory').records[0].values.available,0);assert.ok(c.groups.find(g=>g.id==='inventory').note.includes('不表示这些批次已分配'));assert.ok(c.groups.find(g=>g.id==='bom').note.includes('不据此推算'));
 const suggestion=card(v,'suggestion:0');assert.equal(suggestion.fields.find(f=>f.label==='预计可用日期').value,'2026-11-06');assert.equal(suggestion.fields.find(f=>f.label==='建议采购数量').value,'20 千克');assert.equal(hash(v),before);
});
test('affected demands use explicit record relation, include unplanned without tasks, and exclude same material peers',()=>{
 const v=fixture();v.run.result.demandResults.push({id:'OTHER',productId:'FG',status:'scheduled'});
 const c=card(v,'shortage:S','demands');assert.equal(c.groups[0].total,1);const r=c.groups[0].records[0];assert.equal(r.id,'D');assert.equal(r.values.status,'未排');assert.equal(r.values.quantity,70);assert.equal(r.values.customer,'演示客户');assert.equal(r.values.requiredDate,4);assert.equal(c.analysis,undefined);
 v.run.result.shortages[0].need='UNKNOWN';const empty=card(v,'shortage:S','demands');assert.equal(empty.demandTotal,0);assert.ok(empty.relationNote.includes('不按同物料或BOM推测'));
});
test('WIP downstream demands require saved allocation evidence and paginate all 105 without duplicates',()=>{
 const v=fixture();v.input.tables['期初在制']=[{'在制批次编号':'W'}];v.run.result.shortages[0].need='W';v.run.result.demandResults=Array.from({length:105},(_,i)=>({id:'D'+i,productId:'FG',status:'scheduled'}));v.run.result.allocations=v.run.result.demandResults.map(d=>({need:d.id,materialId:'FG',supplyId:'wip:W',quantity:1}));
 const first=card(v,'shortage:S','demands');assert.equal(first.demandTotal,105);assert.equal(first.groups[0].records.length,100);assert.equal(first.nextOffset,100);const next=card(v,'shortage:S','demands',{offset:100});assert.equal(next.groups[0].records.length,5);assert.equal(next.nextOffset,null);assert.equal(new Set([...first.groups[0].records,...next.groups[0].records].map(r=>r.id)).size,105);
 v.run.result.allocations=[];assert.equal(card(v,'shortage:S','demands').demandTotal,0);
});
test('cards enforce query fingerprint, E5 ownership, node identity and page/section boundaries',()=>{
 const v=fixture(),page=equipmentDomain.query(v,query),request={query,queryFingerprint:page.queryFingerprint,id:'shortage:S',table:'risk-card',node:{id:'shortage:S',kind:'risk',resource:'CORN'}};
 assert.throws(()=>equipmentDomain.detail(v,{...request,node:{...request.node,resource:'FG'}}),/NODE_NOT_IN_QUERY/);assert.throws(()=>equipmentDomain.detail(v,{...request,node:{...request.node,id:'suggestion:0'}}),/NODE_NOT_IN_QUERY/);assert.throws(()=>equipmentDomain.detail(v,{...request,queryFingerprint:'BAD'}),/QUERY_CHANGED/);assert.throws(()=>equipmentDomain.detail(v,{...request,section:'other'}),/INVALID_DETAIL_SECTION/);assert.throws(()=>equipmentDomain.detail(v,{...request,offset:-1}),/INVALID_PAGE/);
});

test('minute evidence dates use the saved local minute origin even when it differs from day zero',()=>{
 const v=fixture();v.identity.minuteOrigin='2026-11-02T08:00:00+08:00';v.run.result.findings=[{need:'D',materialId:'CORN',code:'MATERIAL_AT_ACTUAL_FEED',evidence:{kind:'material-at-feed',timeUnit:'minute',actualFeed:960,ready:1440,expiry:2880}}];
 const c=card(v,'finding:0');assert.equal(c.fields.find(f=>f.label==='候选投料日期').value,'2026-11-03');assert.equal(c.fields.find(f=>f.label==='预计可用日期').value,'2026-11-03');
});
