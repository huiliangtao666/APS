import {PolicyPreview,policyOptions} from './PolicyPreview';
import {useEffect,useState} from 'react';
import {recordIdentity} from './lib/record-identity.mjs';
import {StructuredValue,fieldLabel} from './StructuredValue';
import {type TableDef} from './data-defs';
type Row=Record<string,string>;
export type EditProps={data?:Record<string,Row[]>;def:TableDef;rows:Row[];revision:number;canWrite:boolean;busy:boolean;reason:string;onLocate?:(table:string)=>void;onSave:(tables:Record<string,Row[]>,revision:number,operation:string)=>Promise<void|{unchanged?:boolean;revision?:number}>};
export function DataEditor({data={},def,rows,revision,canWrite,busy,reason,onSave,onLocate}:EditProps){
 const [drafts,setDrafts]=useState<Record<string,Row[]>>({});
 const draft=Object.keys(drafts).length>0;
 useEffect(()=>{setSelected([]);},[def.key]);
 const [base,setBase]=useState(revision);
 const [selected,setSelected]=useState<number[]>([]);
 const [operation,setOperation]=useState('edit');
 const [error,setError]=useState('');
 const [saved,setSaved]=useState('');
 const [saving,setSaving]=useState(false);
 const [issues,setIssues]=useState<{table:string;row:number;field:string;message:string;file?:string}[]>([]);
 const [target,setTarget]=useState<{table:string;row:number;field:string}|null>(null);
 useEffect(()=>{if(!target||target.table!==def.key)return;const field=def.fields.find(f=>target.field.split(' + ').includes(f))||def.fields[0];const node=document.getElementById(`edit-${def.key}-${Math.max(0,target.row-2)}-${field}`);if(node){((node.querySelector('input:not([type="hidden"]),select') as HTMLElement)||node).focus();node.scrollIntoView({block:'center'});}setTarget(null);},[def.key,target]);
 const list=drafts[def.key]??rows,disabled=!canWrite||busy||saving;
 const stale=draft&&base!==revision;
 function change(next:Row[],op='edit'){if(!draft)setBase(revision);setDrafts({...drafts,[def.key]:next});setOperation(op);setSaved('');setError('');setIssues([]);}
 async function save(){if(!draft)return;setSaving(true);setError('');try{const result=await onSave(drafts,base,operation);setSaved(result?.unchanged?'内容相同，未新增版本或操作记录。':'保存完成，当前输入已更新；原方案及其输入保留。');setDrafts({});setSelected([]);}catch(e){setError(e instanceof Error?e.message:'保存失败');setIssues((e as any)?.detail?.issues||[]);}finally{setSaving(false);}}
 return <section aria-label="模拟记录编辑">
  <p>可跨类别暂存修改，全部草稿一起保存；新增工艺路线和工时等关联数据须一起保存。离开数据页将丢弃草稿。修改先保存在本页草稿，点击“保存修改”后由服务端检查；取消不会写入。复制后请填写新的唯一编号。删除仅影响新输入版本，已保存方案保留原输入。质量状态均为模拟状态。</p>
  {def.key==='factoryLines'&&<p>五字段须显式填写，时区使用 IANA 名称（如 Asia/Shanghai）；不自动填充值。首次配置须覆盖现有机器、订单的产线及日历的工厂引用。可维护未投入排程的产线记录，R1 仍只允许一条排程产线。修改保存为新输入版本，已确认方案的原始输入保留。</p>}
  {def.key==='simulationEvents'&&<p>FR029：先更新全部在制任务观测分钟为事件时点，再保存完整事件集合；可跨表暂存后一并保存。保护策略仅支持“禁止未开始任务开工”，需处理事实JSON留空由服务器判定。故障/耗料影响事实永久保留待处理；恢复、转机、撤销及旧方案未执行任务锁定未定。模拟物料状态不代表QA在线放行。</p>}
  {["executionFacts","executionMaterials","executionSources"].includes(def.key)&&<p>FR031 模拟累计口径：可用产出与报废分开，不跨工序累加；空报废按零处理。正报废量须明确“按本工序BOM补做”或“待核对”；工时独立填写。来源汇总缺少显式物料/批次分配时阻断，不自动分批。已开始/完成事实、已耗批次、原始来源不允许删除或覆盖。</p>}
  {def.key==='originalResourceEvents'&&<p>N06：原账只追加事件，不编辑或删除已有行。登记/草稿须有来源；释放/纠正填写前事件编号和独立原件。原账JSON包含原事实修订、原任务批清册、实际采用/未采用清单、历史规则、身份映射、逐资源实际量/单位/取得/释放及提供方。只支持每资源单连续窗口及一次全部释放。未知释放显示阻断，不能填计划结束。合成数据须标明确模拟，真实原件须由有权提供方核对。</p>}
  <PolicyPreview table={def.key} data={{...data,...drafts}} revision={revision}/>
  <div className="actions"><button disabled={disabled} onClick={()=>change([...list,Object.fromEntries(def.fields.map(f=>[f,'']))],'add')}>新增一行</button><button disabled={disabled||!selected.length} onClick={()=>{change([...list,...selected.map(i=>({...list[i]}))],'copy');setSelected([]);}}>复制选中</button><button className="danger" disabled={disabled||!selected.length} onClick={()=>{change(list.filter((_,i)=>!selected.includes(i)),'delete');setSelected([]);}}>删除选中</button><button disabled={disabled||!draft||stale||!reason.trim()} onClick={save}>保存修改</button><button disabled={saving||!draft} onClick={()=>{setDrafts({});setSelected([]);setError('');setIssues([]);}}>取消修改</button></div>
  {saved&&<p role="status">{saved}</p>}
  {draft&&<p role="status">未保存修改 · {Object.keys(drafts).length} 张表 · 基于版本 {base}。{stale?'服务端输入已变化，请取消草稿并刷新后重新编辑。':'保存须填写操作原因。'}</p>}
  {error&&<div role="alert"><p>{error}</p><ul aria-label="保存问题定位">{issues.map((issue,i)=><li key={i}><button onClick={()=>{onLocate?.(issue.table);setTarget(issue);}}>{issue.file||issue.table} · {issue.row>1?`第${issue.row}行`:'整表'} · {fieldLabel(issue.field)}：{issue.message} · 定位字段</button></li>)}</ul><p>行号包含 CSV 表头；整表问题需结合关联类别核对。草稿保留，修正后再保存。</p></div>}
  <div className="table-wrap edit-table"><table><thead><tr><th>选 / 记录标识</th>{def.fields.map(f=><th key={f}>{fieldLabel(f)}</th>)}</tr></thead><tbody>{list.map((row,i)=><tr key={i}><td><input aria-label={`选择第${i+1}行`} type="checkbox" disabled={disabled} checked={selected.includes(i)} onChange={e=>setSelected(e.target.checked?[...selected,i]:selected.filter(x=>x!==i))}/><small>{recordIdentity(def.key,row)}</small></td>{def.fields.map(f=><td key={f}><div id={`edit-${def.key}-${i}-${f}`} tabIndex={-1}>{policyOptions(def.key,f)?<select aria-label={`${def.label} ${i+1} ${f}`} disabled={disabled} value={row[f]||''} onChange={e=>change(list.map((r,n)=>n===i?{...r,[f]:e.target.value}:r),operation)}><option value="">请选择</option>{policyOptions(def.key,f)!.map(v=><option key={v}>{v}</option>)}</select>:f.endsWith('JSON')?<StructuredValue field={f} label={`${def.label} ${i+1} ${f}`} value={row[f]||''} disabled={disabled} onChange={value=>change(list.map((r,n)=>n===i?{...r,[f]:value}:r),operation)}/>:<input id={`field-${def.key}-${i}-${f}`} disabled={disabled} aria-label={`${def.label} ${i+1} ${f}`} value={row[f]||''} onChange={e=>change(list.map((r,n)=>n===i?{...r,[f]:e.target.value}:r),operation)}/>}</div></td>)}</tr>)}</tbody></table>{!list.length&&<p className="empty">当前表无记录。可导入 CSV 或新增行。</p>}</div>
 </section>;
}
