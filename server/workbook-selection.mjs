import {parameterSpec,sourceTable,cpOf} from './parameter-contract.mjs';
const rows=(d,t)=>d.tables?.[t]||[];
// Build one dependency projection for readiness, calculation and verification.
// Retain all lots for a selected SKU and all WIP sharing its physical pools;
// selection never creates a new copy of supply or a new capacity pool.
export function selectionDataset(data,selection){
 if(!selection||!data.parameterPrecedence)return data;
 const d=structuredClone(data),mapping=d.mapping||{},demands=rows(d,'每日需求').filter(r=>Number(r['需求日'])>=selection.startDay&&Number(r['需求日'])<selection.endDay&&(!selection.demandIds||selection.demandIds.includes(r['需求编号'])));
 const materials=new Set(demands.map(r=>r['成品编号'])),wips=new Set(),resourceIds=new Set(),crewIds=new Set(),toolTypes=new Set(),routeIds=new Set(),bomIds=new Set();
 const routes=[...rows(d,'工艺路线'),...(mapping.sfRoutes||[])],resources=[...rows(d,'设备与工装'),...(mapping.resources||[]).map(r=>({'资源编号':r.id,'资源组编号':r.group}))];
 let changed=true;
 while(changed){const before=JSON.stringify([[...materials],[...wips],[...resourceIds],[...crewIds],[...toolTypes]]);
  for(const b of rows(d,'物料清单'))if(materials.has(b['父项编号'])&&Number(b['生效日'])<selection.endDay&&selection.startDay<Number(b['失效日'])){bomIds.add(b['用量关系编号']);materials.add(b['子项编号']);}
  for(const r of routes)if(materials.has(r['成品编号'])){routeIds.add(r['路线工序编号']);crewIds.add(r['班组编号']);toolTypes.add(r['所需工装类型']);for(const x of resources)if(x['资源组编号']===r['设备组编号'])resourceIds.add(x['资源编号']);}
  for(const type of toolTypes)for(const id of mapping.tool_pools?.[type]||[])resourceIds.add(id);
  for(const w of rows(d,'期初在制')){
   const m=mapping.wip_remaining?.find(x=>x.id===w['在制批次编号']);
   const sharedTools=(mapping.tool_pools?.[m?.remaining_tool_type]||[]).some(id=>resourceIds.has(id));
   if(materials.has(w['成品编号'])||resourceIds.has(w['占用资源编号'])||crewIds.has(m?.remaining_labor_pool)||sharedTools){
    wips.add(w['在制批次编号']);materials.add(w['成品编号']);resourceIds.add(w['占用资源编号']);
    if(m){crewIds.add(m.remaining_labor_pool);toolTypes.add(m.remaining_tool_type);for(const id of m.remaining_material_bom_ids||[]){bomIds.add(id);const b=rows(d,'物料清单').find(b=>b['用量关系编号']===id);if(b)materials.add(b['子项编号']);}}
   }
  }
  changed=before!==JSON.stringify([[...materials],[...wips],[...resourceIds],[...crewIds],[...toolTypes]]);
 }
 const supplierIds=new Set([...rows(d,'供应商与供货条件').filter(r=>materials.has(r['物料编号'])).map(r=>r['供货关系编号']),...rows(d,'物料主数据').filter(r=>materials.has(r['物料编号'])).map(r=>r['参考供货关系编号']).filter(Boolean)]);
 const locationIds=new Set(rows(d,'期初库存').filter(r=>materials.has(r['物料编号'])).map(r=>r['库位编号']));
 // Physical storage occupancy is shared too. Keep neighbor lots for the capacity
 // check, but don't require their unrelated manufacturing routes.
 const inventory=rows(d,'期初库存').filter(r=>materials.has(r['物料编号'])||locationIds.has(r['库位编号'])),visibleMaterials=new Set([...materials,...inventory.map(r=>r['物料编号'])]);
 const customers=new Set(demands.map(r=>r['客户编号']));
 Object.assign(d.tables,{
  '工厂日历':rows(d,'工厂日历').filter(r=>Number(r['日序'])>=selection.startDay&&Number(r['日序'])<selection.endDay),'每日需求':demands,'物料主数据':rows(d,'物料主数据').filter(r=>visibleMaterials.has(r['物料编号'])),
  '客户与交付':rows(d,'客户与交付').filter(r=>customers.has(r['客户编号'])),
  '物料清单':rows(d,'物料清单').filter(r=>bomIds.has(r['用量关系编号'])),
  '工艺路线':rows(d,'工艺路线').filter(r=>routeIds.has(r['路线工序编号'])),
  '设备与工装':rows(d,'设备与工装').filter(r=>resourceIds.has(r['资源编号'])),
  '班组资源':rows(d,'班组资源').filter(r=>crewIds.has(r['班组编号'])),
  '供应商与供货条件':rows(d,'供应商与供货条件').filter(r=>supplierIds.has(r['供货关系编号'])),
  '期初库存':inventory,'库区库位':rows(d,'库区库位').filter(r=>locationIds.has(r['库位编号'])),
  '既有采购在途':rows(d,'既有采购在途').filter(r=>materials.has(r['物料编号'])),
  '期初在制':rows(d,'期初在制').filter(r=>wips.has(r['在制批次编号'])),
  '停机安排':rows(d,'停机安排').filter(r=>resourceIds.has(r['资源编号'])),
  '单位换算':rows(d,'单位换算').filter(r=>visibleMaterials.has(r['物料编号']))
 });
 d.mapping=d.mapping?{...mapping,sfRoutes:(mapping.sfRoutes||[]).filter(r=>routeIds.has(r['路线工序编号'])),resources:(mapping.resources||[]).filter(r=>resourceIds.has(r.id)),feed_mappings:(mapping.feed_mappings||[]).filter(r=>bomIds.has(r.bom_id)),tool_pools:Object.fromEntries(Object.entries(mapping.tool_pools||{}).filter(([type])=>toolTypes.has(type))),wip_remaining:(mapping.wip_remaining||[]).filter(r=>wips.has(r.id))}:null;
 const keys={ '物料主数据':'物料编号','供应商与供货条件':'供货关系编号','客户与交付':'客户编号','工艺路线':'路线工序编号','设备与工装':'资源编号','班组资源':'班组编号','库区库位':'库位编号','期初库存':'库存批次编号','每日需求':'需求编号','物料清单':'用量关系编号'};
 d.tables['配置参数']=rows(d,'配置参数').filter(p=>{
  const spec=parameterSpec(p),table=spec?.table||sourceTable(cpOf(p)||'CP000');
  if(p['对象编号']==='CAL'||p['对象编号']==='GLOBAL')return true;
  if(table==='供应商与供货条件'&&supplierIds.has(p['对象编号']))return true;
  if(!table)return materials.has(p['对象编号'])||resourceIds.has(p['对象编号']);
  return rows(d,table).some(r=>String(r[spec?.key||keys[table]])===p['对象编号']||table==='物料清单'&&r['清单版本编号']===p['对象编号']);
 });
 d._selectionClosure={version:'selected-dependencies-r1',demandIds:demands.map(r=>r['需求编号']),materialIds:[...materials],resourceIds:[...resourceIds],crewIds:[...crewIds],wipIds:[...wips],supplierIds:[...supplierIds],routeIds:[...routeIds],bomIds:[...bomIds]};
 return d;
}

