import {bindProblemSource} from '../src/lib/problem-records.mjs';
import {inputHash} from './run-input.mjs';

// Storage and confirmation replay must bind the same source occurrences. Never
// strip provenance from a saved task to make a replay comparison succeed.
export function bindRunResultSources(result,run,version){
 const source={domain:run.trialId?'trial:'+run.trialId:'current',inputVersionId:run.inputVersionId,executionVersionId:inputHash(run.executionData),revision:run.revision,checkedAt:run.createdAt,scope:run.conditions};
 const bind=f=>bindProblemSource(f,source,version?.data,run.sourceMap||{},version?.csvSources);
 return {...result,tasks:result.tasks.map(t=>Array.isArray(t.processSources)?{...t,processSources:bind({sourceRead:'frozen-calendar-v1',relatedRecords:t.processSources}).relatedRecords}:t),findings:result.findings.map(bind)};
}
