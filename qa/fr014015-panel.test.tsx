import test from 'node:test';import assert from 'node:assert/strict';import {create,act} from 'react-test-renderer';
import {DataQueries} from '../src/DataQueries';import {StructuredValue} from '../src/StructuredValue';
test('current CSV source and saved-plan source resolve different identities and never silently exchange provenance',()=>{
 const old={'订单编号':'A','合格需求':'111'},current={'订单编号':'A','合格需求':'222'},props={data:{orders:[current]},plans:[{id:'p',tasks:[],inputSnapshot:{orders:[old]},inputVersionId:'old-sha'}],initialPlan:'p',initialTable:'orders',revision:2,canExport:false,reason:'',onExport:()=>{},onTask:()=>{}};
 let tree:any;act(()=>{tree=create(<DataQueries {...props} initialHistorical={false} initialRow={current}/>);});assert.ok(JSON.stringify(tree.toJSON()).includes('222'));assert.ok(!JSON.stringify(tree.toJSON()).includes('111'));tree.unmount();
 act(()=>{tree=create(<DataQueries {...props} initialHistorical={true} initialRow={old}/>);});assert.ok(JSON.stringify(tree.toJSON()).includes('111'));assert.ok(!JSON.stringify(tree.toJSON()).includes('222'));tree.unmount();
});
test('ordinary structured configuration edits retain nested string/boolean/number values without raw JSON entry',()=>{
 let result='';let tree:any;act(()=>{tree=create(<StructuredValue field="参数JSON" label="模拟参数" value={'{"允许预计供给":false,"资源":{"数量":3},"可用状态":["合格"]}'} disabled={false} onChange={v=>{result=v;}}/>);});
 const byLabel=(label:string)=>tree.root.findByProps({'aria-label':label});act(()=>byLabel('模拟参数 允许预计供给').props.onChange({target:{value:'true'}}));assert.equal(JSON.parse(result)['允许预计供给'],true);
 act(()=>byLabel('模拟参数 资源 数量').props.onChange({target:{value:'4'}}));assert.equal(JSON.parse(result)['资源']['数量'],4);assert.deepEqual(JSON.parse(result)['可用状态'],['合格']);tree.unmount();
});

test('new empty source allocation can create its first field group through ordinary controls',()=>{
 let result='';let tree:any;act(()=>{tree=create(<StructuredValue field="原始分配JSON" label="来源原始分配" value="[]" disabled={false} onChange={v=>{result=v;}}/>);});
 act(()=>tree.root.findByProps({'aria-label':'来源原始分配 新项目类型'}).props.onChange({target:{value:'字段组'}}));
 act(()=>tree.root.findAllByType('button').find((b:any)=>b.children.join('')==='添加一项 来源原始分配').props.onClick());
 assert.deepEqual(JSON.parse(result),[{}]);tree.unmount();
});
