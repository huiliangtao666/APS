import {MODEL_CONTRACT,SolverProblem,requireCoverage,fingerprint} from './contract.mjs';
import {validateWorkbookModel} from './workbook-model.mjs';

const fail=(path,message)=>{throw new SolverProblem('CP_MODEL_INPUT',message,{path});};
const integer=(n,path,min=0)=>{if(!Number.isSafeInteger(n)||n<min)fail(path,'须为安全整数且符合下界');return n;};
const nonempty=(v,path)=>{if(typeof v!=='string'||!v)fail(path,'缺少明确身份');return v;};
function unique(list,path){if(!Array.isArray(list))fail(path,'须为数组');const ids=new Set();for(const x of list){nonempty(x?.id,path+'.id');if(ids.has(x.id))fail(path,'身份重复 '+x.id);ids.add(x.id);}return ids;}
function ranges(list,path){if(!Array.isArray(list))fail(path,'缺少显式分钟范围');for(const [i,r]of list.entries()){if(!Array.isArray(r)||r.length!==2)fail(path,'范围须为两个整数');integer(r[0],path+i,Number.MIN_SAFE_INTEGER);integer(r[1],path+i,Number.MIN_SAFE_INTEGER);if(r[1]<r[0])fail(path,'分钟范围倒置');}}
// This is an internal, already-normalized model, never a public request format.
// The workbook compiler must account for every selected demand and enabled
// rule. A caller cannot set supported=true to bypass the business checker.
export function validateMinuteModel(model){
 if(model?.contract==='aps-cpsat-workbook:v2')return validateWorkbookModel(model);
 if(model?.contract!==MODEL_CONTRACT)fail('contract','未知分钟模型合同');
 if(model.objective?.kind!=='feasibility'||!model.objective.source)fail('objective','仅接已声明的无优化目标；不默认最短工期或猜测权重');
 if(!model.source?.inputHash||!model.source?.configurationHash||!model.source?.selectionHash)fail('source','缺少冻结输入、参数或范围指纹');
 integer(model.window?.[0],'window.start');integer(model.window?.[1],'window.end');if(model.window[1]<=model.window[0])fail('window','须为非空半开分钟窗');
 requireCoverage(model.rules);
 if(!['all_required','explicit_partial'].includes(model.partialPolicy?.kind)||!model.partialPolicy?.source)fail('partialPolicy','缺少已有批准部分排程策略或明确必排声明');
 if(model.partialPolicy.kind==='explicit_partial'&&!model.partialPolicy.version)fail('partialPolicy.version','部分排程必须引用批准策略版本');
 const resources=unique(model.resources,'resources'),tasks=unique(model.tasks,'tasks'),lots=unique(model.lots,'lots');
 unique(model.reservations,'reservations');unique(model.demands,'demands');unique(model.sequences,'sequences');
 if(!model.demands.length)fail('demands','不能用空需求创建成功模型');
 for(const r of model.resources){integer(r.capacity,r.id+'.capacity',1);nonempty(r.unit,r.id+'.unit');ranges(r.calendar,r.id+'.calendar');for(const x of r.calendar)if(x[1]===x[0])fail(r.id,'日历须为非空半开区间');}
 const allCoefficients=[];
 for(const t of model.tasks){
  integer(t.duration,t.id+'.duration',1);ranges(t.starts,t.id+'.starts');
  if(typeof t.required!=='boolean'||model.partialPolicy.kind==='all_required'&&!t.required)fail(t.id+'.required','必排性须显式且服从批准策略');
  unique(t.alternatives,t.id+'.alternatives');if(!t.alternatives.length)fail(t.id,'缺少合格资源候选');
  if(!Array.isArray(t.predecessors)||!Array.isArray(t.materialNeeds))fail(t.id,'缺少明确前序或投料声明');
  unique(t.materialNeeds,t.id+'.materialNeeds');
  for(const a of t.alternatives){
   if(!Array.isArray(a.uses)||!a.uses.length)fail(t.id,'任务缺少物理资源占用');
   for(const u of a.uses){if(!resources.has(u.resourceId))fail(t.id,'未知资源 '+u.resourceId);integer(u.amount,t.id+'.amount',1);integer(u.offset,t.id+'.offset',Number.MIN_SAFE_INTEGER);integer(u.duration,t.id+'.use.duration',1);allCoefficients.push(u.amount);}
   if(a.startQuota){const q=a.startQuota;if(!resources.has(q.resourceId))fail(t.id,'未知日投产资源');integer(q.amount,t.id+'.quota.amount',1);if(!Array.isArray(q.days)||new Set(q.days.map(x=>x[0])).size!==q.days.length)fail(t.id,'日容量缺失或重复');for(const pair of q.days){if(!Array.isArray(pair)||pair.length!==2)fail(t.id,'日容量格式错误');const [day,capacity]=pair;integer(day,'quota.day');integer(capacity,'quota.capacity');}allCoefficients.push(q.amount,...q.days.map(x=>x[1]));}
  }
  for(const p of t.predecessors){if(!tasks.has(p.taskId)||p.taskId===t.id)fail(t.id,'未知或自引用前序');integer(p.minLag,t.id+'.minLag');if(p.maxLag!==null){integer(p.maxLag,t.id+'.maxLag');if(p.maxLag<p.minLag)fail(t.id,'等待上下界冲突');}}
  if(t.fixed){integer(t.fixed.start,t.id+'.fixed.start');if(!t.alternatives.some(a=>a.id===t.fixed.alternativeId))fail(t.id,'锁定资源候选未知');if(!t.required)fail(t.id,'保护任务必须保留');}
  for(const n of t.materialNeeds){nonempty(n.materialId,t.id+'.materialId');integer(n.quantity,t.id+'.material.quantity',1);integer(n.feedOffset,t.id+'.feedOffset');if(!Array.isArray(n.eligibleLotIds)||new Set(n.eligibleLotIds).size!==n.eligibleLotIds.length||n.eligibleLotIds.some(id=>!lots.has(id)))fail(t.id,'物料批次候选缺失/重复/未知');allCoefficients.push(n.quantity);}
 }
 // Cycles are a compiler error, not a claim that the customer's business is
 // infeasible. Do not send recursive/invalid precedence to the native engine.
 const seen=new Set(),visiting=new Set(),byTask=new Map(model.tasks.map(t=>[t.id,t]));
 function visit(id){if(visiting.has(id))fail(id,'前序循环');if(seen.has(id))return;visiting.add(id);for(const p of byTask.get(id).predecessors)visit(p.taskId);visiting.delete(id);seen.add(id);}for(const id of tasks)visit(id);
 for(const l of model.lots){nonempty(l.materialId,l.id+'.materialId');integer(l.quantity,l.id+'.quantity');integer(l.reserved,l.id+'.reserved');if(l.reserved>l.quantity)fail(l.id,'批次已占用量超总量');if(typeof l.qualityEligible!=='boolean')fail(l.id,'质量资格未知');integer(l.ready,l.id+'.ready');integer(l.expiry,l.id+'.expiry');if(l.expiry<=l.ready)fail(l.id,'批次放行/失效区间无效');if(l.producer){if(!tasks.has(l.producer.taskId))fail(l.id,'制造供给前序不存在');integer(l.producer.releaseLag,l.id+'.releaseLag');integer(l.producer.shelfLife,l.id+'.shelfLife',1);}allCoefficients.push(l.quantity,l.reserved);}
 for(const r of model.reservations){if(!resources.has(r.resourceId))fail(r.id,'保留资源未知');integer(r.start,r.id+'.start',Number.MIN_SAFE_INTEGER);integer(r.end,r.id+'.end',Number.MIN_SAFE_INTEGER);integer(r.amount,r.id+'.amount',1);if(r.end<=r.start)fail(r.id,'保留区间为空');nonempty(r.source,r.id+'.source');allCoefficients.push(r.amount);}
 for(const d of model.demands){nonempty(d.unit,d.id+'.unit');integer(d.quantity,d.id+'.quantity',1);integer(d.completedQuantity,d.id+'.completed');if(d.completedQuantity>d.quantity)fail(d.id,'已完成量超需求');if(!Array.isArray(d.taskIds)||new Set(d.taskIds).size!==d.taskIds.length||d.taskIds.some(id=>!tasks.has(id)))fail(d.id,'需求任务映射未知/重复');if(d.completedQuantity<d.quantity&&!d.taskIds.length)fail(d.id,'剩余需求没有任务，不能零排成功');}
 for(const t of model.tasks)if(!model.demands.some(d=>d.taskIds.includes(t.id)))fail(t.id,'任务没有需求/剩余量归属');
 for(const s of model.sequences){
  if(!resources.has(s.resourceId)||model.resources.find(r=>r.id===s.resourceId).capacity!==1)fail(s.id,'有向清洗序列只接受显式独占资源，不把重量共享降级为独占');
  if(!Array.isArray(s.members)||!s.members.length||new Set(s.members.map(m=>m.taskId)).size!==s.members.length)fail(s.id,'清洗序列成员缺失或重复');
  if(!Array.isArray(s.transitions))fail(s.id,'缺少有向清洗矩阵');
  for(const m of s.members){const t=byTask.get(m.taskId);if(!t||!t.alternatives.some(a=>a.id===m.alternativeId))fail(s.id,'序列资源候选未知');nonempty(m.productId,s.id+'.productId');}
  const keys=new Set();for(const tr of s.transitions){const key=tr.from+'|'+tr.to;if(keys.has(key))fail(s.id,'有向清洗矩阵重复');keys.add(key);integer(tr.minutes,s.id+'.cleaning');integer(tr.people,s.id+'.cleaningPeople');if(tr.people>0&&!resources.has(tr.crewResourceId))fail(s.id,'清洗班组资源未知');nonempty(tr.source,s.id+'.cleaningSource');}
  for(const a of s.members)for(const b of s.members)if(a!==b&&!keys.has(a.productId+'|'+b.productId))fail(s.id,'缺少有向清洗规则 '+a.productId+'/'+b.productId);
 }
 const total=allCoefficients.reduce((n,x)=>n+BigInt(x),0n);if(total>BigInt(Number.MAX_SAFE_INTEGER))fail('coefficients','系数总量超过安全整数范围');
 // Freezing a deep copy prevents UI/request mutation from changing an in-flight model.
 const {modelHash:oldHash,...content}=model,modelHash=fingerprint(content);
 if(oldHash!==undefined&&oldHash!==modelHash)fail('modelHash','冻结模型指纹已变化');
 return {...structuredClone(content),modelHash};
}
