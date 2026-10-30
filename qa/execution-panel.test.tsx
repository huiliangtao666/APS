import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {ExecutionPanel} from '../src/ExecutionPanel';
import {DataEditor} from '../src/DataEditor';
import {defs} from '../src/data-defs';
const fact={'事实编号':'F1','订单编号':'A','工序编号':'MIX','状态':'部分完成','开始分钟':'0','完成分钟':'','观测分钟':'30','工序完成数量':'40','数量单位':'kg','剩余工时分钟':'20','当前设备':'MIX01','暂停原因':''};
const data={orders:[{'订单编号':'A','合格需求':'100'}],executionFacts:[fact],executionMaterials:[],inventory:[{'批次编号':'LOT','账面数量':'120','已占用数量':'10'}]};
test('FR012 UI current remaining, original correction history, historical snapshot and simulation boundaries remain visible',()=>{
 const history=[{id:'e1',target:'executionFacts',actor:'trusted#planner',reason:'纠正模拟计时',at:'now',action:'edit',fromVersion:'old',toVersion:'new',before:[{...fact,'工序完成数量':'30'}],after:[fact]}];
 const ui=Renderer.create(<ExecutionPanel data={data} operations={history} historical={{executionFactsVersion:'oldversion',executionSummary:{facts:[{...fact,'剩余工时分钟':'25'}]}}}/>);const text=JSON.stringify(ui.toJSON());
 for(const value of ['离线模拟','不代表质量合格','工序余量','60','20','MIX01','trusted#planner','纠正模拟计时','oldversion','FR031','扣耗后余额'])assert.ok(text.includes(value),value);ui.unmount();
});
test('FR012 execution editor submits cumulative full table and preserves server reconciliation errors',async()=>{
 let submissions:any[]=[];const def=defs.find(d=>d.key==='executionFacts')!;
 const ui=Renderer.create(<DataEditor def={def} rows={[fact]} revision={4} canWrite={true} busy={false} reason="修正模拟" onSave={async(tables,rev,op)=>{submissions.push({tables,rev,op});throw Error('状态倒退须核对，原记录保留');}}/>);
 const input=ui.root.findByProps({'aria-label':`${def.label} 1 工序完成数量`});act(()=>input.props.onChange({target:{value:'39'}}));const save=ui.root.findAllByType('button').find(b=>b.children.includes('保存修改'))!;await act(async()=>{await save.props.onClick();});
 assert.equal(submissions[0].rev,4);assert.equal(submissions[0].tables.executionFacts[0]['开始分钟'],'0');assert.equal(submissions[0].tables.executionFacts[0]['工序完成数量'],'39');assert.ok(JSON.stringify(ui.toJSON()).includes('状态倒退须核对'));assert.equal(fact['工序完成数量'],'40');ui.unmount();
});
test('FR012 query membership keeps execution editor inputs and save disabled',()=>{
 const ui=Renderer.create(<DataEditor def={defs.find(d=>d.key==='executionFacts')!} rows={[fact]} revision={1} canWrite={false} busy={false} reason="" onSave={async()=>{throw Error('forbidden');}}/>);assert.ok(ui.root.findAllByType('input').every(i=>i.props.disabled));assert.ok(ui.root.findAllByType('button').slice(0,4).every(b=>b.props.disabled));ui.unmount();
});
test('FR031 UI shows scrap separately, unfinished task/order impact, pending reconciliation and mapped source history',()=>{
 const current={...data,routes:[{'产品编号':'P','工序编号':'MIX','前序工序':''},{'产品编号':'P','工序编号':'FILL','前序工序':'MIX'}],orders:[{'订单编号':'A','产品编号':'P','合格需求':'100','数量单位':'kg'}],executionFacts:[{...fact,'累计报废数量':'10','报废补做口径':'待核对'}],executionSources:[{'来源编号':'raw-uat15','原始汇总耗料':'50','原始分配JSON':'explicit mapping'}]};
 const history=[{id:'s1',target:'executionSources',actor:'trusted#planner',reason:'显式核对来源映射',at:'now',action:'import',fromVersion:'old',toVersion:'new',after:current.executionSources}];const ui=Renderer.create(<ExecutionPanel data={current} operations={history}/>),text=JSON.stringify(ui.toJSON());for(const value of ['累计报废','10','补做口径','待核对','需核对，阻断重排','订单待合格数量','100','MIX、FILL','raw-uat15','显式核对来源映射','不推断其他工序返工'])assert.ok(text.includes(value),value);ui.unmount();
});
test('FR031 editor submits cumulative scrap and explicit policy without mutating input and shows reconciliation errors',async()=>{
 const def=defs.find(d=>d.key==='executionFacts')!,input={...fact,'累计报废数量':'10','报废补做口径':'待核对'};let submitted:any;
 const ui=Renderer.create(<DataEditor def={def} rows={[input]} revision={2} canWrite={true} busy={false} reason="核对补做" onSave={async(tables,rev)=>{submitted={tables,rev};}}/>);
 act(()=>ui.root.findByProps({'aria-label':`${def.label} 1 累计报废数量`}).props.onChange({target:{value:'20'}}));act(()=>ui.root.findByProps({'aria-label':`${def.label} 1 报废补做口径`}).props.onChange({target:{value:'按本工序BOM补做'}}));await act(async()=>{await ui.root.findAllByType('button').find(b=>b.children.includes('保存修改'))!.props.onClick();});assert.equal(submitted.rev,2);assert.equal(submitted.tables.executionFacts[0]['累计报废数量'],'20');assert.equal(submitted.tables.executionFacts[0]['报废补做口径'],'按本工序BOM补做');assert.equal(input['累计报废数量'],'10');ui.unmount();
});
test('FR031 source query role cannot edit immutable original mapping',()=>{
 const def=defs.find(d=>d.key==='executionSources')!;const ui=Renderer.create(<DataEditor def={def} rows={[{'来源编号':'raw','原始分配JSON':'[]'}]} revision={1} canWrite={false} busy={false} reason="" onSave={async()=>{throw Error('forbidden');}}/>);assert.ok(ui.root.findAllByType('input').every(i=>i.props.disabled));assert.ok(JSON.stringify(ui.toJSON()).includes('不自动分批'));ui.unmount();
});

test('FR029 UI shows event-time/protection/handling history and forbids query editing events',()=>{
 const e={'事件编号':'EV-fault','事件分钟':'30','保护截止分钟':'45','保护策略':'禁止未开始任务开工','事件类型':'设备故障','参数JSON':'{"machineId":"MIX01","endMinute":60}','原因':'测试故障原因','需处理事实JSON':'["F1"]'};
 const ui=Renderer.create(<ExecutionPanel data={{...data,simulationEvents:[e]}} operations={[{id:'ev',target:'simulationEvents',actor:'trusted#planner',reason:'导入故障事件',at:'now',action:'import',fromVersion:'old',toVersion:'new',before:[],after:[e]}]}/>);const text=JSON.stringify(ui.toJSON());for(const value of ['EV-fault','45','测试故障原因','禁止未开始任务开工','导入故障事件','不自动恢复','不承诺冻结旧方案'])assert.ok(text.includes(value),value);ui.unmount();
 const def=defs.find(d=>d.key==='simulationEvents')!,editor=Renderer.create(<DataEditor def={def} rows={[e]} revision={2} canWrite={false} busy={false} reason="" onSave={async()=>{throw Error('forbidden');}}/>);assert.ok(editor.root.findAllByType('input').every(i=>i.props.disabled));assert.ok(JSON.stringify(editor.toJSON()).includes('不代表QA在线放行'));editor.unmount();
});
