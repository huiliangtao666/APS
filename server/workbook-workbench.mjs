import {hash,rows,workbookSchema,refreshDerived} from './workbook-model.mjs';
import {scopeFor} from './parameter-contract.mjs';
import {supplyReadiness} from './workbook-supply.mjs';

// The new cards are strict. Omitted kind retains the legacy mixed-workbook API.
export function importBinding(body,{id,expectedVersion,exists,actor}) {
 const importKind=body.importKind;
 if(importKind===undefined)return {mode:body.adoptParameters===true?'dataset':'candidate',scope:'dataset'};
 if(!['business','parameter','mixed'].includes(importKind))return {error:'import_kind_invalid',status:422};
 if(importKind==='parameter'&&!exists)return {error:'parameter_target_required',status:422};
 if(body.expectedVersion!==expectedVersion)return {error:'preview_stale',status:409,actualVersion:expectedVersion};
 const mode=body.mode||'candidate',scope=body.scope||'dataset';
 if(!['candidate','dataset'].includes(mode)||scope!=='dataset')return {error:'bulk_trial_not_supported',status:422};
 if(importKind==='business'&&body.adoptParameters===true)return {error:'business_parameter_adoption_requires_parameter_card',status:422};
 if((mode==='dataset')!==(body.adoptParameters===true))return {error:'adoption_mode_mismatch',status:422};
 return {importKind:importKind==='mixed'?undefined:importKind,requestedKind:importKind,targetId:id,mode,scope,owner:actor};
}
export function bindPreview(p) {
 if(!p.requestedKind)return;
 p.previewFingerprint=hash({id:p.id,target:p.datasetId,version:p.expectedVersion,file:p.fileHash,kind:p.requestedKind,mode:p.mode,scope:p.scope,owner:p.owner,snapshot:p.snapshotHash,changes:p.changeSet});
}
export function commitBinding(p,b,actor) {
 if(!p.requestedKind)return null;
 if(p.owner!==actor)return 'preview_owner_changed';
 if(b.previewFingerprint!==p.previewFingerprint||b.importKind!==p.requestedKind||b.datasetId!==p.datasetId||b.mode!==p.mode||b.scope!==p.scope)return 'preview_binding_changed';
 return null;
}
export function sourceIdentity(d) {
 const sourceFiles=[{kind:'business',fileHash:d.fileHash,name:d.businessFileName||d.name},...(d.parameterSources||[]).map(p=>({kind:'parameter',...p}))];
 return {sourceFiles,overlay:d.overlay||[],mappingHash:hash(d.mapping),parameterHash:hash(rows(d,'配置参数'))};
}
export function prepareBusinessImport(incoming,old) {
 const d=structuredClone(incoming);
 d.sourceFiles=[{kind:'business',fileHash:d.fileHash},...(old?.sourceFiles||[]).filter(p=>p.kind!=='business')];
 if(!old)return d;
 // Explicit business replacement replaces tables/rows, never appends old demand.
 // Parameter entities keep their own authoritative source and scope. Rebuild base
 // literals from the new file rather than restoring old effective table values.
 for(const k of ['parameterContract','parameterCandidates','parameterDefinitions','parameterCategories','parameterAnnotations','parameterCounts','parameterClassification','parameterSources','parameterTrials','bomLossProfiles'])if(old[k]!==undefined)d[k]=structuredClone(old[k]);
 d.overlay=[...(old.overlay||[]),{version:d.version,operation:'business-file-replacement',previousFileHash:old.fileHash,fileHash:d.fileHash}];
 if(old.parameterContract){d.tables['配置参数']=structuredClone(rows(old,'配置参数'));d.parameterBaseFields=[];d.bindings=(d.bindings||[]).filter(b=>rows(d,'配置参数').some(p=>p['参数编号']===b.parameterId));}
 return d;
}
export function importChanges(old,next) {
 const changes=[];
 for(const [table,spec] of Object.entries(workbookSchema.tables)) {
  if(spec.kind!=='输入')continue;
  const key=r=>table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):String(r[spec.key]);
  const before=new Map(rows(old||{tables:{}},table).map(r=>[key(r),r])),after=new Map(rows(next,table).map(r=>[key(r),r]));
  for(const id of new Set([...before.keys(),...after.keys()])) {
   const a=before.get(id),b=after.get(id),fields=spec.fields.filter(f=>a?.[f.name]!==b?.[f.name]).map(f=>({field:f.name,before:a?.[f.name]??null,after:b?.[f.name]??null}));
   if(fields.length)changes.push({table,key:id,operation:!a?'create':!b?'delete':'replace',fields});
  }
 }
 return changes;
}
export function checkSelection(data,body,actor) {
 const d=structuredClone(data),selection=body.selection||{},scope=scopeFor(d,body.parameterScope,actor);
 if(Object.keys(selection).some(k=>!['startDay','endDay','currentDay','demandIds'].includes(k)))throw Error('运行选择包含未知字段');
 const {startDay:start,endDay:end,currentDay:current}=selection;
 if(![start,end,current].every(Number.isInteger)||start<current||current<0||end<=start||end>44)throw Error('日窗口无效');
 d.parameterContext={scope,effectiveDay:start};refreshDerived(d,start);
 const ready=supplyReadiness(d),demands=rows(d,'每日需求').filter(r=>Number(r['需求日'])>=start&&Number(r['需求日'])<end);
 if(!demands.length)ready.issues.push({code:'EMPTY_SELECTION',sheet:'每日需求',field:'需求日',message:'所选窗口无需求',severity:'error'});
 if(selection.demandIds!==undefined&&(!Array.isArray(selection.demandIds)||!selection.demandIds.length||new Set(selection.demandIds).size!==selection.demandIds.length||selection.demandIds.some(id=>!demands.some(r=>r['需求编号']===id))))ready.issues.push({code:'DEMAND_CHANGED',sheet:'每日需求',field:'需求编号',message:'所选需求已不存在或超出日窗，请显式重选',severity:'error'});
 const checkedRef={model:'workbook',datasetId:d.id,version:d.version,inputHash:hash(data),...sourceIdentity(d),scope,effectiveAt:start,selectionHash:hash(selection),actualRecordsHash:hash(d.effectiveParameters||rows(d,'配置参数'))};
 return {ready:ready.issues.length===0,issues:ready.issues,supported:ready.supported,checkedRef,token:hash(checkedRef),selection,parameterScope:scope};
}

export function validateImportType(parsed,kind){
 if(kind==='parameter'&&!parsed.parameterWorkbook||kind==='business'&&parsed.parameterWorkbook)throw Error('文件类型与独立导入卡不符，请选择正确入口');
 if(kind==='parameter'&&rows(parsed,'配置参数').some(p=>p['作用范围']&&p['作用范围']!=='dataset'))throw Error('批量trial导入未开放，请使用数据集候选/采用或逐项试算维护');
}
