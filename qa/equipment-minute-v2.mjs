// Opt-in full private V2 check. Each product operation owns one short-lived
// process. Intermediate snapshots are complete, local, and never product state.
// Running this module still requires the PM's actual execution window.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {workbookSchema,refreshDerived,validateWorkbook,hash,PROFILE} from '../server/workbook-model.mjs';
import {prepareBusinessImport,checkSelection} from '../server/workbook-workbench.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';

const originals={
 business:{bytes:2202570,sha256:'247423ea73d441e8ef6d03f538f393973287e17acb93d81ec1353abc4283d247'},
 parameter:{bytes:356351,sha256:'f9a4fea37b2c50038cc7c7bd9ad513d2c73b981d8ef0cd1cc2d8f47a775b176e'}
};
const inputCounts={'工艺路线':127,'设备与工装':49,'生产班次':81,'停机安排':5,'换型清洗':1986,'工序投料':317,'工装资源池':17,'在制剩余映射':8};
const selection={startDay:1,endDay:15,currentDay:1};
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
const write=(dir,name,value)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value),{flag:'wx',mode:0o600});
function mark(stage){console.log(JSON.stringify({stage,...process.memoryUsage()}));}
function parsedFile(kind){
 const key=kind==='business'?'APS_V2_BUSINESS_FILE':'APS_V2_PARAMETER_FILE';
 const bytes=fs.readFileSync(process.env[key]);
 assert.equal(bytes.length,originals[kind].bytes,kind+' original bytes');
 assert.equal(hash(bytes),originals[kind].sha256,kind+' original SHA256');
 const parsed=parseWorkbook(bytes,workbookSchema);
 assert.deepEqual(parsed.issues,[],kind+' complete parser validation');
 assert.equal(parsed.datasetVersion,'APS-MEAT-202611-V2.0');
 if(kind==='business')for(const [table,n]of Object.entries(inputCounts))assert.equal(parsed.tables[table]?.length,n,table);
 else assert.deepEqual([parsed.parameterCounts.definitions,parsed.parameterCounts.instances],[181,4862]);
 return parsed;
}
const business=(parsed,version)=>({...parsed,id:'issue50-v2',name:'Private V2',version,profile:PROFILE,fileHash:originals.business.sha256,drafts:[]});
const adopt=(parsed,old)=>integrateParameterImport(parsed,old,{id:'issue50-v2',name:'Private V2',expectedVersion:old?.version||0,fileHash:originals.parameter.sha256,adoptParameters:true,actor:'owner'});
function result(dir,name,d){
 refreshDerived(d,selection.startDay);
 assert.deepEqual(validateWorkbook(d,{completeness:false}),[],name+' full dataset validation');
 assert.equal(d.fileHash,originals.business.sha256);
 for(const [table,n]of Object.entries(inputCounts))assert.equal(d.tables[table]?.length,n,table+' retained');
 write(dir,name,d);
 // Only compact adopted facts cross operation boundaries. Raw values, tables,
 // row/cell/formula metadata, candidates and definitions remain in each snapshot.
 const values=d.effectiveParameters.values.map(v=>[v.object,v.field,v.value,v.sourceRole]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 write(dir,name+'-summary',{values,parameterHash:hash(d.tables['配置参数']),mappingHash:hash(d.mapping),inputHash:hash(d),version:d.version,sourceFiles:d.sourceFiles,parameterSources:d.parameterSources});
}

function stage(dir,name){
 mark(name+':before');
 if(name==='parse-business')write(dir,'business-parsed',parsedFile('business'));
 else if(name==='parse-parameter')write(dir,'parameter-parsed',parsedFile('parameter'));
 else if(name==='prepare-business'){
  const d=prepareBusinessImport(business(read(dir,'business-parsed'),1),null);
  write(dir,'business-only',refreshDerived(d,1));
 }else if(name==='parameter-first'){
  const r=adopt(read(dir,'parameter-parsed'),null);assert.deepEqual(r.issues,[]);
  write(dir,'parameter-only',r.d);
 }else if(name==='forward'){
  const r=adopt(read(dir,'parameter-parsed'),read(dir,'business-only'));assert.deepEqual(r.issues,[]);
  result(dir,'forward',r.d);
 }else if(name==='inverse'){
  result(dir,'inverse',prepareBusinessImport(business(read(dir,'business-parsed'),2),read(dir,'parameter-only')));
 }else if(name==='check-forward'||name==='check-inverse'){
  const d=read(dir,name.slice(6)),ready=checkSelection(d,{version:d.version,selection},'owner');
  assert.equal(ready.ready,true,JSON.stringify(ready.issues));
  write(dir,name,{ready:ready.ready,issues:ready.issues,checkedRef:ready.checkedRef});
 }else throw Error('Unknown private V2 stage '+name);
 mark(name+':after');
}

export function checkPrivateV2(){
 assert.ok(process.env.APS_V2_BUSINESS_FILE&&process.env.APS_V2_PARAMETER_FILE,'Both original V2 paths required');
 assert.ok(process.env.APS_V2_SCRATCH,'Explicit task scratch root required');
 const root=fs.realpathSync(process.env.APS_V2_SCRATCH);
 // Preserve failed-stage evidence; do not silently reuse or wipe a prior run.
 const dir=fs.mkdtempSync(path.join(root,'equipment-v2-'));
 const heapFlags=['--max-old-space-size=192'];
 const supplied=process.execArgv.join(' ').match(/--max[-_]old[-_]space[-_]size(?:=|\s+)(\d+)/);
 if(supplied){assert.ok(Number(supplied[1])<=192,'This check cannot raise the original heap cap');heapFlags[0]='--max-old-space-size='+supplied[1];}
 const stages=['parse-business','parse-parameter','prepare-business','parameter-first','forward','inverse','check-forward','check-inverse'];
 const manifest={kind:'PRIVATE_V2_DEVELOPMENT_CHECK',originals,dir,stages:[],result:'IN_PROGRESS'};
 const deadline=Date.now()+180000;
 const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 save();
 for(const name of stages){
  // Inherit a lower caller cap, otherwise keep r1's 192 MiB. Do not pass
  // node:test runner flags into a stage. No heap uplift or retry.
  const remaining=deadline-Date.now();
  if(remaining<=0){manifest.result='FAILED_DEADLINE';save();throw Error('V2 check deadline; evidence '+dir);}
  const child=spawnSync(process.execPath,[...heapFlags,fileURLToPath(import.meta.url),'--stage',name,dir],{encoding:'utf8',maxBuffer:1024*1024,timeout:Math.min(120000,remaining)});
  fs.writeFileSync(path.join(dir,name+'.stdout'),child.stdout||'',{mode:0o600});
  fs.writeFileSync(path.join(dir,name+'.stderr'),child.stderr||'',{mode:0o600});
  manifest.stages.push({name,status:child.status,signal:child.signal,error:child.error?.message});
  if(child.status!==0||child.signal||child.error){manifest.result='FAILED';save();throw Error('V2 stage '+name+' stopped; evidence '+dir);}
  save();
 }
 const a=read(dir,'forward-summary'),b=read(dir,'inverse-summary');
 try{assert.deepEqual(a.values,b.values,'Both import orders adopt the same P facts');
 assert.equal(a.mappingHash,b.mappingHash,'Both orders produce identical minute mapping');}
 catch(e){manifest.result='FAILED_COMPARISON';save();throw e;}
 manifest.result='PASS';manifest.forward=a.inputHash;manifest.inverse=b.inputHash;save();
 return {dir,manifest};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--stage')stage(process.argv[4],process.argv[3]);
 else console.log(JSON.stringify(checkPrivateV2()));
}
