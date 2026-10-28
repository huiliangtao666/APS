import {jointFlags,claimsFor,previewResources} from '../src/lib/joint-resources.mjs';
import {activeBatchRule,prepareProductionBatches,batchSummary} from '../src/lib/production-batches.mjs';
import {orderHasRemaining,calculateMaterialDemand,createMaterialAllocator,materialPolicy,type MaterialDemandRow} from '../src/lib/material-allocation.mjs';
import { assessRules, type RuleSnapshot } from '../src/lib/business-rules.mjs';
// Extracted existing scheduler; server uses canonical data only.
import { independentlyVerifyPlan, type VerificationReport, type VerificationStatus } from '../src/lib/independent-verification.mjs';
import { validateSingleLineScope } from '../src/lib/line-scope.mjs';
import { validateMasterData } from '../src/lib/master-data.mjs';
import { validateProcessConfig } from '../src/lib/process-config.mjs';
import { validateExpectedSupply, resolveExpectedSupply, supplyEarliestMinute, buildSupplyConditions, exportSupplyPlanCsv, type SupplyCondition } from '../src/lib/expected-supply.mjs';
import { queryInventoryAvailability, validateInventoryBatches } from '../src/lib/inventory.mjs';
import { findDowntimeShiftReason } from '../src/lib/downtime-shift-reason.mjs';
import { appendOrderChange, isOrderSchedulable, validateOrders, type OrderChange } from '../src/lib/orders.mjs';
import { allocatePersonnel, type PersonnelReservation } from '../src/lib/staffing.mjs';
import { validateBomConfig } from '../src/lib/bom-config.mjs';

type Row = Record<string, string>;
type TableDef = { key: string; label: string; file: string; fields: string[] };
type Task = { id: string; orderId: string; productId: string; operation: string; label: string; machine: string; start: number; end: number; duration: number; predecessor: string; source: string };
type Finding = { code: string; message: string; taskIds: string[] };
type StoredVerificationReport = VerificationReport & { inputFingerprint?: string };
type Plan = { id: string; name: string; createdAt: string; tasks: Task[]; findings: Finding[]; rules: string[]; inputVersion: string; verification?: StoredVerificationReport; supplyConditions?: SupplyCondition[]; supplyInput?: string; materialDemands?:MaterialDemandRow[]; materialChecked?:boolean; ruleSnapshot?: RuleSnapshot };

