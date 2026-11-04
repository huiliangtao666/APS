import test from 'node:test';
import assert from 'node:assert/strict';
import {copyReportSource,sourceHash} from '../server/query-reports/source-copy.mjs';
import {hash,refreshDerived,rows} from '../server/workbook-model.mjs';
import {demandInput,previewUrgent,targetToken,DEMAND_FIELDS} from '../server/urgent-order-input.mjs';
import {registerUrgentOrders} from '../server/urgent-order-routes.mjs';
import {urgentFixture,urgentRow,selection,observed} from './urgent-order-fixture.mjs';
import {selectionDataset} from '../server/workbook-selection.mjs';
import {workbookTables} from '../server/parameter-workbook-export.mjs';

function detached(a,b){
 if(a===null||typeof a!=='object')return;
 assert.notEqual(a,b);assert.deepEqual(Object.keys(a),Object.keys(b));
 for(const k of Object.keys(a))detached(a[k],b[k]);
}
// Derived tables can add or remove rows. Check source-node isolation without
// requiring the derived result to have the original table shape.
function isolated(source,derived){
 const originals=new WeakSet();
 function visit(value,fn){
  if(value===null||typeof value!=='object')return;
  fn(value);for(const key of Object.keys(value))visit(value[key],fn);
 }
 visit(source,value=>originals.add(value));
 visit(derived,value=>assert.equal(originals.has(value),false,'derived input shares a mutable source node'));
}
const plan=d=>({id:'COPY-PLAN',baseRunId:'BASE',headRunId:'BASE',baseInputRef:'SOURCE',inputHash:hash(d),revision:1,factsRevision:1,selection,originalDemandIds:rows(d,'每日需求').map(r=>r['需求编号']),facts:{observationMinute:observed},batches:[]});

test('urgent JSON source copy keeps all properties and isolates every mutable node',()=>{
 const d=JSON.parse('{"__proto__":{"kept":[{"value":"中文"}]},"constructor":{"prototype":{"x":1}},"empty":[],"null":null,"number":1,"string":"immutable"}');
 const before=hash(d),copy=copyReportSource(d);
 assert.deepEqual(copy,structuredClone(d));assert.equal(hash(copy),before);detached(d,copy);
 copy.__proto__.kept[0].value='changed';copy.constructor.prototype.x=2;assert.equal(hash(d),before);
});

test('urgent demand copy matches legacy derived semantics without changing base source',()=>{
 const d=urgentFixture();d.sourceExtension=JSON.parse('{"__proto__":{"kept":true},"nested":[{"bytes":"original-source"}]}');
 d.urgentOrder={old:'remove only in derived input'};const p=plan(d);p.batches=[{id:'B1',sequence:1,fileHash:'file',fileName:'synthetic.xlsx',effectiveMinute:observed,demands:[urgentRow()]}];
 const before=hash(d),old=structuredClone(d);delete old.urgentOrder;
 old.tables['每日需求']=[...rows(old,'每日需求').filter(r=>p.originalDemandIds.includes(r['需求编号'])),...p.batches.flatMap(b=>b.demands.map(r=>({...r,_urgent:{batchId:b.id,effectiveMinute:b.effectiveMinute,sequence:b.sequence,fileHash:b.fileHash,fileName:b.fileName}})))];refreshDerived(old,selection.startDay);
 const next=demandInput(d,p);assert.deepEqual(next,old);assert.equal(hash(next),hash(old));assert.equal(hash(d),before);detached(d.sourceExtension,next.sourceExtension);isolated(d.tables,next.tables);
 next.tables['物料主数据'][0]['物料名称']='changed';next.sourceExtension.nested[0].bytes='changed';assert.equal(hash(d),before);
 const bytes=workbookTables([['每日需求',DEMAND_FIELDS,[DEMAND_FIELDS.map(f=>urgentRow()[f]??'')]]]);
 const preview=previewUrgent(bytes,d,plan(d),{fileName:'synthetic.xlsx',effectiveTime:'2026-11-01T09:17:00+08:00'});
 assert.equal(preview.valid,true);assert.equal(preview.demands[0]['需求千克'],'6');assert.equal(hash(d),before);
});

function readGate({headRef='SOURCE',headHash,resultCorrupt=false,baseCorrupt=false,missingHead=false}={}){
 const d=urgentFixture(),p=plan(d),result={tasks:[],demandResults:[],conditions:selection};
 const state={runs:missingHead?[]:[{id:'BASE',inputRef:headRef,inputHash:headHash??hash(d),result,resultHash:resultCorrupt?'wrong-result':hash(result)}],urgentPlans:[p]};
 const handlers=new Map(),reads=[];let writes=0;
 const router=Object.fromEntries(['get','post'].map(method=>[method,(path,...fns)=>handlers.set(method+' '+path,fns.at(-1))]));
 registerUrgentOrders(router,{read:()=>copyReportSource(state),write:()=>{writes++;},snapshot:ref=>{reads.push(ref);const value=copyReportSource(d);if(baseCorrupt&&ref==='SOURCE')value.name='changed';return value;},persist:()=>{throw Error('must not persist');},permission:()=>()=>{},actorKey:()=> 'COPY-TEST',audit:()=>{},workers:new Map(),workerFactory:()=>{throw Error('must not start worker');}});
 let status=200,value;const res={status(n){status=n;return this;},json(x){value=x;return this;}};
 handlers.get('post /urgent/plans/:id/preview')({params:{id:p.id},body:{targetToken:targetToken(p)}},res,e=>{throw e;});
 assert.equal(writes,0);return {status,value,reads};
}

