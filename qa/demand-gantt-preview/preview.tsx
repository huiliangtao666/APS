import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {InputData} from '../../src/InputData';
import {EquipmentSchedule} from '../../src/EquipmentSchedule';
import fixture from './fixture.json';
import '../../src/index.css';import '../../src/InputData.css';import '../../src/compact-controls.css';
const api=async(path:string)=>{const q=JSON.parse(new URL('http://qa'+path).searchParams.get('request')||'{}'),kind=path.split('?')[0].split('/').pop();if(kind==='options')return {items:[],selection:{mode:'ALL'},selectedTotal:0,total:0,matched:0,nextOffset:null,identity:fixture.context.identity};if(kind==='context')return fixture.context;if(kind==='query')return q.view==='E5'?fixture.risk[q.riskScope||'all'].page:fixture.pages[q.view];if(kind==='detail'){if(q.query.view==='E1')return q.table==='task-card'?fixture.equipment.taskCards[q.node.id]?.[q.section]:q.table==='analysis'?fixture.equipment.analysis[q.node.id]:fixture.equipment.details[q.id]?.[q.table]||fixture.empty;if(q.table==='task-card')return fixture.taskCards[q.node.id]?.[q.section];if(q.query.view==='E3')return q.table==='equipment-load-matrix'?fixture.load.matrix:fixture.load.details[q.id]?.[q.table]||fixture.empty;if(q.query.view==='E4')return q.table==='personnel-matrix'?fixture.personnel.matrix:fixture.personnel.details[q.id]?.[q.table]||fixture.empty;if(q.query.view==='E5'){const f=fixture.risk[q.query.riskScope||'all'];return q.table==='risk-card'?f.cards[q.node.id][q.section]:q.table==='analysis'?f.analysis[q.node.id]:f.details[q.id]?.[q.table]||fixture.empty;}if(q.table==='timeline')return fixture.timeline;if(q.table==='analysis')return fixture.analysis[q.node.id];return fixture.details[q.id]?.[q.table]||fixture.empty;}throw Error('No fixture '+kind);};
const qaWorkbench=async(path:string)=>{
 if(path==='/workbooks/datasets')return [{id:fixture.run.datasetId,name:'合成页面检查.xlsx',version:fixture.run.version}];
 if(path==='/workbooks/schema')return {tables:{}};
 if(path.endsWith('/drafts'))return [];
 if(path==='/workbooks/runs')return [{id:fixture.run.id,datasetId:fixture.run.datasetId,version:fixture.run.version,status:fixture.run.status,createdAt:'2026-11-03T11:35:22Z'}];
 if(path==='/workbooks/runs/'+fixture.run.id)return fixture.run;
 if(path.startsWith('/workbooks/datasets/'))return {id:fixture.run.datasetId,version:fixture.run.version,name:'合成页面检查.xlsx',readiness:{ready:true,issues:[]},versions:[1]};
 return api(path);
};
function ResultPage(){const [host,setHost]=useState<HTMLDivElement|null>(null);return <div className="app-shell" style={new URLSearchParams(location.search).has('compact')?{maxWidth:960}:undefined}><header className="topbar"><div className="brandmark">APS</div><div className="brand"><b>APS · 排程工作台</b></div><div className="workbook-navigation-host" ref={setHost}/><small>合成数据，非真实验收</small></header><main><InputData navigationHost={host} api={qaWorkbench} canWrite={false} canExport={false} reason="合成页面检查"/></main></div>;}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('result')?<ResultPage/>:<div className="app-shell"><main><div className="input-workspace workbook-run-view"><small>任务级页面检查 · 合成数据；非真实验收结果</small><EquipmentSchedule run={fixture.run} api={api} canExport={false}/></div></main></div>);
