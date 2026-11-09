import {randomUUID} from 'node:crypto';
import {atomicFields,effectiveParameters,parameterSpec,sourceRole,blockedParameter} from './parameter-contract.mjs';
import {sourceFields} from './parameter-source-fields.mjs';

// Written in the preview snapshot; visible only after import commit. Compare
// every effective boundary, retaining online overlays and future-period changes.
export function recordConfigurationImportChanges(old,next,{actor,fileHash,fileName,kind}){
 const specs=[...atomicFields.filter(s=>['物料主数据','物料清单'].includes(s.table)),...['CP026','CP027','CP028','CP039'].flatMap(cp=>sourceFields(cp,next).map(s=>({...s,cp})))];
 const parameterRows=d=>[...(d?.tables?.配置参数||[]),...(d?.parameterCandidates||[])];
 const days=[...new Set([0,44,...[...parameterRows(old),...parameterRows(next)].filter(p=>['物料主数据','物料清单'].includes(parameterSpec(p)?.table)).flatMap(p=>[Number(p.生效日),Number(p.失效日)])])].filter(Number.isFinite).sort((a,b)=>a-b);
 const resolve=(d,day)=>{
  const values=new Map(),base=new Map((d?.parameterBaseFields||[]).map(b=>[[b.table,b.object,b.field].join('|'),b]));
  for(const spec of specs)for(const row of d?.tables?.[spec.table]||[]){
   const key=[spec.table,row[spec.key],spec.name].join('|'),b=base.get(key),value=b?(b.present?b.value:undefined):row[spec.name];
   if(value!==undefined)values.set(key,value);
  }
  const references=(d?.parameterCandidates||[]).filter(p=>Number(p.生效日)<=day&&day<Number(p.失效日)).sort((a,b)=>Number(sourceRole(a)==='EDIT')-Number(sourceRole(b)==='EDIT'));
  for(const p of [...effectiveParameters(d||{tables:{}},day),...references]){
   const spec=parameterSpec(p);if(['物料主数据','物料清单'].includes(spec?.table))values.set([spec.table,p.对象编号,p.参数名称].join('|'),blockedParameter(p)?undefined:p.参数值);
  }
  return values;
 };
 for(let i=0;i<days.length-1;i++){
  const start=days[i],end=days[i+1],before=resolve(old,start),after=resolve(next,start);
  for(const spec of specs){
   const objects=new Set([...(old?.tables?.[spec.table]||[]),...(next.tables?.[spec.table]||[])].map(r=>r[spec.key]));
   for(const object of objects){
    const key=[spec.table,object,spec.name].join('|'),a=before.get(key),b=after.get(key);if(a===b)continue;
    (next.parameterChangeLog??=[]).push({id:randomUUID(),at:next.createdAt,actor,revision:next.parameterRevision||0,datasetVersion:next.version,baselineHash:fileHash,sourceFile:fileName,scope:'dataset',cp:spec.cp,table:spec.table,object,field:spec.name,operation:kind==='parameter'?'导入参数':'导入业务数据',reference:!!spec.candidate,before:a===undefined?null:{参数值:a},after:b===undefined?null:{参数值:b,生效日:String(start),失效日:String(end)}});
   }
  }
 }
}