test('same ref and hash use one detached snapshot but still check head result',()=>{
 let r=readGate();assert.deepEqual(r.reads,['SOURCE']);assert.equal(r.value.error,'URGENT_FILE_SIZE');
 r=readGate({resultCorrupt:true});assert.deepEqual(r.reads,['SOURCE']);assert.equal(r.status,409);assert.equal(r.value.error,'URGENT_FROZEN_CORRUPT');
});
test('different refs or hashes cannot bypass independent frozen validation',()=>{
 let r=readGate({headRef:'HEAD'});assert.deepEqual(r.reads,['SOURCE','HEAD']);assert.equal(r.value.error,'URGENT_FILE_SIZE');
 r=readGate({headHash:'wrong-input'});assert.deepEqual(r.reads,['SOURCE','SOURCE']);assert.equal(r.status,409);assert.equal(r.value.error,'URGENT_FROZEN_CORRUPT');
 r=readGate({baseCorrupt:true});assert.deepEqual(r.reads,['SOURCE']);assert.equal(r.value.error,'URGENT_SOURCE_CORRUPT');
 r=readGate({missingHead:true});assert.equal(r.status,404);assert.equal(r.value.error,'URGENT_RUN_NOT_FOUND');
});


test('wide source rows retain key order, scalar extensions and detached nested provenance',()=>{
 const row=JSON.parse('{"__proto__":{"value":[1]},"1":"numeric-key"}');
 for(let i=0;i<120;i++)row['field-'+i]=i%2?{source:['来源',i]}:'scalar-'+i;
 const value={tables:{wide:[row]},extension:{unknown:[{active:false}]}};
 const original=sourceHash(value),copy=copyReportSource(value);assert.deepEqual(copy,value);assert.equal(sourceHash(copy),original);isolated(value,copy);
 copy.tables.wide[0]['field-1'].source[1]=999;copy.tables.wide[0].__proto__.value.push(2);assert.equal(sourceHash(value),original);
});

test('selection keeps transitive routes and shared WIP/tools/storage with isolated extensions',()=>{
const d={id:'projection-fixture',version:1,fileHash:'B',parameterPrecedence:true,extension:JSON.parse('{"nested":[{"__proto__":{"value":3},"zero":0,"empty":"","bool":false,"nil":null}]}'),tables:{
 '每日需求':[{需求编号:'N1',需求日:'5',成品编号:'FG1',客户编号:'C1'},{需求编号:'N7',需求日:'5',成品编号:'FG7'}],
 '物料主数据':['FG1','FG7','SF1','RM1','LOCKED','NEIGHBOR'].map(物料编号=>({物料编号,物料来源:'制造'})),
 '物料清单':[{用量关系编号:'B1',父项编号:'FG1',子项编号:'SF1',生效日:'0',失效日:'44'},{用量关系编号:'B2',父项编号:'SF1',子项编号:'RM1',生效日:'0',失效日:'44'}],
 '工艺路线':[{路线工序编号:'R1',成品编号:'FG1',设备组编号:'GROUP',班组编号:'TM',所需工装类型:'TOOL'}],
 '设备与工装':[{资源编号:'E1',资源组编号:'GROUP'},{资源编号:'T1'}],
 '期初在制':[{在制批次编号:'W1',成品编号:'LOCKED',占用资源编号:'E1'}],
 '期初库存':[{库存批次编号:'L1',物料编号:'RM1',库位编号:'LOC'},{库存批次编号:'L2',物料编号:'NEIGHBOR',库位编号:'LOC'}],
 '供应商与供货条件':[{供货关系编号:'S1',物料编号:'RM1'}],
 '客户与交付':[{客户编号:'C1'}],
 '配置参数':[{对象编号:'GLOBAL',参数名称:'fixture-global',参数值:'0'}],
},mapping:{sfRoutes:[{路线工序编号:'RSF',成品编号:'SF1',设备组编号:'GROUP',班组编号:'TM',所需工装类型:'TOOL'}],resources:[],feed_mappings:[{bom_id:'B1',route_step_id:'R1'},{bom_id:'B2',route_step_id:'RSF'}],tool_pools:{TOOL:['T1']},wip_remaining:[{id:'W1',remaining_labor_pool:'TM',remaining_tool_type:'TOOL',remaining_material_bom_ids:[]}],extension:{nested:[1,2]}}};
const sourceBefore=sourceHash(d),selection={startDay:2,endDay:10,demandIds:['N1']};
const actual=selectionDataset(d,selection);
assert.equal(sourceHash(d),sourceBefore);
assert.deepEqual(actual.tables['每日需求'].map(x=>x.需求编号),['N1']);
for(const id of ['SF1','RM1','LOCKED'])assert(actual._selectionClosure.materialIds.includes(id));
assert(!actual._selectionClosure.materialIds.includes('FG7'));assert(actual._selectionClosure.wipIds.includes('W1'));assert(actual._selectionClosure.resourceIds.includes('T1'));
assert.equal(actual.tables['期初库存'].length,2);assert(actual.tables['物料主数据'].some(x=>x.物料编号==='NEIGHBOR'));assert.equal(actual.tables['物料清单'].length,2);assert.equal(actual.mapping.feed_mappings.length,2);assert.equal(actual.mapping.sfRoutes.length,1);
const sources=new WeakSet();function collect(v){if(v&&typeof v==='object'){sources.add(v);for(const k of Object.keys(v))collect(v[k]);}}collect(d);
let nodes=0;function isolated(v){if(v&&typeof v==='object'){assert(!sources.has(v));nodes++;for(const k of Object.keys(v))isolated(v[k]);}}isolated(actual);
actual.extension.nested[0].zero=99;actual.tables['物料清单'][0].子项编号='MUTATED';actual.mapping.tool_pools.TOOL.push('EXTRA');assert.equal(sourceHash(d),sourceBefore);

});