export function selectedFactIssues(d){
 if(!d._selectionClosure)return [];
 const positive=new Set(['需求箱数','需求千克','每箱净重千克','保质天数','需求人数','日产能分母','订货倍数','单次批量上限千克','标准日产能千克','标准日班次数']);
 const nonnegative=new Set(['运输天数','允许提前天数','允许延后天数','到货剩余保质比例','采购导期天数','检验天数','最小订货量','跨日历时天数','最小等待天数','最大等待天数','每批工装套数','可用数量','每班可用人数','周日班次数','生产班次数','日产能分子']);
 const issues=[],needed=(table,row,fields)=>{for(const field of fields)if(row[field]===undefined||row[field]===null||String(row[field]).trim()===''||!Number.isFinite(Number(row[field]))||positive.has(field)&&!(Number(row[field])>0)||nonnegative.has(field)&&Number(row[field])<0)issues.push({severity:'error',code:'REQUIRED_SELECTED_FACT',sheet:table,row:row._row||0,record:row['物料编号']||row['路线工序编号']||row['需求编号']||row['供货关系编号']||row['日序']||row['资源编号']||row['班组编号'],field,message:'本次依赖缺少显式有限数值；请在对应业务表或同源参数入口补齐，不能默认0/无限'});};
 for(const r of rows(d,'每日需求'))needed('每日需求',r,['需求箱数','需求千克','最早到货日','最晚到货日','按要求日最晚发运日','到货剩余保质天数']);
 for(const r of rows(d,'物料主数据').filter(r=>d._selectionClosure.materialIds.includes(r['物料编号'])))needed('物料主数据',r,['保质天数',...(r['物料来源']==='制造'?['生产提前期天数','每箱净重千克']:[])]);
 for(const r of rows(d,'客户与交付'))needed('客户与交付',r,['运输天数','允许提前天数','允许延后天数','到货剩余保质比例']);
 for(const r of rows(d,'供应商与供货条件'))needed('供应商与供货条件',r,['采购优先级','采购导期天数','检验天数','最小订货量','订货倍数']);
 for(const r of [...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])])needed('工艺路线',r,['工序顺序','跨日历时天数','最小等待天数','最大等待天数','每批工装套数','需求人数']);
 for(const r of rows(d,'设备与工装'))needed('设备与工装',r,['可用数量',...(r['资源类别']==='设备'?['单次批量上限千克','标准日产能千克']:[])]);
 for(const r of rows(d,'班组资源'))needed('班组资源',r,['每班可用人数','标准日班次数','周日班次数']);
 for(const r of rows(d,'工厂日历'))needed('工厂日历',r,['生产班次数','日产能分子','日产能分母']);
 return issues;
}
