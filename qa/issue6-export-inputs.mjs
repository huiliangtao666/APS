import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {stageInput} from './issue6-stage-input.mjs';import {inspectCsvBatch} from '../server/csv-batch.mjs';import {defs} from '../server/planner.ts';import {parseInputCsvRecords} from '../src/lib/input-csv.mjs';
const out=process.env.ISSUE6_EVIDENCE_DIR||'/evidence';fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'converted'),{recursive:true});
const inputs=stageInput(process.env.ISSUE6_INPUT_DIR||'/inputs',{selectApplicableMachines:true}),inspection=inspectCsvBatch(inputs.files,defs,inputs.repairs);if(inspection.issues.length)throw Error(JSON.stringify(inspection.issues));
const hash=s=>createHash('sha256').update(s).digest('hex'),quote=v=>'"'+String(v).replaceAll('"','""')+'"',manifest={softwareOnly:true,orderChoicesAuthority:'Issue6 explicit software test operator choices; no customer facts',originals:inputs.originals.map(f=>({file:f.name,sha256:hash(f.text)})),selected:inputs.hashes,converted:[],lineage:[],excluded:[]};
for(const [table,rows] of Object.entries(inspection.tables)){
 const def=defs.find(d=>d.key===table),original=inputs.originals.find(f=>f.name===def.file),raw=parseInputCsvRecords(original.text),source=inspection.sources[table];
 const text=[def.fields,...rows.map(row=>def.fields.map(f=>row[f]??''))].map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';fs.writeFileSync(path.join(out,'converted',def.file),text);manifest.converted.push({file:def.file,sha256:hash(text),rows:rows.length});
 rows.forEach((row,index)=>def.fields.forEach(field=>{
  const mapping=source.mappings.find(m=>[m.quantityField,m.unitField].includes(field)),sourceField=mapping?.sourceField||field;
  const originalRow=raw.slice(1).find(r=>r.line===source.lines[index]);const header=raw[0].cells;
  manifest.lineage.push({table,convertedFile:def.file,convertedPhysicalRow:index+2,field,value:row[field]??'',originalFile:def.file,originalSha256:hash(original.text),originalPhysicalRow:originalRow?.line??null,occurrence:index,sourceField,sourceValue:header.includes(sourceField)?originalRow?.cells[header.indexOf(sourceField)]??null:null,mapping:mapping||null,repair:source.repairs.find(r=>r.row===source.lines[index]&&r.field===field)||null,sourceKind:source.repairs.some(r=>r.row===source.lines[index]&&r.field===field)?'explicit-software-input':header.includes(sourceField)?'original-field':'optional-absent'});
 }));
 if(table==='machines')for(const row of raw.slice(1).filter(r=>!rows.some(m=>m['设备编号']===r.cells[0])))manifest.excluded.push({file:def.file,physicalRow:row.line,machineId:row.cells[0],operation:row.cells[3],reason:'Separate software scenario subset: operation absent from original10; raw whole-batch rejection retained'});
}
fs.writeFileSync(path.join(out,'input-lineage.json'),JSON.stringify(manifest,null,2));