export const defs: TableDef[] = [
  { key: 'products', label: '产品与包装规格', file: '07_产品与包装规格.csv', fields: ['产品编号','产品名称','单支净重kg','每袋支数','总收率','模拟交付等待分钟'] },
  { key: 'materials', label: '物料主数据', file: '08_物料主数据.csv', fields: ['物料编号','物料名称','单位','类别'] },
  { key: 'supplies', label: '预计到料', file: '20_预计到料.csv', fields: ['供给编号','物料编号','批次编号','预计数量','预计到达时间','预计可用时间','质量状态','有效期'] },
  { key: 'supplyDelays', label: '延期模拟记录', file: '21_延期模拟记录.csv', fields: ['记录编号','供给编号','记录时间','调整后到达时间','调整后可用时间','原因'] },
  { key: 'supplyUses', label: '计划供给引用', file: '22_计划供给引用.csv', fields: ['引用编号','订单编号','工序编号','供给编号','使用数量'] },
  { key: 'inventory', label: '库存批次', file: '09_库存批次.csv', fields: ['批次编号','物料编号','账面数量','已占用数量','有效期','位置','质量状态','预计可用时间'] },
  { key: 'orders', label: '订单与交期', file: '17_生产订单与交期.csv', fields: ['订单编号','产品编号','产线编号','合格需求','数量单位','要求可交付分钟','优先顺序','是否允许拆分','需求类型','订单状态','已完成合格数量'] },
  { key: 'bom', label: 'BOM 与包装用量', file: '09_BOM与包装用量.csv', fields: ['版本编号','产品编号','生效日期','投料工序编号','用量类型','物料编号','配置用量','用量单位','用量基准','收率/损耗口径备注','损坏比例'] },
  { key: 'routes', label: '工艺路线', file: '10_工艺路线配置.csv', fields: ['产品编号','工序编号','工序名称','前序工序','最大等待分钟','程序编号'] },
  { key: 'times', label: '工序工时', file: '11_工序工时配置.csv', fields: ['产品编号','工序编号','计算方式','固定分钟','速度支每分钟'] },
  { key: 'machines', label: '设备资源', file: '03_设备资源配置.csv', fields: ['设备编号','设备名称','产线编号','工序编号','日历编号','最小装载kg','最大装载kg','装载计量基准'] },
  { key: 'tools', label: '工装配置（不自动参与排程）', file: '18_工装配置.csv', fields: ['工装编码','工装名称','适用任务','可用数量','每任务需求数量','提前占用分钟','后延占用分钟','是否启用','说明'] },
  { key: 'resourceClaims', label: '显式逐生产批占用声明', file: '23_资源占用声明.csv', fields: ['声明编号','订单编号','工序编号','资源类型','资源编号','需求数量','单位','提前占用分钟','后延占用分钟','占用口径'] },
  { key: 'batchResources', label: '空间与组批配置（存储不代表检查）', file: '15_空间与组批规则配置.csv', fields: ['资源编号','资源类型','容量','单位','允许程序','说明'] },
  { key: 'calendars', label: '工厂工作日历', file: '02_工厂工作日历.csv', fields: ['日历编号','工厂编号','起始分钟','结束分钟','是否工作','说明'] },
  { key: 'downtime', label: '设备停机例外', file: '04_设备停机与例外日历.csv', fields: ['设备编号','起始分钟','结束分钟','原因'] },
  { key: 'dependencies', label: '工序资源依赖', file: '12_工序资源与物料依赖.csv', fields: ['订单编号','工序编号','资源类型','资源编号','需求数量','提前占用分钟','后延占用分钟','所需技能','所需班次','人员参与阶段','人员开始偏移','人员结束偏移'] },
  { key: 'personnelGroups', label: '人员组与可用时间', file: '19_人员组与可用时间.csv', fields: ['人员组编号','人员组名称','人员数量','技能','班次','可用起始分钟','可用结束分钟'] },
  { key: 'rules', label: '排程规则', file: '16_排程规则配置.csv', fields: ['规则编号','中文名称','是否启用','参数JSON','适用对象','生效时间'] },
];
export const seed: Record<string, Row[]> = {
  products: [
    {'产品编号':'HC40','产品名称':'模拟火腿肠40g','单支净重kg':'0.04','每袋支数':'10','总收率':'0.96','模拟交付等待分钟':'0'},
    {'产品编号':'HC60','产品名称':'模拟火腿肠60g','单支净重kg':'0.06','每袋支数':'10','总收率':'0.96','模拟交付等待分钟':'0'},
  ],
  materials: [
    ...[['LEAN','模拟瘦肉','kg','原料'],['FAT','模拟背膘','kg','原料'],['WATER','生产用水','kg','原料'],['PREMIX','复合辅料占位','kg','辅料'],['BAG','十支外包装袋','个','包材']].map(([id,name,unit,category])=>({'物料编号':id,'物料名称':name,'单位':unit,'类别':category})),
  ],
  supplies: [],
  supplyDelays: [],
  supplyUses: [],
  inventory: [
    {'批次编号':'LEAN-LOT-001','物料编号':'LEAN','账面数量':'500','已占用数量':'120','有效期':'2026-12-31','位置':'冷库 A-01','质量状态':'合格','预计可用时间':''},
    {'批次编号':'LEAN-LOT-002','物料编号':'LEAN','账面数量':'200','已占用数量':'0','有效期':'2026-12-31','位置':'待检区 Q-01','质量状态':'待检','预计可用时间':''},
  ],
  bom: [],
  orders: [
    {'订单编号':'A','产品编号':'HC40','产线编号':'L01','合格需求':'240','数量单位':'kg','要求可交付分钟':'480','优先顺序':'1','是否允许拆分':'否','需求类型':'正式订单','订单状态':'有效'},
    {'订单编号':'B','产品编号':'HC60','产线编号':'L01','合格需求':'240','数量单位':'kg','要求可交付分钟':'480','优先顺序':'2','是否允许拆分':'否','需求类型':'正式订单','订单状态':'有效'},
  ],
  routes: [
    {'产品编号':'HC40','工序编号':'MIX','工序名称':'混合','前序工序':'','最大等待分钟':'','程序编号':''},
    {'产品编号':'HC40','工序编号':'FILL','工序名称':'灌装','前序工序':'MIX','最大等待分钟':'','程序编号':''},
    {'产品编号':'HC60','工序编号':'MIX','工序名称':'混合','前序工序':'','最大等待分钟':'','程序编号':''},
    {'产品编号':'HC60','工序编号':'FILL','工序名称':'灌装','前序工序':'MIX','最大等待分钟':'','程序编号':''},
  ],
  times: [
    {'产品编号':'HC40','工序编号':'MIX','计算方式':'固定','固定分钟':'30','速度支每分钟':'120'},
    {'产品编号':'HC40','工序编号':'FILL','计算方式':'固定','固定分钟':'30','速度支每分钟':'120'},
    {'产品编号':'HC60','工序编号':'MIX','计算方式':'固定','固定分钟':'30','速度支每分钟':'100'},
    {'产品编号':'HC60','工序编号':'FILL','计算方式':'固定','固定分钟':'30','速度支每分钟':'100'},
  ],
  machines: [
    ...['MIX01','MIX02','MIX03'].map((id,i)=>({'设备编号':id,'设备名称':`混合设备${i+1}`,'产线编号':'L01','工序编号':'MIX','日历编号':'FC01','最小装载kg':'0','最大装载kg':'300','装载计量基准':'BOM总投入'})),
    ...['FILL01','FILL02','FILL03'].map((id,i)=>({'设备编号':id,'设备名称':`灌装设备${i+1}`,'产线编号':'L01','工序编号':'FILL','日历编号':'FC01','最小装载kg':'0','最大装载kg':'10000','装载计量基准':'BOM总投入'})),
  ],
  calendars: [{'日历编号':'FC01','工厂编号':'F01','起始分钟':'0','结束分钟':'600','是否工作':'是','说明':'2026-11-02 08:00—18:00；资源默认继承'}],
  downtime: [],
  dependencies: [
    {'订单编号':'A','工序编号':'MIX','资源类型':'设备','资源编号':'MIX01','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':''},
    {'订单编号':'A','工序编号':'FILL','资源类型':'设备','资源编号':'FILL01','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':''},
    {'订单编号':'B','工序编号':'MIX','资源类型':'设备','资源编号':'MIX02','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':''},
    {'订单编号':'B','工序编号':'FILL','资源类型':'设备','资源编号':'FILL02','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':''},
  ],
  tools: [],
  resourceClaims: [],
  batchResources: [],
  personnelGroups: [],
  rules: [
    {'规则编号':'MACHINE','中文名称':'机器不重叠','是否启用':'是','参数JSON':'{}'},
    {'规则编号':'PRECEDENCE','中文名称':'工序顺序','是否启用':'是','参数JSON':'{}'},
    ...[['CALENDAR','工厂及设备日历','是'],['MOLD','模具与工具占用','否'],['LABOR','人员技能及数量','否'],['MATERIAL','物料数量及可用时点','否'],['CAPACITY','设备装载','否'],['PROGRAM','资源程序兼容','否'],['MAX_LAG','工序最大等待','否'],['STORAGE','空间容量','否'],['PROGRESS','执行保护','否'],['DELIVERY','预计可交付','否']].map(([id,label,on])=>({'规则编号':id,'中文名称':label,'是否启用':on,'参数JSON':'{}'})),
    {'规则编号':'INVENTORY','中文名称':'库存质量状态可用性','是否启用':'是','参数JSON':'{"可用质量状态":["合格"]}'},
  ],
};

