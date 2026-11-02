import {table,ref,keyOf,number,publicValues,dayCalendar,digest,fail} from './context.mjs';
import {effectiveBom,expandBom,bomLeads} from './bom.mjs';
import {capacityRows} from './capacity.mjs';
import {quantityMath as Q} from '../../src/lib/material-allocation.mjs';

export const VIEWS=Object.freeze({
  'bom.materials':'物料与BOM','bom.relations':'用量关系','bom.paths':'提前期路径',
  'demand.daily':'按日需求','demand.details':'需求明细','demand.customers':'客户与交付',
  'inventory.summary':'库存汇总','inventory.batches':'批次明细','inventory.projected':'预计库存','inventory.supply':'在途与在制',
  'capacity.daily':'按日产能','capacity.equipment':'设备能力','capacity.stops':'停机安排','capacity.routes':'工艺与班组',
  'replenishment.purchase':'采购补料建议','replenishment.net':'缺料净算','replenishment.manufacture':'制造补给建议','replenishment.incoming':'已有采购在途'});
export const row=(id,values,refs=[],extra={})=>({id,values,refs,...extra});
export const sourceRow=(t,r,values={},extra={})=>row(t+':'+keyOf(t,r),{...publicValues(r),...values},[ref(t,r)],extra);
export const sumKnown=values=>{
  if(values.some(v=>number(v)===null))return null;
  const decimal=v=>{const m=String(v).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if(!m)fail('INVALID_QUANTITY');const scale=(m[3]||'').length-Number(m[4]||0),n=BigInt((m[2]||'0')+(m[3]||''))*(m[1]==='-'?-1n:1n);
    return scale>=0?{n,d:10n**BigInt(scale)}:{n:n*10n**BigInt(-scale),d:1n};};
  const value=Q.num(values.reduce((n,v)=>Q.add(n,decimal(v)),Q.q('0')));if(!Number.isFinite(value))fail('QUANTITY_OVERFLOW');return value;
};
const inWindow=(v,w)=>number(v)!==null&&Number(v)>=w.start&&Number(v)<w.end;
const dateFields=(r,s,fields)=>Object.fromEntries(fields.map(f=>[f+'日期',dayCalendar(s.identity.dayZero,number(r[f]))]));
export function inputMaterial(r){return r['物料编号']??r['成品编号']??r['所需物料编号']??null;}
export function materialUniverse(d){return table(d,'物料主数据').map(r=>({id:r['物料编号'],name:r['物料名称']||'',category:r['物料类别']||'未提供类别'}));}
export function graphContext(d,asOf,roots,includeBom){const graph=effectiveBom(d,asOf);return {graph,scope:expandBom(graph,roots,includeBom),leads:bomLeads(d,graph)};}

