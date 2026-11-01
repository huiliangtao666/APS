import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {RunPanel} from '../src/RunPanel';import {DataEditor} from '../src/DataEditor';
import {p1Defs,p1InitialStrategies} from '../src/lib/p1-topics-contract.mjs';
const data:any={orders:[{'订单编号':'FORMAL','需求类型':'正式订单','订单状态':'有效'},{'订单编号':'FORECAST','需求类型':'预测','订单状态':'有效'}],p1Profiles:[{'配置编号':'MOCK:P1','配置版本':'v1','来源说明':'可替换模拟','策略JSON':JSON.stringify(p1InitialStrategies)}],p1DemandSources:[{'订单编号':'FORECAST','配置编号':'MOCK:P1','来源编号':'MOCK:source','来源版本':'v1','来源说明':'独立预测'}],rules:[]};
test('UI separates formal and independent demand lists and names disabled topics',()=>{
 const base={data,runs:[],canWrite:true,busy:false,onStart:()=>{},onCancel:()=>{},onResult:()=>{},onInputs:async()=>({})};
 const formal=renderToStaticMarkup(<RunPanel {...base}/>);assert.match(formal,/FORMAL/);assert.doesNotMatch(formal,/FORECAST/);
 const sim=renderToStaticMarkup(<RunPanel {...base} initialSelection={{p1ProfileId:'MOCK:P1'}}/>);assert.match(sim,/FORECAST/);assert.doesNotMatch(sim,/FORMAL/);assert.match(sim,/不与正式订单自动叠加/);assert.match(sim,/目标库存自动补库/);assert.match(sim,/未启用/);assert.match(sim,/未支持/);
 const editor=renderToStaticMarkup(<DataEditor data={data} def={p1Defs[0]} rows={data.p1Profiles} revision={1} canWrite busy={false} reason="mock" onSave={async()=>{}}/>);assert.match(editor,/策略/);assert.match(editor,/保存修改/);assert.match(editor,/来源/);
});
