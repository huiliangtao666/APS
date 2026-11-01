import test from 'node:test';import assert from 'node:assert/strict';
import {p1Capabilities,p1InitialStrategies,checkP1Strategies,validateP1Inputs,p1EligibleOrders} from '../src/lib/p1-topics-contract.mjs';
test('every unknown business strategy is named and rejected when enabled',()=>{
 assert.deepEqual(checkP1Strategies(p1InitialStrategies),[]);
 for(const c of p1Capabilities.filter(c=>c.status!=='SUPPORTED'))assert.ok(checkP1Strategies({...p1InitialStrategies,[c.id]:'ENABLED'}).some(s=>s.includes(c.label)));
 assert.ok(checkP1Strategies({...p1InitialStrategies,newSecretFormula:'ENABLED'}).some(s=>s.includes('未知')));
 for(const invalid of ['{',null,[],{}, {independentDemand:'MAYBE'}])assert.ok(checkP1Strategies(invalid).length);
});
test('source eligibility isolates formal, cancelled and other-scene demands',()=>{
 const data={orders:[['FORMAL','正式订单','有效'],['F1','预测','有效'],['F2','预测','有效'],['F3','预测','已取消']].map(([id,type,state])=>({'订单编号':id,'需求类型':type,'订单状态':state})),p1DemandSources:[['FORMAL','P'],['F1','P'],['F2','OTHER'],['F3','P']].map(([id,p])=>({'订单编号':id,'配置编号':p}))};
 assert.deepEqual(p1EligibleOrders(data,'P').map(o=>o['订单编号']),['F1']);
 assert.ok(validateP1Inputs(data).some(i=>i.message.includes('正式订单')));
});
