import {useState} from 'react';
import {resourceMappingDef,validateResourceMappings} from './lib/resource-mapping.mjs';
type Row=Record<string,string>;
export function OriginalResourceConfig({data,onDraft,onPreview,disabled}:{data:Record<string,Row[]>;onDraft:(rows:Row[])=>void;onPreview?:()=>Promise<any>;disabled:boolean}){
 const [result,setResult]=useState<any>(null);
 const issues=validateResourceMappings(data,{forRun:true});
 return <aside aria-label="原05与06运行配置合同" className="hint-box"><b>原05/06 · FR013-resource-map-v1 · 显式绑定，不自动生成运行资源</b>
 <p>原CSV逐字保留；稳定来源编号显式映射到运行编号，允许不同编号的显式别名。源记录JSON及运行记录JSON须保存对应完整记录，各字段逐字核对。配置编号保持稳定，修改须递增配置版本。只有READY完整配置可供新运行采用，NOT_READY_CONFIG可保存草稿。历史方案、确认和执行事实保留原输入。</p>
 <p>支持：原模具/工具→已配置工装，套；人员技能→已配置人员组/班次和物理池，人。来源容量/窗口须等于运行工装容量或人员组资格上限/窗口；组人数不累加到物理池。全工厂/*显式映射全局唯一容量，分钟0=2026-11-02 08:00 +08:00，半开区间端点释放。表23/12须明确需求、技能、班次和取得/归还窗口，工具新运行必须启用MOLD。支持的人员池共享/互斥与交接模式见物理池配置。</p>
 <p>未启用：局部产线范围、多来源合并/容量相加、同组多窗口、零容量、件/重量/工时换算、未知类型或公式。均为NOT_READY_CONFIG并拒绝新运行。不同组显式绑定同池沿既有P10唯一容量合同计算。配置依据由有权用户填写，实际身份/角色/操作原因由服务端审计。</p>
 <button disabled={disabled} onClick={()=>{const rows=[...(data.resourceMappings||[])];for(const [key,id] of [['originalTools','资源编号'],['originalPersonnel','人员组编号']])for(const s of data[key]||[])if(!rows.some(m=>m['来源类别']===key&&m['来源编号']===s[id]))rows.push({...Object.fromEntries(resourceMappingDef.fields.map(f=>[f,''])),'来源类别':key,'来源编号':s[id],'源记录JSON':JSON.stringify(s),'状态':'NOT_READY_CONFIG'});onDraft(rows);setResult(null);}}>按原行创建待配置映射</button>
 <button disabled={disabled||!onPreview} onClick={async()=>{try{setResult(await onPreview!());}catch(e){setResult({issues:(e as any).detail?.issues||[{message:e instanceof Error?e.message:String(e)}]});}}}>预览来源映射与联合运行</button>
 <p role="status">{issues.length?`NOT_READY_CONFIG：${issues.length} 项待补齐`:'READY：本配置组合校验完成，运行采用仍须预览并由新运行冻结'}</p>
 {issues.map((i:any,n:number)=><p key={n}>{i.file}:{i.row}:{i.field} {i.message}</p>)}
 {result&&<div role="status" aria-label="原资源联合预览结果">{result.issues?result.issues.map((i:any,n:number)=><p key={n}>{i.file}:{i.row}:{i.field} {i.message}</p>):<><p>零写入预览 · 版本 {result.revision} · 角色 {result.role} · 配置指纹 {result.configurationHash}</p><p>冻结映射 {result.candidate.conditions.originalResourceVersion} · 独立复核 {result.candidate.resourceVerification.status}</p>{result.candidate.tasks.map((t:any)=><p key={t.id}>{t.id} [{t.start},{t.end})</p>)}{result.candidate.resourceReservations?.map((r:any,n:number)=><p key={n}>{r.type} {r.resourceId} / 池 {r.poolId||'本资源'} / {r.quantity} / [{r.start},{r.end})</p>)}</>}</div>}
 </aside>;
}