function demandRows(s,d,view,w,scope,unit){
  const customers=new Map(table(d,'客户与交付').map(r=>[r['客户编号'],r])),results=new Map((s.run?.result.demandResults||[]).map(r=>[r.id,r]));
  const raw=table(d,'每日需求').filter(r=>scope.ids.has(r['成品编号'])&&inWindow(r['需求日'],w));
  if(view==='demand.customers')return table(d,'客户与交付').map(r=>sourceRow('客户与交付',r,{}, {materialIds:raw.filter(x=>x['客户编号']===r['客户编号']).map(x=>x['成品编号'])}));
  return raw.map(r=>{
    const c=customers.get(r['客户编号']),p=results.get(r['需求编号']),field=unit==='箱'?'需求箱数':'需求千克';
    // Raw semantic amounts are preserved; no child-BOM demand fabrication.
    const values={...(c?publicValues(c):{}),...publicValues(r),quantity:number(r[field]),unit,day:number(r['需求日']),materialId:r['成品编号'],
      ...dateFields(r,s,['需求日','最早到货日','最晚到货日','按要求日最晚发运日']),
      planStatus:p?.status??null,readyDate:dayCalendar(s.identity.dayZero,p?.readyDay),arrivalDate:dayCalendar(s.identity.dayZero,p?.arrivalDay),lateDays:p?.lateDays??null,
      actualDelivered:null,undelivered:null};
    return sourceRow('每日需求',r,values,{materialIds:[r['成品编号']],refs:[ref('每日需求',r),...(c?[ref('客户与交付',c)]:[])],
      runRefs:p?[{collection:'demandResults',id:p.id}]:[],notProvided:[...(!s.run?['冻结运行交付结果']:!p?['此需求未包含在运行选择']:[]),'实际交付完成事实']});
  });
}
export function aggregateRows(rows,keys,fields){
  const groups=new Map();for(const r of rows){const key=JSON.stringify(keys.map(k=>r.values[k]??null));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  return [...groups].map(([key,members])=>row('group:'+digest([keys,key]),{
    ...Object.fromEntries(keys.map(k=>[k,members[0].values[k]??null])),...Object.fromEntries(fields.map(k=>[k,sumKnown(members.map(r=>r.values[k]))])),records:members.length},
    members.flatMap(r=>r.refs),{materialIds:[...new Set(members.flatMap(r=>r.materialIds||[]))],members:members.map(r=>r.id),runRefs:members.flatMap(r=>r.runRefs||[])}));
}
function batches(s,d,w,scope){return table(d,'期初库存').filter(r=>scope.ids.has(r['物料编号'])).map(r=>{
  const q=number(r['当前数量']),used=number(r['期初已占用量']),release=number(r['放行日']),expiry=number(r['到期日']),snap=number(r['快照日']);
  const valid=q!==null&&used!==null&&release!==null&&expiry!==null&&snap!==null;
  const available=!valid?null:['已放行','合格'].includes(r['质量状态'])&&release<=snap&&snap<expiry?Math.max(0,q-used):0;
  const location=table(d,'库区库位').find(l=>l['库位编号']===r['库位编号']);
  return sourceRow('期初库存',r,{materialId:r['物料编号'],unit:r['数量单位']||null,quantity:q,reserved:used,available,
    snapshotDate:dayCalendar(s.identity.dayZero,snap),expiresInWindow:inWindow(expiry,w),...dateFields(r,s,['生产日','入库日','放行日','到期日']),
    customerQualification:'通用期初资格；特定客户要求须独立核对',storageEnvironment:location?.['储存环境']??null},
    {materialIds:[r['物料编号']],refs:[ref('期初库存',r),...(location?[ref('库区库位',location)]:[])],notProvided:valid?[]:['期初资格所需数量/日期字段']});
});}
function incoming(s,d,w,scope){return table(d,'既有采购在途').filter(r=>scope.ids.has(r['物料编号'])).map(r=>{
  const supply=table(d,'供应商与供货条件').find(x=>x['供货关系编号']===r['供货关系编号']&&x['物料编号']===r['物料编号']);
  const release=number(r['预计放行日']),arrival=number(r['约定到货日']),inspection=number(supply?.['检验天数']);
  const available=release===null||arrival===null||inspection===null?null:Math.max(release,arrival+inspection);
  return sourceRow('既有采购在途',r,{materialId:r['物料编号'],quantity:number(r['订购数量']),unit:r['数量单位']||null,day:available,availableDate:dayCalendar(s.identity.dayZero,available),
    ...dateFields(r,s,['下单日','约定到货日','预计放行日']),supplyType:'已有采购在途',physicalStock:false},
    {materialIds:[r['物料编号']],refs:[ref('既有采购在途',r),...(supply?[ref('供应商与供货条件',supply)]:[])],notProvided:available===null?['预计可用日期依据']:[]});
}).filter(r=>r.values.day===null||inWindow(r.values.day,w));}
function replenishment(s,d,view,w,scope){
  if(view==='replenishment.incoming')return incoming(s,d,w,scope);
  if(s.run){const p=s.run.result,collection=view==='replenishment.purchase'?'suggestions':view==='replenishment.net'?'shortages':'allocations';
    return (p[collection]||[]).map((x,i)=>({x,i})).filter(({x})=>scope.ids.has(x.materialId)&&(view!=='replenishment.manufacture'||x.kind==='本次制造产出')).map(({x,i})=>{
      const material=table(d,'物料主数据').find(m=>m['物料编号']===x.materialId),day=number(x.needDay??x.feedDay),supply=table(d,'供应商与供货条件').find(r=>r['供货关系编号']===x.relationId);
      return row('run:'+collection+':'+i,{...x,materialId:x.materialId,day,quantity:number(x.quantity),unit:x.unit||material?.['基础单位']||null,
        '供应商编号':x.supplierId??(view==='replenishment.net'?table(d,'供应商与供货条件').filter(r=>r['物料编号']===x.materialId).map(r=>r['供应商编号']):null),'时序风险':number(x.lateDays)>0?'提前期不足':view==='replenishment.net'?'净缺口':'正常',
        status:x.status||'冻结结果',needDate:dayCalendar(s.identity.dayZero,day),orderDate:dayCalendar(s.identity.dayZero,x.orderDay),availableDate:dayCalendar(s.identity.dayZero,x.availableDay),
        ordered:false,allocationGrain:'仅采用真实need/consumer/taskId/productionId关联；不造逐销售订单分摊'},
        [...(material?[ref('物料主数据',material)]:[]),...(supply?[ref('供应商与供货条件',supply)]:[])],
        {materialIds:[x.materialId],runRefs:[{collection,index:i,id:x.id??null}]});
    }).filter(r=>r.values.day===null||inWindow(r.values.day,w));
  }
  const config={
    'replenishment.purchase':['采购订单草案','生产需料日','建议采购数量'],
    'replenishment.net':['每日缺料净算','需料日','需新增补给缺口'],
    'replenishment.manufacture':['生产补给建议','需求日','建议生产量']}[view];
  const [t,dayField,quantityField]=config;
  return table(d,t).filter(r=>scope.ids.has(r['物料编号'])&&inWindow(r[dayField],w)).map(r=>{
    const day=number(r[dayField]),supply=table(d,'供应商与供货条件').find(x=>x['供货关系编号']===r['供货关系编号']);
    const mr=table(d,'物料需求来源').filter(m=>m['所需物料编号']===r['物料编号']&&number(m['需料日'])===day);
    const nc=table(d,'每日缺料净算').filter(n=>n['物料编号']===r['物料编号']&&number(n['需料日'])===day);
    const bom=mr.flatMap(m=>table(d,'物料清单').filter(b=>b['用量关系编号']===m['用量关系编号']));
    return sourceRow(t,r,{materialId:r['物料编号'],day,quantity:number(r[quantityField]),unit:r['数量单位']||null,
      ...dateFields(r,s,[dayField,'理论最晚下单日','建议下单日','预计到货日','预计放行日','最早预计可用日','理论最晚开工日','本版最早可开工日','本版最早预计完成日']),
      reference:true,ordered:false,allocationGrain:'物料×需料日关联，不是销售订单分摊',
      '供应商编号':r['供应商编号']??supply?.['供应商编号']??(view==='replenishment.net'?table(d,'供应商与供货条件').filter(x=>x['物料编号']===r['物料编号']).map(x=>x['供应商编号']):null),
      '时序风险':r['时序风险']||r['状态或风险']||(number(r['预计晚于需料天数'])>0?'提前期不足':'正常')},
      {materialIds:[r['物料编号']],refs:[ref(t,r),...mr.map(x=>ref('物料需求来源',x)),...nc.map(x=>ref('每日缺料净算',x)),...bom.map(x=>ref('物料清单',x)),...(supply?[ref('供应商与供货条件',supply)]:[])]});
  });
}

export function projectRows(s,d,query,ctx){
  const {view,window:w,unit}=query,{graph,scope,leads}=ctx;
  if(view==='bom.materials')return [...graph.materials].filter(([id])=>scope.ids.has(id)).map(([id,r])=>sourceRow('物料主数据',r,{
    materialId:id,ownLeadDays:leads.get(id).own,cumulativeLeadDays:leads.get(id).total,directChildren:new Set((graph.children.get(id)||[]).map(b=>b['子项编号'])).size,
    roots:[...(scope.rootsById.get(id)||[])],selected:query.roots.includes(id),leadMeaning:'同有效BOM的参考历时；非实际排程'},
    {materialIds:[id],refs:[ref('物料主数据',r),...leads.get(id).sources.slice(1),...(graph.children.get(id)||[]).map(b=>ref('物料清单',b))]}));
  if(view==='bom.relations')return graph.edges.filter(r=>scope.ids.has(r['父项编号'])).map(r=>sourceRow('物料清单',r,{materialId:r['父项编号'],...dateFields(r,s,['生效日','失效日']),quantityMeaning:'此父项基准配方；不额外扣损耗或生成需求'}, {materialIds:[r['父项编号'],r['子项编号']]}));
  if(view==='bom.paths'){
    const rows=[];for(const root of query.roots){let id=root,order=1,offset=0;const seen=new Set();
      while(id&&!seen.has(id)){seen.add(id);const m=graph.materials.get(id),lead=leads.get(id);if(!m)break;
        rows.push(row('path:'+JSON.stringify([root,order,id]),{root,materialId:id,sequence:order,ownLeadDays:lead.own,cumulativeLeadDays:lead.total,rootLeadDays:leads.get(root)?.total??null,
          illustrativeStartDate:lead.total===null?null:dayCalendar(s.identity.dayZero,query.asOf+lead.child),illustrativeEndDate:lead.total===null?null:dayCalendar(s.identity.dayZero,query.asOf+lead.total),meaning:'代表路径历时示意；非真实开工'},
          lead.sources,{materialIds:[id],notProvided:lead.total===null?['有效路径累计提前期']:[]}));
        offset+=lead.own??0;id=lead.critical[0];order++;
      }
    }return rows;
  }
  if(view.startsWith('demand.'))return demandRows(s,d,view,w,scope,unit);
  if(view==='inventory.batches'||view==='inventory.summary')return batches(s,d,w,scope);
  if(view==='inventory.supply')return [...incoming(s,d,w,scope),...table(d,'期初在制').filter(r=>scope.ids.has(r['成品编号'])&&(number(r['预计放行日'])===null||inWindow(r['预计放行日'],w))).map(r=>sourceRow('期初在制',r,{
    materialId:r['成品编号'],quantity:number(r['预计合格产出']),unit:r['数量单位']||null,day:number(r['预计放行日']),...dateFields(r,s,['已开工日','预计完工日','预计放行日']),supplyType:'在制条件供给',physicalStock:false}, {materialIds:[r['成品编号']]}))];
  if(view==='inventory.projected'){
    if(s.run)return (s.run.result.allocations||[]).map((x,i)=>row('balance-evidence:'+i,{materialId:x.materialId,day:number(x.feedDay),date:dayCalendar(s.identity.dayZero,x.feedDay),
      unit:graph.materials.get(x.materialId)?.['基础单位']||null,projectedBalance:null,meaning:'冻结分配证据；非预计余额',conditional:x.conditional??null},[],
      {materialIds:[x.materialId],runRefs:[{collection:'allocations',index:i}],notProvided:['完整可推预计余额依据']})).filter(r=>scope.ids.has(r.values.materialId)&&inWindow(r.values.day,w));
    return table(d,'每日缺料净算').filter(r=>scope.ids.has(r['物料编号'])&&inWindow(r['需料日'],w)).map(r=>sourceRow('每日缺料净算',r,{
      materialId:r['物料编号'],day:number(r['需料日']),date:dayCalendar(s.identity.dayZero,number(r['需料日'])),unit:r['数量单位']||null,projectedBalance:number(r['数量演算期末量']),meaning:'输入数量演算；假设建议补给按期，非实绩/可执行排程'}, {materialIds:[r['物料编号']]}));
  }
  if(view.startsWith('capacity.'))return capacityRows(s,d,query,ctx);
  if(view.startsWith('replenishment.'))return replenishment(s,d,view,w,scope);
  fail('UNKNOWN_VIEW');
}
