import {originalResourceDefs} from './lib/original-resources.mjs';
import {useState} from 'react';
import {resourceMappingDef,validateResourceMappings} from './lib/resource-mapping.mjs';
type Row=Record<string,string>;
export function OriginalResourceConfig({data,onDraft,onPreview,disabled}:{data:Record<string,Row[]>;onDraft:(rows:Row[])=>void;onPreview?:()=>Promise<any>;disabled:boolean}){
 const [result,setResult]=useState<any>(null);
 const groups=new Map<string,Row[]>();
 for(const m of data.resourceMappings||[])if(m['映射模式']==='EXPLICIT_SAME_ENTITY'){const key=JSON.stringify([m['来源类别'],m['运行编号']]);groups.set(key,[...(groups.get(key)||[]),m]);}
 const authority=(m:Row)=>{try{const a=JSON.parse(m['字段权威JSON']);return a&&typeof a==='object'&&!Array.isArray(a)?a:{};}catch{return {};}};
 const issues=validateResourceMappings(data,{forRun:true});
 return <aside aria-label="原05与06运行配置合同" className="hint-box"><b>原05/06 · FR013-resource-map-v1/v2 · 显式绑定，不自动生成运行资源</b>
 <p>原CSV逐字保留；稳定来源编号显式映射到运行编号，允许不同编号的显式别名。源记录JSON及运行记录JSON须保存对应完整记录，各字段逐字核对。配置编号保持稳定，修改须递增配置版本。只有READY完整配置可供新运行采用，NOT_READY_CONFIG可保存草稿。历史方案、确认和执行事实保留原输入。</p>
 <p>支持：原模具/工具→已配置工装，套；人员技能→已配置人员组/班次和物理池，人。来源容量/窗口须等于运行工装容量或人员组资格上限/窗口；组人数不累加到物理池。全工厂/*显式映射全局唯一容量，分钟0=2026-11-02 08:00 +08:00，半开区间端点释放。表23/12须明确需求、技能、班次和取得/归还窗口，工具新运行必须启用MOLD。支持的人员池共享/互斥与交接模式见物理池配置。</p>
 <p>多来源同实体：每行选择v2与EXPLICIT_SAME_ENTITY，保留每行快照和独立配置版本，下方逐字段选择唯一权威来源/版本。同一运行编号只有一份容量和占用；来源名称可不同，运行名称仍由运行记录JSON显式维护。未启用：局部产线范围、容量相加、同组多窗口、零容量、件/重量/工时换算、未知类型或公式。均为NOT_READY_CONFIG并拒绝新运行。不同组显式绑定同池沿既有P10唯一容量合同计算。配置依据由有权用户填写，实际身份/角色/操作原因由服务端审计。</p>
 <button disabled={disabled} onClick={()=>{const rows=[...(data.resourceMappings||[])];for(const [key,id] of [['originalTools','资源编号'],['originalPersonnel','人员组编号']])for(const s of data[key]||[])if(!rows.some(m=>m['来源类别']===key&&m['来源编号']===s[id]))rows.push({...Object.fromEntries(resourceMappingDef.fields.map(f=>[f,''])),'来源类别':key,'来源编号':s[id],'源记录JSON':JSON.stringify(s),'状态':'NOT_READY_CONFIG'});onDraft(rows);setResult(null);}}>按原行创建待配置映射</button>
 <button disabled={disabled||!onPreview} onClick={async()=>{try{setResult(await onPreview!());}catch(e){setResult({issues:(e as any).detail?.issues||[{message:e instanceof Error?e.message:String(e)}]});}}}>预览来源映射与联合运行</button>
 {[...groups.entries()].map(([key,group])=>{const m=group[0],def=originalResourceDefs.find(d=>d.key===m['来源类别']);return <fieldset key={key} disabled={disabled} aria-label={`同实体字段权威 ${m['运行编号']}`}><legend>{m['来源类别']} → {m['运行编号']} · 字段权威与适用配置版本</legend><p>所有来源必须选择相同权威；不自动选择第一行。更改权威或快照后请递增受影响配置版本，并重新选择对应版本。</p>{group.map(g=><p key={g['配置编号']}>{g['配置编号']} v{g['配置版本']} · 来源 {g['来源编号']} · 原表记录行 {(data[g['来源类别']]||[]).findIndex(r=>r[def?.fields[0]||'']===g['来源编号'])+2}</p>)}{def?.fields.slice(1).map(field=>{const a=authority(m)[field],value=group.findIndex(g=>g['配置编号']===a?.['配置编号']&&g['配置版本']===a?.['配置版本']);return <label key={field}>{field}<select aria-label={`${m['运行编号']} ${field}权威来源`} value={value<0?'':String(value)} onChange={e=>{const selected=group[Number(e.target.value)];onDraft((data.resourceMappings||[]).map(g=>group.includes(g)?{...g,'字段权威JSON':JSON.stringify({...authority(g),[field]:{'配置编号':selected['配置编号'],'配置版本':selected['配置版本']}})}:g));setResult(null);}}><option value="" disabled>请选择来源及配置版本</option>{group.map((g,i)=><option key={g['配置编号']} value={String(i)}>{g['来源编号']} / {g['配置编号']} v{g['配置版本']}</option>)}</select></label>;})}</fieldset>;})}
 <p role="status">{issues.length?`NOT_READY_CONFIG：${issues.length} 项待补齐`:'READY：本配置组合校验完成，运行采用仍须预览并由新运行冻结'}</p>
 {issues.map((i:any,n:number)=><p key={n}>{i.file}:{i.row}:{i.field} {i.message}</p>)}
 {result&&<div role="status" aria-label="原资源联合预览结果">{result.issues?result.issues.map((i:any,n:number)=><p key={n}>{i.file}:{i.row}:{i.field} {i.message}</p>):<><p>零写入预览 · 版本 {result.revision} · 角色 {result.role} · 配置指纹 {result.configurationHash}</p><p>冻结映射 {result.candidate.conditions.originalResourceVersion} · 独立复核 {result.candidate.resourceVerification.status}</p>{result.candidate.tasks.map((t:any)=><p key={t.id}>{t.id} [{t.start},{t.end})</p>)}{result.candidate.resourceReservations?.map((r:any,n:number)=><p key={n}>{r.type} {r.resourceId} / 池 {r.poolId||'本资源'} / {r.quantity} / [{r.start},{r.end})</p>)}</>}</div>}
 </aside>;
}
