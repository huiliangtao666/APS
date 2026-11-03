import React from 'react';import {createRoot} from 'react-dom/client';
import {EquipmentSchedule} from '../../src/EquipmentSchedule';
import fixture from './fixture.json';
import '../../src/index.css';import '../../src/InputData.css';import '../../src/compact-controls.css';
const api=async(path:string)=>{const q=JSON.parse(new URL('http://qa'+path).searchParams.get('request')||'{}'),kind=path.split('?')[0].split('/').pop();if(kind==='context')return fixture.context;if(kind==='query')return fixture.pages[q.view];if(kind==='detail'){if(q.table==='timeline')return fixture.timeline;if(q.table==='analysis')return fixture.analysis[q.node.id];return fixture.details[q.id]?.[q.table]||fixture.empty;}throw Error('No fixture '+kind);};
createRoot(document.getElementById('root')!).render(<div className="app-shell"><main><div className="input-workspace workbook-run-view"><small>任务级页面检查 · 合成数据；非真实验收结果</small><EquipmentSchedule run={fixture.run} api={api} canExport={false}/></div></main></div>);
