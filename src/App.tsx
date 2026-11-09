import {createInflightRequests} from './lib/inflight-requests.mjs';
import {useCallback,useEffect,useState,useRef} from 'react';
import {InputData} from './InputData';
import {appPath} from './app-path';
import {usePraetorEmbedded} from './praetor-embedded';

export default function App(){
 const embedded=usePraetorEmbedded(),reason='共享工作台操作';
 const [message,setMessage]=useState(''),[session,setSession]=useState({role:'supervisor',canWrite:true,canExport:true});
 const [navigationHost,setNavigationHost]=useState<HTMLDivElement|null>(null);
 const requests=useRef(createInflightRequests()).current;
 const api=useCallback((path:string,body?:object)=>{
  const load=async()=>{
  const response=await fetch(appPath('/api'+path),body?{method:'POST',headers:{'Content-Type':'application/json','X-APS-Request':'workbench'},body:JSON.stringify({reason,...body})}:{cache:'no-store'});
  const result=await response.json();
  if(!response.ok){const labels:Record<string,string>={INPUT_CHANGED:'数据版本已变化，请刷新后重新检查。',READINESS_CHANGED:'本次范围或参数已变化，请重新检查。',run_capacity:'已有两个计算正在运行，请等待结束后再创建运行。',forbidden:'当前角色没有此操作权限。',csrf:'请求校验失败，请刷新页面后重试。',reason_required:'操作原因未记录，请刷新页面后重试。'};
   const text=result.blockers?.length?result.blockers.map((b:any)=>b.code+'：'+b.message).join('；'):result.issues?.length?result.issues.map((i:any)=>`${i.sheet||i.file||'输入'} 第${i.row||0}行 ${i.field||''}：${i.message}`).join('；'):labels[result.error]||result.message||result.error||`HTTP ${response.status}`;
   throw Object.assign(new Error(text+(result.traceId?'；追踪号 '+result.traceId:'')),{detail:result,status:response.status});
  }return result;
  };
  if(body){requests.invalidate();return load();}
  return requests.read(path,load);
 },[requests]);
 useEffect(()=>{let live=true;api('/session').then(s=>{if(live)setSession(s);}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[api]);
 return <div className="app-shell"><header className={'topbar '+(embedded?'embedded-topbar':'')}><div className="brandmark">APS</div><div className="brand"><b>APS · 排程工作台</b></div><div className="workbook-navigation-host" ref={setNavigationHost}/><div className="top-status"><i/>预览环境</div></header><main>{message&&<div className="toast" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={()=>setMessage('')}>×</button></div>}<InputData navigationHost={navigationHost} api={api} canWrite={session.canWrite} canExport={session.canExport} reason={reason}/></main><footer>APS 排程工作台 · 演示数据仅用于软件验证</footer></div>;
}
