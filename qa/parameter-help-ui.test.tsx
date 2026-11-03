import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ParameterHelp,ParameterValueInput} from '../src/ParameterHelp';
import {ParameterMaintenanceView} from '../src/ParameterMaintenanceView';
import {parameterHelp} from '../server/parameter-help.mjs';
import {parameterCatalog,specification} from '../server/parameter-contract.mjs';
const help=(name:string)=>{const spec=specification(name)!;return parameterHelp(parameterCatalog.find(c=>c['参数编号']===spec.cp)!,spec);};
test('every editable, readonly and missing value has a compact, keyboard-focusable help trigger',()=>{
 const cells=['R1','R2','R3'].map((id,i)=>({cp:'CP099',recordKey:id,'参数名称':'可用数量',effectiveValue:i===2?undefined:String(i),'单位':'个',status:i===2?'未维护':'当前有效',editable:i!==1}));
 const view={layout:'objects',cp:'CP099',fields:['可用数量'],definitions:[],helpByField:{'CP099|可用数量':help('可用数量')},objectRows:cells.map(c=>({id:c.recordKey,object:c.recordKey,name:c.recordKey,cells:[c]}))};
 const html=renderToStaticMarkup(<ParameterMaintenanceView view={view} canWrite onEdit={()=>{}} onRelation={()=>{}}/>);
 assert.equal((html.match(/class="parameter-help-trigger"/g)||[]).length,3);assert.ok(html.includes('参数说明：可用数量'));assert.ok(html.includes('填写'));assert.ok(!html.includes('role="tooltip"'));
});
test('all enum values become real choices and 0/1 are not silently introduced',()=>{
 const html=renderToStaticMarkup(<ParameterValueInput help={help('资源占用方式')} field="资源占用方式" value="" onChange={()=>{}}/>);
 assert.ok(html.includes('<select'));for(const v of ['独占','重量共享','重量容量共享'])assert.ok(html.includes('value="'+v+'"'));
 assert.ok(!html.includes('value="0"'));assert.ok(!html.includes('value="1"'));assert.ok(html.includes('请选择资源占用方式'));
 const old=renderToStaticMarkup(<ParameterValueInput help={help('资源占用方式')} field="资源占用方式" value="OLD" onChange={()=>{}}/>);assert.ok(old.includes('原值不受支持，请重选'));
});
test('numeric drafts remain numeric literals, including explicit zero and decimal text',()=>{
 const html=renderToStaticMarkup(<ParameterValueInput help={help('到货剩余保质比例')} field="到货剩余保质比例" value="0.5" onChange={()=>{}}/>);assert.ok(html.includes('value="0.5"'));assert.ok(html.includes('inputMode="decimal"'));assert.ok(!html.includes('<select'));
 assert.ok(renderToStaticMarkup(<ParameterValueInput help={help('生产班次数')} field="生产班次数" value="0" onChange={()=>{}}/>).includes('value="0"'));
 assert.ok(renderToStaticMarkup(<ParameterHelp help={help('生产班次数')}/>).includes('aria-expanded="false"'));
});
