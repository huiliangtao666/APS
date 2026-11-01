import {useEffect,useState} from 'react';
import {BomApplication} from './BomApplication';
type Props={api:(path:string,body?:object)=>Promise<any>;canWrite:boolean};
export function StandardLossParameters({api,canWrite}:Props){
 const [state,setState]=useState<any>(),[trials,setTrials]=useState<any[]>([]),[scope,setScope]=useState(''),[message,setMessage]=useState('');
 async function load(){const [s,t]=await Promise.all([api('/state'),api('/trials')]);setState(s);setTrials(t);}
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
 const trial=trials.find(t=>t.id===scope),data=scope?trial?.data:state?.data;
 return <section aria-label="标准投入损耗双入口"><h3>标准投入数据源 · 三类损耗与继承</h3><p>此来源与当前Excel合格产出数据集分开。统一页与步骤页维护同一产品/配方/作用范围版本；仅影响相应来源的新运行。</p><label>标准投入作用范围<select aria-label="标准投入作用范围" value={scope} onChange={e=>setScope(e.target.value)}><option value="">当前标准投入共享配置</option>{trials.filter(t=>t.status==='active').map(t=><option value={t.id} key={t.id}>仅已有试算 {t.id}</option>)}</select></label>{message&&<p role="status">{message}</p>}{data&&<BomApplication key={scope||'shared'} api={api} data={data} canWrite={canWrite} trialId={scope||undefined} onSaved={load}/>}</section>;
}
