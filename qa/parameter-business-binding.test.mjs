import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBusinessImport} from '../server/workbook-workbench.mjs';
import {refreshDerived,validateWorkbook,hash,workbookSchema} from '../server/workbook-model.mjs';
import {parameterIssues} from '../server/parameter-contract.mjs';
const p=(id,object,field,value,unit)=>({'参数编号':id,'对象编号':object,'参数名称':field,'参数值':value,'单位':unit,'生效日':'0','失效日':'44',_row:3});
test('supported business semantics override crossed formula positions and retain numeric B fallback at expiry',()=>{
 const raw={id:'B',fileHash:'B',tables:{'配置参数':[p('LO','LOC','最低温度','0','摄氏度'),p('HI','LOC','最高温度','4','摄氏度'),p('WRONG','ROUTE','工时模型','固定连续历时','枚举'),p('STD','CAL','标准日班次数','2','班/天'),p('SUN','CAL','周日班次数','1','班/天'),p('META','GLOBAL','未支持元数据','否','枚举')],'库区库位':[{'库位编号':'LOC','最低温度':'固定连续历时','最高温度':'4',_row:3,_formulas:{'最低温度':"'配置参数'!E5"}}],'工厂日历':[{'日序':'0','公历日期':'20261031','生产班次数':'固定连续历时','日产能分子':'固定连续历时','日产能分母':'固定连续历时',_row:3}]},bindings:[{sheet:'库区库位',row:3,recordKey:'LOC',field:'最低温度',parameterId:'WRONG'},...['生产班次数','日产能分子','日产能分母'].map(field=>({sheet:'工厂日历',row:3,recordKey:'0',field,parameterId:'WRONG'}))]};
 const before=hash(raw),d=prepareBusinessImport(raw,null);refreshDerived(d,0);
 assert.equal(d.tables['库区库位'][0]['最低温度'],'0');assert.equal(d.tables['工厂日历'][0]['日产能分母'],'2');
 assert.equal(d.warnings.filter(w=>w.code==='PARAMETER_BINDING_SEMANTIC').length,4);
 assert.equal(d.tables['配置参数'].find(p=>p['参数编号']==='META')._candidate,true);
 assert.deepEqual(parameterIssues(d,{completeness:false}),[]);
 refreshDerived(d,44);assert.equal(d.tables['库区库位'][0]['最低温度'],'0');assert.equal(d.tables['工厂日历'][0]['日产能分母'],'2');
 assert.deepEqual(parameterIssues(d,{completeness:false}),[]);assert.equal(hash(raw),before);
});
test('entity tool key permits one pool with several tools and rejects a duplicate physical tool',()=>{
 assert.equal(workbookSchema.tables['工装资源池'].key,'实体工装编号');
 const d={tables:{'工装资源池':[{'资源池编号':'GROUP','实体工装编号':'T1',_row:3},{'资源池编号':'GROUP','实体工装编号':'T2',_row:4}]}};
 assert.deepEqual(validateWorkbook(d,{completeness:false}),[]);
 d.tables['工装资源池'][1]['实体工装编号']='T1';assert.ok(validateWorkbook(d,{completeness:false}).some(i=>i.sheet==='工装资源池'&&i.field==='实体工装编号'&&i.message==='重复唯一编号'));
});
