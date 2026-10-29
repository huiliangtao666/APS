import {useEffect,useRef,useState} from 'react';
type Task={id:string;orderId:string;operation:string;machine:string;start:number;end:number;duration:number;source:string;movable:boolean;allowedMachines:string[]};
type State={planId:string;planHash:string;revision:number;blocked?:string;locks:Record<string,unknown>;tasks:Task[];limits:string[]};
type Props={trialId:string;revision:number;canWrite:boolean;disabled:boolean;api:(path:string,body?:object)=>Promise<any>;refresh:()=>Promise<void>;onResult:(id:string)=>void};
export function TrialMovePanel(p:Props){
 const [state,setState]=useState<State|null>(null),[taskId,setTaskId]=useState(''),[start,setStart]=useState('0'),[machine,setMachine]=useState(''),[preview,setPreview]=useState<any>(null),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const drag=useRef<{taskId:string;x:number;y:number;machine:string;start:number;pointer:number}|null>(null),epoch=useRef(0);
 const root='/trials/'+p.trialId,task=state?.tasks.find(t=>t.id===taskId),blocked=p.disabled||working||!p.canWrite||!!state?.blocked;
 useEffect(()=>{const n=++epoch.current;setPreview(null);setState(null);setError('');p.api(root+'/positions').then(x=>{if(n===epoch.current){if(!Array.isArray(x?.tasks)||!x.locks)throw Error('试算任务数据不完整，请刷新后重试');setState(x);}}).catch(e=>{if(n===epoch.current)setError(e.message);});return()=>{epoch.current++;};},[p.trialId,p.revision,p.canWrite]);
 function select(t:Task){setTaskId(t.id);setStart(String(t.start));setMachine(t.machine);}
 async function act(fn:()=>Promise<void>){const n=epoch.current;setWorking(true);setError('');try{await fn();}catch(e){if(n===epoch.current){setError(e instanceof Error?e.message:'操作失败');setPreview((old:any)=>old?{...old,valid:false,checked:false}:old);}}finally{setWorking(false);}}
 async function create(t:Task,minute:number,target:string,locked?:boolean){if(!state)return;const n=epoch.current;const x=await p.api(root+(locked===undefined?'/move-preview':'/lock-preview'),{revision:state.revision,planId:state.planId,planHash:state.planHash,taskId:t.id,...(locked===undefined?{start:minute,machine:target}:{locked})});if(n===epoch.current)setPreview(x);}
 async function cancel(){if(preview)await p.api(root+'/previews/'+preview.id+'/cancel',{});setPreview(null);}
 return <section aria-label="试算任务移动与锁定" className="panel"><h3>任务移动与锁定 · FR-027</h3><p>在时间轨道拖动任务：每像素 1 分钟，垂直拖到另一机器轨道可提出换机预览。也可用下方键盘表单输入准确分钟和设备。先预览，再独立复核，最后提交或取消。拖动不自动重排其他任务。机器权限仅取当前显式设备依赖；不推断替代设备。锁定冲突须处理，不自动解锁。</p>
 {error&&<p role="alert">{error}</p>}{state?.blocked&&<p role="alert">{state.blocked}：请从当前事实重算试算，保留旧结果。</p>}
 <div style={{overflowX:'auto',maxWidth:'100%'}}><div style={{position:'relative',minWidth:700}}>
 {[...new Set(state?.tasks.map(t=>t.machine)||[])].map(m=><div key={m} data-move-machine={m} aria-label={'移动轨道 '+m} style={{minHeight:75,border:'1px solid #cbd5e1',position:'relative',paddingTop:24}}><b>{m} · 分钟 0 → 600</b>{state?.tasks.filter(t=>t.machine===m).map(t=><button key={t.id} type="button" aria-label={'移动任务 '+t.id} disabled={blocked||!!preview||!t.movable||!!state.locks[t.id]} onClick={()=>select(t)} style={{position:'absolute',left:t.start,top:30,width:Math.max(40,t.duration),height:32,touchAction:'none',background:'#dbeafe',cursor:'grab'}}
 onPointerDown={e=>{if(e.button!==0)return;select(t);drag.current={taskId:t.id,x:e.clientX,y:e.clientY,start:t.start,machine:t.machine,pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerUp={e=>{const d=drag.current;drag.current=null;if(!d||d.pointer!==e.pointerId||Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)<4)return;const lane=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-move-machine]')?.getAttribute('data-move-machine');if(!lane){setError('拖动落点不在机器时间轨道内；未创建预览，方案保持原值');return;}const minute=Math.max(0,Math.round(d.start+e.clientX-d.x));setStart(String(minute));setMachine(lane);act(()=>create(t,minute,lane));}}
 onPointerCancel={()=>{drag.current=null;}}>{t.id}</button>)}</div>)}
 </div></div>
 <label>移动任务<select aria-label="移动任务" value={taskId} disabled={working||!!preview} onChange={e=>{const t=state?.tasks.find(t=>t.id===e.target.value);if(t)select(t);}}><option value="">选择任务</option>{state?.tasks.map(t=><option key={t.id} value={t.id}>{t.id} · {t.movable?'未开始':'执行保护/未支持'}{state.locks[t.id]?' · 已锁定':''}</option>)}</select></label>
 <label>移动开始分钟<input aria-label="移动开始分钟" type="number" min="0" max="525600" value={start} disabled={blocked||!!preview} onChange={e=>setStart(e.target.value)}/></label>
 <label>移动机器<select aria-label="移动机器" value={machine} disabled={blocked||!!preview} onChange={e=>setMachine(e.target.value)}>{[...new Set([machine,...(task?.allowedMachines||[])])].filter(Boolean).map(m=><option key={m}>{m}</option>)}</select></label>
 <button disabled={blocked||!!preview||!task?.movable||!!state?.locks[taskId]||start.trim()===''} onClick={()=>task&&act(()=>create(task,Number(start),machine))}>预览移动</button>
 <button disabled={blocked||!!preview||!task?.movable} onClick={()=>task&&act(()=>create(task,task.start,task.machine,!state?.locks[task.id]))}>{state?.locks[taskId]?'预览解除锁定':'预览锁定'}</button>
 {task&&<p>任务 {task.id} · {task.machine} [{task.start},{task.end}) · 工时 {task.duration} 分钟 · 来源 {task.source}</p>}
 {preview&&<article aria-label="位置预览" role="status"><p>任务 {preview.taskId} · {preview.kind==='lock'?'锁定变更':'移动'} · 原位置 {preview.before.machine} [{preview.before.start},{preview.before.end}) → {preview.after.machine} [{preview.after.start},{preview.after.end})</p><p>{!preview.checked?'尚未复核，不能提交':preview.valid?'已有支持检查通过；上游未检查项仍保留':'存在冲突，不能提交；原方案未变更'}</p>
 <button disabled={blocked} onClick={()=>act(async()=>{const n=epoch.current,x=await p.api(root+'/previews/'+preview.id+'/recheck',{});if(n===epoch.current)setPreview((old:any)=>old?.id===x.id?{...old,...x}:old);})}>独立复核位置</button>
 <button disabled={blocked||!preview.checked||!preview.valid} onClick={()=>act(async()=>{const x=await p.api(root+'/previews/'+preview.id+'/commit',{});setPreview(null);await p.refresh();p.onResult(x.id);})}>提交位置变更</button>
 <button disabled={working||!p.canWrite} onClick={()=>act(cancel)}>取消位置预览</button>
 {preview.check?.findings.map((f:any,i:number)=><p key={i}>{f.code} · {f.taskIds?.join('、')} · {f.message}</p>)}
 {preview.check&&<details><summary>独立检查、未检查范围与锁定证据</summary><pre style={{maxHeight:260,overflow:'auto'}}>{JSON.stringify({check:preview.check,locks:preview.locks},null,2)}</pre></details>}</article>}
 {state?.limits.map(l=><p key={l}>{l}</p>)}
 </section>;
}
