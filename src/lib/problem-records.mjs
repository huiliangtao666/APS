import {recordKeys} from './record-identity.mjs';
// Producers own associations. Never derive identifiers from translated messages/code names.
export function recordRefs(table, rows) {
 return rows.map(row=>({table,row:{...row}}));
}
export function attachProblemRecords(finding, data) {
 if(finding.taskIds?.length || Array.isArray(finding.relatedRecords))return finding;
 const {table,row}=finding;
 if(table && Number.isInteger(row) && row>=2 && data[table]?.[row-2])
  return {...finding,relatedRecords:recordRefs(table,[data[table][row-2]])};
 return {...finding,relatedRecords:[],associationGap:'问题来源未提供逐条关联记录；请提供表名及稳定记录身份后重新检查。'};
}
export function currentRecord(ref, data) {
 const keys=recordKeys[ref.table];
 const required=ref.table==='dependencies'?keys?.filter(k=>!['人员岗位编号','人员参与阶段'].includes(k)):keys;
 if(!keys?.length || required.some(k=>!ref.row[k]?.trim()))return null;
 const matches=(data[ref.table]||[]).map((row,index)=>({row,index})).filter(({row})=>keys.every(k=>row[k]?.trim()===ref.row[k]?.trim()));
 return matches.length===1?matches[0]:null;
}
