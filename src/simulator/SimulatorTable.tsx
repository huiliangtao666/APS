import {useEffect, useMemo, useState} from 'react';

export type SimRow=Record<string, unknown>;
export type SimColumn={key:string;label:string};
export function expandBom(selected:string[],edges:{parent:string;child:string}[]) {
  const found=new Set(selected),queue=[...selected];
  while(queue.length){const parent=queue.shift();for(const edge of edges)if(edge.parent===parent&&!found.has(edge.child)){found.add(edge.child);queue.push(edge.child);}}
  return [...found];
}
export function display(value:unknown):string {
  if(value===null||value===undefined)return '未提供';
  return typeof value==='object'?JSON.stringify(value):String(value);
}
export function SimulatorTable({table,rows,columns,onOpen,bom=[],context={},canExport=false}:{table:string;rows:SimRow[];columns:SimColumn[];onOpen?:(r:SimRow)=>void;bom?:{parent:string;child:string}[];context?:SimRow;canExport?:boolean}) {
  const [search,setSearch]=useState(''),[filterSearch,setFilterSearch]=useState(''),[selected,setSelected]=useState<Set<string>|null>(null);
  const [size,setSize]=useState(100),[page,setPage]=useState(0),[date,setDate]=useState(''),[showBom,setShowBom]=useState(false);
  const storage='aps:simulator:columns:'+table;
  const [shown,setShown]=useState<string[]>(()=>{try{const stored=JSON.parse(localStorage.getItem(storage)||'null');
    if(Array.isArray(stored))return stored.filter(k=>columns.some(c=>c.key===k));}catch{}return columns.map(c=>c.key);});
  const [source,setSource]=useState<SimRow|null>(null);
  const options=useMemo(()=>[...new Set(rows.map(r=>String(r.materialId??r.id??'')))].sort(),[rows]);
  const active=selected===null?null:new Set(showBom?expandBom([...selected],bom):[...selected]);
  const filtered=rows.filter(r=>(active===null||active.has(String(r.materialId??r.id??'')))&&
    (!date||Object.values(r).some(v=>typeof v==='string'&&v.startsWith(date)))&&(!search||display(r).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const visible=columns.filter(c=>shown.includes(c.key));
  useEffect(()=>setPage(0),[search,date,size,selected,showBom,rows]);
  function changeColumn(key:string,checked:boolean){const next=checked?[...shown,key]:shown.filter(k=>k!==key);setShown(next);try{localStorage.setItem(storage,JSON.stringify(next));}catch{}}
  function toggle(option:string,checked:boolean){const next=new Set(selected??options);if(checked)next.add(option);else next.delete(option);setSelected(next);}
  function exportFiltered(){const payload={table,mode:'独立仿真',context,filters:{search,date,selected:selected===null?'ALL':[...selected],showBom},columns:visible,
    total:filtered.length,rows:filtered};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='simulator-'+table+'-filtered.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="sim-table-panel" aria-label={table}>
    <div className="sim-toolbar"><label>搜索<input value={search} onChange={e=>setSearch(e.target.value)} /></label>
      <details><summary>物料/对象 · {selected===null?'全选':selected.size===0?'空':selected.size+'项'}</summary>
        <label>候选内搜索<input value={filterSearch} onChange={e=>setFilterSearch(e.target.value)}/></label>
        <button onClick={()=>setSelected(null)}>全选</button><button onClick={()=>setSelected(new Set())}>清空</button>
        <div className="sim-options">{options.filter(o=>o.includes(filterSearch)).map(o=><label key={o}><input type="checkbox" checked={selected===null||selected.has(o)} onChange={e=>toggle(o,e.target.checked)}/>{o}</label>)}</div>
        {!!bom.length&&<label><input type="checkbox" checked={showBom} onChange={e=>setShowBom(e.target.checked)}/>根据BOM显示（仅展示）</label>}
      </details>
      <label>业务日期<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <details><summary>本表栏位</summary>{columns.map(c=><label key={c.key}><input type="checkbox" checked={shown.includes(c.key)} onChange={e=>changeColumn(c.key,e.target.checked)}/>{c.label}</label>)}</details>
      <button onClick={()=>{setSearch('');setFilterSearch('');setDate('');setSelected(null);setShowBom(false);}}>重置筛选</button>
      <button disabled={!canExport} onClick={exportFiltered}>导出完整筛选结果</button>
    </div>
    <div className="sim-scroll"><table><thead><tr>{visible.map(c=><th key={c.key} scope="col">{c.label}</th>)}<th scope="col">来源</th></tr></thead>
      <tbody>{filtered.slice(page*size,(page+1)*size).map((r,i)=><tr key={String(r.id??i)}>{visible.map((c,j)=><td key={c.key}>{j===0&&onOpen?<button onClick={()=>onOpen(r)}>{display(r[c.key])}</button>:display(r[c.key])}</td>)}<td><button onClick={()=>setSource(r)}>查看来源</button></td></tr>)}</tbody></table></div>
    {!filtered.length&&<p>没有符合筛选条件的记录</p>}
    <div className="sim-toolbar"><span>{filtered.length} 条</span><label>每页<select value={size} onChange={e=>setSize(Number(e.target.value))}>{[100,200,500].map(n=><option key={n}>{n}</option>)}</select></label>
      <button disabled={!page} onClick={()=>setPage(page-1)}>上一页</button><span>{page+1} / {Math.max(1,Math.ceil(filtered.length/size))}</span>
      <button disabled={(page+1)*size>=filtered.length} onClick={()=>setPage(page+1)}>下一页</button></div>
    {source&&<aside className="sim-drawer" aria-label="记录来源"><button onClick={()=>setSource(null)}>关闭来源</button><pre>{JSON.stringify(source,null,2)}</pre></aside>}
  </section>;
}
