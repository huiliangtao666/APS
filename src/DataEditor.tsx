import {useEffect,useState} from 'react';
import {type TableDef} from './data-defs';
type Row=Record<string,string>;
export type EditProps={def:TableDef;rows:Row[];revision:number;canWrite:boolean;busy:boolean;reason:string;onSave:(tables:Record<string,Row[]>,revision:number,operation:string)=>Promise<void>};
export function DataEditor({def,rows,revision,canWrite,busy,reason,onSave}:EditProps){
 const [drafts,setDrafts]=useState<Record<string,Row[]>>({});
 const draft=Object.keys(drafts).length>0;
 useEffect(()=>{setSelected([]);setError('');},[def.key]);
 const [base,setBase]=useState(revision);
 const [selected,setSelected]=useState<number[]>([]);
 const [operation,setOperation]=useState('edit');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const list=drafts[def.key]??rows,disabled=!canWrite||busy||saving;
 const stale=draft&&base!==revision;
 function change(next:Row[],op='edit'){if(!draft)setBase(revision);setDrafts({...drafts,[def.key]:next});setOperation(op);setError('');}
 async function save(){if(!draft)return;setSaving(true);setError('');try{await onSave(drafts,base,operation);setDrafts({});setSelected([]);}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setSaving(false);}}
 return <section aria-label="模拟记录编辑">
  <p>可跨类别暂存修改，全部草稿一起保存；新增工艺路线和工时等关联数据须一起保存。离开数据页将丢弃草稿。修改先保存在本页草稿，点击“保存修改”后由服务端检查；取消不会写入。复制后请填写新的唯一编号。删除仅影响新输入版本，已保存方案保留原输入。质量状态均为模拟状态。</p>
  <div className="actions"><button disabled={disabled} onClick={()=>change([...list,Object.fromEntries(def.fields.map(f=>[f,'']))],'add')}>新增一行</button><button disabled={disabled||!selected.length} onClick={()=>{change([...list,...selected.map(i=>({...list[i]}))],'copy');setSelected([]);}}>复制选中</button><button className="danger" disabled={disabled||!selected.length} onClick={()=>{change(list.filter((_,i)=>!selected.includes(i)),'delete');setSelected([]);}}>删除选中</button><button disabled={disabled||!draft||stale||!reason.trim()} onClick={save}>保存修改</button><button disabled={saving||!draft} onClick={()=>{setDrafts({});setSelected([]);setError('');}}>取消修改</button></div>
  {draft&&<p role="status">未保存修改 · {Object.keys(drafts).length} 张表 · 基于版本 {base}。{stale?'服务端输入已变化，请取消草稿并刷新后重新编辑。':'保存须填写操作原因。'}</p>}
  {error&&<p role="alert">{error}</p>}
  <div className="table-wrap edit-table"><table><thead><tr><th>选</th>{def.fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{list.map((row,i)=><tr key={i}><td><input aria-label={`选择第${i+1}行`} type="checkbox" disabled={disabled} checked={selected.includes(i)} onChange={e=>setSelected(e.target.checked?[...selected,i]:selected.filter(x=>x!==i))}/></td>{def.fields.map(f=><td key={f}><input disabled={disabled} aria-label={`${def.label} ${i+1} ${f}`} value={row[f]||''} onChange={e=>change(list.map((r,n)=>n===i?{...r,[f]:e.target.value}:r),operation)}/></td>)}</tr>)}</tbody></table>{!list.length&&<p className="empty">当前表无记录。可导入 CSV 或新增行。</p>}</div>
 </section>;
}
