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
const folder=process.env.B16_OUT,files={};
for(const name of fs.readdirSync(folder).filter(f=>fs.statSync(path.join(folder,f)).isFile())){
 const text=fs.readFileSync(path.join(folder,name),'utf8');let value=text,format='text';try{const parsed=JSON.parse(text);if(text===JSON.stringify(parsed,null,2)){value=parsed;format='json-pretty';}else if(text===JSON.stringify(parsed)){value=parsed;format='json-compact';}}catch{}
 files[name]={value:intern(value),format,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};
}
const data=brotliCompressSync(Buffer.from(JSON.stringify({transport:'B16-intern-v1',pool,files})),{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).toString('base64');
if(data.length>48000)throw Error('evidence_transport_exceeds_platform_stdout_budget:'+data.length);
console.log('B16_EVIDENCE_BROTLI_BASE64='+data);
