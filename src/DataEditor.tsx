import {originalStageDefs,originalStageNote} from './lib/original-stage-data.mjs';
import {ResourceWorkbench} from './ResourceWorkbench';
import {resourceTables} from './lib/resource-workbench.mjs';
import {originalBomNote} from './lib/original-bom.mjs';
import {MasterDataContract} from './MasterDataContract';
import {OriginalResourceConfig} from './OriginalResourceConfig';
import {toolMappingDraft} from './lib/tool-mapping-draft.mjs';
import {PersonnelPolicyTrial} from './PersonnelPolicyTrial';
import {PolicyPreview,policyOptions,policyInputSpec} from './PolicyPreview';
import {currentRecord,type IdentityContext,type RecordRef} from './lib/problem-records.mjs';
import {useEffect,useState} from 'react';
import {recordIdentity} from './lib/record-identity.mjs';
import {StructuredValue,fieldLabel} from './StructuredValue';
import {type TableDef} from './data-defs';
type Row=Record<string,string>;
export type EditProps={identityContext?:IdentityContext;initialRecord?:RecordRef|null;data?:Record<string,Row[]>;def:TableDef;rows:Row[];revision:number;canWrite:boolean;busy:boolean;reason:string;onLocate?:(table:string)=>void;onPolicyPreview?:(tables:Record<string,Row[]>,revision:number)=>Promise<any>;onSave:(tables:Record<string,Row[]>,revision:number,operation:string)=>Promise<void|{unchanged?:boolean;revision?:number}>};
export function DataEditor({initialRecord,identityContext,data={},def,rows,revision,canWrite,busy,reason,onSave,onLocate,onPolicyPreview}:EditProps){
 const [drafts,setDrafts]=useState<Record<string,Row[]>>({});
 const draft=Object.keys(drafts).length>0;
 const [previewed,setPreviewed]=useState('');
 const policyDraft=['personnelPools','personnelGroups','dependencies'].some(k=>drafts[k]);
 const draftKey=JSON.stringify(drafts);
 const needsPreview=!!drafts.resourceMappings?.some(m=>m['状态']==='READY')||policyDraft&&(drafts.personnelPools||data.personnelPools||[]).some(p=>p['策略版本']==='P10-explicit-v2'&&p['是否启用']==='是');
 useEffect(()=>{const target=initialRecord?.table===def.key?currentRecord(initialRecord,data,identityContext):null;setSelected(target?[target.index]:[]);if(target)document.getElementById(`edit-${def.key}-${target.index}-${def.fields[0]}`)?.scrollIntoView({block:'center'});},[def.key,initialRecord,revision]);
 const [base,setBase]=useState(revision);
 const [selected,setSelected]=useState<number[]>([]);
 const [operation,setOperation]=useState('edit');
 const [error,setError]=useState('');
 const [saved,setSaved]=useState('');
 const [saving,setSaving]=useState(false);
 const [toolSimulation,setToolSimulation]=useState(false);
 const [issues,setIssues]=useState<{table:string;row:number;field:string;message:string;file?:string}[]>([]);
 const [target,setTarget]=useState<{table:string;row:number;field:string}|null>(null);
 useEffect(()=>{if(!target||target.table!==def.key)return;const field=def.fields.find(f=>target.field.split(' + ').includes(f))||def.fields[0];const node=document.getElementById(`edit-${def.key}-${Math.max(0,target.row-2)}-${field}`);if(node){((node.querySelector('input:not([type="hidden"]),select') as HTMLElement)||node).focus();node.scrollIntoView({block:'center'});}setTarget(null);},[def.key,target]);
 const list=drafts[def.key]??rows,disabled=!canWrite||busy||saving;
 const stale=draft&&base!==revision;
 function newRow():Row {
  const row=Object.fromEntries(def.fields.map(f=>[f,'']));
  // Suggestions belong only to a newly added draft, never imported or existing rows.
  if(def.key==='tools')Object.assign(row,{'可用数量':'1','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'});
  if(def.key==='resourceClaims')Object.assign(row,{'占用口径':'显式逐生产批完整区间','窗口开始偏移分钟':'0','窗口结束偏移分钟':'0'});
  return row;
 }
 function change(next:Row[],op='edit'){if(!draft)setBase(revision);setDrafts({...drafts,[def.key]:next});setOperation(op);setSaved('');setError('');setIssues([]);}
 async function save(){if(!draft)return;setSaving(true);setError('');try{const result=await onSave(drafts,base,operation);setSaved(result?.unchanged?'内容相同，未新增版本或操作记录。':'保存完成，当前输入已更新；原方案及其输入保留。');setDrafts({});setSelected([]);}catch(e){setError(e instanceof Error?e.message:'保存失败');setIssues((e as any)?.detail?.issues||[]);}finally{setSaving(false);}}
 return <section aria-label="模拟记录编辑">
  {Object.prototype.hasOwnProperty.call(resourceTables,def.key)&&<ResourceWorkbench data={data} revision={revision} reason={reason} canWrite={canWrite} busy={busy} draftPending={draft} onLocate={onLocate}/>}
  <p>可跨类别暂存修改，全部草稿一起保存；新增工艺路线和工时等关联数据须一起保存。离开数据页将丢弃草稿。修改先保存在本页草稿，点击“保存修改”后由服务端检查；取消不会写入。复制后请填写新的唯一编号。删除仅影响新输入版本，已保存方案保留原输入。质量状态均为模拟状态。</p>
  {def.key==='originalResourceEvents'&&<p role="note">N06 本阶段仅MOCK资源取得、归还、释放账，原账编号须以 MOCK: 开头，所有来源标明确模拟并填写来源域、版本、行键、保管位置和SHA256。原任务/批、资源采用集合、历史规则和物理映射须完整。事件仅追加；未知释放或草稿可保留但阻断运行。完成任务不代表归还，禁止把计划结束当实际释放。不接纳真实现场账，不能据此声称现场验证或QA UAT通过。</p>}
  {def.key==='factoryLines'&&<p>五字段须显式填写，时区使用 IANA 名称（如 Asia/Shanghai）；不自动填充值。首次配置须覆盖现有机器、订单的产线及日历的工厂引用。可维护未投入排程的产线记录，R1 仍只允许一条排程产线。修改保存为新输入版本，已确认方案的原始输入保留。</p>}
  {def.key==='simulationEvents'&&<p>FR029：先更新全部在制任务观测分钟为事件时点，再保存完整事件集合；可跨表暂存后一并保存。保护策略仅支持“禁止未开始任务开工”，需处理事实JSON留空由服务器判定。故障/耗料影响事实永久保留待处理；恢复、转机、撤销及旧方案未执行任务锁定未定。模拟物料状态不代表QA在线放行。</p>}
  {["executionFacts","executionMaterials","executionSources"].includes(def.key)&&<p>FR031 模拟累计口径：可用产出与报废分开，不跨工序累加；空报废按零处理。正报废量须明确“按本工序BOM补做”或“待核对”；工时独立填写。来源汇总缺少显式物料/批次分配时阻断，不自动分批。已开始/完成事实、已耗批次、原始来源不允许删除或覆盖。</p>}
  {['tools','resourceClaims'].includes(def.key)&&<p role="note">建议初始值 / 请核对实际业务。新建工装：可用套数1、每任务需求套数1、提前取得0分钟、后延归还0分钟；新建占用声明：完整工序（显式逐生产批完整区间），窗口偏移0。仅点击“保存修改”后生效，未保存不作用新试算。来源：2026-10-30用户授权的建议，不是客户现场事实。工装编码、适用工序、真实可用起止及共享范围须按实际业务或明确CSV来源填写；同一实体请使用同一编号共享容量，不能按设备复制容量。表23仍须显式填写资源身份、订单/工序、单位及参数来源；选择“工装配置”采用表18套数/提前/后延时，表23对应三个字段须留空。时间为半开区间。已有记录、复制及CSV/API不补建议值。</p>}
  {def.key==='tools'&&(data.resourceMappings||[]).some(m=>m['来源类别']==='originalTools'&&m['状态']==='READY')&&<aside aria-label="工装映射草稿更新" className="hint-box"><b>工装修改与来源映射一起保存</b><p>编辑下方工装后，更新映射快照和配置版本，无需手工修改JSON。容量及可用期默认必须与原来源一致。仅在明确模拟时勾选下项，将草稿容量/可用期采用为可替换模拟来源；原CSV字节、旧输入和方案保持可追溯。随后先预览，确认后保存；不会自动写入。</p><label><input type="checkbox" disabled={disabled} checked={toolSimulation} onChange={e=>setToolSimulation(e.target.checked)}/>本次容量及可用期为可替换模拟配置（非客户事实）</label><button disabled={disabled||!draft} onClick={()=>{try{const result=toolMappingDraft({...data,...drafts},data,{simulation:toolSimulation});if(!draft)setBase(revision);setDrafts({...drafts,...result.tables});setSaved('映射草稿已更新，请预览后保存。');setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>更新工装映射草稿</button><button disabled={disabled||!onPolicyPreview||!drafts.resourceMappings} onClick={async()=>{try{const result=await onPolicyPreview!(drafts,base);if(!result.valid)throw Error('预览未通过，请核对配置问题');setPreviewed(draftKey);setSaved('联合预览通过，可以保存当前草稿。');setError('');}catch(e){setError(e instanceof Error?e.message:String(e));setIssues((e as any)?.detail?.issues||[]);}}}>预览工装修改（零写入）</button></aside>}
  {originalStageDefs.some(d=>d.key===def.key)&&<p>{originalStageNote}</p>}
  {def.key==='originalDependencies'&&<p>原12八列按原文保存，包括“由BOM计算”。设备按原编号映射；启用工装须配置原05运行绑定及表23声明，启用人员须配置原06绑定、班次、物理池和参与窗。关闭或未生效类别仅保留来源；启用但缺映射或物料计算合同则整批拒绝。运行依赖补充CSV使用32_运行工序资源依赖.csv，禁止用规范化值覆盖原文。</p>}
 {def.key==='originalBom'&&<p data-original-bom-contract>{originalBomNote}</p>}
<MasterDataContract table={def.key}/>
  {['resourceMappings','originalTools','originalPersonnel'].includes(def.key)&&<OriginalResourceConfig key={draftKey} data={{...data,...drafts}} disabled={disabled} onDraft={rows=>{if(!draft)setBase(revision);setDrafts({...drafts,resourceMappings:rows});setSaved('');}} onPreview={onPolicyPreview?async()=>{const result=await onPolicyPreview(Object.keys(drafts).length?drafts:{resourceMappings:data.resourceMappings||[]},base);setPreviewed(draftKey);return result;}:undefined}/>}
  <PolicyPreview table={def.key} data={{...data,...drafts}} revision={revision}/>
  {['personnelPools','personnelGroups','dependencies'].includes(def.key)&&<PersonnelPolicyTrial key={draftKey} data={{...data,...drafts}} saved={data} schedulePreview={onPolicyPreview?()=>onPolicyPreview(Object.keys(drafts).length?drafts:{personnelPools:data.personnelPools||[]},base):undefined} onPreview={()=>setPreviewed(draftKey)}/>}
  {needsPreview&&previewed!==draftKey&&<p role="status">保存启用的资源策略前，请完成当前草稿的相应条件预览；修改草稿后须重新预览。CSV导入仍独立校验完整输入。</p>}
  <div className="actions"><button disabled={disabled} onClick={()=>change([...list,newRow()],'add')}>新增一行</button><button disabled={disabled||!selected.length} onClick={()=>{change([...list,...selected.map(i=>({...list[i]}))],'copy');setSelected([]);}}>复制选中</button><button className="danger" disabled={disabled||!selected.length} onClick={()=>{change(list.filter((_,i)=>!selected.includes(i)),'delete');setSelected([]);}}>删除选中</button><button disabled={disabled||!draft||stale||!reason.trim()||(needsPreview&&previewed!==draftKey)} onClick={save}>保存修改</button><button disabled={saving||!draft} onClick={()=>{setDrafts({});setSelected([]);setError('');setIssues([]);}}>取消修改</button></div>
  {saved&&<p role="status">{saved}</p>}
  {draft&&<p role="status">未保存修改 · {Object.keys(drafts).length} 张表 · 基于版本 {base}。{stale?'服务端输入已变化，请取消草稿并刷新后重新编辑。':'保存须填写操作原因。'}</p>}
  {error&&<div role="alert"><p>{error}</p><ul aria-label="保存问题定位">{issues.map((issue,i)=><li key={i}><button onClick={()=>{onLocate?.(issue.table);setTarget(issue);}}>{issue.file||issue.table} · {issue.row>1?`第${issue.row}行`:'整表'} · {fieldLabel(issue.field)}：{issue.message} · 定位字段</button></li>)}</ul><p>行号包含 CSV 表头；整表问题需结合关联类别核对。草稿保留，修正后再保存。</p></div>}
  <div className="table-wrap edit-table"><table><thead><tr><th>选 / 记录标识</th>{def.fields.map(f=><th key={f}>{fieldLabel(f)}</th>)}</tr></thead><tbody>{list.map((row,i)=><tr key={i} className={selected.includes(i)?'selected-row':''}><td><input aria-label={`选择第${i+1}行`} type="checkbox" disabled={disabled} checked={selected.includes(i)} onChange={e=>setSelected(e.target.checked?[...selected,i]:selected.filter(x=>x!==i))}/><small>{recordIdentity(def.key,row)}</small></td>{def.fields.map(f=><td key={f}><div id={`edit-${def.key}-${i}-${f}`} tabIndex={-1}>{policyOptions(def.key,f)?<select aria-label={`${def.label} ${i+1} ${f}`} disabled={disabled} value={row[f]||''} onChange={e=>change(list.map((r,n)=>n===i?{...r,[f]:e.target.value}:r),operation)}><option value="">请选择</option>{policyOptions(def.key,f)!.map(v=><option key={v}>{v}</option>)}</select>:f.endsWith('JSON')?<StructuredValue field={f} label={`${def.label} ${i+1} ${f}`} value={row[f]||''} disabled={disabled} onChange={value=>change(list.map((r,n)=>n===i?{...r,[f]:value}:r),operation)}/>:<input {...policyInputSpec(def.key,f)} id={`field-${def.key}-${i}-${f}`} disabled={disabled} aria-label={`${def.label} ${i+1} ${f}`} value={row[f]||''} onChange={e=>change(list.map((r,n)=>n===i?{...r,[f]:e.target.value}:r),operation)}/>}</div></td>)}</tr>)}</tbody></table>{!list.length&&<p className="empty">当前表无记录。可导入 CSV 或新增行。</p>}</div>
 </section>;
}
