import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {TaskLinkage} from '../src/TaskLinkage';
test('problem click, active check, filter and missing evidence controls remain explicit',()=>{
 const f={code:'VERIFY / PRECEDENCE',message:'early',taskIds:['P','N'],interval:{kind:'precedence',start:20,end:30,priorEnd:30,nextStart:20,violationDuration:10}};
 let focus:any,checks=0,filtered=false,view:any;
 const props={plan:{id:'frozen',snapshotHash:'HASH'},selected:['missing'],findings:[f],focused:f,onProblem:(x:any)=>focus=x,onSelect:()=>{},onCheck:()=>checks++,busy:false,problemOnly:false,onFilter:(x:boolean)=>filtered=x};
 act(()=>{view=create(<TaskLinkage {...props}/>);});
 const text=JSON.stringify(view.toJSON());assert.match(text,/违反时长/);assert.match(text,/HASH/);assert.match(text,/未保存/);
 act(()=>view.root.findAllByType('button').find((b:any)=>b.props.className==='finding')!.props.onClick());assert.equal(focus,f);
 act(()=>view.root.findAllByType('button')[0].props.onClick());assert.equal(checks,1);
 act(()=>view.root.findByType('input').props.onChange({target:{checked:true}}));assert.equal(filtered,true);
 act(()=>view.update(<TaskLinkage {...props} busy/>));assert.equal(view.root.findAllByType('button')[0].props.disabled,true);
});
