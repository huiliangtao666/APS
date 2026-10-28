import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,defs,calculate} from '../server/planner.ts';
import {validateInputs} from '../server/input-validation.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {executionFixture} from './execution-fixture.mjs';
import {validateExecution,executionTransition,executionAdmission,executionSummary,executionTrialIssues} from '../src/lib/execution-facts.mjs';
import {quantityMath as Q,executionInventory} from '../src/lib/material-allocation.mjs';
const at='2026-10-29T00:00:00Z';
const fixture=()=>{const d=executionFixture(seed);Object.assign(d.executionFacts[0],{'累计报废数量':'10','报废补做口径':'按本工序BOM补做'});d.executionMaterials[0]['累计已用数量']='50';d.inventory[0]['账面数量']='140';return d;};
const run=d=>{const frozen=freezeRunInput(d,{},at);return calculate(frozen.executionData,0,at,frozen.conditions);};
export const sourceFor=d=>({'来源编号':'UAT15-row1','原始任务编号':'original-A-MIX','事实编号':'F-A-MIX','原始汇总耗料':d.executionMaterials[0]['累计已用数量'],'耗料单位':'kg','来源说明':'人工核对的原始汇总；模拟','原始分配JSON':JSON.stringify(d.executionMaterials.map(c=>({'记录编号':c['记录编号'],'批次编号':c['批次编号'],'物料编号':c['物料编号'],'数量':c['累计已用数量'],'单位':c['单位']})))});
test('FR031 scrap is separate from usable output; replacement demand is explicit and material conserved',()=>{
 const d=fixture(),before=JSON.stringify(d);assert.deepEqual(validateInputs(defs,d),[]);const p=run(d),m=p.materialDemands[0];
 assert.equal(p.execution.remaining[0].remainingQuantity,60);assert.equal(p.execution.remaining[0].scrapQuantity,10);assert.equal(m.quantity,60);assert.equal(m.executionConsumed,50);assert.equal(m.allocations[0].quantity,60);assert.equal(m.allocations[0].remaining,20);assert.equal(140,50+60+10+20);
 assert.equal(p.tasks[0].duration,20);assert.equal(p.tasks[1].start,50);assert.equal(p.execution.orderImpact[0].remainingQualifiedOrder,100);assert.equal(p.execution.orderImpact[0].operations[0].usableOutput,40);assert.deepEqual(p.execution.orderImpact[0].unfinishedOperations,['MIX','FILL']);assert.equal(JSON.stringify(d),before);
});
test('FR031 repeated scrap calculations do not add outputs or deduct source inventory',()=>{
 const d=fixture(),before=structuredClone(d),a=run(d);for(let n=0;n<5;n++){const p=run(d);assert.deepEqual(p.materialDemands,a.materialDemands);assert.deepEqual(p.execution,a.execution);}assert.deepEqual(d,before);assert.equal(executionInventory(d)[0]['账面数量'],'90');
});
test('FR031 pending scrap is recorded but blocks automatic remaining scheduling with order cause',()=>{
 const d=fixture();d.executionFacts[0]['报废补做口径']='待核对';assert.deepEqual(validateInputs(defs,d),[]);assert.ok(executionAdmission(d,{mode:'supported'}).some(i=>i.message.includes('报废')));const p=run(d);assert.equal(p.tasks.length,0);assert.equal(p.execution.orderImpact[0].reconciliationRequired,true);assert.match(p.findings[0].message,/核对/);
});
test('FR031 missing policy cannot invent replacement stock even when MATERIAL is disabled',()=>{
 const d=fixture();d.executionFacts[0]['报废补做口径']='';d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='否';assert.equal(run(d).tasks.length,0);
});
test('FR031 scrap and supplementary consumption forward correction changes remainder without erasing original start',()=>{
 const d=fixture(),next=structuredClone(d);Object.assign(next.executionFacts[0],{'累计报废数量':'20','工序完成数量':'50','观测分钟':'35','剩余工时分钟':'25'});next.executionMaterials[0]['累计已用数量']='70';assert.deepEqual(executionTransition(d,next),[]);assert.deepEqual(validateExecution(next),[]);const p=run(next);assert.equal(p.execution.remaining[0].remainingQuantity,50);assert.equal(p.materialDemands[0].quantity,50);assert.equal(p.tasks[0].duration,25);assert.equal(p.tasks[1].start,60);assert.equal(p.execution.facts[0]['开始分钟'],'0');
});
test('FR031 scrap rollback, invalid values and unrecognized replacement policy require reconciliation',()=>{
 const d=fixture();for(const value of ['9','0']){const n=structuredClone(d);n.executionFacts[0]['累计报废数量']=value;assert.ok(executionTransition(d,n).length);}
 for(const value of ['-1','NaN','1000000000000.000000000001','0.0000000000001']){const n=fixture();n.executionFacts[0]['累计报废数量']=value;assert.ok(validateExecution(n).length,value);}
 const n=fixture();n.executionFacts[0]['报废补做口径']='自动认定合格';assert.ok(validateExecution(n).length);
});
test('FR031 overorder usable output is blocked while scrap never gives order qualified completion',()=>{
 const d=fixture();d.executionFacts[0]['工序完成数量']='101';assert.ok(validateExecution(d).some(i=>i.message.includes('超过订单需求')));const summary=executionSummary(fixture());assert.equal(summary.orderImpact[0].qualifiedCompleted,0);assert.equal(summary.orderImpact[0].remainingQualifiedOrder,100);
});
test('FR031 completed with scrap retains original actual interval and requires full replacement consumption',()=>{
 const d=fixture();Object.assign(d.executionFacts[0],{'状态':'已完成','工序完成数量':'100','完成分钟':'30','剩余工时分钟':'0'});d.executionMaterials[0]['累计已用数量']='110';assert.deepEqual(validateInputs(defs,d),[]);const p=run(d);assert.equal(p.tasks[0].start,0);assert.equal(p.tasks[0].end,30);assert.equal(p.materialDemands.length,0);assert.equal(p.execution.remaining[0].remainingQuantity,0);assert.deepEqual(p.execution.orderImpact[0].unfinishedOperations,['FILL']);
 d.executionMaterials[0]['累计已用数量']='100';assert.equal(run(d).tasks.length,0);
});
test('FR031 replacement is same-operation only and does not silently change downstream time',()=>{
 const d=fixture(),p=run(d);assert.equal(p.tasks[1].duration,30);assert.equal(p.execution.orderImpact[0].operations[1].remainingQuantity,100);assert.equal(p.execution.orderImpact[0].operations[1].scrapQuantity,0);assert.ok(p.execution.projectedTasks.some(t=>t.taskId==='A-FILL'&&t.start===50));
});
test('FR031 exact fractional scrap adds replacement material without float drift',()=>{
 const d=fixture();d.orders[0]['合格需求']='0.3';Object.assign(d.executionFacts[0],{'工序完成数量':'0.1','累计报废数量':'0.02'});d.executionMaterials[0]['累计已用数量']='0.12';Object.assign(d.inventory[0],{'账面数量':'0.32','已占用数量':'0'});assert.deepEqual(validateExecution(d),[]);const m=run(d).materialDemands[0];assert.equal(Q.cmp(Q.fromExact(m.exactQuantity),Q.q('0.2')),0n);assert.equal(m.shortage,0);
});
test('FR031 source aggregate with explicit conserved mapping is accepted and frozen in summary',()=>{
 const d=fixture();d.executionSources=[sourceFor(d)];assert.deepEqual(validateInputs(defs,d),[]);assert.deepEqual(run(d).execution.sources,d.executionSources);assert.deepEqual(executionTransition(d,structuredClone(d)),[]);
});
test('FR031 aggregate without explicit mapping is blocked instead of fabricating batch allocation',()=>{
 const d=fixture();d.executionSources=[{...sourceFor(d),'原始分配JSON':''}];assert.ok(validateExecution(d).some(i=>i.code==='EXECUTION_SOURCE_MAPPING_REQUIRED'));assert.equal(run(d).tasks.length,0);
});
test('FR031 aggregate mapping rejects mismatched sum, unit, lot, material, reference and duplicate records',()=>{
 const mutations=[s=>s['原始汇总耗料']='49',s=>s['耗料单位']='g',s=>s['事实编号']='missing',s=>s['原始任务编号']='',s=>s['原始分配JSON']=s['原始分配JSON'].replace('EX-LOT','guessed'),s=>s['原始分配JSON']=s['原始分配JSON'].replace('LEAN','guessed'),s=>s['原始分配JSON']=JSON.stringify([...JSON.parse(s['原始分配JSON']),...JSON.parse(s['原始分配JSON'])])];
 for(const mutate of mutations){const d=fixture(),s=sourceFor(d);mutate(s);d.executionSources=[s];assert.ok(validateExecution(d).some(i=>i.code==='EXECUTION_SOURCE_MAPPING_REQUIRED'));}
});
test('FR031 original multi-lot mapping is explicit, sums exactly and later cumulative correction preserves source',()=>{
 const d=fixture();d.inventory.push({...d.inventory[0],'批次编号':'EX-LOT2','账面数量':'100','已占用数量':'0'});d.executionMaterials[0]['累计已用数量']='30';d.executionMaterials.push({...d.executionMaterials[0],'记录编号':'C2','批次编号':'EX-LOT2','累计已用数量':'20'});const s=sourceFor(d);s['原始汇总耗料']='50';d.executionSources=[s];assert.deepEqual(validateExecution(d),[]);
 const next=structuredClone(d);next.executionMaterials[0]['累计已用数量']='40';assert.deepEqual(executionTransition(d,next),[]);assert.deepEqual(validateExecution(next),[]);assert.equal(next.executionSources[0]['原始汇总耗料'],'50');assert.equal(run(next).materialDemands[0].quantity,50);
});
test('FR031 source originals cannot be deleted or rewritten and duplicate task sources fail closed',()=>{
 const d=fixture();d.executionSources=[sourceFor(d)];for(const mutate of [n=>n.executionSources=[],n=>n.executionSources[0]['原始汇总耗料']='40',n=>n.executionSources[0]['原始分配JSON']='[]']){const n=structuredClone(d);mutate(n);assert.ok(executionTransition(d,n).length);assert.ok(executionTrialIssues(d,n).length);}
 d.executionSources.push({...d.executionSources[0],'来源编号':'duplicate-task'});assert.ok(validateExecution(d).length);
});
test('FR031 run snapshot freezes scrap, source and policy across newer corrections',()=>{
 const d=fixture();d.executionSources=[sourceFor(d)];const frozen=freezeRunInput(d,{},at);d.executionFacts[0]['累计报废数量']='20';d.executionFacts[0]['剩余工时分钟']='35';const p=calculate(frozen.executionData,0,at,frozen.conditions);assert.equal(p.execution.remaining[0].scrapQuantity,10);assert.equal(p.tasks[0].duration,20);assert.equal(p.execution.sources[0]['原始汇总耗料'],'50');assert.equal(frozen.conditions.executionSummary.remaining[0].scrapQuantity,10);
});

