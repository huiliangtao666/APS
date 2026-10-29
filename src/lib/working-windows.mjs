// P06: keep each factory work row separate; subtract exceptions, never bridge shifts.
export function allowedWindows(data,calendarId,type,id,from=0,until=525600){
 const calendar=(data.calendars||[]).filter(r=>r['日历编号']===calendarId);
 const stops=[...calendar.filter(r=>r['是否工作']!=='是'),...(data.resourceStops||[]).filter(r=>r['资源类型']===type&&r['资源编号']===id),...(type==='设备'?(data.downtime||[]).filter(r=>r['设备编号']===id):[])].map(r=>[Number(r['起始分钟']),Number(r['结束分钟'])]);
 return calendar.filter(r=>r['是否工作']==='是').flatMap(r=>{
  let pieces=[[Math.max(from,Number(r['起始分钟'])),Math.min(until,Number(r['结束分钟']))]].filter(([a,b])=>b>a);
  for(const [a,b] of stops)pieces=pieces.flatMap(([s,e])=>a<e&&b>s?[[s,Math.min(e,a)],[Math.max(s,b),e]].filter(([x,y])=>y>x):[[s,e]]);
  return pieces;
 }).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
export function windowFit(windows,start,end){
 if(windows.some(([a,b])=>a<=start&&end<=b))return {ok:true};
 const duration=end-start,next=windows.map(([a,b])=>Math.max(start,a)).filter(s=>s>start&&windows.some(([a,b])=>a<=s&&s+duration<=b));
 return {ok:false,nextStart:next.length?Math.min(...next):undefined};
}
