import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {MaterialRiskGantt,riskEventVisible} from './MaterialRiskGantt';
import type {QueryIdentity,QueryRecord} from './QueryReportsTypes';
const identity={datasetId:'SYN',version:1,runId:'R',fingerprint:'F',dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00'} as QueryIdentity;
const event={key:'need',label:'净缺口需料日',at:5760,end:null,precision:'day' as const,tone:'gap'};
const r:QueryRecord={id:'shortage:S',values:{sourceKind:'真实净缺口',materialId:'CORN'},need:'D',timeline:{category:'shortage',materialId:'CORN',materialName:'玉米粒',quantity:12,unit:'千克',events:[event],missing:[]}};
const props={rows:[r],from:1,to:15,focusDay:null,density:'fit',onDay:()=>{},onTask:()=>{},onOpen:()=>{},identity,analysisIdentity:identity,preferenceScope:'SYN',api:async()=>({}),query:{view:'E5'},fingerprint:'Q'};
test('material risk chart shows actual material/quantity, dated shortages and explicit unknown events before detail',()=>{
 const unknown={id:'finding:0',values:{sourceKind:'运行问题'},need:'D',timeline:{category:'finding',quantity:null,unit:null,events:[],missing:['时点未保存']}};
 const html=renderToStaticMarkup(<MaterialRiskGantt {...props} rows={[r,unknown]}/>);
 for(const text of ['日期物料风险甘特','玉米粒','12 千克','2026-11-04','时点未保存 · 查看原因与依据','仅按日期定位，不代表全天缺料'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/class="risk-node/g)||[]).length,1);assert.ok(!html.includes('风险已解除'));
});
test('day events fill their date cell in half-hour mode, minute events remain points, and boundaries are half open',()=>{
 const dayHtml=renderToStaticMarkup(<MaterialRiskGantt {...props} focusDay={4}/>);assert.ok(dayHtml.includes('半小时物料风险甘特'));assert.ok(dayHtml.includes('00:30'));assert.ok(dayHtml.includes('仅按日期定位'));
 const minute={...event,at:1927,precision:'minute' as const};assert.equal(riskEventVisible(minute,1927,1944),true);assert.equal(riskEventVisible(minute,1900,1927),false);assert.equal(riskEventVisible(event,5760,7200),true);assert.equal(riskEventVisible(event,7200,8640),false);
 const outside=renderToStaticMarkup(<MaterialRiskGantt {...props} focusDay={7}/>);assert.ok(outside.includes('本窗口外有事件'));assert.ok(!outside.includes('class="risk-node'));
});
