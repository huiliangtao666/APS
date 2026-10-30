import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {ResultPanel} from '../src/ResultPanel';
import {DataQueries} from '../src/DataQueries';
const report={status:'partial-unplanned',scheduledCount:1,unplannedCount:1,limits:['不保证可行'],scope:{unchecked:['质量事实']},unresolved:['最大等待'],unsupported:['执行保护时段'],globalFindings:[],orders:[],tasks:[{id:'A-MIX',orderId:'A',operation:'MIX',status:'scheduled',quantity:1,unit:'kg',machineId:'M',requiredDuration:30,reasons:[],suggestions:[],materials:[],inputRefs:[{table:'orders',row:{'订单编号':'A'}}]},{id:'A-FILL',orderId:'A',operation:'FILL',status:'unplanned',quantity:1,unit:'kg',reasons:[{code:'UNKNOWN',classification:'unknown',message:'未知'}],suggestions:[{kind:'delay',message:'重算'}],materials:[],inputRefs:[]}]};
test('FR024 result UI links scheduled tasks and unplanned reasons without fake Gantt geometry',()=>{
 let selected='',table='';const ui=Renderer.create(<ResultPanel plan={{id:'p',runId:'r',snapshotHash:'h',resultAssessment:report}} onTask={id=>selected=id} onInput={key=>table=key}/>);
 const buttons=ui.root.findAllByType('button');assert.equal(buttons.length,3);act(()=>buttons[0].props.onClick());assert.equal(selected,'A-MIX');act(()=>buttons[1].props.onClick());assert.equal(table,'orders');act(()=>buttons[2].props.onClick());assert.equal(selected,'A-FILL');const text=JSON.stringify(ui.toJSON());for(const v of ['未知','未排','不保证','质量事实','保护时段','A-FILL'])assert.ok(text.includes(v));assert.ok(!text.includes('A-FILL · 定位甘特'));assert.ok(text.includes('未排 · 定位原因'));
});
test('FR024 old plan report is unknown and never reconstructed',()=>{const ui=Renderer.create(<ResultPanel plan={{id:'old'}} onTask={()=>{throw Error('unexpected')}} onInput={()=>{}}/>);assert.ok(JSON.stringify(ui.toJSON()).includes('无法从当前输入重建'));});
test('FR024 input link opens requested table on historical snapshot rather than changed current input',()=>{
 const ui=Renderer.create(<DataQueries data={{orders:[{'订单编号':'CURRENT'}]}} plans={[{id:'p',revision:0,tasks:[],inputSnapshot:{orders:[{'订单编号':'SAVED'}]}}]} revision={1} initialPlan="p" initialTable="orders" initialRow={{'订单编号':'SAVED'}} canExport={false} reason="" onExport={()=>{}} onTask={()=>{}}/>);const text=JSON.stringify(ui.toJSON());assert.ok(text.includes('SAVED'));assert.ok(!text.includes('CURRENT'));assert.ok(text.includes('方案原始快照'));
});
