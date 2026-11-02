import {selectionDataset,selectedFactIssues} from './workbook-selection.mjs';
import {rows,problem,workbookReadiness} from './workbook-model.mjs';

const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
const day=v=>number(v)&&Number.isInteger(Number(v));
const unique=a=>Array.isArray(a)&&new Set(a).size===a.length;
// Application seam: parse/model remain independently owned. Missing supply
// facts may be saved for maintenance, but must never become zero at execution.
export function supplyIssues(d) {
 const issues=[],add=(t,r,f,m)=>issues.push(problem(t,r,f,m,'SUPPLY_INPUT'));
 const materials=new Map(rows(d,'物料主数据').map(r=>[r['物料编号'],r]));
 for(const r of rows(d,'期初库存')){
  for(const f of ['当前数量','期初已占用量'])if(!number(r[f])||Number(r[f])<0)add('期初库存',r,f,'实物和已有显式占用须为非负有限数量');
  const qualified=['已放行','合格'].includes(r['质量状态']),hasRelease=r['放行日']!==undefined&&r['放行日']!==null&&r['放行日']!=='';
  // A quarantined lot with no release fact is unavailable, rather than an
  // invented day0 supply or a blocker for every other qualified lot.
  for(const f of ['到期日',...(qualified||hasRelease?['放行日']:[])])if(!day(r[f]))add('期初库存',r,f,'供应日序须显式填写整数');
  if(day(r['放行日'])&&Number(r['到期日'])<=Number(r['放行日']))add('期初库存',r,'到期日','到期日须晚于放行日');
 }
 const poIssues=transitIdentityIssues(rows(d,'既有采购在途'));issues.push(...poIssues);
 for(const r of rows(d,'既有采购在途')){
  if(!number(r['订购数量'])||Number(r['订购数量'])<=0)add('既有采购在途',r,'订购数量','在途数量须显式为正');
  if(r['数量单位']!==materials.get(r['物料编号'])?.['基础单位'])add('既有采购在途',r,'数量单位','在途须使用物料基础单位');
  const s=rows(d,'供应商与供货条件').find(s=>s['供货关系编号']===r['供货关系编号']);
  if(!s||!day(s['检验天数'])||Number(s['检验天数'])<0)add('既有采购在途',r,'供货关系编号','需显式检验天数，不推定为0');
  for(const f of ['约定到货日','预计放行日','预计到期日'])if(!day(r[f]))add('既有采购在途',r,f,'在途日期须显式为整数');
  if(Number(r['预计到期日'])<=Math.max(Number(r['预计放行日']),Number(r['约定到货日'])+Number(s?.['检验天数'])))add('既有采购在途',r,'预计到期日','到期须晚于到货加检验/预计放行');
  if(!r['在途状态'])add('既有采购在途',r,'在途状态','在途状态不可缺失');
 }
 const routes=[...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])],boms=rows(d,'物料清单');
 for(const r of rows(d,'期初在制')){
  const fail=m=>issues.push(problem('期初在制',r,'当前工序编号',m,'G03'));
  const matches=(d.mapping?.wip_remaining||[]).filter(w=>w.id===r['在制批次编号']);
  if(matches.length!==1){fail('需唯一且完整的WIP剩余映射');continue;}
  const w=matches[0],product=r['成品编号'],rs=routes.filter(s=>s['成品编号']===product),bs=boms.filter(b=>b['父项编号']===product);
  if(w.product!==product||w.resource!==r['占用资源编号']||!rows(d,'设备与工装').some(s=>s['资源编号']===w.resource)||!rs.some(s=>s['工序编号']===r['当前工序编号']))fail('WIP产品/当前工序/占用资源与原记录不符');
  if(!number(r['预计合格产出'])||Number(r['预计合格产出'])<=0||r['数量单位']!==materials.get(product)?.['基础单位'])fail('WIP产出须为显式正数及基础单位');
  if(!['已开工日','预计完工日','预计放行日'].every(f=>day(r[f]))||Number(r['预计放行日'])<Number(r['预计完工日'])||!r['已投料口径']||!r['库存口径'])fail('WIP日期/历史已投料/期初净账口径不可缺失');
  if(!unique(w.remaining_route_steps)||!w.remaining_route_steps.length||w.remaining_route_steps.some(id=>!rs.some(s=>s['路线工序编号']===id)))fail('余工序须显式列出且属于该产品路线');
  // [] is an explicit statement of no future feed; undefined is unknown.
  if(!unique(w.remaining_material_bom_ids)||w.remaining_material_bom_ids.some(id=>!bs.some(b=>b['用量关系编号']===id)))fail('余料须显式列出该产品BOM关系，不能缺失后补0');
  if(Array.isArray(w.remaining_material_bom_ids))for(const id of w.remaining_material_bom_ids){const f=d.mapping?.feed_mappings?.find(f=>f.bom_id===id);if(!f||!w.remaining_route_steps?.includes(f.route_step_id))fail('剩余待投BOM必须映射到剩余工序');}
  if(!Array.isArray(w.current_occupancy_day_interval)||w.current_occupancy_day_interval.length!==2||!w.current_occupancy_day_interval.every(day)||Number(w.current_occupancy_day_interval[1])<Number(w.current_occupancy_day_interval[0]))fail('WIP当前占用须显式给出半开日区间');
  const crew=rows(d,'班组资源').find(c=>c['班组编号']===w.remaining_labor_pool),tools=d.mapping?.tool_pools?.[w.remaining_tool_type];
  if(!crew||!number(w.remaining_labor_count)||Number(w.remaining_labor_count)<=0||Number(w.remaining_labor_count)>Number(crew['每班可用人数'])||!Array.isArray(tools)||!number(w.remaining_tool_count)||!Number.isInteger(Number(w.remaining_tool_count))||Number(w.remaining_tool_count)<0||Number(w.remaining_tool_count)>tools.length)fail('WIP剩余人员/工装必须有显式有限来源');
 }
 return issues;
}
export function transitIdentityIssues(records){
 const seen=new Set(),issues=[];
 for(const r of records){const key=JSON.stringify([r['采购订单编号'],String(Number(r['订单行号']))]);
  if(!r['采购订单编号']||!day(r['订单行号'])||Number(r['订单行号'])<1||seen.has(key))issues.push(problem('既有采购在途',r,'订单行号','需唯一且完整的采购订单/正整数行身份','SUPPLY_INPUT'));seen.add(key);
 }
 return issues;
}
export function supplyReadiness(d,selection){const selected=selectionDataset(d,selection),ready=workbookReadiness(selected),issues=[...ready.issues,...supplyIssues(selected),...selectedFactIssues(selected)],completenessIssues=selection?[...workbookReadiness(d).issues,...supplyIssues(d)]:issues;return {...ready,ready:issues.length===0,issues,completenessIssues,dependencyClosure:selected._selectionClosure||null};}

