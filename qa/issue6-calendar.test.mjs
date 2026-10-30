import test from 'node:test';import assert from 'node:assert/strict';
import {verifyCalendar} from '../src/lib/verify-calendar.mjs';
import {problemInterval} from '../src/lib/task-linkage.mjs';
const at='2026-10-30T00:00:00.000Z';
const conditions={mode:'supported',ruleEvaluationAt:at,enabledRuleIds:['CALENDAR']};
const source=()=>({orders:[{'订单编号':'B','产线编号':'L01'}],factoryLines:[{'产线编号':'L01','工厂编号':'F01'}],machines:[{'设备编号':'MIX02','产线编号':'L01','日历编号':'FC01'}],calendars:[{'日历编号':'FC01','工厂编号':'F01','起始分钟':'0','结束分钟':'600','是否工作':'是'}],downtime:[{'设备编号':'MIX02','起始分钟':'0','结束分钟':'15'}],rules:[{'规则编号':'CALENDAR','是否启用':'是','参数JSON':'{}'}]});
const plan=(start=15)=>({id:'P',rules:['CALENDAR'],conditions,tasks:[{id:'B-MIX',orderId:'B',operation:'MIX',machine:'MIX02',start,end:start+30}]});
const check=(p,d,c=conditions)=>verifyCalendar(p,d,c,p.rules);
test('fixed 14 invalid, 15 legal, half open and real geometry with frozen input only',()=>{
 const d=source(),bad=plan(14),v=check(bad,d);assert.equal(v.status,'problem');assert.deepEqual(v.findings[0].taskIds,['B-MIX']);assert.equal(v.findings[0].interval.start,14);assert.equal(v.findings[0].interval.end,15);assert.equal(check(plan(15),d).status,'pass');
 assert.equal(problemInterval({...bad,inputSnapshot:d},v.findings[0]).kind,'calendar');assert.equal(problemInterval({...bad,tasks:[] ,inputSnapshot:d},v.findings[0]),null);assert.equal(problemInterval({...bad,inputSnapshot:null},v.findings[0]),null);
 const end=plan(570);assert.equal(check(end,d).status,'pass');end.tasks[0].end=601;assert.equal(check(end,d).status,'problem');
});
test('factory off, continuous no splitting, bad/unknown times and references are never passes',()=>{
 for(const mutate of [d=>d.calendars.push({...d.calendars[0],'起始分钟':'20','结束分钟':'25','是否工作':'否'}),d=>d.calendars=[{...d.calendars[0],'结束分钟':'20'},{...d.calendars[0],'起始分钟':'25','结束分钟':'45'}],d=>d.calendars=[],d=>d.machines=[],d=>d.calendars[0]['起始分钟']='',d=>d.downtime[0]['结束分钟']='unknown',d=>d.calendars[0]['是否工作']='未知',d=>d.machines[0]['日历编号']='missing',d=>d.factoryLines.push({'产线编号':'L01','工厂编号':'F02'})]){const d=source();mutate(d);assert.equal(check(plan(),d).status,'problem');}
 for(const value of ['',null,'unknown',Infinity]){const p=plan();p.tasks[0].start=value;assert.equal(check(p,source()).status,'problem');}
});
test('unique factory inheritance allowed; ambiguous inheritance is rejected',()=>{
 const d=source();d.machines[0]['日历编号']='';assert.equal(check(plan(),d).status,'pass');d.calendars.push({...d.calendars[0],'日历编号':'FC02'});assert.equal(check(plan(),d).status,'problem');
});
test('AC15 closed/future/missing/invalid rule, unknown parameters and adopted mismatch; minimal and history explicitly unchecked',()=>{
 for(const mutate of [d=>d.rules=[],d=>d.rules[0]['是否启用']='否',d=>d.rules[0]['生效时间']='2030-01-01T00:00:00Z',d=>d.rules[0]['生效时间']='2026-02-30T00:00:00Z',d=>d.rules[0]['参数JSON']='{"中断":true}',d=>d.rules[0]['适用对象']='MIX02',d=>d.rules.push({...d.rules[0]})]){const d=source();mutate(d);assert.equal(check(plan(),d).status,'problem');}
 const p=plan();p.rules=[];assert.equal(check(p,source()).status,'problem');assert.equal(check(plan(),null).status,'not_checked');assert.equal(check(plan(),source(),{...conditions,mode:'minimal-r1'}).status,'not_checked');assert.equal(check(plan(),source(),{}).status,'not_checked');assert.equal(check({...plan(),tasks:[]},source()).status,'not_checked');
});
test('protected execution facts retain original interval; calendar checks saved remaining plan without mutation',()=>{
 const d=source();d.executionFacts=[{'事实编号':'F','订单编号':'B','工序编号':'MIX','开始分钟':'0','观测分钟':'15'}];const before=JSON.stringify(d),v=check(plan(),d);assert.equal(v.status,'pass');assert.equal(v.inspections[0].protectedExecution.start,'0');assert.equal(JSON.stringify(d),before);
});

test('independent report preserves unknown enabled rule as not_checked',async()=>{
 const {independentlyVerifyPlan}=await import('../src/lib/independent-verification.mjs');const d=source();d.rules.push({'规则编号':'UNKNOWN','是否启用':'是','参数JSON':'{}'});const p=plan();p.rules.push('UNKNOWN');const v=independentlyVerifyPlan(p,d.orders,[],p.rules,at,d,conditions);assert.equal(v.ruleStatuses.find(r=>r.id==='UNKNOWN').status,'not_checked');assert.equal(v.ruleStatuses.find(r=>r.id==='UNKNOWN').supported,false);
});
