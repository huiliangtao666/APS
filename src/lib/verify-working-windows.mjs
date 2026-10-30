// P06 fixed-output checker. Deliberately does not import scheduling window,
// preview, allocation or search helpers. Uses only original frozen rows.
export function verifyWorkingWindows(plan,data,conditions){
 if(!conditions?.workingWindowsContract)return [];
 if(conditions.workingWindowsContract!=='P06-windows-v1'||plan.workingWindowsContract!==conditions.workingWindowsContract)return ['P06工作窗口冻结契约缺失或未知'];
 if(!Array.isArray(data?.resourceStops))return ['P06冻结输入缺少人员/工装停用例外表'];
 const errors=[];
 for(const r of data.resourceStops){
  const key=r?.['资源类型']==='人员'?'人员组编号':'工装编码',table=r?.['资源类型']==='人员'?data.personnelGroups:r?.['资源类型']==='工装'?data.tools:[];
  if(!r||!['人员','工装'].includes(r['资源类型'])||!(table||[]).some(x=>x[key]===r['资源编号'])||!['起始分钟','结束分钟'].every(k=>/^\d+$/.test(r[k]||'')&&Number.isSafeInteger(Number(r[k]))&&Number(r[k])<=525600)||Number(r['结束分钟'])<=Number(r['起始分钟']))errors.push('P06冻结资源停用例外结构、引用或区间无效');
 }
 const tasks=plan.tasks||[],ledger=plan.resourceReservations||[];
 function check(type,id,start,end,task){
  const machine=(data.machines||[]).find(m=>m['设备编号']===task.machine),calendar=machine?.['日历编号']?.trim()||data.calendars?.[0]?.['日历编号'];
  const rows=(data.calendars||[]).filter(r=>r['日历编号']===calendar);
  // A union of two adjacent shifts is not a complete noninterruptible window.
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!rows.some(r=>r['是否工作']==='是'&&Number(r['起始分钟'])<=start&&Number(r['结束分钟'])>=end))errors.push(`${task.id} ${type} ${id} [${start},${end}) 不在单个冻结工厂工作窗口内，禁止跨班拼接`);
  const exceptions=[...rows.filter(r=>r['是否工作']!=='是'),...data.resourceStops.filter(r=>r['资源类型']===type&&r['资源编号']===id),...(type==='设备'?(data.downtime||[]).filter(r=>r['设备编号']===id):[])];
  for(const r of exceptions)if(Number(r['起始分钟'])<end&&Number(r['结束分钟'])>start)errors.push(`${task.id} ${type} ${id} [${start},${end}) 与冻结非工作/停用例外 [${r['起始分钟']},${r['结束分钟']}) 冲突：${r['原因']||r['说明']||'非工作'}`);
 }
 for(const t of tasks){
  if((data.executionFacts||[]).some(f=>f['订单编号']===t.orderId&&f['工序编号']===t.operation&&f['状态']==='已完成'))continue;
  check('设备',t.machine,t.start,t.end,t);
 }
 for(const r of ledger.filter(r=>['人员','工装'].includes(r.type))){
  for(const id of r.taskIds||[r.taskId]){const t=tasks.find(t=>t.id===id);if(t)check(r.type,r.resourceId,r.start,r.end,t);}
 }
 return [...new Set(errors)];
}
