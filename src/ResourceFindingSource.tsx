// Source positions are resolved against this result's frozen input only.
// A producer row is often a record object, never a React child or a CSV line.
export function findingSource(ref:any,view:any){
 const table=typeof ref?.table==='string'?ref.table:'未提供来源表';
 const input=view.snapshot.originalInput,rows=input[table]||[];
 const record=ref?.row&&typeof ref.row==='object'&&!Array.isArray(ref.row)?ref.row:null;
 const positive=(v:any)=>Number.isSafeInteger(Number(v))&&Number(v)>=2&&typeof v!=='object'&&v!=='';
 const occurrence=ref?.occurrence?.index??ref?.origin?.occurrence?.index??ref?.index;
 const scalar=positive(ref?.row)?Number(ref.row):null;
 let index=Number.isSafeInteger(occurrence)&&occurrence>=0?occurrence:scalar!==null?scalar-2:null;
 const same=(row:any)=>record&&JSON.stringify(row)===JSON.stringify(record);
 if(record&&!(index!==null&&same(rows[index]))){
  const matches=rows.map((row:any,i:number)=>same(row)?i:-1).filter((i:number)=>i>=0);
  index=matches.length===1?matches[0]:null;
 }
 if(index!==null&&!rows[index])index=null;
 const wrongVersion=ref?.origin?.inputVersionId&&ref.origin.inputVersionId!==view.run.inputVersionId;
 if(wrongVersion)index=null;
 const csv=view.plan.inputCsvSources?.[table];
 const matched=index!==null&&csv?.canonicalRows?.[index]&&JSON.stringify(csv.canonicalRows[index])===JSON.stringify(rows[index]);
 const physical=matched?(csv.records?.[index]?.line??csv.lines?.[index]):null;
 const verified=matched&&positive(physical)&&typeof csv.sha256==='string'&&!!csv.sha256&&typeof csv.file==='string';
 const position=verified?`${csv.file} 原文件第 ${physical} 行`:index!==null?`规范化记录第 ${index+2} 行（无可验证原CSV行映射）`:scalar!==null&&!wrongVersion?`来源声明行 ${scalar}（未核对冻结记录）`:'未提供可核对的冻结来源位置';
 return {table,position,inputVersionId:view.run.inputVersionId,sourceSha256:verified?csv.sha256:null,record:record??(index!==null?rows[index]:ref?.key??ref?.identity??null),associationGap:wrongVersion?'来源版本与本运行不符；未关联当前输入。':index===null?'来源关联不足；保留诊断，不猜测原CSV行。':null};
}

export function ResourceFindingSource({source,onLocate}:{source:ReturnType<typeof findingSource>;onLocate:()=>void}){
 return <div><button type="button" onClick={onLocate}>定位冻结来源：{source.table} · {source.position}</button><p>输入版本 {source.inputVersionId}{source.sourceSha256&&` · SHA256 ${source.sourceSha256}`}</p>{source.record&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'24rem',overflow:'auto'}}>{JSON.stringify(source.record)}</pre>}{source.associationGap&&<p>{source.associationGap}</p>}</div>;
}
