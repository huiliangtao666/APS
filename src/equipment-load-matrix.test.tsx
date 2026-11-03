import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {EquipmentLoadMatrix,equipmentLoadValue,loadEquipmentMatrix} from './EquipmentLoadMatrix';
import type {QueryIdentity} from './QueryReportsTypes';
const identity={datasetId:'SYN',version:1,runId:'R',fingerprint:'F',dayZero:'2026-10-31'} as QueryIdentity;
const cell=(machine='EQ1',day=1)=>({id:machine+'|'+day,values:{machine,name:'备料解冻区B机位',day,occupiedMinutes:960,overlap:false},downtimeMinutes:0,resourceSummary:{taskCount:14,windowOccupancy:.5}});
test('load matrix uses actual percentages, inline name/ID/window/tasks, weekdays, observation and stop hints',()=>{
 const stop={...cell('EQ2'),values:{...cell('EQ2').values,occupiedMinutes:0},downtimeMinutes:1440};
 const html=renderToStaticMarkup(<EquipmentLoadMatrix rows={[cell(),stop,cell('EQ1',2)]} from={1} to={3} observationDay={2} onOpen={()=>{}} identity={identity} preferenceScope="SYN"/>);
 for(const s of ['备料解冻区B机位','>50%<','>14<','66.67%','load-active-day','2026-11-02；点击高亮','load-weekend','>停机<','窗口占用','任务数','图示全部匹配设备'])assert.ok(html.includes(s),s);
 assert.equal(equipmentLoadValue({occupiedMinutes:0},'occupiedMinutes').text,'0%');assert.equal(equipmentLoadValue({occupiedMinutes:1440},'occupiedMinutes').text,'100%');
 assert.equal(equipmentLoadValue({utilization:null},'utilization').text,'未提供');assert.equal(equipmentLoadValue({utilization:1.5},'utilization').text,'150%');
 assert.equal(equipmentLoadValue({startedBatchKg:10,dailyCapacityKg:null},'startedBatchKg').ratio,null);assert.equal(equipmentLoadValue({dailyCapacityKg:0},'dailyCapacityKg').text,'0');
 assert.equal(equipmentLoadValue({workingOccupiedMinutes:30},'workingOccupiedMinutes').text,'30');
});
test('matrix loader retains full resources across pages and refuses stale, duplicate, foreign or incomplete dates',async()=>{
 let calls=0;const response=(id:string,nextOffset:number|null)=>({identity,queryFingerprint:'Q',total:2,nextOffset,resources:[{id,taskCount:1,windowOccupancy:0,records:[cell(id)]}]});
 const rows=await loadEquipmentMatrix(async()=>++calls===1?response('EQ1',1):response('EQ2',null),identity,{},'Q');assert.equal(rows?.length,2);
 await assert.rejects(loadEquipmentMatrix(async()=>({...response('EQ1',null),queryFingerprint:'old'}),identity,{},'Q'),/冻结身份/);
 await assert.rejects(loadEquipmentMatrix(async()=>response('EQ1',0),identity,{},'Q'),/分页未前进/);
 await assert.rejects(loadEquipmentMatrix(async()=>response('EQ1',null),identity,{},'Q'),/未完整加载/);
 await assert.rejects(loadEquipmentMatrix(async()=>({...response('EQ1',null),resources:[{id:'EQ2',taskCount:1,windowOccupancy:0,records:[cell('EQ1')]}]}),identity,{},'Q'),/日期归属/);
 assert.equal(await loadEquipmentMatrix(async()=>response('EQ1',null),identity,{},'Q',()=>false),undefined);
});
