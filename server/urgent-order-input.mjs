import {copyReportSource} from './query-reports/source-copy.mjs';
import {parseWorkbook} from './workbook-parse.mjs';
import {hash,rows,refreshDerived,workbookSchema} from './workbook-model.mjs';
import {minuteMode,MINUTE_ENGINE,instantMinute} from './workbook-minute.mjs';
import {supplyReadiness} from './workbook-supply.mjs';

export const URGENT_CONTRACT='CR-URGENT-ORDER-20261103:R1';
export const DEMAND_FIELDS=['需求编号','需求日','客户编号','客户名称','区域编号','区域名称','客户等级','成品编号','成品名称','需求箱数','每箱净重千克','需求千克','最早到货日','最晚到货日','按要求日最晚发运日','到货剩余保质天数','范围'];
const required=['需求编号','需求日','客户编号','成品编号','需求箱数'];
export function urgentError(code,message,detail={},status=422){const e=Error(message);Object.assign(e,{code,status,detail});return e;}
export function requireMinute(d){if(!minuteMode(d))throw urgentError('URGENT_PROFILE_UNSUPPORTED','当前计划不支持插单必需的整数分钟、执行事实保护及有限资源；请选用受支持的分钟计划。',{required:[MINUTE_ENGINE,'execution-ledger','finite-resources'],actual:d.productionContract||'day'});}
export function targetToken(p){return hash({id:p.id,baseRunId:p.baseRunId,headRunId:p.headRunId,revision:p.revision,factsRevision:p.factsRevision,inputHash:p.inputHash,facts:p.facts});}
export function assertTarget(p,token){if(!p||token!==targetToken(p))throw urgentError('URGENT_TARGET_CHANGED','目标计划、批次或执行事实已变化，请重新核对。',{},409);}
export function demandInput(base,p){const d=copyReportSource(base);delete d.urgentOrder;d.tables['每日需求']=[...rows(d,'每日需求').filter(r=>!p.originalDemandIds||p.originalDemandIds.includes(r['需求编号'])),...p.batches.flatMap(b=>b.demands.map(r=>({...r,_urgent:{batchId:b.id,effectiveMinute:b.effectiveMinute,sequence:b.sequence,fileHash:b.fileHash,fileName:b.fileName}})))];return refreshDerived(d,p.selection.startDay);}
export function previewUrgent(buffer,base,p,{fileName,effectiveTime}){
 requireMinute(base);
 const effectiveMinute=instantMinute(effectiveTime,base.minuteOrigin),observed=p.facts.observationMinute;
 if(effectiveMinute<observed||effectiveMinute<p.selection.startDay*1440||effectiveMinute>=p.selection.endDay*1440)throw urgentError('URGENT_EFFECTIVE_TIME','生效时刻须不早于观察时点，且在选定窗口内。');
 const spec={version:workbookSchema.version,tables:{'每日需求':{...workbookSchema.tables['每日需求'],fields:DEMAND_FIELDS.map(name=>({name}))}}};
 const parsed=parseWorkbook(buffer,spec,{onlySheets:['每日需求'],literalFields:required}),issues=[...parsed.issues],warnings=[...parsed.warnings];
 const fileHash=hash(buffer),d=demandInput(base,p),existing=new Set(rows(d,'每日需求').map(r=>r['需求编号'])),seen=new Set();
 const customers=new Map(rows(d,'客户与交付').map(r=>[r['客户编号'],r])),materials=new Map(rows(d,'物料主数据').map(r=>[r['物料编号'],r]));
 const add=(r,field,message,code='URGENT_INPUT')=>issues.push({code,sheet:'每日需求',row:r?._row||0,field,cell:r?._cells?.[field]||'',message});
 const demands=rows(parsed,'每日需求');if(!demands.length)add(null,'需求编号','每日需求页没有数据');
 for(const r of demands){
  for(const f of required)if(String(r[f]??'').trim()==='')add(r,f,'业务必填不可为空');
  const id=String(r['需求编号']||''),m=materials.get(r['成品编号']),c=customers.get(r['客户编号']);
  if(seen.has(id))add(r,'需求编号','同批需求编号重复');seen.add(id);if(existing.has(id))add(r,'需求编号','与目标计划既有需求冲突，拒绝覆盖');
  if(!m||m['物料来源']!=='制造'||['停用','无效','否'].includes(m['状态']??m['是否启用']))add(r,'成品编号','成品未知、不可用或无制造模型');
  if(!c||['停用','无效','否'].includes(c['状态']??c['是否启用']))add(r,'客户编号','客户未知或不可用');
  if(!Number.isFinite(Number(r['需求箱数']))||!(Number(r['需求箱数'])>0))add(r,'需求箱数','数量须为有限正数；不以负数改量');
  if(!/^\d+$/.test(String(r['需求日']??''))||!Number.isInteger(Number(r['需求日']))||String(r['需求日']??'').trim()===''||Number(r['需求日'])<1||Number(r['需求日'])>=44)add(r,'需求日','日序超出当前数据模型支持的[1,44)范围');
  if(m&&(!(Number(m['每箱净重千克'])>0)||!Number.isFinite(Number(m['每箱净重千克']))))add(r,'每箱净重千克','权威物料资料缺少有效箱重');
  if(c&&['运输天数','允许提前天数','允许延后天数','到货剩余保质比例','服务优先级'].some(f=>String(c[f]??'').trim()===''||!Number.isFinite(Number(c[f]))))add(r,'客户编号','客户运输、交付或余保参数缺项');
  r._source={fileName,fileHash,sheet:'每日需求',row:r._row};
 }
 // demandInput already detached the complete source. Extend that private
 // candidate in place instead of keeping a second full workbook alive.
 const originalLength=rows(d,'每日需求').length,candidate=d;candidate.tables['每日需求'].push(...demands);refreshDerived(candidate,p.selection.startDay);
 const resolved=rows(candidate,'每日需求').slice(originalLength),outside=[];
 for(const [i,r]of resolved.entries()){
  const c=customers.get(r['客户编号']),m=materials.get(r['成品编号']);if(c&&m){for(const f of ['客户名称','区域编号','区域名称','客户等级'])r[f]=c[f];r['成品名称']=m['物料名称']||m['成品名称'];}
  for(const f of DEMAND_FIELDS.filter(f=>!required.includes(f)&&f!=='范围'))if(String(demands[i][f]??'')!==''&&String(demands[i][f])!==String(r[f]??''))warnings.push({sheet:'每日需求',row:r._row,field:f,cached:demands[i][f],value:r[f],message:'采用同版本主数据及有效参数，缓存仅供对照'});
  if(Number(r['需求日'])<p.selection.startDay||Number(r['需求日'])>=p.selection.endDay)outside.push({id:r['需求编号'],row:r._row,day:Number(r['需求日'])});
  if(Number(r['最早到货日'])>Number(r['最晚到货日']))add(r,'需求日','客户交付窗口矛盾');
  if(!Number.isFinite(Number(r['需求千克']))||!(Number(r['需求千克'])>0))add(r,'需求箱数','箱数与权威箱重换算结果须为有限正数');
 }
 if(!issues.length){const ready=supplyReadiness(candidate,{...p.selection,demandIds:resolved.map(r=>r['需求编号'])});issues.push(...ready.issues);}
 return {fileHash,fileName,effectiveMinute,demands:resolved,issues,warnings,outside,valid:issues.length===0,targetToken:targetToken(p),contract:URGENT_CONTRACT};
}

