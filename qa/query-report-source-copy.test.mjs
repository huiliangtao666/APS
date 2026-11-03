import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../server/workbook-model.mjs';
import {applyParameters} from '../server/parameter-contract.mjs';
import {copyReportSource,sourceHash,sourceJsonBytes} from '../server/query-reports/source-copy.mjs';
import {createReportSnapshot,resolvedInput} from '../server/query-reports/context.mjs';

test('streaming source hash/bytes retain native JSON order and UTF-8 semantics',()=>{
  const values=[null,{},[],{z:'来源😀\n"\\',a:[null,undefined,-0,1e21,NaN,Infinity],missing:undefined},
    JSON.parse('{"__proto__":{"source":"原件"},"2":2,"1":1,"参数":false}')];
  for(const value of values){
    assert.equal(sourceHash(value),hash(value));
    assert.equal(sourceJsonBytes(value),Buffer.byteLength(JSON.stringify(value)));
    const copy=copyReportSource(value);assert.deepEqual(copy,value);
    if(value&&typeof value==='object')assert.notEqual(copy,value);
  }
});
test('detached sources retain every nested provenance field without freezing authority',()=>{
  const d={id:'copy',version:1,dayZero:'2026-10-31',mapping:{source:{row:null}},tables:{'配置参数':[]},
    parameterThreeWay:{sources:[{value:'完整来源',nested:{physicalRow:null}}]}};
  const before=hash(d),s=createReportSnapshot({dataset:d,datasetId:d.id,version:1},{read:true});
  assert.deepEqual(s.input,d);assert.equal(s.identity.inputHash,before);
  assert.equal(Object.isFrozen(d.parameterThreeWay),false);
  d.parameterThreeWay.sources[0].nested.physicalRow=91;
  assert.equal(s.input.parameterThreeWay.sources[0].nested.physicalRow,null);
  assert.throws(()=>{s.input.mapping.source.row=1;},TypeError);
});
test('parameter resolution preserves legacy values, base restoration and source isolation across days',()=>{
  const parameter=(id,value,from,to)=>({'参数编号':id,'对象编号':'FG','参数名称':'每箱净重千克','参数值':value,'生效日':from,'失效日':to,_sourceRole:'P'});
  const d={id:'resolved',version:1,dayZero:'2026-10-31',mapping:{source:{row:null}},parameterContract:'two-file',
    tables:{'物料主数据':[{'物料编号':'FG','每箱净重千克':'5',_source:{row:4}}],
      '配置参数':[parameter('P1','10',0,2),parameter('P2','20',2,4)],'工厂日历':[]},
    parameterBaseFields:[]};
  const original=hash(d),s=createReportSnapshot({dataset:d,datasetId:d.id,version:1},{read:true});
  for(const day of [1,3,5,1]){
    const expected=structuredClone(d);applyParameters(expected,day,'dataset');
    const actual=resolvedInput(s,day);assert.deepEqual(actual,expected);
    assert.equal(resolvedInput(s,day),actual);
    assert.throws(()=>{actual.tables['物料主数据'][0]['每箱净重千克']='corrupt';},TypeError);
    assert.equal(hash(d),original);assert.equal(hash(s.input),original);
  }
});
