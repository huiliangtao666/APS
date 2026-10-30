// N06: supplied historical facts, never inferred from current plan rules.
import {quantityMath as Q} from './material-allocation.mjs';
export const originalTable='originalResourceEvents';
export const originalFields=['事件编号','原账编号','前事件编号','事件类型','原账JSON'];
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=x=>typeof x==='string'&&x.trim().length>0;
const list=x=>Array.isArray(x)&&x.length<=10000;
const minute=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=525600;
const qty=x=>typeof x==='string'&&/^\d+(?:\.\d{1,12})?$/.test(x)&&Number(x)>0&&Number(x)<=1e12;
const fail=m=>{throw Error(m);};
export function originalViews(data){
 const views=new Map(),ids=new Set(),sourceEvents=new Map();
 for(const row of data[originalTable]||[]){
  if(!originalFields.slice(0,2).every(k=>text(row[k]))||ids.has(row['事件编号']))fail('事件编号缺失或重复');ids.add(row['事件编号']);
  if(!['登记','释放','纠正','草稿'].includes(row['事件类型']))fail('未知原账事件类型');
  const old=views.get(row['原账编号']);
  if((old?.row['事件编号']||'')!==(row['前事件编号']||''))fail('原账前事件过期、分叉或引用不存在');
  if(old&&row['事件类型']==='草稿')fail('已有原账须追加纠正，不得以草稿替换');
  if(!old&&!['登记','草稿'].includes(row['事件类型'])||old&&row['事件类型']==='登记')fail('登记/追加事件顺序无效');
  const doc=JSON.parse(row['原账JSON']);
  if(!doc||Array.isArray(doc)||!['草稿','已核对'].includes(doc.status))fail('须明确草稿或已核对');
  if(!text(doc.reason)||!text(doc.eventSource))fail('事件须有原因与独立来源引用');
  if(old&&doc.status==='草稿'&&old.doc.status==='已核对')fail('已核对原账不可降级草稿');
  if(doc.status==='已核对')validateDoc(doc,data,false);
  else if(row['事件类型']!=='草稿'&&row['事件类型']!=='纠正')fail('缺项仅可保存草稿');
  const src=(doc.sources||[]).find(s=>s.id===doc.eventSource);
  if(!src)fail('事件来源引用不存在');
  source(src);
  const key=JSON.stringify([src.domain,src.version,src.record]);
  if(sourceEvents.has(key))fail('来源事件重复或矛盾；原样重送须复用同一事件编号');sourceEvents.set(key,row['事件编号']);
  if(row['事件类型']==='释放'){
   if(!old||old.doc.status!=='已核对'||doc.status!=='已核对')fail('释放须引用已核对原占用');
   const a=structuredClone(old.doc),b=structuredClone(doc);
   if(!list(b.occupancies)||a.occupancies.length!==b.occupancies.length)fail('释放不能增删占用');
   let n=0;
   for(let i=0;i<a.occupancies.length;i++){
    const x=a.occupancies[i],y=b.occupancies[i];
    if(x.end===null&&y.end!==null){n++;x.end=y.end;x.releaseSource=y.releaseSource;}
   }
   if(n!==1)fail('一次事件仅支持一笔全部数量释放');
   for(const k of ['reason','eventSource','observedAt','sources'])delete a[k],delete b[k];
   if(!eq(a,b))fail('释放不能改数量、取得时点、身份或映射');
   if(doc.observedAt<old.doc.observedAt)fail('释放观测点不能倒退');
   for(const s of old.doc.sources)if(!doc.sources.some(x=>eq(x,s)))fail('释放须保留前来源原件');
  }
  views.set(row['原账编号'],{row,doc});
 }
 // An actual occupancy/fact belongs to one effective ledger only. Shared members
 // are relationships inside that ledger, never duplicate physical debits.
 const occ=new Set(),facts=new Set();
 for(const {doc} of views.values())if(doc.status==='已核对'){
  validateDoc(doc,data,true);
  for(const f of doc.facts){if(facts.has(f.factId))fail('累计事实被多个原账重复接纳');facts.add(f.factId);}
  for(const o of doc.occupancies){if(occ.has(o.id))fail('实际占用身份重复');occ.add(o.id);}
 }
 return [...views.values()];
}
function source(s){
 if(!s||!['真实客户','明确模拟'].includes(s.kind)||!['id','domain','version','record','location','providerRole','provider','reviewer','occurredAt'].every(k=>text(s[k]))||!/^([a-f0-9]{64})$/.test(s.sha256||''))fail('来源须含原件位置/hash/版本行键、提供方角色与责任人、核对人、发生时点及真实/模拟标记');
}
function validateDoc(d,data,currentMapping=true){
 if(d.contract!=='N06-finite-v1'||d.timeOrigin!=='2026-11-02T08:00:00+08:00'||!minute(d.observedAt)||!text(d.scope)||!text(d.responsible)||!text(d.ruleVersion)||!d.historicalRules||typeof d.historicalRules!=='object'||Array.isArray(d.historicalRules)||!Object.keys(d.historicalRules).length)fail('原账契约、时间原点、观测时点、完整性责任/范围或历史规则版本缺失');
 if(!list(d.sources)||!d.sources.length||!list(d.facts)||!d.facts.length||!list(d.occupancies)||!list(d.adoption)||!list(d.identities))fail('原账关联清单不完整');
 const sources=new Set();for(const s of d.sources){source(s);if(sources.has(s.id))fail('来源编号重复');sources.add(s.id);}
 const ref=id=>{if(!sources.has(id))fail('原件来源引用缺失 '+id);};ref(d.ruleSource);ref(d.eventSource);
 const taskIds=new Set(),fids=new Set();
 for(const f of d.facts){
  if(!text(f.factId)||fids.has(f.factId)||!f.snapshot||!((data.executionContext||data).executionFacts||[]).some(x=>x['事实编号']===f.factId))fail('原累计事实缺失/重复或修订不匹配');fids.add(f.factId);
  ref(f.source);if(!list(f.tasks)||!f.tasks.length)fail('缺原任务/原批交叉清册');
  let total=Q.zero;
  for(const t of f.tasks){
   if(!['id','batchId','batchVersion','executionRecord','member','unit'].every(k=>text(t[k]))||taskIds.has(t.id)||!qty(t.quantity)||t.unit!==f.snapshot['数量单位'])fail('原任务/原批成员数量单位或稳定身份无效');
   taskIds.add(t.id);ref(t.source);total=Q.add(total,Q.q(t.quantity));
  }
  const order=((data.executionContext||data).orders||[]).find(o=>o['订单编号']===f.snapshot['订单编号']);
  if(!order||Q.cmp(total,Q.q(order['合格需求']))!==0n)fail('原批成员总量须与原订单需求守恒；不自动分摊进度');
 }
 const identities=new Map();
 for(const p of d.identities){
  if(!['工装','空间','人员'].includes(p.type)||!['physicalId','historicalId','historicalVersion','currentId','unit'].every(k=>text(p[k]))||identities.has(p.physicalId))fail('物理身份缺失/重复');
  ref(p.source);identities.set(p.physicalId,p);
  const current=p.type==='工装'?(data.tools||[]).find(x=>x['工装编码']===p.currentId):p.type==='空间'?(data.batchResources||[]).find(x=>x['资源编号']===p.currentId):(data.personnelPools||[]).find(x=>x.poolId===p.currentId);
  if(currentMapping&&(!current||p.unit!==(p.type==='工装'?'套':p.type==='人员'?'人':current?.['单位'])))fail('当前供给身份或数量单位不匹配，禁止猜测换算');
 }
 const adoptions=new Map();
 for(const a of d.adoption){
  if(!taskIds.has(a.taskId)||!['工装','空间','人员'].includes(a.type)||!['采用','未采用'].includes(a.state)||!list(a.occupancyIds))fail('实际采用集合或原任务引用无效');ref(a.source);
  const key=JSON.stringify([a.taskId,a.type]);if(adoptions.has(key))fail('采用集合重复');adoptions.set(key,a);
  if(a.state==='未采用'&&a.occupancyIds.length||a.state==='采用'&&!a.occupancyIds.length||new Set(a.occupancyIds).size!==a.occupancyIds.length)fail('采用正负声明与占用清单矛盾');
 }
 for(const t of taskIds)for(const type of ['工装','空间','人员'])if(!adoptions.has(JSON.stringify([t,type])))fail('全部采用清单缺项 '+t+'/'+type);
 const seen=new Set(),windows=new Set();
 for(const o of d.occupancies){
  const p=identities.get(o.physicalId);
  if(!text(o.id)||seen.has(o.id)||!p||!qty(o.quantity)||o.unit!==p.unit||!minute(o.start)||o.start>d.observedAt||!(o.end===null||minute(o.end)&&o.start<o.end&&o.end<=d.observedAt))fail('占用缺量/单位/身份/合法实际区间；未知结束须为null');seen.add(o.id);
  if(p.type!=='空间'&&!Number.isSafeInteger(Number(o.quantity)))fail('套数/人数须合法整数');
  ref(o.acquireSource);if(o.end!==null)ref(o.releaseSource);
  if(!list(o.members)||!o.members.length||new Set(o.members).size!==o.members.length)fail('缺原任务成员或成员重复');
  for(const t of o.members){const a=adoptions.get(JSON.stringify([t,p.type]));if(!a||a.state!=='采用'||!a.occupancyIds.includes(o.id))fail('占用与实际采用清单不一致');
   const key=JSON.stringify([t,o.physicalId]);if(windows.has(key))fail('同原任务同物理资源多窗口/分次领用不在本有限范围');windows.add(key);
  }
  if(o.members.length>1){if(!text(o.resourceBatchId))fail('共用须有原资源批身份');ref(o.sharedSource);}
  if(p.type==='人员'){
   if(!o.people||!['groupId','groupVersion','currentGroupId','postId','requiredSkill','providedSkill','shift','mappingVersion'].every(k=>text(o.people[k])))fail('原人员组池/岗位/技能/班次/映射版本不完整');
   ref(o.people.source);
   const h=o.people;
   if(!list(h.skills)||!h.skills.includes(h.providedSkill)||!minute(h.shiftStart)||!minute(h.shiftEnd)||h.shiftStart>=h.shiftEnd)fail('原技能/班次资格快照无效');
   if(h.providedSkill!==h.requiredSkill&&(!h.substitution||h.substitution.from!==h.providedSkill||h.substitution.to!==h.requiredSkill||!text(h.substitution.version)))fail('人员替代须显式有向单跳历史依据');
   if(h.substitution)ref(h.substitution.source);
   const g=(data.personnelGroups||[]).find(x=>x['人员组编号']===h.currentGroupId);
   if(currentMapping&&(!g||g.poolId!==p.currentId))fail('历史组/池当前映射缺失或矛盾');
  }
 }
 for(const a of d.adoption)for(const id of a.occupancyIds)if(!d.occupancies.some(o=>o.id===id&&o.members.includes(a.taskId)&&identities.get(o.physicalId).type===a.type))fail('采用清单缺实际占用 '+id);
 // Two aliases may not turn a single physical supply into double capacity.
 const supplies=new Set();for(const p of d.identities){const k=JSON.stringify([p.type,p.currentId]);if(supplies.has(k))fail('同一供给不能声明为多个物理身份');supplies.add(k);}
}
export function originalIssues(data,{forRun=false}={}){
 try{
  const views=originalViews(data),docs=views.map(v=>v.doc),issues=[];
  if(forRun){
   const full=data.executionContext||data;
   for(const f of full.executionFacts||[])if(!docs.some(d=>d.status==='已核对'&&d.facts.some(x=>x.factId===f['事实编号']&&eq(x.snapshot,f))))issues.push('缺少当前事实修订的完整原账 '+f['事实编号']);
   for(const d of docs){
    if(d.status!=='已核对'){issues.push('草稿待核，相关容量域完整性未证明');continue;}
    for(const o of d.occupancies)if(o.end===null)issues.push('未知释放阻断未来容量 '+o.id+'；禁止以完成/剩余工时/H代填');
   }
   // Conflicting physical mappings between ledgers are not independent supplies.
   const identities=new Map();for(const d of docs.filter(d=>d.status==='已核对'))for(const p of d.identities){const k=JSON.stringify([p.type,p.currentId]);if(identities.has(k)&&identities.get(k)!==p.physicalId)issues.push('跨账物理身份映射冲突 '+p.currentId);identities.set(k,p.physicalId);}
  }
  return issues.map(message=>({code:'N06_ORIGINAL_RESOURCE_BLOCKED',table:originalTable,field:'原账JSON',message}));
 }catch(e){return [{code:'N06_ORIGINAL_RESOURCE_INVALID',table:originalTable,field:'原账JSON',message:e.message}];}
}
export function originalTransition(before,after){
 const old=before[originalTable]||[],next=after[originalTable]||[];
 if(next.length<old.length||old.some((r,i)=>!eq(r,next[i])))return [{code:'N06_APPEND_ONLY',table:originalTable,field:'事件编号',message:'原账事件不可删除/改写/重排；请追加来源支持的纠正或释放'}];
 return originalIssues(after);
}
export function originalProtection(data){
 return originalViews(data).filter(v=>v.doc.status==='已核对').flatMap(({row,doc})=>doc.occupancies.map(o=>{
  const p=doc.identities.find(p=>p.physicalId===o.physicalId);
  return {ledgerId:row['原账编号'],eventId:row['事件编号'],occupancyId:o.id,physicalId:p.physicalId,historicalId:p.historicalId,type:p.type,resourceId:p.type==='人员'?o.people.currentGroupId:p.currentId,...(p.type==='人员'?{poolId:p.currentId,originalGroupId:o.people.groupId}:{}),quantity:o.quantity,unit:o.unit,start:o.start,end:o.end,members:[...o.members],observedAt:doc.observedAt,sourceIds:[o.acquireSource,...(o.end===null?[]:[o.releaseSource])]};
 }));
}
export function originalSchedulingReservations(data){
 const rows=originalProtection(data);
 return {resources:rows.filter(r=>r.type!=='人员'),people:rows.filter(r=>r.type==='人员').map(r=>({...r,groupId:r.resourceId,count:Number(r.quantity),originalFact:true}))};
}

