import {cloneForParameters} from './workbook-workbench.mjs';
import {scopeFor} from './parameter-contract.mjs';
import {refreshDerived,hash} from './workbook-model.mjs';

export function workflowTasks(data,query,actor){
 const version=Number(query.version),revision=Number(query.parameterRevision),day=Number(query.startDay);
 if(version!==data.version||revision!==(data.parameterRevision||0)){
  const error=Error('需求或配置已变化，请刷新本次任务清单。');error.status=409;throw error;
 }
 if(!Number.isInteger(day)||day<0||day>=44)throw Error('排程开始日期超出数据范围。');
 const scope=scopeFor(data,query.scope,actor),d=cloneForParameters(data);
 d.parameterContext={scope,effectiveDay:day};refreshDerived(d,day);
 const rows=(d.tables['每日需求']||[]).map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('_'))));
 return {datasetId:data.id,version,parameterRevision:revision,scope,startDay:day,total:rows.length,rows,
  fingerprint:hash({datasetId:data.id,version,revision,scope,day,rows}),source:'每日需求',timeUnit:'day'};
}
