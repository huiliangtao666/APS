import {useState} from 'react';
import {allocatePersonnel} from './lib/staffing.mjs';
import {validatePhysicalPools} from './lib/physical-pools.mjs';
type Row=Record<string,string>;
// Pure local candidate evaluation: no persistence, worker, confirmation or facts.
export function PersonnelPolicyTrial({data,saved,onPreview,schedulePreview}:{data:Record<string,Row[]>;saved:Record<string,Row[]>;onPreview:()=>void;schedulePreview?:()=>Promise<any>}){
 const [order,setOrder]=useState(''),[operation,setOperation]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const [result,setResult]=useState<any>(null);
 async function preview(){
  const errors:any[]=validatePhysicalPools(data,{forRun:true});
  if(!order||!operation||!/^\d+$/.test(start)||!/^\d+$/.test(end)||Number(start)>=Number(end)||Number(end)>525600)errors.push({message:'请选择订单、工序并显式填写候选开始/结束分钟（0–525600且开始<结束）'});
  const run=(d:Record<string,Row[]>)=>{const req=(d.dependencies||[]).filter(r=>r['资源类型']==='人员技能'&&r['订单编号']===order&&r['工序编号']===operation);return req.length?allocatePersonnel(req,d.personnelGroups||[],Number(start),Number(end),[],d.skillSubstitutions||[],d.personnelPools||[]):{ok:false,reason:'此订单/工序没有人员需求'};};
  if(errors.length){setResult({errors});return;}
  try{const schedule=schedulePreview?await schedulePreview():null;const candidate=run(data);setResult({candidate,before:run(saved),schedule});onPreview();}catch(e){setResult({errors:(e as any)?.detail?.issues||[{message:e instanceof Error?e.message:'联合预览失败'}]});}
 }
 return <aside aria-label="采用前人员条件预览" className="hint-box"><b>采用前人员条件预览（零写入）</b><p>显式选择候选工序窗口，比较已保存配置和当前草稿。仅检验此工序人员、技能、组/池容量、共享互斥、交接上限与占用释放；没有已有任务预占，不检查其他工序、工厂日历、设备或物料，也不证明最终排程可行。点击预览还会按当前订单和草稿，在服务端零写入计算完整联合排程，展示保存前后任务时点、资源声明和独立复核。预览不启用或保存输入；保存后新Worker仍冻结当时版本，数据变化须重新预览。</p>
 <label>预览订单<select aria-label="预览订单" value={order} onChange={e=>{setOrder(e.target.value);setResult(null);}}><option value="">请选择</option>{(data.orders||[]).map(o=><option key={o['订单编号']}>{o['订单编号']}</option>)}</select></label>
 <label>预览工序<input aria-label="预览工序" value={operation} onChange={e=>{setOperation(e.target.value);setResult(null);}}/></label>
 <label>候选开始分钟<input aria-label="候选开始分钟" type="number" min="0" max="525600" step="1" value={start} onChange={e=>{setStart(e.target.value);setResult(null);}}/></label>
 <label>候选结束分钟<input aria-label="候选结束分钟" type="number" min="0" max="525600" step="1" value={end} onChange={e=>{setEnd(e.target.value);setResult(null);}}/></label>
 <button onClick={preview}>预览人员策略影响</button>
 {result&&<div role="status">{result.errors?result.errors.map((e:any,i:number)=><p key={i}>{e.file}:{e.row}:{e.field} {e.message}</p>):<><p>已保存配置：{result.before.ok?'此时点人员可分配':'此时点人员不可分配'}。草稿：{result.candidate.ok?'此时点人员可分配':'此时点人员不可分配，需顺延或调整配置'}。</p><p>{result.candidate.reason}</p>{result.schedule&&<div aria-label="联合排程影响预览"><p>联合预览 · 基于版本 {result.schedule.revision} · 可信角色 {result.schedule.role} · 配置指纹 {result.schedule.configurationHash} · 未写入</p><p>已保存配置：{result.schedule.before.status==='blocked'?'阻断：'+(result.schedule.before.message||JSON.stringify(result.schedule.before.issues)):result.schedule.before.tasks.map((t:any)=>`${t.id} [${t.start},${t.end})`).join('；')}</p><p>草稿排程：{result.schedule.candidate.tasks.map((t:any)=>`${t.id} [${t.start},${t.end})`).join('；')||'无已排任务'}；独立资源复核 {result.schedule.candidate.resourceVerification.status}</p>{result.schedule.candidate.resourceReservations?.filter((r:any)=>r.type==='人员').map((r:any,i:number)=><p key={i}>联合资源声明 {r.taskId} / 池 {r.poolId} / 组 {r.resourceId} · {r.quantity} 人 · [{r.start},{r.end})</p>)}{result.schedule.candidate.findings.map((f:any,i:number)=><p key={i}>{f.code}：{f.message}</p>)}</div>}{result.candidate.allocations?.map((a:any,i:number)=><p key={i}>资源声明：池 {a.poolId} / 组 {a.groupId} / 岗位 {a.postId} · {a.count} 人 · [{a.start},{a.end}) · {a.reason}</p>)}</>}</div>}
 </aside>;
}
