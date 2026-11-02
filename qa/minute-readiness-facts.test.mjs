import test from 'node:test';import assert from 'node:assert/strict';
import {selectedFactIssues} from '../server/workbook-selection.mjs';
import {parameterIssues} from '../server/parameter-contract.mjs';
const blocked=(id,object,field,unit)=>({'参数编号':id,'对象编号':object,'参数名称':field,'参数值':'','单位':unit,'生效日':'0','失效日':'44',_blocked:true,_sourceRole:'P'});
test('minute readiness keeps day-lead proposals pending while requiring actual minute fields',()=>{
 const d={productionContract:'workbook-minute-v2',tables:{'配置参数':[blocked('DAY','FG','生产提前期天数','天'),blocked('WAIT','R','最大等待分钟','分钟')],'物料主数据':[{'物料编号':'FG'}],'工艺路线':[{'路线工序编号':'R'}]}};
 const issues=parameterIssues(d);assert.ok(!issues.some(i=>i.record==='DAY'&&i.code==='PARAMETER_REQUIRED'));assert.ok(issues.some(i=>i.record==='WAIT'&&i.code==='PARAMETER_REQUIRED'));assert.equal(d.tables['配置参数'][0]._blocked,true);assert.equal(d.tables['配置参数'][0]['参数值'],'');
 delete d.productionContract;assert.ok(parameterIssues(d).some(i=>i.record==='DAY'&&i.code==='PARAMETER_REQUIRED'));
});
test('minute readiness requires demanded box weight but not boxed semifinished or legacy day duration',()=>{
 const d={productionContract:'workbook-minute-v2',_selectionClosure:{materialIds:['FG','SF']},tables:{'每日需求':[{'成品编号':'FG','需求箱数':'1','需求千克':'6','最早到货日':'1','最晚到货日':'2','按要求日最晚发运日':'1','到货剩余保质天数':'1'}],'物料主数据':[{'物料编号':'FG','物料来源':'制造','保质天数':'7','每箱净重千克':'6'},{'物料编号':'SF','物料来源':'制造','保质天数':'2'}]}};
 assert.deepEqual(selectedFactIssues(d),[]);
 d.tables['物料主数据'][0]['每箱净重千克']='';const bad=selectedFactIssues(d);assert.equal(bad.length,1);assert.equal(bad[0].record,'FG');assert.equal(bad[0].field,'每箱净重千克');
 delete d.productionContract;assert.ok(selectedFactIssues(d).some(i=>i.record==='SF'&&i.field==='生产提前期天数'));
});
