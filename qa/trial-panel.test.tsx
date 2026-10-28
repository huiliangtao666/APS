import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {TrialPanel} from '../src/TrialPanel';
const trial={id:'trial',status:'active',revision:3,sourcePlanId:'original',sourceRunId:'source-run',sourceInputVersionId:'iv',sourceSnapshotHash:'hash',basePlanId:'copy',latestPlanId:'new',data:{orders:[],rules:[]},selection:{orderIds:[],lineId:'L',startMinute:12,endMinute:500,priority:'要求日期',enabledRuleIds:[],timeOrigin:'origin'}};
const base={plans:[{id:'original',name:'原方案'},{id:'copy',name:'副本'}],activeId:'original',trials:[trial],runs:[],revision:7,canWrite:true,busy:false,reason:'测试',api:async()=>({}),refresh:async()=>{},onResult:()=>{},onRun:()=>{},onCancel:()=>{}};
const button=(ui:Renderer.ReactTestRenderer,label:string)=>ui.root.findAllByType('button').find(b=>b.children.join('')===label)!;
test('FR026 copy UI uses server copy and opens independent result after refresh',async()=>{
 const calls:any[]=[],results:string[]=[];let refreshed=false;
 const ui=Renderer.create(<TrialPanel {...base} api={async(path,body)=>{calls.push([path,body]);return trial;}} refresh={async()=>{refreshed=true;}} onResult={id=>results.push(id)}/>);
 await act(async()=>button(ui,'复制当前方案为独立试算').props.onClick());assert.deepEqual(calls,[['/plans/original/copy',{}]]);assert.equal(refreshed,true);assert.deepEqual(results,['copy']);assert.ok(JSON.stringify(ui.toJSON()).includes('试算输入版本'));
});
test('FR026 restore UI shows explicit current-state blockers and query role cannot mutate',async()=>{
 const ui=Renderer.create(<TrialPanel {...base} api={async()=>{throw Error('CURRENT_PROGRESS_RECHECK_UNAVAILABLE：缺少当前进度；STALE_STOCK_RESTORE_FORBIDDEN：禁止恢复旧库存');}}/>);
 await act(async()=>button(ui,'检查能否恢复当前历史方案').props.onClick());assert.ok(ui.root.findByProps({role:'alert'}).children.join('').includes('STALE_STOCK'));
 act(()=>ui.update(<TrialPanel {...base} canWrite={false}/>));assert.equal(button(ui,'复制当前方案为独立试算').props.disabled,true);assert.equal(button(ui,'检查能否恢复当前历史方案').props.disabled,true);
 act(()=>ui.root.findByProps({'aria-label':'独立试算'}).props.onChange({target:{value:'trial'}}));assert.equal(button(ui,'放弃试算（保留历史）').props.disabled,true);
});
test('FR026 trial editor and discard target only trial routes with own revision; run initializes copied selection',async()=>{
 const calls:any[]=[];const ui=Renderer.create(<TrialPanel {...base} api={async(path,body)=>{calls.push([path,body]);return trial;}}/>);
 act(()=>ui.root.findByProps({'aria-label':'独立试算'}).props.onChange({target:{value:'trial'}}));
 assert.equal(ui.root.findByProps({'aria-label':'开始分钟'}).props.value,'12');assert.equal(ui.root.findByProps({'aria-label':'计划结束分钟'}).props.value,'500');
 await act(async()=>button(ui,'放弃试算（保留历史）').props.onClick());assert.deepEqual(calls,[['/trials/trial/discard',{revision:3}]]);
});
test('FR026 compare UI renders unknown materials, unchanged outcomes and saved plan references',async()=>{
 const report={left:{planId:'original'},right:{planId:'copy'},scope:{comparable:true},inputs:[],conditions:{changed:false},orderOutcome:'unchanged-no-delivery-improvement',limits:['未排数量不跨工序相加'],...Object.fromEntries(['tasks','resources','materials','orders','unplanned'].map(k=>[k,{known:k!=='materials',changes:[],before:null,after:null}]))};
 const ui=Renderer.create(<TrialPanel {...base} api={async()=>report}/>);act(()=>ui.root.findByProps({'aria-label':'比较对象'}).props.onChange({target:{value:'copy'}}));
 await act(async()=>button(ui,'比较当前方案与所选方案').props.onClick());const text=JSON.stringify(ui.toJSON());for(const x of ['没有交期改善','未检查或历史证据缺失','original','copy','不跨工序相加'])assert.ok(text.includes(x));
});