function uid() { return `R1-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`; }
function rulesInputFingerprint(data:Record<string,Row[]>) { const source=JSON.stringify({orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],personnelGroups:data.personnelGroups||[],machines:data.machines||[],calendars:data.calendars||[],downtime:data.downtime||[],rules:data.rules||[]});let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0'); }
function fmt(min: number) { const n=480+Math.round(min); return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
function findCalendarWindow(calendarId:string, earliest:number, duration:number, calendars:Row[], downtime:Row[], machineId:string):{start:number|null;reason:string}{
  const valid=calendars.filter(r=>r['日历编号']===calendarId).map(r=>({start:Number(r['起始分钟']),end:Number(r['结束分钟']),work:r['是否工作']==='是'})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start);
  const off=valid.filter(r=>!r.work).sort((a,b)=>a.start-b.start);
  const entries=valid.filter(r=>r.work).flatMap(w=>{let segments=[{start:w.start,end:w.end}];for(const stop of off){segments=segments.flatMap(s=>stop.start<s.end&&stop.end>s.start?[...(stop.start>s.start?[{start:s.start,end:stop.start}]:[]),...(stop.end<s.end?[{start:stop.end,end:s.end}]:[])]:[s]);}return segments;}).filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start);
  if(!entries.length)return {start:null,reason:`工厂日历 ${calendarId||'（未配置）'} 没有有效工作窗口，工厂未开工或日历配置缺失`};
  const stops=downtime.filter(r=>r['设备编号']===machineId).map(r=>({start:Number(r['起始分钟']),end:Number(r['结束分钟']),reason:r['原因']||'设备停机'})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start).sort((a,b)=>a.start-b.start);
  for(const window of entries){let candidate=Math.max(earliest,window.start);while(candidate+duration<=window.end){const stop=stops.find(s=>candidate<s.end&&candidate+duration>s.start);if(!stop)return {start:candidate,reason:''};candidate=stop.end;}}
  const next=entries.find(w=>w.end>earliest); const detail=next&&stops.some(s=>s.start<next.end&&s.end>Math.max(earliest,next.start))?'設備停機例外缩短了可用区间，且剩余连续窗口不足':'工厂工作窗口内没有足够的连续可用时长';
  return {start:null,reason:detail};
}
function validate(tasks: Task[]): Finding[] {
  const out: Finding[]=[]; const byMachine=new Map<string,Task[]>();
  tasks.forEach(t=>{const a=byMachine.get(t.machine)||[];a.push(t);byMachine.set(t.machine,a);});
  byMachine.forEach((list,machine)=>{list.sort((a,b)=>a.start-b.start);for(let i=1;i<list.length;i++){const a=list[i-1],b=list[i];if(b.start<a.end)out.push({code:'BR-03 / MACHINE_OVERLAP',message:`${machine} 上 ${a.id} 与 ${b.id} 重叠 ${fmt(b.start)}–${fmt(Math.min(a.end,b.end))}`,taskIds:[a.id,b.id]});}});
  const byId=new Map(tasks.map(t=>[t.id,t])); tasks.forEach(t=>{if(t.predecessor){const pre=byId.get(t.predecessor);if(pre&&t.start<pre.end)out.push({code:'BR-02 / PRECEDENCE',message:`${t.id} 开始于 ${fmt(t.start)}，早于前序 ${pre.id} 完成 ${fmt(pre.end)}`,taskIds:[pre.id,t.id]});}});
  return out;
}

