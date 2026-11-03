import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {EquipmentGantt,demandDelivery,loadDemandTimeline} from './EquipmentSchedule';
import type {QueryIdentity,QueryRecord} from './QueryReportsTypes';
const identity={fingerprint:'F',runId:'R',dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00'} as QueryIdentity;
const row=(id:string,values:Record<string,unknown>={}):QueryRecord=>({id,values:{productId:'FG',productName:'测试成品',status:'scheduled',lateDays:0,arrivalDate:'2026-11-02',latestArrivalDate:'2026-11-02',taskCount:0,...values}});
const task=(id:string,orderId='DE')=>({id,orderId,productId:'SF',machine:'EQ',productionId:'B',label:'加工',quantity:55,start:1440,end:2880});
const props={demand:true,from:1,to:15,focusDay:null,density:'fit',color:'product',identity,analysisIdentity:identity,preferenceScope:'fixture',onDay:()=>{},onTask:()=>{},onResource:()=>{},api:async()=>({}),query:{view:'E2'},fingerprint:'Q'};
test('demand timeline renders product/demand/status before real tasks, date-only milestones and honest unplanned reasons',()=>{
 const html=renderToStaticMarkup(<EquipmentGantt {...props} rows={[{...row('DE',{taskCount:2}),tasks:[task('T1'),{...task('T2'),start:2160,end:3200}]},row('EMPTY',{status:'unplanned',arrivalDate:null,reason:'缺少原料'})]}/>);
 for(const text of ['日期需求交付甘特','测试成品','需求 DE，按期','任务 T1','任务 T2','最晚要求到货 2026-11-02','计划到货 2026-11-02','未排 · 缺少原料'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/class="equipment-task /g)||[]).length,2);
 const half=renderToStaticMarkup(<EquipmentGantt {...props} focusDay={1} rows={[{...row('DE'),tasks:[task('T1')]}]}/>);
 assert.ok(half.includes('半小时需求交付甘特'));assert.ok(half.includes('00:30'));assert.ok(!half.includes('class="demand-milestone'));
 const empty=renderToStaticMarkup(<EquipmentGantt {...props} rows={[row('STOCK')]}/>);assert.ok(empty.includes('无新增工序'));assert.ok(!empty.includes('class="equipment-task '));
});
test('delivery status never treats missing late-day or arrival evidence as on time',()=>{
 assert.equal(demandDelivery(row('x',{lateDays:null})),'已排·交付待核');
 assert.equal(demandDelivery(row('x',{arrivalDate:null})),'已排·交付待核');
 assert.equal(demandDelivery(row('x',{lateDays:2})),'迟到 2天');
});
test('complete timeline loader checks frozen identity, membership, progress, counts and cancellation',async()=>{
 let calls=0;const tasks=await loadDemandTimeline(async()=>({identity,queryFingerprint:'Q',tasks:[task('T'+calls++)],total:2,nextOffset:calls===1?1:null}),identity,{},'Q',['DE']);assert.equal(tasks?.length,2);
 const response={identity,queryFingerprint:'Q',tasks:[task('T')],total:1,nextOffset:null};
 await assert.rejects(loadDemandTimeline(async()=>({...response,identity:{...identity,runId:'OTHER'}}),identity,{},'Q',['DE']),/冻结身份/);
 await assert.rejects(loadDemandTimeline(async()=>({...response,tasks:[task('T','OTHER')]}),identity,{},'Q',['DE']),/关联异常/);
 await assert.rejects(loadDemandTimeline(async()=>({...response,total:2,nextOffset:0}),identity,{},'Q',['DE']),/分页未前进/);
 await assert.rejects(loadDemandTimeline(async()=>({...response,total:2}),identity,{},'Q',['DE']),/未完整加载/);
 assert.equal(await loadDemandTimeline(async()=>response,identity,{},'Q',['DE'],()=>false),undefined);
});
