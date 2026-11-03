import {minuteTime} from './workbook-minute.mjs';
import {explainFinding,explainShortage} from '../src/lib/workbook-explanations.mjs';
const number=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const rows=(d,t)=>d.tables?.[t]||[];
const quantity=(n,u)=>n===null?'数量未提供':`${n}${u?' '+u:'（单位未提供）'}`;
const fail=()=>{throw Object.assign(Error('NODE_NOT_IN_QUERY'),{code:'NODE_NOT_IN_QUERY',status:404});};
/** Projection of recorded events, never an inferred shortage-clearance forecast. */
export function riskTimeline(v,kind,r){
 const evidence=r.evidence||{},material=rows(v.input,'物料主数据').find(m=>m['物料编号']===r.materialId);
 const out={category:kind,materialId:r.materialId??null,materialName:material?.['物料名称']??null,quantity:number(r.quantity??evidence.quantity),unit:r.unit??evidence.unit??material?.['基础单位']??null,events:[],missing:[]};
 const event=(key,label,value,precision,tone,end=null)=>{const at=number(value),until=number(end);if(at===null)return;out.events.push({key,label,at:precision==='minute'?at:at*1440,end:until===null?null:precision==='minute'?until:until*1440,precision,tone});};
 const evidencePrecision=evidence.timeUnit==='minute'?'minute':'day';
 if(kind==='shortage')event('need','净缺口需料日',r.needDay,'day','gap');
 else if(kind==='allocation')event('feed',r.conditional?'条件供给分配':'供给分配',number(r.feedMinute)!==null?r.feedMinute:r.feedDay,number(r.feedMinute)!==null?'minute':'day',r.conditional?'conditional':'supply');
 else if(kind==='suggestion'){
  if(number(r.orderDay)!==null&&number(r.availableDay)!==null&&Number(r.availableDay)>Number(r.orderDay))event('procurement','采购参考周期（未采用）',r.orderDay,'day','reference',r.availableDay);
  else event('order','建议下单（未采用）',r.orderDay,'day','reference');
  event('available','建议可用（未采用）',r.availableDay,'day','reference');event('need','需料净缺口（采购参考）',r.needDay,'day','reference');const need=out.events.find(e=>e.key==='need');if(need)need.quantity=number(r.netGap??r.quantity);
  out.missing.push('采购建议尚未采用，不是实物供给，也不表示缺料已解除。');
 }else if(kind==='finding'){
  if(evidence.kind==='material-at-feed'){
   const at=number(evidence.actualFeed),ready=number(evidence.ready),expiry=number(evidence.expiry);
   if(at!==null&&ready!==null&&at<ready){event('waiting','候选待料区间（已撤销）',at,evidencePrecision,'gap',ready);event('ready','候选供给可用边界（未采用）',ready,evidencePrecision,'conditional');}
   else event('feed',at!==null&&expiry!==null&&at>=expiry?'投料时已到期（候选已撤销）':'投料资格校验失败（候选已撤销）',at,evidencePrecision,'issue');
   event('expiry','候选批次到期边界（不含）',expiry,evidencePrecision,'issue');
  }else if(evidence.kind==='max-wait'){
   const a=number(evidence.predecessorEnd),b=number(evidence.candidateStart);
   event('wait','工序等待超限（候选已撤销）',a!==null&&b!==null&&b>a?a:b,evidencePrecision,'issue',a!==null&&b!==null&&b>a?b:null);
  }else if(evidence.kind==='finite-capacity'){
   const a=number(evidence.earliest),b=number(evidence.windowEnd);event('window','未能排入的搜索窗口',a,evidencePrecision,'issue',a!==null&&b!==null&&b>a?b:null);
  }else if(evidence.kind==='delivery-shelf'){
   event('expiry','供给到期边界',evidence.expiry,evidencePrecision,'issue');event('required','交付要求的保质边界',evidence.requiredExpiry,evidencePrecision,'conditional');
  }else event('need','问题记录需料日',r.needDay??r.feedDay,'day','issue');
 }
 if(!out.events.length)out.missing.push('本记录未保存可定位的发生时点，不按需求日期推测问题发生时间。');
 if(kind==='shortage')out.missing.push('冻结净缺口仅记录需料日期与数量，未保存缺口持续时长或消除时点。');
 if(kind==='allocation')out.missing.push(r.conditional?'条件供给仍取决于冻结计划中的制造、到货或放行条件，不代表已领料。':'冻结供给分配为计划采用记录，不代表现场已经领料。');
 return out;
}
export function explainRiskNode(v,{record,node}){
 const resource=record.values.materialId||record.need||record.id;
 if(node?.kind!=='risk'||node.id!==record.id||node.resource!==resource)fail();
 const kind=record.id.split(':')[0],index=record.id.slice(record.id.indexOf(':')+1),p=v.run.result;
 const raw=kind==='shortage'?(p.shortages||[]).find(r=>String(r.id)===index):({finding:p.findings,allocation:p.allocations,suggestion:p.suggestions}[kind]||[])[Number(index)];
 if(!raw)fail();
 const timeline=record.timeline,zero=v.identity.dayZero,date=n=>new Date(Date.parse(zero+'T00:00:00Z')+Math.floor(n/1440)*86400000).toISOString().slice(0,10);
 const instant=(value,precision)=>precision==='day'?date(value):minuteTime(value,v.identity.minuteOrigin).replaceAll('.','-');
 const explanation=kind==='finding'?explainFinding(raw,{...p,dayZero:zero}):kind==='shortage'?explainShortage(raw,{...p,dayZero:zero}):null;
 const out={node:{id:record.id,kind:'risk',resource},headline:`${record.values.sourceKind} · ${timeline.materialName||timeline.materialId||record.need||'未关联物料'}`,model:p.timeUnit==='minute'?'整数分钟模型':'历史日模型',identity:{runId:v.run.id,datasetId:v.identity.datasetId,version:v.identity.version,inputHash:v.identity.inputHash,resultHash:v.identity.resultHash},facts:[{label:'物料 / 关联对象',value:timeline.materialId?`${timeline.materialId} / ${timeline.materialName||'名称未提供'}`:'未指定物料；运行问题不直接等同于物料缺口'},{label:'本记录数量',value:quantity(timeline.quantity,timeline.unit)},{label:'关联需求 / 在制',value:record.need||'未提供'},{label:'记录性质',value:record.values.sourceKind}],basis:[],materials:[],materialTotal:0,problems:[],problemTotal:0,missing:[...timeline.missing,'日期色块仅按日期定位，不表示全天持续缺料；搜索窗口和撤销候选不是实际占用。','以下是冻结计划解释，不是现场实绩或真实验收结论。'],sources:[],verification:{status:p.verification?.status||'not_checked',scope:p.verification?.scope||[],notChecked:p.verification?.notChecked||[],issues:p.verification?.issues||[]}};
 for(const event of timeline.events)out.basis.push({label:event.label,value:`${instant(event.at,event.precision)}${event.end!==null?' — '+instant(event.end,event.precision)+'（区间结束不含）':''}${event.quantity!==undefined?' · 净缺口 '+quantity(event.quantity,timeline.unit):''}`,logic:event.precision==='day'?'日期取自冻结日字段；半小时模式仍只按日期定位，不推测日内发生时刻。':'按冻结分钟偏移定位，未按半小时取整。'});
 if(explanation){out.basis.push({label:explanation.title,value:explanation.facts.join('；')||explanation.limitation,logic:[explanation.logic,explanation.effect,explanation.action].join(' ')});out.problems.push({scope:'本记录',message:record.values.message||explanation.title});}
 else if(kind==='suggestion')out.basis.push({label:'采购参考口径',value:`原净缺口 ${quantity(number(raw.netGap??raw.quantity),timeline.unit)}；建议采购 ${quantity(number(raw.quantity),timeline.unit)}`,logic:'建议采购量可能包含最小采购量或包装倍数；该建议尚未采用，不自动补齐供给，不将建议可用日解释为缺料消除日。'});
 else out.basis.push({label:'计划分配口径',value:`${quantity(timeline.quantity,timeline.unit)} · ${raw.supplyId||'供给编号未提供'}`,logic:raw.conditional?'条件供给分配不等于实物库存，是否成立以关联需求结果和处理规则为准。':'本条为计划采用的分配数量，不等于物料总需求或现场领料量。'});
 if(kind==='allocation'){
  const event=timeline.events.find(e=>e.key==='feed');out.materialTotal=1;out.materials=[{material:raw.materialId,quantity:raw.quantity,unit:timeline.unit||'单位未提供',supply:raw.supplyId||'未提供',feed:event?instant(event.at,event.precision):'未提供',meaning:raw.conditional?'条件供给分配':'供给分配',calculation:'本条为冻结计划采用的分配数量；不等于整条BOM需料量，也不代表现场已领料。'}];
 }
 const demand=(p.demandResults||[]).find(r=>r.id===record.need);if(demand)out.facts.push({label:'需求最终状态',value:demand.status==='scheduled'?'已排（不代表已交付）':demand.status==='unplanned'?'未排':demand.status||'未提供'});
 if(record.values.taskId)out.facts.push({label:'真实关联任务',value:record.values.taskId});
 const source=raw.source||raw.evidence?.supplySource||(raw.sheet?{sheet:raw.sheet,row:raw.row,key:raw.routeStepId}:null);
 if(source?.sheet)out.sources.push({...source,key:source.key||source.record||raw.materialId||raw.routeStepId||record.id,fields:[]});
 if(timeline.materialId){const m=rows(v.input,'物料主数据').find(m=>m['物料编号']===timeline.materialId);if(m)out.sources.push({sheet:'物料主数据',row:m._row??null,key:timeline.materialId,fields:[{field:'基础单位',value:m['基础单位']??null}]});}
 if(!out.sources.length)out.missing.push('该记录未保存可直接追溯的原表行；可在完整明细查看同需求来源与参数。');
 for(const finding of p.findings||[])if(record.need&&finding.need===record.need&&finding!==raw)out.problems.push({scope:'同需求/在制记录',message:finding.message||finding.code||'问题说明未保存'});
 for(const shortage of p.shortages||[])if(record.need&&shortage.need===record.need&&shortage!==raw)out.problems.push({scope:'同需求/在制净缺口',message:`${shortage.materialId||'物料未提供'} · ${quantity(number(shortage.quantity),shortage.unit||rows(v.input,'物料主数据').find(m=>m['物料编号']===shortage.materialId)?.['基础单位'])}`});
 out.problemTotal=out.problems.length;out.problems=out.problems.slice(0,20);return out;
}
