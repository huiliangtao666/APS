// Bounded stdout transport for official disposable validator evidence.
import fs from 'node:fs';import crypto from 'node:crypto';import zlib from 'node:zlib';import {execFileSync} from 'node:child_process';
const summaries={};for(const name of ['build','application','ui','impact']){const s=fs.readFileSync('.p1-evidence/'+name+'.log');summaries[name]={bytes:s.length,sha256:crypto.createHash('sha256').update(s).digest('hex'),tail:s.toString().split('\n').slice(-12).join('\n')};}
// Retain original API/Worker/frozen-input responses but bound the transport.
const tar=execFileSync('tar',['-cf','-','.p1-evidence/build.log','.p1-evidence/application.log','.p1-evidence/ui.log','.p1-evidence/ui-build.log','.p1-evidence/impact.log','.p1-evidence/cases'],{maxBuffer:12*1024*1024});const compressed=zlib.brotliCompressSync(tar,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:11}});
if(compressed.length>45000)throw Error('Evidence exceeds transport limit: '+compressed.length);
console.log('P1_VALIDATION_SUMMARIES '+JSON.stringify(summaries));console.log('P1_ARCHIVE_START');console.log(compressed.toString('base64'));console.log('P1_ARCHIVE_END');
