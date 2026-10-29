import {useState} from 'react';

// Values retain their existing string/number/boolean types. This is a field editor,
// not a rule engine: unknown configuration names do not acquire new semantics.
const names:Record<string,string>={machineId:'设备编号',endMinute:'结束分钟',lotId:'批次编号',status:'模拟状态',groupId:'人员组编号',supplyId:'供给编号',arrival:'预计到达时间',available:'预计可用时间',order:'订单',dependencies:'资源依赖',taskId:'任务编号',orderId:'订单编号',materialId:'物料编号',quantity:'数量',unit:'单位',source:'来源',kind:'类型',id:'编号',start:'开始分钟',end:'结束分钟'};
const emptyValue=(kind:string)=>kind==='数值'?0:kind==='是否'?false:kind==='列表'?[]:kind==='字段组'?{}:'';
export const fieldLabel=(field:string)=>field.endsWith('JSON')?field.replace(/JSON$/,'（结构化字段）'):field;
function Node({value,onChange,label,disabled}:{value:any;onChange:(v:any)=>void;label:string;disabled:boolean}){
 const [key,setKey]=useState('');
 const [kind,setKind]=useState('文字');
 if(value&&typeof value==='object')return <fieldset disabled={disabled} aria-label={label}><legend>{label}</legend>{Object.entries(value).map(([k,v])=><div key={k}><Node label={Array.isArray(value)?`${label} 第${Number(k)+1}项`:`${label} ${names[k]||k}`} value={v} disabled={disabled} onChange={next=>{const copy=structuredClone(value);copy[k]=next;onChange(copy);}}/><button type="button" disabled={disabled} onClick={()=>{const copy=structuredClone(value);if(Array.isArray(copy))copy.splice(Number(k),1);else delete copy[k];onChange(copy);}}>移除 {names[k]||k}</button></div>)}{Array.isArray(value)?<div><select disabled={disabled} aria-label={`${label} 新项目类型`} value={kind} onChange={e=>setKind(e.target.value)}>{['文字','数值','是否','列表','字段组'].map(k=><option key={k}>{k}</option>)}</select><button type="button" disabled={disabled} onClick={()=>onChange([...value,value.length?structuredClone(value[0]):emptyValue(kind)])}>添加一项 {label}</button></div>:<div><label>字段名称<input disabled={disabled} aria-label={`${label} 新字段名称`} value={key} onChange={e=>setKey(e.target.value)}/></label><select disabled={disabled} aria-label={`${label} 新字段类型`} value={kind} onChange={e=>setKind(e.target.value)}>{['文字','数值','是否','列表','字段组'].map(k=><option key={k}>{k}</option>)}</select><button type="button" disabled={disabled||!key.trim()||Object.prototype.hasOwnProperty.call(value,key.trim())} onClick={()=>{onChange({...value,[key.trim()]:emptyValue(kind)});setKey('');}}>添加字段 {label}</button></div>}</fieldset>;
 if(typeof value==='boolean')return <label>{label}<select aria-label={label} disabled={disabled} value={String(value)} onChange={e=>onChange(e.target.value==='true')}><option value="true">是</option><option value="false">否</option></select></label>;
 return <label>{label}<input aria-label={label} disabled={disabled} type={typeof value==='number'?'number':'text'} value={value??''} onChange={e=>onChange(typeof value==='number'?Number(e.target.value):e.target.value)}/></label>;
}
export function StructuredValue({field,value,label,disabled,onChange}:{field:string;value:string;label:string;disabled:boolean;onChange:(value:string)=>void}){
 let parsed:any;try{parsed=JSON.parse(value||(/分配|需处理事实/.test(field)?'[]':'{}'));}catch{/* Invalid imported text stays available for explicit repair. */}
 return <div tabIndex={-1} aria-label={`${label} 结构化编辑`}>
 {parsed!==undefined?<Node value={parsed} label={label.replace(/JSON/g,'')} disabled={disabled} onChange={v=>onChange(JSON.stringify(v))}/>:<p>结构化内容无效，请展开原文修正，或清空后重新填写字段。</p>}
 <details><summary>高级：原始配置文本</summary><input aria-label={label} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}/></details>
 </div>;
}
