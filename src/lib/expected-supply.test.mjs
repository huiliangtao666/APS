import test from 'node:test';
import assert from 'node:assert/strict';
import { validSupplyTime, validateExpectedSupply, resolveExpectedSupply, supplyEarliestMinute, buildSupplyConditions, exportSupplyPlanCsv } from './expected-supply.mjs';
const supply = { '供给编号':'S1','物料编号':'M1','批次编号':'LOT1','预计数量':'100','预计到达时间':'2026-11-02T08:00:00+08:00','预计可用时间':'2026-11-02T09:00:00+08:00' };
const use = { '引用编号':'U1','订单编号':'O1','工序编号':'OP1','供给编号':'S1','使用数量':'40' };
const delay = { '记录编号':'D1','供给编号':'S1','记录时间':'2026-11-01T10:00:00+08:00','调整后到达时间':'2026-11-02T10:00:00+08:00','调整后可用时间':'2026-11-02T11:00:00+08:00','原因':'模拟运输迟到' };
const input = (changes={}) => ({ supplies:[supply],delays:[],uses:[use],materials:[{'物料编号':'M1'}],orders:[{'订单编号':'O1','产品编号':'P1'}],routes:[{'产品编号':'P1','工序编号':'OP1'}],...changes });
const task = {id:'O1-OP1',orderId:'O1',operation:'OP1',productId:'P1',machine:'MC',start:60,end:90,duration:30,predecessor:''};
test('valid fields and references accepted; arrival alone does not permit use',()=>{
 assert.deepEqual(validateExpectedSupply(input()),[]);
 assert.equal(supplyEarliestMinute('O1','OP1',resolveExpectedSupply([supply]),[use]),60);
 assert.equal(supplyEarliestMinute('O2','OP1',resolveExpectedSupply([supply]),[use]),0);
});
test('late simulation preserves original record and uses revised availability',()=>{
 assert.deepEqual(validateExpectedSupply(input({delays:[delay]})),[]);
 const resolved=resolveExpectedSupply([supply],[delay]);
 assert.equal(resolved[0]['预计到达时间'],supply['预计到达时间']);
 assert.equal(resolved[0]['生效到达时间'],delay['调整后到达时间']);
 assert.equal(supplyEarliestMinute('O1','OP1',resolved,[use]),180);
 assert.equal(supply['生效可用时间'],undefined);
});
test('delay history resolves by event time independent of CSV order',()=>{
 const next={...delay,'记录编号':'D2','记录时间':'2026-11-01T11:00:00+08:00','调整后到达时间':'2026-11-02T12:00:00+08:00','调整后可用时间':'2026-11-02T13:00:00+08:00'};
 assert.deepEqual(validateExpectedSupply(input({delays:[next,delay]})),[]);
 assert.equal(resolveExpectedSupply([supply],[next,delay])[0]['生效可用时间'],next['调整后可用时间']);
 assert.ok(validateExpectedSupply(input({delays:[next,{...delay,'记录时间':'2026-11-01T12:00:00+08:00'}]})).some(f=>f.code==='SUPPLY_DELAY'));
});
test('strict timestamps reject impossible, timezone-free and reversed availability',()=>{
 for(const t of ['2026-02-30T09:00:00Z','2026-11-02T09:00','tomorrow','2026-11-02T24:00:00Z']) assert.equal(validSupplyTime(t),false,t);
 assert.equal(validSupplyTime('2028-02-29T09:00:00Z'),true);
 assert.ok(validateExpectedSupply(input({supplies:[{...supply,'预计可用时间':'2026-11-02T07:59:00+08:00'}]})).some(f=>f.code==='SUPPLY_READY'));
});
test('required identifiers, quantities and empty/invalid material references fail closed',()=>{
 for(const v of ['', '0', '-1', 'NaN', 'Infinity']) assert.ok(validateExpectedSupply(input({supplies:[{...supply,'预计数量':v}]})).some(f=>f.code==='SUPPLY_QUANTITY'));
 assert.ok(validateExpectedSupply(input({materials:[]})).some(f=>f.code==='SUPPLY_MATERIAL'));
 assert.ok(validateExpectedSupply(input({supplies:[{...supply,'批次编号':''}]})).some(f=>f.code==='SUPPLY_REQUIRED'));
 assert.ok(validateExpectedSupply(input({supplies:[supply,supply]})).some(f=>f.code==='SUPPLY_DUPLICATE'));
});
test('delay and plan references reject unknown supply/order/route and duplicate IDs',()=>{
 for(const change of [{'供给编号':'BAD'},{'订单编号':'BAD'},{'工序编号':'BAD'}]) assert.ok(validateExpectedSupply(input({uses:[{...use,...change}]})).length>0);
 assert.ok(validateExpectedSupply(input({delays:[{...delay,'供给编号':'BAD'}]})).some(f=>f.code==='SUPPLY_REFERENCE'));
 assert.ok(validateExpectedSupply(input({uses:[use,use]})).some(f=>f.code==='SUPPLY_DUPLICATE'));
 assert.ok(validateExpectedSupply(input({delays:[delay,{...delay,'记录编号':'D2'}]})).some(f=>f.code==='SUPPLY_DUPLICATE'));
});
test('allocation is summed across orders and rejects oversubscription',()=>{
 assert.ok(validateExpectedSupply(input({uses:[{...use,'使用数量':'101'}]})).some(f=>f.code==='SUPPLY_OVERALLOCATED'));
 assert.ok(validateExpectedSupply(input({uses:[{...use,'使用数量':'60'},{...use,'引用编号':'U2','使用数量':'60'}]})).some(f=>f.code==='SUPPLY_OVERALLOCATED'));
 assert.deepEqual(validateExpectedSupply(input({uses:[{...use,'使用数量':'100'}]})),[]);
});
test('conditions survive snapshot round trip and CSV export even when supply is in the past',()=>{
 const conditions=buildSupplyConditions([task],resolveExpectedSupply([supply],[delay]),[use]);
 const plan=JSON.parse(JSON.stringify({tasks:[task],supplyConditions:conditions}));
 assert.match(plan.supplyConditions[0]['条件说明'],/条件性供给/);
 assert.match(plan.supplyConditions[0]['条件说明'],/未确认真实到货/);
 assert.equal(plan.supplyConditions[0]['延期记录'][0]['原因'],delay['原因']);
 assert.match(exportSupplyPlanCsv(plan),/2026-11-02T11:00:00\+08:00/);
 assert.equal(buildSupplyConditions([],resolveExpectedSupply([supply]),[use]).length,0);
 const past={...supply,'预计到达时间':'2020-01-01T08:00:00Z','预计可用时间':'2020-01-01T09:00:00Z'};
 assert.match(buildSupplyConditions([task],resolveExpectedSupply([past]),[use])[0]['条件说明'],/条件性供给/);
});
test('trimmed identifiers cannot silently bypass supply waiting or conditions',()=>{
 const spaced={...use,'供给编号':' S1 ','订单编号':' O1 ','工序编号':' OP1 '};
 assert.deepEqual(validateExpectedSupply(input({uses:[spaced]})),[]);
 assert.equal(supplyEarliestMinute('O1','OP1',resolveExpectedSupply([supply]),[spaced]),60);
 const conditions=buildSupplyConditions([task],resolveExpectedSupply([supply]),[spaced]);
 assert.equal(conditions[0]['订单编号'],'O1');
 assert.match(exportSupplyPlanCsv({tasks:[task],supplyConditions:conditions}),/条件性供给/);
});
test('multiple supplies wait for the latest ready instant and round seconds upward',()=>{
 const extra={...supply,'供给编号':'S2','批次编号':'LOT2','预计可用时间':'2026-11-02T10:00:01+08:00'};
 const uses=[use,{...use,'引用编号':'U2','供给编号':'S2'}];
 assert.deepEqual(validateExpectedSupply(input({supplies:[supply,extra],uses})),[]);
 assert.equal(supplyEarliestMinute('O1','OP1',resolveExpectedSupply([supply,extra]),uses),121);
});
