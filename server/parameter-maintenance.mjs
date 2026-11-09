import {resolveFactoryCalendar,chinaCalendarSource} from './factory-calendar.mjs';
import {parameterCatalog,businessDefinition,atomicFields,sourceTable,isImmutable,canMaintainParameter,parameterSpec,objectKey,scopeFor,scopeOf,sourceRole,canonicalCp,cpOf,effectiveParameters,blockedParameter,changeParameter} from './parameter-contract.mjs';
import {parameterHelp} from './parameter-help.mjs';
import {sourceFields} from './parameter-source-fields.mjs';
import {capacityParameterTabs,isCapacityParameter} from './capacity-parameter-collection.mjs';
export const parameterTabs=[['global','01 全局与排程'],['material','02 物料与SKU'],['bom','03 BOM与损耗'],['customer','04 客户与交付'],['supplier','05 供应商与采购'],['resource','06 设备与工装'],['route','07 工艺与工序'],['crew','08 班组人员'],['calendar','09 工厂日历'],['storage','10 库区与仓储'],['rules','11 规则与其他']].map(([id,label])=>({id,label}));
const tableTabs={'物料主数据':'material','单位换算':'material','物料清单':'bom','每日需求':'customer','客户与交付':'customer','供应商与供货条件':'supplier','设备与工装':'resource','工艺路线':'route','班组资源':'crew','工厂日历':'calendar','停机安排':'calendar','库区库位':'storage','期初库存':'storage'};
const tableKeys={'物料主数据':'物料编号','物料清单':'用量关系编号','每日需求':'需求编号','客户与交付':'客户编号','供应商与供货条件':'供货关系编号','设备与工装':'资源编号','工艺路线':'路线工序编号','班组资源':'班组编号','工厂日历':'日序','停机安排':'停机编号','库区库位':'库位编号','期初库存':'库存批次编号','单位换算':'_unitKey'};
export const parameterMaintenanceUnit=(spec,row)=>spec.unit||(/计划起始日/.test(spec.name)?'日序':/每箱净重/.test(spec.name)?'千克/箱':/每件净重/.test(spec.name)?'千克/件':spec.name==='标准日产能千克'?'千克/标准日':spec.name==='最大容量'?(row['容量单位']||''):/最小订货量|订货倍数|子项基准用量/.test(spec.name)?(row['数量单位']||'本行数量单位'):/优先级/.test(spec.name)?'顺序':spec.name==='换算系数'?'比例':/班次|分母/.test(spec.name)?'班/天':/人数/.test(spec.name)?'人':/套数/.test(spec.name)?'套':spec.name==='可用数量'?(row['资源类别']==='工装'?'套':'个'):/比例|收率|参考率/.test(spec.name)?'比例':/天数/.test(spec.name)?'天':/千克/.test(spec.name)?'千克':/温度/.test(spec.name)?'摄氏度':'');
const compare=(a,b)=>String(a??'').localeCompare(String(b??''),'zh-CN',{numeric:true});
const date=(d,n)=>new Date(Date.parse((d.dayZero||'2026-10-31')+'T00:00:00Z')+Number(n)*86400000).toISOString().slice(0,10);
const specsFor=cp=>atomicFields.filter(f=>f.cp===canonicalCp(cp));
function specTab(spec){if(spec.cp==='CP129')return 'calendar';return spec.global||spec.calendarGlobal?'global':tableTabs[spec.table]||'rules';}
function tabsFor(cp){const fields=specsFor(cp),tabs=fields.map(specTab);if(!tabs.length)tabs.push(tableTabs[sourceTable(cp)]||(Number(cp.slice(2))<=10?'global':'rules'));return [...new Set(tabs)];}
export function parameterBaseline(d){const sources=(d.parameterSources||[]).filter(s=>s.mode==='dataset'),p=d.parameterBaseline||sources.at(-1);return p?{...p,version:p.version||new Set(sources.map(s=>s.fileHash)).size,label:'P'+(p.version||new Set(sources.map(s=>s.fileHash)).size)}:{label:'尚未导入配置参数',version:0,fileHash:null};}
export function parameterHistory(d,q={},actor=''){
 const scope=scopeFor(d,q.scope,actor),offset=Math.max(0,Number(q.offset)||0),limit=Math.min(100,Math.max(1,Number(q.limit)||25));
 const logged=new Set((d.parameterChangeLog||[]).flatMap(r=>[r.before?.['参数编号'],r.after?.['参数编号']]).filter(Boolean));
 const legacy=(d.tables['配置参数']||[]).filter(p=>sourceRole(p)==='EDIT'&&!logged.has(p['参数编号'])).map(p=>({id:'legacy:'+p['参数编号']+':'+p['生效日'],legacy:true,actor:p._source?.actor,at:(d.overlay||[]).find(o=>o.version===p._source?.version)?.at,cp:cpOf(p),object:p['对象编号'],field:p['参数名称'],scope:scopeOf(p),operation:'历史在线值',before:null,after:p}));
 const records=[...legacy,...(d.parameterChangeLog||[])].filter(r=>(q.collection!=='capacity'||isCapacityParameter(r.cp)||['工艺路线','设备与工装','班组资源','工厂日历','停机安排','物料主数据','物料清单','单位换算'].includes(r.table))&&(r.scope==='dataset'||r.scope===scope)&&(!r.trial||r.actor===actor)&&(!q.cp||r.cp===q.cp)&&(!q.object||r.object===q.object)).slice().reverse();
 return {records:records.slice(offset,offset+limit),total:records.length,offset,parameterRevision:d.parameterRevision||0,baseline:parameterBaseline(d)};
}
export function parameterMaintenanceView(d,q={},actor=''){
 const day=Number(q.day??0);if(!Number.isInteger(day)||day<0||day>=44)throw Error('查看日期超出数据范围');
 const located=[...(d.tables['配置参数']||[]),...(d.parameterCandidates||[])].find(p=>p['参数编号']===q.q&&(scopeOf(p)==='dataset'||scopeOf(p)===q.scope));
 const tabs=q.collection==='capacity'?capacityParameterTabs:parameterTabs;
 const scope=scopeFor(d,q.scope,actor),tab=located&&(!q.collection||q.collection!=='capacity'||isCapacityParameter(cpOf(located)))?tabsFor(cpOf(located))[0]:tabs.some(t=>t.id===q.tab)?q.tab:q.collection==='capacity'?'route':'global',list=['global','rules'].includes(tab);
 const definitions=parameterCatalog.filter(c=>(q.collection!=='capacity'||isCapacityParameter(c['参数编号']))&&tabsFor(c['参数编号']).includes(tab)&&(!q.step||c['流程步骤入口'].includes(q.step))).map(c=>({...businessDefinition(d,c['参数编号']),fields:specsFor(c['参数编号']).filter(f=>specTab(f)===tab),sourceTables:[...new Set([sourceTable(c['参数编号']),...specsFor(c['参数编号']).map(f=>f.table)].filter(Boolean))],immutable:!canMaintainParameter(d,c['参数编号'])})).sort((a,b)=>compare(a['参数编号'],b['参数编号']));
 const selected=located?definitions.find(c=>canonicalCp(c['参数编号'])===canonicalCp(cpOf(located))):q.cp&&definitions.find(c=>c['参数编号']===q.cp)||(!list?definitions[0]:undefined),chosen=selected?[selected]:definitions;
 const raw=[...(d.tables['配置参数']||[]),...(d.parameterCandidates||[])].filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope);
 const chosenCps=new Set(chosen.map(c=>canonicalCp(c['参数编号']))),activeSource={tables:{配置参数:raw.filter(p=>chosenCps.has(canonicalCp(cpOf(p)))||tab==='calendar'&&(cpOf(p)==='CP129'||p['参数名称']==='生产班次数'))}};
 const activeCache=new Map(),getActive=at=>{if(!activeCache.has(at))activeCache.set(at,new Map(effectiveParameters(activeSource,at,scope).map(p=>[[canonicalCp(cpOf(p)),p['对象编号'],p['参数名称'],parameterSpec(p)?.table||'global'].join('|'),p])));return activeCache.get(at);};
 const baseFields=new Map((d.parameterBaseFields||[]).map(b=>[[b.table,b.object,b.field].join('|'),b]));
 const index=new Map();for(const p of raw){const key=[canonicalCp(cpOf(p)),p['对象编号'],p['参数名称']].join('|');const bucket=index.get(key)||[];bucket.push(p);index.set(key,bucket);}
 const records=[],helpByField={};
 for(const c of chosen){
  const cp=c['参数编号'],fields=c.fields.length?c.fields:sourceFields(cp,d)||[{name:c['中文配置项'],table:sourceTable(cp),key:tableKeys[sourceTable(cp)],readonly:true}];
  for(const [fieldOrder,spec] of fields.entries()){
   helpByField[cp+'|'+spec.name]=parameterHelp(c,spec,{productionContract:d.productionContract});
   const table=spec.table,key=spec.key||tableKeys[table],source=table?(d.tables[table]||[]):[{GLOBAL:'GLOBAL'}];
   const objects=source.length?source:[{[key||'GLOBAL']:table?'未提供对象':'GLOBAL',_missing:true}];
   for(const row of objects){
    const object=table?objectKey(row,{...spec,key}):spec.calendarGlobal?'CAL':'GLOBAL',at=table==='工厂日历'&&Number.isInteger(Number(object))?Number(object):day;
    const matches=index.get([canonicalCp(cp),object,spec.name].join('|'))||[];
    const reference=spec.candidate&&matches.filter(p=>p._candidate&&Number(p['生效日'])<=at&&at<Number(p['失效日'])).sort((a,b)=>Number(sourceRole(a)==='EDIT')-Number(sourceRole(b)==='EDIT')).at(-1);
    const winner=reference||getActive(at).get([canonicalCp(cp),object,spec.name,table||'global'].join('|'));
    const pSource=matches.find(p=>sourceRole(p)==='P'&&Number(p['生效日'])<=at&&at<Number(p['失效日']));
    const base=baseFields.get([table,object,spec.name].join('|')),literal=base?(base.present?base.value:undefined):spec.value??row[spec.name];
    const calendarInfo=table==='工厂日历'&&!row._missing?resolveFactoryCalendar(d,row,[...getActive(at).values()]):undefined;
    const blocked=winner&&blockedParameter(winner),value=blocked?undefined:winner?.['参数值']??(spec.name==='是否开工'?calendarInfo?.mode:literal),missing=value===undefined||value===null||value==='';
    const name=spec.calendarGlobal?'工厂':String(row['物料名称']||row['成品名称']||row['客户名称']||row['资源名称']||row['工序名称']||row['班组名称']||row['库位名称']||row['供应商名称']||object);
    const context=table==='物料清单'?{'清单版本':row['清单版本编号'],'父项':(row['父项编号']||'')+' '+(row['父项名称']||''),'子项':(row['子项编号']||'')+' '+(row['子项名称']||'')}:undefined;
    const editable=!row._missing&&!spec.readonly&&canMaintainParameter(d,cp)&&(scope==='dataset'||!spec.sharedOnly);
    const status=blocked?'待补充':missing?'未维护':spec.candidate?'参考资料，未参与排程':winner?'当前有效':spec.relation?'业务来源':c.immutable||spec.readonly?'只读':'业务基础值';
    records.push({...winner,missingObject:!!row._missing,_fieldOrder:fieldOrder,cp,definition:c,recordKey:[cp,table||'global',object,spec.name].join('|'),'参数编号':winner?.['参数编号'],'参数名称':spec.name,'对象编号':object,'对象名称':name,'参数值':missing?undefined:value,'单位':winner?.['单位']||pSource?.['单位']||parameterMaintenanceUnit(spec,row),
     '生效日':winner?.['生效日']??'0','失效日':winner?.['失效日']??'44',objectTable:table||'global',objectDate:table==='工厂日历'&&!row._missing?date(d,object):undefined,
     calendarInfo,context,sourceEditable:!!spec.relation&&!row._missing&&scope==='dataset',effectiveValue:missing?undefined:value,parameterValue:pSource?.['参数值'],baselineValue:pSource?.['参数值']??literal,sourceRole:winner?sourceRole(winner):spec.calendarGlobal&&cp==='CP129'?'SYSTEM':'B',scope:winner?scopeOf(winner):'dataset',editable,adoptable:!!spec.name&&!spec.readonly&&!spec.candidate,_candidate:!!spec.candidate,_placeholder:!winner,status});
   }
  }
 }
 const objectOptions=[...new Map(records.map(p=>[p['对象编号'],{id:p['对象编号'],label:p.objectDate||p['对象编号']+' · '+p['对象名称']}])).values()].sort((a,b)=>compare(a.id,b.id));
 let filtered=records.filter(p=>(!located||p['对象编号']===located['对象编号']&&p['参数名称']===located['参数名称'])&&(!q.object||p['对象编号']===q.object)&&(!q.status||p.status===q.status)&&(!q.q||located||[p.cp,p['对象编号'],p['对象名称'],p['参数名称'],p.objectDate,...Object.values(p.context||{})].some(v=>String(v||'').toLowerCase().includes(String(q.q).toLowerCase()))));
 const month=/^\d{4}-\d{2}$/.test(q.month||'')?q.month:date(d,day).slice(0,7);
 if(tab==='calendar')filtered=filtered.filter(p=>!p.objectDate||p.objectDate.startsWith(month));
 filtered.sort((a,b)=>compare(a.cp,b.cp)||compare(a['对象编号'],b['对象编号'])||a._fieldOrder-b._fieldOrder);
 const groups=new Map();for(const p of filtered){const key=list?p.recordKey:p.objectTable+'|'+p['对象编号'],group=groups.get(key)||{id:key,object:p['对象编号'],name:p['对象名称'],date:p.objectDate,context:p.context,cells:[]};group.cells.push(p);groups.set(key,group);}
 const factorySettings=selected?.['参数编号']==='CP129'?[...groups.values()].filter(r=>!r.date):[],objects=[...groups.values()].filter(r=>!factorySettings.includes(r)),requested=Math.max(0,Number(q.offset)||0),offset=requested<objects.length?requested:0,limit=tab==='calendar'?100:q.limit==='all'?5000:Math.min(100,Math.max(1,Number(q.limit)||25)),page=objects.slice(offset,offset+limit);
 const sourceCounts=Object.fromEntries([...new Set(records.map(p=>p.objectTable).filter(t=>t!=='global'))].map(t=>[t,(d.tables[t]||[]).length]));
 return {datasetId:d.id,version:d.version,parameterRevision:d.parameterRevision||0,baseline:parameterBaseline(d),historyCount:parameterHistory(d,{scope,collection:q.collection,limit:1},actor).total,scope,day,tab,layout:list?'list':tab==='calendar'&&objects.some(r=>r.date)?'calendar':'objects',cp:selected?.['参数编号']||'',definitions,tabs,objectOptions,month,factorySettings,objectRows:page,records:[...page,...factorySettings].flatMap(r=>r.cells),total:objects.length,offset,limit,
  dayZero:d.dayZero||'2026-10-31',calendarSource:chinaCalendarSource,sourceCounts,nationalPreview:selected?.['参数编号']==='CP129'?(d.tables['工厂日历']||[]).filter(r=>date(d,r['日序']).startsWith(month)).map(r=>{const at=Number(r['日序']),active=[...getActive(at).values()].filter(p=>p['参数名称']!=='是否开工');return resolveFactoryCalendar(d,r,[...active,{'对象编号':String(at),'参数名称':'是否开工','参数值':'按国家日历'}]);}):undefined,contextColumns:tab==='bom'?['清单版本','父项','子项']:[],fields:[...new Set(filtered.filter(p=>tab!=='calendar'||!selected||selected['参数编号']!=='CP129'||p.objectDate).map(p=>p['参数名称']))],helpByField,trials:(d.parameterTrials||[]).filter(t=>t.actor===actor),sources:d.parameterSources||[]};
}

