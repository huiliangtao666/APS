import {seed} from '../server/planner.ts';
export const originalKeys=['factoryLines','orders','routes','times','machines','dependencies','rules'];
export const fourKeys=['factoryLines','calendars','machines','downtime'];
export const nineKeys=[...originalKeys,'calendars','downtime'];
export function calendarBatch({newReferences=false}={}){
 const d=structuredClone(seed);
 d.factoryLines=[{'工厂编号':'F01','工厂名称':'显式模拟工厂','产线编号':'L01','产线名称':'显式模拟产线','时区':'Asia/Shanghai'}];
 d.calendars[0]['日历编号']='BATCH-C02';
 d.calendars[0]['说明']='日历说明第一行\n日历说明第二行';
 d.machines.forEach(r=>r['日历编号']='BATCH-C02');
 // A new machine is referenced by the new downtime file, not by stored data.
 d.machines.push({...d.machines[0],'设备编号':'BATCH-M04','设备名称':'批次新设备'});
 d.downtime=[{'设备编号':'BATCH-M04','起始分钟':'30','结束分钟':'60','原因':'检修,"原文"\n第二物理行'}, {'设备编号':'BATCH-M04','起始分钟':'90','结束分钟':'120','原因':'第二段'}];
 if(newReferences){
  Object.assign(d.factoryLines[0],{'工厂编号':'BATCH-F01','产线编号':'BATCH-L01'});
  d.calendars[0]['工厂编号']='BATCH-F01';
  for(const r of [...d.machines,...d.orders])r['产线编号']='BATCH-L01';
 }
 return d;
}
