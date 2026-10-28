import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';
import { useAppMembership } from './auth/useAppMembership';
import { usePraetorEmbedded } from './praetor-embedded';
import { type VerificationReport, type VerificationStatus } from './lib/independent-verification.mjs';
import { validateMasterData } from './lib/master-data.mjs';
import { validateProcessConfig } from './lib/process-config.mjs';
import { validateExpectedSupply, resolveExpectedSupply, type SupplyCondition } from './lib/expected-supply.mjs';
import { queryInventoryAvailability, validateInventoryBatches } from './lib/inventory.mjs';
import { validateBomConfig } from './lib/bom-config.mjs';

type Row = Record<string, string>;
type TableDef = { key: string; label: string; file: string; fields: string[] };
type Task = { id: string; orderId: string; productId: string; operation: string; label: string; machine: string; start: number; end: number; duration: number; predecessor: string; source: string };
type Finding = { code: string; message: string; taskIds: string[] };
type StoredVerificationReport = VerificationReport & { inputFingerprint?: string };
type Plan = { id: string; name: string; createdAt: string; tasks: Task[]; findings: Finding[]; rules: string[]; inputVersion: string; verification?: StoredVerificationReport; supplyConditions?: SupplyCondition[]; supplyInput?: string };

const defs: TableDef[] = [
  { key: 'products', label: '产品与包装规格', file: '07_产品与包装规格.csv', fields: ['产品编号','产品名称','单支净重kg','每袋支数','总收率','模拟交付等待分钟'] },
  { key: 'materials', label: '物料主数据', file: '08_物料主数据.csv', fields: ['物料编号','物料名称','单位','类别'] },
  { key: 'supplies', label: '预计到料', file: '20_预计到料.csv', fields: ['供给编号','物料编号','批次编号','预计数量','预计到达时间','预计可用时间'] },
  { key: 'supplyDelays', label: '延期模拟记录', file: '21_延期模拟记录.csv', fields: ['记录编号','供给编号','记录时间','调整后到达时间','调整后可用时间','原因'] },
  { key: 'supplyUses', label: '计划供给引用', file: '22_计划供给引用.csv', fields: ['引用编号','订单编号','工序编号','供给编号','使用数量'] },
  { key: 'inventory', label: '库存批次', file: '09_库存批次.csv', fields: ['批次编号','物料编号','账面数量','已占用数量','有效期','位置','质量状态','预计可用时间'] },
  { key: 'orders', label: '订单与交期', file: '17_生产订单与交期.csv', fields: ['订单编号','产品编号','产线编号','合格需求','数量单位','要求可交付分钟','优先顺序','是否允许拆分','需求类型','订单状态'] },
  { key: 'bom', label: 'BOM 与包装用量', file: '09_BOM与包装用量.csv', fields: ['版本编号','产品编号','生效日期','投料工序编号','用量类型','物料编号','配置用量','用量单位','用量基准','收率/损耗口径备注'] },
  { key: 'routes', label: '工艺路线', file: '10_工艺路线配置.csv', fields: ['产品编号','工序编号','工序名称','前序工序','最大等待分钟','程序编号'] },
  { key: 'times', label: '工序工时', file: '11_工序工时配置.csv', fields: ['产品编号','工序编号','计算方式','固定分钟','速度支每分钟'] },
  { key: 'machines', label: '设备资源', file: '03_设备资源配置.csv', fields: ['设备编号','设备名称','产线编号','工序编号','日历编号','最小装载kg','最大装载kg','装载计量基准'] },
  { key: 'calendars', label: '工厂工作日历', file: '02_工厂工作日历.csv', fields: ['日历编号','工厂编号','起始分钟','结束分钟','是否工作','说明'] },
  { key: 'downtime', label: '设备停机例外', file: '04_设备停机与例外日历.csv', fields: ['设备编号','起始分钟','结束分钟','原因'] },
  { key: 'dependencies', label: '工序资源依赖', file: '12_工序资源与物料依赖.csv', fields: ['订单编号','工序编号','资源类型','资源编号','需求数量','提前占用分钟','后延占用分钟','所需技能','所需班次','人员参与阶段','人员开始偏移','人员结束偏移'] },
  { key: 'personnelGroups', label: '人员组与可用时间', file: '19_人员组与可用时间.csv', fields: ['人员组编号','人员组名称','人员数量','技能','班次','可用起始分钟','可用结束分钟'] },
  { key: 'rules', label: '排程规则', file: '16_排程规则配置.csv', fields: ['规则编号','中文名称','是否启用','参数JSON'] },
];
function rulesInputFingerprint(data:Record<string,Row[]>) { const source=JSON.stringify({orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],personnelGroups:data.personnelGroups||[],machines:data.machines||[],calendars:data.calendars||[],downtime:data.downtime||[],rules:data.rules||[]});let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0'); }
function parseCsv(text: string): string[][] { const rows: string[][]=[]; let row:string[]=[], cell='', quoted=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;} if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);} return rows; }
function fmt(min: number) { const n=480+Math.round(min); return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
export default function App() {
  const membership=useAppMembership();
  const requestGeneration=useRef(0);
  const embedded = usePraetorEmbedded();
  const [data,setData]=useState<Record<string,Row[]>>({});
  const [view,setView]=useState<'schedule'|'data'|'decisions'>('schedule');
  const [tableKey,setTableKey]=useState('orders');
  const [inventoryAsOf,setInventoryAsOf]=useState(new Date().toISOString().slice(0,16));
  const [selected,setSelected]=useState<string[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [activePlan,setActivePlan]=useState<Plan|null>(null);
  const [verification,setVerification]=useState<StoredVerificationReport|null>(null);
  const [message,setMessage]=useState('');
  const [issues,setIssues]=useState<Finding[]>([]);
  const [inputVersion,setInputVersion]=useState(0);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [session,setSession]=useState<{role:string;canWrite:boolean;canExport:boolean}|null>(null);
  const [operations,setOperations]=useState<{id:string;action:string;actor:string;at:string;reason:string}[]>([]);
  const orderHistory=operations.flatMap(r=>{const x=r as typeof r & {target?:string;before?:Row[];after?:Row[]};if(x.target!=='orders'||!x.before||!x.after)return [];return x.after.flatMap(row=>{const before=x.before!.find(b=>b['订单编号']===row['订单编号']);return before?['合格需求','数量单位','要求可交付分钟'].filter(f=>before[f]!==row[f]).map(f=>({orderId:row['订单编号'],field:f,before:before[f],after:row[f],changedAt:x.at})):[];});});
  const currentDef=defs.find(d=>d.key===tableKey)!;
  const currentRows=data[tableKey]||[];
  const inventoryQuery=useMemo(()=>queryInventoryAvailability(data.inventory||[],{asOf:inventoryAsOf,rules:data.rules||[]}),[data.inventory,data.rules,inventoryAsOf]);
  const inventoryIssues=useMemo(()=>validateInventoryBatches(data.inventory||[],data.materials||[]),[data.inventory,data.materials]);
  const supplyInput=JSON.stringify({supplies:data.supplies||[],delays:data.supplyDelays||[],uses:data.supplyUses||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[]});
  const supplyIssues=useMemo(()=>validateExpectedSupply(JSON.parse(supplyInput)),[supplyInput]);
  const resolvedSupplies=useMemo(()=>resolveExpectedSupply(data.supplies||[],data.supplyDelays||[]),[data.supplies,data.supplyDelays]);
  const supplyStale=!!activePlan && (activePlan.supplyInput ? activePlan.supplyInput!==supplyInput : (data.supplyUses||[]).length>0);
  const enabledRules=(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
  const tasks=activePlan?.tasks||[];
  const maxTime=Math.max(120,...tasks.map(t=>t.end));
  const verificationStale=!!verification&&(activePlan?.inputVersion!==`v${inputVersion}`||verification.inputFingerprint!==rulesInputFingerprint(data));

  async function api(path:string,body?:object) {
    const generation=requestGeneration.current;
    const r=await fetch('/api'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,reason})}:{cache:'no-store'});
    if(!r.ok){const e=await r.json();throw new Error(e.error||`HTTP ${r.status}`);}const result=await r.json();if(generation!==requestGeneration.current)throw new Error('身份已变化，请刷新');return result;
  }
  async function refresh(){const [state,list,who,log]=await Promise.all([api('/state'),api('/plans'),api('/session'),api('/operations')]);setData(state.data);setInputVersion(state.revision);setPlans(list);setSession(who);setOperations(log);}
  useEffect(()=>{requestGeneration.current++;if(membership.state.kind==='member'){refresh().catch(e=>setMessage(e.message));}else{setData({});setPlans([]);setActivePlan(null);setSession(null);}},[membership.state]);
  function perform(work:()=>Promise<void>){if(busy)return;setBusy(true);work().catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}
  function persist(rows:Row[],operation='edit'){perform(async()=>{await api('/tables/'+tableKey,{rows,revision:inputVersion,operation});await refresh();});}
  function replaceRow(index:number,field:string,value:string){persist(currentRows.map((r,i)=>i===index?{...r,[field]:value}:r));}
  function addRow(){persist([...currentRows,Object.fromEntries(currentDef.fields.map(f=>[f,'']))]);}
  function removeRows(){persist(currentRows.filter((_,i)=>!selected.includes(String(i))));setSelected([]);}
  async function importCsv(file?:File){if(!file)return;const rows=parseCsv(await file.text()).filter(r=>r.some(c=>c.trim()));if(rows.length<2){setMessage('CSV 需要表头和至少一行数据。');return;}const headers=rows[0].map(h=>h.replace(/^\ufeff/, '').trim());const optional=tableKey==='dependencies'?new Set(['所需班次','人员参与阶段','人员开始偏移','人员结束偏移']):new Set<string>();const missing=currentDef.fields.filter(f=>!optional.has(f)&&!headers.includes(f));if(missing.length){setMessage(`字段不匹配，缺少：${missing.join('、')}`);return;}const parsed=rows.slice(1).map(cells=>Object.fromEntries(currentDef.fields.map(f=>[f,headers.includes(f)?cells[headers.indexOf(f)]||'':''])));if(['supplies','supplyDelays','supplyUses'].includes(tableKey)){const next={...data,[tableKey]:parsed};const errors=validateExpectedSupply({supplies:next.supplies||[],delays:next.supplyDelays||[],uses:next.supplyUses||[],materials:next.materials||[],orders:next.orders||[],routes:next.routes||[]});if(errors.length){setMessage(`导入未应用：${errors.map(e=>e.message).join('；')}`);return;}}persist(parsed,'import');}
  function download(target:object,name:string){perform(async()=>{const r=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...target,reason})});if(!r.ok){const e=await r.json();throw new Error(e.error);}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);await refresh();});}
  function downloadCsv(){download({table:tableKey},currentDef.file);}
  function schedule(){perform(async()=>{const p=await api('/calculate',{revision:inputVersion});setActivePlan(p);setVerification(null);setIssues(p.findings);await refresh();});}
  function verifyPlan(){if(activePlan)perform(async()=>{const p=await api('/plans/'+activePlan.id+'/verify',{});setActivePlan(p);setVerification({...p.verification,inputFingerprint:rulesInputFingerprint(data)});await refresh();});}
  function savePlan(){if(activePlan)perform(async()=>{await api('/plans',{id:activePlan.id});setMessage('服务端排程快照已保存。');await refresh();});}
  function exportPlan(){if(activePlan)download({planId:activePlan.id},activePlan.id+'-tasks.csv');}
  const visibleFindings=useMemo(()=>issues.length?issues:(activePlan?.findings||[]),[issues,activePlan]);
  function locate(f:Finding){setSelected(f.taskIds);setView('schedule');}

  if(membership.state.kind!=='member')return <main className="panel"><h1>APS · 模拟排程</h1><p>身份状态：{membership.state.kind}</p><p>需要托管身份和已授权业务成员。</p><button onClick={()=>membership.signIn()}>登录</button></main>;
  return <div className="app-shell">
    <header className={`topbar ${embedded?'embedded-topbar':''}`}><div className="brandmark">APS</div><div className="brand"><b>APS · 单线最小排程</b><span>R1 原型 / v0.3 需求基线</span></div>{!embedded&&<nav><button className={view==='schedule'?'active':''} onClick={()=>setView('schedule')}>排程工作台</button><button className={view==='data'?'active':''} onClick={()=>setView('data')}>数据与 CSV</button><button className={view==='decisions'?'active':''} onClick={()=>setView('decisions')}>范围与待决</button></nav>}<div className="top-status"><i/>预览环境</div></header>
    <main>
      <section className="panel"><h2>权限与操作记录</h2><p>当前权限：{session?.role||'未取得业务权限'} · 所有质量状态均为模拟数据，无 QA 在线审批。主管确认、退回与发布流程尚未提供。</p><label>操作原因（必填）<input aria-label="操作原因" value={reason} onChange={e=>setReason(e.target.value)}/></label><button onClick={()=>{requestGeneration.current++;membership.signOut().catch(e=>setMessage(e.message));}}>退出登录</button><button onClick={()=>perform(refresh)}>刷新数据与记录</button><details><summary>操作记录（{operations.length}）</summary>{operations.map(r=><p key={r.id}>{r.at} · {r.actor} · {r.action} · {r.reason}</p>)}</details></section>
      <section className="hero"><div><p className="eyebrow">R2.1 阶段切片 · 单线 · CALENDAR + MACHINE + PRECEDENCE</p><h1>{view==='schedule'?'日历约束排程核对':view==='data'?'日历与排程数据':'实现范围与业务决策'}</h1><p className="sub">基于 v0.3 UAT-02 / 2026-11-02 08:00（Asia/Shanghai）；样例业务值均为虚构，仅用于软件验证。</p></div><div className="hero-source"><span>追溯基线</span><b>FR-008 · UAT-02 · AC-05</b><small>工厂窗口继承 · 设备停机例外 · 连续工作窗口</small></div></section>
      {message&&<div className="toast" role="status">{message}<button onClick={()=>setMessage('')}>×</button></div>}
      {view==='schedule'&&<>
        <div className="metrics"><article><span>单线订单</span><b>{data.orders?.length||0}</b><small>FR-009 / BR-01</small></article><article><span>已排任务</span><b>{tasks.length}</b><small>机器 + 前后序</small></article><article><span>问题定位</span><b className={visibleFindings.length?'warn-text':''}>{visibleFindings.length}</b><small>问题与甘特联动</small></article><article><span>保存方案</span><b>{plans.length}</b><small>快照保留输入版本</small></article></div>
        {activePlan&&<section className="panel"><h2>预计供给使用条件</h2>{supplyStale&&<p role="alert">供给、延期、引用或相关主数据已变化；当前方案是旧快照，须重新计算。保存与导出保留原方案条件。</p>}{activePlan.supplyConditions?.length ? activePlan.supplyConditions.map(c=><div className="hint-box" key={c['引用编号']}><b>{c['订单编号']} / {c['工序编号']} · 条件性计划</b><span>{c['条件说明']}</span><span>延期记录：{c['延期记录'].map(d=>`${d['记录编号']}（${d['原因']}）`).join('；')||'无'}</span></div>) : <p>{activePlan.supplyInput?'本方案没有显式引用预计供给；尚未校验全部物料需求覆盖。':'旧版方案未记录预计供给条件；请重新计算后评估。'}</p>}<p>仅对“计划供给引用”中的供给按可用时间安排；不自动分配物料、不推断 BOM 需求、不确认到货或创建采购单。</p></section>}
        <section className="panel control-panel"><div><h2>运行 FR-007 / R2.4 单线计算</h2><p>任务完整落入工厂工作窗口；机器自动运行时段与人员参与阶段分开计算。人员须同时满足人数、技能、班次和可用时间。</p><div className="rule-chips"><span>BR-02 工序顺序</span><span>BR-03 机器占用</span><span>FR-008 日历窗口</span><span>FR-007 人数与技能</span><span>配置开关：{enabledRules.join(' · ')||'无'}</span></div></div><div className="actions"><button className="primary" onClick={schedule} disabled={!session?.canWrite||busy||!reason.trim()}>计算排程</button><button onClick={verifyPlan} disabled={!activePlan||!session?.canWrite||busy||!reason.trim()}>独立复核</button><button onClick={savePlan} disabled={!session?.canWrite||busy||!reason.trim()}>保存快照</button><button onClick={exportPlan} disabled={!activePlan||!session?.canExport||busy||!reason.trim()}>导出 CSV</button></div></section>
        <section className="panel verification-panel"><div className="panel-head"><div><h2>独立结果复核 · 主管确认前</h2><p>复核器独立检查单线、机器不重叠、优先关系；每次复核读取当前订单输入。</p></div><span className={`tag ${verificationStale?'warn-text':''}`}>{!verification?'尚未复核':verificationStale?'复核已过期':'复核记录'}</span></div>
          {!verification?<div className="empty">运行“独立复核”后显示通过、问题和未检查明细。主管确认前应重新复核一次。</div>:<><div className="verification-meta"><span>复核时间：{new Date(verification.checkedAt).toLocaleString('zh-CN',{hour12:false})}</span><span>订单/规则输入标识：{verification.inputFingerprint||'旧版记录，无标识'}</span>{verificationStale&&<b>当前订单或规则输入与复核记录不一致；此复核不能用于主管确认。</b>}</div><div className="verification-grid">{([
            ['lineScope','单线约束'],['machineOverlap','机器不重叠'],['precedence','优先关系'],
          ] as const).map(([key,label])=>{const check=verification.checks[key];const statusLabel:Record<VerificationStatus,string>={pass:'通过',problem:'问题',not_checked:'未检查'};return <article className={`verification-check ${check.status}`} key={key}><div><b>{label}</b><strong>{statusLabel[check.status]}</strong></div><ul>{check.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul></article>;})}</div><small className="verification-note">本报告只复核上述三项已确认约束；保存的结果不代替主管确认。输入变更后需重新复核。</small></>}
        </section>
        <div className="content-grid"><section className="panel gantt-panel"><div className="panel-head"><div><h2>机器甘特图</h2><p>时间以 2026-11-02 08:00（Asia/Shanghai）为分钟 0；区间按 [开始,结束)。</p></div><span className="tag">{activePlan?.name||'尚无方案'}</span></div>
          <div className="timeline"><div className="time-labels"><span>设备 / 任务</span>{Array.from({length:Math.min(8,Math.ceil(maxTime/60))},(_,i)=><span key={i}>{fmt(i*60)}</span>)}</div>
          {(data.machines||[]).filter(m=>tasks.some(t=>t.machine===m['设备编号'])).map(m=><div className="machine-row" key={m['设备编号']}><div className="machine-name"><b>{m['设备编号']}</b><small>{m['设备名称']}</small></div><div className="track">{tasks.filter(t=>t.machine===m['设备编号']).map(t=><button key={t.id} className={`task-bar ${selected.includes(t.id)?'selected':''}`} style={{left:`${Math.max(0,t.start)/Math.max(240,maxTime)*100}%`,width:`${Math.max(5,t.duration/Math.max(240,maxTime)*100)}%`}} onClick={()=>setSelected([t.id])} title={`${t.id} · ${fmt(t.start)}–${fmt(t.end)}`}><b>{t.id}</b><small>{fmt(t.start)}–{fmt(t.end)}</small></button>)}</div></div>)}
          {!tasks.length&&<div className="empty">先运行计算，生成任务甘特图。</div>}</div>
          {selected.length>0&&<div className="task-focus"><b>选中任务：{selected.join('、')}</b><span>来源：17_订单 → 10_路线 → 11_工时 → 12_资源依赖</span><button onClick={()=>setSelected([])}>清除定位</button></div>}
        </section>
        <aside className="panel issues-panel"><div className="panel-head"><div><h2>问题定位</h2><p>点击问题突出关联任务；输入错误定位到表格更正。</p></div><span className={`count ${visibleFindings.length?'error':''}`}>{visibleFindings.length}</span></div>
          {visibleFindings.length?visibleFindings.map((f,i)=><button className="finding" key={`${f.code}-${i}`} onClick={()=>{if(f.taskIds.length)locate(f);else{setTableKey(f.code.startsWith('SUPPLY_')?'supplies':f.code.startsWith('INVENTORY_')?'inventory':f.code.includes('ROUTE')?'routes':f.code.includes('PROCESS_TIME')?'times':f.code.includes('MACHINE')?'dependencies':f.code.includes('CALENDAR')?'calendars':f.code.includes('DOWNTIME')?'downtime':f.code.includes('PERSONNEL')?'dependencies':'orders');setView('data');setMessage(`问题来源已定位：${f.message}`);}}}><b>{f.code}</b><span>{f.message}</span>{f.taskIds.length>0&&<small>定位任务：{f.taskIds.join(' / ')}</small>}</button>):<div className="clear-state"><span>✓</span><b>当前已启用约束检查无冲突</b><small>仅表示机器占用、工序顺序和 R2.1 日历窗口检查无冲突；不代表交期、全订单覆盖或其他规则已通过。</small></div>}
          <div className="scope-note"><b>本切片未实现</b><p>跨班和可中断策略尚无已确认业务口径；工装（R2.2）、完整物料平衡、拆合批、空间、执行事实及主管确认尚未实现；显式预计供给引用按可用时点等待。</p></div>
        </aside></div>
        <section className="panel plan-list"><div className="panel-head"><div><h2>任务明细 / 已保存方案</h2><p>任务时间、资源和前序引用支持核查；保存方案在此回看。</p></div><select value={activePlan?.id||''} onChange={e=>{const plan=plans.find(p=>p.id===e.target.value)||activePlan;setActivePlan(plan);setIssues([]);setVerification(plan?.verification||null);}}><option value="">当前计算</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="table-wrap"><table><thead><tr><th>任务</th><th>订单 / 产品</th><th>工序</th><th>机器</th><th>开始</th><th>结束</th><th>工时</th><th>前序</th><th>来源</th><th>预计供给条件</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id} onClick={()=>setSelected([t.id])}><td><b>{t.id}</b></td><td>{t.orderId} / {t.productId}</td><td>{t.label} <small>{t.operation}</small></td><td>{t.machine}</td><td>{fmt(t.start)}</td><td>{fmt(t.end)}</td><td>{t.duration} 分</td><td>{t.predecessor||'—'}</td><td>{t.source}</td><td>{activePlan?.supplyConditions?.filter(c=>c['订单编号']===t.orderId&&c['工序编号']===t.operation).map(c=>c['条件说明']).join('；')||'未引用预计供给'}</td></tr>)}</tbody></table>{!tasks.length&&<div className="empty">暂无任务明细</div>}</div>
        </section>
      </>}
      {view==='data'&&<section className="panel data-panel"><div className="panel-head"><div><h2>主数据、单位与排程输入</h2><p>FR-002 新增产品/包装规格与物料主数据；同时维护 R1/R2.1 排程表。CSV 导入只替换当前表；预计供给使用带时区 ISO 时间，其余排程时间字段使用分钟，0 = 2026-11-02 08:00 Asia/Shanghai。</p></div><div className="actions"><label className="upload">导入 CSV<input type="file" disabled={!session?.canWrite||busy||!reason.trim()} accept=".csv,text/csv" onChange={e=>importCsv(e.target.files?.[0])}/></label><button onClick={downloadCsv} disabled={!session?.canExport||busy||!reason.trim()}>导出当前表</button><button onClick={addRow} disabled={!session?.canWrite||busy||!reason.trim()}>新增一行</button><button className="danger" onClick={removeRows} disabled={!selected.length||!session?.canWrite||busy||!reason.trim()}>删除选中</button></div></div>
        <div className="data-tabs">{defs.map(d=><button className={d.key===tableKey?'chosen':''} key={d.key} onClick={()=>{setTableKey(d.key);setSelected([]);}}>{d.label}<small>{data[d.key]?.length||0}</small></button>)}</div>
        {tableKey==='inventory'&&<div className="panel inventory-panel"><div className="panel-head"><div><h2>库存账面与当前可用量</h2><p>当前可用量 = 账面数量 − 已占用数量；质量状态、预计可用时间与有效期任一不满足时，该批次可用量为 0。</p></div><label>查询时点 <input type="datetime-local" value={inventoryAsOf} onChange={e=>setInventoryAsOf(e.target.value)}/></label></div><div className="table-wrap"><table><thead><tr><th>批次</th><th>物料</th><th>账面数量</th><th>已占用</th><th>当前可用</th><th>有效期</th><th>质量状态</th><th>预计可用时间</th></tr></thead><tbody>{inventoryQuery.map(batch=><tr key={batch['批次编号']}><td>{batch['批次编号']}</td><td>{batch['物料编号']}</td><td>{batch['账面数量']}</td><td>{batch['已占用数量']}</td><td><b>{batch['当前可用数量']}</b></td><td>{batch['有效期']}</td><td>{batch['质量状态']}</td><td>{batch['预计可用时间']||'立即'}</td></tr>)}</tbody></table>{!inventoryQuery.length&&<div className="empty">没有库存批次</div>}</div><div className="hint-box"><b>质量可用状态配置</b><span>在“排程规则”中编辑 INVENTORY 规则的参数JSON，例如 {`{"可用质量状态":["合格","条件放行"]}`}。默认仅“合格”可用；待检、冻结、不合格等状态默认排除。此配置仅用于库存可用量模拟，不提供 QA 审批或放行。</span></div>{inventoryIssues.length>0&&<div className="finding-list">{inventoryIssues.map((issue,i)=><div className="finding" key={`${issue.code}-${i}`}><b>{issue.code}</b><span>{issue.message}</span></div>)}</div>}</div>}
        {['supplies','supplyDelays','supplyUses'].includes(tableKey)&&<section className="panel"><h2>预计供给 · 到达与可用分开</h2><p>全部为模拟预计量，永不计入库存账面或确认真实到货。日期时间须含时区，例如 2026-11-02T08:00:00+08:00。延期表保留原始到料，按记录时间应用全部模拟调整；CSV 只替换当前表，错误导入不会生效。</p><p>在“计划供给引用”指定订单、工序、供给及数量，计算时按调整后的预计可用时间等待；跨引用合计不能超过预计量。此引用不表示已满足该工序全部物料需求。</p><div className="table-wrap"><table><thead><tr><th>供给 / 批次</th><th>物料 / 预计量</th><th>原预计到达</th><th>原预计可用</th><th>调整后到达</th><th>调整后可用</th><th>延期记录</th><th>性质</th></tr></thead><tbody>{resolvedSupplies.map((r,i)=><tr key={i}><td>{r['供给编号']} / {r['批次编号']}</td><td>{r['物料编号']} / {r['预计数量']}</td><td>{r['预计到达时间']}</td><td>{r['预计可用时间']}</td><td>{r['生效到达时间']}</td><td>{r['生效可用时间']}</td><td>{r['延期记录'].map(d=>`${d['记录编号']}：${d['原因']}`).join('；')||'无'}</td><td>{r['供给性质']}</td></tr>)}</tbody></table></div>{supplyIssues.map((issue,i)=><div className="finding" key={i}><b>{issue.code}</b><span>{issue.message}</span></div>)}</section>}
        <div className="schema-note"><b>{currentDef.file}</b><span>必需字段：{currentDef.fields.join('、')}</span><span>可追溯：FR-013/014/015/016 · DT-09/11/13</span></div>
        {tableKey==='orders'&&<>
          <div className="hint-box"><b>FR-009 · 订单与需求</b><span>需求类型“正式订单”参与本次排程；“预测”独立保存且不混入正式排程。取消订单保留已有排程快照，之后不再生成新任务。数量单位只记录，不执行单位换算；“是否允许拆分”作为输入保存，工序任务仍按当前不可中断规则连续排程。</span></div>
          {orderHistory.length>0&&<div className="table-wrap"><table><thead><tr><th>订单</th><th>变更字段</th><th>原值</th><th>新值</th><th>记录时间</th></tr></thead><tbody>{orderHistory.map((entry,i)=><tr key={`${entry.orderId}-${entry.changedAt}-${i}`}><td>{entry.orderId}</td><td>{entry.field}</td><td>{entry.before}</td><td>{entry.after}</td><td>{entry.changedAt}</td></tr>)}</tbody></table></div>}
        </>}
        <div className="table-wrap edit-table"><table><thead><tr><th>选</th>{currentDef.fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{currentRows.map((row,i)=><tr key={i}><td><input type="checkbox" checked={selected.includes(String(i))} onChange={e=>setSelected(e.target.checked?[...selected,String(i)]:selected.filter(x=>x!==String(i)))}/></td>{currentDef.fields.map(f=><td key={f}><input disabled={!session?.canWrite||busy||!reason.trim()} aria-label={`${currentDef.label} ${i+1} ${f}`} defaultValue={row[f]||''} key={`${tableKey}-${i}-${f}-${inputVersion}`} onBlur={e=>{if(e.target.value!==(row[f]||''))replaceRow(i,f,e.target.value);}}/></td>)}</tr>)}</tbody></table>{!currentRows.length&&<div className="empty">当前表无记录。可导入 CSV 或新增行。</div>}</div>
        {tableKey==='dependencies'&&<div className="hint-box"><b>FR-007 · 人员任务需求</b><span>资源类型选“人员技能”，资源编号填人员组编号；需求数量为所需人数，所需技能与班次必须匹配。人员参与阶段用于标注装卸/操作，开始/结束偏移（分钟）定义人员相对工序开始/结束的参与窗口；偏移外的机器自动运行不占用人员。</span></div>}
        {tableKey==='personnelGroups'&&<div className="hint-box"><b>FR-007 · 人员组容量与班次</b><span>每行配置组人数、以逗号分隔的技能、班次及分钟可用窗口（以工作台显示的 2026-11-02 08:00 为分钟 0）。同组相交的任务会扣减可用人数；不满足人数、技能、班次或可用窗口时任务不可排。P0 不记录考勤。</span></div>}
        <div className="hint-box"><b>数据质量检查 · FR-004</b><span>校验产品路线工序编号/名称、重复工序、前序引用与循环，逐工序固定分钟工时，以及资源依赖的订单、工序、类型和资源编号。路线按可配置前序关系排序，CSV 行顺序不定义工艺顺序。设备依赖进入当前排程；FR-007 人员技能依赖按人数、技能、班次、参与阶段和可用窗口核验；模具、工具、空间、投料依赖只保存并检查标识。</span></div>
        {[...validateBomConfig({products:data.products||[],materials:data.materials||[],routes:data.routes||[],bom:data.bom||[]}),...validateMasterData({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],dependencies:data.dependencies||[]}),...validateProcessConfig({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],machines:data.machines||[],personnelGroups:data.personnelGroups||[]})].length>0&&<div className="finding-list">{[...validateBomConfig({products:data.products||[],materials:data.materials||[],routes:data.routes||[],bom:data.bom||[]}),...validateMasterData({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],dependencies:data.dependencies||[]}),...validateProcessConfig({products:data.products||[],materials:data.materials||[],orders:data.orders||[],routes:data.routes||[],times:data.times||[],dependencies:data.dependencies||[],machines:data.machines||[],personnelGroups:data.personnelGroups||[]})].map((issue,i)=><div className="finding" key={`${issue.code}-${i}`}><b>{issue.code}</b><span>{issue.message}</span></div>)}</div>}
      </section>}
      {view==='decisions'&&<div className="decision-layout"><section className="panel"><h2>实现边界与追溯</h2><div className="trace-row"><b>R2.1 映射</b><span>FR-008：工厂日历继承、设备停机例外与连续工作窗口；UAT-02：08:15 边界；AC-05：按日历约束排程。本页面仅覆盖 UAT-02 阶段切片。</span></div><div className="trace-row"><b>R2.1 数据</b><span>02 工厂工作日历（calendarId、factoryId、startMinute、endMinute、isWork；否行从工作段扣除）；03 设备资源.日历编号关联工厂日历；04 设备停机与例外日历（machineId、startMinute、endMinute、reason）。</span></div><div className="trace-row"><b>R2.1 行为</b><span>资源默认继承设备所引用日历对应的工厂工作窗口；无设备日历编号时回退唯一配置日历。任务须完整置于一个连续工作窗口，并排除该设备停机；端点相邻合法。工厂无工作窗口时不排任务并给出原因。</span></div><div className="trace-row"><b>R1 基线</b><span>《APS需求分析与设计说明书 v0.3》：第2.2、5、6、7、8、10、12、14章；UAT-01 和 AC-01/02/04。</span></div><div className="trace-row"><b>时间接口</b><span>分钟基准：0=2026-11-02 08:00 Asia/Shanghai；时间段 [start,end)；任务主键 orderId-operationId；来源保留订单/路线/工时/设备依赖。完整字段与测试约定见 docs/APS-TEST-HANDOFF.md。</span></div></section>
        <section className="panel"><h2>显式待决项</h2>{[
          ['D-01','同机冲突语义','R1 假定设备为独占资源，并按 [开始,结束) 判断；BR-03 的“允许并行/可用台数”如何表达需产品决策。'],
          ['D-02','排程排序策略','当前按订单“优先顺序”升序、CSV 顺序稳定排序；同优先级是否按交期/订单号、允许用户指定需确认。'],
          ['D-03','交期状态','显示输入交期，但当前不把迟交作为排程阻断条件。是否提供“只排期内”或确认迟交部分另待 BR-15/BR-17。'],
          ['D-04','固定工时与速度','只按固定分钟执行；“速度支每分钟”涉及数量基准、转换和舍入，需产品确认后支持。'],
          ['D-05','缺少机器依赖','不擅自分配兼容设备；当前作为数据错误中止该任务，默认候选设备策略待决。'],
          ['D-06','数据保存与版本','输入数据、排程快照与操作记录由服务端保存；旧浏览器数据不会自动覆盖服务端数据，需按权限导入。'],
          ['D-07','单位换算与精度','产品净重、每袋支数及物料单位目前只保存配置；kg/支/袋/箱的换算方向与链、计算/展示精度、取整时点和误差范围待 APS-Design 按 BR-18 确认。当前不换算订单/工时/包材/BOM数量。'],
          ['D-08','BOM 生效与收率/损耗','FR-003 保存产品/版本/生效日期/投料工序/物料及配置用量。生效日的区间边界、历史版本追溯方式、订单适用版本选择、用量基准，以及总收率与逐工序收率/损耗的口径均待 APS-Design 确认；当前仅做结构校验，不选版本、不展开或计算需求。'],
        ].map(([id,title,body])=><article className="decision" key={id}><b>{id} · {title}</b><p>{body}</p></article>)}</section>
        <section className="panel"><h2>待决与未实现（不作隐式默认）</h2><ul className="not-in">{['跨班任务：是否允许跨日历窗口衔接，待业务确认；当前要求单个连续窗口容纳完整工序。','可中断工序：是否允许拆分、最小连续段和中断恢复规则待确认；当前不拆分任务。','开始/结束所需人员：角色、技能、人数及占用边界待配置/确认；本切片不计人员容量。','R2.2 工装和 R2.3/2.4 人员容量、工装、物料、空间、批处理及多线均未实现。','工厂日历的有效日期/周循环、节假日优先级和跨日窗口表达尚待确认；当前时间为 v0.3 单日分钟轴。','全局优化、真实工艺/质量参数、主管确认和外部 ERP/MES/WMS 集成不在此切片。'] .map(x=><li key={x}>{x}</li>)}</ul></section></div>}
      <footer>APS-Dev 原型 · R2.1 阶段预览 · 未发布上线 · v0.3 UAT-02 虚构数据</footer>
    </main>
  </div>;
}
