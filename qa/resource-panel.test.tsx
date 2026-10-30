import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {ResourcePanel} from '../src/ResourcePanel';
test('FR022 saved resource panel reports scope, full release interval and locates original member tasks',()=>{
 let selected:string[]=[];let view:any;const plan={jointResourceChecks:{MOLD:true,STORAGE:false},resourceReservations:[{type:'工装',resourceId:'G40',quantity:'2',unit:'套',start:5,end:45,taskIds:['A-MIX','B-MIX'],orderId:'A',productionBatchId:'A-1',declarationId:'C1'}]};
 act(()=>{view=create(<ResourcePanel plan={plan} onTask={ids=>selected=ids}/>);});
 assert.match(JSON.stringify(view.toJSON()),/G40/);assert.match(JSON.stringify(view.toJSON()),/冻结的参数计算/);assert.match(JSON.stringify(view.toJSON()),/未检查/);
 act(()=>view.root.findAllByType('tr')[1].props.onClick());assert.deepEqual(selected,['A-MIX','B-MIX']);
 act(()=>view.update(<ResourcePanel plan={{}} onTask={()=>{}}/>));assert.match(JSON.stringify(view.toJSON()),/未检查/);assert.ok(!JSON.stringify(view.toJSON()).includes('G40'));
});
