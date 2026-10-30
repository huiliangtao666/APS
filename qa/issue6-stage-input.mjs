import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {parseInputCsvRecords} from '../src/lib/input-csv.mjs';
import {defs} from '../server/planner.ts';
export function stageInput(dir,{selectApplicableMachines=false}={}){
 const manifest=parseInputCsvRecords(fs.readFileSync(path.join(dir,'00_导入顺序与阶段说明.csv'),'utf8'));
 const files=manifest.slice(1).filter(r=>r.cells[1]==='是').map(r=>({name:r.cells[0],text:fs.readFileSync(path.join(dir,r.cells[0]),'utf8')}));
 const originals=structuredClone(files);
 if(selectApplicableMachines){
  const route=parseInputCsvRecords(files.find(f=>f.name.startsWith('10_')).text),ops=new Set(route.slice(1).map(r=>r.cells[1]));
  const file=files.find(f=>f.name.startsWith('03_')),raw=parseInputCsvRecords(file.text),quote=v=>'"'+v.replaceAll('"','""')+'"';
  file.text=raw.filter((r,i)=>i===0||ops.has(r.cells[3])).map(r=>r.cells.map(quote).join(',')).join('\r\n')+'\r\n';
 }
 const orders=files.find(f=>f.name.startsWith('17_'));const raw=parseInputCsvRecords(orders.text);
 // Explicit software test values, not customer facts or product defaults.
 const repairs=raw.slice(1).filter(r=>r.cells.some(Boolean)).flatMap(r=>['是否允许拆分','需求类型','订单状态'].map((field,i)=>({file:orders.name,row:r.line,field,value:['否','正式订单','有效'][i],authority:'Issue6 software test fixture only'})));
 return {files,originals,repairs,manifest,hashes:files.map(f=>({file:f.name,sha256:crypto.createHash('sha256').update(f.text).digest('hex')}))};
}
