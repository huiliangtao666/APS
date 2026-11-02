import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneForParameters,computationInput} from '../server/workbook-workbench.mjs';
import {refreshDerived,hash} from '../server/workbook-model.mjs';
const parameter=(role,value,scope='dataset')=>({'参数编号':role+scope,'对象编号':'L','参数名称':'最低温度','参数值':value,'单位':'摄氏度','生效日':'0','失效日':'44',_sourceRole:role,_scope:scope});
function example(){return {id:'D',version:2,parameterContract:'CR-PARAM-UI-20261101:r1',parameterBaseFields:[],tables:{'配置参数':[parameter('B','0'),parameter('P','2'),parameter('EDIT','3','trial:owner:one')],'库区库位':[{'库位编号':'L','最低温度':'0',_cells:{'最低温度':'C3'}}],'关键路径明细':[{raw:'unchanged',_formulas:{raw:'=original'}}]},mapping:{mock:true,source:'literal'},bindings:[]};}
test('parameter projection matches full clone for dataset, trial and expired day; isolates all mutable fields',()=>{
 for(const scope of ['dataset','trial:owner:one'])for(const day of [1,44]){
  const original=example(),before=hash(original),expected=structuredClone(original),actual=cloneForParameters(original);
  for(const d of [expected,actual]){d.parameterContext={scope,effectiveDay:day};refreshDerived(d,day);}
  assert.deepEqual(actual,expected);assert.equal(hash(actual),hash(expected));assert.equal(hash(original),before);
  assert.notEqual(actual.tables['库区库位'],original.tables['库区库位']);assert.notEqual(actual.tables['库区库位'][0]._cells,original.tables['库区库位'][0]._cells);
  assert.equal(actual.tables['关键路径明细'],original.tables['关键路径明细']);assert.equal(computationInput(actual).tables['关键路径明细'],undefined);
 }
});
test('legacy day derivation preserves references and original frozen bytes',()=>{
 const original={id:'legacy',tables:{'配置参数':[{'参数编号':'P','对象编号':'L','参数名称':'最低温度','参数值':'4','生效日':'0','失效日':'44'}],'库区库位':[{'库位编号':'L','最低温度':'0',_row:3}],'unknown-reference':[{raw:'retained'}]},bindings:[{sheet:'库区库位',recordKey:'L',field:'最低温度',parameterId:'P'}]};
 const before=hash(original),expected=refreshDerived(structuredClone(original),1),actual=refreshDerived(cloneForParameters(original),1);
 assert.deepEqual(actual,expected);assert.equal(hash(original),before);assert.equal(actual.tables['库区库位'][0]['最低温度'],'4');assert.equal(actual.tables['unknown-reference'],original.tables['unknown-reference']);
});
