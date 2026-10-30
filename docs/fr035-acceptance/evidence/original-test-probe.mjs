import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {scopedReport,reportCsv} from '/workspace/apps/aps/server/scoped-report.mjs';
import {freezeRunInput,inputHash} from '/workspace/apps/aps/server/run-input.mjs';
import {calculate,seed} from '/workspace/apps/aps/server/planner.ts';
import {materialFixture} from '/workspace/apps/aps/qa/material-fixture.mjs';
import {jointFixture,enableJoint,claim} from '/workspace/apps/aps/qa/joint-fixture.mjs';
import {parseInputCsv} from '/workspace/apps/aps/src/lib/input-csv.mjs';
const results=[];
function check(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
function fixture(data=materialFixture(seed)) {const f=freezeRunInput(data,{},'2026-10-29T00:00:00Z'),v=inputHash(data),p={...calculate(f.executionData,0,'2026-10-29T00:00:00Z',f.conditions),conditions:f.conditions,id:'P',runId:'R',inputVersionId:v,snapshotHash:f.snapshotHash};return {data,plans:[p],runs:[{id:'R',inputVersionId:v,snapshotHash:f.snapshotHash,conditions:f.conditions,executionData:f.executionData}],inputVersions:{[v]:{data}},records:[],revision:0};}
const q=(kind,patch={})=>({kind,planId:'P',start:0,end:120,text:'',order:'',...(kind==='differences'?{otherPlanId:'P'}:{}),...patch});
const rows=r=>r.rows.map(x=>JSON.parse(x[1]));
const kinds=['orders','tasks','occupation','materials','unplanned','differences'];
const state=fixture();
check('Order-filtered differences must retain resource changes linked to that order',()=>{const d=jointFixture(seed),s=fixture(d),p=s.plans[0];assert.ok(p.resourceReservations.length);const reservation=p.resourceReservations[0],taskId=reservation.taskIds?.[0]??reservation.taskId,orderId=p.tasks.find(t=>t.id===taskId)?.orderId;assert.ok(orderId);const p2=structuredClone(p);p2.id='P2';p2.resourceReservations[0].quantity=Number(p2.resourceReservations[0].quantity)+1;s.plans.push(p2);const all=scopedReport(s,q('differences',{otherPlanId:'P2'})),filtered=scopedReport(s,q('differences',{otherPlanId:'P2',order:orderId}));const expected=rows(all).filter(x=>x.category==='resources'&&[...(x.record.before||[]),...(x.record.after||[])].some(v=>(v.taskIds||[]).includes(taskId)||v.taskId===taskId));fs.writeFileSync('/evidence/resource-difference-filter.json',JSON.stringify({orderId,taskId,all,filtered,expected},null,2));assert.ok(expected.length);assert.deepEqual(rows(filtered).filter(x=>x.category==='resources'),expected);});

const {startValidation}=await import('/workspace/apps/aps/qa/fr034-integration-runner.mjs');const runtime=await startValidation();try {
const diffQuery={...q('differences'),planId:runtime.manifest.jointPlanId,otherPlanId:runtime.manifest.historicalPlanId};const allDiff=await runtime.call('/reports?query='+encodeURIComponent(JSON.stringify(diffQuery)));const filteredDiff=await runtime.call('/reports?query='+encodeURIComponent(JSON.stringify({...diffQuery,order:'A'})));const actualPlans=await runtime.call('/plans');const taskIds=actualPlans.filter(p=>[diffQuery.planId,diffQuery.otherPlanId].includes(p.id)).flatMap(p=>p.tasks.filter(t=>t.orderId==='A').map(t=>t.id));const expectedResources=rows(allDiff).filter(x=>x.category==='resources'&&[...(x.record.before||[]),...(x.record.after||[])].some(v=>[...(v.taskIds||[]),v.taskId].some(t=>taskIds.includes(t))));fs.writeFileSync('/evidence/real-api-resource-filter.json',JSON.stringify({query:diffQuery,order:'A',taskIds,expectedResources,all:allDiff,filtered:filteredDiff},null,2));check('Real calculated plans/API order filter retains linked resource differences',()=>{assert.ok(expectedResources.length);assert.deepEqual(rows(filteredDiff).filter(x=>x.category==='resources'),expectedResources);});
}finally{await runtime.close();}
fs.writeFileSync('/evidence/defect-probe.json',JSON.stringify({results},null,2));console.log(JSON.stringify(results));process.exitCode=results.every(x=>x.pass)?0:1;
