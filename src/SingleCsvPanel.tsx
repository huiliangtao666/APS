import {originalBomNote} from './lib/original-bom.mjs';
import {MasterDataContract} from './MasterDataContract';
import {useEffect,useRef,useState} from 'react';
type Row=Record<string,string>;
type Issue={file:string;row:number;field:string;reason?:string;message?:string};
type Preview={id?:string;valid:boolean;issues:Issue[];tables:Record<string,Row[]>;sources:Record<string,{lines:number[];headers:string[]}>};
const errors:Record<string,string>={stale_preview:'预览后数据或历史记录已变化，请重新选择文件预览。',stale_input:'输入版本已变化，请刷新后重新预览。',preview_expired_or_unowned:'预览已过期或身份已变化，请重新预览。',forbidden:'当前角色没有导入权限。',reason_required:'请填写操作原因。'};
export function SingleCsvPanel({table,rows,revision,canWrite,busy,api,refresh}:{table:{key:string;label:string;fields:string[]};rows:Row[];revision:number;canWrite:boolean;busy:boolean;api:(path:string,body:object)=>Promise<any>;refresh:()=>Promise<void>}){
 const [preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[name,setName]=useState('');
 const generation=useRef(0),editor=useRef<HTMLTextAreaElement>(null),[text,setText]=useState('');
 useEffect(()=>()=>{generation.current++;},[]);
 function cancel(){generation.current++;setPreview(null);setName('');setText('');setPending(false);setMessage('已取消，未导入。');}
 async function inspect(file:File){
  const run=++generation.current;setPending(true);setPreview(null);setName(file.name);setMessage('读取并检查中…');
  try{
   const raw=await file.text();if(run!==generation.current)return;setText(raw);
   const p=await api('/imports/preview',{table:table.key,files:[{name:file.name,text:raw}],revision});
   if(run===generation.current){setPreview(p);setMessage(p.valid?'检查通过，尚未导入。':'阻止导入，请修正文件后重新选择。');}
  }catch(e:any){if(run===generation.current){if(e.detail?.tables)setPreview({...e.detail,issues:e.detail.issues||[],valid:false});setMessage(errors[e.detail?.error]||e.message);}}
  finally{if(run===generation.current)setPending(false);}
 }
 async function commit(){
  if(!preview?.valid||!preview.id||pending)return;
  const run=++generation.current;setPending(true);
  try{const result=await api('/imports/commit',{previewId:preview.id});if(run!==generation.current)return;setPreview(null);setName('');setText('');setMessage(result.unchanged?'内容相同，未新增数据或操作记录。':'单表导入成功。');await refresh();}
  catch(e:any){if(run===generation.current){setPreview(null);setMessage(errors[e.detail?.error]||e.message);}}
  finally{if(run===generation.current)setPending(false);}
 }
 function locate(issue:Issue){const el=editor.current;if(!el)return;const text=el.value,lines=[0];for(let i=0;i<text.length;i++){if(text[i]==='\r'){if(text[i+1]==='\n')i++;lines.push(i+1);}else if(text[i]==='\n')lines.push(i+1);}el.focus();el.setSelectionRange(lines[Math.max(0,issue.row-1)]??0,lines[issue.row]??text.length);}
 const proposed=preview?.tables[table.key],disabled=!canWrite||busy||pending;
 return <section data-csv-single aria-label="单表 CSV 导入"><h3>单表 CSV 导入 · {table.label}</h3>
 { table.key==='originalBom'&&<p data-original-bom-contract>{originalBomNote}</p>}
 <MasterDataContract table={table.key}/>
 <label className="upload">导入 CSV<input aria-label="导入单表 CSV" type="file" accept=".csv,text/csv" disabled={disabled} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void inspect(file);}}/></label>
 <p role="status">{message}</p>
 {name&&<div role="region" aria-label="单表导入预览"><h4>{name} · 导入前检查与变更预览</h4>
 <p>整表替换：当前 {rows.length} 条 → 文件 {proposed?.length??0} 条。字段、引用、单位、日期及关联配置按当前类别契约在服务端检查。分钟 0 = 2026-11-02 08:00 Asia/Shanghai；带时区时间字段按现行 ISO 日期契约。</p>
 {preview&&<><p>{preview.valid?'校验通过；确认后才保存。':'校验未通过；整份文件未写入。'} 解析字段：{preview.sources[table.key]?.headers.join('、')||'未完成解析'}</p>
 <ul aria-label="单表导入问题">{preview.issues.map((issue,i)=><li key={i}><button onClick={()=>locate(issue)}>定位 {issue.file} 第{issue.row}行 · {issue.field}：{issue.reason||issue.message}</button></li>)}</ul>
 {proposed&&<><h4>拟导入内容（完整字段）</h4><div className="table-wrap"><table><thead><tr><th>物理行</th>{table.fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{proposed.map((r,i)=><tr key={i}><td>{preview.sources[table.key]?.lines[i]}</td>{table.fields.map(f=><td key={f} style={{whiteSpace:'pre-wrap'}}>{r[f]}</td>)}</tr>)}</tbody></table></div>
 <details><summary>查看替换前内容（{rows.length} 条）</summary><div className="table-wrap"><table><thead><tr>{table.fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{table.fields.map(f=><td key={f} style={{whiteSpace:'pre-wrap'}}>{r[f]}</td>)}</tr>)}</tbody></table></div></details></>}
 <label>原文件物理行定位<textarea aria-label="单表 CSV 原文" ref={editor} value={text} readOnly rows={5} style={{width:'100%',fontFamily:'monospace'}}/></label></>}
 <button disabled={disabled||!preview?.valid||!preview.id} onClick={()=>void commit()}>确认单表导入</button><button disabled={pending&&!!preview?.id} onClick={cancel}>取消 / 关闭预览</button></div>}
 </section>;
}
