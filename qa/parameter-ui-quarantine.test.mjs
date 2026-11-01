import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {workbookSchema,refreshDerived,hash} from '../server/workbook-model.mjs';
import {supplyReadiness,supplyLots} from '../server/workbook-supply.mjs';
import {calculateWorkbook} from '../server/workbook-plan.mjs';
const fixture=process.env.PARAMETER_FIXTURE;
test('IN22: quarantined unknown release stays unavailable without blocking qualified inputs',()=>{
 const d=refreshDerived({...parseWorkbook(fs.readFileSync(fixture+'/supply/small.xlsx'),workbookSchema),id:'QUARANTINE',version:1,mapping:JSON.parse(fs.readFileSync(fixture+'/supply/mapping.json'))});
 const lot=d.tables['期初库存'][0];lot['质量状态']='待检';lot['放行日']='';
 assert.equal(supplyReadiness(d).ready,true,JSON.stringify(supplyReadiness(d).issues));
 const unavailable=supplyLots(d).find(r=>r.id==='inventory:'+lot['库存批次编号']);assert.equal(unavailable.quality,false);assert.equal(unavailable.ready,null);
 const before=hash(d),plan=calculateWorkbook(d,{startDay:3,endDay:8,currentDay:3});assert.equal(plan.verification.status,'pass');assert.ok(!plan.allocations.some(a=>a.supplyId===unavailable.id));assert.equal(hash(d),before);
 lot['质量状态']='已放行';assert.equal(supplyReadiness(d).ready,false);assert.throws(()=>calculateWorkbook(d,{startDay:3,endDay:8,currentDay:3}),/尚未就绪/);
 lot['质量状态']='待检';lot['放行日']='invalid';assert.equal(supplyReadiness(d).ready,false);
 lot['放行日']='0';assert.equal(supplyReadiness(d).ready,true);assert.equal(supplyLots(d).find(r=>r.id===unavailable.id).quality,false);
});
