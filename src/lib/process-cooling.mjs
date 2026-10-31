import {quantityMath as Q} from './material-allocation.mjs';

// Executable v0.3 heat/cool slice, deliberately separate from the shared planner.
// Members are already established production batches. This never splits a production
// batch, allocates material, changes a recipe, rounds quantities or commits state.
export const coolingContract = 'v0.3-process-cooling-v1';
const minute = n => Number.isSafeInteger(n) && n >= 0;
const qty = x => {
 const q = x && typeof x === 'object' ? Q.fromExact(x) : Q.q(x);
 if(q.n < 0n || q.d <= 0n || !Number.isFinite(Q.num(q)))throw Error('数量须为非负有限精确数');
 return q;
};
const positive = x => {const q=qty(x);if(Q.cmp(q,Q.zero)<=0n)throw Error('数量须大于0');return q;};
const sum = (rows,key) => rows.reduce((s,r)=>Q.add(s,qty(r[key])),Q.zero);
const over = (a,b) => Q.cmp(a,b)>0n;
const signature = m => JSON.stringify([m.productId,m.recipeKey,m.routeKey,m.program,m.heatOperation,m.coolOperation,m.heatMachine,m.heatDuration,m.minimumInputKg,m.maximumInputKg]);
const inside = (windows,start,end) => windows.some(([a,b])=>a<=start&&end<=b);
const overlap = (a,b) => a.start<b.end && b.start<a.end;
const intersect = (a,b) => a.flatMap(([s,e])=>b.map(([x,y])=>[Math.max(s,x),Math.min(e,y)]).filter(([x,y])=>y>x));

function validate(m) {
 for(const k of ['id','orderId','productId','recipeKey','routeKey','program','heatOperation','coolOperation','heatMachine','coolMachine','spaceId'])if(typeof m[k]!=='string'||!m[k].trim())throw Error(`缺少 ${k}`);
 if(m.heatOperation===m.coolOperation||m.heatMachine===m.coolMachine)throw Error('本切片须为不同设备上的顺序加工/冷却工序');
 for(const k of ['readyMinute','maxWait'])if(!minute(m[k]))throw Error(`${k} 须为显式非负整数分钟`);
 for(const k of ['heatDuration','coolDuration'])if(!minute(m[k])||m[k]===0)throw Error(`${k} 须为正整数固定分钟`);
 positive(m.inputKg);positive(m.outputKg);positive(m.spaceCapacityKg);positive(m.maximumInputKg);qty(m.minimumInputKg);
 if(over(qty(m.minimumInputKg),qty(m.maximumInputKg)))throw Error('最小装载超过最大装载');
 for(const k of ['heatWindows','coolWindows'])if(!Array.isArray(m[k])||m[k].some(w=>!Array.isArray(w)||w.length!==2||!w.every(minute)||w[1]<=w[0]))throw Error(`${k} 须为完整允许窗口，不能跨窗口拼接`);
}

// Full-interval event scan: a later reservation start can invalidate a candidate.
// Input and output remain exact rationals. End events release before start events.
function slot(windows,earliest,duration,resource,quantity,capacity,reservations,horizon) {
 let candidate=earliest;
 for(let attempt=0;attempt<1000;attempt++){
  const fits=windows.map(([a,b])=>Math.max(a,candidate)).filter(s=>s+duration<=horizon&&inside(windows,s,s+duration));
  if(!fits.length)return {ok:false,code:'WINDOW_OR_HORIZON',message:`${resource} 无连续 ${duration} 分钟窗口`};
  const start=Math.min(...fits),end=start+duration;
  const same=reservations.filter(r=>r.resource===resource&&overlap(r,{start,end}));
  const points=[start,...same.filter(r=>r.start>start&&r.start<end).map(r=>r.start)];
  const conflict=points.find(t=>over(same.filter(r=>r.start<=t&&r.end>t).reduce((s,r)=>Q.add(s,qty(r.quantity)),quantity),capacity));
  if(conflict===undefined)return {ok:true,start,end};
  const ends=same.filter(r=>r.start<=conflict&&r.end>conflict).map(r=>r.end).filter(t=>t>start);
  if(!ends.length)return {ok:false,code:'CAPACITY',message:`${resource} 单任务需求超过容量`};
  candidate=Math.min(...ends);
 }
 return {ok:false,code:'SEARCH_LIMIT',message:'候选搜索达到1000次；不表示全局无解'};
}

