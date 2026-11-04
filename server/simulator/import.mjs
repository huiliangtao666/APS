import {VERSION, SimulationError, requireThat as need, copy, fingerprint, date, minute, id} from './contract.mjs';
import {validateSpec} from './model.mjs';
import {IMPORT_VERSION, frozenSource, frozenSourceCopy, workbookSource, resolveSource} from './source.mjs';
import {blockedParameter} from '../parameter-contract.mjs';

const number=(value,path)=>{
  need((typeof value==='number'||typeof value==='string')&&String(value).trim()!==''&&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))&&Number.isFinite(Number(value)),
    'NATIVE_NUMBER_REQUIRED',path,'缺明确数值；空白不能当0');return Number(value);
};
const integer=(v,p)=>{const n=number(v,p);need(Number.isSafeInteger(n),'INTEGER_REQUIRED',p,'须显式整数');return n;};
const text=(v,p)=>{need(typeof v==='string'&&v.trim(),'NATIVE_FIELD_REQUIRED',p,'缺真实来源字段');return v;};
const shiftDate=(zero,n)=>new Date(Date.parse(date(zero)+'T00:00:00Z')+integer(n,'day')*86400000).toISOString().slice(0,10);
function timeAt(origin,n){const value=minute(origin)+integer(n,'minuteOffset');return new Date((value+480)*60000).toISOString().slice(0,19)+'+08:00';}

/** Conversion preview never persists a branch. Partial mappings are inspectable,
 * but only a complete validated spec can be passed to the existing create API. */
export function convertNative(request,schema) {
  const source=request.kind==='FROZEN_SOURCE_COPY'?frozenSourceCopy(request.frozenSource,request.selection):
    request.kind==='FROZEN_RUN_COPY'?frozenSource(request.frozen,schema):
    request.kind==='WORKBOOK_BYTES_COPY'?workbookSource(request.workbooks,schema):null;
  need(source,'SOURCE_KIND_REQUIRED','kind','选择冻结来源副本、原run/input或B/P原件');
  return convertSource(source,request,request.kind==='FROZEN_SOURCE_COPY'?request.frozenSource.workbookSchema:schema);
}

