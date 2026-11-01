import {randomUUID} from 'node:crypto';
import {rows,procurement} from './workbook-model.mjs';
export const draftFields=['quantity','relationId','orderDay','expiryDay','note'];
const numeric=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
export function validateDraftRequest(body){
 if(body.action!==undefined&&!['adopt','void'].includes(body.action))throw Error('未知草稿操作');
 if(body.changes!==undefined&&(!body.changes||typeof body.changes!=='object'||Array.isArray(body.changes)||Object.keys(body.changes).some(k=>!draftFields.includes(k))))throw Error('草稿修改包含未知或受保护字段');
 if(body.action&&body.changes)throw Error('先保存草稿，再显式采用或作废');
}
export function changeDraft(d,body,run){
 validateDraftRequest(body);d.drafts??=[];
 const prior=body.id?d.drafts.find(x=>x.id===body.id):null;
 if(body.id&&!prior)throw Error('草稿不存在');
 const source=run?.result?.suggestions.find(s=>s.id===body.suggestionId);
 if(!prior&&(!source||run.datasetId!==d.id||!['completed','partial'].includes(run.status)))throw Error('需先选择本数据集冻结运行产生的参考采购建议');
 if(!prior&&body.action)throw Error('需先复制为模拟草稿，再显式采用');
 if(prior?.status==='void')throw Error('作废草稿不可再采用或修改；请重新建立草稿');
 const draft=structuredClone(prior||{id:randomUUID(),status:'draft',sourceRun:run.id,suggestionId:source.id,sourceVersion:run.version,netGap:source.netGap,needDay:source.needDay,materialId:source.materialId,unit:source.unit,quantity:source.quantity,relationId:source.relationId,orderDay:source.orderDay,availableDay:source.availableDay,expiryDay:source.availableDay+Number(rows(d,'物料主数据').find(m=>m['物料编号']===source.materialId)?.['保质天数'])});
 if(body.action==='void'){draft.status='void';}else{
  if(!numeric(body.currentDay)||!Number.isInteger(Number(body.currentDay))||Number(body.currentDay)<0||Number(body.currentDay)>43)throw Error('需显式给出模拟当前日，不猜默认');
  Object.assign(draft,body.changes||{});
  const relation=rows(d,'供应商与供货条件').find(s=>s['供货关系编号']===draft.relationId&&s['物料编号']===draft.materialId);
  if(!relation||relation['数量单位']!==draft.unit)throw Error('适用供货关系或数量单位不符');
  if(!['采购导期天数','检验天数','最小订货量','订货倍数'].every(f=>numeric(relation[f])&&Number(relation[f])>=0)||!Number.isInteger(Number(relation['采购导期天数']))||!Number.isInteger(Number(relation['检验天数']))||Number(relation['订货倍数'])<=0)throw Error('供货条件须有显式导期/检验/MOQ/倍数');
  if(!numeric(draft.quantity)||Number(draft.quantity)<=0||Number(draft.quantity)<Number(relation['最小订货量'])||Math.abs(Number(draft.quantity)/Number(relation['订货倍数'])-Math.round(Number(draft.quantity)/Number(relation['订货倍数'])))>1e-8)throw Error('草稿数量须为正且满足MOQ及订货倍数');
  if(!numeric(draft.orderDay)||!Number.isInteger(Number(draft.orderDay))||Number(draft.orderDay)<Number(body.currentDay))throw Error('拟下单日须为整数，不能回填历史');
  draft.quantity=Number(draft.quantity);draft.orderDay=Number(draft.orderDay);
  draft.availableDay=draft.orderDay+Number(relation['采购导期天数'])+Number(relation['检验天数']);
  if(!numeric(draft.expiryDay)||!Number.isInteger(Number(draft.expiryDay))||Number(draft.expiryDay)<=draft.availableDay)throw Error('到期日须为整数且晚于可用日');
  if(draft.note!==undefined&&(typeof draft.note!=='string'||draft.note.length>2000))throw Error('备注须为不超过2000字的文本');
  draft.expiryDay=Number(draft.expiryDay);draft.lateDays=Math.max(0,draft.availableDay-draft.needDay);draft.supplierId=relation['供应商编号'];draft.remainingGap=Math.max(0,draft.netGap-draft.quantity);draft.recommendedQuantity=procurement(draft.netGap,relation,draft.needDay,Number(body.currentDay)).quantity;
  // Editing an adopted supply explicitly removes it from future trial inputs.
  draft.status=body.action==='adopt'?'adopted':'draft';
 }
 draft.version=(draft.version||0)+1;draft.supplyIdentity='draft:'+draft.id;
 if(prior)d.drafts[d.drafts.indexOf(prior)]=draft;else d.drafts.push(draft);
 return {draft,externalDispatch:false};
}