function place(group,reservations,horizon,attempts) {
 const first=group[0],input=sum(group,'inputKg');
 // Search the complete common window, including a later intersection. Rejecting
 // the first member's earliest slot can lose a feasible under-min combined load.
 const heatWindows=group.reduce((windows,m)=>intersect(windows,m.heatWindows),first.heatWindows);
 if(over(input,qty(first.maximumInputKg))||over(qty(first.minimumInputKg),input))return {ok:false,code:'HEAT_LOAD',message:'资源批投入超出显式装载上下限；未超产补满'};
 // If all cooling intervals must overlap even at maximum permitted staggering,
 // this group cannot fit. Split the heat resource batch, retain production IDs.
 for(const m of group){
  const peers=group.filter(x=>x.spaceId===m.spaceId);
  if(Math.min(...peers.map(x=>x.coolDuration))>Math.max(...peers.map(x=>x.maxWait))&&over(sum(peers,'outputKg'),qty(m.spaceCapacityKg)))return {ok:false,code:'COOL_GROUP_CAPACITY',message:`同出炉产出超过 ${m.spaceId} 容量，且在最大等待内无法错开冷却；须拆炉`};
  const same=group.filter(x=>x.coolMachine===m.coolMachine);
  if(same.length>1&&Math.min(...same.map(x=>x.coolDuration))>Math.max(...same.map(x=>x.maxWait)))return {ok:false,code:'COOL_MACHINE',message:'同出炉任务共用独占冷却设备，最大等待内无法串行；须拆炉'};
 }
 let candidate=Math.max(...group.map(m=>m.readyMinute));
 for(let attempt=0;attempt<1000;attempt++){
  const heat=slot(heatWindows,candidate,first.heatDuration,'machine:'+first.heatMachine,Q.q('1'),Q.q('1'),reservations,horizon);
  if(!heat.ok)return heat;
  if(group.some(m=>!inside(m.heatWindows,heat.start,heat.end)))return {ok:false,code:'GROUP_WINDOWS',message:'合炉成员没有共同完整加工窗口；保留单批候选'};
  const local=[],cools=[];let shift=0;
  for(const m of group){
   // Intersect the two resource checks by repeatedly advancing the same candidate.
   let earliest=heat.end,cool=null;
   for(let j=0;j<1000;j++){
    const machine=slot(m.coolWindows,earliest,m.coolDuration,'machine:'+m.coolMachine,Q.q('1'),Q.q('1'),[...reservations,...local],horizon);
    if(!machine.ok)return machine;
    const space=slot(m.coolWindows,machine.start,m.coolDuration,'space:'+m.spaceId,qty(m.outputKg),qty(m.spaceCapacityKg),[...reservations,...local],horizon);
    if(!space.ok)return space;
    if(space.start===machine.start){cool=space;break;}
    earliest=space.start;
   }
   if(!cool)return {ok:false,code:'SEARCH_LIMIT',message:'冷却联合候选达到搜索边界；不表示全局无解'};
   if(cool.start-heat.end>m.maxWait){shift=cool.start-heat.end;attempts.push({code:'SHIFT_UPSTREAM',memberId:m.id,heatStart:heat.start,heatEnd:heat.end,coolStart:cool.start,maxWait:m.maxWait,message:'只推迟冷却将超等待；重新寻找上游完整加工窗口'});break;}
   cools.push({member:m,...cool});
   local.push({resource:'machine:'+m.coolMachine,memberId:m.id,operation:m.coolOperation,quantity:'1',start:cool.start,end:cool.end},{resource:'space:'+m.spaceId,memberId:m.id,operation:m.coolOperation,quantity:m.outputKg,start:cool.start,end:cool.end});
  }
  if(shift){candidate=heat.start+shift;continue;}
  return {ok:true,heat,cools,reservations:[{resource:'machine:'+first.heatMachine,quantity:'1',start:heat.start,end:heat.end},...local]};
 }
 return {ok:false,code:'SEARCH_LIMIT',message:'加工/冷却联动达到1000次；不表示全局无解'};
}

/** Pure proposal. All members and resource reservations are immutable inputs.
 * The integrator must jointly preview material/personnel/tooling at every changed
 * time, then atomically commit the whole proposal. A proposal is not a Plan PASS.
 */
