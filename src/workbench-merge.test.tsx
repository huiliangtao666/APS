import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import App from './App';
import {PersonnelToolHeatmap} from './EquipmentSchedule';
import {rebaseParameterDraft,ParameterMaintenanceView} from './ParameterMaintenanceView';
import {QueryReports,QueryBomPreview,editableQuerySources} from './QueryReports';
import {QueryTable} from './QueryReportsControls';
import {pathProducts} from './BomPathProducts';
import {queryDraftForView,queryInitial,queryValue,type QueryCatalog,type QueryColumn} from './QueryReportsTypes';
const api=async()=>{throw Error('Static rendering must not call any API');};
test('inventory date cells distinguish unknowns from zero and show compact metrics without technical keys',()=>{
 const cell:QueryColumn={key:'2026-11-01',label:'2026-11-01',format:'inventory',sortable:false};
 assert.equal(queryValue({quantity:10,reserved:0,available:null},cell),'10 / 0 / —');assert.equal(queryValue(undefined,cell),'— 未提供');
 const columns:QueryColumn[]=[{key:'materialId',label:'物料编码',fixed:true,fixedLabel:'固定维度',sticky:'material'},{key:'质量状态',label:'质量状态',fixed:true,fixedLabel:'固定维度',sticky:'quality'},cell];
 const html=renderToStaticMarkup(<QueryTable id="INV" columns={columns} records={[{id:'group:internal',values:{materialId:'M1',质量状态:'待检','2026-11-01':{quantity:10,reserved:0,available:null}}}]} onOpen={()=>{}} onSort={()=>{}}/>);
 assert.ok(!html.includes('<th>业务键'));assert.ok(!html.includes('>group:internal<'));assert.ok(html.includes('10 / 0 / —'));assert.ok(!html.includes('按2026-11-01排序'));assert.ok(html.includes('固定维度'));
});
test('daily and detailed demand drop removed cached filters and preserves product/customer/region selection',()=>{
 const catalog={identity:{datasetId:'SYN',version:1,fingerprint:'Q',dayZero:'2026-10-31'},preferenceScope:'SYN',views:[],fromDate:'2026-11-01',toDateInclusive:'2026-11-14'} as QueryCatalog;
 const draft={...queryInitial(catalog),filters:Object.fromEntries(['material:成品','material:半成品','material:原辅料','material:包装材料','客户等级','客户编号','区域编号'].map(key=>[key,{mode:'NONE' as const}]))};
 const view={id:'demand.details',report:'demand',label:'需求明细',key:'id',columns:[],filters:['material:成品','客户编号','区域编号'].map(key=>({key,label:key}))};
 for(const id of ['demand.daily','demand.details'])assert.deepEqual(Object.keys(queryDraftForView({...view,id},draft).filters),['material:成品','客户编号','区域编号']);
 assert.equal(queryDraftForView({...view,id:'bom.materials'},draft),draft);
});
test('route master drops hidden cached categories and preserves route, product, equipment and crew selections',()=>{
 const catalog={fromDate:'2026-11-01',toDateInclusive:'2026-11-14'} as QueryCatalog;
 const keys=['material:成品','路线编号','设备组编号','班组编号'];
 const view={id:'capacity.routes',report:'capacity',label:'工艺与班组',key:'id',columns:[],filters:keys.map(key=>({key,label:key}))};
 const draft={...queryInitial(catalog),filters:Object.fromEntries([...keys,'material:半成品','material:原辅料','material:包装材料'].map(key=>[key,{mode:'NONE' as const}]))};
 assert.deepEqual(Object.keys(queryDraftForView(view,draft).filters),keys);
 assert.equal(queryDraftForView({...view,id:'capacity.daily'},draft),draft);
});
test('stop query clears hidden keyword, BOM and filters while retaining resource and date interval',()=>{
 const catalog={fromDate:'2026-11-02',toDateInclusive:'2026-11-08'} as QueryCatalog;
 const draft={...queryInitial(catalog),q:'OLD',includeBom:true,filters:{资源编号:{mode:'NONE' as const},停机类型:{mode:'NONE' as const},'material:成品':{mode:'NONE' as const}}};
 const view={id:'capacity.stops',report:'capacity',label:'停机安排',key:'id',columns:[],filters:[{key:'资源编号',label:'资源'}]};
 const clean=queryDraftForView(view,draft);assert.deepEqual(clean,{...draft,q:'',includeBom:false,filters:{资源编号:{mode:'NONE'}}});
 assert.equal(clean.fromDate,'2026-11-02');assert.equal(clean.toDateInclusive,'2026-11-08');
});
test('equipment query keeps only resource/group/category selections in cached navigation',()=>{
 const catalog={fromDate:'2026-11-01',toDateInclusive:'2026-11-14'} as QueryCatalog;
 const keys=['资源编号','资源组编号','资源类别'],view={id:'capacity.equipment',report:'capacity',label:'设备能力',key:'id',columns:[],filters:keys.map(key=>({key,label:key}))};
 const draft={...queryInitial(catalog),q:'OLD',includeBom:true,filters:Object.fromEntries([...keys,'material:成品','material:半成品','停机类型'].map(key=>[key,{mode:'NONE' as const}]))};
 const clean=queryDraftForView(view,draft);assert.equal(clean.q,'');assert.equal(clean.includeBom,false);assert.deepEqual(Object.keys(clean.filters),keys);
 assert.equal(queryDraftForView({...view,id:'capacity.daily'},draft),draft);
});
const heatRow=(resource:string,day:number,dimension:string,peak:number|null,available:number|null)=>({id:resource+'|'+day,values:{resource,name:'演示'+resource,day,dimension,peak,available,remaining:peak===null||available===null?null:available-peak}});
const heatHtml=(rows:ReturnType<typeof heatRow>[])=>renderToStaticMarkup(<PersonnelToolHeatmap rows={rows} from={1} to={4} identity={{datasetId:'SYN',version:1,runId:'FROZEN',fingerprint:'Q',dayZero:'2026-10-31'}} preferenceScope="SYN" onOpen={()=>{}}/>);
const heatButton=(html:string,label:string)=>(html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[]).find(button=>button.includes('aria-label="'+label))||'';
test('personnel and tool heatmap preserves each frozen daily value and separates people from physical sets',()=>{
 const rows=[heatRow('C1',1,'人',3,5),heatRow('T1',1,'实体套',2,3)],before=JSON.stringify(rows),html=heatHtml(rows);
 assert.ok(html.includes('人员工装逐日占用热力图'));assert.ok(html.includes('人员 · 人'));assert.ok(html.includes('工装 · 实体套'));
 assert.ok(heatButton(html,'C1 / 2026-11-01 / 并发峰值：3 人').includes('余量：2 人'));
 assert.ok(heatButton(html,'T1 / 2026-11-01 / 并发峰值：2 实体套').includes('余量：1 实体套'));
 assert.equal(JSON.stringify(rows),before);
});
test('personnel chart distinguishes known zero, unknown values, missing capacity and unloaded page cells',()=>{
 const html=heatHtml([heatRow('ZERO',1,'人',0,5),heatRow('UNKNOWN',1,'人',null,5),heatRow('NOBASE',1,'实体套',2,null)]);
 const zero=heatButton(html,'ZERO / 2026-11-01 / 并发峰值：0 人');assert.ok(zero.includes('>0/5</button>'));assert.ok(!zero.includes('equipment-unknown'));
 const unknown=heatButton(html,'UNKNOWN / 2026-11-01 / 并发峰值：未提供');assert.ok(unknown.includes('equipment-unknown'));assert.ok(!unknown.includes('disabled'));
 const unloaded=heatButton(html,'ZERO / 2026-11-02 / 并发峰值：本页未加载');assert.ok(unloaded.includes('disabled'));assert.ok(unloaded.includes('equipment-unknown'));
 const noBase=heatButton(html,'NOBASE / 2026-11-01 / 并发峰值：2 实体套');assert.ok(noBase.includes('>2/—</button>'));assert.ok(noBase.includes('personnel-load-unknown'));assert.ok(noBase.includes('可用数量：未提供'));
});
test('personnel chart warns about overcapacity including zero capacity and preserves negative remaining quantity',()=>{
 const html=heatHtml([heatRow('CREW',1,'人',6,5),heatRow('TOOL',1,'实体套',1,0),heatRow('EMPTY',1,'实体套',0,0)]);
 for(const id of ['CREW','TOOL']){const button=heatButton(html,id+' / 2026-11-01 /');assert.ok(button.includes('equipment-over-capacity'));assert.ok(button.includes('超占提示'));assert.ok(button.includes('余量：-1'));}
 assert.ok(!heatButton(html,'EMPTY / 2026-11-01 /').includes('equipment-over-capacity'));
});
test('parameter conflict rebase binds the new winning source without losing the user value or period',()=>{
 const draft={cp:'CP006',objectId:'GLOBAL',field:'窗口天数',id:'P6',sourceRole:'P',sourceFrom:'0',value:'17',from:'1',to:'15',expectedVersion:6,expectedParameterRevision:0};
 const view={version:6,parameterRevision:1,records:[{cp:'CP006','对象编号':'GLOBAL','参数名称':'窗口天数','参数编号':'EDIT6','生效日':'0',sourceRole:'EDIT',adoptable:true,scope:'dataset'}]};
 const rebased=rebaseParameterDraft(draft,view,'dataset');assert.equal(rebased.id,'EDIT6');assert.equal(rebased.expectedVersion,6);assert.equal(rebased.expectedParameterRevision,1);assert.equal(rebased.sourceRole,'EDIT');assert.equal(rebased.value,'17');assert.equal(rebased.from,'1');assert.equal(rebased.to,'15');
 assert.equal(rebaseParameterDraft(draft,view,'trial:own').id,undefined,'inherited shared source must create a trial override');
});
test('parameter object matrix uses one row per object with current value and visible missing state',()=>{
 const view={layout:'objects',cp:'CP016',fields:['每箱净重千克'],definitions:[{'参数编号':'CP016','中文配置项':'每箱净重'}],objectRows:[{id:'SKU1',object:'SKU1',name:'成品一',cells:[{recordKey:'S1','参数名称':'每箱净重千克',effectiveValue:'6','单位':'千克/箱',status:'当前有效',editable:true}]},{id:'SKU2',object:'SKU2',name:'成品二',cells:[{recordKey:'S2','参数名称':'每箱净重千克',status:'未维护',editable:true}]}]};
 const html=renderToStaticMarkup(<ParameterMaintenanceView view={view} canWrite onEdit={()=>{}} onRelation={()=>{}}/>);assert.ok(html.includes('SKU1'));assert.ok(html.includes('SKU2'));assert.ok(html.includes('填写'));assert.ok(html.includes('6'));assert.equal((html.match(/<tbody><tr|<\/tr><tr/g)||[]).length,2);
});
test('active app exposes only four consolidated workbench pages and no independent legacy data source',()=>{
 const html=renderToStaticMarkup(<App/>);
 assert.ok(!html.includes('class="hero"'));assert.ok(html.includes('class="workbook-navigation-host"'));
 for(const name of ['排程流程','业务数据查询与维护','配置参数查询与维护','排程结果'])assert.ok(html.includes('>'+name+'</button>'),name);
 for(const name of ['>工装配置</button>','>业务数据</button>','>五类业务查询</button>','标准投入作用范围','原生CSV与输入维护','原生报表','兼容历史模式'])assert.ok(!html.includes(name),name);
});
test('maintenance targets require real editable source keys and deduplicate repeated references',()=>{
 const record={id:'sum',values:{quantity:100},refs:[{table:'每日需求',key:'DE1'},{table:'每日需求',key:'DE1'},{table:'每日成品汇总',key:'R1'},{table:'配置参数',key:'PA1'},{table:'每日需求',key:''}]};
 assert.deepEqual(editableQuerySources(record,['每日需求']),[{table:'每日需求',key:'DE1'}]);
 assert.deepEqual(editableQuerySources({id:'reference',values:{id:'DE1'}},['每日需求']),[]);
});
test('historical query disables raw maintenance entry while current query exposes the same entry',()=>{
 const props={api,context:{datasetId:'SYN',version:1},canExport:false,onClose:()=>{},onManageData:()=>{}};
 assert.match(renderToStaticMarkup(<QueryReports {...props}/>),/>原始数据维护<\/button>/);
 const old=renderToStaticMarkup(<QueryReports {...props} context={{...props.context,runId:'FROZEN'}}/>);
 assert.match(old,/<button disabled="" title="历史运行只读/);
});
test('read-only tables have no write column; current-source action is rendered only when supplied',()=>{
 const props={id:'SYN',columns:[{key:'id',label:'编号',fixed:true}],records:[{id:'DE1',values:{id:'DE1'}}]};
 assert.ok(!renderToStaticMarkup(<QueryTable {...props}/>).includes('<th>维护</th>'));
 assert.ok(renderToStaticMarkup(<QueryTable {...props} rowActions={()=> <button>维护来源</button>}/>).includes('<th>维护</th>'));
});
test('BOM diagram defaults to all current-page roots, retains shared/disconnected nodes and discloses pagination',()=>{
 const identity={datasetId:'SYN',version:1,fingerprint:'Q',dayZero:'2026-10-31'};
 const records=[['FG001','SF001'],['FG002','SF001'],['SF001','RM001'],['FG003','PK001']].map(([parent,child],i)=>({id:'B'+i,values:{父项编号:parent,子项编号:child}}));
 const html=renderToStaticMarkup(<QueryBomPreview view="bom.relations" identity={identity} page={{identity,view:'bom.relations',queryFingerprint:'Q',total:10,offset:0,nextOffset:4,columns:[],records}} onOpen={()=>{}}/>);
 assert.match(html,/<option value="" selected="">全选（3 个根项）/);
 for(const id of ['FG001','FG002','FG003','SF001','RM001','PK001'])assert.ok(html.includes('aria-label="'+id+'，查看关联记录"'),id);
 assert.equal((html.match(/class="qr-bom-edge"/g)||[]).length,4);
 assert.ok(html.includes('图示仅含本页，其余请翻页查看'));
});
test('compact lead-time diagram preserves fractional durations and reference meaning',()=>{
 const identity={datasetId:'SYN',version:1,fingerprint:'Q',dayZero:'2026-10-31'};
 const record={id:'P1',rootMaterial:{id:'FG001',name:'演示成品',category:'成品'},values:{root:'FG001',materialId:'SF001',sequence:1,ownLeadDays:0.5,cumulativeLeadDays:1.25}};
 const html=renderToStaticMarkup(<QueryBomPreview view="bom.paths" identity={identity} page={{identity,view:'bom.paths',queryFingerprint:'Q',total:1,offset:0,nextOffset:null,columns:[],records:[record]}} onOpen={()=>{}}/>);
 assert.ok(html.includes('0.5天'));assert.ok(html.includes('结束偏移1.25天'));assert.ok(html.includes('非实际开工'));
});
test('path products use imported category, retain descendant records and never infer finished products from ID prefixes',()=>{
 const record=(id:string,category:string)=>({id,rootMaterial:{id,name:id,category},values:{root:id,materialId:'RM'}});
 const items=[record('CUSTOM-ID','成品'),record('FG-looking','半成品'),record('RAW','原辅料'),{...record('UNKNOWN',''),rootMaterial:null},{...record('BAD','成品'),values:{root:'OTHER',materialId:'RM'}}];
 assert.deepEqual(pathProducts(items).map(p=>[p.id,p.records.length]),[['CUSTOM-ID',1]]);
 const identity={datasetId:'SYN',version:1,fingerprint:'Q',dayZero:'2026-10-31'};
 const html=renderToStaticMarkup(<QueryBomPreview view="bom.paths" identity={identity} page={{identity,view:'bom.paths',queryFingerprint:'Q',total:items.length,offset:0,nextOffset:null,columns:[],records:items}} onOpen={()=>{}}/>);
 assert.ok(html.includes('图示成品'));assert.ok(html.includes('全选（1）'));assert.equal((html.match(/class="qr-bom-path-group"/g)||[]).length,1);
});
