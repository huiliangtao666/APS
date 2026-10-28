import { useEffect, useMemo, useState } from 'react';
import './index.css';
import { usePraetorEmbedded } from './praetor-embedded';

type Row = Record<string, string>;
type TableDef = { key: string; label: string; file: string; fields: string[] };
type Task = { id: string; orderId: string; productId: string; operation: string; label: string; machine: string; start: number; end: number; duration: number; predecessor: string; source: string };
type Finding = { code: string; message: string; taskIds: string[] };
type Plan = { id: string; name: string; createdAt: string; tasks: Task[]; findings: Finding[]; rules: string[]; inputVersion: string };

const defs: TableDef[] = [
  { key: 'orders', label: '订单与交期', file: '17_生产订单与交期.csv', fields: ['订单编号','产品编号','产线编号','合格需求kg','要求可交付分钟','优先顺序'] },
  { key: 'routes', label: '工艺路线', file: '10_工艺路线配置.csv', fields: ['产品编号','工序编号','工序名称','前序工序','最大等待分钟','程序编号'] },
  { key: 'times', label: '工序工时', file: '11_工序工时配置.csv', fields: ['产品编号','工序编号','计算方式','固定分钟','速度支每分钟'] },
  { key: 'machines', label: '设备资源', file: '03_设备资源配置.csv', fields: ['设备编号','设备名称','产线编号','工序编号','日历编号','最小装载kg','最大装载kg','装载计量基准'] },
  { key: 'calendars', label: '工厂工作日历', file: '02_工厂工作日历.csv', fields: ['日历编号','工厂编号','起始分钟','结束分钟','是否工作','说明'] },
  { key: 'downtime', label: '设备停机例外', file: '04_设备停机与例外日历.csv', fields: ['设备编号','起始分钟','结束分钟','原因'] },
  { key: 'dependencies', label: '工序资源依赖', file: '12_工序资源与物料依赖.csv', fields: ['订单编号','工序编号','资源类型','资源编号','需求数量','提前占用分钟','后延占用分钟','所需技能'] },
  { key: 'tools', label: '工装配置（仅配置）', file: '18_工装配置.csv', fields: ['工装编码','工装名称','适用任务','可用数量','每任务需求数量','提前占用分钟','后延占用分钟','是否启用','说明'] },
  { key: 'rules', label: '排程规则', file: '16_排程规则配置.csv', fields: ['规则编号','中文名称','是否启用','参数JSON'] },
];
const seed: Record<string, Row[]> = {
  orders: [
    {'订单编号':'A','产品编号':'HC40','产线编号':'L01','合格需求kg':'240','要求可交付分钟':'480','优先顺序':'1'},
    {'订单编号':'B','产品编号':'HC60','产线编号':'L01','合格需求kg':'240','要求可交付分钟':'480','优先顺序':'2'},
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
  tools: [
    {'工装编码':'MOLD-40','工装名称':'HC40 注塑模具','适用任务':'MIX|FILL','可用数量':'2','每任务需求数量':'1','提前占用分钟':'15','后延占用分钟':'10','是否启用':'是','说明':'示例配置；不参与排程占用计算'},
    {'工装编码':'JIG-01','工装名称':'灌装定位夹具','适用任务':'FILL','可用数量':'3','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'5','是否启用':'是','说明':'适用任务为工序编号，使用 | 分隔'},
  ],
  rules: [
    {'规则编号':'MACHINE','中文名称':'机器不重叠','是否启用':'是','参数JSON':'{}'},
    {'规则编号':'PRECEDENCE','中文名称':'工序顺序','是否启用':'是','参数JSON':'{}'},
    ...[['CALENDAR','工厂及设备日历','是'],['MOLD','模具与工具占用','否'],['LABOR','人员技能及数量','否'],['MATERIAL','物料数量及可用时点','否'],['CAPACITY','设备装载','否'],['PROGRAM','资源程序兼容','否'],['MAX_LAG','工序最大等待','否'],['STORAGE','空间容量','否'],['PROGRESS','执行保护','否'],['DELIVERY','预计可交付','否']].map(([id,label,on])=>({'规则编号':id,'中文名称':label,'是否启用':on,'参数JSON':'{}'})),
  ],
};

const storageKey = 'aps-fr006-foundation-data-v1';
function loadData() { try { const v = localStorage.getItem(storageKey); if(!v)return structuredClone(seed); const saved=JSON.parse(v) as Record<string,Row[]>; const merged={...structuredClone(seed),...saved}; if(!merged.calendars?.length)merged.calendars=structuredClone(seed.calendars); if(!merged.downtime)merged.downtime=[]; const calendarRule=merged.rules?.find(r=>r['规则编号']==='CALENDAR'); if(calendarRule)calendarRule['是否启用']='是'; return merged; } catch { return structuredClone(seed); } }
function uid() { return `R1-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`; }
function parseCsv(text: string): string[][] { const rows: string[][]=[]; let row:string[]=[], cell='', quoted=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;} if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);} return rows; }
function validateTools(rows:Row[]):string[]{
  const issues:string[]=[];const seen=new Set<string>();
  rows.forEach((r,i)=>{const line=i+2,code=(r['工装编码']||'').trim();
    if(!code)issues.push(`第 ${line} 行：工装编码必填`);
    else if(seen.has(code))issues.push(`第 ${line} 行：工装编码 ${code} 重复`);else seen.add(code);
    if(!(r['工装名称']||'').trim())issues.push(`第 ${line} 行：工装名称必填`);
    if(!(r['适用任务']||'').trim())issues.push(`第 ${line} 行：适用任务必填（使用工序编号，多个值以 | 分隔）`);
    for(const field of ['可用数量','每任务需求数量']){const n=Number(r[field]);if(!Number.isInteger(n)||n<1)issues.push(`第 ${line} 行：${field} 必须为大于 0 的整数`);}
    for(const field of ['提前占用分钟','后延占用分钟']){const n=Number(r[field]);if(r[field]===''||!Number.isInteger(n)||n<0)issues.push(`第 ${line} 行：${field} 必须为大于等于 0 的整数`);}
    if(!['是','否'].includes(r['是否启用']||''))issues.push(`第 ${line} 行：是否启用只能为“是”或“否”`);
  });return issues;
}
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

