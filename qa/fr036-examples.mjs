// Explicit fixture generator; run only in disposable or authorized sample paths.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {seed,defs} from '../server/planner.ts';
const base='public/fr036',matrix=JSON.parse(fs.readFileSync(base+'/matrix.json'));
const csv=(d,rows)=>'\ufeff'+[d.fields,...rows.map(r=>d.fields.map(f=>r[f]??''))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
const samples=[];
const add=(name,key,rows,expected,context)=>{const file='examples/'+name+'.csv';fs.mkdirSync(base+'/examples',{recursive:true});fs.writeFileSync(base+'/'+file,csv(defs.find(d=>d.key===key),rows));samples.push({file,contract:'main-single-table',table:key,expected,context,simulation:true});};
add('orders','orders',seed.orders,'accept','完整seed上下文；整表替换两订单');
const duplicate=structuredClone(seed.orders);duplicate.push({...duplicate[0]});add('duplicate-orders','orders',duplicate,'reject-duplicate','完整seed；错误前后不写入');
const unit=structuredClone(seed.orders);unit[0]['数量单位']='吨';add('bad-unit-orders','orders',unit,'reject-unit','完整seed；改回kg');
const supplies=[{'供给编号':'SIM-S1','物料编号':'LEAN','批次编号':'SIM-LOT-NEW','预计数量':'100','预计到达时间':'2026-11-02T09:00:00+08:00','预计可用时间':'2026-11-02T10:00:00+08:00','质量状态':'合格','有效期':'2026-12-31'}];
add('supplies','supplies',supplies,'accept','完整seed；LEAN单位kg；不是库存到货');
const ref=structuredClone(supplies);ref[0]['物料编号']='NO_SUCH_MATERIAL';add('bad-reference-supplies','supplies',ref,'reject-reference','完整seed；修正LEAN');
const date=structuredClone(supplies);date[0]['预计到达时间']='2026-02-30T09:00:00';add('bad-date-supplies','supplies',date,'reject-date','完整seed；不存在日期且缺时区');
for(const d of matrix.inbound){const file='templates/'+d.file;samples.push({file,table:d.key,contract:'main-header-only',expected:'fill-before-import',simulation:true});}
for(const p of fs.readdirSync(base+'/prototype-six'))samples.push({file:'prototype-six/'+p,contract:'prototype-six-atomic',expected:'accept-six-together',context:'仅独立原型；旧合格需求kg字段',simulation:true});
fs.mkdirSync(base+'/exports',{recursive:true});
for(const d of matrix.outbound){const from='docs/fr035-acceptance/evidence/run3/'+d.kind+'.csv';fs.copyFileSync(from,base+'/'+d.example);samples.push({file:d.example,contract:'FR035-v1',expected:'export-only-not-importable',origin:from,sourceSHA:'cf6e76e23722f142a08c552aacb43c924fc62f19',simulation:true});}
for(const s of samples)s.sha256=createHash('sha256').update(fs.readFileSync(base+'/'+s.file)).digest('hex');
fs.writeFileSync(base+'/samples.json',JSON.stringify({version:'FR036-v1',fixtureSource:'server/planner.ts#seed',metadataPolicy:'sidecar-only; do not append unsupported CSV columns',samples},null,2)+'\n');
