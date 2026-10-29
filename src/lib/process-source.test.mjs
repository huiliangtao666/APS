import test from 'node:test';import assert from 'node:assert/strict';
import {validateProcessConfig} from './process-config.mjs';
const row=(op,pre='')=>({'产品编号':' P ','工序编号':op,'工序名称':op,'前序工序':pre});
const check=routes=>validateProcessConfig({products:[{'产品编号':'P'}],routes});
const refs=f=>f.relatedRecords.map(r=>r.occurrence.index);
test('duplicate group retains all three byte-identical occurrences without changing repeated finding count',()=>{
 const r=row('MIX'),rows=[r,row('FILL','MIX'),{...r},{...r},row('OTHER')];
 const f=check(rows).filter(f=>f.code==='INPUT / ROUTE_DUPLICATE');assert.equal(f.length,2);
 for(const x of f){assert.deepEqual(refs(x),[0,2,3]);for(const r of x.relatedRecords){assert.deepEqual(r.row,rows[r.occurrence.index]);assert.equal(r.occurrence.keyCount,3);assert.equal(r.field,'产品编号 + 工序编号');}}
});
test('cycle retains only actual checked cycle members in input order, excluding tail and discarded duplicate',()=>{
 const rows=[row('TAIL','MIX'),row('MIX','FILL'),row('FILL','MIX'),row('MIX','NOT-READ'),row('OTHER')];
 const f=check(rows).filter(f=>f.code==='INPUT / ROUTE_CYCLE');assert.equal(f.length,1);assert.deepEqual(refs(f[0]),[1,2]);assert.equal(f[0].row,3);
});
test('missing predecessor has exactly the reference row, no invented target',()=>{
 const rows=[row('MIX','ABSENT'),row('FILL','MIX')];const f=check(rows).find(f=>f.code==='INPUT / ROUTE_PREDECESSOR');assert.deepEqual(refs(f),[0]);assert.deepEqual(f.missingTarget,{table:'routes',key:'P/ABSENT'});assert.equal(f.relatedRecords[0].field,'前序工序');
});
test('valid route remains valid and self cycle retains one true occurrence',()=>{
 const rows=[row('MIX'),row('FILL','MIX')];assert.ok(!check(rows).some(f=>/ROUTE_/.test(f.code)));
 const f=check([row('MIX','MIX')]).find(f=>f.code==='INPUT / ROUTE_CYCLE');assert.deepEqual(refs(f),[0]);
});
