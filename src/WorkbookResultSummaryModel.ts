import {workbookDate} from './lib/workbook-dates';
import {findingRule,findingRules,explainFinding,explainShortage,type FindingExplanation} from './lib/workbook-explanations.mjs';

export type ResultCategory='delivery'|'material'|'resource'|'verification'|'other';
export const resultCategories:Record<ResultCategory,string>={delivery:'需求与交付',material:'物料与供给',resource:'资源与工序',verification:'独立检查',other:'其他记录'};
export type ResultEntry={need?:string;productId?:string;detail:string;source?:any;demand?:any;explanation?:FindingExplanation};
export type ResultGroup={id:string;category:ResultCategory;kind:'结果异常'|'计算记录'|'检查问题';title:string;logic:string;action:string;entries:ResultEntry[];affected:number};
export type ResultRecordScope='findings'|'shortages'|'outcomes'|'verification'|'all';
export function resultGroupsForScope(groups:ResultGroup[],scope:ResultRecordScope){
 return groups.filter(g=>scope==='all'||scope==='findings'&&g.id.startsWith('FINDING:')||scope==='shortages'&&g.id==='SHORTAGE'||scope==='outcomes'&&g.kind==='结果异常'||scope==='verification'&&g.kind==='检查问题');
}
export function filterResultGroups(groups:ResultGroup[],category:string,kind:string,query:string){
 const q=query.trim().toLowerCase();
 return groups.filter(g=>(category==='all'||g.category===category)&&(kind==='all'||g.kind===kind)).flatMap(g=>{
  if(!q||[g.title,g.logic,g.action].join(' ').toLowerCase().includes(q))return [g];
  const entries=g.entries.filter(e=>[e.need,e.productId,e.demand?.productId,e.detail].join(' ').toLowerCase().includes(q));
  return entries.length?[{...g,entries,affected:new Set(entries.filter(e=>e.demand).map(e=>e.need)).size}]:[];
 });
}
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
  const rule=findingRule(f);
  add('FINDING:'+f.code+(findingRules[f.code]?'':':'+f.message),rule.category as ResultCategory,'计算记录',rule.title,rule.logic,rule.action,{need:f.need,detail:f.message||f.code||'未提供说明',source:f,explanation:explainFinding(f,p)});
 }
 for(const s of p.shortages||[])add('SHORTAGE','material','计算记录','排程时记录的缺料','按BOM用量计算需料，扣除当时符合质量、可用期和余额的供给后记录缺口；个数单位按规则向上取整。各需求、物料和时点分开核对，不能跨单位累加。','在库存汇总、采购在途及供货条件核对供应；采购建议为参考，不会自动补成实物供给。',{need:s.need,productId:s.materialId,detail:`${s.materialId} · 缺 ${s.quantity} ${s.unit||'单位未提供'} · 需料 ${workbookDate(s.needDay,p.dayZero)||'未记录'}`,source:s.source,explanation:explainShortage(s,p)});
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
