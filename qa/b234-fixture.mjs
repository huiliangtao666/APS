// Explicit integration simulation: all supplements are QA facts, never defaults.
import {materialScenario} from './b3-material-fixture.mjs';
export function jointMaterialScenario(){
 const d=materialScenario('UAT-05');d.tools[0]['可用数量']='1';d.personnelGroups[0]['人员数量']='1';
 d.resourceStops=[...[[180,210],[250,280]].map(([a,b],i)=>({'例外编号':'B234-T'+i,'资源类型':'工装','资源编号':'B3-TOOL','起始分钟':String(a),'结束分钟':String(b),'原因':'B234 explicit synthetic rescan boundary'})),...[[210,240],[280,300]].map(([a,b],i)=>({'例外编号':'B234-P'+i,'资源类型':'人员','资源编号':'B3-STAFF','起始分钟':String(a),'结束分钟':String(b),'原因':'B234 explicit synthetic rescan boundary'}))];
 d.downtime=[[240,250],[300,310]].map(([a,b])=>({'设备编号':'MIX02','起始分钟':String(a),'结束分钟':String(b),'原因':'B234 explicit synthetic rescan boundary'}));
 return d;
}
export function shiftedBomScenario(){
 const d=materialScenario('UAT-05');d.calendars[0]['结束分钟']='2000';d.tools[0]['可用结束分钟']='2000';d.personnelGroups[0]['可用结束分钟']='2000';
 d.supplies[0]['预计到达时间']='2026-11-03T10:00:00+08:00';d.supplies[0]['预计可用时间']='2026-11-03T11:00:00+08:00';
 d.bom.push(...d.bom.map(r=>({...r,'版本编号':'B234-NEXT-DAY-v2','生效日期':'2026-11-03','配置用量':r['配置用量']==='650'?'640':r['配置用量']==='150'&&r['物料编号']==='FAT'?'160':r['配置用量']})));
 return d;
}
