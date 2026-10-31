import fs from 'node:fs';import {brotliCompressSync,constants} from 'node:zlib';
const root='/tmp/b12-r4-output';
const data={core:JSON.parse(fs.readFileSync(process.env.B12_OUT+'/b12-results.json','utf8')),r4:(fs.existsSync(root)?fs.readdirSync(root):[]).filter(n=>n.endsWith('.json')).map(name=>({name,value:JSON.parse(fs.readFileSync(root+'/'+name,'utf8'))}))};
console.log('B12_EVIDENCE_BROTLI_BASE64='+brotliCompressSync(Buffer.from(JSON.stringify(data)),{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).toString('base64'));
