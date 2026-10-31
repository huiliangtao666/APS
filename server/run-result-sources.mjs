import {bindProblemSource} from '../src/lib/problem-records.mjs';
import {inputHash} from './run-input.mjs';

// Storage and confirmation replay must bind the same source occurrences. Never
// strip provenance from a saved task to make a replay comparison succeed.
export function bindRunResultSources(result,run,version){
 // The complete contract lives once in the immutable run. Repeating all BOM,
 // resource and original12 targets in every row association grows quadratically.
 const scope=Object.fromEntries(['mode','orderIds','lineId','startMinute','endMinute','priority','enabledRuleIds','checkScope'].map(k=>[k,run.conditions[k]]));
 const source={domain:run.trialId?'trial:'+run.trialId:'current',inputVersionId:run.inputVersionId,executionVersionId:inputHash(run.executionData),revision:run.revision,checkedAt:run.createdAt,snapshotHash:run.snapshotHash,scope};
 const bind=f=>bindProblemSource(f,source,version?.data,run.sourceMap||{},version?.csvSources);
 return {...result,tasks:result.tasks.map(t=>Array.isArray(t.processSources)?{...t,processSources:bind({sourceRead:'frozen-calendar-v1',relatedRecords:t.processSources}).relatedRecords}:t),findings:result.findings.map(bind)};
}
