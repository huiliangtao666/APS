import {parameterCatalog,definition,canonicalCp,cpOf,parameterIssues,scopeOf,scopeFor,validateComposite,specification} from './parameter-contract.mjs';
const headers=['参数编号','对象编号','对象名称','参数名称','参数值','单位','生效日','失效日','参数说明'];
export function parseParameterSheets(names,getCells){
 const result={parameterWorkbook:true,tables:{'配置参数':[]},bindings:[],classification:[],issues:[],warnings:[],parameterDefinitions:[],parameterCategories:[],parameterAnnotations:{discussions:[],questions:[],reference:[]},schemaVersion:'CR-PARAM-UI-20261101:r1'};
 const add=(sheet,row,field,message)=>result.issues.push({severity:'error',code:'PARAMETER_IMPORT',sheet,row,field,record:'',message});
 for(const name of names){const cells=getCells(name),columns=new Map(),records=new Map();
  for(const [a,c]of cells)if(a.match(/\d+$/)?.[0]==='2'&&c.value){const col=a.replace(/\d/g,'');if(c.value.startsWith('_')||['constructor','prototype'].includes(c.value)){add(name,2,c.value,'保留字段不可导入');continue;}if([...columns.values()].includes(c.value))add(name,2,c.value,'重复中文表头');columns.set(col,c.value);}
  for(const [address,c]of cells){const m=address.match(/^([A-Z]+)(\d+)$/);if(!m||Number(m[2])<3||!c.value&&c.formula===null)continue;const field=columns.get(m[1]);if(!field)continue;const row=Number(m[2]);if(!records.has(row))records.set(row,{_row:row,_cells:{},_formulas:{}});const r=records.get(row);r[field]=c.value;r._cells[field]=address;if(c.formula!==null)r._formulas[field]=c.formula;}
  const values=[...records.values()];let kind='解释资料';
  if(name==='参数清单'){kind='参数目录';const ids=new Set();for(const r of values){try{definition(r['参数编号']);if(ids.has(r['参数编号']))throw Error('CP目录编号重复');ids.add(r['参数编号']);}catch(e){add(name,r._row,'参数编号',e.message);}}result.parameterDefinitions=values;}
  else if(name==='仿真参数实例'){kind='参数实例';for(const h of columns.values())if(![...headers,'性质','CP编号','作用范围','来源版本','资料状态'].includes(h))add(name,2,h,'未知实例列，须明确映射');for(const h of headers.filter(h=>h!=='参数说明'))if(![...columns.values()].includes(h))add(name,2,h,'缺少参数实例字段');for(const r of values){if(r['CP编号']){try{definition(r['CP编号']);r._cp=r['CP编号'];if(String(r['参数值']).startsWith('{'))r['参数值']=validateComposite(r._cp,JSON.parse(r['参数值']));}catch(e){add(name,r._row,'CP编号',e.message);}}if(Object.keys(r._formulas).length)add(name,r._row,Object.keys(r._formulas)[0],'参数实例必须是字面值，公式不执行');if(!cpOf(r))add(name,r._row,'参数名称','未映射的参数名称：'+r['参数名称']);}result.tables['配置参数']=values;}
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
export function integrateParameterImport(parsed,old,{id,name,expectedVersion,fileHash,adoptParameters=false,actor}){
 const d=old?structuredClone(old):{id,name,profile:'parameter-catalog-202611-r1',tables:{},bindings:[],mapping:null,drafts:[]};
 Object.assign(d,{id,name,version:expectedVersion+1,createdAt:new Date().toISOString(),parameterContract:'CR-PARAM-UI-20261101:r1'});
 // Main source remains a full business workbook when enriching an existing dataset.
 d.fileHash=old?.fileHash||fileHash;d.parameterSources=[...(old?.parameterSources||[]),{fileHash,mappingVersion:parsed.schemaVersion,mode:adoptParameters?'dataset':'candidate',counts:parsed.parameterCounts}];
 d.parameterDefinitions=parsed.parameterDefinitions;d.parameterCategories=parsed.parameterCategories;d.parameterAnnotations=parsed.parameterAnnotations;d.parameterCounts=parsed.parameterCounts;
 d.parameterClassification=parsed.classification;d.classification=old?.classification||parsed.classification;d.warnings=[...(old?.warnings||[]),...parsed.warnings];
 const activeTarget=d.tables['配置参数']??=[],candidateTarget=d.parameterCandidates??=[];
 for(const r of parsed.tables['配置参数']){const cp=cpOf(r),spec=specification(r['参数名称'],cp),candidate=!adoptParameters||r['资料状态']==='candidate'||!spec||!!spec.candidate,target=candidate?candidateTarget:activeTarget;const scope=scopeFor(d,r['作用范围'],actor);if(scope!=='dataset'&&(!spec||spec.global||spec.candidate))throw Error('此参数不支持仅本次试算覆盖');if(!candidate&&spec.global&&r['对象编号']!=='GLOBAL')throw Error('全局参数须采用GLOBAL对象');const incoming={...r,_cp:cp,_scope:scope,_candidate:candidate,_source:{fileHash,sheet:'仿真参数实例',row:r._row,mappingVersion:parsed.schemaVersion}};const identities=[...activeTarget,...candidateTarget].filter(p=>p['参数编号']===r['参数编号']);if(identities.some(p=>p['对象编号']!==r['对象编号']||p['参数名称']!==r['参数名称']||canonicalCp(cpOf(p))!==canonicalCp(cp)||scopeOf(p)!==scope))throw Error('参数实例编号与既有身份冲突：'+r['参数编号']);const prior=target.find(p=>p['参数编号']===r['参数编号']);if(prior)Object.assign(prior,incoming);else target.push(incoming);}
 // Candidate numeric samples still get type and period validation, without requiring business adoption.
 const candidateProbe={...d,parameterCandidatesOnly:true,tables:{...d.tables,'配置参数':candidateTarget}};
 const activeProbe={...d,tables:{...d.tables,'配置参数':activeTarget}};
 const issues=[...parsed.issues,...parameterIssues(activeProbe),...parameterIssues(candidateProbe)];
 d.checkedAt=null;d.checksInvalidated=true;
 return {d,issues,counts:parsed.parameterCounts};
}
export function parameterTemplate(){return {definitions:parameterCatalog.map(d=>Object.fromEntries(Object.entries(d).filter(([k])=>!['参数条目','统一配置页签','流程步骤入口','呈现与编辑模式'].includes(k)))),headers,requiredSheets:['参数清单','仿真参数分类','仿真参数实例'],mappingVersion:'CR-PARAM-UI-20261101:r1'};}
