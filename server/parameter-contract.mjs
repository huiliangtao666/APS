import {randomUUID} from 'node:crypto';
import {parameterCatalog} from '../src/lib/parameter-catalog.mjs';
export {parameterCatalog};
const byId=new Map(parameterCatalog.map(d=>[d['参数编号'],d]));
// Atomic fields are engine contracts, never inferred from uploaded K–O suggestions.
const groups=[
 ['物料主数据','物料编号',{'生产提前期天数':['CP080',0,true],'每箱净重千克':['CP016',0,false],'每件净重千克':['CP017',0,false],'保质天数':['CP053',0,false],'安全库存覆盖天数':['CP054',0,true],'仓储损耗参考率':['CP064',0,true,1]}],
 ['客户与交付','客户编号',{'运输天数':['CP048',0,true],'允许提前天数':['CP049',0,true],'允许延后天数':['CP050',0,true],'到货剩余保质比例':['CP051',0,true,1],'服务优先级':['CP047',0,false]}],
 ['供应商与供货条件','供货关系编号',{'采购优先级':['CP072',0,true],'采购导期天数':['CP073',0,true],'检验天数':['CP074',0,true],'最小订货量':['CP075',0,true],'订货倍数':['CP076',0,false]}],
 ['库区库位','库位编号',{'最低温度':['CP066',null,true],'最高温度':['CP066',null,true],'最大容量':['CP068',0,false]}],
 ['设备与工装','资源编号',{'可用数量':['CP099',0,true],'单次批量上限千克':['CP102',0,false],'标准日产能千克':['CP100',0,false],'同时占位上限千克':['CP111',0,false]}],
 ['工艺路线','路线工序编号',{'跨日历时天数':['CP092',0,true],'最大等待天数':['CP093',0,true],'最小等待天数':['CP093',0,true],'每批工装套数':['CP113',0,true],'需求人数':['CP120',0,true]}],
 ['班组资源','班组编号',{'每班可用人数':['CP119',0,true],'标准日班次数':['CP130',0,false],'周日班次数':['CP131',0,true]}],
 ['物料清单','用量关系编号',{'子项基准用量':['CP025',0,true],'父项基准产出千克':['CP024',0,false],'标准收率':['CP036',0,false,1]}],
 ['单位换算','_unitKey',{'换算系数':['CP015',0,false]}],
 ['工厂日历','日序',{'生产班次数':['CP132',0,true],'日产能分母':['CP130',0,false]}],
];
export const atomicFields=groups.flatMap(([table,key,fields])=>Object.entries(fields).map(([name,[cp,min,inclusive,max]])=>({table,key,name,cp,min,inclusive,max,integer:/天数|班次|人数|套数|可用数量|优先级/.test(name),type:'number'})));
atomicFields.push({name:'计划起始日',cp:'CP005',min:0,inclusive:true,integer:true,type:'number',global:true},{name:'窗口天数',cp:'CP006',min:0,inclusive:false,integer:true,type:'number',global:true},{name:'标准生产批量千克',cp:'CP101',min:0,inclusive:false,type:'number',global:true},{name:'供应延期概率',cp:'CP159',min:0,inclusive:true,max:1,type:'number',candidate:true},{name:'延期天数上限',cp:'CP160',min:0,inclusive:true,integer:true,type:'number',candidate:true});
export const specification=(name,cp)=>atomicFields.find(s=>s.name===name&&(!cp||canonicalCp(cp)===s.cp));
export const canonicalCp=cp=>cp==='CP063'?'CP074':cp;
export const definition=cp=>{const d=byId.get(cp);if(!d)throw Error('未知CP目录编号');return d;};
export const cpOf=p=>p._cp||specification(p['参数名称'])?.cp;
export const scopeOf=p=>p._scope||'dataset';
export const objectKey=(row,spec)=>spec.key==='_unitKey'?[row['物料编号'],row['换算前单位'],row['换算后单位']].join('|'):String(row[spec.key]);
export const parameterIdentity=p=>[scopeOf(p),p['对象编号'],canonicalCp(cpOf(p)),p['参数名称']].join('|');
export function finiteNumber(value){const text=String(value??'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw Error('须为有限数值字面值；空白不代表0');return Number(text);}
export function validateUnit(spec,unit){const allowed=/温度/.test(spec.name)?['摄氏度','℃']:/班次/.test(spec.name)?['班/天','班']:/人数/.test(spec.name)?['人']:/套数/.test(spec.name)?['套']:/比例|收率|概率|率$/.test(spec.name)?['比例']:/天数/.test(spec.name)?['天']:/优先级/.test(spec.name)?['顺序','优先级','无量纲']:/每箱净重/.test(spec.name)?['千克/箱','千克','kg/箱']:/每件净重/.test(spec.name)?['千克/件','千克','kg/件']:null;if(allowed&&!allowed.includes(String(unit)))throw Error(spec.name+'单位不匹配：'+unit);}
export function validateAtomic(spec,value){const n=finiteNumber(value);if(spec.integer&&!Number.isInteger(n))throw Error(spec.name+'须为整数');if(spec.min!==null&&spec.min!==undefined&&(spec.inclusive?n<spec.min:n<=spec.min))throw Error(spec.name+(spec.inclusive?'须≥':'须>')+spec.min);if(spec.max!==undefined&&n>spec.max)throw Error(spec.name+'须≤'+spec.max);return String(value).trim();}
export function validateComposite(cp,value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('组合参数须按命名字段维护');
 const exact=keys=>{if(Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw Error('组合字段缺少或包含未知字段：'+keys.join('、'));};
 if(cp==='CP091'){exact(['rateType','rate','efficiency','unit']);if(!['名义','有效'].includes(value.rateType)||typeof value.unit!=='string'||!value.unit.trim())throw Error('须明确速率口径及单位');if(!(finiteNumber(value.rate)>0)||!(finiteNumber(value.efficiency)>0&&finiteNumber(value.efficiency)<=1))throw Error('速率>0；效率(0,1]，效率上限不约束速率');}
 else if(cp==='CP093'){exact(['min','max']);if(finiteNumber(value.min)<0||finiteNumber(value.max)<finiteNumber(value.min))throw Error('最小等待须非负且不大于最大等待');}
 else if(cp==='CP066'){exact(['min','max']);if(finiteNumber(value.min)>finiteNumber(value.max))throw Error('最低温度不得高于最高温度');}
 else if(cp==='CP103'){exact(['min','max','unit']);if(finiteNumber(value.min)<0||finiteNumber(value.max)<finiteNumber(value.min)||!value.unit)throw Error('装载下限须非负且不大于上限，单位必填');}
 else if(cp==='CP161'){exact(['seed','algorithm','version']);if(!String(value.seed??'').trim()||!value.algorithm||!value.version)throw Error('随机情景启用须有种子/算法/版本');}
 else throw Error('此关系参数须在对应业务表维护；不能使用任意数值或JSON启用');
 return structuredClone(value);
}
export function sourceTable(cp){const n=Number(canonicalCp(cp).slice(2));if(n>=11&&n<=22||n===80)return n===15?'单位换算':'物料主数据';if(n>=30&&n<=35)return null;if(n>=23&&n<=39)return '物料清单';if(n>=40&&n<=52)return n<=42||n===52?'每日需求':'客户与交付';if(n>=53&&n<=64)return n>=58&&n<=62?'期初库存':'物料主数据';if(n>=65&&n<=70)return '库区库位';if(n>=71&&n<=84)return '供应商与供货条件';if(n>=85&&n<=98)return '工艺路线';if(n>=99&&n<=118)return '设备与工装';if(n>=119&&n<=128)return '班组资源';if(n>=129&&n<=136)return n>=134&&n<=135?'停机安排':'工厂日历';return null;}
export function isImmutable(cp){return /派生\/系统/.test(definition(cp)['呈现与编辑模式'])||['CP018','CP021','CP023','CP029','CP037','CP038','CP062'].includes(cp);}
export function scopeFor(d,value,actor){if(!value||value==='dataset')return 'dataset';if(typeof value!=='string'||!value.startsWith('trial:'))throw Error('作用范围须明确为数据集或已建立试算');const trial=d.parameterTrials?.find(t=>'trial:'+t.id===value);if(!trial||trial.actor!==actor)throw Error('试算不存在或无权维护他人试算');return value;}
export function parameterIssues(d){
 const issues=[],seen=new Set(),scopes=new Map(),ps=d.tables?.['配置参数']||[];
 const add=(p,message,code='PARAMETER_INVALID')=>issues.push({severity:'error',code,sheet:'配置参数',row:p._row||0,record:p['参数编号'],field:'参数值',cell:p._cells?.['参数值']||'',message});
 for(const p of ps){const id=p['参数编号'];if(!id||seen.has(id))add(p,'参数编号重复或为空');seen.add(id);
  try{const spec=specification(p['参数名称'],cpOf(p));if(spec){validateAtomic(spec,p['参数值']);validateUnit(spec,p['单位']);}else finiteNumber(p['参数值']);const from=finiteNumber(p['生效日']),to=finiteNumber(p['失效日']);if(!Number.isInteger(from)||!Number.isInteger(to)||to<=from)throw Error('有效期须为非空整数半开区间');if(p._formulas?.['参数值'])throw Error('参数值不可执行公式');
   const key=parameterIdentity(p),list=scopes.get(key)||[];if(list.some(x=>from<Number(x['失效日'])&&Number(x['生效日'])<to))throw Error('同对象/语义/作用范围有效期重叠');list.push(p);scopes.set(key,list);
   if(spec?.table&&!spec.candidate&&!p._candidate){const matches=(d.tables?.[spec.table]||[]).filter(r=>objectKey(r,spec)===p['对象编号']||(spec.table==='物料清单'&&r['清单版本编号']===p['对象编号']));if(!matches.length)add(p,'对象尚未映射到业务输入：'+p['对象编号'],'PARAMETER_OBJECT_UNMAPPED');}
  }catch(e){add(p,e.message);}
 }
 for(const t of ['库区库位','工艺路线'])for(const r of d.tables?.[t]||[]){if(t==='库区库位'&&r['最低温度']!==''&&r['最低温度']!==undefined&&r['最高温度']!==''&&r['最高温度']!==undefined&&Number(r['最低温度'])>Number(r['最高温度']))add({_row:r._row,'参数编号':r['库位编号']},'最低温度不得高于最高温度');if(t==='工艺路线'&&Number(r['最小等待天数']??0)>Number(r['最大等待天数']))add({_row:r._row,'参数编号':r['路线工序编号']},'最小等待不得大于最大等待');}
 return issues;
}
export function effectiveParameters(d,day=0,scope='dataset'){
 const all=d.tables?.['配置参数']||[],active=all.filter(p=>!p._candidate&&Number(p['生效日'])<=day&&day<Number(p['失效日'])&&['dataset',scope].includes(scopeOf(p))),result=new Map();
 for(const p of active.sort((a,b)=>(scopeOf(a)==='dataset'?0:1)-(scopeOf(b)==='dataset'?0:1)))result.set([p['对象编号'],canonicalCp(cpOf(p)),p['参数名称']].join('|'),p);
 return [...result.values()];
}
export function applyParameters(d,day=0,scope=d.parameterContext?.scope||'dataset'){
 const ps=effectiveParameters(d,day,scope),changes=[];
 for(const p of ps){const spec=specification(p['参数名称'],cpOf(p));if(!spec?.table||spec.candidate)continue;
  for(const row of d.tables?.[spec.table]||[])if(objectKey(row,spec)===p['对象编号']||(spec.table==='物料清单'&&row['清单版本编号']===p['对象编号'])){row[spec.name]=p['参数值'];changes.push({id:p['参数编号'],cp:spec.cp,object:p['对象编号'],field:spec.name,value:p['参数值'],scope:scopeOf(p),from:p['生效日'],to:p['失效日'],source:p._source});}
 }
 if(d.parameterContract){d.effectiveParameters={day,scope,version:d.version,values:changes};}
 return ps;
}
export function parameterView(d,query={},actor=''){
 const day=query.day===undefined?0:finiteNumber(query.day),scope=scopeFor(d,query.scope,actor),cp=query.cp?canonicalCp(query.cp):null,filter=String(query.q||''),effective=effectiveParameters(d,day,scope),effectiveIds=new Set(effective.map(p=>p['参数编号']));
 const raw=[...(d.tables?.['配置参数']||[]).filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope),...(d.parameterCandidates||[]).filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope)];
 const defs=(d.parameterDefinitions?.length?d.parameterDefinitions:parameterCatalog).map(p=>({...p,...definition(p['参数编号']),sourceDefinition:p}));
 const accepted=c=>(!query.topic||c['统一配置页签']===query.topic)&&(!query.domain||c['业务领域']===query.domain)&&(!cp||canonicalCp(c['参数编号'])===cp)&&(!query.step||c['流程步骤入口'].includes(query.step));
 const catalog=defs.map(c=>({...c,fields:atomicFields.filter(s=>s.cp===canonicalCp(c['参数编号'])),sourceTables:[...new Set([sourceTable(c['参数编号']),...atomicFields.filter(s=>s.cp===canonicalCp(c['参数编号'])).map(s=>s.table)].filter(Boolean))],immutable:isImmutable(c['参数编号'])})).filter(accepted).filter(c=>!filter||Object.values(c).some(x=>String(x).includes(filter)));
 let records=raw.map(p=>{const id=cpOf(p),c=id?definition(id):null,spec=specification(p['参数名称'],id),status=p._candidate||spec?.candidate?'候选，未启用':Number(p['生效日'])>day?'未来生效':effectiveIds.has(p['参数编号'])?'当前有效':'未采用/已失效';return {...p,cp:id,definition:c,status,scope:scopeOf(p),effectiveValue:effective.find(e=>e['对象编号']===p['对象编号']&&e['参数名称']===p['参数名称'])?.['参数值'],editable:!!id&&(!isImmutable(id)||(id==='CP036'&&d.profile==='excel-qualified-output-202611-r1')),adoptable:!!spec&&!spec.candidate&&!p._candidate};}).filter(p=>(!cp||canonicalCp(p.cp)===cp)&&(!query.object||p['对象编号']===query.object)&&(!query.status||p.status===query.status)&&(!p.definition||accepted(p.definition))&&(!filter||JSON.stringify(p).includes(filter)));
 const offset=Math.max(0,Number(query.offset)||0),limit=Math.min(100,Math.max(1,Number(query.limit)||25));
 if(query.layer==='catalog')records=catalog;
 if(query.layer==='categories')records=d.parameterCategories||[];
 if(query.layer==='discussions')records=d.parameterAnnotations?.discussions||[];
 if(query.layer==='questions')records=d.parameterAnnotations?.questions||[];
 return {datasetId:d.id,version:d.version,scope,day,total:records.length,offset,records:records.slice(offset,offset+limit),catalog,topics:[...new Set(parameterCatalog.map(d=>d['统一配置页签']))],domains:[...new Set(parameterCatalog.map(d=>d['业务领域']))],trials:(d.parameterTrials||[]).filter(t=>t.actor===actor),sources:d.parameterSources||[],mappingVersion:'CR-PARAM-UI-20261101:r1',checksInvalidated:!!d.checksInvalidated};
}
export function changeParameter(d,body,actor){
 const {cp,objectId,field,value,from,to,id,operation='save',candidate=false}=body,c=definition(cp),canonical=canonicalCp(cp),scope=scopeFor(d,body.scope,actor),spec=specification(field,canonical);
 if(isImmutable(cp)&&!(cp==='CP036'&&d.profile==='excel-qualified-output-202611-r1'))throw Error('派生/系统/固定契约只读，请维护其来源');
 if(!String(objectId||'').trim()||typeof field!=='string')throw Error('对象及参数字段必填');
 const start=finiteNumber(from),end=finiteNumber(to);if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start)throw Error('有效期须为整数非空半开区间');
 if(scope!=='dataset'&&(!spec||spec.global||spec.candidate))throw Error('此参数不支持仅本次试算覆盖');
 const target=candidate?(d.parameterCandidates??=[]):(d.tables['配置参数']??=[]),existing=id?target.find(p=>p['参数编号']===id):undefined;
 if(id&&!existing)throw Error('原参数记录不存在');
 if(existing&&(scopeOf(existing)!==scope||canonicalCp(cpOf(existing))!==canonical||existing['对象编号']!==objectId||existing['参数名称']!==field))throw Error('不能改变既有参数身份或作用范围');
 if(operation==='inherit'){if(scope==='dataset')throw Error('撤销覆盖仅适用于试算覆盖；共享来源不能无声删除');if(!existing)throw Error('覆盖不存在');target.splice(target.indexOf(existing),1);return {changedRecord:id,inherited:true,checksInvalidated:true};}
 if(operation!=='save')throw Error('未知参数操作');
 let stored;
 if(candidate){if(/关系\/组合/.test(c['呈现与编辑模式'])&&typeof value!=='object')throw Error('关系/组合参数须使用业务结构化表单，不能保存任意数值');if(/^CP03[0-5]$/.test(cp)&&!(finiteNumber(value)>=0&&finiteNumber(value)<1))throw Error('损耗比例须≥0且<1；空白不能当继承或0');if(body.enable===true)throw Error('候选资料不能显示已启用');stored=typeof value==='object'?validateComposite(cp,value):(spec?validateAtomic(spec,value):String(value??'').trim());if(stored==='')throw Error('候选值不能为空');}
 else {if(!spec||spec.candidate)throw Error('必要运行能力尚未支持或未明确，请保存为候选；不能假启用');stored=validateAtomic(spec,value);
  if(spec.global&&objectId!=='GLOBAL')throw Error('此参数须采用GLOBAL对象');if(spec.table&&!(d.tables[spec.table]||[]).some(r=>objectKey(r,spec)===objectId||(spec.table==='物料清单'&&r['清单版本编号']===objectId)))throw Error('引用对象不存在；先补完整业务输入');
 }
 const unit=String(body.unit??existing?.['单位']??'');if(!unit.trim())throw Error('单位必填');if(spec)validateUnit(spec,unit);if(existing&&unit!==existing['单位'])throw Error('单位变更须重新建立明确映射，不能静默换算');
 const identity=[scope,objectId,canonical,field].join('|');if(target.some(p=>p!==existing&&parameterIdentity(p)===identity&&start<Number(p['失效日'])&&Number(p['生效日'])<end))throw Error('同对象/语义/作用范围有效期重叠');
 const p={...(existing||{}),'参数编号':existing?.['参数编号']||body.newId||'P-'+randomUUID(),'对象编号':objectId,'对象名称':existing?.['对象名称']||objectId,'参数名称':field,'参数值':stored,'单位':unit,'生效日':String(start),'失效日':String(end),_cp:canonical,_scope:scope,_candidate:!!candidate,_source:{kind:'维护',reason:body.reason,version:d.version+1},_formulas:{}};
 if(existing)Object.assign(existing,p);else target.push(p);
 d.parameterContract='CR-PARAM-UI-20261101:r1';d.checkedAt=null;d.checksInvalidated=true;
 return {changedRecord:p['参数编号'],checksInvalidated:true,scope,entry:c['中文配置项']};
}
