import {useState} from 'react';

type Props={api:(path:string,body?:object)=>Promise<any>;base:string;canWrite:boolean;canExport:boolean;onSpec:(spec:unknown)=>void};
async function encoded(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {name:file.name,hash,base64:btoa(raw)};
}
export function SimulatorImport({api,base,canWrite,canExport,onSpec}:Props){
  const [kind,setKind]=useState('SELECTED_FROZEN_RUN'),[config,setConfig]=useState(''),[b,setB]=useState<File|null>(null),[p,setP]=useState<File|null>(null);
  const [runId,setRunId]=useState(''),[inputHash,setInputHash]=useState(''),[frozen,setFrozen]=useState<any>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<any>(null);
  function change(){setPreview(null);setError('');}
  function acceptFrozen(value:any){
    if(value?.contract!=='aps-simulator-frozen-source@1'||value.mode!=='INDEPENDENT'||value.linked!==false||
      value.conversionStatus!=='NOT_CONVERTED'||!value.run?.id||!/^[a-f0-9]{64}$/.test(value.run?.inputHash))throw Error('不是可识别的未转换冻结来源副本');
    setFrozen(value);
  }
  async function readFrozen(){setBusy(true);change();setFrozen(null);
    try{const value=await api(base+'/source-copy/'+encodeURIComponent(runId)+(inputHash?'?inputHash='+encodeURIComponent(inputHash):''));
      if(value.run?.id!==runId||(inputHash&&value.run?.inputHash!==inputHash))throw Error('读取身份与明确选择不符');
      acceptFrozen(value);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function convert(){setBusy(true);setError('');setPreview(null);
    try{
      const source={...JSON.parse(config),kind};
      if(kind==='SELECTED_FROZEN_RUN'||kind==='FROZEN_SOURCE_COPY'){
        if(!frozen)throw Error('请先读取或上传明确的冻结来源副本');
        for(const key of Object.keys(source))if(!['kind','calendar','opening','script','production'].includes(key))throw Error('此方式的事实JSON只接受calendar/opening/script/production，来源由冻结副本提供');
        if(kind==='SELECTED_FROZEN_RUN'){source.runId=frozen.run.id;source.expectedInputHash=frozen.run.inputHash;}
        else source.frozenSource=frozen;
      }
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
    <label>来源方式<select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setFrozen(null);change();}}>
      <option value="SELECTED_FROZEN_RUN">按运行编号读取冻结副本</option><option value="FROZEN_SOURCE_COPY">导出的公共冻结来源文件</option>
      <option value="FROZEN_RUN_COPY">原run和inputRef文件副本</option><option value="WORKBOOK_BYTES_COPY">原Excel业务文件B + 第二份配置P</option></select></label>
    {kind==='SELECTED_FROZEN_RUN'&&<div className="sim-toolbar">
      <label>来源运行编号<input value={runId} disabled={busy} onChange={e=>{setRunId(e.target.value);setFrozen(null);change();}}/></label>
      <label>预期输入SHA256（可选）<input value={inputHash} disabled={busy} onChange={e=>{setInputHash(e.target.value);setFrozen(null);change();}}/></label>
      <button disabled={busy||!runId.trim()||!!inputHash&&!/^[a-f0-9]{64}$/.test(inputHash)} onClick={()=>void readFrozen()}>读取所选冻结来源</button></div>}
    {kind==='FROZEN_SOURCE_COPY'&&<label>公共冻结来源JSON<input type="file" accept=".json" disabled={busy} onChange={e=>{
      const file=e.target.files?.[0];change();setFrozen(null);if(!file)return;if(file.size>7*1024*1024){setError('来源文件上限7MiB');return;}
      setBusy(true);void file.text().then(text=>acceptFrozen(JSON.parse(text))).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}/></label>}
    {['SELECTED_FROZEN_RUN','FROZEN_SOURCE_COPY'].includes(kind)&&frozen&&<details open><summary>明确选择的冻结来源</summary>
      <p>运行 {frozen.run.id} · v{frozen.run.version} · {frozen.run.inputHash} · {frozen.plan?'有原冻结计划':'无冻结计划；不能生成生产任务'}</p>
      <pre>{JSON.stringify({gaps:frozen.gaps,parameterContext:frozen.input?.parameterContext,parameterSources:frozen.input?.parameterSources},null,2)}</pre></details>}
    {kind==='WORKBOOK_BYTES_COPY'&&<div className="sim-toolbar">
      <label>业务原件B<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{setB(e.target.files?.[0]??null);change();}}/></label>
      <label>第二份P<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{setP(e.target.files?.[0]??null);change();}}/></label></div>}
    <label>读取来源与事实JSON<input type="file" accept=".json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;
      change();if(file.size>7*1024*1024){setError('来源JSON上限7MiB');return;}void file.text().then(setConfig).catch(e=>setError(String(e)));}}/></label>
    <label>范围 calendar、期初事实 opening、事件 script、生产选择 production；原文件模式另含 frozen / workbooks
      <textarea rows={10} value={config} disabled={busy} onChange={e=>{setConfig(e.target.value);change();}} spellCheck={false}/></label>
    <button disabled={!canWrite||busy||!config||(['SELECTED_FROZEN_RUN','FROZEN_SOURCE_COPY'].includes(kind)&&!frozen)} onClick={()=>void convert()}>检查并转换独立副本</button>
    {error&&<p role="alert" className="sim-error">{error}</p>}
    {preview&&<div><p>转换结果：{preview.status}；诊断 {preview.diagnostics.length} 条；联动未启用</p>
      <ul>{preview.diagnostics.map((i:any,n:number)=><li key={n}>{i.severity} · {i.code} · {i.path}：{i.message}</li>)}</ul>
      <details><summary>源身份、时间原点、P定义与覆盖清单</summary><pre>{JSON.stringify({source:preview.source,time:preview.references.timeBases,
        definitions:preview.references.parameters.definitions.length,active:preview.references.parameters.active.length,
        pending:preview.references.parameters.pending,context:preview.references.parameters.context,
        frozenEffectiveParameters:preview.references.parameters.frozenEffectiveParameters,
        coverage:preview.references.nativeCoverage,frozenSource:preview.references.frozenSource},null,2)}</pre></details>
      <button disabled={!preview.spec||!canWrite||busy} onClick={()=>onSpec(preview.spec)}>将转换结果载入场景草稿</button>
      <button disabled={!canExport||busy} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(preview,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='simulator-native-conversion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>导出完整转换预览</button>
    </div>}
  </details>;
}