export function calculate(data:Record<string,Row[]>, inputVersion:number, calculatedAt=new Date().toISOString(), conditions:{startMinute?:number;endMinute?:number|null;priority?:string;mode?:string}={}) {
 const resourceReservations:any[]=[];const flags=conditions.mode==='minimal-r1'?{}:jointFlags(data,calculatedAt);
 const sourceData=data;let batches:ReturnType<typeof prepareProductionBatches>|null=null;
 const demandFor=(order:Row,operation:string,minute:number)=>batches?batches.demands(order,operation,minute):calculateMaterialDemand(sourceData,order,operation,minute);
 const minimal=conditions.mode==='minimal-r1';
 const policy=minimal?null:materialPolicy(data,calculatedAt);
 const materialDemands:MaterialDemandRow[]=[];const allocator=policy?createMaterialAllocator(data,policy):null;
 const ruleSnapshot=assessRules(data,calculatedAt,true,conditions.mode);
 let result:Plan|null=null;
 const setActivePlan=(p:Plan)=>{result={...p,jointResourceChecks:flags,resourceReservations:resourceReservations.map(r=>({...r,taskIds:batches?(r.productionBatchId?p.tasks.filter((t:any)=>t.productionBatchId===r.productionBatchId&&t.operation===r.operation).map(t=>t.id):batches.taskIds(r.taskId)):[r.taskId]})),materialChecked:!!policy,materialDemands,...(batches?{batchChecked:true,...batchSummary(batches,p.tasks)}:{batchChecked:false}),ruleSnapshot,rules:ruleSnapshot.settings.filter(r=>r.active).map(r=>r.id)};};
 const setIssues=(_x:Finding[])=>{}; const setVerification=(_x:null)=>{};const setMessage=(_x:string)=>{};
 const enabledRules=(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
 const supplyInput=JSON.stringify({supplies:data.supplies||[],delays:data.supplyDelays||[],uses:data.supplyUses||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[]});
 const supplyIssues=validateExpectedSupply(JSON.parse(supplyInput));
 const inventoryIssues=validateInventoryBatches(data.inventory||[],data.materials||[]);
 const resolvedSupplies=resolveExpectedSupply(data.supplies||[],data.supplyDelays||[]);
  function schedule(){
    const built:Task[]=[]; const findings:Finding[]=[]; const machineBusy=new Map<string,Task[]>(); const personnelReservations:PersonnelReservation[]=[];
    if(ruleSnapshot.issues.length){setActivePlan({id:uid(),name:"规则配置阻止计算",createdAt:calculatedAt,tasks:[],findings:ruleSnapshot.issues.map(i=>({code:"RULE / CONFIG",message:i.message,taskIds:[]})),rules:[],inputVersion:`v${inputVersion}`});return;}
    const sortBy=conditions.priority&&conditions.priority!=='规则设置'?conditions.priority:ruleSnapshot.settings.find(r=>r.id==='SORT'&&r.active)?.parameters['排序方式'];
    ruleSnapshot.note+=` 实际任务排序：${sortBy==='要求日期'?'要求日期':'优先顺序'}；来源：${conditions.priority&&conditions.priority!=='规则设置'?'本次计算条件（覆盖 SORT 的排序方式）':'本次规则设置或默认优先顺序'}。`;
    let sorted=[...(data.orders||[])].filter(o=>o['需求类型']!=='预测'&&isOrderSchedulable(o)).sort((a,b)=>sortBy==='要求日期'?Number(a['要求可交付分钟'])-Number(b['要求可交付分钟'])||Number(a['优先顺序'])-Number(b['优先顺序']):Number(a['优先顺序'])-Number(b['优先顺序']));
    const orderIssues=validateOrders(data.orders||[]).filter(issue=>issue.code!=='ORDER_MULTI_LINE');
    if(orderIssues.length){findings.push(...orderIssues.map(issue=>({code:`FR-009 / ${issue.code}`,message:issue.message,taskIds:[]})));setIssues(findings);setActivePlan({id:uid(),name:'订单数据校验',createdAt:new Date().toISOString(),tasks:[],findings,rules:enabledRules,inputVersion:`v${inputVersion}`});setVerification(null);setMessage(`FR-009 订单字段检查发现 ${orderIssues.length} 个问题，未生成任务。`);return;}
    const masterIssues=[...validateBomConfig({products:data.products||[],materials:data.materials||[],routes:data.routes||[],bom:data.bom||[]}),...supplyIssues,...inventoryIssues,...validateMasterData({products:data.products||[],materials:data.materials||[],orders:sorted,routes:data.routes||[],dependencies:data.dependencies||[]}),...validateProcessConfig({products:data.products||[],materials:data.materials||[],orders:sorted,routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],machines:data.machines||[],personnelGroups:data.personnelGroups||[]})];
    if(masterIssues.length){
      findings.push(...masterIssues.map(issue=>({...issue,taskIds:[]})));
      const plan:Plan={id:uid(),name:`单线计算 ${new Date().toLocaleString('zh-CN',{hour12:false})}`,createdAt:new Date().toISOString(),tasks:[],findings,rules:enabledRules.filter(r=>['MACHINE','PRECEDENCE','CALENDAR'].includes(r)),inputVersion:`v${inputVersion}`};
      setIssues(findings);setActivePlan(plan);setVerification(null);setMessage(`主数据/引用检查发现 ${findings.length} 个问题，未生成任务。`);return;
    }
    const scopeFindings=validateSingleLineScope(sorted,data.machines||[]);
    if(scopeFindings.length){
      findings.push(...scopeFindings);
      const plan:Plan={id:uid(),name:`单线计算 ${new Date().toLocaleString('zh-CN',{hour12:false})}`,createdAt:new Date().toISOString(),tasks:[],findings,rules:enabledRules.filter(r=>['MACHINE','PRECEDENCE','CALENDAR'].includes(r)),inputVersion:`v${inputVersion}`};
      setIssues(findings);setActivePlan(plan);setVerification(null);setMessage(findings.map(f=>f.message).join(' '));return;
    }
    if(!minimal&&activeBatchRule(data,calculatedAt)){
     batches=prepareProductionBatches(data,sorted,conditions.startMinute??0);findings.push(...batches.findings);data=batches.data;sorted=batches.orders;
     for(const g of batches.groups.filter((g:any)=>g.status==='blocked-under-min'))for(const op of g.route){
      try{const demands=g.members.flatMap((m:any)=>calculateMaterialDemand(sourceData,m.order,op['工序编号'],conditions.startMinute??0,m.qualifiedKg).map(d=>({...d,taskId:JSON.stringify([m.orderId,m.index,op['工序编号']])})));if(allocator)materialDemands.push(...allocator.preview(demands,conditions.startMinute??0).rows.map(r=>({...r,blockedReason:'低于最小装载；候选未占用'})));}catch(e){findings.push({code:'UNPLANNED / BATCH_MATERIAL',message:String(e),taskIds:[]});}
     }
    }
    const retainBlockedDemand=(order:Row,operation:string,minute:number,blockedReason:string)=>{
     if(!allocator)return;
     try{const preview=allocator.preview(demandFor(order,operation,minute),minute);materialDemands.push(...preview.rows.map(r=>({...r,blockedReason})));}
     catch(e){findings.push({code:'UNPLANNED / MATERIAL_CONFIG',message:e instanceof Error?e.message:'物料配置无效',taskIds:[`${order['订单编号']}-${operation}`]});}
    };
    for(const order of sorted){const oid=order['订单编号'], product=order['产品编号'];const route=(data.routes||[]).filter(r=>r['产品编号']===product);
      if(!route.length){findings.push({code:'INPUT / ROUTE_MISSING',message:`订单 ${oid} 的产品 ${product} 没有工艺路线`,taskIds:[]});continue;}
      const routeByOperation=new Map<string,Row>(); const routeProblems:string[]=[];
      for(const op of route){const operation=op['工序编号']?.trim();if(!operation){routeProblems.push('存在工序编号为空的路线记录');continue;}if(routeByOperation.has(operation))routeProblems.push(`工序 ${operation} 重复定义`);else routeByOperation.set(operation,op);}
      for(const [operation,op] of routeByOperation){const predecessor=op['前序工序']?.trim();if(predecessor&&!routeByOperation.has(predecessor))routeProblems.push(`工序 ${operation} 引用不存在的前序工序 ${predecessor}`);}
      const visiting=new Set<string>(), visited=new Set<string>(), stack:string[]=[];let cycle:string[]=[];
      const visit=(operation:string)=>{if(cycle.length||visited.has(operation))return;if(visiting.has(operation)){const start=stack.indexOf(operation);cycle=[...stack.slice(start),operation];return;}visiting.add(operation);stack.push(operation);const predecessor=routeByOperation.get(operation)?.['前序工序']?.trim();if(predecessor&&routeByOperation.has(predecessor))visit(predecessor);stack.pop();visiting.delete(operation);visited.add(operation);};
      routeByOperation.forEach((_,operation)=>visit(operation));
      if(cycle.length)routeProblems.push(`工序依赖存在循环：${cycle.join(' → ')}`);
      if(routeProblems.length){findings.push({code:cycle.length?'INPUT / ROUTE_CYCLE':'INPUT / ROUTE_CONFIG',message:`订单 ${oid} / 产品 ${product} 路线配置问题：${[...new Set(routeProblems)].join('；')}`,taskIds:[]});continue;}
      // Keep the source row order among independent steps, while always placing predecessors first.
      const orderedRoute:Row[]=[];const remaining=[...route];const completedOperations=new Set<string>();
      while(remaining.length){const index=remaining.findIndex(op=>!op['前序工序']?.trim()||completedOperations.has(op['前序工序'].trim()));if(index<0)break;const [next]=remaining.splice(index,1);orderedRoute.push(next);completedOperations.add(next['工序编号'].trim());}
      if(policy && !orderHasRemaining(order))continue;
      const done=new Map<string,Task>();
      for(const op of orderedRoute){const operation=op['工序编号'];const dep=(data.dependencies||[]).find(d=>d['订单编号']===oid&&d['工序编号']===operation&&d['资源类型']==='设备');const machineId=dep?.['资源编号']||'';const machine=(data.machines||[]).find(m=>m['设备编号']===machineId&&m['工序编号']===operation);
        if(!dep||!machine){findings.push({code:'INPUT / MACHINE_DEPENDENCY',message:`订单 ${oid} / 工序 ${operation} 缺少有效设备依赖（12_工序资源与物料依赖.csv）`,taskIds:[]});continue;}
        const time=(data.times||[]).find(t=>t['产品编号']===product&&t['工序编号']===operation);const duration=Number(time?.['固定分钟']);if(!time||!Number.isFinite(duration)||duration<=0){findings.push({code:'INPUT / PROCESS_TIME',message:`产品 ${product} / 工序 ${operation} 工时缺失或无效`,taskIds:[]});continue;}
        const predecessor=op['前序工序']?done.get(op['前序工序']):undefined; if(op['前序工序']&&!predecessor){retainBlockedDemand(order,operation,conditions.startMinute??0,'前序未排；投料分钟仅为候选检查时点');findings.push({code:'INPUT / PREDECESSOR',message:`${operation} 引用的前序 ${op['前序工序']} 未排入`,taskIds:[]});continue;}
        const busy=machineBusy.get(machineId)||[];let candidate=Math.max(conditions.startMinute??0,predecessor?.end||0,minimal||policy?0:supplyEarliestMinute(oid,operation,resolvedSupplies,data.supplyUses||[]));const initialEarliest=candidate;let start:number|null=null;let reason='';
        const calendarId=machine['日历编号']?.trim()||(data.calendars||[])[0]?.['日历编号']||'';
        const firstCalendarFit=minimal?initialEarliest:findCalendarWindow(calendarId,initialEarliest,duration,data.calendars||[],data.downtime||[],machineId).start;
        let materialPreview:ReturnType<ReturnType<typeof createMaterialAllocator>['preview']>|null=null;
        let materialError='',resourceError='',personnelError='';
        const members=batches?batches.byId.get(oid).members:[{orderId:oid}];
        const claims=minimal?[]:claimsFor(sourceData,members,operation,flags);
        const personnelRequirements=minimal?[]:(data.dependencies||[]).filter(d=>d['订单编号']===oid&&d['工序编号']===operation&&d['资源类型']==='人员技能');
        let jointPreview:ReturnType<typeof previewResources>={ok:true,allocations:[]};
        let personnel:ReturnType<typeof allocatePersonnel>={ok:true,allocations:[]};
        for(let attempt=0;attempt<1000;attempt++){
          const fit=minimal?{start:candidate,reason:''}:findCalendarWindow(calendarId,candidate,duration,data.calendars||[],data.downtime||[],machineId);
          if(fit.start===null){reason=fit.reason;break;}
          const overlap=busy.find(t=>fit.start!<t.end&&fit.start!+duration>t.start);
          if(overlap){candidate=overlap.end;continue;}
          jointPreview=previewResources(claims,fit.start,fit.start+duration,resourceReservations);
          if(!jointPreview.ok){resourceError=jointPreview.reason||'资源不可用';if(jointPreview.nextStart!==undefined&&jointPreview.nextStart>fit.start){candidate=jointPreview.nextStart;continue;}break;}
          personnel=allocatePersonnel(personnelRequirements,data.personnelGroups||[],fit.start,fit.start+duration,personnelReservations);
          if(!personnel.ok){
           personnelError=personnel.reason||'人员不可用';
           const next=personnelRequirements.flatMap(r=>[...personnelReservations.map(p=>p.end-Number(r['人员开始偏移']||0)),...(data.personnelGroups||[]).map(g=>Number(g['可用起始分钟'])-Number(r['人员开始偏移']||0))]).filter(t=>Number.isFinite(t)&&t>fit.start!);
           if(next.length){candidate=Math.min(...next);continue;}break;
          }
          if(allocator){
           try{materialPreview=allocator.preview(demandFor(order,operation,fit.start),fit.start);}
           catch(e){materialError=e instanceof Error?e.message:'物料口径无效';break;}
           if(!materialPreview.ok){const next=allocator.futureMinutes.find(m=>m>fit.start!);if(next!==undefined){candidate=next;continue;}materialError='物料不足';break;}
          }
          start=fit.start;break;
        }
        if(allocator && (materialError||start===null&&materialPreview&&!materialPreview.ok)){
         if(materialPreview)materialDemands.push(...materialPreview.rows);
         findings.push({code:'UNPLANNED / MATERIAL',message:`订单 ${oid} / 工序 ${operation} 未排：${materialError||'物料不足'}。${materialPreview?.rows.filter(r=>r.shortage>0).map(r=>`${r.materialId} 需求 ${r.quantity} ${r.unit}，缺口 ${r.shortage} ${r.unit}，投料分钟 ${r.feedMinute}`).join('；')||''} 建议采购/备料或推迟；未生成采购单。`,taskIds:[`${oid}-${operation}`]});continue;
        }
        if(start===null&&(resourceError||personnelError)){
         retainBlockedDemand(order,operation,candidate,'联合资源候选失败，未占用');
         findings.push({code:resourceError?'UNPLANNED / JOINT_RESOURCE':'UNPLANNED / PERSONNEL',message:`订单 ${oid} / 工序 ${operation} 未排：${resourceError||personnelError}。全部候选资源/物料未提交；请调整显式数量、参与/释放窗口或计划范围。`,taskIds:[`${oid}-${operation}`]});continue;
        }
        if(start===null){retainBlockedDemand(order,operation,candidate,'无可用日历窗口；投料分钟仅为候选检查时点');findings.push({code:'UNPLANNED / CALENDAR',message:`订单 ${oid} / 工序 ${operation} 未排：设备 ${machineId} 不可用。${reason||'找不到满足连续工作时长的窗口'}。任务要求连续 ${duration} 分钟；跨班或中断规则尚未配置。`,taskIds:[]});continue;}
        if(conditions.endMinute!=null&&start+duration>conditions.endMinute){if(materialPreview)materialDemands.push(...materialPreview.rows.map(r=>({...r,blockedReason:'完整工序超出计划范围'})));findings.push({code:'UNPLANNED / HORIZON',message:`订单 ${oid} / 工序 ${operation} 完整工序超出计划结束分钟 ${conditions.endMinute}，未排；不代表无可行排法。`,taskIds:[]});continue;}
        const stop=minimal?null:findDowntimeShiftReason(data.downtime||[],machineId,initialEarliest,duration,firstCalendarFit??start);
        const calendarShift=firstCalendarFit!==null&&firstCalendarFit!==undefined&&firstCalendarFit>initialEarliest?(stop?`日历顺延：设备停机「${stop.reason}」${fmt(stop.start)}–${fmt(stop.end)}，安排至${fmt(start)}`:`日历顺延：工厂工作窗口，安排至${fmt(start)}`):'';
        if(materialPreview){materialPreview.commit();materialDemands.push(...materialPreview.rows);}
        const taskId=`${oid}-${operation}`;
        resourceReservations.push(...(jointPreview.allocations||[]).map(r=>({...r,taskId})),...(personnel.allocations||[]).map(r=>({type:'人员',resourceId:r.groupId,quantity:String(r.count),unit:'人',start:r.start,end:r.end,taskId})),{type:'设备',resourceId:machineId,quantity:'1',unit:'台',start,end:start+duration,taskId});
        personnelReservations.push(...(personnel.allocations||[]));
        const participation=personnelRequirements.filter(r=>Number(r['需求数量']||0)>0).map(r=>`${r['人员参与阶段']||'全工序'} ${r['人员开始偏移']||0}–${duration-Number(r['人员结束偏移']||0)} 分钟`).join('、');
        const task:Task={id:`${oid}-${operation}`,orderId:oid,productId:product,operation,label:op['工序名称']||operation,machine:machineId,start,end:start+duration,duration,predecessor:predecessor?.id||'',source:minimal?'R1 最小模式 · 订单17 · 路线10 · 固定工时11 · 给定机器12 · 机器连续可用；日历/人员/工装/物料未检查':`订单17 · 路线10 · 工时11 · 设备依赖12 · 工厂日历02 · 设备停机04${personnelRequirements.length?` · 人员阶段：${participation}`:''}${calendarShift?` · ${calendarShift}`:''}${start>initialEarliest&&resourceError?` · 联合资源顺延：${resourceError}`:''}${start>initialEarliest&&personnelError?` · 人员顺延：${personnelError}`:''}`};built.push(task);done.set(operation,task);busy.push(task);machineBusy.set(machineId,busy);
      }
    }
    const hard=validate(built);if(batches){const expanded=batches.expand(built);built.splice(0,built.length,...expanded);for(const f of findings)f.taskIds=f.taskIds.flatMap((id:string)=>batches.taskIds(id));}
    const plan:Plan={id:uid(),name:`单线计算 ${new Date().toLocaleString('zh-CN',{hour12:false})}`,createdAt:new Date().toISOString(),tasks:built,supplyConditions:minimal?[]:buildSupplyConditions(built,resolvedSupplies,policy?materialDemands.filter(r=>r.committed).flatMap(r=>r.allocations.filter(a=>a.conditional).map((a,i)=>({'引用编号':`FR020-${r.taskId}-${r.materialId}-${i}`,'订单编号':r.orderId,'工序编号':r.operation,'供给编号':a.supplyId,'使用数量':String(a.quantity)}))):sourceData.supplyUses||[]),supplyInput:minimal?undefined:supplyInput,findings:[...findings,...hard],rules:enabledRules.filter(r=>['MACHINE','PRECEDENCE','CALENDAR'].includes(r)),inputVersion:`v${inputVersion}`};
    setIssues(plan.findings);setActivePlan(plan);setVerification(null);setMessage(plan.findings.length?`生成 ${built.length} 项任务，并发现 ${plan.findings.length} 个需处理的问题。`:`生成 ${built.length} 项任务；当前启用的机器与顺序检查通过。`);
  }
 schedule(); return result!;
}
