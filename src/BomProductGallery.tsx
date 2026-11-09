import {useEffect,useState} from 'react';
import {ProductIcon} from './ProductIcon';
import {queryUrl,sameQueryIdentity,type QueryApi,type QueryIdentity,type QueryFilter,type QuerySelection} from './QueryReportsTypes';
import {productSelected,unrestrictedMaterials} from './lib/bom-product-selection.mjs';
import './BomProductGallery.css';

export type Product={id:string;name:string;category:string|null;unit:string|null;pieceKg:number|null;boxKg:number|null};
type Products={identity:QueryIdentity;items:Product[];total:number;nextOffset:number|null;asOfDate:string;warning:string|null};
export function BomProductGallery({api,identity,asOfDate,filters,fields,disabled,onToggle,onRestore}:{api:QueryApi;identity:QueryIdentity;asOfDate:string;filters:Record<string,QuerySelection>;fields:QueryFilter[];disabled:boolean;onToggle:(product:Product)=>void;onRestore:()=>void}){
 const [data,setData]=useState<Products>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 const key=identity.fingerprint+asOfDate;
 useEffect(()=>{let live=true;setData(undefined);setError('');setBusy(true);
  api(queryUrl('products',{identity,asOfDate})).then(r=>{if(!live)return;if(!sameQueryIdentity(identity,r.identity)||r.asOfDate!==asOfDate)throw Error('产品图鉴来源或BOM有效日已变化，请重新查询。');setData(r);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};
 },[key,retry]);
 async function more(){if(!data||data.nextOffset===null||busy)return;const previous=data;setBusy(true);setError('');
  try{const r:Products=await api(queryUrl('products',{identity,asOfDate,offset:data.nextOffset}));if(!sameQueryIdentity(identity,r.identity)||r.asOfDate!==asOfDate||r.total!==data.total)throw Error('产品图鉴来源已变化，请重新查询。');setData(current=>current===previous?{...r,items:[...current.items,...r.items]}:current);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="bom-product-gallery" aria-label="BOM顶层产品图鉴">
  <header><div><strong>顶层产品图鉴</strong><span>点击图片多选并立即筛选；再次点击取消。图标为产品类型示意。</span></div><div>{data&&<span>{data.total} 种产品 · 有效日 {data.asOfDate}</span>}<button type="button" aria-pressed={unrestrictedMaterials(filters,fields)} disabled={disabled} onClick={onRestore}>恢复全部</button></div></header>
  {error&&<p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>重试</button></p>}
  {busy&&!data&&<p role="status">正在读取顶层产品…</p>}
  {data&&<>{data.warning&&<p className="bom-product-warning">{data.warning}</p>}<div className="bom-product-grid">{data.items.map(p=><button type="button" key={p.id} className="bom-product-card" aria-label={p.id+' '+p.name} aria-pressed={productSelected(p,filters,fields)} disabled={disabled} onClick={()=>onToggle(p)}>
   <ProductIcon name={p.name}/><span className="bom-product-details"><span className="bom-product-code">{p.id}</span><strong>{p.name}</strong><small><span>{p.pieceKg!==null&&p.pieceKg>0?`${Number((p.pieceKg*1000).toFixed(3))} 克/件`:p.unit||'-'}</span>{p.boxKg!==null&&p.boxKg>0&&<span> · {p.boxKg} 千克/箱</span>}</small></span>{productSelected(p,filters,fields)&&<span className="bom-product-selected">已选</span>}
  </button>)}</div>{!data.total&&<p>当前有效BOM没有顶层产品；请在“用量关系”中核对父项与子项。</p>}{data.nextOffset!==null&&<button type="button" disabled={busy} onClick={()=>void more()}>{busy?'正在读取…':`继续显示产品（${data.items.length}/${data.total}）`}</button>}</>}
 </section>;
}
