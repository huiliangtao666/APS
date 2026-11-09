import {MPS_METRICS,MPS_TABLES,mpsFail,mpsDisplay} from './mps-report.mjs';
import {sumKnown} from './query-reports/projections.mjs';

const metrics=new Map(MPS_METRICS.map(([key,label])=>[key,label]));
const projected=new Set(['opening','balance','expiry','shortage','safetyGap']);
export const mpsMetricTable=key=>['independent','dependent','demand'].includes(key)?'demands':['opening','expiry'].includes(key)?'inventory':['arrival','purchase'].includes(key)?'incoming':['firm','completion','mps'].includes(key)?'manufacturing':key.startsWith('suggest')?'suggestions':key==='safety'?'parameters':'risks';
const rule={
 independent:'优先取净剩余需求；其次扣除已发运量；没有执行记录时取原始需求量，按工厂发运日汇总。',
 dependent:'取物料需求来源的未完成需料量，按来源需料日汇总；已保存的成功投料分配不重复叠加。',
 demand:'净需求合计＝独立净需求＋相关净需求，同一物料按基础单位汇总。',
 opening:'日初预计余额＝库存快照自由量＋此前累计可用供给－此前累计需求－此前累计失效。',
 arrival:'采购净未收量按预计到货日汇总；没有收货执行记录时取订购量，到货不等于可用。',
 purchase:'采购数量归入预计放行日与“到货日＋检验天数”较晚的一天；取消、冻结、待检供给不计入。',
 firm:'优先取尚未入库净余量，没有入库执行记录时取预计合格产出，按预计放行日汇总。',
 completion:'按新增制造批次的末道工序完工日计量一次，既有在制不重复计入。',
 mps:'新增主计划末道产出按“完工时间＋检验提前期”的预计可用日汇总，不表示实际已放行。',
 expiry:'批次先到期先使用；到期时仅扣除尚未使用的余量，已消耗或已补前期缺口的数量不再扣减。',
 balance:'预计期末净余额＝期初＋采购可用＋既有制造可用＋主计划可用－净需求合计－失效扣减。',
 safety:'读取所选版本及日期有效的安全库存目标，目标值不作为需求再次扣减。',
 shortage:'需求缺口＝max(0，－预计期末净余额)，为该日时点值，不按天求和。',
 safetyGap:'安全库存不足＝max(0，安全库存目标－预计期末净余额)，已包含需求缺口。',
 suggestMake:'按来源制造建议的预计可用日汇总；未下达建议不计入正式供给或预计余额。',
 suggestBuy:'按采购建议预计可用日汇总，已转正式的建议不重复计量，未下达建议不计入供给。',
};
function context(c,q){
 if(!Object.hasOwn(MPS_TABLES,q.table))mpsFail('MPS_TABLE_INVALID');
 if(!c.scope.ids.has(q.materialId))mpsFail('MPS_MATERIAL_NOT_SELECTED',404);
 if((q.date!==undefined||q.metric!==undefined)&&(!metrics.has(q.metric)||!c.days.includes(q.date)))mpsFail('MPS_DETAIL_FOCUS_INVALID');
 if(q.metric&&q.table!==mpsMetricTable(q.metric))mpsFail('MPS_DETAIL_TABLE_MISMATCH');
 if(q.section!==undefined&&!(q.section==='inventory'&&q.metric==='opening'))mpsFail('MPS_DETAIL_SECTION_INVALID');
 const material=c.graph.materials.get(q.materialId),overview=c.all.find(r=>r.id===q.materialId);
 return {material,overview,date:q.date||c.days.at(-1),unit:material['基础单位']||'',focused:!!q.metric,native:!!q.metric&&q.table===mpsMetricTable(q.metric)};
}
function components(c,q){
 const {material,date}=context(c,q),at=key=>c.metric(material,key,date);
 if(q.metric==='opening'){
  const basis=c.projection(material,date)?.openingBasis;
  if(basis)return [...Object.entries({snapshotFree:'库存快照自由量',priorSupply:'此前累计可用供给（加）',priorDemand:'此前累计需求（减）',priorExpiry:'此前累计失效（减）'}).map(([key,label])=>({key,label,value:{value:basis[key],state:'KNOWN',reason:''},condition:rule.opening})),{key:'opening',label:metrics.get('opening'),value:at('opening'),condition:rule.opening}];
 }
 const keys={demand:['independent','dependent','demand'],opening:['opening'],balance:['opening','purchase','firm','mps','demand','expiry','balance'],shortage:['balance','shortage'],safetyGap:['safety','balance','safetyGap'],safety:['safety']}[q.metric]||[];
 return keys.map(key=>{const value=at(key);return {key,label:metrics.get(key),value:value.state==='NOT_APPLICABLE'?{value:0,state:'KNOWN',reason:''}:value,condition:value.state==='NOT_APPLICABLE'?'该供给类型不适用，公式中按0计':rule[key]};});
}
function calculationRows(c,q){
 const {material,date,unit}=context(c,q),ref={table:'物料主数据',key:q.materialId,row:material._row??null};
 if(q.metric==='expiry'){
  const trace=c.projection(material,date)?.expiredLots||[],index=new Map(Object.values(c.details).flat().map(r=>[r.id,r]));
  return trace.map((lot,i)=>{const source=index.get(lot.record);return {id:'expiry:'+q.materialId+':'+date+':'+i,materialId:q.materialId,values:{id:source?.raw?.['库存批次编号']??source?.values.productionId??source?.values.po??lot.record,materialId:q.materialId,kind:source?.values.kind??'库存/采购批次',availableDate:lot.availableDate,expiryDate:lot.expiryDate,initialQuantity:lot.initialQuantity,consumedQuantity:lot.consumedQuantity,quantity:lot.expiredQuantity,unit,condition:'到期扣减＝纳入推演量－此前已消耗量；扣减后不再计入可用库存'},refs:source?.refs||[ref],raw:{...lot,sourceRecord:lot.record,calculationDate:date,source:source?.raw??source?.values}};});
 }
 return components(c,q).map(part=>({id:'calculation:'+q.materialId+':'+date+':'+part.key,materialId:q.materialId,values:{id:part.label,materialId:q.materialId,kind:'计算分项',name:part.label,calculationDate:date,quantity:part.value,unit,condition:part.condition},refs:[ref],raw:{metric:part.key,date,value:part.value,formula:part.condition}}));
}
export function mpsDetailRows(c,q){
 const state=context(c,q);
 if(q.section==='inventory')return c.details.inventory.filter(r=>r.materialId===q.materialId);
 if(state.native&&projected.has(q.metric))return calculationRows(c,q);
 let rows=c.details[q.table].filter(r=>r.materialId===q.materialId||q.table==='parameters'&&r.id.startsWith('parameter:')&&['CAL','GLOBAL',q.materialId].includes(r.materialId));
 if(state.native&&q.metric==='safety')return calculationRows(c,q);
 if(state.native){
  const keys=q.metric==='demand'?['independent','dependent']:[q.metric];
  const events=c.events.filter(e=>e.materialId===q.materialId&&keys.includes(e.metric)&&(e.date===q.date||e.date===null)),quantities=new Map();
  for(const e of events){if(!quantities.has(e.record))quantities.set(e.record,[]);quantities.get(e.record).push(e.quantity);}
  rows=rows.filter(r=>quantities.has(r.id)).map(r=>({...r,values:{id:r.values.id,materialId:r.materialId,countedQuantity:sumKnown(quantities.get(r.id)),...r.values}}));
 }
 if(q.table==='risks'&&!state.native){
  rows=rows.filter(r=>!r.id.startsWith('coverage:')&&!r.id.startsWith('projection:'));
  rows.push(...calculationRows(c,{...q,metric:'balance',date:state.date}));
 }
 return rows;
}

