import test from 'node:test';import assert from 'node:assert/strict';
import {dailyFixture,policies,branchBody} from './daily-fixture.mjs';
import {newDaily,feedback,balances,confirm,closeDay,DOMAINS} from '../server/daily-model.mjs';
import {workbookOpening} from '../server/daily-workbook.mjs';
const create=()=>{const d=dailyFixture();return newDaily(branchBody,workbookOpening(d,policies),d);};
let counter=0;const fact=(b,type,data,id='fact'+(++counter))=>({id,type,data,source:{kind:'EXPLICIT_MOCK'},occurredDate:b.date,knownDate:b.date,effectiveDate:b.date});
const confirms=b=>DOMAINS.forEach(k=>confirm(b,k,{kind:'EXPLICIT_MOCK'},true));
test('DI05 cumulative30/80/80, stocktake-5, quality and same-identity conflict',()=>{
 const b=create();b.state.tasks.push({id:'T',materialId:'FG101',limit:100,output:0,consumed:{},recipe:[]});b.adopted={taskIds:['T']};
 assert.deepEqual([30,80,80].map(n=>feedback(b,fact(b,'consume',{taskId:'T',lotId:'LOT-RM101',cumulative:n})).delta),[30,50,0]);
 assert.equal(balances(b).find(r=>r.materialId==='RM101').physical,5);
 const s=create();feedback(s,fact(s,'stocktake',{lotId:'LOT-RM101',quantity:80,category:'qualified',disposition:'mock count'}));assert.equal(s.state.movements[0].quantity,-5);assert.ok(balances(s).every(r=>r.difference===0));
 const f=fact(s,'stocktake',{lotId:'LOT-RM101',quantity:80,category:'qualified',disposition:'same'});feedback(s,f);assert.equal(feedback(s,f).duplicate,true);assert.throws(()=>feedback(s,{...f,data:{...f.data,quantity:79}}),e=>e.code==='DAILY_IDENTITY_CONFLICT');
});
test('DI06/08/09 delay precedes default receipt; partial100/30 leaves70; future unknown excluded; frozen D excludes next receipts',()=>{
 const b=create(),receipt={location:'LOC',expiresDate:'2026-12-01',quality:'pending',disposition:'explicit mock inspection'};
 feedback(b,fact(b,'purchase-draft',{id:'PO',materialId:'RM101',quantity:100,moq:50,multiple:50,dueDate:'2026-11-02',receipt,relationId:'SUP-RM101'}));assert.equal(balances(b).find(r=>r.materialId==='RM101').transit,0);
 feedback(b,fact(b,'purchase-issue',{id:'PO'}));feedback(b,fact(b,'receive',{id:'PO',quantity:30,receiptId:'RCPT'}));assert.equal(b.state.purchases[0].ordered-b.state.purchases[0].received,70);
 b.events.push({...fact(b,'purchase-delay',{id:'PO',dueDate:'2026-11-03',disposition:'known delay'},'DELAY'),knownDate:'2026-11-01',effectiveDate:'2026-11-02'});
 confirms(b);const next=closeDay(b,{noExecutionReason:'no actual production'});assert.equal(next.date,'2026-11-02');assert.equal(next.state.purchases[0].received,30);assert.equal(next.history[0].state.purchases[0].received,30);
 confirms(next);const third=closeDay(next,{noExecutionReason:'no production'});assert.equal(third.state.purchases[0].received,100);assert.equal(third.state.lots.find(x=>x.purchaseId==='PO'&&x.id!=='RCPT').pending,70);assert.ok(balances(third).every(r=>r.difference===0));
 const future=fact(b,'resource',{id:'EQ1',ready:false,disposition:'unknown'});future.knownDate='2026-11-04';assert.throws(()=>feedback(b,future),e=>e.code==='DAILY_FUTURE_FACT');
});
test('DI09/11 required confirmations, failed-next-day atomic input, 11.30 boundary and immutable source',()=>{
 const b=create();assert.throws(()=>closeDay(b,{}),e=>e.code==='DAILY_CONFIRMATIONS');confirms(b);const before=JSON.stringify(b);b.events.push({...fact(b,'purchase-delay',{id:'MISSING',dueDate:'2026-11-03',disposition:'invalid'},'BAD'),effectiveDate:'2026-11-02'});const withBad=JSON.stringify(b);assert.throws(()=>closeDay(b,{noExecutionReason:'explicit no execution'}));assert.equal(JSON.stringify(b),withBad);
 const end=create();end.date='2026-11-30';confirms(end);const last=closeDay(end,{noExecutionReason:'month end'});assert.equal(last.date,'2026-11-30');assert.equal(last.ended,true);assert.ok(before);
});
