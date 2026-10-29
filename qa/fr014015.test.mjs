import test from 'node:test';import assert from 'node:assert/strict';
import {defs} from '../server/planner.ts';import {recordKeys,validateInputs} from '../server/input-validation.mjs';
import {recordIdentity} from '../src/lib/record-identity.mjs';import {related,filterRows,displayValue} from '../src/lib/data-query.mjs';
import {categoryInputs} from './fr014015-fixture.mjs';
test('24 category fixtures are genuine valid inputs; identity keys stay equal to save validator',()=>{
 for(const execution of [false,true]){const d=categoryInputs(execution,true);assert.deepEqual(validateInputs(defs,d),[]);for(const def of defs){assert.ok(recordKeys[def.key]);if(d[def.key]?.length)assert.ok(recordIdentity(def.key,d[def.key][0]).includes(recordKeys[def.key][0]));}}
});
test('new resource/event/execution relationships are explicit, bidirectional and type scoped',()=>{
 const d=categoryInputs(true,true);d.tools.push({...d.tools[0],'工装编码':'SPACE1'});
 assert.ok(related(d,'resourceClaims',0).some(l=>l.table==='tools'&&l.index===0));
 assert.ok(related(d,'tools',0).some(l=>l.table==='resourceClaims'&&l.index===0));
 assert.ok(related(d,'resourceClaims',1).some(l=>l.table==='batchResources'));
 assert.ok(!related(d,'resourceClaims',1).some(l=>l.table==='tools'));
 assert.ok(related(d,'executionFacts',0).some(l=>l.table==='machines'));
 assert.ok(related(d,'simulationEvents',0).some(l=>l.table==='machines'&&d.machines[l.index]['设备编号']==='MIX02'));
 assert.ok(related(d,'executionMaterials',0).some(l=>l.table==='inventory'));
 assert.equal(filterRows(d,'executionMaterials',{order:'A',product:'HC40'}).length,1);
 assert.equal(filterRows(d,'executionSources',{order:'B'}).length,0);
 d.simulationEvents[0]['参数JSON']='{broken';assert.deepEqual(related(d,'simulationEvents',0),[]);
});
test('readable structured details preserve missing, nested values and confirmed status without exposing JSON syntax',()=>{
 assert.equal(displayValue('方案状态','confirmed'),'已确认');
 assert.equal(displayValue('原始分配JSON','[{"批次编号":"LOT","数量":"1","已确认":false}]'),'批次编号：LOT；数量：1；已确认：否');
 assert.equal(displayValue('精确合格数量','null'),'未记录');
 assert.ok(!displayValue('联合资源占用','[{"数量":3}]').includes('{'));
});

test('timestamp expiry fields accept inclusive ISO instants while date-only expiry still rejects impossible days',()=>{
 const data={deliveryConditions:[{'模拟有效期截止时间':'2026-12-31T08:00:00+08:00'}],inventory:[{'有效期':'2026-12-31'}]};
 assert.equal(filterRows(data,'deliveryConditions',{dateField:'模拟有效期截止时间',from:'2026-12-31T08:00:00+08:00',to:'2026-12-31T00:00:00Z'}).length,1);
 assert.equal(filterRows(data,'inventory',{dateField:'有效期',from:'2026-02-30'}).length,0);
});
