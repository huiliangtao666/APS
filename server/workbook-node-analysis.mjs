import {parameterDayRatio} from './parameter-contract.mjs';
import {routeMinutes,minuteTime} from './workbook-minute.mjs';

const rows=(d,t)=>d.tables?.[t]||[];
const numeric=v=>v===undefined||v===null||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
const n=v=>numeric(v)===null?'未提供':Number(Number(v).toFixed(6)).toLocaleString('zh-CN',{maximumFractionDigits:6});
const fail=()=>{throw Object.assign(Error('NODE_NOT_IN_QUERY'),{code:'NODE_NOT_IN_QUERY',status:404});};
export function explainEquipmentNode(v,{record,a,c,node}){
 if(!node||!['task','wip','stop'].includes(node.kind)||typeof node.id!=='string')fail();
 const visible=node.kind==='task'?record.tasks?.find(t=>t.id===node.id):record.layers?.find(l=>l.id===node.id&&l.kind===(node.kind==='wip'?'WIP物理保留':'可知停机'));
 if(!visible||visible.start>=c.end||visible.end<=c.start)fail();
 const d=v.input,p=v.run.result,minute=p.timeUnit==='minute',zero=v.identity.dayZero;
 const date=day=>numeric(day)===null?'未提供':new Date(Date.parse(zero+'T00:00:00Z')+Number(day)*86400000).toISOString().slice(0,10);
 const time=value=>numeric(value)===null?'未提供':minute?(minuteTime(value,v.identity.minuteOrigin)||'未提供').replaceAll('.','-'):new Date(Date.parse(zero+'T00:00:00Z')+Number(value)*60000).toISOString().slice(0,16).replace('T',' ');
 const out={node:{id:node.id,kind:node.kind,resource:record.resource},headline:'',facts:[],basis:[],materials:[],materialTotal:0,problems:[],missing:[],sources:[],verification:{status:p.verification?.status||'not_checked',scope:p.verification?.scope||[],notChecked:p.verification?.notChecked||[],issues:p.verification?.issues||[]},identity:{runId:v.run.id,datasetId:v.identity.datasetId,version:v.identity.version,inputHash:v.identity.inputHash,resultHash:v.identity.resultHash},model:minute?'整数分钟模型':'历史日模型'};
 const fact=(label,value)=>out.facts.push({label,value});
 const basis=(label,value,logic)=>out.basis.push({label,value,logic});
 const problem=(scope,message)=>out.problems.push({scope,message});
 const source=(sheet,r,key,fields=[])=>{if(!r)return;out.sources.push({sheet,row:r._row??null,key,fields:fields.map(field=>({field,value:r[field]===undefined||r[field]===null?null:['已开工日','预计完工日','预计放行日','最早到货日','最晚到货日','可知日','开始日','结束日'].includes(field)?date(r[field]):r[field],cell:r._cells?.[field]??null,formula:r._formulas?.[field]??null}))});};
 const resource=rows(d,'设备与工装').find(r=>r['资源编号']===record.resource);
 source('设备与工装',resource,record.resource,['单次批量上限千克','标准日产能千克','同时占位上限千克']);
 let need,route,task,wp;
 if(node.kind==='task'){
  task=a.tasks.find(t=>t.id===node.id);if(!task)fail();need=task.orderId;
  route=[...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])].find(r=>r['路线工序编号']===task.routeStepId);
  out.headline=`已排任务 ${task.id} · ${task.productId} / ${task.label}`;
  fact('需求 / 生产批次',`${task.orderId} / ${task.productionId}`);fact('本任务加工量',`${n(task.quantity)} 千克（工序加工量，不等于已交付量）`);
  fact('设备 / 占用区间',`${task.machine} · ${time(task.start)} — ${time(task.end)}（结束不含）`);
  const duration=task.end-task.start,span=numeric(route?.['跨日历时天数']);
  let expected=null,formula='冻结路线不足，无法还原历时公式';
  if(minute&&route)try{expected=routeMinutes(route,task.quantity);formula=route['工时模型']==='固定连续历时'?`max(最短工艺 ${n(route['最短工艺分钟'])}，准备 ${n(route['固定准备分钟'])} + 固定加工 ${n(route['基准加工分钟'])})`:`max(最短工艺 ${n(route['最短工艺分钟'])}，准备 ${n(route['固定准备分钟'])} + 向上取整(${n(task.quantity)} ÷ 基准量 ${n(route['基准加工量千克'])} × 基准加工 ${n(route['基准加工分钟'])}))`;}catch{out.missing.push('路线分钟工时字段不完整，不能还原预期历时。');}
  else if(!minute&&span>0){expected=span*1440;formula=`固定跨日历时 ${n(span)} 天 × 1440；不按本任务数量缩短固定历时`;}
  basis('历时计算',`实际自然历时 ${n(duration)} 分钟${expected===null?'':`；按冻结工艺计算 ${n(expected)} 分钟`}`,formula);
  if(expected!==null&&Math.abs(duration-expected)>1e-6)problem('本节点核对','冻结实际历时与按工艺计算的历时不一致，请核对来源。');
  const prev=a.tasks.find(t=>t.id===task.predecessor&&t.productionId===task.productionId),next=a.tasks.filter(t=>t.predecessor===task.id&&t.productionId===task.productionId);
  const wait=prev?task.start-prev.end:null,maxWait=numeric(route?.[minute?'最大等待分钟':'最大等待天数']);
  basis('前后工序',`${prev?`${prev.id} 完成 ${time(prev.end)}`:task.predecessor?'冻结前序未找到':'未保存前序任务（首工序或在制续作起点）'} → ${task.id} → ${next.map(t=>t.id).join('、')||'未保存后序任务'}`,prev?`与前序完成间隔 ${n(wait)} 分钟；冻结最大等待 ${n(maxWait)} ${minute?'分钟':'天'}。历史日口径按冻结模型判断。`:'只按已保存的真实前序编号关联，不按表格行序猜测。');
  if(prev&&wait<0)problem('本节点核对','任务在前序完成前开始。');
  const day=Math.floor(task.start/1440),cal=rows(d,'工厂日历').find(r=>numeric(r['日序'])===day),crew=rows(d,'班组资源').find(r=>r['班组编号']===task.crew);
  let ratio=null;try{if(!minute&&cal&&crew)ratio=parameterDayRatio(d,cal,crew,day);}catch{}
  // The minute planner intersects explicit shift windows. Do not infer its ratio
  // from counts alone; the daily E3 view exposes that separate basis.
  if(minute)ratio=null;
  const daily=numeric(resource?.['标准日产能千克']),capacity=daily!==null&&ratio!==null?daily*ratio:null;
  const total=a.tasks.filter(t=>t.machine===task.machine&&Math.floor(t.start/1440)===day).reduce((sum,t)=>sum+t.quantity,0);
  basis('开工日能力',`${date(day)} · 标准日产能 ${n(daily)} 千克${capacity===null?'；适用日能力需结合班次窗口核对':` × 当日比例 ${n(ratio)} = ${n(capacity)} 千克`}；冻结最终开工量 ${n(total)} 千克`, '最终开工量包含本任务及当日同设备其他任务，不是排入本任务前的剩余容量；连续跨日任务不逐日重复计投产量。');
  basis('单批上限',`${n(task.quantity)} / ${n(resource?.['单次批量上限千克'])} 千克`,'左为本任务量，右为冻结设备单批上限；不将日产能当作固定历时。');
  if(!minute&&span===0&&capacity>0){expected=Math.max(1,Math.ceil(task.quantity/capacity*1440));Object.assign(out.basis.find(b=>b.label==='历时计算'),{value:`实际自然历时 ${n(duration)} 分钟；按冻结工艺计算 ${n(expected)} 分钟`,logic:`${n(task.quantity)} ÷ 当日能力 ${n(capacity)} × 1440，向上取整，至少1分钟 = ${n(expected)} 分钟；使用冻结日模型，不含班次内实际作业时段。`});if(Math.abs(duration-expected)>1e-6)problem('本节点核对','冻结实际历时与按日能力计算的历时不一致，请核对来源。');}
  basis('人员 / 工装',`${task.crew} · 需求 ${n(task.people)} 人 / 班组每班 ${n(crew?.['每班可用人数'])} 人 /  ${Array.isArray(task.tools)?task.tools.join('、')||'本任务未分配专用工装':'实体工装未提供'}`,minute?'人员按冻结参与区间，工装按实际占用及后延归还区间核对。':'历史日模型按整个自然区间表达人员占用，不代表现场人员连续工作整个历时。');
  if(task.cleaning)basis('清洗',`${time(task.cleaning.start)} — ${time(task.cleaning.end)} · 规则 ${task.cleaning.rule}`,'采用冻结任务保存的有向清洗规则，不再次增加到加工历时中。');
  source('工厂日历',cal,String(day),['生产班次数','日产能分子','日产能分母']);source('班组资源',crew,task.crew,['每班可用人数','标准日班次数','周日班次数']);
  const own=a.tasks.filter(t=>t.productionId===task.productionId&&t.routeStepId===task.routeStepId);
  if(own.length>1)out.missing.push('本道工序拆分到多个任务；关联投料可能按工序批次记录，不能直接等同于单个任务的投料量。');
  out.missing.push('冻结结果未保存候选设备比较和搜索轨迹，不能据此证明“为何没有选择另一设备”或全局最优。');
 }else if(node.kind==='wip'){
  wp=d.mapping?.wip_remaining?.find(w=>w.id===node.id);if(!wp)fail();need=wp.id;
  const raw=rows(d,'期初在制').find(r=>r['在制批次编号']===wp.id),interval=minute?wp.current_occupancy_minute_interval:wp.current_occupancy_day_interval?.map(x=>x*1440);
  route=[...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])].find(r=>r['路线工序编号']===wp.current_route_step);
  out.headline=`在制保留 ${wp.id} · ${wp.product} / ${raw?.['当前工序名称']||route?.['工序名称']||'工序未提供'}`;
  fact('预计合格产出',`${n(raw?.['预计合格产出']??wp.quantity_kg)} 千克（尚未形成成品实物库存）`);
  fact('设备 / 保留区间',`${wp.resource} · ${time(interval?.[0])} — ${time(interval?.[1])}（结束不含）`);
  basis('保留来源',`冻结映射 ${d.mapping?.version||'未提供'} · ${wp.current_route_step}`,'已有在制的物理占用直接沿用冻结区间，不按新任务重新计算当前工序历时。图上仅显示与筛选窗口相交的部分。');
  const continuation=a.tasks.filter(t=>t.productionId===wp.id);
  basis('剩余工序',`${wp.remaining_route_steps?.join('、')||'未提供'}；已生成续作：${continuation.map(t=>`${t.id} ${t.label} ${time(t.start)}—${time(t.end)}`).join('；')||'未生成'}`,'完成剩余工序、补齐待投物料并满足放行条件后才形成条件供给；不重复领用历史已投原料。');
  const supply=(p.allocations||[]).filter(x=>x.supplyId==='wip:'+wp.id);
  basis('后续供给采用',supply.length?supply.slice(0,10).map(x=>`${x.need} · ${n(x.quantity)} 千克 · ${date(x.feedDay)}`).join('；'):'本运行未记录该在制产出的供给分配','仅表示冻结计划中的采用记录，不代表已完工或已入库。');
  basis('人员 / 工装',`${wp.remaining_labor_pool||'班组未提供'} · ${n(wp.remaining_labor_count)} 人 / ${Array.isArray(wp.current_tools)?wp.current_tools.join('、')||'显式无实体工装':'当前实体工装未提供'}`,minute?'人员仅按冻结尾段参与，工装保留至冻结释放时刻。':'历史映射的工装类型/套数不等于实际实体编号。');
  if(numeric(wp.tool_release)!==null)fact('实体工装释放时刻',time(wp.tool_release));
  if(!Array.isArray(wp.current_tools))out.missing.push('WIP未提供当前实体工装编号，不能把空列表解释为无需工装。');
  source('期初在制',raw,wp.id,['预计合格产出','已开工日','预计完工日','预计放行日','已投料口径']);
 }else{
  const stop=a.stops.find(s=>s.id===node.id&&s.resource===record.resource);if(!stop)fail();
  const raw=rows(d,'停机安排').find(r=>r['停机编号']===stop.id);out.headline=`已知停机 ${stop.id} · ${stop.resource}`;
  fact('停机区间',`${time(stop.start)} — ${time(stop.end)}（结束不含）`);basis('排程处理','作为设备不可用区间','只采用运行当时已经可知的停机；不将未知的未来信息用于本运行。');source('停机安排',raw,stop.id,['可知日','信息可知时刻','开始日','结束日']);
 }
 // Materials and problems are populated below from this same frozen result.
 source('工艺路线',route,task?.routeStepId||wp?.current_route_step,['跨日历时天数','最大等待天数','工时模型','基准加工量千克','基准加工分钟','固定准备分钟','最短工艺分钟','最大等待分钟','需求人数','每批工装套数']);
 if(!minute)out.missing.push('本运行采用历史日模型，未保存分钟班次和独立清洗明细；时分是日坐标换算，不代表现场精确作业时刻。');
 if(!d.effectiveParameters?.values?.length)out.missing.push('本运行未保存结构化有效参数清单；已显示冻结业务字段，不代表当时没有配置参数。');
 populateFrozenRecords(out,{d,p,task,wp,need,problem,time,date,n,source});
 return out;
}

