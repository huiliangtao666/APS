import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkbook} from '../server/workbook-model.mjs';
const parameter=(id,field,value,unit,object='GLOBAL')=>({'参数编号':id,'对象编号':object,'参数名称':field,'参数值':value,'单位':unit,'生效日':'0','失效日':'44',_sourceRole:'P'});
const dataset=rows=>({parameterContract:'CR-PARAM-UI-20261101:r1',tables:{'配置参数':rows.map((r,i)=>({...r,_row:i+3}))}});
test('typed workbook parameters retain minute enums and identity while rejecting exact invalid fields',()=>{
 const d=dataset([parameter('MODEL','工时模型','固定连续历时','枚举','ROUTE'),parameter('ORIGIN','分钟原点','2026-10-31T00:00:00+08:00','日期时刻'),parameter('COUNT','可用数量','1','个','EQ')]);
 assert.deepEqual(validateWorkbook(d,{completeness:false}),[]);
 d.tables['配置参数'][0]['参数值']='未知模型';d.tables['配置参数'][2]['参数值']='one';
 const issues=validateWorkbook(d,{completeness:false});
 assert.ok(issues.some(i=>i.code==='PARAMETER_INVALID'&&i.record==='MODEL'&&i.field==='参数值'&&i.message==='工时模型须为按量加工/固定连续历时'));
 assert.ok(issues.some(i=>i.code==='PARAMETER_INVALID'&&i.record==='COUNT'&&i.field==='参数值'&&i.message==='须为有限数值字面值；空白不代表0'));
 assert.equal(issues.length,2);
 console.log('REJECTION_FACTS '+JSON.stringify(issues));
});
test('typed workbook delegation retains legacy numeric-column rejection',()=>{
 const d=dataset([parameter('MODEL','工时模型','固定连续历时','枚举','ROUTE')]);delete d.parameterContract;
 assert.ok(validateWorkbook(d,{completeness:false}).some(i=>i.code==='INPUT_INVALID'&&i.record==='MODEL'&&i.field==='参数值'&&i.message==='须为有限数值'));
});
