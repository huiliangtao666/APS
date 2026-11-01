import test,{after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {refreshDerived,hash,inventoryAmount,workbookSchema} from '../server/workbook-model.mjs';
import {supplyReadiness,supplyLots,transitIdentityIssues} from '../server/workbook-supply.mjs';
import {calculateWorkbook,verifyWorkbookPlan} from '../server/workbook-plan.mjs';
import {changeDraft} from '../server/workbook-drafts.mjs';
const base=process.env.SUPPLY_FIXTURE;if(!base)throw Error('SUPPLY_FIXTURE required');
const input=()=>{const d=parseWorkbook(fs.readFileSync(base+'/small.xlsx'),workbookSchema);return refreshDerived({...d,id:'SUPPLY',version:2,profile:'excel-qualified-output-202611-r1',fileHash:'small-source',mapping:JSON.parse(fs.readFileSync(base+'/mapping.json'))});};
const out=(id,value)=>{if(process.env.SUPPLY_OUT)fs.writeFileSync(process.env.SUPPLY_OUT+'/'+id+'.json',JSON.stringify(value,null,2));};
const demand=(d,id,qty,day)=>{Object.assign(d.tables['每日需求'][0],{'成品编号':id,'需求箱数':String(qty/10),'需求日':String(day)});return refreshDerived(d);};

test('IN22 explicit occupancy, half-open release/expiry, quality, clamp and no new reservations',()=>{
 const d=input(),r=d.tables['期初库存'][0];assert.equal(supplyReadiness(d).ready,true,JSON.stringify(supplyReadiness(d).issues));
 assert.deepEqual([2,3,4,5].map(day=>inventoryAmount(r,day)),[0,80,80,0]);
 for(const status of ['待检','冻结']){r['质量状态']=status;assert.equal(inventoryAmount(r,3),0);}
 r['质量状态']='已放行';r['期初已占用量']='120';assert.equal(inventoryAmount(r,3),0);assert.equal(supplyReadiness(d).ready,false);
 const actual=[];for(const day of [2,3,4,5]){const data=demand(input(),'MOCK-RAW',80,day),before=hash(data),p=calculateWorkbook(data,{startDay:day,endDay:day+1,currentDay:day});assert.equal(p.demandSummary.scheduled,[3,4].includes(day)?1:0);assert.equal(hash(data),before);actual.push({day,plan:p});}
 for(const status of ['待检','冻结']){const data=demand(input(),'MOCK-RAW',80,3);data.tables['期初库存'][0]['质量状态']=status;assert.equal(calculateWorkbook(data,{startDay:3,endDay:4,currentDay:3}).demandSummary.scheduled,0);}
 out('in22',actual);
});

test('IN24 transit inspection floor, source/status, PO identity, expiry and waiting',()=>{
 const d=demand(input(),'MOCK-RAW',100,4);d.tables['期初库存'][0]['当前数量']='20';
 const r={'在途记录编号':'T1','采购订单编号':'PO1','订单行号':'1','物料编号':'MOCK-RAW','供应商编号':'MOCK-S','供货关系编号':'MOCK-SUP','订购数量':'100','数量单位':'千克','约定到货日':'4','预计放行日':'4','预计到期日':'10','在途状态':'在途'};
 d.tables['既有采购在途']=[r];d.tables['供应商与供货条件'][0]['检验天数']='2';refreshDerived(d);
 assert.equal(supplyLots(d).find(l=>l.id==='transit:T1').ready,6);
 const before=calculateWorkbook(d,{startDay:4,endDay:5,currentDay:4});assert.equal(before.demandSummary.scheduled,0);
 const delayed=calculateWorkbook(d,{startDay:4,endDay:9,currentDay:4});assert.equal(delayed.demandSummary.scheduled,1);assert.equal(delayed.demandResults[0].readyDay,6);assert.equal(delayed.allocations.find(a=>a.supplyId==='transit:T1').conditional,true);assert.equal(delayed.verification.status,'pass');
 const at6=calculateWorkbook(demand(structuredClone(d),'MOCK-RAW',100,6),{startDay:6,endDay:7,currentDay:6});assert.equal(at6.demandSummary.scheduled,1);
 const bad=structuredClone(d);bad.tables['既有采购在途'].push({...r,'在途记录编号':'T2','订单行号':'01'});assert.equal(supplyReadiness(bad).ready,false);
 for(const status of ['作废','取消','冻结','待检']){const data=structuredClone(d);data.tables['既有采购在途'][0]['在途状态']=status;assert.equal(calculateWorkbook(data,{startDay:6,endDay:7,currentDay:6}).demandSummary.scheduled,0);}
 const expired=calculateWorkbook(demand(structuredClone(d),'MOCK-RAW',100,10),{startDay:10,endDay:11,currentDay:10});assert.equal(expired.demandSummary.scheduled,0);
 out('in24',{before,delayed,at6,expired});
});

test('IN25 real WIP remaining work/feed, no historical reissue, missing fields reject',()=>{
 const d=input(),before=hash(d),p=calculateWorkbook(d,{startDay:3,endDay:8,currentDay:3});assert.equal(p.verification.status,'pass',JSON.stringify(p.verification));assert.equal(p.demandSummary.scheduled,1);
 assert.equal(p.allocations.filter(a=>a.kind==='WIP剩余待投').reduce((n,a)=>n+a.quantity,0),10);
 assert.equal(p.allocations.filter(a=>a.materialId==='MOCK-HIST').length,0);assert.ok(p.allocations.some(a=>a.supplyId==='wip:MOCK-WIP'&&a.conditional));assert.equal(hash(d),before);
 for(const field of ['remaining_material_bom_ids','remaining_route_steps','current_occupancy_day_interval','remaining_tool_count']){const bad=structuredClone(d);delete bad.mapping.wip_remaining[0][field];assert.equal(supplyReadiness(bad).ready,false,field);assert.throws(()=>calculateWorkbook(bad,{startDay:3,endDay:8,currentDay:3}),/尚未就绪/);}
 const wrong=structuredClone(d);wrong.mapping.wip_remaining[0].remaining_material_bom_ids=['MOCK-HIST-BOM'];assert.equal(supplyReadiness(wrong).ready,false);
 const noFeed=structuredClone(d);noFeed.tables['期初库存'].find(l=>l['物料编号']==='MOCK-REM')['当前数量']='0';const missing=calculateWorkbook(noFeed,{startDay:3,endDay:8,currentDay:3});assert.ok(!missing.allocations.some(a=>a.supplyId==='wip:MOCK-WIP'));assert.ok(missing.findings.some(f=>f.code==='WIP_REMAINING'));out('in25',{p,missing});
});

test('IN28 pure state edits are explicit, numeric/MOQ/date failures never change original',()=>{
 const d=input(),run={id:'RUN',datasetId:d.id,version:2,status:'partial',result:{suggestions:[{id:'S1',materialId:'MOCK-RAW',unit:'千克',netGap:100,needDay:6,quantity:100,relationId:'MOCK-SUP',orderDay:5,availableDay:6}]}};
 const draft=changeDraft(d,{sourceRun:'RUN',suggestionId:'S1',currentDay:1},run).draft;assert.equal(draft.status,'draft');assert.ok(!supplyLots(d).some(l=>l.id===draft.supplyIdentity));
 changeDraft(d,{id:draft.id,action:'adopt',currentDay:1});assert.equal(supplyLots(d).filter(l=>l.id===draft.supplyIdentity).length,1);
 changeDraft(d,{id:draft.id,changes:{quantity:'110'},currentDay:1});assert.equal(d.drafts[0].status,'draft');assert.ok(!supplyLots(d).some(l=>l.id===draft.supplyIdentity));
 for(const body of [{action:'unknown'},{changes:{quantity:''}},{changes:{quantity:-1}},{changes:{quantity:Infinity}},{changes:{orderDay:0}},{changes:{expiryDay:6}},{changes:{relationId:'missing'}},{changes:{status:'adopted'}},{action:'adopt',changes:{quantity:100}},{action:'adopt'}]){const old=hash(d);assert.throws(()=>changeDraft(d,{id:draft.id,currentDay:1,...body,...(body.action==='adopt'&&!body.changes?{currentDay:undefined}:{})}));assert.equal(hash(d),old);}
 changeDraft(d,{id:draft.id,action:'void'});assert.equal(d.drafts[0].status,'void');changeDraft(d,{id:draft.id,changes:{quantity:120},currentDay:1});assert.equal(d.drafts[0].status,'draft');out('in28-pure',d.drafts);
});

test('independent verification rejects early, excessive and wrong-material supply allocations',()=>{
 const d=demand(input(),'MOCK-RAW',80,3),p=calculateWorkbook(d,{startDay:3,endDay:4,currentDay:3});
 for(const change of [{feedDay:2},{quantity:81},{materialId:'MOCK-HIST'}]){const bad=structuredClone(p),a=bad.allocations.find(a=>a.supplyId==='inventory:MOCK-LOT');Object.assign(a,change);assert.equal(verifyWorkbookPlan(d,bad).status,'problem');}
 const w=calculateWorkbook(input(),{startDay:3,endDay:8,currentDay:3});const bad=structuredClone(w);bad.allocations.find(a=>a.supplyId==='wip:MOCK-WIP').conditional=false;assert.equal(verifyWorkbookPlan(input(),bad).status,'problem');
});

after(()=>out('memory-core',{node:process.version,execArgv:process.execArgv,memory:process.memoryUsage(),resourceUsage:process.resourceUsage()}));

test('duplicate imported PO identity retains exact row/cell and is rejected by application identity gate',()=>{
 const d=parseWorkbook(fs.readFileSync(base+'/duplicate-po.xlsx'),workbookSchema),rs=d.tables['既有采购在途'];assert.equal(rs.length,2);assert.equal(rs[1]['订单行号'],'01');const issues=transitIdentityIssues(rs);assert.equal(issues.length,1);assert.equal(issues[0].record,'T2');assert.equal(issues[0].row,4);assert.ok(issues[0].cell);out('duplicate-po',issues);
});
