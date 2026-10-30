import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {TimelinePanel} from '../src/TimelinePanel';
const fixture=()=>({id:'P',name:'冻结方案',runId:'RUN',snapshotHash:'HASH',inputVersionId:'v7',tasks:[{id:'A-MIX',orderId:'A',operation:'MIX',machine:'M',start:0,end:30,predecessor:'',source:'保存来源'},{id:'A-FILL',orderId:'A',operation:'FILL',machine:'N',start:30,end:60,predecessor:'A-MIX',source:'停机顺延'}],inputSnapshot:{machines:[{'设备编号':'M'},{'设备编号':'N'}],downtime:[{'设备编号':'M','起始分钟':'30','结束分钟':'60','原因':'冻结停机'}],personnelGroups:[{'人员组编号':'G','人员数量':'2','技能':'mix','班次':'D','可用起始分钟':'0','可用结束分钟':'100'}]},execution:{facts:[{'事实编号':'F','订单编号':'A','工序编号':'MIX','当前设备':'M','开始分钟':'0','观测分钟':'10','工序完成数量':'4','状态':'部分完成','数量单位':'kg'}]},resourceReservations:[{type:'人员',resourceId:'G',quantity:'2',unit:'人',start:0,end:5,taskIds:['A-MIX']}],resultAssessment:{tasks:[{id:'A-MIX',quantity:10,unit:'kg',inputRefs:[{table:'orders',row:{'订单编号':'A','合格需求':'10'}}]}]}});
const text=(ui:any)=>JSON.stringify(ui.toJSON());
const field=(ui:any,name:string)=>ui.root.findAll((n:any)=>n.props['aria-label']===name)[0];
const button=(ui:any,s:string)=>ui.root.findAllByType('button').find((b:any)=>b.children.join('')===s)!;
function setup(plan:any=fixture(),selected:string[]=[]){let ids:string[]=[],ref:any;let ui:any;act(()=>{ui=Renderer.create(<TimelinePanel plan={plan} selected={selected} onSelect={v=>ids=v} onInput={(table,row)=>ref={table,row}} currentFacts={[{'订单编号':'A','工序编号':'MIX','工序完成数量':'9'}]}/>);});return {ui,ids:()=>ids,ref:()=>ref};}
test('FR033 machine rows, full dates, frozen provenance, exact bar width and textual alternatives',()=>{const {ui}=setup();const s=text(ui);for(const word of ['冻结方案','HASH','RUN','v7','冻结停机','部分完成','全局可行性未知','工装','空间','人员','10','kg'])assert.ok(s.includes(word),word);const bar=ui.root.findAll((n:any)=>n.props['aria-label']?.startsWith('A-MIX A MIX'))[0];assert.equal(bar.props.style.width,30);assert.equal(bar.props.style.left,0);assert.ok(ui.root.findAllByType('table').length>=2);});
test('FR033 task buttons, predecessor and saved input callbacks use exact saved IDs and rows',()=>{const x=setup(fixture(),['A-FILL']);act(()=>button(x.ui,'A-MIX').props.onClick());assert.deepEqual(x.ids(),['A-MIX']);const y=setup(fixture(),['A-MIX']);const b=y.ui.root.findAllByType('button').find((b:any)=>b.children.join('').includes('查看方案输入'))!;act(()=>b.props.onClick());assert.deepEqual(y.ref(),{table:'orders',row:{'订单编号':'A','合格需求':'10'}});});
test('FR033 machine/status/search filters act on timetable and bars and expose hidden selection',()=>{const {ui}=setup(fixture(),['A-MIX']);act(()=>field(ui,'机器筛选').props.onChange({target:{value:'N'}}));assert.ok(text(ui).includes('选中任务被筛选隐藏'));assert.equal(ui.root.findAll((n:any)=>n.props['aria-label']?.startsWith('A-MIX A MIX')).length,0);act(()=>button(ui,'清除筛选与窗口').props.onClick());act(()=>field(ui,'搜索任务').props.onChange({target:{value:'NO-MATCH'}}));assert.equal(ui.root.findAll((n:any)=>n.props['data-selected']!==undefined).length,0);act(()=>field(ui,'计划状态').props.onChange({target:{value:'unplanned'}}));assert.ok(text(ui).includes('筛选结果'));});
test('FR033 zoom changes geometry without duration edits, invalid window warns and cursor remains simulated',()=>{const p=fixture(),before=JSON.stringify(p),{ui}=setup(p);act(()=>field(ui,'缩放').props.onChange({target:{value:'8'}}));act(()=>field(ui,'模拟时点分钟').props.onChange({target:{value:'30'}}));assert.ok(text(ui).includes('已结束（非执行事实）'));act(()=>field(ui,'窗口开始分钟').props.onChange({target:{value:'100'}}));act(()=>field(ui,'窗口结束分钟').props.onChange({target:{value:'20'}}));assert.ok(text(ui).includes('窗口结束须大于开始'));assert.equal(JSON.stringify(p),before);});
test('FR033 legacy plan missing input is unknown and never replaced by current facts',()=>{const {ui}=setup({id:'OLD',tasks:[{id:'A-MIX',orderId:'A',operation:'MIX',machine:'M',start:0,end:30}]},['A-MIX']);assert.ok(text(ui).includes('禁止用当前输入重建'));assert.ok(text(ui).includes('没有保存的模拟执行事实'));assert.ok(text(ui).includes('当前模拟事实对照'));assert.ok(!text(ui).includes('冻结停机'));});
test('FR033 unplanned and missing selected task have explicit text without invented bars',()=>{const p=fixture();p.resultAssessment.tasks.push({id:'UNPLANNED',orderId:'B',operation:'MIX',status:'unplanned',quantity:2,unit:'kg',reasons:[{code:'SHORT',message:'不足'}]} as any);const {ui}=setup(p,['ghost']);assert.ok(text(ui).includes('没有甘特条'));assert.ok(text(ui).includes('没有保存在本方案中'));assert.equal(ui.root.findAll((n:any)=>n.props['aria-label']?.startsWith('UNPLANNED ')).length,0);});
const chart=(ui:any)=>ui.root.findByProps({className:'fr033-axis'}).props.style.width;
const bars=(ui:any)=>ui.root.findAllByProps({className:'fr033-task'});
const change=(ui:any,name:string,value:string)=>act(()=>field(ui,name).props.onChange({target:{value}}));
test('ZOOM01 round1: four advertised scales produce exact short-plan geometry, offsets and clipped widths',()=>{
 const p=fixture(),before=JSON.stringify(p),{ui}=setup(p);
 for(const zoom of [0.25,1,3,8]){
  change(ui,'缩放',String(zoom));assert.equal(chart(ui),120*zoom);
  assert.deepEqual(bars(ui).map((b:any)=>[b.props.style.left,b.props.style.width]),[[0,30*zoom],[30*zoom,30*zoom]]);
  assert.ok(ui.root.findAllByProps({role:'status'}).some((n:any)=>n.children.join('').includes(`实际比例 ${zoom}`)));
 }
 change(ui,'窗口开始分钟','15');change(ui,'窗口结束分钟','45');
 assert.equal(chart(ui),240);assert.deepEqual(bars(ui).map((b:any)=>[b.props.style.left,b.props.style.width]),[[0,120],[120,120]]);
 assert.equal(JSON.stringify(p),before);
});
test('ZOOM01 round1: upper canvas bound labels actual scale and disables ineffective choices, then recovers',()=>{
 const {ui}=setup();change(ui,'窗口结束分钟','240000');assert.equal(chart(ui),60000);
 assert.ok(ui.root.findAllByProps({role:'status'}).some((n:any)=>n.children.join('').includes('实际比例 0.25')));assert.ok(text(ui).includes('所选 1'));
 const options=field(ui,'缩放').findAllByType('option');assert.deepEqual(options.map((o:any)=>o.props.disabled),[false,true,true,true]);
 change(ui,'缩放','0.25');assert.equal(chart(ui),60000);
 change(ui,'窗口结束分钟','240001');assert.ok(field(ui,'缩放').findAllByType('option').every((o:any)=>o.props.disabled));
 act(()=>button(ui,'清除筛选与窗口').props.onClick());assert.equal(chart(ui),30);assert.ok(field(ui,'缩放').findAllByType('option').every((o:any)=>!o.props.disabled));
});
test('WINDOW02 round1: huge, negative, non-finite, reversed and malformed edits retain last usable geometry/table',()=>{
 const p=fixture(),before=JSON.stringify(p),{ui}=setup(p,['A-MIX']);change(ui,'窗口结束分钟','90');
 for(const value of ['1000000000000','-1000000000000','1e309','NaN','oops','-1','0']){
  change(ui,'窗口结束分钟',value);assert.equal(chart(ui),90);assert.equal(bars(ui).length,2);
  assert.ok(ui.root.findAllByProps({role:'alert'}).length);assert.ok(text(ui).includes('已保留上次有效窗口'));assert.ok(text(ui).includes('任务详情：'));
 }
 change(ui,'窗口结束分钟','60');assert.equal(chart(ui),60);assert.equal(ui.root.findAllByProps({role:'alert'}).length,0);
 change(ui,'窗口开始分钟','-1000000000000');assert.equal(chart(ui),60);
 change(ui,'窗口开始分钟','-30');assert.equal(chart(ui),90);assert.equal(bars(ui)[0].props.style.left,30);
 change(ui,'窗口开始分钟','');change(ui,'窗口结束分钟','');assert.equal(chart(ui),120);
 change(ui,'机器筛选','N');assert.equal(bars(ui).length,1);assert.equal(JSON.stringify(p),before);
});
test('WINDOW02 round1: mixed malformed saved times across tasks, downtime, resources and facts cannot poison valid view',()=>{
 const p:any=fixture();p.tasks.push({id:'BAD',machine:'M',orderId:'B',operation:'X',start:0,end:1e12});
 p.inputSnapshot.downtime.push({'设备编号':'M','起始分钟':'-1e12','结束分钟':'1e12','原因':'坏日期'});
 p.resourceReservations.push({type:'人员',resourceId:'BAD-G',start:0,end:1e12,taskIds:['BAD']});
 p.execution.facts.push({'事实编号':'BAD-F','当前设备':'M','开始分钟':'0','观测分钟':'1e12'});
 const before=JSON.stringify(p),{ui}=setup(p,['BAD']);assert.equal(chart(ui),120);assert.equal(bars(ui).length,2);
 assert.ok(text(ui).includes('BAD'));assert.ok(text(ui).includes('时间超出有效日期范围'));assert.ok(text(ui).includes('BAD-G'));assert.ok(ui.root.findAllByType('h3').some((n:any)=>n.children.join('')==='任务详情：BAD'));
 assert.equal(JSON.stringify(p),before);
 act(()=>ui.update(<TimelinePanel plan={{id:'NEXT',tasks:[{id:'OK',machine:'M',start:0,end:45}]}} selected={[]} currentFacts={[]} onSelect={()=>{}} onInput={()=>{}}/>));
 assert.equal(chart(ui),120);assert.equal(bars(ui).length,1);assert.ok(!text(ui).includes('BAD-G'));
});

