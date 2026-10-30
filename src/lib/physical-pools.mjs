// Explicit new-contract inputs only. Legacy snapshots retain group semantics.
export const hasPhysicalPools=data=>(data.personnelPools||[]).length>0||(data.personnelGroups||[]).some(g=>g.poolId?.trim());
const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=64&&v===v.trim()&&!/[\x00-\x1f\x7f]/.test(v);
const validTime=v=>{if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(v))return false;const date=new Date(v.slice(0,10)+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===v.slice(0,10)&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60&&Number.isFinite(Date.parse(v));};
const positive=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
export function validatePhysicalPools(data,{at=new Date().toISOString(),forRun=false,allowLegacy=false}={}){
 if(!hasPhysicalPools(data))return [];
 const pools=data.personnelPools||[],groups=data.personnelGroups||[],issues=[],seen=new Set();
 const add=(table,i,field,message)=>issues.push({code:'INPUT / PHYSICAL_POOL',table,file:table==='personnelPools'?'30_物理人员池.csv':table==='dependencies'?'12_工序资源与物料依赖.csv':'19_人员组与可用时间.csv',row:i+2,field,message});
 for(const [i,p] of pools.entries()){
  const fail=(f,m)=>add('personnelPools',i,f,`池 ${p.poolId||'待配置'}：${m}`),active=p['是否启用']==='是';
  if(!idOK(p.poolId))fail('poolId','稳定身份须为1–64字符且无首尾空白/控制字符');
  if(seen.has(p.poolId))fail('poolId','重复物理身份，不允许多容量来源');seen.add(p.poolId);
  if(!['是','否'].includes(p['是否启用']))fail('是否启用','显式选择是或否，草稿选否');
  if(!p['池名称']?.trim())fail('池名称','名称必填；重命名保持poolId');
  if(p['总人数']&&!positive(p['总人数'])||active&&!positive(p['总人数']))fail('总人数','总人数须显式填写有限安全正整数人；不从组人数推定');
  if(p['允许共用']&&!['是','否'].includes(p['允许共用']))fail('允许共用','仅接受显式是或否');
  if(active&&!['是','否'].includes(p['允许共用']))fail('允许共用','显式选择是或否，不推定共用策略');
  if(!allowLegacy||p['策略版本'])validatePoolStrategy(p,active,fail);
  else if(active&&p['允许共用']!=='是')fail('允许共用','旧核心契约不支持关闭共用，不能补用新策略解释历史');
  if(p['交接设置']?.trim())fail('交接设置','旧自由文本无计算契约，请清空并显式配置交接模式/窗口/容量');
  if(active&&!p['容量来源']?.trim())fail('容量来源','填写唯一总人数的显式来源');
  if(active&&p['适用范围']!=='*')fail('适用范围','本核心只接受全局 * 唯一容量；不得按产线/工序复制池容量');
  if(p['生效时间']&&!validTime(p['生效时间']))fail('生效时间','须为带时区ISO时间或留空立即用于新运行');
 }
 for(const [i,d] of (data.dependencies||[]).entries())if(d['资源类型']==='人员技能'){
  const ids=d['候选人员组']?.trim()?d['候选人员组'].split(/[,，]/).map(s=>s.trim()):[d['资源编号']];
  const policies=new Set(groups.filter(g=>ids.includes(g['人员组编号'])).map(g=>pools.find(p=>p.poolId===g.poolId)?.['占用策略']||'依赖声明'));
  if(policies.size>1)add('dependencies',i,'候选人员组','候选组跨池占用策略不同，当前组合未启用；统一占用策略或分别声明需求');
 }
 const enabled=pools.some(p=>p['是否启用']==='是');
 for(const [i,g] of groups.entries()){
  const p=pools.find(p=>p.poolId===g.poolId);
  if(g.poolId&&!p)add('personnelGroups',i,'poolId','引用未知/已删除池；必须同次完整修改映射');
  if((enabled||forRun)&&(!g.poolId||!p))add('personnelGroups',i,'poolId','P10待配置：每个组须显式映射唯一物理池，不自动建立独立池');
  if(p&&forRun&&(p['是否启用']!=='是'||p['生效时间']&&Date.parse(p['生效时间'])>Date.parse(at)))add('personnelGroups',i,'poolId',`池 ${p.poolId} 未启用/未生效，禁止新运行；请完成配置或等待生效`);
 }
 return issues;
}
export function poolTransitionIssues(before,after,records=[]){
 const current=new Set((before.personnelPools||[]).map(p=>p.poolId)),next=new Set((after.personnelPools||[]).map(p=>p.poolId));
 const retired=new Set(records.filter(r=>r.target==='personnelPools').flatMap(r=>(r.before||[]).filter(p=>!(r.after||[]).some(x=>x.poolId===p.poolId)).map(p=>p.poolId)));
 if(hasPhysicalPools(before)&&!hasPhysicalPools(after))return [{code:'INPUT / PHYSICAL_POOL',table:'personnelPools',row:0,field:'poolId',message:'已采用P10配置不能隐式降级为旧组容量契约；保留停用草稿，历史按原输入解释'}];
 const ids=[...next].filter(id=>!current.has(id)&&retired.has(id));
 return ids.map(id=>({code:'INPUT / PHYSICAL_POOL',table:'personnelPools',row:0,field:'poolId',message:`已退役物理池 ${id} 禁止复用身份；请使用新编号，历史不变`}));
}

