import {createHash} from 'node:crypto';

// Authoritative workbook sources are JSON trees. Traverse in JSON.stringify
// order without retaining a full serialized source beside the parsed tree.
function writeJson(value,write,arrayItem=false){
  if(value===undefined||typeof value==='function'||typeof value==='symbol'){
    if(arrayItem)write('null');return;
  }
  if(value===null||typeof value!=='object'){write(JSON.stringify(value));return;}
  if(typeof value.toJSON==='function'){writeJson(value.toJSON(),write,arrayItem);return;}
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
  else writeJson(value,text=>h.update(text));
  return h.digest('hex');
}
export function copyReportSource(value){
  // Strings are immutable and can be shared. A structuredClone serialization
  // buffer duplicates their full bytes before deserialization; this copy needs
  // only the detached object/array nodes and retains every source property.
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(copyReportSource);
  return Object.fromEntries(Object.keys(value).map(key=>[key,copyReportSource(value[key])]));
}