export function restoreNationalMonth(d,body,actor){
 const scope=scopeFor(d,body.scope,actor),month=String(body.month||'');
 if(!/^\d{4}-\d{2}$/.test(month))throw Error('请选择有效月份');
 const dates=(d.tables['工厂日历']||[]).filter(r=>date(d,r['日序']).startsWith(month));
 if(!dates.length)throw Error('该月没有已导入的工厂日期，请先补充日历');
 for(const row of dates){const at=Number(row['日序']),active=effectiveParameters(d,at,scope),r=resolveFactoryCalendar(d,row,active);if(!r.supported)throw Error(r.country+'的'+month.slice(0,4)+'年法定日历尚未载入，请手工维护，不能自动生成');}
 for(const row of dates){const at=Number(row['日序']),own=effectiveParameters(d,at,scope).find(p=>cpOf(p)==='CP129'&&p['对象编号']===String(at)&&p['参数名称']==='是否开工'&&scopeOf(p)===scope&&sourceRole(p)==='EDIT');changeParameter(d,{configuration:true,cp:'CP129',objectId:String(at),field:'是否开工',value:'按国家日历',unit:'枚举',scope,from:own?.['生效日']??at,to:own?.['失效日']??at+1,id:own?.['参数编号'],reason:'恢复'+month+'国家日历默认'},actor);}
 return {changedDates:dates.length,checksInvalidated:true};
}
