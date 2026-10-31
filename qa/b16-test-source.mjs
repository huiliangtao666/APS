import fs from 'node:fs';import {createHash} from 'node:crypto';
import {fixture} from './b16-test-fixture.mjs';
import {claim} from './joint-fixture.mjs';
// Test-only, explicit normalized mapping. This never imports into the application.
// CSV parser retains literal newlines/escaped quotes; oracle also uses Python csv.
export function parseCsv(s){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}else cell+=c;}
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}const header=rows.shift();header[0]=header[0].replace(/^\uFEFF/,'');return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]??''])));
}
export function sourceFixture(){
 const f=fixture(),d=f.data,dir=new URL('../sample-data/UAT-16/baseline-v0.3/',import.meta.url),provenance=[];
 const read=prefix=>{const name=fs.readdirSync(dir).find(n=>n.startsWith(prefix)&&n.endsWith('.csv')),bytes=fs.readFileSync(new URL(name,dir));provenance.push({path:'sample-data/UAT-16/baseline-v0.3/'+name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return parseCsv(bytes.toString('utf8'));};
 const raw={};for(let i=1;i<=19;i++)raw[String(i).padStart(2,'0')]=read(String(i).padStart(2,'0')+'_');
 d.factoryLines=raw['01'];d.machines=raw['03'];d.products=raw['07'];d.materials=raw['08'];d.routes=raw['10'];d.times=raw['11'];d.calendars=raw['02'];d.downtime=raw['04'];d.rules=raw['16'];
 d.orders=raw['17'].map(r=>({...r,'合格需求':r['合格需求kg'],'数量单位':'kg','已完成合格数量':'0','是否允许拆分':'否'}));
 d.bom=raw['09'].map(r=>({'版本编号':'SOURCE-MOCK-V1','产品编号':r['产品编号'],'生效日期':'2026-01-01','投料工序编号':r['投料工序'],'用量类型':'BOM物料','物料编号':r['物料编号'],'配置用量':r['定额'],'用量单位':'kg','用量基准':r['计量基准'],'损坏比例':r['损坏比例'],'收率/损耗口径备注':''}));
 const iso=m=>new Date(Date.parse('2026-11-02T08:00:00+08:00')+Number(m)*60000).toISOString().replace('.000Z','Z');
 d.inventory=raw['13'].map(r=>({'批次编号':r['批次编号'],'物料编号':r['物料编号'],'账面数量':r['库存kg或个'],'已占用数量':r['已占用kg或个'],'质量状态':r['质量状态'],'有效期':'2026-11-03','预计可用时间':iso(r['最早可用分钟']),'位置':'原13显式测试映射'}));
 d.supplies=raw['14'].map(r=>({'供给编号':r['批次编号'],'批次编号':r['批次编号'],'物料编号':r['物料编号'],'预计数量':r['到料kg或个'],'预计到达时间':iso(r['到达分钟']),'预计可用时间':iso(r['最早可用分钟']),'质量状态':r['质量状态'],'有效期':'2026-11-03'}));
 d.supplyUses=[{'引用编号':'SOURCE-B-S90','订单编号':'B','工序编号':'MIX','供给编号':'RCPT-SHARED','使用数量':'162.5'}];
 d.tools=raw['05'].map(r=>({'工装编码':r['资源编号'],'可用数量':r['可用数量'],'可用起始分钟':r['最早可用分钟'],'可用结束分钟':r['最晚可用分钟'],'是否启用':'是','提前占用分钟':'0','后延占用分钟':'0'}));
 d.personnelGroups=raw['06'].map(r=>({'人员组编号':r['人员组编号'],'技能':r['技能'],'人员数量':r['可用人数'],'可用起始分钟':r['起始分钟'],'可用结束分钟':r['结束分钟'],'班次':'SOURCE-MOCK-DAY'}));
 d.dependencies=raw['12'].filter(r=>['设备','物料','人员'].includes(r['资源类型'])).map(r=>r['资源类型']==='人员'?{...r,'资源类型':'人员技能','所需班次':'SOURCE-MOCK-DAY','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'否'}:r);
 d.resourceClaims=raw['12'].filter(r=>['模具','工具'].includes(r['资源类型'])).map((r,i)=>claim('SOURCE-'+i,r['订单编号'],r['工序编号'],r['资源编号'],'工装',r['需求数量'],'套',r['提前占用分钟'],r['后延占用分钟']));
 f.profile.source='v0.3 original UAT16 19 CSV, test-only explicit normalized mapping';f.profile.version='source-mock16-v1';
 // Original files have no product applicability table: these are named, editable
 // mock mappings for this domain test, never inferred customer defaults.
 f.profile.products=[{productId:'HC40',lineIds:['L01','L02']},{productId:'HC60',lineIds:['L02']}];
 f.profile.resources=[...raw['05'].map(r=>({type:'工装',resourceId:r['资源编号'],factoryId:'F01',lineIds:['L01','L02'],allowCrossLine:true,capacity:r['可用数量'],unit:'套'})),...raw['06'].map(r=>({type:'人员',resourceId:r['人员组编号'],factoryId:'F01',lineIds:['L01','L02'],allowCrossLine:true,capacity:r['可用人数'],unit:'人'}))];
 f.profile.materials=d.materials.map(r=>({materialId:r['物料编号'],factoryId:'F01',lineIds:['L01','L02']}));
 f.conditions.enabledRuleIds=d.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);f.plan.rules=f.conditions.enabledRuleIds;f.plan.resourceReservations=[];
 for(const t of f.plan.tasks){const o=d.orders.find(o=>o['订单编号']===t.orderId);t.productId=o['产品编号'];t.machine=d.dependencies.find(r=>r['订单编号']===t.orderId&&r['工序编号']===t.operation&&r['资源类型']==='设备')['资源编号'];
  for(const c of d.resourceClaims.filter(r=>r['订单编号']===t.orderId&&r['工序编号']===t.operation))f.plan.resourceReservations.push({id:t.id+'-'+c['资源编号'],type:'工装',resourceId:c['资源编号'],taskId:t.id,taskIds:[t.id],declarationId:c['声明编号'],start:t.start,end:t.end,quantity:c['需求数量'],unit:'套'});
  f.plan.resourceReservations.push({id:t.id+'-LP01',type:'人员',resourceId:'LP01',taskId:t.id,taskIds:[t.id],start:t.start,end:t.end,quantity:'1',unit:'人',requiredSkill:'综合操作',providedSkill:'综合操作',relationId:'',roleSource:t.orderId,occupationPolicies:[]});
 }
 return {...f,provenance,raw,mappingNotes:['No production CSV import performed','Explicit MOCK order kg/unsplit/zero-completed and BOM version/effective date','Minute0 anchored at 2026-11-02 08:00+08; expiry day mapped only for this day1 test','Explicit MOCK shift/source supply reference and product applicability; absent from original tables','Original LP01 covers MIX AND FILL, T01 MIX=3, G01 FILL=1, AUX10 not substituted']};
}