export default function App() {
  const embedded = usePraetorEmbedded();
  const [data,setData]=useState<Record<string,Row[]>>(loadData);
  const [view,setView]=useState<'schedule'|'data'|'decisions'>('schedule');
  const [tableKey,setTableKey]=useState('orders');
  const [selected,setSelected]=useState<string[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [activePlan,setActivePlan]=useState<Plan|null>(null);
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [issues,setIssues]=useState<Finding[]>([]);
  const [inputVersion,setInputVersion]=useState(0);
  const currentDef=defs.find(d=>d.key===tableKey)!;
  const currentRows=data[tableKey]||[];
  const visibleRows=currentRows.map((row,index)=>({row,index})).filter(({row})=>!query||currentDef.fields.some(f=>String(row[f]||'').toLowerCase().includes(query.trim().toLowerCase())));
  const toolIssues=tableKey==='tools'?validateTools(currentRows):[];
  const toolingStatus=!(data.tools||[]).length?'未配置 / 未启用 / 未检查':validateTools(data.tools||[]).length?'配置无效 / 未启用 / 未检查':'已配置 / 未启用 / 未检查';
  const enabledRules=(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
  const tasks=activePlan?.tasks||[];
  const maxTime=Math.max(120,...tasks.map(t=>t.end));

  useEffect(()=>{localStorage.setItem(storageKey,JSON.stringify(data));},[data]);
  useEffect(()=>{fetch('/api/plans').then(r=>r.json()).then((list:Plan[])=>{setPlans(list);if(list.length)setActivePlan(list[0]);}).catch(()=>{});},[]);
  function replaceRow(index:number,field:string,value:string){setData(prev=>({...prev,[tableKey]:prev[tableKey].map((row,i)=>i===index?{...row,[field]:value}:row)}));setInputVersion(v=>v+1);}
  function addRow(){setData(prev=>({...prev,[tableKey]:[...(prev[tableKey]||[]),Object.fromEntries(currentDef.fields.map(f=>[f,'']))]}));setInputVersion(v=>v+1);}
  function removeRows(){setData(prev=>({...prev,[tableKey]:prev[tableKey].filter((_,i)=>!selected.includes(String(i)))}));setSelected([]);setInputVersion(v=>v+1);}
  async function importCsv(file?:File){if(!file)return;const rows=parseCsv(await file.text()).filter(r=>r.some(c=>c.trim()));if(rows.length<2){setMessage('CSV 需要表头和至少一行数据。');return;}const headers=rows[0].map(h=>h.replace(/^\ufeff/, '').trim());const missing=currentDef.fields.filter(f=>!headers.includes(f));if(missing.length){setMessage(`字段不匹配，缺少：${missing.join('、')}`);return;}const parsed=rows.slice(1).map(cells=>Object.fromEntries(currentDef.fields.map(f=>[f,cells[headers.indexOf(f)]||''])));if(tableKey==='tools'){const errors=validateTools(parsed);if(errors.length){setMessage(`导入校验失败（未替换现有配置）：${errors.slice(0,5).join('；')}${errors.length>5?'；…':''}`);return;}}setData(prev=>({...prev,[tableKey]:parsed}));setInputVersion(v=>v+1);setMessage(`已导入 ${parsed.length} 行 ${currentDef.file}；仅替换当前表。`);}
  function downloadCsv(){const rows=[currentDef.fields,...currentRows.map(r=>currentDef.fields.map(f=>r[f]||''))];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=currentDef.file;a.click();URL.revokeObjectURL(a.href);}
  function schedule(){
    const built:Task[]=[]; const findings:Finding[]=[]; const machineBusy=new Map<string,Task[]>();
    const sorted=[...(data.orders||[])].sort((a,b)=>Number(a['优先顺序'])-Number(b['优先顺序']));
    const productionLines=[...new Set(sorted.map(o=>o['产线编号']?.trim()).filter(Boolean))];
    const missingLineOrders=sorted.filter(o=>!o['产线编号']?.trim()).map(o=>o['订单编号']||'（未编号）');
    if(productionLines.length>1||missingLineOrders.length){
      if(productionLines.length>1)findings.push({code:'SCOPE / MULTI_LINE',message:`R1 仅支持单线计算；当前订单包含多条产线：${productionLines.join('、')}。请拆分为单线订单集后再计算。`,taskIds:[]});
      if(missingLineOrders.length)findings.push({code:'INPUT / LINE_MISSING',message:`以下订单缺少产线编号：${missingLineOrders.join('、')}。请补齐后再运行单线计算。`,taskIds:[]});
      const plan:Plan={id:uid(),name:`单线计算 ${new Date().toLocaleString('zh-CN',{hour12:false})}`,createdAt:new Date().toISOString(),tasks:[],findings,rules:enabledRules.filter(r=>['MACHINE','PRECEDENCE','CALENDAR'].includes(r)),inputVersion:`v${inputVersion}`};
      setIssues(findings);setActivePlan(plan);setMessage(findings.map(f=>f.message).join(' '));return;
    }
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
      const done=new Map<string,Task>();
      for(const op of orderedRoute){const operation=op['工序编号'];const dep=(data.dependencies||[]).find(d=>d['订单编号']===oid&&d['工序编号']===operation&&d['资源类型']==='设备');const machineId=dep?.['资源编号']||'';const machine=(data.machines||[]).find(m=>m['设备编号']===machineId&&m['工序编号']===operation);
        if(!dep||!machine){findings.push({code:'INPUT / MACHINE_DEPENDENCY',message:`订单 ${oid} / 工序 ${operation} 缺少有效设备依赖（12_工序资源与物料依赖.csv）`,taskIds:[]});continue;}
        const time=(data.times||[]).find(t=>t['产品编号']===product&&t['工序编号']===operation);const duration=Number(time?.['固定分钟']);if(!time||!Number.isFinite(duration)||duration<=0){findings.push({code:'INPUT / PROCESS_TIME',message:`产品 ${product} / 工序 ${operation} 工时缺失或无效`,taskIds:[]});continue;}
        const predecessor=op['前序工序']?done.get(op['前序工序']):undefined; if(op['前序工序']&&!predecessor){findings.push({code:'INPUT / PREDECESSOR',message:`${operation} 引用的前序 ${op['前序工序']} 未排入`,taskIds:[]});continue;}
        const busy=machineBusy.get(machineId)||[];let candidate=predecessor?.end||0;const initialEarliest=candidate;let start:number|null=null;let reason='';
        const calendarId=machine['日历编号']?.trim()||(data.calendars||[])[0]?.['日历编号']||'';
        const firstCalendarFit=findCalendarWindow(calendarId,initialEarliest,duration,data.calendars||[],data.downtime||[],machineId).start;
        for(let attempt=0;attempt<1000;attempt++){
          const fit=findCalendarWindow(calendarId,candidate,duration,data.calendars||[],data.downtime||[],machineId);
          if(fit.start===null){reason=fit.reason;break;}
          const overlap=busy.find(t=>fit.start!<t.end&&fit.start!+duration>t.start);
          if(overlap){candidate=overlap.end;continue;}
          start=fit.start;break;
        }
        if(start===null){findings.push({code:'UNPLANNED / CALENDAR',message:`订单 ${oid} / 工序 ${operation} 未排：设备 ${machineId} 不可用。${reason||'找不到满足连续工作时长的窗口'}。任务要求连续 ${duration} 分钟；跨班或中断规则尚未配置。`,taskIds:[]});continue;}
        const stop=(data.downtime||[]).find(r=>r['设备编号']===machineId&&Number(r['起始分钟'])<((firstCalendarFit??start)+duration)&&Number(r['结束分钟'])>(firstCalendarFit??start));
        const calendarShift=firstCalendarFit!==null&&firstCalendarFit!==undefined&&firstCalendarFit>initialEarliest?(stop?`日历顺延：设备停机「${stop['原因']||'设备停机'}」${fmt(Number(stop['起始分钟']))}–${fmt(Number(stop['结束分钟']))}，安排至${fmt(start)}`:`日历顺延：工厂工作窗口，安排至${fmt(start)}`):'';
        const task:Task={id:`${oid}-${operation}`,orderId:oid,productId:product,operation,label:op['工序名称']||operation,machine:machineId,start,end:start+duration,duration,predecessor:predecessor?.id||'',source:`订单17 · 路线10 · 工时11 · 设备依赖12 · 工厂日历02 · 设备停机04${calendarShift?` · ${calendarShift}`:''}`};built.push(task);done.set(operation,task);busy.push(task);machineBusy.set(machineId,busy);
      }
    }
    const hard=validate(built);const plan:Plan={id:uid(),name:`单线计算 ${new Date().toLocaleString('zh-CN',{hour12:false})}`,createdAt:new Date().toISOString(),tasks:built,findings:[...findings,...hard],rules:enabledRules.filter(r=>['MACHINE','PRECEDENCE','CALENDAR'].includes(r)),inputVersion:`v${inputVersion}`};
    setIssues(plan.findings);setActivePlan(plan);setMessage(plan.findings.length?`生成 ${built.length} 项任务，并发现 ${plan.findings.length} 个需处理的问题。`:`生成 ${built.length} 项任务；当前启用的机器与顺序检查通过。`);
  }
  async function savePlan(){if(!activePlan){setMessage('请先计算一个排程。');return;}const plan={...activePlan,id:activePlan.id||uid(),createdAt:new Date().toISOString()};try{const res=await fetch('/api/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan)});if(!res.ok)throw new Error();const list=await fetch('/api/plans').then(r=>r.json());setPlans(list);setActivePlan(plan);setMessage('排程快照已保存，后续输入变化不会覆盖这份方案。');}catch{setMessage('保存失败：应用 API 当前不可用。');}}
  function exportPlan(){if(!activePlan)return;const csv='任务编号,订单编号,产品编号,工序编号,设备编号,开始分钟,结束分钟,工时分钟,前序任务\r\n'+activePlan.tasks.map(t=>[t.id,t.orderId,t.productId,t.operation,t.machine,t.start,t.end,t.duration,t.predecessor].join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`${activePlan.id}-tasks.csv`;a.click();URL.revokeObjectURL(a.href);}
  const visibleFindings=useMemo(()=>issues.length?issues:(activePlan?.findings||[]),[issues,activePlan]);
  function locate(f:Finding){setSelected(f.taskIds);setView('schedule');}

  return <div className="app-shell">
    <header className={`topbar ${embedded?'embedded-topbar':''}`}><div className="brandmark">APS</div><div className="brand"><b>APS · FR-006 工装配置基础</b><span>R2.2 前置独立副本 / 配置 CRUD</span></div>{!embedded&&<nav><button className={view==='schedule'?'active':''} onClick={()=>setView('schedule')}>排程工作台</button><button className={view==='data'?'active':''} onClick={()=>setView('data')}>数据与 CSV</button><button className={view==='decisions'?'active':''} onClick={()=>setView('decisions')}>范围与待决</button></nav>}<div className="top-status"><i/>独立工作副本</div></header>
    <main>
      <section className="hero"><div><p className="eyebrow">FR-006 配置基础 · DEC-02 前置 · 不含资源占用计算</p><h1>{view==='schedule'?'R2.1 排程基线（工装未启用）':view==='data'?'工装与排程配置': '实现范围与待决项'}</h1><p className="sub">工装配置仅供录入、查询、编辑和 CSV 校验；未接入排程，资源约束标记为未检查。</p></div><div className="hero-source"><span>阶段边界</span><b>FR-006 · DEC-02 待决</b><small>当前副本与 aps-r1 隔离</small></div></section>
      {message&&<div className="toast" role="status">{message}<button onClick={()=>setMessage('')}>×</button></div>}
      {view==='schedule'&&<>
        <div className="metrics"><article><span>单线订单</span><b>{data.orders?.length||0}</b><small>FR-009 / BR-01</small></article><article><span>已排任务</span><b>{tasks.length}</b><small>机器 + 前后序</small></article><article><span>问题定位</span><b className={visibleFindings.length?'warn-text':''}>{visibleFindings.length}</b><small>问题与甘特联动</small></article><article><span>保存方案</span><b>{plans.length}</b><small>快照保留输入版本</small></article></div>
        <section className="panel control-panel"><div><h2>运行 R2.1 单线计算</h2><p>任务必须完整落入工厂工作窗口；设备在继承窗口上扣除停机区间。同机避让，后序不早于前序完成；不可完整排入的任务会显示未排原因。</p><div className="rule-chips"><span>BR-02 工序顺序</span><span>BR-03 机器占用</span><span>FR-008 日历窗口</span><span>FR-006 工装：{toolingStatus}</span><span>配置开关：{enabledRules.join(' · ')||'无'}</span></div></div><div className="actions"><button className="primary" onClick={schedule}>计算排程</button><button onClick={savePlan}>保存快照</button><button onClick={exportPlan} disabled={!activePlan}>导出 CSV</button></div></section>
        <div className="content-grid"><section className="panel gantt-panel"><div className="panel-head"><div><h2>机器甘特图</h2><p>时间以 2026-11-02 08:00（Asia/Shanghai）为分钟 0；区间按 [开始,结束)。</p></div><span className="tag">{activePlan?.name||'尚无方案'}</span></div>
          <div className="timeline"><div className="time-labels"><span>设备 / 任务</span>{Array.from({length:Math.min(8,Math.ceil(maxTime/60))},(_,i)=><span key={i}>{fmt(i*60)}</span>)}</div>
          {(data.machines||[]).filter(m=>tasks.some(t=>t.machine===m['设备编号'])).map(m=><div className="machine-row" key={m['设备编号']}><div className="machine-name"><b>{m['设备编号']}</b><small>{m['设备名称']}</small></div><div className="track">{tasks.filter(t=>t.machine===m['设备编号']).map(t=><button key={t.id} className={`task-bar ${selected.includes(t.id)?'selected':''}`} style={{left:`${Math.max(0,t.start)/Math.max(240,maxTime)*100}%`,width:`${Math.max(5,t.duration/Math.max(240,maxTime)*100)}%`}} onClick={()=>setSelected([t.id])} title={`${t.id} · ${fmt(t.start)}–${fmt(t.end)}`}><b>{t.id}</b><small>{fmt(t.start)}–{fmt(t.end)}</small></button>)}</div></div>)}
          {!tasks.length&&<div className="empty">先运行计算，生成任务甘特图。</div>}</div>
          {selected.length>0&&<div className="task-focus"><b>选中任务：{selected.join('、')}</b><span>来源：17_订单 → 10_路线 → 11_工时 → 12_资源依赖</span><button onClick={()=>setSelected([])}>清除定位</button></div>}
        </section>
        <aside className="panel issues-panel"><div className="panel-head"><div><h2>问题定位</h2><p>点击问题突出关联任务；输入错误定位到表格更正。</p></div><span className={`count ${visibleFindings.length?'error':''}`}>{visibleFindings.length}</span></div>
          {visibleFindings.length?visibleFindings.map((f,i)=><button className="finding" key={`${f.code}-${i}`} onClick={()=>{if(f.taskIds.length)locate(f);else{setTableKey(f.code.includes('ROUTE')?'routes':f.code.includes('PROCESS_TIME')?'times':f.code.includes('MACHINE')?'dependencies':f.code.includes('CALENDAR')?'calendars':f.code.includes('DOWNTIME')?'downtime':'orders');setView('data');setMessage(`问题来源已定位：${f.message}`);}}}><b>{f.code}</b><span>{f.message}</span>{f.taskIds.length>0&&<small>定位任务：{f.taskIds.join(' / ')}</small>}</button>):<div className="clear-state"><span>✓</span><b>当前已启用约束检查无冲突</b><small>仅表示机器占用、工序顺序和 R2.1 日历窗口检查无冲突；不代表交期、全订单覆盖或其他规则已通过。</small></div>}
          <div className="scope-note"><b>工装状态：{toolingStatus}</b><p>本副本保留原 R2.1 排程逻辑。FR-006 工装配置不被读取、不参与候选或占用计算；DEC-02 批准后另行设计资源占用算法。</p></div>
        </aside></div>
        <section className="panel plan-list"><div className="panel-head"><div><h2>任务明细 / 已保存方案</h2><p>任务时间、资源和前序引用支持核查；保存方案在此回看。</p></div><select value={activePlan?.id||''} onChange={e=>setActivePlan(plans.find(p=>p.id===e.target.value)||activePlan)}><option value="">当前计算</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="table-wrap"><table><thead><tr><th>任务</th><th>订单 / 产品</th><th>工序</th><th>机器</th><th>开始</th><th>结束</th><th>工时</th><th>前序</th><th>来源</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id} onClick={()=>setSelected([t.id])}><td><b>{t.id}</b></td><td>{t.orderId} / {t.productId}</td><td>{t.label} <small>{t.operation}</small></td><td>{t.machine}</td><td>{fmt(t.start)}</td><td>{fmt(t.end)}</td><td>{t.duration} 分</td><td>{t.predecessor||'—'}</td><td>{t.source}</td></tr>)}</tbody></table>{!tasks.length&&<div className="empty">暂无任务明细</div>}</div>
        </section>
      </>}
      {view==='data'&&<section className="panel data-panel"><div className="panel-head"><div><h2>工装配置与 R2.1 输入</h2><p>工装表为独立配置 CRUD，不接入排程。CSV 导入只替换当前表；工装导入会先整表校验，校验失败时保留现有配置。</p></div><div className="actions"><label className="upload">导入 CSV<input type="file" accept=".csv,text/csv" onChange={e=>importCsv(e.target.files?.[0])}/></label><button onClick={downloadCsv}>导出当前表</button><button onClick={addRow}>新增一行</button><button className="danger" onClick={removeRows} disabled={!selected.length}>删除选中</button></div></div>
        <div className="data-tabs">{defs.map(d=><button className={d.key===tableKey?'chosen':''} key={d.key} onClick={()=>{setTableKey(d.key);setSelected([]);}}>{d.label}<small>{data[d.key]?.length||0}</small></button>)}</div>
        <div className="schema-note"><b>{currentDef.file}</b><span>必需字段：{currentDef.fields.join('、')}</span>{tableKey==='tools'&&<span className="tool-unchecked">配置 CRUD 可用 · 排程状态：未启用 / 未检查</span>}</div>
        <div className="table-toolbar"><input aria-label="查询当前表" placeholder="查询当前表字段…" value={query} onChange={e=>setQuery(e.target.value)}/><span>{visibleRows.length} / {currentRows.length} 行</span></div>
        {toolIssues.length>0&&<div className="tool-validation"><b>工装配置校验（{toolIssues.length} 项）</b><span>{toolIssues.slice(0,6).join('；')}{toolIssues.length>6?'；…':''}</span></div>}
        <div className="table-wrap edit-table"><table><thead><tr><th>选</th>{currentDef.fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{visibleRows.map(({row,index})=><tr key={index}><td><input type="checkbox" checked={selected.includes(String(index))} onChange={e=>setSelected(e.target.checked?[...selected,String(index)]:selected.filter(x=>x!==String(index)))}/></td>{currentDef.fields.map(f=><td key={f}><input aria-label={`${currentDef.label} ${index+1} ${f}`} value={row[f]||''} onChange={e=>replaceRow(index,f,e.target.value)}/></td>)}</tr>)}</tbody></table>{!currentRows.length&&<div className="empty">当前表无记录。可导入 CSV 或新增行。</div>}{currentRows.length>0&&!visibleRows.length&&<div className="empty">没有匹配的记录。</div>}</div>
        <div className="hint-box"><b>{tableKey==='tools'?'工装配置边界':'数据质量检查'}</b><span>{tableKey==='tools'?'适用任务填写工序编号，多个编号用 | 分隔。提前占用和后延归还仅作为原始配置保存与展示；配置缺失或无效时状态为未启用 / 未检查。当前不验证工序存在性、资源约束冲突或日历可用性。':'计算前检查所需工艺路线、固定工时、工序设备依赖和设备编号。暂不验证跨表单位、CSV 批次原子回滚、被历史方案引用后的删除保护。'}</span></div>
      </section>}
      {view==='decisions'&&<div className="decision-layout"><section className="panel"><h2>实现边界与追溯</h2><div className="trace-row"><b>R2.1 映射</b><span>FR-008：工厂日历继承、设备停机例外与连续工作窗口；UAT-02：08:15 边界；AC-05：按日历约束排程。本页面仅覆盖 UAT-02 阶段切片。</span></div><div className="trace-row"><b>R2.1 数据</b><span>02 工厂工作日历（calendarId、factoryId、startMinute、endMinute、isWork；否行从工作段扣除）；03 设备资源.日历编号关联工厂日历；04 设备停机与例外日历（machineId、startMinute、endMinute、reason）。</span></div><div className="trace-row"><b>R2.1 行为</b><span>资源默认继承设备所引用日历对应的工厂工作窗口；无设备日历编号时回退唯一配置日历。任务须完整置于一个连续工作窗口，并排除该设备停机；端点相邻合法。工厂无工作窗口时不排任务并给出原因。</span></div><div className="trace-row"><b>R1 基线</b><span>《APS需求分析与设计说明书 v0.3》：第2.2、5、6、7、8、10、12、14章；UAT-01 和 AC-01/02/04。</span></div><div className="trace-row"><b>时间接口</b><span>分钟基准：0=2026-11-02 08:00 Asia/Shanghai；时间段 [start,end)；任务主键 orderId-operationId；来源保留订单/路线/工时/设备依赖。完整字段与测试约定见 docs/APS-TEST-HANDOFF.md。</span></div></section>
        <section className="panel"><h2>显式待决项</h2>{[
          ['D-01','同机冲突语义','R1 假定设备为独占资源，并按 [开始,结束) 判断；BR-03 的“允许并行/可用台数”如何表达需产品决策。'],
          ['D-02','排程排序策略','当前按订单“优先顺序”升序、CSV 顺序稳定排序；同优先级是否按交期/订单号、允许用户指定需确认。'],
          ['D-03','交期状态','显示输入交期，但当前不把迟交作为排程阻断条件。是否提供“只排期内”或确认迟交部分另待 BR-15/BR-17。'],
          ['D-04','固定工时与速度','只按固定分钟执行；“速度支每分钟”涉及数量基准、转换和舍入，需产品确认后支持。'],
          ['D-05','缺少机器依赖','不擅自分配兼容设备；当前作为数据错误中止该任务，默认候选设备策略待决。'],
          ['D-06','数据保存与版本','输入数据保存在浏览器 localStorage；服务端持久化已保存排程快照。后续需确定共享用户/数据库及旧方案完整输入快照格式。'],
        ].map(([id,title,body])=><article className="decision" key={id}><b>{id} · {title}</b><p>{body}</p></article>)}</section>
        <section className="panel"><h2>待决与未实现（不作隐式默认）</h2><ul className="not-in">{['跨班任务：是否允许跨日历窗口衔接，待业务确认；当前要求单个连续窗口容纳完整工序。','可中断工序：是否允许拆分、最小连续段和中断恢复规则待确认；当前不拆分任务。','开始/结束所需人员：角色、技能、人数及占用边界待配置/确认；本切片不计人员容量。','R2.2 工装和 R2.3/2.4 人员容量、工装、物料、空间、批处理及多线均未实现。','工厂日历的有效日期/周循环、节假日优先级和跨日窗口表达尚待确认；当前时间为 v0.3 单日分钟轴。','全局优化、真实工艺/质量参数、主管确认和外部 ERP/MES/WMS 集成不在此切片。'] .map(x=><li key={x}>{x}</li>)}</ul></section></div>}
      <footer>APS-Dev · FR-006 配置基础独立副本 · 未绑定预览 / 未发布 · 工装资源约束未实现</footer>
    </main>
  </div>;
}
