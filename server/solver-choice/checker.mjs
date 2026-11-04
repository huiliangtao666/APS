import {validateMinuteModel} from './model.mjs';

// Reconstruct every occupation/claim from the immutable model and the returned
// assignments. No native interval list, cached peak, verification or status is
// trusted. The existing workbook business checker is required in addition.
export function checkMinuteCandidate(input,candidate){
 const m=validateMinuteModel(input),issues=[],add=s=>issues.push(s),tasks=new Map(m.tasks.map(t=>[t.id,t])),placed=new Map(),uses=new Map(m.resources.map(r=>[r.id,[]])),claims=new Map(),byNeed=new Map(),quotas=new Map();
 if(!candidate||!['tasks','allocations','cleaning','unplanned'].every(k=>Array.isArray(candidate[k])))return {status:'problem',issues:['候选格式不完整'],notChecked:[]};
 const reserve=(id,start,end,amount,source,calendar=true)=>{
  const r=m.resources.find(r=>r.id===id);
  if(!r||![start,end,amount].every(Number.isSafeInteger)||end<=start||amount<=0){add('无效资源占用 '+source);return;}
  if(calendar&&!r.calendar.some(([a,b])=>a<=start&&end<=b))add('资源日历外占用 '+source+'/'+id);
  uses.get(id).push({start,end,amount,source});
 };
 for(const x of candidate.tasks){
  const t=tasks.get(x.id),a=t?.alternatives.find(a=>a.id===x.alternativeId);
  if(!t||!a||placed.has(x.id)){add('任务/候选身份未知或重复 '+x.id);continue;}
  placed.set(x.id,x);
  if(![x.start,x.end].every(Number.isSafeInteger)||x.start<m.window[0]||x.end>m.window[1]||x.end-x.start!==t.duration||!t.starts.some(([a,b])=>a<=x.start&&x.start<=b))add('分钟/历时/窗口不符 '+x.id);
  if(t.fixed&&(x.start!==t.fixed.start||x.alternativeId!==t.fixed.alternativeId))add('执行/锁定事实被移动 '+x.id);
  for(const u of a.uses)reserve(u.resourceId,x.start+u.offset,x.start+u.offset+u.duration,u.amount,x.id);
  if(a.startQuota){const q=a.startQuota,day=Math.floor(x.start/1440),rule=q.days.find(([d])=>d===day),key=q.resourceId+'|'+day,old=quotas.get(key);if(!rule||old&&old.capacity!==rule[1])add('日投产量口径缺失/冲突 '+x.id);else quotas.set(key,{capacity:rule[1],amount:(old?.amount||0)+q.amount});}
 }
 const unplanned=new Set();for(const x of candidate.unplanned){if(!tasks.has(x.taskId)||placed.has(x.taskId)||unplanned.has(x.taskId)||!x.reason)add('未排身份/原因错误 '+x.taskId);unplanned.add(x.taskId);}
 for(const t of m.tasks){const x=placed.get(t.id);if(!x){if(t.required||!unplanned.has(t.id))add('必排或未排说明缺失 '+t.id);continue;}
  for(const p of t.predecessors){const before=placed.get(p.taskId);if(!before||x.start-before.end<p.minLag||p.maxLag!==null&&x.start-before.end>p.maxLag)add('前序/最大等待不符 '+t.id);}
 }
 if(m.tasks.length&&!placed.size)add('零任务不能冒充成功');
 for(const r of m.reservations)reserve(r.resourceId,r.start,r.end,r.amount,r.id,false);
 const expectedCleaning=[];
 for(const sequence of m.sequences){
  const active=sequence.members.filter(a=>placed.get(a.taskId)?.alternativeId===a.alternativeId).sort((a,b)=>placed.get(a.taskId).start-placed.get(b.taskId).start||a.taskId.localeCompare(b.taskId));
  for(let i=1;i<active.length;i++){
   const before=active[i-1],after=active[i],prior=placed.get(before.taskId),next=placed.get(after.taskId),rule=sequence.transitions.find(r=>r.from===before.productId&&r.to===after.productId);
   const x={sequenceId:sequence.id,before:before.taskId,after:after.taskId,start:next.start-rule.minutes,end:next.start,source:rule.source};expectedCleaning.push(x);
   if(prior.end>x.start)add('有向清洗与前序占用冲突 '+sequence.id+'/'+after.taskId);
   if(rule.minutes){reserve(sequence.resourceId,x.start,x.end,1,'清洗/'+after.taskId);if(rule.people)reserve(rule.crewResourceId,x.start,x.end,rule.people,'清洗人员/'+after.taskId);}
  }
 }
 const cleanKey=x=>JSON.stringify([x.sequenceId,x.before,x.after,x.start,x.end,x.source]);
 if(JSON.stringify(expectedCleaning.map(cleanKey).sort())!==JSON.stringify(candidate.cleaning.map(cleanKey).sort()))add('有向清洗矩阵/来源/计时不符');
 for(const r of m.resources){const events=uses.get(r.id).flatMap(x=>[[x.start,x.amount],[x.end,-x.amount]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let used=0;for(const [at,n]of events){used+=n;if(used>r.capacity)add('资源容量超占 '+r.id+'@'+at);}}
 for(const [key,q]of quotas)if(q.amount>q.capacity)add('日投产量超限 '+key);
 const lots=new Map(m.lots.map(l=>[l.id,l])),flowIds=new Set();
 for(const a of candidate.allocations){
  const t=tasks.get(a.taskId),x=placed.get(a.taskId),n=t?.materialNeeds.find(n=>n.id===a.needId),lot=lots.get(a.lotId),key=a.taskId+'|'+a.needId+'|'+a.lotId;
  if(!n||!x||!lot||flowIds.has(key)||!Number.isSafeInteger(a.quantity)||a.quantity<=0||!n.eligibleLotIds.includes(a.lotId)){add('物料分配身份/精度/数量错误 '+key);continue;}flowIds.add(key);
  if(lot.materialId!==n.materialId||!lot.qualityEligible||a.feedMinute!==x.start+n.feedOffset||a.feedMinute<lot.ready||a.feedMinute>=lot.expiry)add('物料质量/时点/投料不符 '+key);
  if(lot.producer){const p=placed.get(lot.producer.taskId);if(!p||a.feedMinute<p.end+lot.producer.releaseLag||a.feedMinute>=p.end+lot.producer.shelfLife)add('制造供给前序/放行/效期不符 '+key);}
  claims.set(lot.id,(claims.get(lot.id)||0)+a.quantity);const nk=a.taskId+'|'+a.needId;byNeed.set(nk,(byNeed.get(nk)||0)+a.quantity);
 }
 for(const t of m.tasks)for(const n of t.materialNeeds)if((byNeed.get(t.id+'|'+n.id)||0)!==(placed.has(t.id)?n.quantity:0))add('投料数量不守恒 '+t.id+'/'+n.id);
 for(const [id,q]of claims)if(q+lots.get(id).reserved>lots.get(id).quantity)add('批次累计余额超限 '+id);
 const demandCoverage=m.demands.map(d=>({id:d.id,quantity:d.quantity,unit:d.unit,completedQuantity:d.completedQuantity,taskIds:d.taskIds,unplannedTaskIds:d.taskIds.filter(id=>!placed.has(id)),complete:d.completedQuantity===d.quantity||d.taskIds.every(id=>placed.has(id))}));
 return {status:issues.length?'problem':'pass',issues:[...new Set(issues)],notChecked:[],modelHash:m.modelHash,coverage:{complete:demandCoverage.every(d=>d.complete),zeroScheduled:!placed.size&&m.demands.some(d=>d.completedQuantity<d.quantity),demands:demandCoverage},scope:['整数分钟/批准整数数量','必排/前序/等待/固定事实','联合容量/资源日历/保留/释放尾段','有向清洗/日投产量','物料资格/制造前序/累计余额/投料守恒','声明需求任务覆盖']};
}