test('AXIS-LABEL-03 narrow axis has readable external dates and wider ticks carry full time names',()=>{
 const p=fixture(),before=JSON.stringify(p),{ui}=setup(p);
 for(const zoom of [0.25,1,3,8]){
  change(ui,'缩放',String(zoom));
  const summary=field(ui,'时间轴窗口，Asia/Shanghai');assert.ok(summary);assert.ok(text(ui).includes('2026-11-02'));
  const labels=ui.root.findAllByType('time');
  if(zoom<=1){assert.equal(labels.length,0);assert.ok(text(ui).includes('轴宽不足'));}
  else{assert.ok(labels.length>0);assert.ok(labels.every((n:any)=>n.props['aria-label'].includes('分钟')));}
  assert.equal(chart(ui),120*zoom);assert.equal(bars(ui)[0].props.style.width,30*zoom);
 }
 assert.equal(JSON.stringify(p),before);
});
test('FR034 focus resets obstructing filters and shows exact overlap while problem-only hides unrelated tasks',()=>{
 const p=fixture();p.tasks[1]={...p.tasks[1],machine:'M',start:20,end:60};
 const finding={code:'VERIFY / MACHINE_OVERLAP',taskIds:['A-MIX','A-FILL'],interval:{kind:'machine-overlap',machine:'M',start:20,end:30}};
 let ui:any;const selected=['A-MIX','A-FILL'];
 act(()=>{ui=Renderer.create(<TimelinePanel plan={p} selected={selected} onSelect={()=>{}} onInput={()=>{}} currentFacts={[]} problemTaskIds={['A-MIX','A-FILL']}/>);});
 change(ui,'搜索任务','hidden');
 act(()=>ui.update(<TimelinePanel plan={p} selected={selected} onSelect={()=>{}} onInput={()=>{}} currentFacts={[]} focusedProblem={finding} problemTaskIds={['A-MIX','A-FILL']}/>));
 assert.equal(field(ui,'搜索任务').props.value,'');assert.equal(field(ui,'窗口开始分钟').props.value,'10');
 assert.equal(ui.root.findByProps({className:'fr034-interval'}).props['aria-label'],'问题区间 20 至 30，10 分钟');
 act(()=>ui.update(<TimelinePanel plan={p} selected={selected} onSelect={()=>{}} onInput={()=>{}} currentFacts={[]} problemTaskIds={[]}/>));
 assert.equal(bars(ui).length,0);
});


