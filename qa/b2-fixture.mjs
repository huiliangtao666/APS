import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {seed,defs} from '../server/planner.ts';
import {pool} from './p10-core-fixture.mjs';
import {jointParameters} from '../src/lib/joint-policy.mjs';
export const b2Seed='B2-20261031-explicit-v1';
export const canon=(key,row)=>Object.fromEntries(defs.find(d=>d.key===key).fields.map(f=>[f,String(row[f]??'')]));
// QA-only explicit adapter, not a second production importer. Raw originals remain in evidence.
export function b2Scenario(id='07',root=process.env.B2_INPUTS){
 const file=path.join(root,'UAT-'+id,'场景完整输入与参考结果.json'),bytes=fs.readFileSync(file),raw=JSON.parse(bytes),tables=raw.tables;
 const table=n=>tables[Object.keys(tables).find(k=>k.startsWith(n+'_'))],d=structuredClone(seed);
 for(const [key,n] of [['factoryLines','01'],['products','07'],['materials','08'],['calendars','02'],['downtime','04'],['routes','10'],['times','11']])d[key]=table(n).map(r=>canon(key,r));
 const ops=new Set(d.routes.map(r=>r['工序编号']));d.machines=table('03').filter(r=>ops.has(r['工序编号'])).map(r=>canon('machines',r));
 d.orders=table('17').map(r=>canon('orders',{...r,'合格需求':r['合格需求kg'],'数量单位':'kg','是否允许拆分':'否','需求类型':'正式订单','订单状态':'有效','已完成合格数量':'0'}));
 const labor=table('16').some(r=>r['规则编号']==='LABOR'&&r['是否启用']==='是');
 d.tools=table('05').map(r=>canon('tools',{'工装编码':r['资源编号'],'工装名称':r['资源名称'],'适用任务':'MIX|FILL','可用数量':r['可用数量'],'每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','是否启用':'是','说明':`${raw.id} 原05 + 显式QA适用工序/需求1/偏移0；非生产默认`,'可用起始分钟':r['最早可用分钟'],'可用结束分钟':r['最晚可用分钟']}));
 d.dependencies=table('12').filter(r=>r['资源类型']==='设备'||labor&&r['资源类型']==='人员').map((r,i)=>canon('dependencies',{...r,...(r['资源类型']==='人员'?{'资源类型':'人员技能','所需班次':'QA整窗','人员岗位编号':'POST-'+i,'人员参与阶段':'显式完整工序','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是'}:{})}));
 d.resourceClaims=table('12').filter(r=>['模具','工具'].includes(r['资源类型'])).map((r,i)=>canon('resourceClaims',{...r,'声明编号':'B2-'+id+'-'+i,'资源类型':'工装','单位':'套','占用口径':'显式逐生产批完整区间','参数来源':'逐项声明','窗口开始偏移分钟':'0','窗口结束偏移分钟':'0'}));
 d.personnelGroups=labor?table('06').map(r=>canon('personnelGroups',{'人员组编号':r['人员组编号'],'人员组名称':raw.id+' 原06资格组','人员数量':r['可用人数'],'技能':r['技能'],'班次':'QA整窗','可用起始分钟':r['起始分钟'],'可用结束分钟':r['结束分钟'],poolId:'POOL-'+r['人员组编号']})):[];
 d.personnelPools=d.personnelGroups.map(g=>canon('personnelPools',{...pool(g.poolId,g['人员数量']),'容量来源':`${raw.id} 原06人数；本QA显式每组独立池映射，非客户事实`,'策略来源':b2Seed+'；共用是/无互斥/依赖声明/无交接'}));
 d.rules=d.rules.map(r=>({...r,'是否启用':['MACHINE','PRECEDENCE','CALENDAR','MOLD','INVENTORY',...(labor?['LABOR']:[])].includes(r['规则编号'])?'是':'否',...(r['规则编号']==='MOLD'?{'参数JSON':JSON.stringify(jointParameters)}:{})}));
 for(const def of defs)d[def.key]=(d[def.key]||[]).map(r=>canon(def.key,r));
 return {data:d,provenance:{id:raw.id,seed:b2Seed,sourceFile:file,sha256:createHash('sha256').update(bytes).digest('hex'),sourceVersion:raw.version,rawRules:raw.enabled,scope:'Task-level normalized resource chain, original19 import separately evaluated; no QA UAT signoff',explicitQAChoices:['原17: 否/正式订单/有效/已完成0/kg','只选择原路线存在的设备（不替代原03批导验证）','原05: MIX|FILL/每任务1/偏移0，声明按原12','原06: QA整窗班次与每组独立池显式映射，参与阶段完整/偏移0/释放是','LABOR关闭的工装阶段不采用人员依赖；原19未删改','物料关闭，本B2不声称BOM/物料场景通过']}};
}

export async function b2Worker(f,selection){
 const state=await f.ok('/state'),run=await f.ok('/runs',{revision:state.revision,selection:selection||{orderIds:state.data.orders.map(o=>o['订单编号']),startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:state.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'}});
 for(let i=0;i<1000;i++){
  const current=await f.ok('/runs/'+run.id);
  if(['completed','partial'].includes(current.status))return {run:current,input:await f.ok('/runs/'+run.id+'/inputs'),plan:(await f.ok('/plans')).find(p=>p.id===current.planId)};
  if(['failed','timed_out','cancelled'].includes(current.status))throw Error(JSON.stringify(current));
  await new Promise(r=>setTimeout(r,10));
 }
 throw Error('B2 Worker timeout');
}
