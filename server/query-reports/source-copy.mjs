import {createHash} from 'node:crypto';

// Native JSON serialization is much faster than one callback/hash update per
// scalar. Only hand it small subtrees: a large table or provenance tree still
// streams, without a second full serialized workbook beside the parsed source.
function smallTree(value,budget={nodes:512,chars:8192}){
  if(--budget.nodes<0)return false;
  if(typeof value==='string')return (budget.chars-=value.length*6+2)>=0;
  if(value===null||typeof value!=='object')return (budget.chars-=32)>=0;
  if(typeof value.toJSON==='function')return false;
  if(Array.isArray(value)&&value.length>budget.nodes)return false;
  for(const key of Object.keys(value)){
    if((budget.chars-=key.length*6+4)<0||!smallTree(value[key],budget))return false;
  }
  return true;
}

// Authoritative workbook sources are JSON trees. Traverse in JSON.stringify
// order without retaining a full serialized source beside the parsed tree.
function writeJson(value,write,arrayItem=false){
  if(value===undefined||typeof value==='function'||typeof value==='symbol'){
    if(arrayItem)write('null');return;
  }
  if(value===null||typeof value!=='object'){write(JSON.stringify(value));return;}
  if(typeof value.toJSON==='function'){writeJson(value.toJSON(),write,arrayItem);return;}
  if(smallTree(value)){write(JSON.stringify(value));return;}
  if(Array.isArray(value)){
    write('[');for(let i=0;i<value.length;i++){if(i)write(',');writeJson(value[i],write,true);}write(']');return;
  }
  write('{');let first=true;
  for(const key of Object.keys(value)){
    const item=value[key];if(item===undefined||typeof item==='function'||typeof item==='symbol')continue;
    if(!first)write(',');first=false;write(JSON.stringify(key));write(':');writeJson(item,write);
  }
  write('}');
}
export function sourceJsonBytes(value){let bytes=0;writeJson(value,text=>{bytes+=Buffer.byteLength(text);});return bytes;}
export function sourceHash(value){
  const h=createHash('sha256');
  if(Buffer.isBuffer(value)||typeof value==='string')h.update(value);
  else {
    let parts=[],length=0;
    const flush=()=>{if(parts.length)h.update(parts.join(''));parts=[];length=0;};
    writeJson(value,text=>{parts.push(text);length+=text.length;if(length>=16384)flush();});
    flush();
  }
  return h.digest('hex');
}
export function copyReportSource(value){
  // Strings are immutable and can be shared. A structuredClone serialization
  // buffer duplicates their full bytes before deserialization; this copy needs
  // only the detached object/array nodes and retains every source property.
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(copyReportSource);
  // Spread allocates the complete own-property shape up front. Adding the
  // wide workbook rows one key at a time creates much larger dictionaries
  // for every retained source/derived copy. JSON properties keep their order.
  const result={...value};
  for(const key of Object.keys(value)){
    // Assignment to __proto__ would change the prototype and lose source data.
    if(value[key]===null||typeof value[key]!=='object')continue;
    const copy=copyReportSource(value[key]);
    if(key==='__proto__')Object.defineProperty(result,key,{value:copy,enumerable:true,writable:true,configurable:true});
    else result[key]=copy;
  }
  return result;
}
