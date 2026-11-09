export const workflowSourceKey=({datasetId,version,parameterRevision=0,parameterScope='dataset',startDay})=>JSON.stringify({datasetId,version,parameterRevision,parameterScope,startDay});
export const workflowContextKey=({datasetId,version,parameterRevision=0,parameterScope='dataset',selection})=>JSON.stringify({datasetId,version,parameterRevision,parameterScope,selection:{...selection,...(selection.demandIds?{demandIds:[...selection.demandIds].sort()}:{} )}});
export function workflowTaskSelection(rows,selection){
 const eligible=rows.filter(r=>r['需求日']!==''&&r['需求日']!=null&&Number.isInteger(Number(r['需求日']))&&Number(r['需求日'])>=selection.startDay&&Number(r['需求日'])<selection.endDay);
 const selectedIds=selection.demandIds??eligible.map(r=>r['需求编号']),ids=new Set(selectedIds),eligibleIds=new Set(eligible.map(r=>r['需求编号']));
 const selected=eligible.filter(r=>ids.has(r['需求编号'])),invalid=selectedIds.filter(id=>!eligibleIds.has(id));
 const problems=[];
 if(![selection.startDay,selection.endDay,selection.currentDay??selection.startDay].every(Number.isInteger)||(selection.currentDay??0)<0||selection.startDay<(selection.currentDay??0)||selection.startDay<0||selection.endDay<=selection.startDay||selection.endDay>44)problems.push('日期范围无效：开始日不得早于当前日期，窗口须大于0且不超过数据范围。');
 if(rows.some(r=>typeof r['需求编号']!=='string'||!r['需求编号'].trim()))problems.push('存在缺少需求编号的记录，请先维护需求清单。');
 if(!selected.length)problems.push('请至少选择一笔当前日期范围内的需求。');
 if(invalid.length)problems.push('这些需求已不在当前范围或不存在：'+invalid.join('、')+'。请重新勾选，或全选本次范围。');
 if(ids.size!==selectedIds.length||new Set(rows.map(r=>r['需求编号'])).size!==rows.length)problems.push('需求编号重复，请检查导入清单。');
 const sum=field=>selected.every(r=>r[field]!==''&&r[field]!=null&&Number.isFinite(Number(r[field])))?selected.reduce((n,r)=>n+Number(r[field]),0):null;
 return {eligible,selected,selectedIds,invalid,problems,quantityKg:sum('需求千克'),boxes:sum('需求箱数')};
}