export function supplyLots(d){
 const lots=[];
 for(const r of rows(d,'期初库存'))lots.push({id:'inventory:'+r['库存批次编号'],material:r['物料编号'],quantity:Math.max(0,Number(r['当前数量'])-Number(r['期初已占用量'])),used:0,ready:day(r['放行日'])?Number(r['放行日']):null,expiry:Number(r['到期日']),quality:['已放行','合格'].includes(r['质量状态']),conditional:false,source:{sheet:'期初库存',row:r._row,record:r['库存批次编号'],explicitOccupied:Number(r['期初已占用量'])}});
 for(const r of rows(d,'既有采购在途')){const s=rows(d,'供应商与供货条件').find(s=>s['供货关系编号']===r['供货关系编号']);lots.push({id:'transit:'+r['在途记录编号'],material:r['物料编号'],quantity:Number(r['订购数量']),used:0,ready:Math.max(Number(r['预计放行日']),Number(r['约定到货日'])+Number(s?.['检验天数'])),expiry:Number(r['预计到期日']),quality:!['作废','取消','冻结','待检'].includes(r['在途状态']),conditional:true,source:{sheet:'既有采购在途',row:r._row,po:r['采购订单编号'],line:r['订单行号'],status:r['在途状态'],relationId:r['供货关系编号']}});}
 for(const r of d.drafts||[])if(r.status==='adopted')lots.push({id:'draft:'+r.id,material:r.materialId,quantity:r.quantity,used:0,ready:r.availableDay,expiry:r.expiryDay,quality:true,conditional:true,source:{draft:r.id,run:r.sourceRun,version:r.sourceVersion,suggestion:r.suggestionId,status:r.status}});
 return lots;
}