export function convertSource(source,{calendar,opening,script,production},schema) {
  const resolved=resolveSource(source,calendar),{input:d,day,archive,active}=resolved,diagnostics=[];
  const report=(code,path,message,severity='BLOCKED')=>diagnostics.push({code,path,message,severity});
  const attempt=(path,fn)=>{try{return fn();}catch(e){if(!(e instanceof SimulationError))throw e;report(e.code,e.path||path,e.message);return null;}};
  const rows=t=>{need(schema.tables[t]?.fields,'NATIVE_SCHEMA_MISSING',t,'注入schema不含此原生表');
    need(Array.isArray(d.tables[t]),'NATIVE_TABLE_REQUIRED',t,'源表缺失不等于空表');return d.tables[t];};
  const field=(table,row,name)=>{need(schema.tables[table].fields.some(f=>f.name===name),'NATIVE_FIELD_UNMAPPED',table+'.'+name,'当前schema未声明该字段');
    return row[name];};
  const ref=(table,row)=>({kind:source.kind,datasetId:source.identity.datasetId,version:source.identity.version,
    runId:source.identity.runId??null,inputHash:source.identity.inputHash,table,key:row[schema.tables[table].key],row:row._row??null});
  const requiredFields={物料主数据:['物料编号','物料名称','基础单位'],期初库存:['库存批次编号','物料编号','数量单位','当前数量','期初已占用量','质量状态','快照日','放行日','到期日','库位编号'],
    既有采购在途:['在途记录编号','物料编号','数量单位','订购数量','采购订单编号','订单行号','约定到货日'],每日需求:['需求编号','成品编号','需求千克','客户编号','需求日'],
    物料清单:['用量关系编号','父项编号','子项编号','清单版本编号','生效日','失效日','数量单位','父项基准产出千克','子项基准用量','标准收率']};
  for(const [table,names]of Object.entries(requiredFields))for(const name of names)need(schema.tables[table]?.fields.some(f=>f.name===name),
    'NATIVE_FIELD_UNMAPPED',table+'.'+name,'当前真实schema缺所需字段，不能沿私有旧字段读取');
  date(calendar.endDate,'calendar.endDate');date(calendar.coverageEnd,'calendar.coverageEnd');
  need(opening&&opening.asOf===calendar.startDate+'T00:00:00+08:00','OPENING_ASOF_REQUIRED','opening.asOf','须明确模拟开始零点的期初事实，不能挪动旧快照日期');
  text(opening.version,'opening.version');text(opening.source,'opening.source');
  need(opening.inventoryBasis==='AFTER_CONSUMPTION','INVENTORY_BASIS_REQUIRED','opening.inventoryBasis','期初实物须为已扣耗后口径；不自动加回或重复扣累计耗料');
  need(script&&Array.isArray(script.events)&&script.rules?.version&&/^[a-f0-9]{64}$/.test(script.rules.hash),
    'SCRIPT_REQUIRED','script','须显式事件数组及规则版本/hash，无脚本不能猜生产/收货/放行');
  need(production&&['NON_PRODUCTION','FROZEN_TASKS'].includes(production.mode)&&Array.isArray(production.taskIds),
    'PRODUCTION_SELECTION_REQUIRED','production','须显式选择不生产或冻结taskIds');
  need(production.mode!=='NON_PRODUCTION'||production.taskIds.length===0,'PRODUCTION_SELECTION_CONFLICT','production','不生产模式不能选作业');
  const materialRows=rows('物料主数据'),materials=[],lots=[],purchases=[],demands=[],resources=[],tasks=[];
  const byMaterial=new Map();
  for(const r of materialRows)attempt('物料主数据',()=>{
    const key=id(field('物料主数据',r,'物料编号'),'物料编号'),unit=text(field('物料主数据',r,'基础单位'),key+'.基础单位');
    need(!byMaterial.has(key),'DUPLICATE_NATIVE_ID',key,'物料身份重复');
    const scale=integer(opening.materialScales?.[key],'opening.materialScales.'+key);
    need([1,10,100,1000,10000,100000,1000000].includes(scale),'MATERIAL_PRECISION_REQUIRED',key,'精度必须显式提供，不能从样例数量猜');
    const m={id:key,unit,scale,name:text(r['物料名称'],key+'.物料名称'),lineage:ref('物料主数据',r)};materials.push(m);byMaterial.set(key,m);
  });
  const material=(key,unit,path)=>{const m=byMaterial.get(key);need(m,'MISSING_REFERENCE',path,'找不到物料 '+key);
    need(unit===m.unit,'UNIT_CONVERSION_REQUIRED',path,'原单位与基础单位不同，须明确换算，不能跨量纲');return m;};
  const openingFact=(group,key)=>{
    const fact=opening[group]?.[key];need(fact&&fact.source&&fact.asOf===opening.asOf,'OPENING_FACT_REQUIRED','opening.'+group+'.'+key,'缺本身份、观测时点及来源的累计事实');return fact;
  };
  const global=name=>active.find(p=>p['对象编号']===(name==='日粒度放行时点分钟'?'CAL':'GLOBAL')&&p['参数名称']===name);
  const globalValue=name=>{const p=global(name);need(p&&!blockedParameter(p),'PARAMETER_VALUE_REQUIRED',name,'有效P缺值，不回退B');return p['参数值'];};
  const boundary=(name,dayValue)=>timeAt(calendar.dayZero+'T00:00:00+08:00',integer(dayValue,name)*1440+
    integer(globalValue(name),name));
  const references={bom:[],parameters:archive,sourceIdentity:copy(source.identity),timeBases:{dayZero:calendar.dayZero,minuteOrigin:calendar.minuteOrigin,
    csvMinuteOrigin:'2026-11-02T08:00:00+08:00',timeZone:'Asia/Shanghai',interval:'[start,end)'},
    nativeCoverage:[],bomLossProfiles:copy(d.bomLossProfiles??[]),
    openingIdentity:{asOf:opening.asOf,version:opening.version,source:opening.source,hash:fingerprint(opening)},
    ...(source.seam?{frozenSource:copy(source.seam)}:{}),
    sourceTimeMetadata:{input:{minuteOrigin:source.input.minuteOrigin??null,timeUnit:source.input.timeUnit??null,dayZero:source.input.dayZero??null},
      provenance:copy(source.run?.provenance??null),plan:{minuteOrigin:source.run?.result?.minuteOrigin??null,timeUnit:source.run?.result?.timeUnit??null,dayZero:source.run?.result?.dayZero??null}}};
  for(const gap of source.seam?.gaps??[])report('FROZEN_SOURCE_GAP',gap.path,String(gap.status),'NOT_COVERED');
  // Mapping sections are deliberately separate from author-supplied facts.
  for(const r of rows('期初库存'))attempt('期初库存',()=>{
    const key=id(field('期初库存',r,'库存批次编号'),'库存批次编号'),m=material(r['物料编号'],r['数量单位'],key),q=number(r['当前数量'],key+'.当前数量');
    const sourceDate=shiftDate(calendar.dayZero,field('期初库存',r,'快照日'));
    let values={quantity:q,externalReserved:number(r['期初已占用量'],key+'.期初已占用量')},quality=r['质量状态'],lineage=ref('期初库存',r);
    if(sourceDate!==calendar.startDate){const f=openingFact('lots',key);values={quantity:number(f.quantity,key+'.quantity'),externalReserved:number(f.externalReserved,key+'.externalReserved')};
      quality=text(f.quality,key+'.quality');lineage={...lineage,openingFact:copy(f)};}
    need(['已放行','合格','待检','冻结'].includes(quality),'QUALITY_MAPPING_REQUIRED',key+'.质量状态','未知质量状态不填0');
    const qualified=['已放行','合格'].includes(quality);
    if(qualified)need(shiftDate(calendar.dayZero,r['放行日'])<=calendar.startDate,
      'QUALITY_RELEASE_CONFLICT',key,'标记合格但来源放行日期晚于期初；须明确期初质量事实');
    const location=rows('库区库位').find(x=>x['库位编号']===r['库位编号']);
    lots.push({id:key,materialId:m.id,unit:m.unit,...values,pending:quality==='待检'?values.quantity:0,
      qualified:qualified?values.quantity:0,frozen:quality==='冻结'?values.quantity:0,
      expiresAt:boundary('批次到期日内失效分钟',r['到期日']),location:text(r['库位编号'],key+'.库位编号'),
      environment:text(location?.['储存环境'],key+'.储存环境'),lineage});
  });
  for(const r of rows('既有采购在途'))attempt('既有采购在途',()=>{
    const key=id(r['在途记录编号'],'在途记录编号'),m=material(r['物料编号'],r['数量单位'],key),f=openingFact('purchases',key);
    need(f.issued===true,'PURCHASE_ISSUED_REQUIRED',key,'建议或未知下达状态不能作为已下达采购');
    purchases.push({id:key,materialId:m.id,unit:m.unit,ordered:number(r['订购数量'],key+'.订购数量'),
      received:number(f.received,key+'.received'),cancelled:number(f.cancelled,key+'.cancelled'),issued:true,
      expectedArrival:shiftDate(calendar.dayZero,r['约定到货日']),po:r['采购订单编号'],line:r['订单行号'],
      lineage:{...ref('既有采购在途',r),openingFact:copy(f)}});
  });
  for(const r of rows('每日需求'))attempt('每日需求',()=>{
    const key=id(r['需求编号'],'需求编号'),m=material(r['成品编号'],'千克',key),f=openingFact('demands',key);
    demands.push({id:key,materialId:m.id,unit:m.unit,required:number(r['需求千克'],key+'.需求千克'),
      change:number(f.change,key+'.change'),cancelled:number(f.cancelled,key+'.cancelled'),shipped:number(f.shipped,key+'.shipped'),signed:number(f.signed,key+'.signed'),
      fulfillment:text(f.fulfillment,key+'.fulfillment'),customer:text(r['客户编号'],key+'.客户编号'),
      requiredDate:shiftDate(calendar.dayZero,r['需求日']),lineage:{...ref('每日需求',r),openingFact:copy(f)}});
  });
  // Remaining sections are assembled below; unknowns never become a runnable partial spec.
  return assembleConversion({source,resolved,calendar,opening,script,production,schema,d,day,active,diagnostics,report,attempt,
    rows,field,ref,globalValue,material,materials,lots,purchases,demands,resources,tasks,references});
}

