import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {test} from 'node:test';
import {seed,defs} from '../server/planner.ts';import {recordKeys,validateInputs} from '../server/input-validation.mjs';import {parseInputCsv} from '../src/lib/input-csv.mjs';import {inspectBatch} from '../prototypes/fr013-batch-import/src/csvBatch.ts';
const base='public/fr036',matrix=JSON.parse(fs.readFileSync(base+'/matrix.json')),samples=JSON.parse(fs.readFileSync(base+'/samples.json')).samples;
const read=p=>fs.readFileSync(base+'/'+p,'utf8');
const rows=(file)=>{const [head,...body]=parseInputCsv(read(file)).filter(r=>r.some(c=>c.trim()));return body.map(r=>Object.fromEntries(head.map((h,i)=>[h.replace(/^\ufeff/,''),r[i]])));};
test('current actual contracts, key parity, 19 chapter categories, five systems and all hashed sample bytes',()=>{
 assert.equal(matrix.inbound.length,defs.length);assert.equal(matrix.chapter9.length,19);assert.deepEqual([...new Set(matrix.inbound.flatMap(d=>d.systems))].sort(),['APS','ERP','MES','OMS','PLM','WMS']);
 for(const d of defs){const m=matrix.inbound.find(m=>m.key===d.key);assert.deepEqual(m.fields,d.fields);assert.deepEqual(m.uniqueKey,recordKeys[d.key]);assert.deepEqual(parseInputCsv(read(m.template)).filter(r=>r.some(Boolean)),[d.fields]);assert.ok(m.sourceOwner&&m.references&&m.version);}
 for(const s of samples)assert.equal(createHash('sha256').update(fs.readFileSync(base+'/'+s.file)).digest('hex'),s.sha256,s.file);
 assert.equal(matrix.outbound.length,6);
 for(const d of matrix.outbound){const sample=samples.find(s=>s.file===d.example);assert.deepEqual(fs.readFileSync(base+'/'+d.example),fs.readFileSync(sample.origin));const csv=parseInputCsv(read(d.example));const provenance=JSON.parse(csv[2][1]);for(const k of d.referenceKeys)assert.ok(k in provenance,k);assert.ok(provenance.simulation.includes('模拟'));assert.ok(provenance.timeOrigin.includes('+08:00'));}
});
for(const s of samples.filter(s=>s.contract==='main-single-table'))test('main validator '+s.expected+' '+s.file,()=>{const d=structuredClone(seed);d[s.table]=rows(s.file);const issues=validateInputs(defs,d);if(s.expected==='accept')assert.deepEqual(issues,[]);else assert.ok(issues.length,JSON.stringify(s));});
test('FR013 actual inspector: whole six batch duplicate/reference/unit reject, correction and replacement',()=>{
 const pd=defs.filter(d=>['orders','routes','times','machines','dependencies','rules'].includes(d.key)).map(d=>({...d,fields:parseInputCsv(read('prototype-six/'+d.file))[0]}));
 const files=pd.map(d=>({name:d.file,text:read('prototype-six/'+d.file)})),current=Object.fromEntries(pd.map(d=>[d.key,[]]));const before=JSON.stringify(current);
 const valid=inspectBatch(files,pd,current);assert.deepEqual(valid.issues,[]);
 for(const [key,field,change] of [['orders','订单编号',t=>t+'\n'+t.split('\n')[1]],['dependencies','资源编号',t=>t.replace('MIX01','NO_SUCH_MACHINE')],['times','固定分钟',t=>t.replace(',30,',',30kg,')]]){const copy=structuredClone(files),file=copy.find(f=>f.name===pd.find(d=>d.key===key).file);file.text=change(file.text);const invalid=inspectBatch(copy,pd,current);assert.ok(invalid.issues.some(i=>i.field.includes(field)),JSON.stringify(invalid.issues));assert.equal(JSON.stringify(current),before);}
 const corrected=inspectBatch(files,pd,current);assert.deepEqual(corrected.tables,valid.tables);assert.deepEqual(inspectBatch(files,pd,corrected.tables).tables,valid.tables);
});
