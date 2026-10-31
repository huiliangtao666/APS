import {createHash} from 'node:crypto';
import fs from 'node:fs';
export const workbookSchema=JSON.parse(fs.readFileSync(new URL('./workbook-schema.json',import.meta.url),'utf8'));
export const hash=v=>createHash('sha256').update(Buffer.isBuffer(v)?v:Buffer.from(typeof v==='string'?v:JSON.stringify(v))).digest('hex');
export const PROFILE='excel-qualified-output-202611-r1';
export const dayMinute=d=>1440*(d-2)-480;
export const dayDate=d=>new Date(Date.UTC(2026,9,31)+d*86400000).toISOString().slice(0,10);
export const rows=(d,t)=>d.tables[t]||[];
export const index=(d,t,k)=>new Map(rows(d,t).map(r=>[r[k],r]));
const numeric=v=>v!==''&&v!==undefined&&Number.isFinite(Number(v));
export function problem(sheet,row,field,message,code='INPUT_INVALID') {return {code,severity:'error',sheet,row:row?._row??0,record:row?.[workbookSchema.tables[sheet]?.key]||'',field,cell:row?._cells?.[field]||'',message,remedy:'打开该记录更正并重新检查'};}
export function refreshDerived(d,atDay=0) {
 const params=index(d,'配置参数','参数编号');
 for(const b of d.bindings||[]){const row=rows(d,b.sheet).find(r=>b.recordKey?(b.sheet==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):r[workbookSchema.tables[b.sheet].key])===b.recordKey:r._row===b.row),original=params.get(b.parameterId),p=original&&rows(d,'配置参数').find(p=>p['对象编号']===original['对象编号']&&p['参数名称']===original['参数名称']&&Number(p['生效日'])<=atDay&&atDay<Number(p['失效日']));if(row&&p)row[b.field]=p['参数值'];}
 const materials=index(d,'物料主数据','物料编号'),suppliers=index(d,'供应商与供货条件','供货关系编号');
 const children=new Map();for(const b of rows(d,'物料清单')){if(!children.has(b['父项编号']))children.set(b['父项编号'],[]);children.get(b['父项编号']).push(b);}
 const memo=new Map(),visiting=new Set();
 function lead(id){if(memo.has(id))return memo.get(id);if(visiting.has(id))return null;visiting.add(id);const m=materials.get(id);if(!m)return null;
  const s=suppliers.get(m['参考供货关系编号']);
  const own=m['物料来源']==='制造'?Number(m['生产提前期天数'])+Number(m['检验提前期天数']):Number(s?.['采购导期天数'])+Number(s?.['检验天数']);
  const child=[...new Set((children.get(id)||[]).map(b=>b['子项编号']))].map(c=>({id:c,days:lead(c)}));
  if(child.some(c=>c.days===null)||!Number.isFinite(own))return null;
  const max=Math.max(0,...child.map(c=>c.days));m['本级补给提前期天数']=String(own);m['累计提前期天数']=String(own+max);m['最长子件累计天数']=String(max);m['代表关键子项编号']=child.filter(c=>c.days===max).map(c=>c.id).sort()[0]||'';m['并列关键子项数']=String(child.filter(c=>c.days===max).length);
  if(Number(m['每件净重千克'])>0)m['每箱件数']=String(Number(m['每箱净重千克'])/Number(m['每件净重千克']));
  m['安全库存量']=String(m['基础单位']==='个'?Math.ceil(Number(m['安全库存覆盖天数'])*Number(m['参考日均毛用量'])):Number((Number(m['安全库存覆盖天数'])*Number(m['参考日均毛用量'])).toFixed(3)));
  visiting.delete(id);memo.set(id,own+max);return own+max;
 }
 for(const id of materials.keys())lead(id);
 for(const r of rows(d,'单位换算')){const m=materials.get(r['物料编号']);if(!m)continue;const factors={'千克':1,'吨':1000,'箱':Number(m['每箱净重千克']),'件':Number(m['每件净重千克']),'个':m['基础单位']==='个'?1:NaN};if(r['换算前单位']===r['换算后单位'])r['换算系数']='1';else if(factors[r['换算前单位']]>0&&factors[r['换算后单位']]>0)r['换算系数']=String(factors[r['换算前单位']]/factors[r['换算后单位']]);}
 const customers=index(d,'客户与交付','客户编号');
 for(const r of rows(d,'每日需求')){const m=materials.get(r['成品编号']),c=customers.get(r['客户编号']);if(!m||!c)continue;r['每箱净重千克']=m['每箱净重千克'];r['需求千克']=String(Number(r['需求箱数'])*Number(m['每箱净重千克']));r['最早到货日']=String(Number(r['需求日'])-Number(c['允许提前天数']));r['最晚到货日']=String(Number(r['需求日'])+Number(c['允许延后天数']));r['按要求日最晚发运日']=String(Number(r['需求日'])-Number(c['运输天数']));r['到货剩余保质天数']=String(Math.ceil(Number(m['保质天数'])*Number(c['到货剩余保质比例'])));}
 for(const r of rows(d,'期初库存'))r['期初可用量']=String(inventoryAmount(r,0));
 // Transit release is authoritative explicit date; inspection duration is an additional floor.
 for(const r of rows(d,'既有采购在途')){const s=suppliers.get(r['供货关系编号']);r._availableDay=Math.max(Number(r['预计放行日']),Number(r['约定到货日'])+Number(s?.['检验天数']||0));}
 return d;
}
export function inventoryAmount(r,day) {return ['已放行','合格'].includes(r['质量状态'])&&Number(r['放行日'])<=day&&day<Number(r['到期日'])?Math.max(0,Number(r['当前数量'])-Number(r['期初已占用量'])):0;}
export function validateWorkbook(d) {
 const issues=[];const add=(t,r,f,m,c)=>issues.push(problem(t,r,f,m,c));
 for(const [t,spec]of Object.entries(workbookSchema.tables)){
  if(spec.kind!=='输入')continue;const seen=new Set();
  for(const r of rows(d,t)){
   const id=t==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):r[spec.key];if(id===undefined||id==='')add(t,r,spec.key,'缺少唯一编号');else if(seen.has(id))add(t,r,spec.key,'重复唯一编号');seen.add(id);
   for(const f of spec.fields){const v=r[f.name];if(v===undefined||v==='')continue;
    if(/数字|整数|小数|数值|比例/.test(f.type)&&!numeric(v))add(t,r,f.name,'须为有限数值');
    if(/数量|用量|需求箱数|人数|套数|上限|容量|导期|提前期|净重|倍数|批量/.test(f.name)&&numeric(v)&&Number(v)<0)add(t,r,f.name,'数量不得小于0');
    if(/日$|天数$|需求日|日序/.test(f.name)&&numeric(v)&&!Number.isInteger(Number(v)))add(t,r,f.name,'日序和天数须为整数');
   }
  }
 }
 const mats=index(d,'物料主数据','物料编号'),customers=index(d,'客户与交付','客户编号'),locations=index(d,'库区库位','库位编号'),sup=index(d,'供应商与供货条件','供货关系编号'),resources=index(d,'设备与工装','资源编号');
 const fk=(t,field,ids)=>{for(const r of rows(d,t))if(!ids.has(r[field]))add(t,r,field,'引用对象不存在：'+r[field],'FOREIGN_KEY');};
 for(const [t,f]of [['物料清单','父项编号'],['物料清单','子项编号'],['单位换算','物料编号'],['每日需求','成品编号'],['期初库存','物料编号'],['既有采购在途','物料编号'],['期初在制','成品编号'],['供应商与供货条件','物料编号']])fk(t,f,mats);
 fk('每日需求','客户编号',customers);fk('期初库存','库位编号',locations);fk('既有采购在途','供货关系编号',sup);fk('停机安排','资源编号',resources);
 const graph=new Map(),pairs=new Map();for(const b of rows(d,'物料清单')){
  const p=b['父项编号'],c=b['子项编号'];if(!graph.has(p))graph.set(p,[]);graph.get(p).push({id:c,row:b});
  const key=p+'|'+c,earlier=pairs.get(key)||[];for(const old of earlier)if(Number(b['生效日'])<Number(old['失效日'])&&Number(old['生效日'])<Number(b['失效日']))add('物料清单',b,'生效日','同一父子关系版本有效期重叠','BOM_VERSION_OVERLAP');earlier.push(b);pairs.set(key,earlier);
  if(!(Number(b['父项基准产出千克'])>0)||!(Number(b['子项基准用量'])>=0))add('物料清单',b,'子项基准用量','基准须大于0且定额不得负');
  if(mats.has(c)&&b['数量单位']!==mats.get(c)['基础单位'])add('物料清单',b,'数量单位','子件数量单位必须与SKU基础单位一致');
 }
 const done=new Set(),stack=new Set();function visit(id){if(done.has(id))return;stack.add(id);for(const c of graph.get(id)||[])if(stack.has(c.id))add('物料清单',c.row,'子项编号','BOM循环：'+[...stack,c.id].join(' → '),'BOM_CYCLE');else visit(c.id);stack.delete(id);done.add(id);}for(const id of graph.keys())visit(id);
 const scopes=new Map();for(const p of rows(d,'配置参数')){const key=p['对象编号']+'|'+p['参数名称'];if(!numeric(p['参数值']))add('配置参数',p,'参数值','参数值须为有限数字字面值');for(const old of scopes.get(key)||[])if(Number(p['生效日'])<Number(old['失效日'])&&Number(old['生效日'])<Number(p['失效日']))add('配置参数',p,'生效日','对象同义参数有效期重叠','PARAMETER_OVERLAP');scopes.set(key,[...(scopes.get(key)||[]),p]);}
 for(const r of rows(d,'期初库存')){
  if(Number(r['当前数量'])<Number(r['期初已占用量']))add('期初库存',r,'期初已占用量','占用量超过实物数量');const m=mats.get(r['物料编号']),l=locations.get(r['库位编号']);
  if(m&&l&&m['储存环境']!==l['储存环境'])add('期初库存',r,'库位编号','物料环境与库位环境不符','STORAGE_ENVIRONMENT');
  if(m&&r['数量单位']!==m['基础单位'])add('期初库存',r,'数量单位','库存与SKU基础单位不一致');
 }
 for(const l of locations.values()){const lots=rows(d,'期初库存').filter(r=>r['库位编号']===l['库位编号']);if(lots.some(r=>r['数量单位']!==l['容量单位']))add('库区库位',l,'容量单位','库位容量与库存量纲不一致，不能假设换算');else if(lots.reduce((n,r)=>n+Number(r['当前数量']),0)>Number(l['最大容量']))add('库区库位',l,'最大容量','初始实物超过库位容量');}
 for(const r of rows(d,'供应商与供货条件'))if(!(Number(r['订货倍数'])>0))add('供应商与供货条件',r,'订货倍数','订货倍数须大于0');
 const po=new Set();for(const r of rows(d,'既有采购在途')){const id=r['采购订单编号']+'|'+r['订单行号'];if(po.has(id))add('既有采购在途',r,'订单行号','采购行身份重复');po.add(id);const s=sup.get(r['供货关系编号']);if(s&&(s['物料编号']!==r['物料编号']||s['供应商编号']!==r['供应商编号']))add('既有采购在途',r,'供货关系编号','供货关系与物料/供应商不一致');}
 for(const r of rows(d,'工厂日历'))if(!Number.isInteger(Number(r['日序']))||r['公历日期'].replaceAll('-','')!==dayDate(Number(r['日序'])).replaceAll('-','')||!(Number(r['日产能分母'])>0))add('工厂日历',r,'公历日期','日序/日期或日容量分母无效');
 for(const r of rows(d,'停机安排'))if(!(Number(r['结束日'])>Number(r['开始日'])))add('停机安排',r,'结束日','结束日须晚于开始日');
 for(const r of rows(d,'每日需求'))if(!Number.isInteger(Number(r['需求日']))||Number(r['需求日'])<1||Number(r['需求日'])>43||!(Number(r['需求箱数'])>0))add('每日需求',r,'需求箱数','本profile需求日须1～43且需求箱数为正');
 for(const t of ['配置参数','物料清单'])for(const r of rows(d,t))if(!(Number(r['失效日'])>Number(r['生效日'])))add(t,r,'失效日','有效区间须为非空半开区间');
 for(const r of rows(d,'物料主数据'))if(!['千克','个'].includes(r['基础单位']))add('物料主数据',r,'基础单位','本来源profile只支持食品千克、包装个数，不能猜测换算');
 return issues;
}
export function workbookReadiness(d) {
 const issues=validateWorkbook(d),mapping=d.mapping;
 if(!mapping?.line?.id)issues.push(problem('工艺路线',null,'产线归属','需显式选择仿真单线','G01'));
 const routes=[...rows(d,'工艺路线'),...(mapping?.sfRoutes||[])];
 for(const m of rows(d,'物料主数据').filter(r=>r['物料来源']==='制造'))if(!routes.some(r=>r['成品编号']===m['物料编号']))issues.push(problem('物料主数据',m,'物料编号','制造物料缺少完整工艺路线','G02'));
 if(!mapping?.feed_mappings?.length||!mapping?.tool_pools||!mapping?.wip_remaining?.length)issues.push(problem('工艺路线',null,'资源映射','需显式投料点/物理池/WIP剩余映射','G03'));
 if(mapping){
  const ids=new Set();for(const r of mapping.resources||[]){if(ids.has(r.id)||r.line_id!==mapping.line.id||!(Number(r.units)>0))issues.push(problem('设备与工装',null,'资源编号','映射资源重复、数量无效或不属所选单线：'+r.id,'G03'));ids.add(r.id);}
  for(const b of rows(d,'物料清单')){const fs=(mapping.feed_mappings||[]).filter(f=>f.bom_id===b['用量关系编号']);if(fs.length!==1||!routes.some(r=>r['路线工序编号']===fs[0]?.route_step_id&&r['成品编号']===b['父项编号']))issues.push(problem('物料清单',b,'投料位置','投料关系缺少唯一且适用的路线工序映射','G03'));}
  const toolIds=new Set();for(const [type,pool]of Object.entries(mapping.tool_pools||{}))for(const id of pool){if(toolIds.has(id)||!rows(d,'设备与工装').some(r=>r['资源编号']===id&&r['资源类别']==='工装'))issues.push(problem('设备与工装',null,'资源编号','物理工装重复映射或不存在：'+type+'/'+id,'G03'));toolIds.add(id);}
  for(const w of rows(d,'期初在制')){const ws=(mapping.wip_remaining||[]).filter(s=>s.id===w['在制批次编号']);if(ws.length!==1||!ws[0].remaining_route_steps?.length||!(Number(ws[0].remaining_labor_count)>0))issues.push(problem('期初在制',w,'当前工序编号','WIP剩余工序或有限资源映射缺失','G03'));}
 }
 const supported=['daily-capacity','same-day-nonzero-workload','predecessor-order','finite-physical-pools','known-day-outages','multilevel-bom','profile-separated-yield','conditional-supply','expiry-quality','frozen-version-reopen-export'];
 for(const c of mapping?.capabilities_required||[])if(!supported.includes(c))issues.push(problem('工艺路线',null,'能力范围','必要能力未支持：'+c,'NOT_SUPPORTED'));
 return {ready:issues.length===0,issues,supported,profile:PROFILE};
}
export function procurement(gap,s,need,current) {const qty=Number(s['订货倍数'])*Math.ceil(Math.max(gap,Number(s['最小订货量']))/Number(s['订货倍数'])),lead=Number(s['采购导期天数'])+Number(s['检验天数']),theoretical=need-lead,orderDay=Math.max(current,theoretical),availableDay=orderDay+lead;return {quantity:qty,theoreticalOrderDay:theoretical,orderDay,availableDay,lateDays:Math.max(0,availableDay-need)};}
