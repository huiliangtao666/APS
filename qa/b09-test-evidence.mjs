import fs from 'node:fs';
import path from 'node:path';
import {fixture,supplyFixture,provenance,conditions,tasks} from './b09-test-fixture.mjs';
import {calculateMaterialDemand,createMaterialAllocator,materialPolicy} from '../src/lib/material-allocation.mjs';
import {verifyJointConditions} from '../src/lib/verify-joint-conditions.mjs';
import {exportSupplyPlanCsv,validateExpectedSupply} from '../src/lib/expected-supply.mjs';
const root=process.env.B09_OUTPUT;if(!root)throw Error('B09_OUTPUT required');fs.mkdirSync(root,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n');
const run=(d,minute=0)=>{
 const a=createMaterialAllocator(d,materialPolicy(d,conditions.ruleEvaluationAt));
 const r=a.preview(calculateMaterialDemand(d,d.orders[0],'MIX',minute),minute);if(r.ok)r.commit();
 return {input:d,minute,ok:r.ok,rows:r.rows};
};
const positive=run(fixture()),negative=run(fixture('62.4'));
const twentyFive=fixture();twentyFive.orders[0]['合格需求']='480';twentyFive.inventory=twentyFive.inventory.filter(r=>r['物料编号']!=='LEAN');twentyFive.inventory.push({'批次编号':'400-100','物料编号':'LEAN','账面数量':'400','已占用数量':'100','质量状态':'合格','有效期':'2026-12-31','位置':'模拟库'});
const d=fixture(),a=createMaterialAllocator(d,materialPolicy(d,conditions.ruleEvaluationAt)),rows=[];
for(const t of tasks){const r=a.preview(calculateMaterialDemand(d,d.orders[0],t.operation,t.start),t.start);if(!r.ok)throw Error('expected valid');r.commit();rows.push(...r.rows);}
const plan={tasks,materialChecked:true,jointConditionsContract:conditions.jointConditionsContract,materialDemands:rows};
const tamper=structuredClone(plan);tamper.materialDemands[0].allocations[0].lotId='frozen';
write('domain-results.json',{provenance,positive,negative,twentyFive:run(twentyFive),supplyAtArrival:run(supplyFixture(),120),supplyAtReady:run(supplyFixture(),180),independentCheck:verifyJointConditions(plan,d,conditions),tamperCheck:verifyJointConditions(tamper,d,conditions)});
write('frozen-snapshot.json',{input:d,conditions,plan});fs.writeFileSync(path.join(root,'native-plan.csv'),exportSupplyPlanCsv(plan));
console.log('B09 domain evidence written: exact/raw sources, frozen snapshot, native CSV; no UI/API/Worker claim');
