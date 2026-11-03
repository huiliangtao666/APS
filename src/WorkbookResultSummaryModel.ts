import {workbookDate} from './lib/workbook-dates';

export type ResultCategory='delivery'|'material'|'resource'|'verification'|'other';
export const resultCategories:Record<ResultCategory,string>={delivery:'需求与交付',material:'物料与供给',resource:'资源与工序',verification:'独立检查',other:'其他记录'};
export type ResultEntry={need?:string;productId?:string;detail:string;source?:any;demand?:any};
export type ResultGroup={id:string;category:ResultCategory;kind:'结果异常'|'计算记录'|'检查问题';title:string;logic:string;action:string;entries:ResultEntry[];affected:number};
export function filterResultGroups(groups:ResultGroup[],category:string,kind:string,query:string){
 const q=query.trim().toLowerCase();
 return groups.filter(g=>(category==='all'||g.category===category)&&(kind==='all'||g.kind===kind)).flatMap(g=>{
  if(!q||[g.title,g.logic,g.action].join(' ').toLowerCase().includes(q))return [g];
  const entries=g.entries.filter(e=>[e.need,e.productId,e.demand?.productId,e.detail].join(' ').toLowerCase().includes(q));
  return entries.length?[{...g,entries,affected:new Set(entries.filter(e=>e.demand).map(e=>e.need)).size}]:[];
 });
}
const rules:Record<string,{category:ResultCategory;title:string;logic:string;action:string}>={
 MAX_WAIT:{category:'resource',title:'工序间等待超过上限',logic:'后序可开始时点与前序完成时点之间的等待超过适用配置上限，候选被撤销。历史日模型按其冻结日口径判断。',action:'在业务数据查询与维护 → 工艺与班组核对相应路线等待上限、班组及设备；结合设备甘特检查衔接。'},
 FINITE_CAPACITY:{category:'resource',title:'有限资源或排程窗口无法安排',logic:'设备、班组、实体工装、批量、日产能及窗口等约束下未找到可安排候选；此记录未单独判定哪一项是唯一瓶颈。',action:'在设备能力、工艺与班组、停机安排和工厂日历核对资源；结合设备负荷、人员工装视图分析。'},
 MATERIAL_AT_ACTUAL_FEED:{category:'material',title:'实际投料时供给不再适用',logic:'供给须满足可用时点 ≤ 实际投料时点 < 失效时点；候选投料时不成立，撤销候选。',action:'核对物料与BOM的投料位置、供应批次的放行和到期日期，并查看物料风险。'},
 DELIVERY_SHELF:{category:'delivery',title:'到货剩余保质期不足',logic:'产出可用时点 + 保质期须覆盖预计到货时点 + 要求的剩余保质期；不满足则撤销候选。',action:'核对每日需求的到货剩余保质天数、客户运输天数及物料保质期，调整后创建新运行。'},
 WIP_REMAINING:{category:'material',title:'在制续作未能形成供给',logic:'在制剩余工序的资源或待投物料未满足，撤销本次续作；该在制未计入可用供给。',action:'核对期初在制及剩余工序、待投BOM映射，再检查班组、工装和供料。'}
};
export function buildResultSummary(run:any){
 const p=run.result||{},demands:any[]=p.demandResults||[],byNeed=new Map(demands.map(d=>[d.id,d])),groups=new Map<string,ResultGroup>();
 const add=(id:string,category:ResultCategory,kind:ResultGroup['kind'],title:string,logic:string,action:string,entry:ResultEntry)=>{
  if(!groups.has(id))groups.set(id,{id,category,kind,title,logic,action,entries:[],affected:0});
  groups.get(id)!.entries.push({...entry,demand:entry.need?byNeed.get(entry.need):undefined});
 };
 for(const d of demands){
  if(d.status==='unplanned')add('UNPLANNED','delivery','结果异常','最终未排需求','最终需求状态为未排；数量未计入已排。关联原因见计算记录或缺料记录，未记录的原因不推断。','先核对本需求关联的问题，维护业务数据或配置后创建新运行。',{need:d.id,productId:d.productId,detail:`未排 ${d.quantity} ${d.unit||'单位未提供'}`,source:d.source});
  if(d.status==='scheduled'&&typeof d.lateDays==='number'&&d.lateDays>0)add('LATE','delivery','结果异常','已排但预计迟交','迟交天数 = max(0，预计到货日 − 最晚到货日)；已排不代表按期交付。','核对需求交付窗口和客户运输天数，并分析上游工序及资源。',{need:d.id,productId:d.productId,detail:`预计到货 ${workbookDate(d.arrivalDay,p.dayZero)||'未记录'}；最晚 ${workbookDate(d.latestArrivalDay,p.dayZero)||'未记录'}；迟交 ${d.lateDays} 天`,source:d.source});
 }
 for(const issue of p.verification?.issues||[])add('VERIFY','verification','检查问题','冻结结果独立检查存在问题','独立检查复核冻结任务与原输入的一致性；检查通过仅限下方记录的检查范围。','查看具体检查项并核对冻结输入；必要时维护数据或配置后创建新运行。',{detail:String(issue)});
 for(const f of p.findings||[]){
  const rule=rules[f.code]||{category:'other' as const,title:f.message||f.code||'未分类计算记录',logic:'按本运行保存的原始记录展示；未记录的约束数值和判定细节不作推算。',action:'展开查看原记录及来源，核对对应业务表或配置。'};
  add('FINDING:'+f.code+(rules[f.code]?'':':'+f.message),rule.category,'计算记录',rule.title,rule.logic,rule.action,{need:f.need,detail:f.message||f.code||'未提供说明',source:f});
 }
 for(const s of p.shortages||[])add('SHORTAGE','material','计算记录','排程时记录的缺料','按BOM用量计算需料，扣除当时符合质量、可用期和余额的供给后记录缺口；个数单位按规则向上取整。各需求、物料和时点分开核对，不能跨单位累加。','在库存汇总、采购在途及供货条件核对供应；采购建议为参考，不会自动补成实物供给。',{need:s.need,productId:s.materialId,detail:`${s.materialId} · 缺 ${s.quantity} ${s.unit||'单位未提供'} · 需料 ${workbookDate(s.needDay,p.dayZero)||'未记录'}`,source:s.source});
 const resultGroups=[...groups.values()];
 for(const g of resultGroups)g.affected=new Set(g.entries.map(e=>e.need).filter(id=>id&&byNeed.has(id))).size;
 const scheduled=demands.filter(d=>d.status==='scheduled'),unplanned=demands.filter(d=>d.status==='unplanned'),late=scheduled.filter(d=>typeof d.lateDays==='number'&&d.lateDays>0);
 const quantities=new Map<string,{unit:string;total:number;scheduled:number;unplanned:number;unknown:number;known:number}>();
 for(const d of demands){const unit=d.unit||'单位未提供';if(!quantities.has(unit))quantities.set(unit,{unit,total:0,scheduled:0,unplanned:0,unknown:0,known:0});const q=quantities.get(unit)!;if(typeof d.quantity!=='number'||!Number.isFinite(d.quantity)){q.unknown++;continue;}q.known++;q.total+=d.quantity;if(d.status==='scheduled')q.scheduled+=d.quantity;if(d.status==='unplanned')q.unplanned+=d.quantity;}
 const check=p.verification?.status,checkFailed=check==='problem'||(p.verification?.issues||[]).length>0;
 const unknownStatus=demands.length-scheduled.length-unplanned.length;
 const headline=checkFailed?'结果独立检查存在问题':run.status==='failed'?'运行失败':unplanned.length?'部分需求未排':late.length?'已排完成，存在预计迟交':unknownStatus?'需求状态待核对':demands.length?'所选需求已排':'未记录需求结果';
 return {groups:resultGroups,demands,scheduled:scheduled.length,unplanned:unplanned.length,late:late.length,unknownStatus,quantities:[...quantities.values()],checkFailed,headline,counts:Object.fromEntries(Object.keys(resultCategories).map(category=>[category,resultGroups.filter(g=>g.category===category).reduce((n,g)=>n+g.entries.length,0)])),findingCount:(p.findings||[]).length,shortageCount:(p.shortages||[]).length};
}