export function scheduleCoolingPairs({members,reservations=[],endMinute}) {
 const tasks=[],groups=[],findings=[],attempts=[],accepted=[],seen=new Set();
 if(!Array.isArray(members)||!minute(endMinute))throw Error('须显式提供成员及计划结束分钟');
 if(!Array.isArray(reservations)||reservations.some(r=>!r.resource||!minute(r.start)||!minute(r.end)||r.end<=r.start))throw Error('资源原账区间无效');
 for(const r of reservations)positive(r.quantity);
 const resourceContracts=new Map();
 for(const m of members){
  try{
   validate(m);if(seen.has(m.id))throw Error('生产批编号重复');seen.add(m.id);
   for(const [key,value]of [['heat:'+m.heatMachine,[m.minimumInputKg,m.maximumInputKg]],['space:'+m.spaceId,[m.spaceCapacityKg]]]){
    const exact=JSON.stringify(value.map(v=>Q.exact(Q.add(qty(v),Q.zero))));
    if(resourceContracts.has(key)&&resourceContracts.get(key)!==exact)throw Error(`资源 ${key} 容量配置冲突`);
    resourceContracts.set(key,exact);
   }
   accepted.push(m);
  }catch(e){findings.push({code:'BLOCKED / PROCESS_COOLING_CONFIG',memberIds:[m?.id||''],message:e.message});}
 }
 // A conflicting physical capacity invalidates the complete proposal, not merely
 // the last member (which would let the earlier conflicting capacity win).
 if(findings.length)return {contract:coolingContract,scope:'process-cooling-only',integrated:false,tasks,groups,reservations:[],findings,attempts};
 const pending=[...accepted],busy=structuredClone(reservations);
 while(pending.length){
  const first=pending[0];let group=[first];
  for(const m of pending.slice(1))if(signature(m)===signature(first)&&!over(Q.add(sum(group,'inputKg'),qty(m.inputKg)),qty(first.maximumInputKg)))group.push(m);
  let result;
  while(group.length){
   result=place(group,busy,endMinute,attempts);
   if(result.ok)break;
   attempts.push({code:result.code,memberIds:group.map(m=>m.id),message:result.message});
   if(group.length===1)break;
   group=group.slice(0,-1);
  }
  if(!result.ok){findings.push({code:'UNPLANNED / '+result.code,memberIds:[first.id],message:result.message+'；本候选未占用设备、空间或物料'});pending.splice(0,1);continue;}
  const id='PC-RB-'+(groups.length+1),heatResourceBatchId=JSON.stringify([id,first.heatOperation]);
  groups.push({id,heatResourceBatchId,memberIds:group.map(m=>m.id),exactInputKg:Q.exact(sum(group,'inputKg')),exactOutputKg:Q.exact(sum(group,'outputKg')),program:first.program,heatStart:result.heat.start,heatEnd:result.heat.end});
  for(const c of result.cools){const m=c.member;
   const common={orderId:m.orderId,productId:m.productId,productionBatchId:m.id,quantity:Q.num(qty(m.outputKg)),quantityUnit:'kg',exactQuantity:Q.exact(qty(m.outputKg)),exactLoadKg:Q.exact(qty(m.inputKg)),source:coolingContract};
   const heatId=JSON.stringify([m.id,m.heatOperation]);
   tasks.push({...common,id:heatId,operation:m.heatOperation,machine:m.heatMachine,start:result.heat.start,end:result.heat.end,duration:m.heatDuration,resourceBatchId:heatResourceBatchId,predecessor:m.predecessorTaskId||'',program:m.program,loadBasis:'BOM总投入'},
    {...common,id:JSON.stringify([m.id,m.coolOperation]),operation:m.coolOperation,machine:m.coolMachine,start:c.start,end:c.end,duration:m.coolDuration,resourceBatchId:JSON.stringify([m.id,m.coolOperation]),predecessor:heatId,exactLoadKg:Q.exact(qty(m.outputKg)),loadBasis:'合格产出',maxWait:m.maxWait,spaceId:m.spaceId});
  }
  busy.push(...result.reservations.map(r=>({...r,resourceBatchId:r.memberId?JSON.stringify([r.memberId,r.operation]):heatResourceBatchId,taskIds:r.memberId?[JSON.stringify([r.memberId,r.operation])]:group.map(m=>JSON.stringify([m.id,m.heatOperation]))})));for(const m of group)pending.splice(pending.indexOf(m),1);
 }
 return {contract:coolingContract,scope:'process-cooling-only',integrated:false,tasks,groups,reservations:busy.slice(reservations.length),findings,attempts};
}
