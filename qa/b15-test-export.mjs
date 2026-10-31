import fs from 'node:fs';import path from 'node:path';import {brotliCompressSync,constants} from 'node:zlib';
const folder=process.env.B15_EVIDENCE,files=Object.fromEntries(fs.readdirSync(folder).filter(f=>fs.statSync(path.join(folder,f)).isFile()).map(f=>[f,fs.readFileSync(path.join(folder,f),'utf8')]));
console.log('B15_EVIDENCE_BROTLI_BASE64='+brotliCompressSync(Buffer.from(JSON.stringify(files)),{params:{[constants.BROTLI_PARAM_QUALITY]:8}}).toString('base64'));
