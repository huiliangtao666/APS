import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';import {gzipSync,gunzipSync} from 'node:zlib';
import {parseWorkbook} from './workbook-parse.mjs';
import {workbookSchema,refreshDerived,validateWorkbook,workbookReadiness,hash,rows,PROFILE} from './workbook-model.mjs';
const input=parentPort?workerData:await new Promise(resolve=>process.once('message',resolve));
const send=m=>{if(parentPort)parentPort.postMessage(m);else{process.send(m,()=>process.disconnect());}};
try{
 const {buffer,sourcePath,oldRef,dataPath,id,name,expectedVersion,fileHash,ignored}=input;
 const parsed=parseWorkbook(sourcePath?fs.readFileSync(sourcePath):Buffer.from(buffer),workbookSchema),old=oldRef?JSON.parse(gunzipSync(fs.readFileSync(oldRef)).toString('utf8')):null;
 const d={...parsed,id,name,version:expectedVersion+1,profile:PROFILE,fileHash,mapping:old?.mapping||null,drafts:old?.drafts||[],createdAt:new Date().toISOString()};
 if(old)for(const [table,values]of Object.entries(old.tables)){const spec=workbookSchema.tables[table];if(spec?.kind!=='输入')continue;const key=r=>table==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):r[spec.key],incoming=d.tables[table]||[],keys=new Set(incoming.map(key));const retained=values.filter(r=>!keys.has(key(r)));d.tables[table]=[...incoming,...retained];for(const b of old.bindings||[])if(b.sheet===table){const previous=values.find(r=>r._row===b.row),recordKey=b.recordKey??(previous?key(previous):null);if(retained.some(r=>key(r)===recordKey))d.bindings.push({...b,recordKey});}}
 refreshDerived(d);
 const issues=[...parsed.issues.filter(i=>!(['UNKNOWN_SHEET','UNKNOWN_FIELD'].includes(i.code)&&ignored.includes(i.sheet+(i.field?':'+i.field:'')))),...validateWorkbook(d)];
 const summary={issues,readiness:workbookReadiness(d),classification:d.classification,warnings:d.warnings,createdAt:d.createdAt,mappingHash:hash(d.mapping),parameterHash:hash(rows(d,'配置参数'))};
 fs.writeFileSync(dataPath,gzipSync(Buffer.from(JSON.stringify(d))),{flag:'wx',mode:0o600});send({kind:'result',summary});
}catch(e){send({kind:'failure',message:e.message});}
