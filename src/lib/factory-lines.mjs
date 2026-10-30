/** Explicit 01 mapping. An absent key is legacy/unconfigured, never inferred.
 * Once explicitly saved, even [] must satisfy all existing references.
 * This registry grants no additional scheduling capability or timezone conversion.
 */
export function validateFactoryLines(data) {
 if (!Object.hasOwn(data,'factoryLines')) return [];
 const rows=data.factoryLines||[],issues=[];
 const add=(table,i,field,message)=>issues.push({table,row:i+2,field,message,file:({factoryLines:'01_工厂与产线配置.csv',machines:'03_设备资源配置.csv',orders:'17_生产订单与交期.csv',calendars:'02_工厂工作日历.csv'})[table]});
 const factories=new Map(),lines=new Map();
 rows.forEach((r,i)=>{
  for(const field of ['工厂编号','工厂名称','产线编号','产线名称','时区'])if(!r[field]?.trim())add('factoryLines',i,field,'字段不能为空，须显式填写');
  for(const field of ['工厂编号','产线编号'])if(r[field]!==r[field]?.trim())add('factoryLines',i,field,'编号不能含首尾空白');
  const zone=r['时区'];
  if(zone?.trim())try{if(zone!==zone.trim()||/^[+-]/.test(zone))throw Error();new Intl.DateTimeFormat('en',{timeZone:zone});}catch{add('factoryLines',i,'时区','须为有效 IANA 时区名称，不自动使用默认时区');}
  const old=factories.get(r['工厂编号']);
  if(old&&old['工厂名称']!==r['工厂名称'])add('factoryLines',i,'工厂名称','同一工厂编号的工厂名称须一致');
  factories.set(r['工厂编号'],r);lines.set(r['产线编号'],r);
 });
 for(const table of ['machines','orders'])(data[table]||[]).forEach((r,i)=>{
  if(!lines.has(r['产线编号']))add(table,i,'产线编号','引用未配置的产线编号 '+(r['产线编号']||'（空）'));
 });
 (data.calendars||[]).forEach((r,i)=>{if(!factories.has(r['工厂编号']))add('calendars',i,'工厂编号','引用未配置的工厂编号 '+r['工厂编号']);});
 (data.machines||[]).forEach((r,i)=>{
  const line=lines.get(r['产线编号']);if(!line)return;
  if((data.calendars||[]).some(c=>c['日历编号']===r['日历编号']&&c['工厂编号']!==line['工厂编号']))add('machines',i,'日历编号','设备日历的工厂与所属产线的工厂不一致');
 });
 return issues;
}

// Empty device calendar inherits only a unique calendar of its unique factory.
export function inheritedCalendarId(data,machine) {
 const explicit=machine?.['日历编号']?.trim();if(explicit)return explicit;
 const factories=[...new Set((data.factoryLines||[]).filter(r=>r['产线编号']===machine?.['产线编号']).map(r=>r['工厂编号']).filter(Boolean))];
 if(factories.length!==1)return '';
 const ids=[...new Set((data.calendars||[]).filter(r=>r['工厂编号']===factories[0]).map(r=>r['日历编号']).filter(Boolean))];
 return ids.length===1?ids[0]:'';
}
