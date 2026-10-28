// Read-only presentation of saved output. Never reruns a scheduler or uses current inputs.
export const origin=Date.parse('2026-11-02T08:00:00+08:00');
export function timeLabel(minute){
 if(!Number.isFinite(minute))return '未知';
 const iso=new Date(origin+minute*60000+8*3600000).toISOString();
 return `${iso.slice(0,10)} ${iso.slice(11,19)}（分钟 ${minute}）`;
}
export function projection(task,minute){
 if(!Number.isFinite(task.start)||!Number.isFinite(task.end))return '未排 / 时间未知';
 if(minute===null||!Number.isFinite(minute))return '已排计划 · 执行未知';
 return `模拟时点推演：${minute<task.start?'未开始':minute<task.end?'进行中':'已结束'}（非执行事实）`;
}
export function timetable(plan){
 const input=plan?.inputSnapshot,assessment=plan?.resultAssessment?.tasks||[];
 const tasks=(plan?.tasks||[]).map(t=>{
  const a=assessment.find(a=>a.id===t.id);
  return {...t,quantity:a?.quantity??null,unit:a?.unit||'未知',quantityMeaning:a?.quantityMeaning||'数量口径未知',assessment:a,status:'scheduled',reasons:a?.reasons||[]};
 });
 for(const a of assessment)if(!tasks.some(t=>t.id===a.id))tasks.push({...a,machine:a.machineId||'',start:null,end:null,status:'unplanned',assessment:a,predecessor:'',source:'保存的未排原因快照'});
 const facts=plan?.execution?.facts||plan?.conditions?.executionSummary?.facts||input?.executionFacts||[];
 const reservations=plan?.resourceReservations||[];
 const downtime=(input?.downtime||[]).map(d=>({machine:d['设备编号'],start:Number(d['起始分钟']),end:Number(d['结束分钟']),reason:d['原因'],row:d}));
 const machines=[...new Set([...(input?.machines||[]).map(m=>m['设备编号']),...tasks.map(t=>t.machine),...facts.map(f=>f['当前设备']),...downtime.map(d=>d.machine)])].filter(Boolean);
 const points=[...tasks.flatMap(t=>[t.start,t.end]),...downtime.flatMap(d=>[d.start,d.end]),...reservations.flatMap(r=>[r.start,r.end]),...facts.flatMap(f=>[Number(f['开始分钟']),Number(f['完成分钟']||f['观测分钟'])])].filter(Number.isFinite);
 return {tasks,facts,reservations,downtime,machines,input,extent:[Math.min(0,...points),Math.max(120,...points)]};
}
export function filterTasks(tasks,{machine='',order='',state='',query='',start=-Infinity,end=Infinity,minute=null}={}){
 const q=query.trim().toLocaleLowerCase();
 return tasks.filter(t=>(!machine||t.machine===machine)&&(!order||t.orderId===order)&&(!state||t.status===state)&&(t.start===null||t.start<end&&t.end>start)&&(!q||[t.id,t.orderId,t.operation,t.label,t.machine,t.source,projection(t,minute),...t.reasons.map(r=>r.message)].join(' ').toLocaleLowerCase().includes(q)));
}
// Overlaps remain visible in separate sub-lanes; never inflate a short task's duration.
export function lanes(items){
 const ends=[],placed=[];
 for(const item of [...items].sort((a,b)=>a.start-b.start||a.end-b.end)){
  let lane=ends.findIndex(end=>end<=item.start);if(lane<0)lane=ends.length;
  ends[lane]=item.end;placed.push({...item,lane});
 }
 return {items:placed,count:Math.max(1,ends.length)};
}
export function clip(start,end,from,to,width){
 if(![start,end,from,to,width].every(Number.isFinite)||end<=start||to<=from||end<=from||start>=to)return null;
 return {left:(Math.max(start,from)-from)/(to-from)*width,width:(Math.min(end,to)-Math.max(start,from))/(to-from)*width};
}
