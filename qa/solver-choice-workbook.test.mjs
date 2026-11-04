// Source only in this delivery. Execute only after #140 final release and the
// original owner's admitted finite window; this file does not imply admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {urgentFixture,selection} from './urgent-order-fixture.mjs';
import {compileWorkbookModel} from '../server/solver-choice/workbook-compiler.mjs';
import {decodeWorkbookCandidate} from '../server/solver-choice/workbook-decoder.mjs';
import {checkWorkbookCandidate} from '../server/solver-choice/workbook-checker.mjs';
import {verifyWorkbookPlan} from '../server/workbook-plan.mjs';
import {refreshDerived} from '../server/workbook-model.mjs';
import {runCpSat} from '../server/solver-choice/runner.mjs';
import {fingerprint} from '../server/solver-choice/contract.mjs';
const admitted=Boolean(process.env.APS_SOLVER141_RUNTIME_FILE);
function input(){const d=urgentFixture();d.tables['配置参数'].push({'参数编号':'CP101','对象编号':'GLOBAL','参数名称':'标准生产批量千克','参数值':'1000','单位':'千克','生效日':'0','失效日':'44',_row:3});return d;}
function compile(d){return compileWorkbookModel(d,selection,{inputHash:fingerprint(d),selectionHash:fingerprint(selection),objective:{kind:'feasibility',source:'独立合成夹具；无优化目标'}});}
test('REAL native workbook obligations: selected demands and returned assignments survive decoder/business checker',{skip:!admitted},async()=>{
 const d=input(),m=compile(d),r=await runCpSat(m,JSON.parse(fs.readFileSync(process.env.APS_SOLVER141_RUNTIME_FILE,'utf8')));
 assert.ok(r.candidate,'Must obtain a real native witness, never a manually injected plan');
 const check=checkWorkbookCandidate(m,r.candidate);assert.equal(check.status,'pass',check.issues.join(';'));
 const p=decodeWorkbookCandidate(d,selection,r.candidate,m),business=verifyWorkbookPlan(d,p);assert.equal(business.status,'pass',business.issues.join(';'));
 assert.equal(p.demandResults.length,3);assert.equal(p.demandSummary.totalKg,18);
 assert.ok(p.tasks.every(t=>r.candidate.tasks.some(x=>x.id===t.id&&x.start===t.start&&x.end===t.end)));
 const corrupt=structuredClone(r.candidate);corrupt.demands[0].scheduledQuantity=m.demands[0].quantity+1;
 assert.equal(checkWorkbookCandidate(m,corrupt).status,'problem');
});
test('REAL native workbook decimal/BOM/FEFO: no rounding, lot duplication or fabricated coverage',{skip:!admitted},async()=>{
 const d=input();d.tables['每日需求']=[{...d.tables['每日需求'][2],'需求箱数':'0.125'}];refreshDerived(d,1);
 const lot=d.tables['期初库存'].find(x=>x['物料编号']==='RM3');lot['当前数量']='0.250';d.tables['期初库存'].push({...lot,'库存批次编号':'LOT-RM3-LATER','当前数量':'0.500','到期日':'44',_row:99});
 const m=compile(d),r=await runCpSat(m,JSON.parse(fs.readFileSync(process.env.APS_SOLVER141_RUNTIME_FILE,'utf8')));assert.ok(r.candidate);
 const check=checkWorkbookCandidate(m,r.candidate);assert.equal(check.status,'pass',check.issues.join(';'));
 const p=decodeWorkbookCandidate(d,selection,r.candidate,m);assert.equal(p.demandSummary.totalKg,0.75);
 assert.equal(p.allocations.filter(a=>a.materialId==='RM3').reduce((n,a)=>n+a.quantity,0),0.75);assert.equal(p.allocations.find(a=>a.supplyId==='inventory:LOT-RM3').quantity,0.25);
 assert.equal(verifyWorkbookPlan(d,p).status,'pass');
});
