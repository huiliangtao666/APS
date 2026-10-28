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
