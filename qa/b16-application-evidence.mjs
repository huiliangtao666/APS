// Compact, bounded stdout transport for the official disposable validator.
import fs from 'node:fs';import crypto from 'node:crypto';import zlib from 'node:zlib';import {execFileSync} from 'node:child_process';
const summaries={};
for(const name of ['build','application','ui','impact','node-recovery']){const s=fs.readFileSync('.b16-evidence/'+name+'.log','utf8');summaries[name]={bytes:Buffer.byteLength(s),sha256:crypto.createHash('sha256').update(s).digest('hex'),tail:s.split('\n').slice(-12).join('\n')};}
console.log('B16_VALIDATION_SUMMARIES '+JSON.stringify(summaries));
const cases=[];
for(const name of fs.readdirSync('.b16-evidence/app')){const bytes=fs.readFileSync('.b16-evidence/app/'+name),x=JSON.parse(bytes),p=x.plan||x;cases.push({runStatus:x.final?.status,confirmation:x.snapshot?{actor:x.actor,snapshotHash:x.snapshotHash,planId:x.snapshot.plan?.id,lineAssignments:x.snapshot.plan?.lineAssignments,runId:x.snapshot.run?.id}:undefined,name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tasks:p.tasks,lineAssignments:p.lineAssignments,transaction:p.materialTransaction,materialDemands:p.materialDemands,resourceReservations:p.resourceReservations,status:p.b16Verification?.status,findings:p.findings,selection:p.lineSelection});}
fs.writeFileSync('.b16-evidence/case-summary.json',JSON.stringify(cases,null,2));
const tar=execFileSync('tar',['-cf','-','.b16-evidence/build.log','.b16-evidence/application.log','.b16-evidence/ui.log','.b16-evidence/ui-build.log','.b16-evidence/impact.log','.b16-evidence/node-recovery.log','.b16-evidence/sample','.b16-evidence/case-summary.json','.b16-evidence/app/dual-line.json'],{maxBuffer:32*1024*1024});
const compressed=zlib.brotliCompressSync(tar,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:10}});
if(compressed.length>38000)throw Error('Evidence transport exceeds bounded stdout: '+compressed.length);
console.log('B16_ARCHIVE_START');console.log(compressed.toString('base64'));console.log('B16_ARCHIVE_END');console.log(JSON.stringify({summaries,brotliBytes:compressed.length}));
