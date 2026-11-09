import {hash,rows,workbookSchema,refreshDerived} from './workbook-model.mjs';
import {scopeFor,tagParameterSources,sourceRole,precedenceVersion,applyParameters,parameterSpec,objectKey,parameterDimension} from './parameter-contract.mjs';
import {supplyReadiness} from './workbook-supply.mjs';

// The new cards are strict. Omitted kind retains the legacy mixed-workbook API.
export function importBinding(body,{id,expectedVersion,exists,actor}) {
 const importKind=body.importKind;
 if(importKind===undefined)return {mode:body.adoptParameters===true?'dataset':'candidate',scope:'dataset'};
 if(!['business','parameter','mixed'].includes(importKind))return {error:'import_kind_invalid',status:422};
 // Parameter-first import creates an isolated parameter-only version; readiness remains blocked until B arrives.
 if(body.expectedVersion!==expectedVersion)return {error:'preview_stale',status:409,actualVersion:expectedVersion};
 const mode=body.mode||'candidate',scope=body.scope||'dataset';
 if(!['candidate','dataset'].includes(mode)||scope!=='dataset')return {error:'bulk_trial_not_supported',status:422};
 if(importKind==='business'&&body.adoptParameters===true)return {error:'business_parameter_adoption_requires_parameter_card',status:422};
 if((mode==='dataset')!==(body.adoptParameters===true))return {error:'adoption_mode_mismatch',status:422};
 if(!['keep','replace'].includes(body.overlayResolution||'keep'))return {error:'overlay_resolution_invalid',status:422};
 return {overlayResolution:body.overlayResolution||'keep',importKind:importKind==='mixed'?undefined:importKind,requestedKind:importKind,targetId:id,mode,scope,owner:actor};
}
export function bindPreview(p) {
 if(!p.requestedKind)return;
 p.previewFingerprint=hash({id:p.id,target:p.datasetId,version:p.expectedVersion,parameterRevision:p.expectedParameterRevision||0,file:p.fileHash,kind:p.requestedKind,mode:p.mode,scope:p.scope,owner:p.owner,snapshot:p.snapshotHash,changes:p.changeSet,precedenceVersion,overlayResolution:p.overlayResolution,threeWay:p.parameterThreeWay});
}
export function commitBinding(p,b,actor) {
 if(!p.requestedKind)return null;
 if(p.owner!==actor)return 'preview_owner_changed';
 if(b.previewFingerprint!==p.previewFingerprint||b.importKind!==p.requestedKind||b.datasetId!==p.datasetId||b.mode!==p.mode||b.scope!==p.scope||(b.overlayResolution||'keep')!==p.overlayResolution)return 'preview_binding_changed';
 return null;
}
export function sourceIdentity(d) {
 const businessLinked=d.profile!=='parameter-catalog-202611-r1',sourceFiles=[...(businessLinked?[{kind:'business',fileHash:d.fileHash,name:d.businessFileName||d.name}]:[]),...(d.parameterSources||[]).map(p=>({kind:'parameter',...p}))];
 return {sourceFiles,businessLinked,precedenceVersion:d.parameterPrecedence||'legacy',parameterDefinitionsHash:hash(d.parameterDefinitions||[]),parameterLayerHash:hash(rows(d,'配置参数')),overlay:d.overlay||[],mappingHash:hash(d.mapping),parameterHash:hash(rows(d,'配置参数'))};
}
export function prepareBusinessImport(incoming,old,copyValue=structuredClone) {
 const d=tagParameterSources(copyValue(incoming));
 d.parameterContract='CR-PARAM-UI-20261101:r1';
 d.sourceFiles=[{kind:'business',fileHash:d.fileHash},...(old?.sourceFiles||[]).filter(p=>p.kind!=='business')];
 compileBusinessBindings(d);
 if(!old)return d;
 const previous=tagParameterSources(structuredClone(old));
 for(const k of ['parameterBaseline','parameterRevision','parameterChangeLog','parameterContract','parameterCandidates','parameterDefinitions','parameterCandidateDefinitions','parameterCategories','parameterAnnotations','parameterCounts','parameterClassification','parameterSources','parameterTrials','parameterPending','bomLossProfiles'])if(previous[k]!==undefined)d[k]=structuredClone(previous[k]);
 // The new B level always comes from this workbook. Preserve only P/EDIT, so
 // uncovered B parameters continue receiving updates and business rows replace.
 d.tables['配置参数']=[...rows(d,'配置参数'),...rows(previous,'配置参数').filter(p=>sourceRole(p)!=='B')];
 d.parameterBaseFields=[];
 d.overlay=[...(previous.overlay||[]),{version:d.version,operation:'business-file-replacement',previousFileHash:old.fileHash,fileHash:d.fileHash}];
 // P-first can retain an explicitly relative unit before the object exists.
 // Resolve that placeholder once when B supplies the object; a concrete frozen
 // dimension is never rebound by a later business replacement.
 for(const p of rows(d,'配置参数'))if(['本行数量单位','本行容量单位'].includes(p._dimension)&&p['单位']===p._dimension){
  const resolved=parameterDimension(d,p);
  if(resolved!==p._dimension){p._dimensionBinding={relative:p._dimension,businessFileHash:d.fileHash};p._dimension=resolved;}
 }
 d.checkedAt=null;d.checksInvalidated=true;
 return d;
}
// Compile approved object/field semantics before preserving the B fallback. Raw
// formulas and position bindings remain unchanged for provenance. A stale row
// address cannot redirect a supported field to an unrelated parameter.
function compileBusinessBindings(d){
 const active=applyParameters(d,0),byId=new Map(rows(d,'配置参数').map(p=>[p['参数编号'],p])),semanticIndex=new Map(),fieldSpecs=new Map();
 for(const p of active){const spec=parameterSpec(p);if(!spec?.table||spec.factory)continue;fieldSpecs.set(spec.table+'|'+spec.name,spec);semanticIndex.set(JSON.stringify([spec.table,p['对象编号'],spec.name]),p);}
 const factoryParameters=active.filter(p=>parameterSpec(p)?.factory);
 for(const binding of d.bindings||[]){
  const target=rows(d,binding.sheet).find(r=>binding.recordKey?(binding.sheet==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):r[workbookSchema.tables[binding.sheet]?.key])===binding.recordKey:r._row===binding.row);
  if(!target)continue;
  const original=byId.get(binding.parameterId),factory=binding.sheet==='工厂日历'&&['生产班次数','日产能分子','日产能分母'].includes(binding.field);
  const fieldSpec=fieldSpecs.get(binding.sheet+'|'+binding.field),semantic=fieldSpec&&semanticIndex.get(JSON.stringify([binding.sheet,objectKey(target,fieldSpec),binding.field]));
  const factorySource=factory&&factoryParameters.find(p=>p['参数名称']===(binding.field==='日产能分母'||new Date(Date.UTC(2026,9,31)+Number(target['日序'])*86400000).getUTCDay()!==0?'标准日班次数':'周日班次数'));
  const selected=semantic||factorySource;
  if(!selected||selected===original)continue;
  const value=target[binding.field];
  if(semantic){const base=d.parameterBaseFields?.find(b=>b.table===binding.sheet&&b.object===selected['对象编号']&&b.field===binding.field);if(base){base.present=value!==undefined;base.value=value;}}
  if(factory&&target._factoryBase)target._factoryBase={actual:target['生产班次数'],numerator:target['日产能分子'],denominator:target['日产能分母']};
  d.warnings??=[];d.warnings.push({code:'PARAMETER_BINDING_SEMANTIC',sheet:binding.sheet,row:target._row,record:binding.recordKey,field:binding.field,originalParameterId:binding.parameterId,adoptedParameterId:selected['参数编号'],message:'位置引用与受控对象/字段不一致；保留原公式，采用B参数语义投影，后续有效P仍优先'});
 }
}
export function importChanges(old,next) {
 const changes=[];
 for(const [table,spec] of Object.entries(workbookSchema.tables)) {
  if(spec.kind!=='输入')continue;
  const key=r=>table==='配置参数'&&next.parameterContract?[sourceRole(r),r._scope||'dataset',r['参数编号'],r['生效日'],r['失效日']].join('|'):table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[spec.key]);
  const before=new Map(rows(old||{tables:{}},table).map(r=>[key(r),r])),after=new Map(rows(next,table).map(r=>[key(r),r]));
  for(const id of new Set([...before.keys(),...after.keys()])) {
   const a=before.get(id),b=after.get(id),fields=spec.fields.filter(f=>a?.[f.name]!==b?.[f.name]).map(f=>({field:f.name,before:a?.[f.name]??null,after:b?.[f.name]??null}));
   if(fields.length)changes.push({table,key:id,operation:!a?'create':!b?'delete':'replace',fields});
  }
 }
 return changes;
}
// Derived values only mutate input rows and root metadata. Reference tables
// remain read-only and retain their exact order/content in the frozen object.
export function computationInput(data) {
 return {...data,tables:Object.fromEntries(Object.entries(data.tables).filter(([table])=>workbookSchema.tables[table]?.kind==='输入'))};
}
export function cloneForParameters(data) {
 const d=structuredClone(computationInput(data));
 // Run snapshots contain adopted configuration, not private maintenance/trial history.
 delete d.parameterChangeLog;
 d.tables=Object.fromEntries(Object.entries(data.tables).map(([table,values])=>[table,d.tables[table]??values]));
 return d;
}
export function checkSelection(data,body,actor) {
 const d=cloneForParameters(data),selection=body.selection||{},scope=scopeFor(d,body.parameterScope,actor);
 if(Object.keys(selection).some(k=>!['startDay','endDay','currentDay','currentMinute','demandIds'].includes(k)))throw Error('运行选择包含未知字段');
 const {startDay:start,endDay:end,currentDay:current}=selection;
 if(![start,end,current].every(Number.isInteger)||start<current||current<0||end<=start||end>44)throw Error('日窗口无效');
 d.parameterContext={scope,effectiveDay:start};refreshDerived(d,start);
 const ready=supplyReadiness(computationInput(d),selection),demands=rows(d,'每日需求').filter(r=>(d.dailyContext||Number(r['需求日'])>=start)&&Number(r['需求日'])<end);
 if(!demands.length)ready.issues.push({code:'EMPTY_SELECTION',sheet:'每日需求',field:'需求日',message:'所选窗口无需求',severity:'error'});
 if(selection.demandIds!==undefined&&(!Array.isArray(selection.demandIds)||!selection.demandIds.length||new Set(selection.demandIds).size!==selection.demandIds.length||selection.demandIds.some(id=>!demands.some(r=>r['需求编号']===id))))ready.issues.push({code:'DEMAND_CHANGED',sheet:'每日需求',field:'需求编号',message:'所选需求已不存在或超出日窗，请显式重选',severity:'error'});
 const checkedRef={model:'workbook',datasetId:d.id,version:d.version,inputHash:hash(data),...sourceIdentity(d),scope,effectiveAt:start,selectionHash:hash(selection),actualRecordsHash:hash(d.effectiveParameters||rows(d,'配置参数'))};
 return {ready:ready.issues.length===0,issues:ready.issues,supported:ready.supported,completenessIssues:ready.completenessIssues,dependencyClosure:ready.dependencyClosure,checkedRef,token:hash(checkedRef),selection,parameterScope:scope};
}

export function validateImportType(parsed,kind){
 if(kind==='parameter'&&!parsed.parameterWorkbook||kind==='business'&&parsed.parameterWorkbook)throw Error('文件类型与独立导入卡不符，请选择正确入口');
 if(kind==='parameter'&&rows(parsed,'配置参数').some(p=>p['作用范围']&&p['作用范围']!=='dataset'))throw Error('批量trial导入未开放，请使用数据集候选/采用或逐项试算维护');
}