export const poolStrategyOptions={
 '策略版本':['P10-explicit-v2'], '互斥粒度':['无互斥','人员组互斥','工序互斥'],
 '交接模式':['不设交接限制','窗口容量上限'], '占用策略':['依赖声明','全工序保留'], '释放策略':['半开端点释放']
};
const count=v=>typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)&&Number.isSafeInteger(Number(v));
const minute=v=>count(v)&&Number(v)<=525600;
function validatePoolStrategy(p,active,fail){
 for(const [key,options] of Object.entries(poolStrategyOptions)){
  if((active||p[key])&&!options.includes(p[key]))fail(key,`显式选择 ${options.join(' / ')}；其他模式未启用`);
 }
 if(active&&!p['策略来源']?.trim())fail('策略来源','填写本版本业务配置依据；实际操作者/角色/原因由权限审计记录，不接受自报身份');
 if(p['互斥粒度']&&((p['允许共用']==='是')!==(p['互斥粒度']==='无互斥')))fail('互斥粒度','共用是须选无互斥；共用否须选人员组互斥或工序互斥');
 const keys=['交接起始分钟','交接结束分钟','交接容量人数'];
 if(p['交接模式']==='窗口容量上限'){
  for(const k of keys)if(!(k==='交接容量人数'?count:minute)(p[k]))fail(k,k==='交接容量人数'?'必须显式填写0至池总人数的安全整数人':'必须显式填写0–525600整数分钟');
  if(minute(p[keys[0]])&&minute(p[keys[1]])&&Number(p[keys[0]])>=Number(p[keys[1]]))fail(keys[1],'交接窗口须起始 < 结束，固定分钟轴半开区间');
  if(count(p[keys[2]])&&Number(p[keys[2]])>Number(p['总人数']))fail(keys[2],'窗口容量上限不得超过池唯一总人数；0明确表示窗口内不可用');
 }else for(const k of keys)if(p[k]?.trim())fail(k,'不设交接限制时交接数值须留空，禁止隐藏参数');
}
// Capacity policy is an upper bound, never an extra person claim or copied pool.
export function poolCapacityAt(p,t){return p['策略版本']==='P10-explicit-v2'&&p['交接模式']==='窗口容量上限'&&t>=Number(p['交接起始分钟'])&&t<Number(p['交接结束分钟'])?Number(p['交接容量人数']):Number(p['总人数']);}
export function poolPolicyPoints(p){return p['交接模式']==='窗口容量上限'?[Number(p['交接起始分钟']),Number(p['交接结束分钟'])]:[];}
