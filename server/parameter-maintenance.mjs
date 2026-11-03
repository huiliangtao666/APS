import {parameterCatalog,businessDefinition,atomicFields,sourceTable,isImmutable,parameterSpec,objectKey,scopeFor,scopeOf,sourceRole,canonicalCp,cpOf,effectiveParameters,blockedParameter} from './parameter-contract.mjs';
import {parameterHelp} from './parameter-help.mjs';
export const parameterTabs=[['global','01 全局与排程'],['material','02 物料与SKU'],['bom','03 BOM与损耗'],['customer','04 客户与交付'],['supplier','05 供应商与采购'],['resource','06 设备与工装'],['route','07 工艺与工序'],['crew','08 班组人员'],['calendar','09 工厂日历'],['storage','10 库区与仓储'],['rules','11 规则与其他']].map(([id,label])=>({id,label}));
const tableTabs={'物料主数据':'material','单位换算':'material','物料清单':'bom','每日需求':'customer','客户与交付':'customer','供应商与供货条件':'supplier','设备与工装':'resource','工艺路线':'route','班组资源':'crew','工厂日历':'calendar','停机安排':'calendar','库区库位':'storage','期初库存':'storage'};
const tableKeys={'物料主数据':'物料编号','物料清单':'用量关系编号','每日需求':'需求编号','客户与交付':'客户编号','供应商与供货条件':'供货关系编号','设备与工装':'资源编号','工艺路线':'路线工序编号','班组资源':'班组编号','工厂日历':'日序','停机安排':'停机编号','库区库位':'库位编号','期初库存':'库存批次编号','单位换算':'_unitKey'};
export const parameterMaintenanceUnit=(spec,row)=>spec.unit||(/计划起始日/.test(spec.name)?'日序':/每箱净重/.test(spec.name)?'千克/箱':/每件净重/.test(spec.name)?'千克/件':spec.name==='标准日产能千克'?'千克/标准日':spec.name==='最大容量'?(row['容量单位']||''):/最小订货量|订货倍数|子项基准用量/.test(spec.name)?(row['数量单位']||'本行数量单位'):/优先级/.test(spec.name)?'顺序':spec.name==='换算系数'?'比例':/班次|分母/.test(spec.name)?'班/天':/人数/.test(spec.name)?'人':/套数/.test(spec.name)?'套':spec.name==='可用数量'?(row['资源类别']==='工装'?'套':'个'):/比例|收率|参考率/.test(spec.name)?'比例':/天数/.test(spec.name)?'天':/千克/.test(spec.name)?'千克':/温度/.test(spec.name)?'摄氏度':'');
const compare=(a,b)=>String(a??'').localeCompare(String(b??''),'zh-CN',{numeric:true});
const date=(d,n)=>new Date(Date.parse((d.dayZero||'2026-10-31')+'T00:00:00Z')+Number(n)*86400000).toISOString().slice(0,10);
const specsFor=cp=>atomicFields.filter(f=>f.cp===canonicalCp(cp));
function specTab(spec){return spec.global||spec.calendarGlobal?'global':tableTabs[spec.table]||'rules';}
function tabsFor(cp){const fields=specsFor(cp),tabs=fields.map(specTab);if(!tabs.length)tabs.push(tableTabs[sourceTable(cp)]||(Number(cp.slice(2))<=10?'global':'rules'));return [...new Set(tabs)];}
export function parameterBaseline(d){const sources=(d.parameterSources||[]).filter(s=>s.mode==='dataset'),p=d.parameterBaseline||sources.at(-1);return p?{...p,version:p.version||new Set(sources.map(s=>s.fileHash)).size,label:'P'+(p.version||new Set(sources.map(s=>s.fileHash)).size)}:{label:'尚未导入配置参数',version:0,fileHash:null};}
export function parameterHistory(d,q={},actor=''){
 const scope=scopeFor(d,q.scope,actor),offset=Math.max(0,Number(q.offset)||0),limit=Math.min(100,Math.max(1,Number(q.limit)||25));
 const logged=new Set((d.parameterChangeLog||[]).flatMap(r=>[r.before?.['参数编号'],r.after?.['参数编号']]).filter(Boolean));
 const legacy=(d.tables['配置参数']||[]).filter(p=>sourceRole(p)==='EDIT'&&!logged.has(p['参数编号'])).map(p=>({id:'legacy:'+p['参数编号']+':'+p['生效日'],legacy:true,actor:p._source?.actor,at:(d.overlay||[]).find(o=>o.version===p._source?.version)?.at,cp:cpOf(p),object:p['对象编号'],field:p['参数名称'],scope:scopeOf(p),operation:'历史在线值',before:null,after:p}));
 const records=[...legacy,...(d.parameterChangeLog||[])].filter(r=>(r.scope==='dataset'||r.scope===scope)&&(!r.trial||r.actor===actor)&&(!q.cp||r.cp===q.cp)&&(!q.object||r.object===q.object)).slice().reverse();
 return {records:records.slice(offset,offset+limit),total:records.length,offset,parameterRevision:d.parameterRevision||0,baseline:parameterBaseline(d)};
}
export function parameterMaintenanceView(d,q={},actor=''){
 const day=Number(q.day??0);if(!Number.isInteger(day)||day<0||day>=44)throw Error('查看日期超出数据范围');
 const located=[...(d.tables['配置参数']||[]),...(d.parameterCandidates||[])].find(p=>p['参数编号']===q.q&&(scopeOf(p)==='dataset'||scopeOf(p)===q.scope));
 const scope=scopeFor(d,q.scope,actor),tab=located?tabsFor(cpOf(located))[0]:parameterTabs.some(t=>t.id===q.tab)?q.tab:'global',list=['global','rules'].includes(tab);
 const definitions=parameterCatalog.filter(c=>tabsFor(c['参数编号']).includes(tab)&&(!q.step||c['流程步骤入口'].includes(q.step))).map(c=>({...businessDefinition(d,c['参数编号']),fields:specsFor(c['参数编号']).filter(f=>specTab(f)===tab),sourceTables:[...new Set([sourceTable(c['参数编号']),...specsFor(c['参数编号']).map(f=>f.table)].filter(Boolean))],immutable:isImmutable(c['参数编号'])})).sort((a,b)=>compare(a['参数编号'],b['参数编号']));
 const selected=located?definitions.find(c=>canonicalCp(c['参数编号'])===canonicalCp(cpOf(located))):q.cp&&definitions.find(c=>c['参数编号']===q.cp)||(!list?definitions[0]:undefined),chosen=selected?[selected]:definitions;
 const raw=[...(d.tables['配置参数']||[]),...(d.parameterCandidates||[])].filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope);
 const activeCache=new Map(),getActive=at=>{if(!activeCache.has(at))activeCache.set(at,new Map(effectiveParameters(d,at,scope).map(p=>[[canonicalCp(cpOf(p)),p['对象编号'],p['参数名称'],parameterSpec(p)?.table||'global'].join('|'),p])));return activeCache.get(at);};
 const baseFields=new Map((d.parameterBaseFields||[]).map(b=>[[b.table,b.object,b.field].join('|'),b]));
 const index=new Map();for(const p of raw){const key=[canonicalCp(cpOf(p)),p['对象编号'],p['参数名称']].join('|');const bucket=index.get(key)||[];bucket.push(p);index.set(key,bucket);}
 const records=[],helpByField={};
 for(const c of chosen){
  const cp=c['参数编号'],fields=c.fields.length?c.fields:[{name:c['中文配置项'],table:sourceTable(cp),key:tableKeys[sourceTable(cp)],readonly:true}];
  for(const [fieldOrder,spec] of fields.entries()){
   helpByField[cp+'|'+spec.name]=parameterHelp(c,spec,{productionContract:d.productionContract});
   const table=spec.table,key=spec.key||tableKeys[table],source=table?(d.tables[table]||[]):[{GLOBAL:'GLOBAL'}];
   const objects=source.length?source:[{[key||'GLOBAL']:table?'未提供对象':'GLOBAL',_missing:true}];
   for(const row of objects){
    const object=table?objectKey(row,{...spec,key}):spec.calendarGlobal?'CAL':'GLOBAL',at=table==='工厂日历'&&Number.isInteger(Number(object))?Number(object):day;
    const winner=getActive(at).get([canonicalCp(cp),object,spec.name,table||'global'].join('|')),matches=index.get([canonicalCp(cp),object,spec.name].join('|'))||[];
    const pSource=matches.find(p=>sourceRole(p)==='P'&&Number(p['生效日'])<=at&&at<Number(p['失效日']));
    const base=baseFields.get([table,object,spec.name].join('|')),literal=base?(base.present?base.value:undefined):row[spec.name];
    const blocked=winner&&blockedParameter(winner),value=blocked?undefined:winner?.['参数值']??literal,missing=value===undefined||value===null||value==='';
    const name=String(row['物料名称']||row['成品名称']||row['客户名称']||row['资源名称']||row['工序名称']||row['班组名称']||row['库位名称']||row['供应商名称']||object);
    const editable=!row._missing&&!spec.readonly&&(!c.immutable||cp==='CP036'&&d.profile==='excel-qualified-output-202611-r1');
    const status=blocked?'待补充':missing?'未维护':spec.candidate?'候选，未启用':winner?'当前有效':c.immutable||spec.readonly?'只读':'业务基础值';
    records.push({...winner,missingObject:!!row._missing,_fieldOrder:fieldOrder,cp,definition:c,recordKey:[cp,table||'global',object,spec.name].join('|'),'参数编号':winner?.['参数编号'],'参数名称':spec.name,'对象编号':object,'对象名称':name,'参数值':missing?undefined:value,'单位':winner?.['单位']||pSource?.['单位']||parameterMaintenanceUnit(spec,row),
     '生效日':winner?.['生效日']??'0','失效日':winner?.['失效日']??'44',objectTable:table||'global',objectDate:table==='工厂日历'&&!row._missing?date(d,object):undefined,
     effectiveValue:missing?undefined:value,parameterValue:pSource?.['参数值'],baselineValue:pSource?.['参数值']??literal,sourceRole:winner?sourceRole(winner):'B',scope:winner?scopeOf(winner):'dataset',editable,adoptable:!!spec.name&&!spec.readonly&&!spec.candidate,_candidate:!!spec.candidate,_placeholder:!winner,status});
   }
  }
 }
 const objectOptions=[...new Map(records.map(p=>[p['对象编号'],{id:p['对象编号'],label:p.objectDate||p['对象编号']+' · '+p['对象名称']}])).values()].sort((a,b)=>compare(a.id,b.id));
 let filtered=records.filter(p=>(!located||p['对象编号']===located['对象编号']&&p['参数名称']===located['参数名称'])&&(!q.object||p['对象编号']===q.object)&&(!q.status||p.status===q.status)&&(!q.q||located||[p.cp,p['对象编号'],p['对象名称'],p['参数名称'],p.objectDate].some(v=>String(v||'').toLowerCase().includes(String(q.q).toLowerCase()))));
 const month=/^\d{4}-\d{2}$/.test(q.month||'')?q.month:date(d,day).slice(0,7);
 if(tab==='calendar')filtered=filtered.filter(p=>!p.objectDate||p.objectDate.startsWith(month));
 filtered.sort((a,b)=>compare(a.cp,b.cp)||compare(a['对象编号'],b['对象编号'])||a._fieldOrder-b._fieldOrder);
 const groups=new Map();for(const p of filtered){const key=list?p.recordKey:p.objectTable+'|'+p['对象编号'],group=groups.get(key)||{id:key,object:p['对象编号'],name:p['对象名称'],date:p.objectDate,cells:[]};group.cells.push(p);groups.set(key,group);}
 const objects=[...groups.values()],offset=Math.max(0,Number(q.offset)||0),limit=tab==='calendar'?100:Math.min(100,Math.max(1,Number(q.limit)||25)),page=objects.slice(offset,offset+limit);
 return {datasetId:d.id,version:d.version,parameterRevision:d.parameterRevision||0,baseline:parameterBaseline(d),historyCount:parameterHistory(d,{scope,limit:1},actor).total,scope,day,tab,layout:list?'list':tab==='calendar'?'calendar':'objects',cp:selected?.['参数编号']||'',definitions,tabs:parameterTabs,objectOptions,month,objectRows:page,records:page.flatMap(r=>r.cells),total:objects.length,offset,limit,
  fields:[...new Set(filtered.map(p=>p['参数名称']))],helpByField,trials:(d.parameterTrials||[]).filter(t=>t.actor===actor),sources:d.parameterSources||[]};
}
