import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {instantMinute,minuteTime,eventPeak,unionMinutes,routeMinutes,knownMinuteStops,MINUTE_ORIGIN} from '../server/workbook-minute.mjs';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {workbookSchema,refreshDerived,hash} from '../server/workbook-model.mjs';
import {prepareBusinessImport,checkSelection} from '../server/workbook-workbench.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {validateAtomic,specification,adoptDefinitionBounds} from '../server/parameter-contract.mjs';

test('MC001/MC002 minute fidelity and half-open participation have independent expected values',()=>{
 const a=instantMinute('2026.11.01 08:07'),b=instantMinute('2026.11.01 08:24'),c=instantMinute('2026.11.01 08:41');
 assert.deepEqual([a,b,c],[1927,1944,1961]);assert.equal(b-a,17);
 assert.equal(minuteTime(a,MINUTE_ORIGIN),'2026.11.01 08:07');
 assert.equal(eventPeak([{start:a,end:b,amount:2},{start:b,end:c,amount:3}]),3);
 assert.equal(eventPeak([{start:a,end:b,amount:2},{start:b,end:c,amount:3},{start:1937,end:1950,amount:1}]),4);
 assert.equal(unionMinutes([{start:a,end:b},{start:b,end:c}]),34);
});
test('midnight is an exclusive instant and does not lose the following day',()=>{
 const a=instantMinute('2026.11.01 23:45'),b=instantMinute('2026.11.02 00:15');
 assert.equal(b-a,30);assert.equal(unionMinutes([{start:a,end:b}],1440,2880),15);assert.equal(unionMinutes([{start:a,end:b}],2880,4320),15);
 assert.throws(()=>instantMinute('2026-11-01T08:07:30+08:00'),/整数分钟/);
});
test('fixed duration is not scaled by quantity and minimum is not added twice',()=>{
 const r={'工时模型':'固定连续历时','基准加工分钟':'1440','固定准备分钟':'0','最短工艺分钟':'1440','基准加工量千克':'500'};
 assert.equal(routeMinutes(r,100),1440);
 assert.equal(routeMinutes({...r,'工时模型':'按量加工','基准加工分钟':'160','固定准备分钟':'15','最短工艺分钟':'0'},250),95);
});
test('minute knowledge boundary is 09:17, not the beginning of that day',()=>{
 const d={tables:{'停机安排':[{'停机编号':'DT004','资源编号':'EQ001','信息可知时刻':'2026.11.15 09:17','开始分钟偏移':'22157','结束分钟偏移':'22202'}]}};
 assert.equal(knownMinuteStops(d,instantMinute('2026.11.15 09:16')).length,0);
 assert.equal(knownMinuteStops(d,instantMinute('2026.11.15 09:17')).length,1);
});
test('V2 enum rules are explicit and CP016 expression still rejects zero/negative',()=>{
 assert.equal(validateAtomic(specification('工时模型'),'按量加工'),'按量加工');assert.throws(()=>validateAtomic(specification('工时模型'),'猜测'));
 const d={};for(const n of [0,-1])assert.throws(()=>adoptDefinitionBounds(d,{'对象编号':'X','参数名称':'每箱净重千克','参数值':String(n),'单位':'千克/箱'}));
 assert.doesNotThrow(()=>adoptDefinitionBounds(d,{'对象编号':'X','参数名称':'每箱净重千克','参数值':'10','单位':'千克/箱'}));
});

// No private workbooks are committed. This is an opt-in input/integration check,
// not a Worker run and not permission to retry a latched OOM or exhausted window.
test('private V2 full import and both file orders resolve the same adopted values',{skip:!process.env.APS_V2_BUSINESS_FILE||!process.env.APS_V2_PARAMETER_FILE},()=>{
 const b=fs.readFileSync(process.env.APS_V2_BUSINESS_FILE),p=fs.readFileSync(process.env.APS_V2_PARAMETER_FILE),bp=parseWorkbook(b,workbookSchema),pp=parseWorkbook(p,workbookSchema);
 assert.deepEqual(bp.issues,[]);assert.deepEqual(pp.issues,[]);assert.equal(pp.parameterCounts.definitions,181);assert.equal(pp.parameterCounts.instances,4862);
 const business=()=>({...bp,id:'V2',name:'Private V2',version:1,profile:'excel-qualified-output-202611-r1',fileHash:hash(b),drafts:[]});
 const adopt=old=>integrateParameterImport(pp,old,{id:'V2',name:'Private V2',expectedVersion:old?.version||0,fileHash:hash(p),adoptParameters:true,actor:'owner'});
 const forward=adopt(prepareBusinessImport(business(),null));assert.deepEqual(forward.issues,[]);
 const inverse=adopt(null);assert.deepEqual(inverse.issues,[]);
 const a=refreshDerived(forward.d,1),z=refreshDerived(prepareBusinessImport(business(),inverse.d),1);
 const values=d=>d.effectiveParameters.values.map(v=>[v.object,v.field,v.value,v.sourceRole]).sort();assert.deepEqual(values(a),values(z));
 for(const d of [a,z])assert.equal(checkSelection(d,{selection:{startDay:1,endDay:15,currentDay:1}},'owner').ready,true);
});
