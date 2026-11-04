import {useState} from 'react';

type Props={api:(path:string,body?:object)=>Promise<any>;base:string;canWrite:boolean;canExport:boolean;onSpec:(spec:unknown)=>void};
async function encoded(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {name:file.name,hash,base64:btoa(raw)};
}
export function SimulatorImport({api,base,canWrite,canExport,onSpec}:Props){
  const [kind,setKind]=useState('FROZEN_RUN_COPY'),[config,setConfig]=useState(''),[b,setB]=useState<File|null>(null),[p,setP]=useState<File|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<any>(null);
  function change(){setPreview(null);setError('');}
  async function convert(){setBusy(true);setError('');setPreview(null);
    try{
      const source={...JSON.parse(config),kind};
      if(kind==='WORKBOOK_BYTES_COPY'){
        if(!b||!p)throw Error('请明确选择B和第二份P原件');
        if(b.size+p.size>5*1024*1024)throw Error('两份原件合计上限5MiB；保留草稿并联系维护人员适配更大版本');
        source.workbooks={...source.workbooks,business:await encoded(b),parameters:await encoded(p)};
      }
      setPreview(await api(base+'/imports/preview',{source}));
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <details><summary>从真实冻结副本 / 原Excel与第二份P转换</summary>
    <p>明确选择来源副本、模拟范围、期初累计事实和事件脚本。缺项逐条定位，转换预览保留源数据；创建场景仍需单独操作。</p>
    <label>来源方式<select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);change();}}>
      <option value="FROZEN_RUN_COPY">既有run和inputRef冻结副本</option><option value="WORKBOOK_BYTES_COPY">原Excel业务文件B + 第二份配置P</option></select></label>
    {kind==='WORKBOOK_BYTES_COPY'&&<div className="sim-toolbar">
      <label>业务原件B<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{setB(e.target.files?.[0]??null);change();}}/></label>
      <label>第二份P<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{setP(e.target.files?.[0]??null);change();}}/></label></div>}
    <label>读取来源与事实JSON<input type="file" accept=".json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;
      change();if(file.size>7*1024*1024){setError('来源JSON上限7MiB');return;}void file.text().then(setConfig).catch(e=>setError(String(e)));}}/></label>
    <label>冻结input/run、calendar、opening、script、production（原字段合同见接入文档）
      <textarea rows={10} value={config} disabled={busy} onChange={e=>{setConfig(e.target.value);change();}} spellCheck={false}/></label>
    <button disabled={!canWrite||busy||!config} onClick={()=>void convert()}>检查并转换独立副本</button>
    {error&&<p role="alert" className="sim-error">{error}</p>}
    {preview&&<div><p>转换结果：{preview.status}；诊断 {preview.diagnostics.length} 条；联动未启用</p>
      <ul>{preview.diagnostics.map((i:any,n:number)=><li key={n}>{i.severity} · {i.code} · {i.path}：{i.message}</li>)}</ul>
      <details><summary>源身份、时间原点、P定义与覆盖清单</summary><pre>{JSON.stringify({source:preview.source,time:preview.references.timeBases,
        definitions:preview.references.parameters.definitions.length,active:preview.references.parameters.active.length,
        pending:preview.references.parameters.pending,coverage:preview.references.nativeCoverage},null,2)}</pre></details>
      <button disabled={!preview.spec||!canWrite||busy} onClick={()=>onSpec(preview.spec)}>将转换结果载入场景草稿</button>
      <button disabled={!canExport||busy} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(preview,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='simulator-native-conversion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>导出完整转换预览</button>
    </div>}
  </details>;
}
