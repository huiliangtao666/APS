import fs from 'node:fs';
import {originalBomDef as def} from '../src/lib/original-bom.mjs';
export const sample=fs.readFileSync(new URL('../public/fr036/examples/09_物料BOM配置.csv',import.meta.url),'utf8');
// Independent Python csv.DictReader extraction of the hash-authenticated original.
export const sourceRows=JSON.parse(fs.readFileSync(new URL('./issue4-original-source-expected.json',import.meta.url))).originalBom;
export function file(rows=sourceRows){return {name:def.file,text:[def.fields,...rows.map(r=>def.fields.map(f=>r[f]))].map(c=>c.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n')};}
