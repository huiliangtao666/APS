// Explicit new-contract inputs only. Legacy snapshots retain group semantics.
export const hasPhysicalPools=data=>(data.personnelPools||[]).length>0||(data.personnelGroups||[]).some(g=>g.poolId?.trim());
const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=64&&v===v.trim()&&!/[\x00-\x1f\x7f]/.test(v);
const validTime=v=>{if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(v))return false;const date=new Date(v.slice(0,10)+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===v.slice(0,10)&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60&&Number.isFinite(Date.parse(v));};
const positive=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
export function validatePhysicalPools(data,{at=new Date().toISOString(),forRun=false}={}){
 if(!hasPhysicalPools(data))return [];
 const pools=data.personnelPools||[],groups=data.personnelGroups||[],issues=[],seen=new Set();
 const add=(table,i,field,message)=>issues.push({code:'INPUT / PHYSICAL_POOL',table,file:table==='personnelPools'?'30_物理人员池.csv':'19_人员组与可用时间.csv',row:i+2,field,message});
 for(const [i,p] of pools.entries()){
  const fail=(f,m)=>add('personnelPools',i,f,`池 ${p.poolId||'待配置'}：${m}`),active=p['是否启用']==='是';
  if(!idOK(p.poolId))fail('poolId','稳定身份须为1–64字符且无首尾空白/控制字符');
  if(seen.has(p.poolId))fail('poolId','重复物理身份，不允许多容量来源');seen.add(p.poolId);
  if(!['是','否'].includes(p['是否启用']))fail('是否启用','显式选择是或否，草稿选否');
  if(!p['池名称']?.trim())fail('池名称','名称必填；重命名保持poolId');
  if(p['总人数']&&!positive(p['总人数'])||active&&!positive(p['总人数']))fail('总人数','总人数须显式填写有限安全正整数人；不从组人数推定');
  if(p['允许共用']&&!['是','否'].includes(p['允许共用']))fail('允许共用','仅接受显式是或否');
  if(active&&p['允许共用']!=='是')fail('允许共用','U01关闭互斥粒度待业务决定；当前只允许显式共用是');
  if(p['交接设置']?.trim())fail('交接设置','U02交接数量含义待业务决定，禁止写入候选交接公式；需要交接的场景不可启用');
  if(active&&!p['容量来源']?.trim())fail('容量来源','填写唯一总人数的显式来源');
  if(active&&p['适用范围']!=='*')fail('适用范围','本核心只接受全局 * 唯一容量；不得按产线/工序复制池容量');
  if(p['生效时间']&&!validTime(p['生效时间']))fail('生效时间','须为带时区ISO时间或留空立即用于新运行');
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
