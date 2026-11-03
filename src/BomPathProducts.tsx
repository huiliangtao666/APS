import {useState} from 'react';
import {DropdownDetails} from './DropdownDetails';
import type {QueryRecord} from './QueryReportsTypes';

export type PathProduct={id:string;name:string;records:QueryRecord[]};
/** Classification comes from the same imported/frozen material master, never an ID prefix. */
export function pathProducts(records:QueryRecord[]):PathProduct[]{
 const products=new Map<string,PathProduct>();
 for(const record of records){
  const material=record.rootMaterial;
  if(material?.category!=='成品'||!material.id||record.values.root!==material.id)continue;
  const product=products.get(material.id)||{id:material.id,name:material.name,records:[]};
  product.records.push(record);products.set(material.id,product);
 }
 return [...products.values()];
}

export function BomPathProductPicker({products,excluded,onChange}:{products:PathProduct[];excluded:string[];onChange:(v:string[])=>void}){
 const [search,setSearch]=useState('');
 const selected=products.filter(p=>!excluded.includes(p.id)).length;
 const matches=products.filter(p=>(p.id+' '+p.name).toLowerCase().includes(search.trim().toLowerCase()));
 return <DropdownDetails className="qr-select qr-path-product-select">
  <summary><span>图示成品</span><b>{selected===products.length?'全选（'+selected+'）':selected+'/'+products.length}</b><span aria-hidden="true">⌄</span></summary>
  <div className="qr-select-panel">
   <label className="qr-select-search"><span className="sr-only">搜索图示成品</span><input aria-label="搜索图示成品" placeholder="搜索成品编号或名称" value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/></label>
   <div className="qr-select-actions"><button type="button" onClick={()=>onChange([])}>全选</button><span>已选 {selected}/{products.length}</span><button type="button" onClick={()=>onChange(products.map(p=>p.id))}>清空</button></div>
   <div className="qr-option-list">{matches.map(p=><label key={p.id}><input type="checkbox" checked={!excluded.includes(p.id)} onChange={e=>onChange(e.target.checked?excluded.filter(id=>id!==p.id):[...excluded,p.id])}/><span>{p.id}{p.name?' · '+p.name:''}</span></label>)}</div>
   {!matches.length&&<p>没有匹配的成品。</p>}
  </div>
 </DropdownDetails>;
}
