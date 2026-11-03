import test from 'node:test';import assert from 'node:assert/strict';
import {parameterMaintenanceView as view,parameterBaseline,parameterHistory} from '../server/parameter-maintenance.mjs';
import {changeParameter,parameterView} from '../server/parameter-contract.mjs';
import {hash} from '../server/workbook-model.mjs';
const param=(id,cp,object,field,value,role='P',extra={})=>({'参数编号':id,_cp:cp,'对象编号':object,'参数名称':field,'参数值':value,'单位':field==='计划起始日'?'日序':'天','生效日':'0','失效日':'44',_sourceRole:role,_scope:'dataset',...extra});
function fixture(){return {id:'SYN',version:6,dayZero:'2026-10-31',profile:'excel-qualified-output-202611-r1',parameterContract:'CR-PARAM-UI-20261101:r1',parameterSources:[{fileHash:'P-ONE',mode:'dataset'}],tables:{'配置参数':[param('B5','CP005','GLOBAL','计划起始日','1','B'),param('P5','CP005','GLOBAL','计划起始日','2'),param('E5','CP005','GLOBAL','计划起始日','3','EDIT')],'物料主数据':[{物料编号:'SKU2',物料名称:'第二物料',每箱净重千克:'12'},{物料编号:'SKU1',物料名称:'第一物料'}],'客户与交付':[{客户编号:'C2',客户名称:'客户二',运输天数:'2'},{客户编号:'C1',客户名称:'客户一',运输天数:'1'}],'工艺路线':[{路线工序编号:'RT2',工序名称:'工序二',需求人数:'2'},{路线工序编号:'RT1',工序名称:'工序一',需求人数:'3'}],'工厂日历':Array.from({length:44},(_,i)=>({日序:String(i),生产班次数:i===1?'0':'2',日产能分母:'2'})),'班组资源':[{班组编号:'CREW1',标准日班次数:'2'}]}};}
test('maintenance shows one current logical value, P baseline and missing/read-only catalog items in CP order without mutations',()=>{
 const d=fixture(),before=hash(d),p=view(d,{tab:'global',day:1},'A');
 assert.equal(p.records.filter(r=>r.cp==='CP005').length,1);const start=p.records.find(r=>r.cp==='CP005');assert.equal(start.effectiveValue,'3');assert.equal(start.baselineValue,'2');assert.equal(start.sourceRole,'EDIT');
 const window=p.records.find(r=>r.cp==='CP006');assert.ok(window);assert.equal(window.effectiveValue,undefined);assert.equal(window.status,'未维护');assert.ok(p.records.some(r=>!r.editable));assert.ok(view(d,{tab:'material',cp:'CP018',day:1}).definitions.some(d=>d['参数编号']==='CP018'&&d.immutable));
 assert.deepEqual(p.definitions.map(d=>d['参数编号']),p.definitions.map(d=>d['参数编号']).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));
 assert.equal(parameterBaseline(d).label,'P1');assert.equal(hash(d),before);
 assert.equal(parameterView(d,{cp:'CP005',day:1},'A').records.length,3,'raw provenance remains available to compatible API clients');
});
test('object tables show literal, missing and effective values in separate material/customer/route groups; aliases and locator follow current values',()=>{
 const d=fixture();
 const material=view(d,{tab:'material',cp:'CP016',day:1});assert.deepEqual(material.objectRows.map(r=>r.object),['SKU1','SKU2']);assert.equal(material.objectRows[0].cells[0].status,'未维护');assert.equal(material.objectRows[1].cells[0].effectiveValue,'12');
 const customer=view(d,{tab:'customer',cp:'CP048',day:1});assert.equal(customer.total,2);assert.deepEqual(customer.records.map(r=>r['对象编号']),['C1','C2']);assert.ok(customer.records.every(r=>r.objectTable==='客户与交付'));
 const route=view(d,{tab:'route',cp:'CP120',day:1});assert.equal(route.total,2);assert.ok(route.records.every(r=>r.objectTable==='工艺路线'));
 const located=view(d,{tab:'material',q:'B5',day:1});assert.equal(located.tab,'global');assert.equal(located.records.length,1);assert.equal(located.records[0].effectiveValue,'3');
});
test('calendar uses actual dates and separate daily and crew settings with no fabricated dates or values',()=>{
 const d=fixture(),calendar=view(d,{tab:'calendar',cp:'CP132',month:'2026-11',day:1});assert.equal(calendar.layout,'calendar');assert.equal(calendar.total,30);assert.equal(calendar.objectRows[0].date,'2026-11-01');assert.equal(calendar.objectRows[0].cells[0].effectiveValue,'0');
 const crew=view(d,{tab:'crew',cp:'CP130',day:1});assert.ok(crew.records.every(r=>r.objectTable==='班组资源'));
 const factory=view(d,{tab:'calendar',cp:'CP130',month:'2026-11',day:1});assert.ok(factory.records.every(r=>r.objectTable==='工厂日历'));
 assert.throws(()=>view(d,{day:44}));
});
test('effective periods and zero trial overrides retain their exact semantics, and other actors cannot read trial logs',()=>{
 const d=fixture();d.parameterTrials=[{id:'OWN',actor:'A'},{id:'OTHER',actor:'B'}];d.tables.配置参数=[param('P','CP005','GLOBAL','计划起始日','1','P',{'失效日':'15'}),param('NEXT','CP005','GLOBAL','计划起始日','2','P',{'生效日':'15'})];
 assert.equal(view(d,{tab:'global',cp:'CP005',day:14},'A').records[0].effectiveValue,'1');assert.equal(view(d,{tab:'global',cp:'CP005',day:15},'A').records[0].effectiveValue,'2');
 d.tables.客户与交付[0].运输天数='2';changeParameter(d,{configuration:true,cp:'CP048',objectId:'C2',field:'运输天数',value:'0',unit:'天',from:0,to:44,scope:'trial:OWN'},'A');
 assert.equal(view(d,{tab:'customer',cp:'CP048',object:'C2',day:1,scope:'trial:OWN'},'A').records[0].effectiveValue,'0');assert.equal(view(d,{tab:'customer',cp:'CP048',object:'C2',day:1},'A').records[0].effectiveValue,'2');
 assert.throws(()=>view(d,{scope:'trial:OWN',day:1},'B'));
 assert.equal(parameterHistory(d,{scope:'dataset'},'B').total,0);assert.equal(parameterHistory(d,{scope:'trial:OWN'},'A').total,1);
 const entry=parameterHistory(d,{scope:'trial:OWN'},'A').records[0];assert.equal(entry.before.参数值,'2');assert.equal(entry.after.参数值,'0');assert.equal(d.version,6);
});
test('literal equipment and calendar cells save with valid units; closing a date does not change another date',()=>{
 const d=fixture();d.tables['设备与工装']=[{资源编号:'EQ',资源类别:'设备',标准日产能千克:'1000'}];
 const equipment=view(d,{tab:'resource',cp:'CP100',day:1}).records[0];assert.equal(equipment['单位'],'千克/标准日');
 changeParameter(d,{configuration:true,cp:'CP100',objectId:'EQ',field:'标准日产能千克',value:'1100',unit:equipment['单位'],from:0,to:44},'A');assert.equal(view(d,{tab:'resource',cp:'CP100',day:1}).records[0].effectiveValue,'1100');
 const calendar=view(d,{tab:'calendar',cp:'CP132',month:'2026-11',day:1}),cell=calendar.records.find(p=>p['对象编号']==='2');
 changeParameter(d,{configuration:true,cp:'CP132',objectId:'2',field:'生产班次数',value:'0',unit:cell['单位'],from:0,to:44},'A');
 const after=view(d,{tab:'calendar',cp:'CP132',month:'2026-11',day:1});assert.equal(after.records.find(p=>p['对象编号']==='2').effectiveValue,'0');assert.equal(after.records.find(p=>p['对象编号']==='3').effectiveValue,'2');assert.equal(d.version,6);
});
test('computation snapshot omits maintenance logs and cannot expose other trials through history',async()=>{
 const {cloneForParameters}=await import('../server/workbook-workbench.mjs');const d=fixture();d.parameterChangeLog=[{scope:'trial:OTHER',before:{参数值:'private'},after:{参数值:'private'}}];
 assert.equal(cloneForParameters(d).parameterChangeLog,undefined);assert.equal(parameterHistory(d,{},'A').total,1,'legacy shared online value remains visible, other trial does not');
});