function assembleConversion(c) {
  const {source,resolved,calendar,opening,script,production,d,day,diagnostics,report,attempt,rows,ref,globalValue,
    material,materials,lots,purchases,demands,resources,tasks,references}=c;
  const rawBom=rows('物料清单'),materialsById=new Map(materials.map(m=>[m.id,m]));
  const allRelations=new Set(),versions=new Map(),pairs=new Set();
  for(const r of rawBom)attempt('物料清单',()=>{
    const from=integer(r['生效日'],'物料清单.生效日'),until=integer(r['失效日'],'物料清单.失效日');
    need(until>from,'BOM_INTERVAL','物料清单','生效区间须非空');
    const rid=text(r['用量关系编号'],'用量关系编号');need(!allRelations.has(rid),'BOM_DUPLICATE',rid,'关系编号重复');allRelations.add(rid);
    const parent=text(r['父项编号'],rid),child=text(r['子项编号'],rid),unit=text(r['数量单位'],rid);
    need(materialsById.has(parent)&&materialsById.has(child),'BOM_REFERENCE',rid,'父/子项主数据缺失');
    need(unit===materialsById.get(child).unit,'BOM_UNIT',rid,'子项单位须明确等价，不自动换算');
    const base=number(r['父项基准产出千克'],rid),quantity=number(r['子项基准用量'],rid),yieldRate=number(r['标准收率'],rid);
    need(base>0&&quantity>=0&&yieldRate>0&&yieldRate<=1,'BOM_QUANTITY',rid,'基准/定额/收率越界');
    const effective=from<=day&&day<until,version=text(r['清单版本编号'],rid);
    if(effective){const vs=versions.get(parent)||new Set();vs.add(version);versions.set(parent,vs);
      const pair=JSON.stringify([parent,child]);need(!pairs.has(pair),'BOM_PAIR_CONFLICT',rid,'同一父子有多条有效关系');pairs.add(pair);}
    references.bom.push({id:rid,parent,child,version,from,until,effective,baseOutputKg:base,quantity,unit,yieldRate,
      quantityBasis:'QUALIFIED_OUTPUT_QUOTA_INCLUDES_LAYER_YIELD',automaticConsumption:false,raw:copy(r),lineage:ref('物料清单',r)});
  });
  for(const [parent,vs] of versions)if(vs.size>1)report('BOM_VERSION_CONFLICT',parent,'存在多套同时生效BOM，须显式选择');
  // Display edges only. Iterative traversal diagnoses cycles without recursive stack growth.
  const children=new Map();for(const e of references.bom.filter(e=>e.effective)){const xs=children.get(e.parent)||[];xs.push(e.child);children.set(e.parent,xs);}
  const seen=new Map();for(const root of materialsById.keys()){
    if(seen.has(root))continue;const stack=[{id:root,index:0}];seen.set(root,1);
    while(stack.length){const top=stack.at(-1),cs=children.get(top.id)||[];
      if(top.index>=cs.length){seen.set(top.id,2);stack.pop();continue;}
      const child=cs[top.index++];if(seen.get(child)===1)report('BOM_CYCLE',child,'有效BOM存在循环');
      else if(!seen.has(child)){seen.set(child,1);stack.push({id:child,index:0});}
    }
  }
  references.nativeCoverage=[...Object.entries(d.tables).map(([table,values])=>({table,rows:values.length,
    status:['物料主数据','物料清单','期初库存','既有采购在途','每日需求','配置参数'].includes(table)?'MAPPED_WITH_EXPLICIT_FACT_REQUIREMENTS':'REFERENCE_ONLY'}))];
  references.nativeContext={};
  for(const t of ['期初在制','在制剩余映射','工艺路线','设备与工装','班组资源','生产班次','停机安排','工厂日历','日业务时点规则','单位换算']){
    if(Array.isArray(d.tables[t]))references.nativeContext[t]=copy(d.tables[t]);
    else report('NATIVE_CONTEXT_NOT_COVERED',t,'来源无此表，未生造配套输入','NOT_COVERED');
  }
  const uncovered=[];
  attempt('calendar.coverageEnd',()=>{
    const available=new Set();for(const r of rows('工厂日历')){
      const actual=shiftDate(calendar.dayZero,r['日序']);
      need(String(r['公历日期']).replaceAll('.','-')===actual,'NATIVE_CALENDAR_MISMATCH','工厂日历.'+r['日序'],'原生日期与日序不符');available.add(actual);
    }
    need(calendar.startDate<=calendar.endDate&&calendar.endDate<=calendar.coverageEnd,'COVERAGE_RANGE','calendar','模拟范围越界');
    for(let at=calendar.startDate;at<=calendar.coverageEnd;at=shiftDate(at,1))need(available.has(at),'COVERAGE_GAP','calendar.'+at,'实际日历资料不覆盖声明范围；不补假日历');
  });
  if(rows('期初在制').length){const message='期初在制/剩余映射不是完整累计执行与资源持有账；须提供逐批执行事实，当前不假造为未开工作业';
    report('G01','期初在制',message,production.mode==='NON_PRODUCTION'?'NOT_COVERED':'BLOCKED');
    uncovered.push({id:'IMPORT-G01',objectId:'期初在制',reason:message,date:calendar.startDate,resolved:false});}
  if(production.mode==='FROZEN_TASKS'){
    const run=source.run,p=run?.result;
    need(p&&['completed','partial'].includes(run.status)&&p.timeUnit==='minute'&&p.minuteOrigin===calendar.minuteOrigin&&
      production.planUse==='EXPLICIT_COPY','MINUTE_PLAN_REQUIRED','production','须明确采用真实冻结整数分钟作业副本；日计划不猜工时');
    need(production.taskIds.length&&new Set(production.taskIds).size===production.taskIds.length,'TASK_SELECTION_REQUIRED','production.taskIds','作业选择须非空且唯一');
    const resourceRows=rows('设备与工装'),crewRows=rows('班组资源'),resourceMap=new Map();
    const addResource=(key,kind)=>{
      if(resourceMap.has(key))return key;
      const r=(kind==='crew'?crewRows:resourceRows).find(r=>r[kind==='crew'?'班组编号':'资源编号']===key);
      need(r,'RESOURCE_REFERENCE',key,'冻结资源不存在');
      if(kind!=='crew')need(r['资源占用方式']==='独占','RESOURCE_WEIGHT_UNSUPPORTED',key,'重量共享不能伪装实体数量容量');
      const capacity=integer(r[kind==='crew'?'每班可用人数':'可用数量'],key+'.capacity');
      need(capacity>0,'RESOURCE_CAPACITY',key,'资源容量须明确为正整数');
      const out={id:id(key,key),capacity,kind,lineage:ref(kind==='crew'?'班组资源':'设备与工装',r)};
      resources.push(out);resourceMap.set(key,out);return key;
    };
    for(const key of production.taskIds)attempt(key,()=>{
      const t=p.tasks?.find(t=>t.id===key);need(t,'FROZEN_TASK_MISSING',key,'所选task不在冻结结果中');
      need(Number.isSafeInteger(t.start)&&Number.isSafeInteger(t.end)&&t.end>t.start,'TASK_TIME_REQUIRED',key,'须源作业整数分钟边界');
      const plannedStart=timeAt(calendar.minuteOrigin,t.start),plannedEnd=timeAt(calendar.minuteOrigin,t.end);
      need(minute(plannedStart)>=minute(opening.asOf),'PAST_TASK_REQUIRES_FACTS',key,'已开始/已完成作业不能清零后重新投料');
      const m=material(t.productId,'千克',key),rs=[{id:addResource(t.machine,'machine'),quantity:1}];
      need(Array.isArray(t.tools)&&Number.isSafeInteger(t.people)&&t.people>=0,'TASK_RESOURCE_FACTS',key,'工装/人员需求缺失');
      if(t.people>0)rs.push({id:addResource(t.crew,'crew'),quantity:t.people});
      for(const tool of t.tools)rs.push({id:addResource(tool,'tool'),quantity:1});
      const feeds=(p.allocations||[]).filter(a=>a.taskId===key&&a.consumer&&a.consumer!==a.need),requirements=new Map();
      for(const a of feeds){
        need(Number.isSafeInteger(a.feedMinute)&&a.feedMinute===t.start,'FEED_TIME_UNSUPPORTED',key,'非开工时投料须显式分段脚本');
        const lot=lots.find(l=>a.supplyId==='inventory:'+l.id);
        need(lot&&lot.materialId===a.materialId,'FEED_LOT_MAPPING_REQUIRED',key+'.'+a.supplyId,'采购/在制/制造条件供给不能假造为已在库批次');
        const n=number(a.quantity,key+'.allocation.quantity');need(n>=0,'FEED_QUANTITY',key,'投料数量不得负');
        requirements.set(lot.id,(requirements.get(lot.id)||0)+n);
      }
      const f=opening.taskFacts?.[key];
      need(f?.source&&f.confirmAllocationsComplete===true,'FEED_COMPLETENESS_REQUIRED',key,'须明确所选作业分批投料清单完整；空分配不推定零用料');
      const processing=integer(f.totalProcessingMinutes,key+'.totalProcessingMinutes');
      need(processing>0&&processing<=t.end-t.start,'PROCESSING_MINUTES_REQUIRED',key,'须显式加工工时，不把跨班/等待历时直接当加工');
      tasks.push({id:id(t.id,key),outputMaterialId:m.id,outputLimit:number(t.quantity,key+'.quantity'),balanceUnit:m.unit,
        totalMinutes:processing,startRequirements:[...requirements].map(([lotId,cumulative])=>({lotId,cumulative})),resources:rs,
        plannedStart,plannedEnd,predecessor:t.predecessor??null,productionId:t.productionId??null,
        lineage:{runId:run.id,inputHash:run.inputHash,resultHash:run.resultHash,taskId:t.id,source:copy(t.source??{}),
          nativeTask:copy(t),allocations:copy(feeds),inventoryBasis:opening.inventoryBasis,
          bomRelations:references.bom.filter(e=>e.parent===t.productId&&e.effective).map(e=>e.id),explicitFacts:copy(f)}});
    });
  }
  let spec=null;
  const windowDays=attempt('窗口天数',()=>{const value=integer(globalValue('窗口天数'),'窗口天数');need(value>0,'WINDOW_REQUIRED','窗口天数','窗口须大于0');return value;});
  const output={schema:IMPORT_VERSION,stage:'A',mode:'INDEPENDENT',linked:false,mainProgramReady:false,
    source:copy(source.identity),diagnostics,references,mapped:{materials,lots,purchases,demands,resources,tasks},spec:null,status:'BLOCKED',
    meaning:'真实原生字段转换预览；运行验证/原件隔离hash及公共入口尚须取得窗口实测'};
  if(!diagnostics.some(i=>i.severity==='BLOCKED')){
    spec=attempt('spec',()=>validateSpec({schema:VERSION,mode:'INDEPENDENT',startDate:calendar.startDate,endDate:calendar.endDate,
      coverageEnd:calendar.coverageEnd,timeZone:'Asia/Shanghai',offset:'+08:00',planningWindowDays:windowDays,
      source:{baseline:{version:String(d.version),hash:source.identity.inputHash,...copy(source.identity)},
        parameters:{version:d.parameterContract,hash:resolved.parameterHash,precedence:'SECOND_P',archiveHash:resolved.parameterHash},
        rules:copy(script.rules),...(source.run?.result?{plan:{version:source.run.id,hash:source.run.resultHash}}:{}),
        conversion:{version:IMPORT_VERSION,openingHash:fingerprint(opening),sourceMinuteOrigin:calendar.minuteOrigin,dayZero:calendar.dayZero}},
      random:{enabled:false},materials,lots,purchases,demands,resources,tasks,events:copy(script.events),reference:references,importIssues:uncovered}));
    if(spec){output.spec=spec;output.status=uncovered.length?'READY_WITH_UNCOVERED_NON_PRODUCTION':'READY_FOR_SELFTEST';}
  }
  output.contentHash=fingerprint(output);return output;
}
