import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ParameterHelp,ParameterValueInput} from '../src/ParameterHelp';
import {ParameterMaintenanceView} from '../src/ParameterMaintenanceView';
import {parameterHelp} from '../server/parameter-help.mjs';
import {parameterCatalog,specification} from '../server/parameter-contract.mjs';
const help=(name:string)=>{const spec=specification(name)!;return parameterHelp(parameterCatalog.find(c=>c['参数编号']===spec.cp)!,spec);};
test('editable, readonly and missing values share one explanation at the field heading',()=>{
 const cells=['R1','R2','R3'].map((id,i)=>({cp:'CP099',recordKey:id,'参数名称':'可用数量',effectiveValue:i===2?undefined:String(i),'单位':'个',status:i===2?'未维护':'当前有效',editable:i!==1}));
 const view={layout:'objects',cp:'CP099',fields:['可用数量'],definitions:[],helpByField:{'CP099|可用数量':help('可用数量')},objectRows:cells.map(c=>({id:c.recordKey,object:c.recordKey,name:c.recordKey,cells:[c]}))};
 const html=renderToStaticMarkup(<ParameterMaintenanceView view={view} canWrite onEdit={()=>{}} onRelation={()=>{}}/>);
 assert.equal((html.match(/class="parameter-help-trigger"/g)||[]).length,1);assert.ok(html.includes('参数说明：可用数量'));assert.ok(html.includes('填写'));assert.ok(!html.includes('role="tooltip"'));
 assert.ok(/<th>可用数量<button/.test(html));assert.ok(!/class="parameter-value-cell"[^]*?parameter-help-trigger/.test(html));
});
test('thirty calendar dates share one explanation per distinct field in the section heading',()=>{
 const fields=['生产班次数','日产能分母'],objectRows=Array.from({length:30},(_,i)=>({id:String(i),date:'2026-11-'+String(i+1).padStart(2,'0'),cells:fields.map(field=>({cp:'CP132','参数名称':field,recordKey:field+i,effectiveValue:'1',status:'当前有效',editable:true}))}));
 const view={layout:'calendar',cp:'CP132',fields,month:'2026-11',objectRows,helpByField:Object.fromEntries(fields.map(f=>['CP132|'+f,help(f)]))};
 const render=(v:any)=>renderToStaticMarkup(<ParameterMaintenanceView view={v} canWrite onEdit={()=>{}} onRelation={()=>{}}/>);
 const html=render(view);assert.equal((html.match(/parameter-help-trigger/g)||[]).length,2);assert.equal((html.match(/parameter-calendar-day/g)||[]).length,30);
 assert.ok(!html.slice(html.indexOf('class="parameter-calendar"')).includes('parameter-help-trigger'));
 assert.equal((render({...view,fields:fields.slice(0,1)}).match(/parameter-help-trigger/g)||[]).length,1);
});
test('list explanations stay next to names and deduplicate repeated objects',()=>{
 const objectRows=['R1','R2'].map(id=>({id,object:id,cells:[{cp:'CP099','参数名称':'可用数量',effectiveValue:'1',status:'当前有效',editable:true}]}));
 const html=renderToStaticMarkup(<ParameterMaintenanceView view={{layout:'list',objectRows,helpByField:{'CP099|可用数量':help('可用数量')}}} canWrite onEdit={()=>{}} onRelation={()=>{}}/>);
 assert.equal((html.match(/parameter-help-trigger/g)||[]).length,1);
 const trigger=renderToStaticMarkup(<ParameterHelp help={help('生产班次数')}/>);assert.ok(trigger.includes('>!</button>'));assert.ok(!trigger.includes('<span'));
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
