import fs from 'node:fs';
import {originalBomDef as def} from '../src/lib/original-bom.mjs';
import {parseInputCsv} from '../src/lib/input-csv.mjs';
export const sample=fs.readFileSync(new URL('../public/fr036/examples/09_物料BOM配置.csv',import.meta.url),'utf8');
const [, ...cells]=parseInputCsv(sample);
export const sourceRows=cells.map(r=>Object.fromEntries(def.fields.map((f,i)=>[f,r[i]])));
export function file(rows=sourceRows){return {name:def.file,text:[def.fields,...rows.map(r=>def.fields.map(f=>r[f]))].map(c=>c.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n')};}
