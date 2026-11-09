const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
export function workbookRunSummary(run){
 const result=pick(run,['id','model','datasetId','version','createdAt','status','inputHash','resultHash','failure']);
 if(run.solver)result.solver=pick(run.solver,['requested','actual','status','durationMs']);
 return result;
}
const meta=value=>{const {parameterBindings,...rest}=value;return rest;};
/** Cache only navigation metadata. Neither results, preview contents nor audit
 * history are needed to select the current workbook or populate run pickers. */
export function workbookReadMetadata(state){
 return {
  datasets:state.datasets.map(set=>({id:set.id,versions:set.versions.map(meta),...(set.parameterWorkspaces?{parameterWorkspaces:Object.fromEntries(Object.entries(set.parameterWorkspaces).map(([version,value])=>[version,meta(value)]))}:{})})),
  runs:state.runs.map(workbookRunSummary)
 };
}