export function mpsDetailExplanation(c,q,rows){
 const {material,overview,date,unit,focused,native}=context(c,q);
 const qty=value=>{const known=typeof value==='number'||value?.state==='KNOWN';return mpsDisplay(value)+(known&&unit?' '+unit:'');};
 const window=c.from+' 至 '+c.to,period=focused?q.date:window;
 const scope=focused?'下列仅展示所点指标在该日期的计算说明与相关明细。':'下列展示所选版本中该物料的'+MPS_TABLES[q.table]+'来源。';
 let headline='',explanation='';
 let emptyMessage='没有该物料的对应来源记录。';
 if(focused){
  const key=q.metric,label=metrics.get(key),value=c.metric(material,key,date),keys=key==='demand'?['independent','dependent']:[key];
  const count=new Set(c.events.filter(e=>e.materialId===q.materialId&&keys.includes(e.metric)&&(e.date===date||e.date===null)).map(e=>e.record)).size;
  const at=k=>qty(c.metric(material,k,date));
  explanation=rule[key];
  if(value.state==='NOT_APPLICABLE')headline='该物料为'+material['物料来源']+'来源，'+label+'不适用。';
  else if(value.state==='NOT_COVERED')headline=date+' 的'+label+'不在所选计划覆盖范围内。';
  else if(value.state!=='KNOWN'){
   headline=date+' 的'+label+'尚无可显示数值。';
   explanation='原因：'+value.reason+'。'+explanation;
  }else if(key==='expiry'){
   const count=c.projection(material,date)?.expiredLots?.length||0;
   headline=value.value===0?date+' 按当前批次推演没有到期未使用余量，预计失效扣减为 '+qty(value)+'。':date+' 有 '+count+' 个批次到期，预计扣减未使用余量 '+qty(value)+'。';
  }else if(key==='demand')headline=date+' 的独立净需求 '+at('independent')+' 加相关净需求 '+at('dependent')+'，合计 '+qty(value)+'。';
  else if(key==='balance')headline=date+' 的预计期末净余额为 '+qty(value)+(value.value<0?'，表示截至当日预计缺少 '+qty(-value.value):'，表示截至当日预计剩余数量')+'。';
  else if(key==='opening')headline=date+' 日初从前期供需结转的预计净余额为 '+qty(value)+'。';
  else if(key==='shortage')headline=date+(value.value===0?' 的预计供给已覆盖截至当日的累计需求，需求缺口为 ': ' 截至当日的累计需求仍有预计缺口 ')+qty(value)+'。';
  else if(key==='safetyGap')headline=date+(value.value===0?' 的预计期末余额已达到安全库存目标，安全库存不足为 ':' 的预计期末余额低于安全库存目标，差额为 ')+qty(value)+'。';
  else if(key==='safety')headline=date+' 有效的安全库存目标为 '+qty(value)+'。';
  else headline=date+' 的'+label+'为 '+qty(value)+(count?'，由 '+count+' 条来源记录汇总得到':'，当天没有计入该指标的来源记录')+'。';
  if(native)emptyMessage=value.state==='KNOWN'&&value.value===0?'该日没有计入此指标的数量。':value.state==='KNOWN'?'该指标的计算口径见上方说明。':headline;
  if(q.section==='inventory')emptyMessage='所选版本没有该物料的库存快照批次。';
 }else{
  const values=overview.values;
  const summaries={
   demands:'本物料有 '+rows.filter(r=>r.values.kind==='独立需求').length+' 笔独立需求、'+rows.filter(r=>r.values.kind==='相关需求').length+' 笔相关需料，成功投料分配另列供查阅。',
   inventory:'本物料有 '+rows.length+' 个库存批次，快照实物为 '+qty(values.snapshotPhysical)+'，扣除占用及资格限制后的自由量为 '+qty(values.snapshotFree)+'。',
   incoming:'本物料共有 '+rows.length+' 条采购在途记录，下列明细分别说明订购、未收、到货和预计可用日期。',
   manufacturing:'本物料有 '+rows.filter(r=>r.values.kind==='既有制造').length+' 条既有制造记录、'+rows.filter(r=>r.values.kind==='新增主计划').length+' 个新增制造批次，两类供给分别计量。',
   suggestions:'本物料有 '+rows.length+' 条补货建议，建议数量供下达参考，不计入正式供给或预计余额。',
   parameters:'这里展示本物料的基础参数、有效BOM及适用的全局或日历配置，所有参数均来自所选版本。',
   risks:'截至 '+date+'，本物料预计期末净余额为 '+qty(c.metric(material,'balance',date))+'，需求缺口为 '+qty(c.metric(material,'shortage',date))+'；下列列出计算分项和已保存风险。',
  };
  headline=summaries[q.table];
  explanation=q.table==='risks'?rule.balance:q.table==='inventory'?'快照数值与查询起点预计库存分别展示；批次是否可用取决于质量、放行、到期和占用。':q.table==='suggestions'?'已转正式的建议不重复计入未下达建议；实际供给以采购或制造记录为准。':'';
 }
 return {headline,rule:explanation,scope,emptyMessage,metric:focused?q.metric:null,label:focused?metrics.get(q.metric):MPS_TABLES[q.table],date:focused?q.date:null,period,unit};
}

export function mpsDetailSections(q){
 const labels={opening:'期初库存结转计算',expiry:'到期扣减批次',balance:'期末余额计算',shortage:'需求缺口计算',safetyGap:'安全库存不足计算',safety:'安全库存目标'};
 return {sectionLabel:q.section==='inventory'?'库存快照批次':labels[q.metric]||MPS_TABLES[q.table],
  supportSections:q.metric==='opening'&&q.section===undefined?[{id:'inventory',label:'库存快照批次',note:'以下批次支撑上方库存快照自由量；当日期初余额还包含此前供需及失效结转，不能直接用快照实物替代。'}]:[]};
}