test('KBD01 round1: keyboard finding scrolls then focuses the exact selected bar; pointer activation retains focus',()=>{
 const p=fixture(),before=JSON.stringify(p),events:string[]=[];
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 let keyboard=true;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:{matches:(selector:string)=>keyboard&&selector==='.finding:focus-visible'}}});
 const node={scrollIntoView:(options:any)=>events.push('scroll:'+options.inline),focus:(options:any)=>events.push('focus:'+options.preventScroll)};
 let ui:any;
 try{
  act(()=>{ui=Renderer.create(<TimelinePanel plan={p} selected={['A-MIX']} onSelect={()=>{}} onInput={()=>{}} currentFacts={[]}/>,{createNodeMock:(el:any)=>el.props.className==='fr033-scroll'?{querySelector:(selector:string)=>{assert.equal(selector,'[data-selected="true"]');return node;}}:null});});
  assert.deepEqual(events.slice(-2),['scroll:center','focus:true']);
  events.length=0;keyboard=false;
  act(()=>ui.update(<TimelinePanel plan={p} selected={['A-FILL']} onSelect={()=>{}} onInput={()=>{}} currentFacts={[]}/>));
  assert.deepEqual(events,['scroll:center']);assert.equal(JSON.stringify(p),before);
 }finally{act(()=>ui?.unmount());if(previous)Object.defineProperty(globalThis,'document',previous);else delete (globalThis as any).document;}
});