import {filterRows,related,queryCsv} from '../src/lib/data-query.mjs';
test('FR031 query follows explicit fact/source/consumption links and exports matching order only',()=>{
 const d=fixture();d.executionSources=[sourceFor(d)];assert.equal(filterRows(d,'executionSources',{order:'A'}).length,1);assert.equal(filterRows(d,'executionMaterials',{order:'A'}).length,1);assert.equal(filterRows(d,'executionSources',{product:'HC40'}).length,1);assert.equal(filterRows(d,'executionSources',{order:'other'}).length,0);assert.ok(related(d,'executionSources',0).some(x=>x.table==='executionFacts'));assert.ok(related(d,'executionFacts',0).some(x=>x.table==='executionSources'));assert.match(queryCsv(defs,d,[],1,{table:'executionSources',filters:{order:'A'}}),/UAT15-row1/);
});
import {executionMaterialDemand,calculateMaterialDemand} from '../src/lib/material-allocation.mjs';
test('FR031 explicit scrap replacement re-evaluates original BOM packaging rounding rather than scaling rounded quantities',()=>{
 const d=fixture();d.products[0]['单支净重kg']='1';d.products[0]['每袋支数']='1';d.bom.push({'版本编号':'EX-B1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'MIX','用量类型':'包材','物料编号':'BAG','配置用量':'1','用量单位':'个','用量基准':'每袋','收率/损耗口径备注':'','损坏比例':'0.1'});
 const demand=executionMaterialDemand(d,d.orders[0],'MIX',0);assert.equal(demand.find(m=>m.materialId==='BAG').quantity,123);assert.equal(demand.find(m=>m.materialId==='LEAN').quantity,110);const reference=calculateMaterialDemand(d,{...d.orders[0],'合格需求':'110'},'MIX',0);assert.deepEqual(demand.map(m=>m.exactQuantity),reference.map(m=>m.exactQuantity));
});
test('FR031 scrap units follow order piece conversion exactly without converting cumulative stock units',()=>{
 const d=fixture();d.orders[0]['数量单位']='支';d.executionFacts[0]['数量单位']='支';d.products[0]['单支净重kg']='0.5';d.executionMaterials[0]['累计已用数量']='25';assert.deepEqual(validateExecution(d),[]);const p=run(d);assert.equal(p.materialDemands[0].quantity,30);assert.equal(p.execution.remaining[0].remainingQuantity,60);assert.equal(p.execution.remaining[0].unit,'支');assert.equal(p.execution.orderImpact[0].remainingQualifiedOrder,100);
});
import fs from 'node:fs';
import {parseInputCsv} from '../src/lib/input-csv.mjs';
test('FR031 delivered quoted-JSON CSV samples roundtrip to explicitly mapped, conserved simulated execution',()=>{
 const d=fixture();for(const table of ['executionFacts','executionMaterials','executionSources']){const def=defs.find(d=>d.key===table),rows=parseInputCsv(fs.readFileSync(new URL('../docs/samples/fr031/'+def.file,import.meta.url),'utf8'));assert.deepEqual(rows[0],def.fields);d[table]=rows.slice(1).map(row=>Object.fromEntries(rows[0].map((field,i)=>[field,row[i]])));}assert.deepEqual(validateInputs(defs,d),[]);assert.equal(run(d).materialDemands[0].quantity,60);assert.equal(run(d).execution.sources[0]['原始汇总耗料'],'50');
});