// Every previously planned task has an explicit factual disposition. Planned
// times are never promoted to execution facts merely because the clock moved.
export function executionLedger(base,body,previous,window=base.conditions){
 const observationMinute=instantMinute(body.observationTime,base.minuteOrigin),tasks=base.tasks||[],byId=new Map(tasks.map(t=>[t.id,t]));
 if(observationMinute<window.startDay*1440||observationMinute>=window.endDay*1440||previous&&observationMinute<previous.observationMinute)throw urgentError('URGENT_FACT_TIME','观察时刻须在窗口内且不能倒退');
 if(!Array.isArray(body.tasks)||body.tasks.length!==tasks.length||new Set(body.tasks.map(f=>f.id)).size!==tasks.length)throw urgentError('URGENT_FACT_INCOMPLETE','每个原任务必须有唯一、明确的执行/锁定记录');
 const facts=[];
 for(const f of body.tasks){const t=byId.get(f.id);if(!t||!['not_started','started','completed','locked'].includes(f.status))throw urgentError('URGENT_FACT_UNKNOWN','未知任务或执行状态');
  const old=previous?.tasks.find(x=>x.id===f.id),start=f.startMinute??t.start,end=f.endMinute??t.end,quantity=f.quantity??t.quantity;
  if(![start,end].every(Number.isSafeInteger)||end<=start||typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>t.quantity)throw urgentError('URGENT_FACT_VALUE','事实须有合法整数分钟和不超原批量的合格数量 '+f.id);
  const laborIntervals=f.laborIntervals??t.laborIntervals,toolEndMinute=f.toolEndMinute??t.toolEndMinute;
  if(!Array.isArray(laborIntervals)||laborIntervals.some(l=>![l.start,l.end].every(Number.isSafeInteger)||l.start<start||l.end>end||l.end<l.start)||!Number.isSafeInteger(toolEndMinute)||toolEndMinute<end)throw urgentError('URGENT_FACT_OCCUPANCY','人员参与及工装释放须与实际时刻一致 '+f.id);
  if(old&&['started','completed','locked'].includes(old.status)&&f.status!==old.status&&!(old.status==='started'&&f.status==='completed')&&!(old.status==='locked'&&['started','completed'].includes(f.status)))throw urgentError('URGENT_FACT_REGRESSION','不能自动解锁或撤销已执行事实 '+f.id);
  if(old&&['started','completed','locked'].includes(old.status)&&(start!==(old.startMinute??t.start)||quantity!==(old.quantity??t.quantity)||old.status==='completed'&&(end!==(old.endMinute??t.end)||JSON.stringify(laborIntervals)!==JSON.stringify(old.laborIntervals??t.laborIntervals)||toolEndMinute!==(old.toolEndMinute??t.toolEndMinute))))throw urgentError('URGENT_FACT_REGRESSION','已执行的起点、数量、完成及耗料事实不可覆盖 '+f.id);
  if(f.status==='started'&&!(start<=observationMinute&&observationMinute<end)||f.status==='completed'&&end>observationMinute)throw urgentError('URGENT_FACT_INTERVAL','实际开始/完成时刻与观察时刻不符 '+f.id);
  if(f.status==='locked'&&start<observationMinute)throw urgentError('URGENT_FACT_INTERVAL','过去的锁定任务须明确已开工/完成 '+f.id);
  const cleaning=f.cleaning??t.cleaning;if(cleaning&&(![cleaning.start,cleaning.end].every(Number.isSafeInteger)||cleaning.end!==start||cleaning.start>cleaning.end||cleaning.rule!==t.cleaning?.rule))throw urgentError('URGENT_CLEANING_FACT','实际清洗须明确且与任务开始、原有向规则一致 '+f.id);
  if(old?.status==='completed'&&JSON.stringify(old.cleaning??t.cleaning)!==JSON.stringify(cleaning))throw urgentError('URGENT_FACT_REGRESSION','已完成清洗事实不可覆盖 '+f.id);
  facts.push({id:f.id,status:f.status,cleaning:structuredClone(cleaning),startMinute:start,endMinute:end,quantity,laborIntervals:structuredClone(laborIntervals),toolEndMinute});
 }
 const completed=body.completed;
 if(!completed||typeof completed!=='object'||Array.isArray(completed))throw urgentError('URGENT_COMPLETED_MISSING','须逐需求明确已完成合格交付量，0也须明确');
 for(const r of base.demandResults||[]){const q=completed[r.id];if(typeof q!=='number'||!Number.isFinite(q)||q<0||q>r.quantity||previous&&q<(previous.completed[r.id]||0))throw urgentError('URGENT_COMPLETED_INVALID','已完成量缺失、超量或倒退 '+r.id);}
 if(Object.keys(completed).some(id=>!base.demandResults.some(r=>r.id===id)))throw urgentError('URGENT_COMPLETED_INVALID','已完成量含未知需求');
 const allocationFacts=body.allocations||((facts.every(f=>f.status==='not_started')&&Object.values(completed).every(q=>q===0))?(base.allocations||[]).map((a,index)=>({index,sourceHash:hash(a),quantity:0,kind:'none',feedMinute:a.feedMinute})):null);
 if(!Array.isArray(allocationFacts)||allocationFacts.length!==(base.allocations||[]).length||new Set(allocationFacts.map(f=>f.index)).size!==allocationFacts.length)throw urgentError('URGENT_CONSUMPTION_FACT_MISSING','须逐条明确实际耗料/锁定供给，0也须确认；不能从计划按比例猜测');
 for(const f of allocationFacts){const a=base.allocations[f.index];if(a&&f.sourceResultHash===hash(base)&&!f.sourceHash)f.sourceHash=hash(a);const old=previous?.allocations?.find(x=>x.index===f.index);if(!a||f.sourceHash!==hash(a)||!['none','consumed','locked'].includes(f.kind)||typeof f.quantity!=='number'||!Number.isFinite(f.quantity)||f.quantity<0||f.quantity>a.quantity||!Number.isSafeInteger(f.feedMinute)||f.quantity>0&&f.kind==='none'||f.kind==='consumed'&&f.feedMinute>observationMinute)throw urgentError('URGENT_CONSUMPTION_FACT_INVALID','实际耗料/锁定量、时点或来源不合法');
  if(old&&old.quantity>0&&(f.quantity<old.quantity||old.kind==='consumed'&&(f.kind!=='consumed'||f.feedMinute!==old.feedMinute)))throw urgentError('URGENT_CONSUMPTION_REGRESSION','已耗/锁定供给不可释放或回填库存');
 }
 for(const r of base.demandResults){const delivered=allocationFacts.filter(f=>{const a=base.allocations[f.index];return f.kind==='consumed'&&a.consumer===r.id&&a.need===r.id&&a.materialId===r.productId;}).reduce((n,f)=>n+f.quantity,0);if(Math.abs(delivered-completed[r.id])>1e-6)throw urgentError('URGENT_COMPLETION_ALLOCATION','已完成交付量必须与明确耗用的成品供给一致 '+r.id);}
 return {observationMinute,tasks:facts,allocations:structuredClone(allocationFacts),completed:structuredClone(completed),sourceResultHash:hash(base)};
}
