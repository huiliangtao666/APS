import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {TaskLinkage} from '../src/TaskLinkage';
test('problem click, active check, filter and missing evidence controls remain explicit',()=>{
 const f={code:'VERIFY / PRECEDENCE',message:'early',taskIds:['P','N'],interval:{kind:'precedence',start:20,end:30,priorEnd:30,nextStart:20,violationDuration:10}};
 let focus:any,checks=0,filtered=false,view:any;
 const props={plan:{id:'frozen',snapshotHash:'HASH',tasks:[{id:'P',start:0,end:30},{id:'N',start:20,end:45,predecessor:'P'}]},selected:['missing'],findings:[f],focused:f,onProblem:(x:any)=>focus=x,onSelect:()=>{},onCheck:()=>checks++,busy:false,problemOnly:false,onFilter:(x:boolean)=>filtered=x};
 act(()=>{view=create(<TaskLinkage {...props}/>);});
 const text=JSON.stringify(view.toJSON());assert.match(text,/违反时长/);assert.match(text,/HASH/);assert.match(text,/未保存/);
 act(()=>view.root.findAllByType('button').find((b:any)=>b.props.className==='finding')!.props.onClick());assert.equal(focus,f);
 act(()=>view.root.findAllByType('button')[0].props.onClick());assert.equal(checks,1);
 act(()=>view.root.findByType('input').props.onChange({target:{checked:true}}));assert.equal(filtered,true);
 act(()=>view.update(<TaskLinkage {...props} busy/>));const check=view.root.findAllByType('button')[0];
 assert.equal(check.props.disabled,false);assert.equal(check.props['aria-disabled'],true);
 act(()=>check.props.onClick());assert.equal(checks,1,'busy control suppresses repeat activation');
 act(()=>view.update(<TaskLinkage {...props}/>));
 assert.equal(view.root.findAllByType('button')[0].props['aria-disabled'],false);
 act(()=>view.root.findAllByType('button')[0].props.onClick());assert.equal(checks,2);
 act(()=>view.update(<TaskLinkage {...props} plan={null}/>));
 const unavailable=view.root.findAllByType('button')[0];assert.equal(unavailable.props.disabled,true);
 act(()=>unavailable.props.onClick());assert.equal(checks,2,'no plan cannot trigger check');
});

test('stale structured evidence over raw null cannot render a numeric problem interval',()=>{
 const f={code:'VERIFY / PRECEDENCE',message:'stale',taskIds:['P','N'],interval:{kind:'precedence',start:0,end:30,priorEnd:30,nextStart:0,violationDuration:30}};
 const plan={id:'corrupt',tasks:[{id:'P',start:0,end:30},{id:'N',start:null,end:45,predecessor:'P'}]};
 let view:any;act(()=>{view=create(<TaskLinkage plan={plan} selected={[]} findings={[f]} focused={f} onProblem={()=>{}} onSelect={()=>{}} onCheck={()=>{}} busy={false} problemOnly={false} onFilter={()=>{}}/>);});
 const text=JSON.stringify(view.toJSON());assert.match(text,/没有可验证的已排问题区间/);assert.doesNotMatch(text,/违反时长/);
});
