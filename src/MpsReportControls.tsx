import {useEffect,useRef,useState,type ReactNode} from 'react';
import {DropdownDetails} from './DropdownDetails';
import {QueryColumns} from './QueryReportsControls';
import {sameQueryIdentity,type QueryColumn} from './QueryReportsTypes';
import {MpsFieldHint} from './MpsReportHelp';
import {mpsChecked,mpsToggle,mpsUrl,mpsValue,type MpsCell,type QueryApi,type QueryIdentity,type MpsSelection} from './MpsReportTypes';

export function MpsMultiselect({api,identity,field,label,value,query,onChange}:{api:QueryApi;identity:QueryIdentity;field:string;label:string;value:MpsSelection;query:object;onChange:(s:MpsSelection)=>void}){
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[result,setResult]=useState<any>(),[error,setError]=useState(''),[open,setOpen]=useState(false),[position,setPosition]=useState({left:8,top:8});
 const picker=useRef<HTMLDetailsElement>(),signature=JSON.stringify(query);
 useEffect(()=>{if(!open)return;let live=true;setResult(undefined);setError('');const timer=window.setTimeout(()=>{
  api(mpsUrl('options',{...query,identity,field,search,optionOffset:offset})).then(r=>{if(!sameQueryIdentity(identity,r.identity))throw Error('候选来源身份变化');if(live)setResult(r);}).catch(e=>{if(live)setError(e.message);});
 },150);return()=>{live=false;window.clearTimeout(timer);};},[open,identity.fingerprint,field,search,offset,signature]);
 useEffect(()=>{if(!open)return;const close=(event:Event)=>{if(event.type==='scroll'&&event.target instanceof Node&&picker.current?.contains(event.target))return;if(picker.current)picker.current.open=false;};window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};},[open]);
 const selection=value.mode==='ALL'&&!value.exclude?.length?'全部':value.mode==='NONE'?'0 项':value.mode==='VALUES'?(value.values?.length||0)+' 项':'已筛选';
 return <DropdownDetails className="mps-filter" onToggle={e=>{const el=e.currentTarget;picker.current=el;setOpen(el.open);if(el.open){const r=el.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-316)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-340))});}}}>
  <summary><span>{label}</span><b>{selection}</b><span aria-hidden="true">⌄</span></summary>
  {open&&<div className="mps-filter-panel" style={position}>
   <input aria-label={label+'内搜索'} placeholder="搜索编号或名称" value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>
   <div className="mps-filter-actions"><button type="button" onClick={()=>onChange({mode:'ALL'})}>全选全部候选</button><button type="button" onClick={()=>onChange({mode:'NONE'})}>清空</button></div>
   {error&&<p role="alert">{error}</p>}{!result&&!error&&<p role="status">读取候选…</p>}
   <div className="mps-option-list">{result?.items.map((i:any)=><label key={i.id}><input type="checkbox" checked={mpsChecked(value,i.id)} onChange={e=>onChange(mpsToggle(value,i.id,e.target.checked))}/><span>{i.label}</span></label>)}</div>
   <div className="mps-option-pager"><button type="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-100))}>上一页</button><span>{result?result.total+' 项候选':'…'}</span><button type="button" disabled={result?.nextOffset==null} onClick={()=>setOffset(result.nextOffset)}>下一页</button></div>
   <p>搜索保留其他勾选；全选、清空作用于全部候选。</p>
  </div>}
 </DropdownDetails>;
}

