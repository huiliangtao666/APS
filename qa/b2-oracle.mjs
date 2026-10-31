import assert from 'node:assert/strict';
// Independent integer event oracle: no scheduler, staffing, policy checker or load helper.
export function occupancyOracle(plan,data){
 const groups=data.personnelGroups||[],pools=data.personnelPools||[],tools=data.tools||[],rows=plan.resourceReservations||[],result=[];
 const check=(kind,id,used,capacityAt,extra=[])=>{
  const points=[...new Set([...used.flatMap(r=>[r.start,r.end]),...extra])].sort((a,b)=>a-b);let peak=0,minutes=0;
  for(let i=0;i<points.length-1;i++){
   const t=points[i],total=used.filter(r=>r.start<=t&&t<r.end).reduce((n,r)=>n+Number(r.quantity),0),capacity=capacityAt(t);
   assert.ok(Number.isSafeInteger(total)&&total>=0&&total<=capacity,`${kind} ${id} t=${t}: ${total}>${capacity}`);peak=Math.max(peak,total);minutes+=total*(points[i+1]-t);
  }
  result.push({kind,id,peak,minutes});
 };
 for(const t of tools)check('工装',t['工装编码'],rows.filter(r=>r.type==='工装'&&r.resourceId===t['工装编码']),()=>Number(t['可用数量']));
 for(const g of groups)check('人员组',g['人员组编号'],rows.filter(r=>r.type==='人员'&&r.resourceId===g['人员组编号']),()=>Number(g['人员数量']));
 for(const p of pools)check('物理池',p.poolId,rows.filter(r=>r.type==='人员'&&groups.find(g=>g['人员组编号']===r.resourceId)?.poolId===p.poolId),t=>p['交接模式']==='窗口容量上限'&&t>=Number(p['交接起始分钟'])&&t<Number(p['交接结束分钟'])?Number(p['交接容量人数']):Number(p['总人数']),p['交接模式']==='窗口容量上限'?[Number(p['交接起始分钟']),Number(p['交接结束分钟'])]:[]);
 for(const r of rows)assert.ok(r.end>r.start,'positive half-open occupancy');
 for(const task of plan.tasks){
  const machine=data.machines.find(m=>m['设备编号']===task.machine);assert.ok(machine);
  for(const other of plan.tasks)if(task.id!==other.id&&task.machine===other.machine)assert.ok(task.end<=other.start||other.end<=task.start,'machine overlap');
  if(task.predecessor){const previous=plan.tasks.find(t=>t.id===task.predecessor);if(previous)assert.ok(previous.end<=task.start,'precedence');}
 }
 return result;
}
