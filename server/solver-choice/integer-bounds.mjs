import {SolverProblem} from './contract.mjs';
export const INT64_MAX=(1n<<63n)-1n;
const MIN64=-(1n<<63n);
export function int64(value,path){if(typeof value==='number'&&!Number.isSafeInteger(value))throw new SolverProblem('CP_INTEGER_PROTOCOL','数值协议须为安全整数',{path,value});const x=BigInt(value);if(x<MIN64||x>INT64_MAX)throw new SolverProblem('CP_INT64_OVERFLOW','CP-SAT整数域或线性活动超出int64',{path,value:String(x),min:String(MIN64),max:String(INT64_MAX)});return x;}
export function activity(path,terms,constant=0n){
 let lo=BigInt(constant),hi=lo;int64(lo,path+'.constant');
 for(const {coefficient=1n,min=0n,max}of terms){const c=int64(coefficient,path+'.coefficient'),a=int64(min,path+'.domain.min'),b=int64(max,path+'.domain.max');if(a>b)throw new SolverProblem('CP_INTEGER_DOMAIN','变量上下界倒置',{path});lo+=c>=0n?c*a:c*b;hi+=c>=0n?c*b:c*a;}
 int64(lo,path+'.activity.min');int64(hi,path+'.activity.max');return {path,min:String(lo),max:String(hi)};
}
// BigInt is confined to this proof. Public model/candidate numeric fields stay
// safe JSON numbers; proof strings are descriptive, never handed to IntVar.
export function workbookIntegerBounds(m){
 const bounds=[],put=(path,terms,k=0n)=>bounds.push(activity(path,terms,k)),v=(max,coefficient=1n,min=0n)=>({max:BigInt(max),coefficient:BigInt(coefficient),min:BigInt(min)});
 const groups=new Map(m.groups.map(g=>[g.id,g])),tasks=new Map(m.tasks.map(t=>[t.id,t]));
 const hi=BigInt(m.window[1]),lo=BigInt(m.window[0]),span=hi-lo;
 for(const g of m.groups)for(const r of g.routes){
  put(g.id+'/'+r.id+'/routeConservation',[...r.taskIds.map(id=>v(tasks.get(id).maxQuantity)),v(g.maxQuantity,-1)]);
  for(const id of r.taskIds){const t=tasks.get(id);put(id+'/durationNumerator',[v(t.maxQuantity,r.durationRatio.n)],BigInt(r.durationRatio.d)-1n);put(id+'/durationEquation',[v(t.maxQuantity,r.durationRatio.n),v(BigInt(t.maxQuantity)*BigInt(r.durationRatio.n)+BigInt(r.durationRatio.d)-1n,-1)],BigInt(r.durationRatio.d)-1n);}
  put(g.id+'/'+r.id+'/waiting',[v(hi),v(hi,-1)],BigInt(r.maxLag??r.minLag));
 }
 const quotas=new Map(),resourceAmounts=new Map(m.resources.map(r=>[r.id,[]]));
 function addResource(id,max){resourceAmounts.get(id)?.push(v(max));}
 for(const t of m.tasks){
  const route=groups.get(t.groupId).routes.find(r=>r.id===t.routeId),s=route.source;
  put(t.id+'/timeEquation',[v(hi),v(hi,-1),v(span,-1)]);
  put(t.id+'/rawDuration',[v(span)],BigInt(s['固定准备分钟']));
  put(t.id+'/choices',t.options.map(()=>v(1)));
  for(const o of t.options){
   put(t.id+'/'+o.id+'/weight',[v(t.maxQuantity,o.weightMultiplier)]);
   addResource(o.resourceId,o.shared?BigInt(t.maxQuantity)*BigInt(o.weightMultiplier):1n);
   // At most three labor intervals are emitted (short, head, tail), each
   // optional. Count all domains, even mutually exclusive alternatives.
   for(let i=0;i<(s['人员参与方式']==='全程参与'?1:3);i++)addResource('crew:'+o.crewId,o.people);
   for(const tool of o.tools)addResource(tool,1);
   put(t.id+'/'+o.id+'/toolEnd',[v(hi)],BigInt(o.toolTail));
   for(const [day]of o.days){const key=o.resourceId+'|'+day;const q=quotas.get(key)||[];q.push(v(t.maxQuantity,o.weightMultiplier));quotas.set(key,q);}
  }
 }
 for(const d of m.demands)put(d.id+'/demand',[v(d.remaining)],BigInt(d.completedQuantity)+BigInt(d.protectedQuantity));
 put('nonzeroDemand',m.demands.filter(d=>d.remaining>0).map(d=>v(d.remaining)));
 for(const f of m.feeds){
  if(f.coefficient){const g=groups.get(f.groupId),c=f.coefficient;put(f.id+'/BOMEquation',[v(g.maxQuantity,c.n),v(f.maxQuantity,-BigInt(c.d))]);if(f.ceil)put(f.id+'/ceilNumerator',[v(g.maxQuantity,c.n)],BigInt(c.d)-1n);put(f.id+'/protected',[v(f.maxQuantity),v(f.maxQuantity,-1)],BigInt(f.protectedQuantity||0));}
  put(f.id+'/flowConservation',[...f.eligibleLotIds.map(()=>v(f.maxQuantity)),v(f.maxQuantity,-1)]);
  put(f.id+'/shelfTime',[v(hi)],BigInt(f.minShelfMinutes||0));
 }
 for(const l of m.lots){
  const claims=m.feeds.filter(f=>f.eligibleLotIds.includes(l.id)).map(f=>v(f.maxQuantity));
  put(l.id+'/lotAndFEFOClaims',[...claims,v(l.quantity,-1)],BigInt(l.reserved));
  put(l.id+'/manufacturedExpiry',[v(hi)],BigInt(l.shelfLife||0));
 }
 for(const w of m.metadata.frozenUrgent?.wipDaily||[]){const key=w.resourceId+'|'+w.day;quotas.set(key,[...(quotas.get(key)||[]),v(w.quantityScaled)]);}
 for(const [key,terms]of quotas)put(key+'/quota',terms);
 for(const s of m.sequences){
  // All ordered candidate pairs may create a cleaning interval. Bounds use
  // domains, not an assumption that their Boolean selectors are exclusive.
  for(const a of s.members)for(const b of s.members)if(a.taskId!==b.taskId){const rule=s.transitions.find(r=>r.from===a.productId&&r.to===b.productId);if(!rule)continue;put('clean/'+s.resourceId+'/'+a.taskId+'/'+b.taskId,[v(hi),v(hi,-1)],BigInt(rule.minutes));if(!s.shared)addResource(s.resourceId,1);if(rule.people)addResource('crew:'+a.crewId,rule.people);}
 }
 for(const r of m.reservations){addResource(r.resourceId,r.amount);put(r.id+'/reservation',[v(r.end)],-BigInt(r.start));}
 for(const [id,terms]of resourceAmounts)put(id+'/cumulativeDomainSum',terms);
 const maxTail=Math.max(0,...m.tasks.flatMap(t=>t.options.map(o=>o.toolTail))),maxClean=Math.max(0,...m.sequences.flatMap(s=>s.transitions.map(r=>r.minutes)));
 const endpointMax=hi+BigInt(maxTail),clean=BigInt(maxClean),length=endpointMax+clean;
 put('intervalLengthDomain',[v(length)]);
 put('intervalLengthEquation',[v(length),v(endpointMax,-1),v(endpointMax,1,-clean)]);
 return {contract:'workbook-integer-bounds:v1',protocol:'safe JSON numeric fields; BigInt proof only',nativeLimit:String(INT64_MAX),conservative:true,expressions:bounds};
}
