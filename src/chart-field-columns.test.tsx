import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {EquipmentGantt} from './EquipmentSchedule';import {MaterialRiskGantt} from './MaterialRiskGantt';import {EquipmentLoadMatrix} from './EquipmentLoadMatrix';import {PersonnelToolHeatmap} from './PersonnelToolHeatmap';
import {chartFieldLayout,normalizeChartColumns,chartFieldText,type ChartField} from './EquipmentChartControls';
const identity={datasetId:'SYN',version:1,runId:'R',fingerprint:'F',dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00'};
const common={from:1,to:3,focusDay:null,density:'fit',color:'status',identity,analysisIdentity:identity,preferenceScope:'FIELD-TEST',onDay:()=>{},onTask:()=>{},onResource:()=>{},onOpen:()=>{},api:async()=>({}),query:{view:'E1'},fingerprint:'Q'};
const task={id:'T',orderId:'D',productId:'FG',machine:'EQ',productionId:'B',label:'加工',start:1440,end:2880};
const risk={id:'shortage:S',values:{materialId:'RM',sourceKind:'真实净缺口'},need:'D',timeline:{materialId:'RM',materialName:'原料',quantity:0,unit:'个',events:[{key:'need',label:'净缺口',at:1440,end:null,precision:'day',tone:'gap'}],missing:[]}};
const scenes=[
 {view:'E1',fixed:'id',keys:['id','name','group','taskCount','wipCount'],render:()=>renderToStaticMarkup(<EquipmentGantt {...common} rows={[{id:'EQ',values:{name:'测试设备',group:'G1',taskCount:1,wipCount:0},tasks:[task]}]}/>),marker:'任务 T'},
 {view:'E2',fixed:'id',keys:['id','productId','productName','quantity','unit','delivery','taskCount'],render:()=>renderToStaticMarkup(<EquipmentGantt {...common} demand rows={[{id:'D',values:{productId:'FG',productName:'测试成品',quantity:10,unit:'千克',status:'unplanned',taskCount:0},tasks:[]}]}/>),marker:'未排 ·'},
 {view:'E3-matrix-r2',fixed:'machine',keys:['machine','name','group','windowOccupancy','taskCount'],render:()=>renderToStaticMarkup(<EquipmentLoadMatrix {...common} rows={[{id:'EQ|1',values:{machine:'EQ',name:'测试设备',group:'G1',day:1,occupiedMinutes:960},downtimeMinutes:0,resourceSummary:{taskCount:1,windowOccupancy:.5}}]}/>),marker:'66.67%'},
 {view:'E4-matrix-r2',fixed:'resource',keys:['resource','name','kind','dimension','available','taskCount'],render:()=>renderToStaticMarkup(<PersonnelToolHeatmap {...common} rows={[{id:'C|1',values:{resource:'C',name:'测试班组',dimension:'人',day:1,available:20,peak:4,remaining:16},resourceSummary:{taskCount:1}}]}/>),marker:'4/20'},
 {view:'E5',fixed:'id',keys:['id','materialId','materialName','kind','quantity','unit','need'],render:()=>renderToStaticMarkup(<MaterialRiskGantt {...common} rows={[risk]}/>),marker:'class="risk-node'}
];
function withStorage(values:Record<string,string>,fn:()=>void){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values[k]??null,setItem:(k:string,v:string)=>{values[k]=v;}}});try{fn();}finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete (globalThis as any).localStorage;}}
test('all five charts have a separate aligned header and row cell per visible field',()=>withStorage({},()=>{
 for(const scene of scenes){const html=scene.render();for(const key of scene.keys)assert.equal((html.match(new RegExp('data-chart-field="'+key+'"','g'))||[]).length,2,scene.view+' / '+key);assert.ok(html.includes(scene.marker),scene.view);assert.ok(!html.includes('class="equipment-name'),scene.view);}
}));
test('saved field choices hide header and row together while date charts, values and frozen rows remain',()=>{
 for(const scene of scenes){const saved={['aps-equipment-chart:r2:FIELD-TEST:'+scene.view]:JSON.stringify([scene.fixed])};withStorage(saved,()=>{const html=scene.render();assert.equal((html.match(/data-chart-field=/g)||[]).length,2,scene.view);assert.ok(html.includes(scene.marker),scene.view);assert.ok(html.includes('11.01'),scene.view);});}
});
test('preferences are isolated per view, fixed identity cannot be hidden and legacy compound fields expand',()=>{
 withStorage({'aps-equipment-chart:r2:FIELD-TEST:E1':'["id"]'},()=>{assert.equal((scenes[0].render().match(/data-chart-field=/g)||[]).length,2);assert.equal((scenes[1].render().match(/data-chart-field=/g)||[]).length,14);});
 const columns:ChartField[]=[{key:'id',label:'编号',fixed:true,width:80},{key:'productId',label:'成品编号',width:80},{key:'productName',label:'名称',width:160}];
 assert.deepEqual(normalizeChartColumns(columns,[]),['id']);assert.deepEqual(normalizeChartColumns(columns,['product','obsolete','product'],{product:['productId','productName']}),['id','productId','productName']);
 assert.deepEqual(chartFieldLayout(columns,['productName']),{fields:[columns[0],columns[2]],width:240,template:'80px 160px'});assert.equal(chartFieldText(0),'0');assert.equal(chartFieldText(null),'—');
});
