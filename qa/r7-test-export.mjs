import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {brotliCompressSync,constants} from 'node:zlib';
// Intern exact repeated objects across captured inputs/results before compression.
// This is only a lossless evidence transport; no assertion or product data is filtered.
const pool=[],seen=new Map();
function intern(value){
 if(!value||typeof value!=='object')return value;
 const key=JSON.stringify(value);if(seen.has(key))return {$ref:seen.get(key)};
 const id=pool.length;seen.set(key,id);pool.push(null);
 pool[id]=Array.isArray(value)?value.map(intern):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,intern(v)]));
 return {$ref:id};
}
const folder=process.env.R7_EVIDENCE,files={};
for(const name of fs.readdirSync(folder).filter(f=>fs.statSync(path.join(folder,f)).isFile())){
 const text=fs.readFileSync(path.join(folder,name),'utf8');let value;try{value=JSON.parse(text);}catch{value=text;}
 files[name]={value:intern(value),format:name.endsWith('.json')?'json':'text',bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};
}
const data=brotliCompressSync(Buffer.from(JSON.stringify({transport:'R7-intern-v1',pool,files})),{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).toString('base64');
if(data.length>48000)throw Error('evidence_transport_exceeds_platform_stdout_budget:'+data.length);
console.log('R7_EVIDENCE_BROTLI_BASE64='+data);
