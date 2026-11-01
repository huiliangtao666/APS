// Shared browser/server contract. No forecast consumption or replenishment formula.
export const p1Contract='P1-independent-simulation-v1';
export const p1Defs=[
 {key:'p1Profiles',label:'P1 专题场景与能力配置',file:'40_P1专题配置.csv',fields:['配置编号','配置版本','来源说明','策略JSON']},
 {key:'p1DemandSources',label:'P1 独立模拟需求来源',file:'41_P1独立模拟需求来源.csv',fields:['订单编号','配置编号','来源编号','来源版本','来源说明']},
];
export const p1Capabilities=[
 {id:'independentDemand',label:'独立预测模拟需求',status:'SUPPORTED',detail:'显式选取同一配置的预测；不与正式订单叠加、不自动去重、不生成补库数量。'},
 {id:'existingRoutes',label:'既有显式工艺路线',status:'SUPPORTED',detail:'复用当前产品已配置工序、设备与既有检查；不提供新增路线选择算法。'},
 {id:'existingResources',label:'既有资源与硬约束',status:'SUPPORTED',detail:'复用当前设备、工装、人员、物料与已启用规则；新资源种类不自动采用。'},
 {id:'existingPriority',label:'既有排序',status:'SUPPORTED',detail:'仅规则设置、优先顺序或要求日期；不改变硬约束。'},
 {id:'forecastConsumption',label:'预测冲减与订单去重',status:'NOT_ENABLED',detail:'业务公式与关联维度尚未确认；独立模拟不执行自动冲减。'},
 {id:'targetStock',label:'目标库存自动补库',status:'NOT_ENABLED',detail:'目标库存、可用供给口径及反算公式未确认，不能生成自动补库。'},
 {id:'branchRework',label:'新增分支汇合与返工数量',status:'UNSUPPORTED',detail:'本专题未实现通用分支/汇合/返工数量与次数合同。'},
 {id:'recipeSelection',label:'自动配方选择',status:'UNSUPPORTED',detail:'只采用既有生效BOM；没有自动配方比较或替换能力。'},
 {id:'newResources',label:'新增蒸汽/制冷/周转器具',status:'UNSUPPORTED',detail:'须明确单位、容量、占用合同及独立检查后实现。'},
 {id:'newWeights',label:'新增成本/库存/加班权重',status:'NOT_ENABLED',detail:'目标和权重未确认；不以新目标抵消必要约束。'},
];
export const p1InitialStrategies=Object.fromEntries(p1Capabilities.map(c=>[c.id,c.status==='SUPPORTED'?'ENABLED':'NOT_ENABLED']));
const issue=(table,row,field,message,code='P1_CONFIG')=>({table,row:row+2,field,code,message});
export function checkP1Strategies(raw){
 let value;
 try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{return ['策略JSON须为有效JSON对象'];}
 if(!value||typeof value!=='object'||Array.isArray(value))return ['策略JSON须为对象'];
 const errors=[];
 for(const id of Object.keys(value))if(!p1Capabilities.some(c=>c.id===id))errors.push('未知专题策略：'+id);
 for(const c of p1Capabilities){
  const state=value[c.id];
  if(!['ENABLED','NOT_ENABLED'].includes(state))errors.push(c.label+'须显式配置ENABLED或NOT_ENABLED');
  else if(state==='ENABLED'&&c.status!=='SUPPORTED')errors.push(c.label+' '+c.status+'：'+c.detail);
  else if(c.status==='SUPPORTED'&&state!=='ENABLED')errors.push(c.label+'为本版必需能力，不能关闭后声明专题可用');
 }
 return errors;
}
export function validateP1Inputs(data){
 const errors=[],profiles=data.p1Profiles||[],sources=data.p1DemandSources||[];
 for(const [i,p]of profiles.entries()){
  for(const field of ['配置编号','配置版本','来源说明'])if(!p[field]?.trim())errors.push(issue('p1Profiles',i,field,'专题'+field+'不能为空'));
  if(profiles.filter(x=>x['配置编号']===p['配置编号']).length!==1)errors.push(issue('p1Profiles',i,'配置编号','专题配置编号须唯一'));
  for(const message of checkP1Strategies(p['策略JSON']))errors.push(issue('p1Profiles',i,'策略JSON',message,'P1_CAPABILITY_REJECTED'));
 }
 for(const [i,s]of sources.entries()){
  for(const field of p1Defs[1].fields)if(!s[field]?.trim())errors.push(issue('p1DemandSources',i,field,'独立模拟'+field+'不能为空'));
  if(sources.filter(x=>x['订单编号']===s['订单编号']).length!==1)errors.push(issue('p1DemandSources',i,'订单编号','每条独立模拟需求只能属于一个场景，不能重复计入'));
  if(!profiles.some(p=>p['配置编号']===s['配置编号']))errors.push(issue('p1DemandSources',i,'配置编号','引用不存在的专题配置'));
  const order=(data.orders||[]).find(o=>o['订单编号']===s['订单编号']);
  if(!order||order['需求类型']!=='预测')errors.push(issue('p1DemandSources',i,'订单编号','只能引用独立预测，正式订单不能作为专题模拟需求'));
  if(Number(order?.['已完成合格数量']||0)!==0||(data.executionFacts||[]).some(f=>f['订单编号']===s['订单编号']))errors.push(issue('p1DemandSources',i,'订单编号','独立预测不能关联正式执行事实或已完成数量'));
 }
 return errors;
}
export function p1EligibleOrders(data,profileId){
 const ids=new Set((data.p1DemandSources||[]).filter(s=>s['配置编号']===profileId).map(s=>s['订单编号']));
 return (data.orders||[]).filter(o=>ids.has(o['订单编号'])&&o['需求类型']==='预测'&&o['订单状态']==='有效');
}
export function freezeP1Topic(data,profileId){
 if(typeof profileId!=='string'||!profileId.trim())throw Error('P1须显式选择独立模拟配置');
 const errors=validateP1Inputs(data);if(errors.length)throw Error(errors.map(e=>e.message).join('；'));
 const profile=(data.p1Profiles||[]).find(p=>p['配置编号']===profileId);if(!profile)throw Error('P1专题配置不存在');
 return {contract:p1Contract,nature:'独立模拟，非正式订单',profile:structuredClone(profile),strategies:JSON.parse(profile['策略JSON']),capabilities:structuredClone(p1Capabilities),aggregation:'ISOLATED_NO_AUTOMATIC_AGGREGATION',automaticReplenishment:'NOT_ENABLED'};
}
export function verifyP1Snapshot(data,conditions){
 const p=conditions?.p1Topic;if(!p)return [];
 const failures=[];
 if(p.contract!==p1Contract||p.aggregation!=='ISOLATED_NO_AUTOMATIC_AGGREGATION'||p.automaticReplenishment!=='NOT_ENABLED')failures.push('独立模拟合同或隔离标记无效');
 failures.push(...checkP1Strategies(p.profile?.['策略JSON']));
 const orders=data.orders||[],sources=p.sources||[];
 if(!orders.length||sources.length!==orders.length||new Set(sources.map(s=>s.orderId)).size!==orders.length)failures.push('冻结独立需求来源须与所选需求一一对应');
 for(const o of orders){const s=sources.find(s=>s.orderId===o['订单编号']);
  if(!s||s.originalDemandType!=='预测'||s.source?.['配置编号']!==p.profile?.['配置编号']||o['需求类型']!=='正式订单'||o['合格需求']!==s.quantity||o['数量单位']!==s.unit||s.profileVersion!==p.profile?.['配置版本'])failures.push('独立模拟适配与冻结来源/数量/版本不一致：'+o['订单编号']);
 }
 return failures;
}
