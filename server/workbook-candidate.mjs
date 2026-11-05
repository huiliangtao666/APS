import {hash} from './workbook-model.mjs';
// Shared explicit plan-version operation. Callers must first establish current
// input/facts/condition identity and independently verify the frozen candidate.
export function appendWorkbookPlanVersion(p,r,d,identity){
 p.planVersions??=[];
 const prior=p.planVersions.find(v=>v.runId===r.id);if(prior)return prior;
 const version={version:p.planVersions.length+1,previousRunId:p.headRunId,runId:r.id,inputHash:r.inputHash,resultHash:r.resultHash,workspaceIdentity:r.workspaceIdentity,scenarioIdentity:identity,at:new Date().toISOString()};
 p.planVersions.push(version);p.headRunId=r.id;
 if(identity){p.scenarioBusinessBaseRef??=p.baseInputRef;p.inputHistory??=[];p.inputHistory.push({ref:p.baseInputRef,inputHash:p.inputHash,revision:p.revision});p.baseInputRef=r.inputRef;p.inputHash=r.inputHash;}
 p.facts={...p.facts,sourceResultHash:hash(r.result),tasks:r.result.tasks.map(t=>({id:t.id,status:d.urgentOrder?.seedTasks.find(s=>s.id===t.id)?.executionStatus||'not_started',startMinute:t.start,endMinute:t.end,quantity:t.quantity,cleaning:t.cleaning,laborIntervals:t.laborIntervals,toolEndMinute:t.toolEndMinute})),allocations:r.result.allocations.map((a,index)=>({index,sourceHash:hash(a),quantity:a.urgentProtected?a.quantity:0,kind:a.urgentProtected?a.protectionKind:'none',feedMinute:a.feedMinute})),completed:Object.fromEntries(r.result.demandResults.map(x=>[x.id,p.facts.completed[x.id]||0]))};
 if(p.workspace)p.workspace.seedTaskIds=p.workspace.seedTaskIds.filter(id=>r.result.tasks.some(t=>t.id===id));
 p.replacementHistory??=[];p.replacementHistory.push(...(p.replacements||[]));p.replacements=[];p.factsRevision++;p.revision++;
 return version;
}
