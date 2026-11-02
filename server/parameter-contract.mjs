import {minuteAtomicFields} from './minute-parameter-fields.mjs';
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
atomicFields.push(...minuteAtomicFields);
export const specification=(name,cp)=>atomicFields.find(s=>s.name===name&&(!cp||canonicalCp(cp)===s.cp));
export const canonicalCp=cp=>cp==='CP063'?'CP074':cp;
export const definition=cp=>{const d=byId.get(cp);if(!d)throw Error('未知CP目录编号');return d;};
export const cpOf=p=>p._cp||specification(p['参数名称'])?.cp;
export const scopeOf=p=>p._scope||'dataset';
export const precedenceVersion='two-file-precedence-r1';
export const sourceRole=p=>p._sourceRole||p._source?.role||(p._source?.kind==='维护'?'EDIT':'B');
export const parameterSpec=p=>p['对象编号']==='CAL'&&['标准日班次数','周日班次数'].includes(p['参数名称'])?{...specification(p['参数名称'],cpOf(p)),table:'工厂日历',key:'日序',factory:true}:specification(p['参数名称'],cpOf(p));
const normalizedUnit=unit=>String(unit||'').replaceAll('kg','千克').replace('℃','摄氏度').replace(/^班$/,'班/天');
const dimension=p=>p._dimension||normalizedUnit(p['单位']);
export function parameterDimension(d,p){
 const spec=parameterSpec(p),row=spec?.table&&(d.tables?.[spec.table]||[]).find(r=>objectKey(r,spec)===p['对象编号']||spec.table==='物料清单'&&r['清单版本编号']===p['对象编号']);
 if(p['单位']==='本行容量单位')return normalizedUnit(row?.['容量单位'])||p['单位'];
 if(p['单位']==='本行数量单位'){const m=(d.tables?.['物料主数据']||[]).find(m=>m['物料编号']===row?.['物料编号']);return normalizedUnit(row?.['数量单位']||m?.['基础单位'])||p['单位'];}
 return normalizedUnit(p['单位']);
}
export function validateObjectDimension(d,p){
 const spec=parameterSpec(p);if(!spec?.table||p._candidate)return;
 for(const row of d.tables?.[spec.table]||[]){
  if(objectKey(row,spec)!==p['对象编号']&&!(spec.table==='物料清单'&&row['清单版本编号']===p['对象编号']))continue;
  if(spec.name==='可用数量'&&dimension(p)==='套'&&row['资源类别']!=='工装')throw Error('套仅适用于实体工装可用数量');
  const expected=['最小订货量','订货倍数','子项基准用量'].includes(spec.name)?row['数量单位']:spec.name==='最大容量'?row['容量单位']:null;
  if(expected&&dimension(p)!==normalizedUnit(expected))throw Error('参数量纲与业务对象单位不一致，须明确映射；不自动换算');
  if(p._dimension&&p._dimension!==parameterDimension(d,p))throw Error('对象单位映射已变化，保留来源维度并拒绝静默重解释');
 }
}
export const semanticIdentity=p=>JSON.stringify([parameterSpec(p)?.table||p._objectType||'unmapped',p['对象编号'],canonicalCp(cpOf(p)),p['参数名称'],dimension(p),p._profile||'workbook-day']);
export const layerIdentity=p=>JSON.stringify([sourceRole(p),scopeOf(p),semanticIdentity(p)]);
export const blockedParameter=p=>p._blocked||['待补','暂停采用','未配置','pending','disabled','missing'].includes(p['资料状态']);
export function businessDefinition(d,cp){
 const system=definition(cp),uploaded=d.parameterDefinitions?.find(p=>p['参数编号']===cp),merged={...system,...uploaded};
 for(const key of ['参数编号','统一配置页签','流程步骤入口','呈现与编辑模式','参数条目'])merged[key]=system[key];
 const note=String(uploaded?.['权威来源及校验备注']||'');
 return {...merged,sourceDefinition:uploaded,definitionSource:uploaded?'P':'SYSTEM',ruleDisposition:!uploaded?'内置受控规则':/建议|待评审|须说明|须指定/.test(note)?'原子字段按受控映射；建议/额外规则待编译':atomicFields.some(s=>s.cp===canonicalCp(cp))?'已采用原子类型/数值边界；文字规则未执行':'业务定义已采用；执行规则未支持'};
}
export function adoptDefinitionBounds(d,p){
 const spec=parameterSpec(p);if(!spec||blockedParameter(p)||p._candidate)return;
 if(spec.type==='enum')return;
 const c=businessDefinition(d,cpOf(p)),value=finiteNumber(p['参数值']);
 // A catalog boundary may be a comparison (SYSTEM CP016 uses ">0").
 // Parse its operator separately; parameter values remain strict numeric literals.
 for(const [key,defaultOperator]of [['最小值','>='],['最大值','<=']]){
  const text=String(c[key]??'').trim();if(!text)continue;
  // These catalog entries describe paired fields, not scalar limits. The
  // existing parameterIssues relation check evaluates them for each object,
  // scope and effective boundary once business objects are present (P may be
  // imported first). Keep all other text fail-closed and numeric limits strict.
  const paired=canonicalCp(cpOf(p))==='CP066'&&key==='最大值'&&text==='须≥最低温度'
   ||canonicalCp(cpOf(p))==='CP093'&&key==='最大值'&&text==='须≥最小等待';
  if(paired)continue;
  const expression=/^(>=|<=|>|<|≥|≤)\s*(.*)$/.exec(text);
  const operator=expression?.[1]||defaultOperator,bound=finiteNumber(expression?expression[2]:text);
  const accepted=operator==='>'?value>bound:operator==='<'?value<bound:
   operator==='>='||operator==='≥'?value>=bound:value<=bound;
  if(!accepted)throw Error('P目录边界：'+key+' '+text);
 }
}
export function tagParameterSources(d){
 const hashes=new Set((d.parameterSources||[]).filter(s=>s.mode==='dataset').map(s=>s.fileHash));
 for(const p of d.tables?.['配置参数']||[]){p._cp=cpOf(p);p._sourceRole=sourceRole(p)==='EDIT'?'EDIT':p._sourceRole||(hashes.has(p._source?.fileHash)?'P':'B');p._profile??='workbook-day';p._dimension=parameterDimension(d,p);p._source??={fileHash:d.fileHash,sheet:'配置参数',row:p._row};}
 d.parameterPrecedence=precedenceVersion;return d;
}
export const objectKey=(row,spec)=>spec.key==='_unitKey'?[row['物料编号'],row['换算前单位'],row['换算后单位']].join('|'):String(row[spec.key]);
export const parameterIdentity=p=>JSON.stringify([scopeOf(p),semanticIdentity(p)]);
export function finiteNumber(value){const text=String(value??'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw Error('须为有限数值字面值；空白不代表0');return Number(text);}
export function validateUnit(spec,unit){if(spec.unit){if(String(unit)!==spec.unit)throw Error(spec.name+'单位须为'+spec.unit);return;}const allowed=/^计划起始日$/.test(spec.name)?['日序']:/^可用数量$/.test(spec.name)?['个','套']:/^标准日产能千克$/.test(spec.name)?['千克/标准日','kg/标准日']:/千克$/.test(spec.name)&&!/^每箱|^每件/.test(spec.name)?['千克','kg']:/^子项基准用量$/.test(spec.name)?['千克','kg','个']:/^最小订货量$|^订货倍数$/.test(spec.name)?['本行数量单位','千克','kg','个']:/^最大容量$/.test(spec.name)?['本行容量单位','千克','kg','个']:/温度/.test(spec.name)?['摄氏度','℃']:/班次/.test(spec.name)?['班/天','班']:/人数/.test(spec.name)?['人']:/套数/.test(spec.name)?['套']:/比例|收率|概率|率$/.test(spec.name)?['比例']:/天数/.test(spec.name)?['天']:/优先级/.test(spec.name)?['顺序','优先级','无量纲']:/每箱净重/.test(spec.name)?['千克/箱','千克','kg/箱']:/每件净重/.test(spec.name)?['千克/件','千克','kg/件']:null;if(allowed&&!allowed.includes(String(unit)))throw Error(spec.name+'单位不匹配：'+unit);}
export function validateAtomic(spec,value){if(spec.type==='enum'){if(!spec.values.includes(String(value)))throw Error(spec.name+'须为'+spec.values.join('/'));return String(value); }const n=finiteNumber(value);if(spec.integer&&!Number.isInteger(n))throw Error(spec.name+'须为整数');if(spec.min!==null&&spec.min!==undefined&&(spec.inclusive?n<spec.min:n<=spec.min))throw Error(spec.name+(spec.inclusive?'须≥':'须>')+spec.min);if(spec.max!==undefined&&n>spec.max)throw Error(spec.name+'须≤'+spec.max);return String(value).trim();}
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
export function parameterIssues(d,{completeness=true}={}){
 const issues=[],seen=new Set(),scopes=new Map(),ps=d.tables?.['配置参数']||[],winning=new Set(effectiveParameters(d,d.parameterContext?.effectiveDay??0,d.parameterContext?.scope||'dataset'));
 const add=(p,message,code='PARAMETER_INVALID')=>issues.push({severity:'error',code,sheet:'配置参数',row:p._row||0,record:p['参数编号'],field:'参数值',cell:p._cells?.['参数值']||'',message});
 for(const p of ps){const id=[sourceRole(p),scopeOf(p),p['参数编号'],p._segment||''].join('|');if(!p['参数编号']||seen.has(id))add(p,'同源参数编号重复或为空');seen.add(id);
  try{const cp=cpOf(p),spec=parameterSpec(p);if(cp)definition(cp);const blocked=blockedParameter(p);validateObjectDimension(d,p);if(blocked&&completeness&&winning.has(p))add(p,'P明确待补/暂停采用，不回退B','PARAMETER_REQUIRED');if(!blocked&&p._candidate&&/^CP03[0-5]$/.test(cp)&&!(finiteNumber(p['参数值'])>=0&&finiteNumber(p['参数值'])<1))throw Error('损耗比例须≥0且<1');if(!blocked&&p._candidate&&cp&&!spec&&/关系\/组合/.test(definition(cp)['呈现与编辑模式'])&&typeof p['参数值']!=='object')throw Error('关系/组合候选须按命名字段维护');if(blocked&&String(p['参数值']??'').trim()===''){}else if(p._candidate&&typeof p['参数值']==='object')validateComposite(cp,p['参数值']);else if(spec){validateAtomic(spec,p['参数值']);validateUnit(spec,p['单位']);adoptDefinitionBounds(d,p);}else if(!p._candidate)finiteNumber(p['参数值']);else if(!String(p['参数值']??'').trim())throw Error('候选值不能为空');if(!String(p['单位']??'').trim())throw Error('单位必填');const from=finiteNumber(p['生效日']),to=finiteNumber(p['失效日']);if(!Number.isInteger(from)||!Number.isInteger(to)||to<=from)throw Error('有效期须为非空整数半开区间');if(Object.keys(p._formulas||{}).length)throw Error('参数值及身份不可执行公式');
   if(spec)validateUnit(spec,p['单位']);if(spec&&!p._candidate&&p._profile&&p._profile!=='workbook-day')throw Error('来源profile尚未支持采用');const key=layerIdentity(p),list=scopes.get(key)||[];if(list.some(x=>from<Number(x['失效日'])&&Number(x['生效日'])<to))throw Error('同对象/语义/作用范围有效期重叠');list.push(p);scopes.set(key,list);
   if(completeness&&winning.has(p)&&spec?.table&&!spec.candidate&&!p._candidate&&!blocked){const matches=(d.tables?.[spec.table]||[]).filter(r=>objectKey(r,spec)===p['对象编号']||(spec.table==='物料清单'&&r['清单版本编号']===p['对象编号']));if(!matches.length&&!(spec.factory&&(d.tables?.['工厂日历']||[]).length))add(p,'对象尚未映射到业务输入：'+p['对象编号'],'PARAMETER_OBJECT_UNMAPPED');}
  }catch(e){add(p,e.message);}
 }
 if(d.parameterCandidatesOnly)return issues;
 // Check paired fields at every boundary, including trial inheritance. A future
 // atomic edit must not create min>max merely because day0 currently looks valid.
 for(const [table,key,low,high,defaultLow]of [['库区库位','库位编号','最低温度','最高温度',undefined],['工艺路线','路线工序编号','最小等待天数','最大等待天数',0]])for(const row of d.tables?.[table]||[]){
  const relevant=ps.filter(p=>!p._candidate&&p['对象编号']===String(row[key])&&[low,high].includes(p['参数名称'])),scopeNames=new Set(['dataset',...relevant.map(scopeOf)]),days=new Set([0,...relevant.flatMap(p=>[Number(p['生效日']),Number(p['失效日'])])]);
  for(const scope of scopeNames)for(const day of days){const active=effectiveParameters(d,day,scope),value=field=>{const p=active.find(p=>p['对象编号']===String(row[key])&&p['参数名称']===field),base=d.parameterBaseFields?.find(b=>b.table===table&&b.object===String(row[key])&&b.field===field);return p&&blockedParameter(p)?undefined:p?.['参数值']??base?.value??row[field]??(field===low?defaultLow:undefined);};const lo=value(low),hi=value(high);if(lo!==''&&hi!==''&&Number(lo)>Number(hi)){
   issues.push({severity:'error',code:'PARAMETER_RELATION',sheet:table,row:row._row||0,record:row[key],field:low,cell:row._cells?.[low]||'',message:low+'不得大于'+high+'；'+scope+'，日'+day});break;
  }}
 }

 return issues;
}
export function effectiveParameters(d,day=0,scope='dataset'){
 const active=(d.tables?.['配置参数']||[]).filter(p=>!p._candidate&&Number(p['生效日'])<=day&&day<Number(p['失效日'])&&['dataset',scope].includes(scopeOf(p))),result=new Map();
 const rank=p=>(scopeOf(p)==='dataset'?0:10)+({B:0,P:1,EDIT:2}[sourceRole(p)]??0);
 for(const p of active.sort((a,b)=>rank(a)-rank(b)))result.set(semanticIdentity(p),p);
 return [...result.values()];
}
export function applyParameters(d,day=0,scope=d.parameterContext?.scope||'dataset'){
 const ps=effectiveParameters(d,day,scope),changes=[];
 // Keep literal business inputs separate from resolved values. Re-evaluating a
 // later period or removing a trial override must not inherit the last resolution.
 if(d.parameterContract){const base=d.parameterBaseFields??=[],byKey=new Map(base.map(b=>[[b.table,b.object,b.field].join('|'),b]));for(const spec of atomicFields.filter(s=>s.table&&!s.candidate))for(const row of d.tables?.[spec.table]||[]){const object=objectKey(row,spec);const key=[spec.table,object,spec.name].join('|');let saved=byKey.get(key);if(!saved&&!(d.tables?.['配置参数']||[]).some(p=>!p._candidate&&p['参数名称']===spec.name&&(p['对象编号']===object||spec.table==='物料清单'&&p['对象编号']===row['清单版本编号'])))continue;if(!saved){saved={table:spec.table,object,field:spec.name,present:Object.hasOwn(row,spec.name),value:row[spec.name]};base.push(saved);byKey.set(key,saved);}if(saved.present)row[spec.name]=saved.value;else delete row[spec.name];}d.parameterBaseFields=base;}
 for(const p of ps){const spec=parameterSpec(p);if(!spec?.table||spec.candidate)continue;
  if(spec.factory){for(const row of d.tables?.['工厂日历']||[]){if(!row._factoryBase)row._factoryBase={actual:row['生产班次数'],numerator:row['日产能分子'],denominator:row['日产能分母']};}continue;}
  for(const row of d.tables?.[spec.table]||[])if(objectKey(row,spec)===p['对象编号']||(spec.table==='物料清单'&&row['清单版本编号']===p['对象编号'])){if(blockedParameter(p))delete row[spec.name];else row[spec.name]=p['参数值'];changes.push({id:p['参数编号'],cp:spec.cp,object:p['对象编号'],field:spec.name,value:p['参数值'],unit:p['单位'],scope:scopeOf(p),from:p['生效日'],to:p['失效日'],source:p._source,sourceRole:sourceRole(p),blocked:!!blockedParameter(p)});}
 }
 // CAL is a factory object, separate from TM crew values. Resolve once at the
 // frozen effective day; apply weekday semantics to the existing literal calendar.
 const factory=ps.filter(p=>parameterSpec(p)?.factory),standard=factory.find(p=>p['参数名称']==='标准日班次数'),sunday=factory.find(p=>p['参数名称']==='周日班次数');
 for(const row of d.tables?.['工厂日历']||[]){
  if(row._factoryBase){row['生产班次数']=row._factoryBase.actual;row['日产能分子']=row._factoryBase.numerator;row['日产能分母']=row._factoryBase.denominator;}
  const isSunday=new Date(Date.UTC(2026,9,31)+Number(row['日序'])*86400000).getUTCDay()===0,actual=isSunday?sunday:standard;
  if(standard){if(blockedParameter(standard))delete row['日产能分母'];else row['日产能分母']=validateAtomic({...parameterSpec(standard),min:0,inclusive:false},standard['参数值']);}
  if(actual){if(blockedParameter(actual)){delete row['生产班次数'];delete row['日产能分子'];}else row['生产班次数']=row['日产能分子']=actual['参数值'];}
 }
 for(const p of factory)changes.push({id:p['参数编号'],cp:cpOf(p),object:'CAL',field:p['参数名称'],value:blockedParameter(p)?null:p['参数值'],unit:p['单位'],scope:scopeOf(p),from:p['生效日'],to:p['失效日'],source:p._source,sourceRole:sourceRole(p),blocked:!!blockedParameter(p)});
 if(d.parameterContract){for(const p of ps){const spec=specification(p['参数名称'],cpOf(p));if(spec?.global||spec?.calendarGlobal)changes.push({id:p['参数编号'],cp:spec.cp,object:p['对象编号'],field:spec.name,value:p['参数值'],unit:p['单位'],scope:scopeOf(p),from:p['生效日'],to:p['失效日'],source:p._source,sourceRole:sourceRole(p),blocked:!!blockedParameter(p)});}d.effectiveParameters={day,scope,version:d.version,precedenceVersion,values:changes};}
 return ps;
}
export function parameterView(d,query={},actor=''){
 const day=query.day===undefined?0:finiteNumber(query.day),scope=scopeFor(d,query.scope,actor),search=String(query.q||'').trim(),cp=query.cp?canonicalCp(query.cp):/^CP\d{3}$/.test(search)?canonicalCp(search):null,filter=/^CP\d{3}$/.test(search)?'':search,effective=effectiveParameters(d,day,scope),effectiveIds=new Set(effective);
 const baseEffective=effectiveParameters(d,day,'dataset'),same=(a,b)=>semanticIdentity(a)===semanticIdentity(b);
 const raw=[...(d.tables?.['配置参数']||[]).filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope),...(d.parameterCandidates||[]).filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope)];
 const defs=parameterCatalog.map(p=>businessDefinition(d,p['参数编号']));
 const accepted=c=>(!query.topic||c['统一配置页签']===query.topic)&&(!query.domain||c['业务领域']===query.domain)&&(!cp||canonicalCp(c['参数编号'])===cp)&&(!query.step||c['流程步骤入口'].includes(query.step));
 const catalog=defs.map(c=>({...c,fields:atomicFields.filter(s=>s.cp===canonicalCp(c['参数编号'])),sourceTables:[...new Set([sourceTable(c['参数编号']),...atomicFields.filter(s=>s.cp===canonicalCp(c['参数编号'])).map(s=>s.table)].filter(Boolean))],immutable:isImmutable(c['参数编号'])})).filter(accepted).filter(c=>!filter||Object.values(c).some(x=>String(x).includes(filter)));
 let records=raw.map(p=>{const base=baseEffective.find(e=>same(e,p)),actual=effective.find(e=>same(e,p)),specBase=specification(p['参数名称'],cpOf(p)),literal=specBase?.table&&((d.parameterBaseFields||[]).find(b=>b.table===specBase.table&&b.object===p['对象编号']&&b.field===p['参数名称'])||{value:(d.tables?.[specBase.table]||[]).find(r=>objectKey(r,specBase)===p['对象编号'])?.[specBase.name]});const id=cpOf(p),c=id?businessDefinition(d,id):null,spec=parameterSpec(p),mapped=!spec?.table||spec.factory&&(d.tables?.['工厂日历']||[]).length||(d.tables?.[spec.table]||[]).some(r=>objectKey(r,spec)===p['对象编号']||spec.table==='物料清单'&&r['清单版本编号']===p['对象编号']),status=!mapped&&!p._candidate?'采用受阻需定位':blockedParameter(p)?'已导入待补；不回退B':p._candidate||spec?.candidate?'候选，未启用':Number(p['生效日'])>day?'未来生效':effectiveIds.has(p)?'当前有效':'未采用/已失效';return {...p,recordKey:[sourceRole(p),scopeOf(p),p['参数编号'],p['生效日']].join('|'),sourceRole:sourceRole(p),businessValue:raw.find(x=>sourceRole(x)==='B'&&same(x,p)&&Number(x['生效日'])<=day&&day<Number(x['失效日']))?.['参数值'],parameterValue:raw.find(x=>sourceRole(x)==='P'&&same(x,p)&&Number(x['生效日'])<=day&&day<Number(x['失效日']))?.['参数值'],ruleDisposition:c?.ruleDisposition,cp:id,definition:c,status,scope:scopeOf(p),baseValue:base?.['参数值']??literal?.value,overrideValue:actual&&scopeOf(actual)!=='dataset'?actual['参数值']:undefined,effectiveValue:!mapped||actual&&blockedParameter(actual)?null:actual?.['参数值']??literal?.value,effectiveSource:actual?sourceRole(actual)+' / '+scopeOf(actual):literal?'业务表基础输入':undefined,editable:!!id&&(!isImmutable(id)||(id==='CP036'&&d.profile==='excel-qualified-output-202611-r1')),adoptable:!!spec&&!spec.candidate&&!p._candidate};}).filter(p=>(!cp||canonicalCp(p.cp)===cp)&&(!query.object||p['对象编号']===query.object)&&(!query.status||p.status===query.status)&&(!p.definition||accepted(p.definition))&&(!filter||JSON.stringify(p).includes(filter)));
 const offset=Math.max(0,Number(query.offset)||0),limit=Math.min(100,Math.max(1,Number(query.limit)||25));
 if(query.layer==='catalog')records=catalog;
 if(query.layer==='categories')records=d.parameterCategories||[];
 if(query.layer==='discussions')records=d.parameterAnnotations?.discussions||[];
 if(query.layer==='questions')records=d.parameterAnnotations?.questions||[];
 if(!['instances','catalog',undefined].includes(query.layer)&&filter)records=records.filter(p=>JSON.stringify(p).includes(filter));
 return {datasetId:d.id,businessLinked:d.profile!=='parameter-catalog-202611-r1',version:d.version,scope,day,total:records.length,offset,records:records.slice(offset,offset+limit),catalog,topics:[...new Set(parameterCatalog.map(d=>d['统一配置页签']))],domains:[...new Set(parameterCatalog.map(d=>d['业务领域']))],trials:(d.parameterTrials||[]).filter(t=>t.actor===actor),sources:d.parameterSources||[],candidateSources:d.parameterCandidateSources||[],precedenceVersion,mappingVersion:'CR-PARAM-UI-20261101:r1',checksInvalidated:!!d.checksInvalidated};
}
export function changeParameter(d,body,actor){
 tagParameterSources(d);
 const {cp,objectId,field,value,from,to,id,operation='save',candidate=false}=body,c=businessDefinition(d,cp),canonical=canonicalCp(cp),scope=scopeFor(d,body.scope,actor),spec=parameterSpec({'对象编号':objectId,'参数名称':field,_cp:canonical});
 if(isImmutable(cp)&&!(cp==='CP036'&&d.profile==='excel-qualified-output-202611-r1'))throw Error('派生/系统/固定契约只读，请维护其来源');
 if(!String(objectId||'').trim()||typeof field!=='string')throw Error('对象及参数字段必填');
 const start=finiteNumber(from),end=finiteNumber(to);if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start)throw Error('有效期须为整数非空半开区间');
 if(scope!=='dataset'&&(!spec||spec.global||spec.candidate))throw Error('此参数不支持仅本次试算覆盖');
 const target=candidate?(d.parameterCandidates??=[]):(d.tables['配置参数']??=[]),existing=id?target.find(p=>p['参数编号']===id&&(!body.sourceRole||sourceRole(p)===body.sourceRole)&&(!body.sourceFrom||p['生效日']===body.sourceFrom)):undefined;
 if(id&&!existing)throw Error('原参数记录不存在');
 if(existing&&(scopeOf(existing)!==scope||canonicalCp(cpOf(existing))!==canonical||existing['对象编号']!==objectId||existing['参数名称']!==field))throw Error('不能改变既有参数身份或作用范围');
 if(operation==='inherit'){if(scope==='dataset')throw Error('撤销覆盖仅适用于试算覆盖；共享来源不能无声删除');if(!existing)throw Error('覆盖不存在');target.splice(target.indexOf(existing),1);return {changedRecord:id,inherited:true,checksInvalidated:true};}
 if(operation!=='save')throw Error('未知参数操作');
 let stored;
 if(candidate){if(!spec&&/关系\/组合/.test(c['呈现与编辑模式'])&&typeof value!=='object')throw Error('关系/组合参数须使用业务结构化表单，不能保存任意数值');if(/^CP03[0-5]$/.test(cp)&&!(finiteNumber(value)>=0&&finiteNumber(value)<1))throw Error('损耗比例须≥0且<1；空白不能当继承或0');if(body.enable===true)throw Error('候选资料不能显示已启用');stored=typeof value==='object'?validateComposite(cp,value):(spec?validateAtomic(spec,value):String(value??'').trim());if(stored==='')throw Error('候选值不能为空');}
 else {if(!spec||spec.candidate)throw Error('必要运行能力尚未支持或未明确，请保存为候选；不能假启用');stored=validateAtomic(spec,value);
  if((spec.global&&objectId!=='GLOBAL')||(spec.calendarGlobal&&objectId!=='CAL'))throw Error('此参数须采用GLOBAL对象');if(spec.table&&!spec.factory&&!(d.tables[spec.table]||[]).some(r=>objectKey(r,spec)===objectId||(spec.table==='物料清单'&&r['清单版本编号']===objectId)))throw Error('引用对象不存在；先补完整业务输入');
 }
 const unit=String(body.unit??existing?.['单位']??'');if(!unit.trim())throw Error('单位必填');if(spec)validateUnit(spec,unit);if(existing&&unit!==existing['单位'])throw Error('单位变更须重新建立明确映射，不能静默换算');
 const probe={'对象编号':objectId,'参数名称':field,'单位':unit,_cp:canonical,_scope:scope,_sourceRole:'EDIT',_profile:existing?._profile||'workbook-day'};
 probe._dimension=parameterDimension(d,probe);
 const own=existing&&sourceRole(existing)==='EDIT'?existing:undefined;
 if(target.some(p=>p!==own&&sourceRole(p)==='EDIT'&&parameterIdentity(p)===parameterIdentity(probe)&&start<Number(p['失效日'])&&Number(p['生效日'])<end))throw Error('同在线层/对象/语义/作用范围有效期重叠');
 const nextId=own?.['参数编号']||body.newId||'P-'+randomUUID();
 if(target.some(p=>p!==own&&sourceRole(p)==='EDIT'&&p['参数编号']===nextId))throw Error('在线参数编号已存在');
 const p={...(existing||{}),...probe,'参数编号':nextId,'对象编号':objectId,'对象名称':existing?.['对象名称']||objectId,'参数名称':field,'参数值':stored,'单位':unit,'生效日':String(start),'失效日':String(end),_cp:canonical,_scope:scope,_candidate:!!candidate,_blocked:false,_pendingReason:undefined,'资料状态':candidate?'candidate':'dataset',_source:{role:'EDIT',kind:'维护',actor,reason:body.reason,version:d.version+1,previous:existing?._source},_formulas:{}};
 adoptDefinitionBounds(d,p);
 if(own)Object.assign(own,p);else target.push(p);
 d.parameterContract='CR-PARAM-UI-20261101:r1';d.checkedAt=null;d.checksInvalidated=true;
 return {changedRecord:p['参数编号'],sourceRole:'EDIT',checksInvalidated:true,scope,entry:c['中文配置项']};
}
// Resource windows intersect factory availability and the crew's own calendar;
// ratios are never multiplied twice. Standard counts are denominators, actual0 closes.
export function parameterDayRatio(d,calendar,crew,day){
 if(!calendar)return 0;
 if(!d.parameterContract)return Number(calendar['日产能分子'])/Number(calendar['日产能分母']);
 const denominator=finiteNumber(calendar['日产能分母']),actual=finiteNumber(calendar['生产班次数']);if(!(denominator>0)||actual<0)throw Error('工厂标准班次须>0，实际班次须非负');
 const standard=finiteNumber(crew['标准日班次数']);if(!(standard>0))throw Error('班组标准班次须>0');const sunday=new Date(Date.UTC(2026,9,31)+day*86400000).getUTCDay()===0;
 const crewActual=sunday?finiteNumber(crew['周日班次数']):standard;if(crewActual<0)throw Error('班组实际班次须非负');return Math.min(actual/denominator,crewActual/standard);
}
