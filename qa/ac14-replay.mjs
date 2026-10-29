import assert from 'node:assert/strict';
import fs from 'node:fs';
import {seed,defs,calculate} from '../server/planner.ts';
import {batchFixture} from './batch-fixture.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
import {jointParameters} from '../src/lib/joint-policy.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {fixture} from './fr027-fixture.mjs';

const at='2026-10-29T00:00:00Z';
const out=process.env.AC14_OUT||'/workspace/temp/issue16-r1/before';
fs.mkdirSync(out,{recursive:true});
const summarize=p=>({status:p.status,batchChecked:p.batchChecked,tasks:p.tasks?.map(t=>({id:t.id,orderId:t.orderId,operation:t.operation,start:t.start,end:t.end,duration:t.duration,quantity:t.quantity,loadKg:t.loadKg,resourceBatchId:t.resourceBatchId})),productionBatches:p.productionBatches,resourceBatches:p.resourceBatches,resourceReservations:p.resourceReservations,materialDemands:p.materialDemands,findings:p.findings,ruleSnapshot:p.ruleSnapshot,verification:p.verification});
const cases=[];
function base(spaceCap='480'){
 const d=batchFixture(seed);
 d.orders[0]['合格需求']='240';
 d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'2'});
 d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':'B'})));
 d.machines.forEach(m=>{m['最小装载kg']='0';m['最大装载kg']='500';});
 d.batchResources.filter(r=>r['资源类型']==='批处理装载').forEach(r=>r['容量']='500');
 d.times.forEach(t=>t['固定分钟']=t['工序编号']==='MIX'?'120':'60');
 d.routes.find(r=>r['工序编号']==='FILL')['最大等待分钟']='10';
 d.batchResources.push({'资源编号':'COLD','资源类型':'共享冷却空间','容量':spaceCap,'单位':'kg','允许程序':'','说明':'UAT13/14 冷却空间验证值'});
 d.resourceClaims=['A','B'].map(id=>({'声明编号':'COLD-'+id,'订单编号':id,'工序编号':'FILL','资源类型':'空间','资源编号':'COLD','需求数量':'240','单位':'kg','提前占用分钟':'0','后延占用分钟':'0','占用口径':'显式逐生产批完整区间','窗口开始偏移分钟':'0','窗口结束偏移分钟':'0','参数来源':'逐项声明'}));
 const storage=d.rules.find(r=>r['规则编号']==='STORAGE');storage['是否启用']='是';storage['参数JSON']=JSON.stringify(jointParameters);
 return d;
}
async function run(name,d){
 const input=JSON.stringify(d),inputIssues=validateInputs(defs,d),f=freezeRunInput(d,{},at),p=calculate(f.executionData,1,at,f.conditions);
 assert.equal(JSON.stringify(d),input,'source input mutated');
 const independent=verifyResourcePolicies(p,f.executionData,f.conditions);
 const independentFull=independentlyVerifyPlan(p,f.executionData.orders,f.executionData.routes,p.rules,at,f.executionData,f.conditions);
 const api=await fixture(null);let apiResult;
 try{const posted=await api.call('/inputs',{revision:0,tables:d});if(posted.status<300){const state=await api.ok('/state');const plan=await api.call('/calculate',{revision:state.revision});assert.equal(JSON.stringify((await api.ok('/state')).data),JSON.stringify(state.data),'calculation mutated saved inputs');
 const verified=plan.status<300?await api.call('/plans/'+plan.body.id+'/verify',{}):null;
 const exported=plan.status<300?await api.call('/export',{planId:plan.body.id}):null;
 const stored=JSON.parse(api.bytes());
 apiResult={verified,exported,stored,inputStatus:posted.status,revision:state.revision,planStatus:plan.status,plan:plan.status<300?summarize(plan.body):plan.body,rawPlanResponse:plan.body,storedOrders:state.data.orders,storageBytes:api.bytes().length};}else apiResult={inputStatus:posted.status,response:posted.body};}finally{await api.close();}
 const result={name,inputIssues,worker:summarize(p),rawWorkerOutput:p,independent,independentFull,api:apiResult};
 fs.writeFileSync(`${out}/${name}-input.json`,JSON.stringify({at,data:d},null,2));
 fs.writeFileSync(`${out}/${name}-output.json`,JSON.stringify(result,null,2));cases.push({name,inputIssues:inputIssues.length,workerTasks:p.tasks.length,apiStatus:apiResult.planStatus??apiResult.inputStatus,findings:p.findings.map(x=>x.code),scope:p.conditions?.checkScope});
 return result;
}
await run('UAT13-480-output-basis',(()=>{const d=base('480');d.machines.filter(m=>m['工序编号']==='FILL').forEach(m=>m['装载计量基准']='合格产出');return d;})());
await run('UAT13-480-input-basis-control',base('480'));
await run('UAT14-400-output-basis',(()=>{const d=base('400');d.machines.filter(m=>m['工序编号']==='FILL').forEach(m=>m['装载计量基准']='合格产出');return d;})());
await run('UAT14-400-input-basis-control',base('400'));
await run('AC14-wait-30-control',(()=>{const d=base('480');d.downtime.push({'设备编号':'FILL01','起始分钟':'0','结束分钟':'150','原因':'冷却晚30分钟可用'});return d;})());
await run('AC14-wait-enabled',(()=>{const d=base('480');d.rules.find(r=>r['规则编号']==='MAX_LAG')['是否启用']='是';return d;})());
await run('AC14-two-600-space-1000',(()=>{const d=base('1000');d.orders.forEach(o=>o['合格需求']='600');d.machines.forEach(m=>m['最大装载kg']='1000');d.batchResources.filter(r=>r['资源类型']==='批处理装载').forEach(r=>r['容量']='1000');d.resourceClaims.forEach(c=>c['需求数量']='600');for(const dep of d.dependencies.filter(r=>r['订单编号']==='B'&&r['资源类型']==='设备'))dep['资源编号']=dep['工序编号']==='MIX'?'MIX02':'FILL02';return d;})());
fs.writeFileSync(`${out}/summary.json`,JSON.stringify(cases,null,2));console.log(JSON.stringify(cases,null,2));