function populateFrozenRecords(out,{d,p,task,wp,need,problem,time,date,n,source}){
 const linked=(p.allocations||[]).filter(x=>task?x.taskId===task.id:wp?x.need===wp.id:false);
 out.materialTotal=linked.length;
 out.materials=linked.slice(0,20).map(x=>{
  const candidates=rows(d,'物料清单').filter(b=>x.bomId?b['用量关系编号']===x.bomId:b['子项编号']===x.materialId&&(d.mapping?.feed_mappings||[]).some(f=>f.bom_id===b['用量关系编号']&&f.route_step_id===task?.routeStepId));
  const b=candidates.length===1?candidates[0]:null,quantity=task?(p.tasks||[]).filter(t=>t.productionId===task.productionId&&t.routeStepId===task.routeStepId).reduce((sum,t)=>sum+t.quantity,0):rows(d,'期初在制').find(r=>r['在制批次编号']===wp?.id)?.['预计合格产出'];
  const calculation=b?`本工序总需料口径：产出 ${n(quantity)} 千克 × 子项基准 ${b['子项基准用量']} ÷ 父项基准 ${b['父项基准产出千克']}${b['数量单位']==='个'?'，个数向上取整':''}；本条为供给分配记录，多批供给可共同满足需料。`:'未找到唯一的冻结BOM对应项，不能从本条分配反推完整需料公式。';
  return {material:x.materialId,quantity:x.quantity,unit:rows(d,'物料主数据').find(m=>m['物料编号']===x.materialId)?.['基础单位']||'单位未提供',supply:x.supplyId,feed:p.timeUnit==='minute'?time(x.feedMinute):date(x.feedDay),meaning:x.conditional?'条件供给':'实物供给',bom:b?.['用量关系编号']||x.bomId||null,calculation,bomSource:b?{sheet:'物料清单',row:b._row??null}:null};
 });
 if(task||wp)out.basis.push({label:wp?'续作待投物料':'关联投料',value:`${linked.length} 条关联分配记录（本窗预览前20条）`,logic:'按有效BOM的工序产出 × 子项基准用量 ÷ 父项基准产出计算需料，个数向上取整；供给需满足质量、放行≤投料<到期及累计余额。没有关联记录不等于无需投料。'});
 const demand=(p.demandResults||[]).find(r=>r.id===need);
 if(demand){out.facts.push({label:'需求最终结果',value:`${demand.status==='scheduled'?'已排':demand.status==='unplanned'?'未排':'状态未识别'} · 到货 ${date(demand.arrivalDay)} · 最晚 ${date(demand.latestArrivalDay)} · 迟交 ${n(demand.lateDays)} 天`});if(demand.lateDays>0)problem('同需求交付',`预计到货 ${date(demand.arrivalDay)}，比最晚 ${date(demand.latestArrivalDay)} 晚 ${n(demand.lateDays)} 天；该节点已排不代表需求按期交付。`);}
 for(const f of (p.findings||[]).filter(f=>f.need===need&&need||f.taskId===task?.id&&task))problem(f.taskId===task?.id&&task?'本节点记录':'同需求/在制计算记录',f.message||f.code);
 const shortage=(p.shortages||[]).filter(s=>s.need===need&&need);if(shortage.length)problem('同需求/在制缺料',`保存了 ${shortage.length} 条缺料记录；可能涉及其他工序，完整记录见物料风险。`);
 if(task){const raw=rows(d,'每日需求').find(r=>r['需求编号']===task.orderId);source('每日需求',raw,task.orderId,['需求箱数','每箱净重千克','需求千克','最早到货日','最晚到货日']);}
 const total=out.problems.length;out.problems=out.problems.slice(0,20);out.problemTotal=total;
 out.missing.push('以上为冻结结果解释，检查通过仅限保存的检查范围，不等于全部业务约束或真实验收通过。');
}
