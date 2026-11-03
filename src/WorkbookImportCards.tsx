import { appPath } from './app-path';
import {useCallback,useEffect,useState} from 'react';
import {WorkbookPreview} from './WorkbookPreview';
import type {PreviewMemory} from './WorkbookPreview';
type Props={cardMemory:{current:Record<string,any>};previewMemory:{current:Record<string,PreviewMemory>};download:(path:string,name:string)=>Promise<void>;onMaintenance:(target:any)=>void;api:(p:string,b?:object)=>Promise<any>;sets:any[];datasetId:string;version?:number;canWrite:boolean;canExport:boolean;reason:string;onCommitted:(r:any)=>Promise<void>;onBusy:(b:boolean)=>void};
export function WorkbookImportCards(props:Props){return <div className="workbook-import-cards">{(['business','parameter'] as const).map(kind=><ImportCard key={kind} {...props} kind={kind}/>)}</div>;}
function ImportCard({api,cardMemory,previewMemory,download,onMaintenance,sets,datasetId,version,canWrite,canExport,reason,onCommitted,onBusy,kind}:Props&{kind:'business'|'parameter'}){
 const saved=cardMemory.current[kind]||{};
 const [file,setFile]=useState<File|undefined>(saved.file),[mode,setMode]=useState(saved.mode||(kind==='parameter'?'dataset':'candidate')),[overlayResolution,setOverlayResolution]=useState(saved.overlayResolution||'keep'),[preview,setPreview]=useState<any>(saved.preview),[busy,setBusy]=useState(false),[message,setMessage]=useState(saved.message||'');
 useEffect(()=>{cardMemory.current[kind]={file,mode,overlayResolution,preview,message};},[cardMemory,kind,file,mode,overlayResolution,preview,message]);
 const previewApi=useCallback(async(p:string,b?:object)=>{if(!b||!p.endsWith('/confirm'))return api(p,b);setBusy(true);onBusy(true);try{return await api(p,b);}finally{setBusy(false);onBusy(false);}},[api,onBusy]);
 const parameter=kind==='parameter',targetId=datasetId,expectedVersion=sets.find(s=>s.id===targetId)?.version||0;
 const binding=JSON.stringify({targetId,expectedVersion,version:parameter?version:undefined,mode,overlayResolution,file:file?.name,size:file?.size,stamp:file?.lastModified});
 const valid=preview?._binding===binding,allowed=canWrite&&!!datasetId&&(!parameter||!!version)&&!busy;
 async function perform(fn:()=>Promise<void>){setBusy(true);onBusy(true);setMessage('');try{await fn();}catch(e:any){const d=e.detail||{};let description=e.message;if(d.error==='INPUT_TOO_LARGE'){
   const bytes=d.recordBytes??d.derivedBytes??d.projectionBytes;
   const measure=bytes!=null?`差异明细约 ${(bytes/1024/1024).toFixed(1)} MB，允许 ${(Number(d.limit??d.limits?.maxProjectionBytes)/1024/1024).toFixed(0)} MB`:d.records!=null?`变更记录 ${d.records} 条、字段 ${d.fieldCount} 项`:'差异明细超过容量限制';
   description=`预览容量超限：${measure}。请检查本次修改是否让整列公式、整表行数或大量主键发生变化；恢复误改后重新选择 Excel 并预览。若这些变化均属预期，请凭追踪号联系维护人员评估分批导入或容量调整。${d.traceId?'追踪号 '+d.traceId:''}`;
  }setMessage(description+'；本次没有确认提交，当前有效数据集未改变。');}finally{setBusy(false);onBusy(false);}}
 async function inspect(){if(!file)return;const fileBase64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});const p=await api('/workbooks/preview',{fileBase64,fileName:file.name,name:file.name,datasetId:targetId||undefined,importKind:kind,expectedVersion,mode:parameter?mode:'candidate',scope:'dataset',overlayResolution,adoptParameters:parameter&&mode==='dataset'});setPreview({...p,_binding:binding});sessionStorage.setItem('aps-workbench-'+kind,JSON.stringify({id:p.previewId,binding}));setMessage('预览完成，尚未写入有效输入。请核对替代/删除差异和来源后确认。');}
 async function committed(r:any){setPreview((p:any)=>({...p,status:'COMMITTED'}));await onCommitted(r);setMessage('✓ 已提交新版本 v'+r.version+'；旧运行不变。'+(parameter&&mode==='candidate'?'◇ 候选不参与计算。':'本次就绪检查已失效，请重新检查。'));}
 return <section className="panel" aria-label={parameter?'配置参数Excel导入':'业务数据Excel导入'}><h3>{parameter?'配置参数 Excel · 按范围补充':'业务数据 Excel · 必做'}</h3><details className="workbook-import-help"><summary>导入规则</summary><p>{parameter?'导入到所选业务数据集；采用可用参数时第二份P优先于业务B。缺项保留资料层，按本次依赖检查。':'导入日语义业务工作簿。更新已有数据集将显式替代业务表；预览列出删除与覆盖。'}</p></details>
 {parameter?<p>目标：{datasetId} / v{version||'—'}；{!version&&'请先导入并确认业务数据 Excel。'}</p>:<p className="workbook-import-target">目标：{sets[0]?.name||'肉食品数据集（首次导入时建立）'} / v{version||'—'}。{version?'业务文件更新此数据集，预览会列出替代和删除。':'首次确认后建立数据集；预览会列出拟新增内容。'}</p>}
 {parameter&&<><label>参数文件用途<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="dataset">导入并采用可用参数（第二份优先）</option><option value="candidate">仅保存候选资料（不参与排程）</option><option disabled value="trial">仅本次试算批量导入（尚不支持）</option></select></label><label>重导P与在线修改<select value={overlayResolution} disabled={busy} onChange={e=>setOverlayResolution(e.target.value)}><option value="keep">保留已保存的在线修改</option><option value="replace">确认用新P替代匹配区间的在线修改</option></select></label><details className="workbook-import-help"><summary>参数采用说明</summary><p>仅本次覆盖请用同源参数逐项维护；批量 trial 导入未开放。配置是否必需由所选范围检查决定，候选不代表已配置。</p></details></>}
 {canExport&&<a href={appPath(parameter?'/api/workbooks/parameters/template':'/api/workbooks/business/template')}>下载{parameter?'参数三层':'业务数据'}空白Excel模板（无现场默认）</a>}
 <div className="workbook-import-actionline"><input aria-label={parameter?'配置参数Excel':'业务数据Excel'} disabled={busy||!canWrite} type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0])}/><button disabled={!allowed||!file} onClick={()=>perform(inspect)}>上传并预览</button><button disabled={busy} onClick={()=>perform(async()=>{const raw=sessionStorage.getItem('aps-workbench-'+kind);if(!raw)throw Error('没有可恢复预览');const saved=JSON.parse(raw),p=await api('/workbooks/previews/'+saved.id);setPreview({...p,_binding:saved.binding});setMessage(p.status==='COMMITTED'?'✓ 服务端确认已提交；请核对上方数据集版本。':'已查回预览：尚未提交；请核对整批差异后确认。');})}>查询导入结果</button></div>
 <p role="status" aria-live="polite">{busy?'正在处理文件或提交请求，请稍候…':preview?.status==='COMMITTED'?`✓ 导入成功：已保存为数据集 v${preview.version||version||'—'}。`:preview?._binding===binding?'◇ 预览已生成，尚未导入：请核对整批差异并在下方确认。':file?`已选择 ${file.name}；尚未上传。下一步：点击“上传并预览”。`:'尚未选择文件；请选择业务数据或配置参数 Excel。'}</p><p>仅支持 12 MB 以内 .xlsx · {file?.name||'未选择文件'}</p>
 {!allowed&&<p>! {!canWrite?'当前角色只读':busy?'正在处理':parameter&&!version?'请先导入并确认业务数据 Excel':!datasetId?'目标数据集尚未建立':'暂时无法预览'}</p>}
 {message&&<p role="status">{message}</p>}{preview&&<div className="import-preview">
 {!valid&&preview.status!=='COMMITTED'&&<p role="alert">! 文件、目标、用途或版本已变化，旧预览不可确认；筛选和草稿保留，请重新预览。</p>}
 <WorkbookPreview key={preview.previewId} api={previewApi} download={download} previewId={preview.previewId} canWrite={allowed&&valid} canExport={canExport} reason={reason} memory={previewMemory}
  onCommitted={r=>{void committed(r).catch((e:Error)=>setMessage('服务端已提交；刷新版本失败，请查询恢复，勿重新导入：'+e.message));}}
  onReimport={()=>{setPreview(undefined);setMessage('请更正原Excel并重新选择文件、预览；当前文件/用途/目标及工作台选择保留。');}}
  onMaintenance={target=>onMaintenance({...target,datasetId:preview.binding.datasetId})}/>
 </div>}
 </section>;
}