const shortLabels:Record<string,string>={snapshotPhysical:'快照实物',sourceDemand:'原始独立需求',sourceOrdered:'采购订购量',sourceWIP:'在制预计产出',unit:'单位',safetyGap:'安全库存不足'};
const textFields=new Set(['id','name','category','source','unit','snapshotDate','risk','coverage','bomRoots','kind']);
const isDate=(key:string)=>/^\d{4}-\d{2}-\d{2}$/.test(key);
export function MpsTable({id,columns,records,onOpen,onVisible,onCell,heading,actions,variant='overview',selectedId,emptyMessage='暂无匹配记录'}:{id:string;columns:QueryColumn[];records:any[];onOpen?:(r:any)=>void;onVisible?:(keys:string[])=>void;onCell?:(r:any,key:string)=>void;heading?:ReactNode;actions?:ReactNode;variant?:'overview'|'matrix'|'detail';selectedId?:string;emptyMessage?:string}){
 const storage='aps:mps:columns:'+id;
 const [selected,setSelected]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(storage)||'null');if(Array.isArray(saved))return saved.filter(k=>columns.some(c=>c.key===k));}catch{}return columns.map(c=>c.key);});
 const visible=columns.filter(c=>c.key==='id'||selected.includes(c.key));
 useEffect(()=>{onVisible?.(visible.map(c=>c.key));},[JSON.stringify(visible.map(c=>c.key))]);
 function change(keys:string[]){setSelected(keys);try{localStorage.setItem(storage,JSON.stringify(keys));}catch{}}
 const width=(key:string)=>variant==='matrix'?(key==='id'?192:key==='kind'?62:key==='unit'?56:82):key==='id'?116:key==='name'?164:key==='coverage'||key==='bomRoots'?220:textFields.has(key)?90:132;
 return <div className={'mps-table mps-table-'+variant}>
  <div className="mps-table-toolbar"><div className="mps-table-heading">{heading}</div><div className="mps-table-tools"><QueryColumns popover columns={columns.map(c=>({...c,fixed:c.key==='id'}))} value={visible.map(c=>c.key)} onChange={change}/>{actions}</div></div>
  <div className="mps-scroll" tabIndex={0} aria-label={variant==='matrix'?'物料日期矩阵，可横向滚动':variant==='detail'?'来源明细，可横向滚动':'物料总览，可横向滚动'}><table>
   <colgroup>{visible.map(c=><col key={c.key} style={{width:width(c.key)}}/>)}</colgroup>
   <thead><tr>{visible.map(c=><th key={c.key} scope="col" data-mps-field={c.key}><MpsFieldHint field={isDate(c.key)?'dateBucket':c.key==='id'&&variant!=='overview'?variant==='matrix'?'metric':'recordId':c.key}>{isDate(c.key)?c.label.slice(5).replace('-','.'):shortLabels[c.key]||c.label}</MpsFieldHint></th>)}</tr></thead>
   <tbody>{records.map(r=><tr key={r.id} aria-selected={onOpen&&variant==='overview'?r.id===selectedId:undefined} className={variant==='matrix'&&['opening','balance','suggestMake'].includes(r.id)?'mps-metric-divider':''}>
    {visible.map(c=>{const raw=r.values[c.key],cell=raw&&typeof raw==='object'&&'state' in raw?raw as MpsCell:undefined,text=mpsValue(raw),numeric=typeof raw==='number'||cell?.state==='KNOWN',value=cell?.value??raw,unknown=cell&&cell.state!=='KNOWN',className=(numeric?'mps-number ':'')+(unknown?'mps-unknown ':'')+(typeof value==='number'&&value<0?'mps-negative ':'')+(isDate(c.key)&&r.id.startsWith('suggest')&&typeof value==='number'&&value>0?'mps-suggestion ':'');
     return <td key={c.key} className={className} title={c.key==='id'&&variant==='matrix'?undefined:text}>{c.key==='id'&&onOpen?<button className="mps-link" aria-pressed={variant==='overview'?r.id===selectedId:undefined} onClick={()=>onOpen(r)}>{text}</button>:c.key==='id'&&variant==='matrix'?<MpsFieldHint field={r.id}>{text}</MpsFieldHint>:onCell&&isDate(c.key)?<button className="mps-cell-link" onClick={()=>onCell(r,c.key)} aria-label={r.values.id+' · '+c.key+' · '+text}>{cell?.state==='KNOWN'?cell.value:text.split(' · ')[0]}</button>:<span>{unknown?text.split(' · ')[0]:text}</span>}</td>;
    })}
   </tr>)}</tbody>
  </table>{!records.length&&<p className="mps-empty">{emptyMessage}</p>}</div>
 </div>;
}
