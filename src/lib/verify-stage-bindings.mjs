import {quantityMath as Q,feedTime} from './material-allocation.mjs';
// Reconstruct fixed evidence from literal rows. Does not call the mapper,
// scheduler, allocator or its admission validator.
export function verifyStageBindings(plan,data,conditions){
 if(!(data?.stageMappings||[]).length&&!conditions?.stageBindingContract)return null;
 const problems=[],fail=m=>problems.push(m),bindings=conditions.stageBindings||[],maps=data.stageMappings||[];
 const equal=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
 const parse=v=>JSON.parse(v),sum=xs=>xs.reduce((a,v)=>Q.add(a,Q.q(v)),Q.zero);
 const sameQ=(a,b)=>Q.cmp(Q.q(a),Q.q(b))===0n;
 try{
  if(conditions.stageBindingContract!=='FR013-stage-bindings-v1'||maps.length!==bindings.length)fail('来源绑定合同或覆盖数不一致');
  for(const m of maps){
   const type=m['来源类别'],id=type==='originalProgress'?'任务编号':type==='originalEvents'?'事件编号':'批次编号',source=(data[type]||[]).find(r=>r[id]===m['来源编号']),p=parse(m['参数JSON']);
   const bound=bindings.filter(b=>b.configurationId===m['配置编号']&&b.version===m['配置版本']&&b.sourceTable===type&&b.sourceId===m['来源编号']&&b.targetId===m['运行编号']&&b.dataKind===m['数据性质']&&b.status==='BOUND');
   if(bound.length!==1||m['状态']!=='READY'||!equal(source,parse(m['源记录JSON'])))throw Error('来源/版本/性质或唯一绑定不符 '+m['配置编号']);
   if(type==='originalInventory'||type==='originalSupply'){
    const supply=type==='originalSupply',target=(data[supply?'supplies':'inventory']||[]).find(r=>r[supply?'供给编号':'批次编号']===m['运行编号']);
    if(!target||target['物料编号']!==source['物料编号']||!sameQ(target[supply?'预计数量':'账面数量'],source[supply?'到料kg或个':'库存kg或个'])||!sameQ(target['已占用数量']||'0',source['已占用kg或个'])||target['质量状态']!==p.quality||!data.materials.some(r=>r['物料编号']===source['物料编号']&&r['单位']===p.unit))fail('来源物料/数量/占用/单位/状态未被准确采用');
    if(target['时效模式']!=='显式分钟'||target['时间原点']!==conditions.timeOrigin||p.origin!==conditions.timeOrigin||target['有效期']!==''||target['到达分钟']!==source['到达分钟']||target['可用分钟']!==source['最早可用分钟']||target['到期分钟']!==source['到期分钟']||target['到期边界']!==p.expiryBoundary||!['截止前','含截止'].includes(p.expiryBoundary))fail('分钟时效冻结发生截断或边界缺失');
    const uses=plan.materialDemands?.flatMap(d=>(d.allocations||[]).filter(a=>supply?a.supplyId===m['运行编号']:!a.conditional&&a.lotId===m['运行编号']).map(a=>({d,a})))||[];
    for(const {d} of uses){const instant=Date.parse(feedTime(d.feedMinute)),origin=Date.parse(p.origin),ready=origin+Number(source['最早可用分钟'])*60000,expiry=origin+Number(source['到期分钟'])*60000;if(instant<ready||instant>expiry||instant===expiry&&p.expiryBoundary==='截止前')fail('已分配来源在实际投料时刻未可用或过期');}
    if(supply&&JSON.stringify(p.uses)!==JSON.stringify((data.supplyUses||[]).filter(u=>u['供给编号']===m['运行编号'])))fail('预计供给引用与冻结配置不一致');
   }else if(type==='originalProgress'){
    const f=data.executionFacts.find(r=>r['事实编号']===m['运行编号']),s=data.executionSources.find(r=>r['来源编号']===p.sourceId),parts=s&&parse(s['原始分配JSON']);
    if(!equal(f,p.fact)||f['状态']!==source['状态']||!sameQ(f['开始分钟'],source['实际开始分钟'])||!sameQ(f['完成分钟'],source['实际结束分钟'])||!s||s['原始任务编号']!==source['任务编号']||s['事实编号']!==f['事实编号']||s['耗料单位']!=='kg'||!sameQ(s['原始汇总耗料'],source['已用投入kg'])||Q.cmp(sum(parts.map(p=>p['数量'])),Q.q(source['已用投入kg']))!==0n)fail('原执行来源、独立工序产出或逐批耗料不守恒');
    const task=(plan.tasks||[]).find(t=>t.orderId===f['订单编号']&&t.operation===f['工序编号']);
    if(task&&(task.start!==Number(f['开始分钟'])||task.end!==Number(f['完成分钟'])||task.machine!==f['当前设备']))fail('已完成来源任务被改写');
    for(const part of parts||[])if(!data.executionMaterials.some(c=>c['记录编号']===part['记录编号']&&c['事实编号']===f['事实编号']&&c['批次编号']===part['批次编号']&&c['物料编号']===part['物料编号']&&c['单位']===part['单位']&&sameQ(c['累计已用数量'],part['数量'])))fail('原始耗料分配缺少精确批次累计证据');
   }else if(type==='originalEvents'){
    const e=data.simulationEvents.find(e=>e['事件编号']===m['运行编号']),effect=e&&parse(e['参数JSON']),g=data.personnelGroups.find(g=>g['人员组编号']===effect?.groupId),pool=data.personnelPools.filter(p=>p.poolId===effect?.poolId);
    if(!equal(e,p.event)||e['事件类型']!=='人员数量变化'||effect.scope!=='事件起新运行'||effect.beforeCount!==source['原值']||effect.afterCount!==source['新值']||!sameQ(e['事件分钟'],source['发生分钟'])||Number(conditions.startMinute)<Number(source['发生分钟'])||!g||g.poolId!==effect.poolId||g['人员数量']!==effect.afterCount||pool.length!==1||pool[0]['总人数']!==effect.afterCount||p.groupBefore['人员数量']!==effect.beforeCount||p.poolBefore['总人数']!==effect.beforeCount)fail('人数事件时点/前后组/唯一池未被准确采用');
   }else fail('未知来源类别');
  }
 }catch(e){fail('冻结来源无法独立复核：'+e.message);}
 return {status:problems.length?'problem':'pass',details:problems.length?problems:['按冻结原文逐条重建身份、单位、分钟时效、产出/耗料和事件唯一容量；明确模拟不作为客户事实。']};
}
