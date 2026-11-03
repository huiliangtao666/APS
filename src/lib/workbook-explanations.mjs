// Shared presentation of frozen calculation findings. Never rerun a planner or
// consult current configuration to explain a historical result.
export const findingRules={
 SUPPLY_SHORTAGE:{category:'material',title:'排程时记录的缺料',logic:'按BOM基准用量计算需料，扣除当时符合质量、放行、到期及剩余余额的供给，仍不足的部分记为缺口；个数单位向上取整。采购参考建议不会自动成为供给；在途、在制续作和已采用模拟草稿属于条件供给。',action:'业务数据查询与维护 → 库存汇总、采购在途、供货条件：核对供给与放行日期；物料与BOM：核对用量和投料位置。补充有效供给后创建新运行。'},
 MAX_WAIT:{category:'resource',title:'工序间等待超过上限',logic:'先安排满足有限资源约束的后序候选，再比较后序开始与前序完成的间隔。超过冻结等待上限则撤销；不会因为已找到机位就忽略等待限制。',action:'配置参数查询与维护 → 07 工艺与工序：核对该路线最大等待；业务数据查询与维护 → 工艺与班组、停机安排：核对衔接条件。'},
 FINITE_CAPACITY:{category:'resource',title:'有限资源或排程窗口无法安排',logic:'依次检查设备组、可用设备、人员、实体工装、单批上限、当日日产能、日历、已知停机和排程结束边界。未找到候选不等于证明无解，也不能据此认定某一项是唯一瓶颈。',action:'配置参数查询与维护 → 06 设备与工装、07 工艺与工序、08 班组人员、09 工厂日历；结合设备负荷、人员工装和停机安排核对。'},
 MATERIAL_AT_ACTUAL_FEED:{category:'material',title:'实际投料时供给不再适用',logic:'先按需料时点选取供给，再安排工序资源；资源安排后，按实际投料时点复查原分配是否满足“供给可用时点 ≤ 实际投料时点 < 到期时点”。到期边界不含；有库存、没有缺料记录，也可能因投料时已失效而未排。',action:'业务数据查询与维护 → 库存汇总／采购在途：核对供给批次、放行与到期日期；物料与BOM：核对投料工序。补充有效供给，或调整工艺、资源衔接后创建新运行。'},
 DELIVERY_SHELF:{category:'delivery',title:'到货剩余保质期不足',logic:'制造候选完成后，检查 max(最早发运时点，制造就绪时点) + 运输天数 + 到货剩余保质天数 ≤ 制造就绪时点 + 保质天数；不满足则撤销候选。',action:'业务数据查询与维护 → 每日需求：核对交付窗口；配置参数查询与维护 → 02 物料与SKU、04 客户与交付：核对保质期、运输天数和到货剩余保质比例。'},
 WIP_REMAINING:{category:'material',title:'在制续作未能形成供给',logic:'已有在制需完成剩余工序，并补齐尚未投入的物料才能成为条件供给。续作失败撤销本次新增安排，不释放已经执行的在制物理保留，也不重复领用历史已投物料。',action:'业务数据查询与维护：核对期初在制、剩余工序与待投BOM映射；再核对供料、设备、班组和工装。'}
};
const unknownRule={category:'other',title:'未分类计算记录',logic:'按本运行保存的原始记录展示；未记录的约束数值和判定细节不作推算。',action:'核对本运行的数据来源及对应业务表或配置。'};
export const findingRule=f=>findingRules[f.code]||{...unknownRule,title:f.message||f.code||unknownRule.title};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const num=n=>finite(n)?Number(n.toFixed(6)).toString():'未记录';
function at(value,e,p){
 if(!finite(value))return '未记录';
 const origin=p.dayZero;if(!/^\d{4}-\d{2}-\d{2}$/.test(origin||''))return '时间原点未记录';
 const minute=e.timeUnit==='minute',stamp=Date.parse(origin+'T00:00:00Z')+value*(minute?60000:86400000);
 if(!Number.isFinite(stamp))return '未记录';
 const iso=new Date(stamp).toISOString();
 return minute||value%1!==0?iso.slice(0,16).replace('T',' '):iso.slice(0,10);
}
export function explainFinding(f,p={}){
 const rule=findingRule(f),e=f.evidence||{},facts=[],demand=(p.demandResults||[]).find(d=>d.id===f.need);
 if(f.routeStepId)facts.push('路线工序：'+f.routeStepId);
 if(f.materialId)facts.push('物料：'+f.materialId);
 if(e.kind==='material-at-feed'){
  facts.push('供给批次：'+(e.supplyId||'未记录'),'分配数量：'+num(e.quantity)+' '+(e.unit||'单位未记录'));
  facts.push('原分配投料时点：'+at(e.allocatedFeed,e,p),'工序候选开始：'+at(e.candidateStart,e,p),'实际校验投料时点：'+at(e.actualFeed,e,p),'供给可用时点：'+at(e.ready,e,p),'供给到期时点（不含）：'+at(e.expiry,e,p));
  facts.push('判定：'+(finite(e.ready)&&finite(e.actualFeed)&&finite(e.expiry)?e.actualFeed<e.ready?'投料时尚未可用':e.actualFeed>=e.expiry?'投料时已到期':'供给时间条件成立，需核对原记录':'未保存完整时点'));
  if(e.timeUnit==='day')facts.push('历史日模型用候选开始所在日期校验资格；此处日期不是现场分钟作业时刻。');
 }else if(e.kind==='max-wait'){
  facts.push('前序完成：'+at(e.predecessorEnd,e,p),'后序候选开始：'+at(e.candidateStart,e,p),'实际比较等待：'+num(e.comparedWait)+' '+(e.timeUnit==='day'?'天':'分钟'),'冻结上限：'+num(e.maxWait)+' '+(e.timeUnit==='day'?'天':'分钟'),'判定口径：'+e.comparison);
 }else if(e.kind==='delivery-shelf'){
  facts.push('制造就绪：'+at(e.ready,e,p),'最早发运：'+at(e.earliestShip,e,p),'运输：'+num(e.transportDays)+' 天','到货需剩余保质：'+num(e.remainingShelfDays)+' 天','物料保质期：'+num(e.shelfDays)+' 天','要求覆盖至：'+at(e.requiredExpiry,e,p),'制造产出到期：'+at(e.expiry,e,p));
 }else if(e.kind==='finite-capacity'){
  facts.push('设备组：'+e.group,'班组：'+e.crew,'工装类型：'+(e.toolType||'未指定'),'待安排量：'+num(e.quantity)+' 千克','最早候选边界：'+at(e.earliest,e,p),'排程结束边界（不含）：'+at(e.windowEnd,e,p));
 }else if(e.kind==='supply-shortage'){
  facts.push('记录缺口：'+num(e.quantity)+' '+(e.unit||'单位未记录'),'需料日期：'+at(e.needTime,e,p));
 }
 let effect=!findingRules[f.code]?'本记录说明已保存的计算信息；结果以最终需求状态为准。':f.code==='WIP_REMAINING'?'本次续作未形成可用供给；已有物理保留继续有效。':'需求失败时，撤销该需求本次新增的工序任务、供给分配和资源占用，恢复供给余额；此前已保存安排不受影响。';
 if(f.code==='MATERIAL_AT_ACTUAL_FEED')effect+='当前算法在此校验失败后，不自动重选其他供给批次，也不自动回退重排到有效期内。';
 if(demand)effect+='本需求最终状态：'+(demand.status==='unplanned'?'未排':demand.status==='scheduled'?'已排（过程记录不能直接当作最终未排原因）':'待核对')+'。';
 return {code:f.code||'UNKNOWN',need:f.need,title:rule.title,logic:rule.logic,facts,effect,action:rule.action,
  limitation:e.kind?'数值取自本次计算保存的判定记录；日期使用本运行的冻结时间原点。':'历史记录未保存具体候选时点、批次或约束数值；这里只说明处理规则，不能还原未记录的数值或认定唯一瓶颈。'};
}
export function explainShortage(s,p={}){
 const e=explainFinding({code:'SUPPLY_SHORTAGE',need:s.need,materialId:s.materialId,evidence:{kind:'supply-shortage',timeUnit:'day',quantity:s.quantity,unit:s.unit,needTime:s.needDay}},p);
 return {...e,limitation:'缺口与需料日期取自冻结缺料记录；本记录未保存全部候选供给的逐批排除过程。'};
}
