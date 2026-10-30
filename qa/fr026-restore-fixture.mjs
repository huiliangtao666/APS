import assert from 'node:assert/strict';
import {executionFixture} from './execution-fixture.mjs';
import {seed} from '../server/planner.ts';
const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
export async function setup(f,state,futureBom=false){
 const current=executionFixture(seed,state);if(futureBom)current.bom.push({...current.bom[0],'版本编号':'FUTURE','生效日期':'2030-01-01','物料编号':'FAT'});const original=structuredClone(current);original.executionFacts=[];original.executionMaterials=[];
 await f.ok('/inputs',{revision:0,tables:original});
 const p=await f.ok('/calculate',{revision:1});await f.ok('/plans/'+p.id+'/verify',{});
 let review=await f.ok('/plans/'+p.id+'/review');assert.deepEqual(review.blockers,[]);
 await f.ok('/plans/'+p.id+'/submit',decision(review));review=await f.ok('/plans/'+p.id+'/review');await f.ok('/plans/'+p.id+'/confirm',decision(review),'supervisor');
 await f.ok('/inputs',{revision:1,tables:{executionFacts:current.executionFacts,executionMaterials:current.executionMaterials}});
 return {p,current,revision:2};
}
export async function history(f,id){const s=JSON.parse(f.bytes());return {data:s.data,source:s.plans.find(p=>p.id===id),confirmations:s.confirmations,workflows:s.workflows,versions:s.inputVersions,runs:s.runs};}
