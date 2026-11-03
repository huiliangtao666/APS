import {replaceIntervals,parameterThreeWay,removeConfirmedOverlays} from './parameter-layers.mjs';
import {parameterCatalog,definition,canonicalCp,cpOf,parameterIssues,scopeOf,scopeFor,validateComposite,specification,parameterSpec,sourceRole,tagParameterSources,blockedParameter,precedenceVersion,parameterDimension} from './parameter-contract.mjs';
const headers=['参数编号','对象编号','对象名称','参数名称','参数值','单位','生效日','失效日','参数说明'];
export function parseParameterSheets(names,getCells){
 const result={parameterWorkbook:true,tables:{'配置参数':[]},bindings:[],classification:[],issues:[],warnings:[],parameterDefinitions:[],parameterCategories:[],parameterAnnotations:{discussions:[],questions:[],reference:[]},schemaVersion:'CR-PARAM-UI-20261101:r1'};
 const add=(sheet,row,field,message)=>result.issues.push({severity:'error',code:'PARAMETER_IMPORT',sheet,row,field,record:'',message});
 for(const name of names){const cells=getCells(name),columns=new Map(),records=new Map();
  for(const [a,c]of cells)if(a.match(/\d+$/)?.[0]==='2'&&c.value){const col=a.replace(/\d/g,'');if(c.value.startsWith('_')||['constructor','prototype'].includes(c.value)){add(name,2,c.value,'保留字段不可导入');continue;}if([...columns.values()].includes(c.value))add(name,2,c.value,'重复中文表头');columns.set(col,c.value);}
  for(const [address,c]of cells){const m=address.match(/^([A-Z]+)(\d+)$/);if(!m||Number(m[2])<3||!c.value&&c.formula===null)continue;const field=columns.get(m[1]);if(!field)continue;const row=Number(m[2]);if(!records.has(row))records.set(row,{_row:row,_cells:{},_formulas:{}});const r=records.get(row);r[field]=c.value;r._cells[field]=address;if(c.formula!==null)r._formulas[field]=c.formula;}
  const values=[...records.values()];let kind='解释资料';
  if(name==='参数清单'){kind='参数目录';const ids=new Set();for(const r of values){try{definition(r['参数编号']);if(ids.has(r['参数编号']))throw Error('CP目录编号重复');ids.add(r['参数编号']);}catch(e){add(name,r._row,'参数编号',e.message);}}result.parameterDefinitions=values;}
  else if(name==='仿真参数实例'){kind='参数实例';for(const h of columns.values())if(![...headers,'性质','CP编号','作用范围','来源版本','资料状态','来源层','来源profile','对象类型','源PA编号','来源文件hash','生效日期','失效日期'].includes(h))add(name,2,h,'未知实例列，须明确映射');for(const h of headers.filter(h=>h!=='参数说明'))if(![...columns.values()].includes(h))add(name,2,h,'缺少参数实例字段');for(const r of values){if(r['CP编号']){try{definition(r['CP编号']);r._cp=r['CP编号'];if(String(r['参数值']).startsWith('{'))r['参数值']=validateComposite(r._cp,JSON.parse(r['参数值']));}catch(e){add(name,r._row,'CP编号',e.message);}}if(Object.keys(r._formulas).length)add(name,r._row,Object.keys(r._formulas)[0],'参数实例必须是字面值，公式不执行');if(!cpOf(r))result.warnings.push({code:'PARAMETER_PENDING',sheet:name,row:r._row,field:'参数名称',message:'未支持的参数语义保留资料层：'+r['参数名称']});}result.tables['配置参数']=values;}
  else if(/参数分类/.test(name)){kind='参数分类';result.parameterCategories=values;}
  else if(/讨论/.test(name)){kind='讨论';result.parameterAnnotations.discussions.push(...values);}
  else if(/校验|问题/.test(name)){kind='校验问题';result.parameterAnnotations.questions.push(...values);}
  else result.parameterAnnotations.reference.push({sheet:name,rows:values});
  result.classification.push({sheet:name,kind,rows:values.length});
 }
 const instanceIds=new Set();for(const r of result.tables['配置参数']){if(!r['参数编号']||instanceIds.has(r['参数编号']))add('仿真参数实例',r._row,'参数编号','参数实例编号为空或重复');instanceIds.add(r['参数编号']);const named=specification(r['参数名称']);if(r._cp&&named&&canonicalCp(r._cp)!==canonicalCp(named.cp))add('仿真参数实例',r._row,'CP编号','CP语义与原子字段映射不一致');}
 for(const required of ['参数清单','仿真参数实例','仿真参数分类'])if(!names.includes(required))add(required,0,'','缺少参数工作簿必需分层工作表');
 const cpIds=new Set(result.parameterDefinitions.map(r=>r['参数编号']));for(const r of result.tables['配置参数'])if(cpOf(r)&&!cpIds.has(cpOf(r)))add('仿真参数实例',r._row,'参数名称','实例对应CP在本目录中不存在');
 for(const r of result.parameterCategories){for(const v of Object.values(r).filter(v=>typeof v==='string'))for(const m of v.matchAll(/CP\d{3}/g))if(!cpIds.has(m[0]))add('仿真参数分类',r._row,'CP引用','SP引用不存在：'+m[0]);}
 result.parameterCounts={definitions:result.parameterDefinitions.length,categories:result.parameterCategories.length,instances:result.tables['配置参数'].length,discussions:result.parameterAnnotations.discussions.length,questions:result.parameterAnnotations.questions.length};
 return result;
}
export function integrateParameterImport(parsed,old,{id,name,expectedVersion,fileHash,adoptParameters=false,actor,overlayResolution='keep'}){
 if(!['keep','replace'].includes(overlayResolution))throw Error('在线覆盖处置须为keep或replace');
 const d=tagParameterSources(old?structuredClone(old):{id,name,profile:'parameter-catalog-202611-r1',tables:{},bindings:[],mapping:null,drafts:[]});
 Object.assign(d,{id,name,version:expectedVersion+1,createdAt:new Date().toISOString(),parameterContract:'CR-PARAM-UI-20261101:r1'});
 d.fileHash=old?.fileHash||fileHash;
 const source={fileHash,mappingVersion:parsed.schemaVersion,mode:adoptParameters?'dataset':'candidate',role:'P',counts:parsed.parameterCounts};
 d.parameterSources=[...(old?.parameterSources||[]),source];
 if(adoptParameters){
  d.parameterBaseline={fileHash,version:(d.parameterBaseline?.version||new Set((old?.parameterSources||[]).filter(s=>s.mode==='dataset').map(s=>s.fileHash)).size)+1,importedAt:d.createdAt,datasetVersion:d.version};d.parameterRevision=0;
  const definitions=new Map((d.parameterDefinitions||[]).map(p=>[p['参数编号'],p]));
  for(const p of parsed.parameterDefinitions)definitions.set(p['参数编号'],p);
  d.parameterDefinitions=[...definitions.values()];
 }else d.parameterCandidateDefinitions=parsed.parameterDefinitions;
 d.parameterCategories=parsed.parameterCategories;d.parameterAnnotations=parsed.parameterAnnotations;d.parameterCounts=parsed.parameterCounts;
 d.parameterClassification=parsed.classification;d.classification=old?.classification||parsed.classification;d.warnings=[...(old?.warnings||[]),...parsed.warnings];
 const active=[],candidates=[];
 for(const r of parsed.tables['配置参数']){
  const cp=cpOf(r),spec=parameterSpec({...r,_cp:cp}),scope=scopeFor(d,r['作用范围'],actor);
  if(scope!=='dataset')throw Error('批量trial导入未开放');
  const missing=blockedParameter(r)||String(r['参数值']??'').trim()==='',suggested=cp==='CP080'&&!(r['资料状态']==='dataset'&&r['源PA编号']&&r['来源层']==='EDIT')&&/建议/.test(d.parameterDefinitions?.find(p=>p['参数编号']===cp)?.['权威来源及校验备注']||'');
  const candidate=!adoptParameters||r['资料状态']==='candidate'||!spec||!!spec.candidate||r['来源profile']&&r['来源profile']!=='workbook-day'||r['对象类型']&&spec?.table&&r['对象类型']!==spec.table;
  if(!candidate&&((spec.global&&r['对象编号']!=='GLOBAL')||(spec.calendarGlobal&&r['对象编号']!=='CAL')))throw Error('全局参数须采用GLOBAL对象');
  const incoming={...r,_cp:cp,_scope:scope,_sourceRole:'P',_profile:r['来源profile']||'workbook-day',_objectType:r['对象类型'],_candidate:candidate,_blocked:!!missing||!candidate&&suggested,_pendingReason:missing?'第二份明确未配置/待补':suggested?'路线派生仅为建议；可显式维护已支持字面值，不能执行建议公式':candidate?'候选或执行规则未支持':undefined,_source:{role:'P',fileHash,previousFileHash:r['来源文件hash'],originalSourceId:r['源PA编号'],sheet:'仿真参数实例',row:r._row,mappingVersion:parsed.schemaVersion}};
  incoming._dimension=parameterDimension(d,incoming);(candidate?candidates:active).push(incoming);
 }
 // Validate the entire incoming level BEFORE interval replacement. Otherwise
 // overlapping rows within one P file could silently pick a last-row winner.
 const probe=values=>({...d,parameterCandidatesOnly:true,tables:{...d.tables,'配置参数':values}});
 const issues=[...parsed.issues,...parameterIssues(probe(active),{completeness:false}),...parameterIssues(probe(candidates),{completeness:false})];
 d.parameterThreeWay=parameterThreeWay(d,active);d.overlayResolution=overlayResolution;
 let existing=d.tables['配置参数']||[];
 if(adoptParameters&&overlayResolution==='replace')existing=[...existing.filter(p=>sourceRole(p)!=='EDIT'),...removeConfirmedOverlays(existing,active)];
 d.tables['配置参数']=replaceIntervals(existing,active);
 d.parameterCandidates=replaceIntervals(d.parameterCandidates||[],candidates);
 d.parameterPrecedence=precedenceVersion;d.checkedAt=null;d.checksInvalidated=true;
 const completenessIssues=parameterIssues(d).filter(i=>['PARAMETER_OBJECT_UNMAPPED','PARAMETER_REQUIRED'].includes(i.code));
 d.parameterPending=[...active.filter(p=>p._blocked),...candidates].map(p=>({id:p['参数编号'],object:p['对象编号'],field:p['参数名称'],reason:p._pendingReason,source:p._source}));
 d.parameterPending.push(...completenessIssues.filter(i=>i.code==='PARAMETER_OBJECT_UNMAPPED').map(i=>({id:i.record,reason:i.message,sheet:i.sheet,row:i.row})));
 return {d,issues,completenessIssues,counts:parsed.parameterCounts};
}
export function parameterTemplate(){return {definitions:parameterCatalog.map(d=>Object.fromEntries(Object.entries(d).filter(([k])=>!['参数条目','统一配置页签','流程步骤入口','呈现与编辑模式'].includes(k)))),headers,requiredSheets:['参数清单','仿真参数分类','仿真参数实例'],mappingVersion:'CR-PARAM-UI-20261101:r1'};}
