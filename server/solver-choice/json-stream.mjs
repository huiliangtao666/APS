import {createHash} from 'node:crypto';
import fs from 'node:fs';
// JSON.stringify order and JSON-tree semantics, with bounded small subtrees.
function small(value,budget={nodes:512,chars:8192}){
 if(--budget.nodes<0)return false;
 if(typeof value==='string')return (budget.chars-=value.length*6+2)>=0;
 if(value===null||typeof value!=='object')return (budget.chars-=32)>=0;
 if(typeof value.toJSON==='function')return false;
 if(Array.isArray(value)&&value.length>budget.nodes)return false;
 for(const key of Object.keys(value))if((budget.chars-=key.length*6+4)<0||!small(value[key],budget))return false;
 return true;
}
export function* jsonChunks(value,arrayItem=false){
 if(value===undefined||typeof value==='function'||typeof value==='symbol'){if(arrayItem)yield 'null';return;}
 if(value===null||typeof value!=='object'){yield JSON.stringify(value);return;}
 if(typeof value.toJSON==='function'){yield* jsonChunks(value.toJSON(),arrayItem);return;}
 if(small(value)){yield JSON.stringify(value);return;}
 if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield* jsonChunks(value[i],true);}yield ']';return;}
 yield '{';let first=true;for(const key of Object.keys(value)){const item=value[key];if(item===undefined||typeof item==='function'||typeof item==='symbol')continue;if(!first)yield ',';first=false;yield JSON.stringify(key);yield ':';yield* jsonChunks(item);}yield '}';
}
export function visitJson(value,write){let parts=[],length=0;const flush=()=>{if(parts.length)write(parts.join(''));parts=[];length=0;};for(const chunk of jsonChunks(value)){parts.push(chunk);length+=chunk.length;if(length>=16384)flush();}flush();}
export function jsonFingerprint(value){const h=createHash('sha256');visitJson(value,s=>h.update(s));return h.digest('hex');}
export function writeJsonFile(path,value){const fd=fs.openSync(path,'wx'),h=createHash('sha256');let bytes=0;try{visitJson(value,s=>{const b=Buffer.from(s);let at=0;while(at<b.length)at+=fs.writeSync(fd,b,at,b.length-at);bytes+=b.length;h.update(b);});fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return {bytes,sha256:h.digest('hex')};}
