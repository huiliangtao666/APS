import {useEffect,useState} from 'react';
import {QueryColumns} from './QueryReportsControls';
import {sameQueryIdentity,type QueryColumn} from './QueryReportsTypes';
import {mpsChecked,mpsToggle,mpsUrl,mpsValue,type QueryApi,type QueryIdentity,type MpsSelection} from './MpsReportTypes';

export function MpsMultiselect({api,identity,field,label,value,query,onChange}:{api:QueryApi;identity:QueryIdentity;field:string;label:string;value:MpsSelection;query:object;onChange:(s:MpsSelection)=>void}){
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[result,setResult]=useState<any>(),[error,setError]=useState('');
 const signature=JSON.stringify(query);
 useEffect(()=>{let live=true;setResult(undefined);setError('');api(mpsUrl('options',{...query,identity,field,search,optionOffset:offset})).then(r=>{if(!sameQueryIdentity(identity,r.identity))throw Error('候选来源身份变化');if(live)setResult(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[identity.fingerprint,field,search,offset,signature]);
 return <details className="mps-filter"><summary>{label} · {value.mode==='ALL'?'全选'+(value.exclude?.length?'（部分排除）':''):value.mode==='NONE'?'空':'已选 '+value.values?.length}</summary><label>内搜索<input aria-label={label+'内搜索'} value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label><div><button type="button" onClick={()=>onChange({mode:'ALL'})}>全选全部候选</button><button type="button" onClick={()=>onChange({mode:'NONE'})}>清空</button></div>{error&&<p role="alert">{error}</p>}{result?.items.map((i:any)=><label key={i.id}><input type="checkbox" checked={mpsChecked(value,i.id)} onChange={e=>onChange(mpsToggle(value,i.id,e.target.checked))}/>{i.label}</label>)}<div><button type="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-100))}>上批候选</button><span>{result?.total??'…'} 项</span><button type="button" disabled={result?.nextOffset==null} onClick={()=>setOffset(result.nextOffset)}>下批候选</button></div><p>搜索只缩小候选显示，保留其他勾选；全选和清空作用于完整候选。</p></details>;
}

export function MpsTable({id,columns,records,onOpen,onVisible,onCell}:{id:string;columns:QueryColumn[];records:any[];onOpen?:(r:any)=>void;onVisible?:(keys:string[])=>void;onCell?:(r:any,key:string)=>void}){
 const storage='aps:mps:columns:'+id;
 const [selected,setSelected]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(storage)||'null');if(Array.isArray(saved))return saved.filter(k=>columns.some(c=>c.key===k));}catch{}return columns.map(c=>c.key);});
 const visible=columns.filter(c=>c.key==='id'||selected.includes(c.key));
 useEffect(()=>{onVisible?.(visible.map(c=>c.key));},[JSON.stringify(visible.map(c=>c.key))]);
 function change(keys:string[]){setSelected(keys);try{localStorage.setItem(storage,JSON.stringify(keys));}catch{}}
 return <><QueryColumns columns={columns.map(c=>({...c,fixed:c.key==='id'}))} value={selected} onChange={change}/><div className="mps-scroll"><table><thead><tr>{visible.map(c=><th key={c.key} scope="col">{c.label}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.id}>{visible.map(c=><td key={c.key}>{c.key==='id'&&onOpen?<button onClick={()=>onOpen(r)}>{mpsValue(r.values[c.key])}</button>:onCell&&/^\d{4}-\d{2}-\d{2}$/.test(c.key)?<button onClick={()=>onCell(r,c.key)} title={mpsValue(r.values[c.key])}>{typeof r.values[c.key]==='object'&&r.values[c.key]?.value!==null?r.values[c.key].value:mpsValue(r.values[c.key]).split(' · ')[0]}</button>:<span className={typeof r.values[c.key]==='object'&&r.values[c.key]?.state&&r.values[c.key].state!=='KNOWN'?'mps-unknown':''}>{mpsValue(r.values[c.key])}</span>}</td>)}</tr>)}</tbody></table></div></>;
}
