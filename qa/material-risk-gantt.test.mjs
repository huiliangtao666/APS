import test from 'node:test';import assert from 'node:assert/strict';
import {equipmentDomain} from '../server/workbook-equipment.mjs';
import {riskTimeline} from '../server/workbook-risk-timeline.mjs';
import {hash} from '../server/workbook-model.mjs';
function fixture(){return {identity:{datasetId:'SYN',version:1,runId:'RISK-SYN',fingerprint:'F',dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00'},input:{tables:{'物料主数据':[{'物料编号':'CORN','物料名称':'玉米粒','基础单位':'千克'},{'物料编号':'CASING','物料名称':'肠衣','基础单位':'个'},{'物料编号':'FG','物料名称':'成品','基础单位':'千克'}],'物料清单':[],'每日需求':[{'需求编号':'D','成品编号':'FG','需求日':'1'}]},mapping:{wip_remaining:[]}},run:{id:'RISK-SYN',selection:{startDay:1,endDay:15,currentDay:1},result:{timeUnit:'day',tasks:[],demandResults:[{id:'D',productId:'FG',status:'unplanned'}],shortages:[{id:'S1',materialId:'CORN',need:'D',needDay:4,quantity:12,unit:'千克'},{id:'S2',materialId:'CASING',need:'D',needDay:7,quantity:24,unit:'个'}],findings:[{need:'D',code:'WIP_REMAINING',message:'尚缺在制条件'},{need:'D',code:'MATERIAL_AT_ACTUAL_FEED',materialId:'CORN',message:'候选投料校验失败',evidence:{kind:'material-at-feed',timeUnit:'day',actualFeed:4,ready:6,expiry:10,quantity:12,unit:'千克'}}],allocations:[{need:'D',materialId:'CORN',quantity:12,unit:'千克',feedDay:3,supplyId:'inventory:L',conditional:false}],suggestions:[{id:'S1',materialId:'CORN',need:'D',needDay:4,quantity:20,netGap:12,unit:'千克',orderDay:3,availableDay:6}],verification:{status:'pass',scope:['合成检查'],notChecked:[],issues:[]}}}};}
const query={view:'E5',fromDate:'2026-11-01',toDateInclusive:'2026-11-14',pageSize:100};
test('risk dates preserve units and unknown times; a shortage never acquires a fabricated clearance',()=>{
 const v=fixture(),before=hash(v),page=equipmentDomain.query(v,query),shortage=page.records.find(r=>r.id==='shortage:S2').timeline;
 assert.equal(shortage.unit,'个');assert.equal(shortage.quantity,24);assert.equal(shortage.materialName,'肠衣');assert.deepEqual(shortage.events,[{key:'need',label:'净缺口需料日',at:7*1440,end:null,precision:'day',tone:'gap'}]);
 assert.ok(shortage.missing.some(x=>x.includes('未保存缺口持续时长')));
 const unknown=page.records.find(r=>r.id==='finding:0').timeline;assert.deepEqual(unknown.events,[]);assert.equal(unknown.quantity,null);assert.ok(unknown.missing.some(x=>x.includes('不按需求日期推测')));assert.equal(hash(v),before);
});
test('candidate wait evidence and minute feed points retain exact saved boundaries',()=>{
 const v=fixture(),wait=riskTimeline(v,'finding',v.run.result.findings[1]);assert.deepEqual([wait.events[0].at,wait.events[0].end],[5760,8640]);assert.ok(wait.events[0].label.includes('已撤销'));assert.ok(wait.events[1].label.includes('未采用'));
 const point=riskTimeline(v,'allocation',{materialId:'CORN',quantity:1,feedDay:1,feedMinute:1927,conditional:true});assert.equal(point.events[0].at,1927);assert.equal(point.events[0].precision,'minute');assert.equal(point.events[0].end,null);assert.equal(point.events[0].tone,'conditional');
 const expired=riskTimeline(v,'finding',{evidence:{kind:'material-at-feed',timeUnit:'minute',actualFeed:1927,ready:1900,expiry:1927}});assert.ok(expired.events[0].label.includes('已到期'));assert.equal(expired.events[0].end,null);
});
test('procurement remains a reference, with net gap distinct from suggested purchase quantity',()=>{
 const v=fixture(),page=equipmentDomain.query(v,query),r=page.records.find(r=>r.id==='suggestion:0');assert.equal(r.timeline.events[0].tone,'reference');assert.equal(r.timeline.events.find(e=>e.key==='need').quantity,12);assert.ok(r.timeline.events.every(e=>e.label.includes('参考')||e.label.includes('未采用')));
 const analysis=equipmentDomain.detail(v,{query,queryFingerprint:page.queryFingerprint,table:'analysis',id:r.id,node:{id:r.id,kind:'risk',resource:'CORN'}}).analysis;
 assert.ok(analysis.basis.some(b=>b.value.includes('原净缺口 12 千克；建议采购 20 千克')));assert.ok(analysis.missing.some(x=>x.includes('不表示缺料已解除')));
});
test('risk type filters cover full query, keep table/export consistent, and bind node analysis to its own record',()=>{
 const v=fixture(),q={...query,riskScope:'risk'},page=equipmentDomain.query(v,q);assert.equal(page.total,4);assert.ok(page.records.every(r=>['finding','shortage'].includes(r.id.split(':')[0])));
 const exported=[...equipmentDomain.export(v,{...q,queryFingerprint:page.queryFingerprint})].map(r=>JSON.parse(r));assert.equal(exported[0].total,4);assert.equal(exported.length,5);
 assert.equal(equipmentDomain.query(v,{...query,riskScope:'supply'}).total,2);assert.equal(equipmentDomain.query(v,{...query,riskScope:'all'}).total,6);
 const supplyQ={...query,riskScope:'supply'},supplyPage=equipmentDomain.query(v,supplyQ),supply=equipmentDomain.detail(v,{query:supplyQ,queryFingerprint:supplyPage.queryFingerprint,table:'analysis',id:'allocation:0',node:{id:'allocation:0',kind:'risk',resource:'CORN'}}).analysis;assert.equal(supply.materialTotal,1);assert.equal(supply.materials[0].supply,'inventory:L');assert.ok(supply.problems.some(p=>p.scope==='同需求/在制记录'&&p.message==='候选投料校验失败'));
 const detail={query:q,queryFingerprint:page.queryFingerprint,table:'analysis',id:'shortage:S1',node:{id:'shortage:S1',kind:'risk',resource:'CORN'}},out=equipmentDomain.detail(v,detail).analysis;
 assert.equal(out.facts.find(f=>f.label==='本记录数量').value,'12 千克');assert.ok(out.basis.some(b=>b.value.includes('2026-11-04')));assert.equal(out.node.kind,'risk');
 assert.throws(()=>equipmentDomain.detail(v,{...detail,node:{...detail.node,id:'shortage:S2'}}),/NODE_NOT_IN_QUERY/);assert.throws(()=>equipmentDomain.detail(v,{...detail,node:{...detail.node,resource:'CASING'}}),/NODE_NOT_IN_QUERY/);
 assert.throws(()=>equipmentDomain.detail(v,{...detail,query:{...q,riskScope:'supply'}}),/QUERY_CHANGED/);assert.throws(()=>equipmentDomain.detail(v,{...detail,id:'allocation:0'}),/RECORD_NOT_FOUND/);assert.throws(()=>equipmentDomain.query(v,{...query,riskScope:'typo'}),/INVALID_RISK_SCOPE/);
});