// Original v0.3 CSV fields. These source records deliberately do not create
// runtime tools, personnel groups, shifts, claims or default business values.
export const originalResourceDefs=[
 {key:'originalTools',label:'原05 模具与工具资料（待运行映射）',file:'05_模具与工具配置.csv',fields:['资源编号','资源名称','资源类型','可用数量','最早可用分钟','最晚可用分钟','共享范围']},
 {key:'originalPersonnel',label:'原06 人员技能资料（待运行映射）',file:'06_人员技能与班次.csv',fields:['人员组编号','技能','可用人数','起始分钟','结束分钟','共享范围']}
];
export const originalResourceKeys=originalResourceDefs.map(d=>d.key);
export const originalResourceNote='原05/06按原列保存和查询，通过31_原05与06运行映射显式绑定运行配置。未READY来源禁止新运行采用。数量为资源套/件数或人数，时间为分钟 0 = 2026-11-02 08:00（Asia/Shanghai）的偏移，不能填日期或小时单位。共享范围和资源类型按原文本保留；运行映射须显式填写并校验共享池、任务占用、组名与班次；仅支持配置页列出的合同组合。同编号关联只供核对，不表示已经采用这些容量。';
export function validateOriginalResources(data){
 const issues=[];
 for(const def of originalResourceDefs){
  const tool=def.key==='originalTools',count=tool?'可用数量':'可用人数',start=tool?'最早可用分钟':'起始分钟',end=tool?'最晚可用分钟':'结束分钟';
  (data[def.key]||[]).forEach((row,index)=>{
   const add=(field,message)=>issues.push({table:def.key,file:def.file,row:index+2,field,message});
   for(const f of def.fields)if(!row[f]?.trim())add(f,'必填；须显式填写，不自动补值');
   const n=row[count]?.trim();
   if(n&&(!/^\d+$/.test(n)||!Number.isSafeInteger(Number(n))))add(count,'须为非负安全整数；不取整或自动换算');
   const valid=f=>!!row[f]?.trim()&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row[f].trim())&&Number.isFinite(Number(row[f]))&&Number(row[f])<=Number.MAX_SAFE_INTEGER;
   for(const f of [start,end])if(row[f]?.trim()&&!valid(f))add(f,'须为非负安全分钟数；不接受日期、小时单位、指数或无穷值');
   if(valid(start)&&valid(end)&&Number(row[end])<=Number(row[start]))add(end,'结束分钟须大于起始分钟');
  });
 }
 return issues;
}
