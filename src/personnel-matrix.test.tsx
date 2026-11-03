import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {PersonnelToolHeatmap,personnelLoad,loadPersonnelMatrix} from './PersonnelToolHeatmap';
import type {QueryIdentity} from './QueryReportsTypes';
const identity={datasetId:'SYN',version:1,runId:'R',fingerprint:'F',dayZero:'2026-10-31'} as QueryIdentity;
const cell=(resource='C1',day=1)=>({id:resource+'|'+day,values:{resource,day,name:'调配灌装组',dimension:'人',peak:4,available:20,remaining:16},resourceSummary:{taskCount:95}});
test('personnel matrix shows inline metadata, task count, peak/capacity and frozen observation day',()=>{
 const html=renderToStaticMarkup(<PersonnelToolHeatmap rows={[cell(),cell('C1',2)]} from={1} to={3} observationDay={2} onOpen={()=>{}} identity={identity} preferenceScope="SYN"/>);
 for(const s of ['调配灌装组','>20人<','>95<','>4/20<','personnel-active-day','2026-11-02；点击高亮','任务数','图示全资源，明细按日分页'])assert.ok(html.includes(s),s);
 assert.equal(personnelLoad(0,0),'idle');assert.equal(personnelLoad(12,10),'over');assert.equal(personnelLoad(8,10),'high');assert.equal(personnelLoad(6,10),'medium');assert.equal(personnelLoad(4,20),'low');assert.equal(personnelLoad(null,20),'unknown');
});
test('complete matrix loader binds frozen identity and resource ownership across bounded pages',async()=>{
 let calls=0;const response=(id:string,nextOffset:number|null)=>({identity,queryFingerprint:'Q',total:2,nextOffset,resources:[{id,taskCount:1,records:[cell(id)]}]});
 const rows=await loadPersonnelMatrix(async()=>++calls===1?response('C1',1):response('C2',null),identity,{},'Q');assert.equal(rows?.length,2);assert.equal((rows?.[0].resourceSummary as any).taskCount,1);
 await assert.rejects(loadPersonnelMatrix(async()=>({...response('C1',null),identity:{...identity,runId:'OTHER'}}),identity,{},'Q'),/冻结身份/);
 await assert.rejects(loadPersonnelMatrix(async()=>response('C1',0),identity,{},'Q'),/分页未前进/);
 await assert.rejects(loadPersonnelMatrix(async()=>response('C1',null),identity,{},'Q'),/未完整加载/);
 await assert.rejects(loadPersonnelMatrix(async()=>({...response('C1',null),resources:[{id:'C2',taskCount:1,records:[cell('C1')]}]}),identity,{},'Q'),/日期归属/);
 assert.equal(await loadPersonnelMatrix(async()=>response('C1',null),identity,{},'Q',()=>false),undefined);
});
