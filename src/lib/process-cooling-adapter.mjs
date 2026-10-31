import {quantityMath as Q} from './material-allocation.mjs';
import {inheritedCalendarId} from './factory-lines.mjs';
import {allowedWindows} from './working-windows.mjs';
import {scheduleCoolingPairs} from './process-cooling.mjs';
import {PLAN_TIME_ORIGIN} from './expected-supply.mjs';

const one=(rows,label)=>{if(rows.length!==1)throw Error(`${label} 须唯一，实际 ${rows.length}`);return rows[0];};
const exact=x=>Q.fromExact(x);
const n=(r,k)=>{const raw=String(r[k]??'');if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error(`${k} 须显式填写非负整数分钟`);return Number(raw);};
const intersect=(a,b)=>a.flatMap(([s,e])=>b.map(([x,y])=>[Math.max(s,x),Math.min(e,y)]).filter(([x,y])=>y>x));

/** Adapter over existing tables and already established production records.
 * No importer/defaults/DEC06 parameters. Missing B3 quantity facts stay BLOCKED.
 * It selects only the explicitly configured batch-heat -> max-wait cooling pair;
 * arbitrary load-node and per-stage regrouping remain unsupported.
 */
export function prepareCoolingMembers({data,productionBatches,upstreamTasks,startMinute,endMinute}) {
 const members=[],findings=[];
 if(!Array.isArray(productionBatches)||!Array.isArray(upstreamTasks)||!Number.isSafeInteger(startMinute)||startMinute<0||!Number.isSafeInteger(endMinute)||endMinute<startMinute)throw Error('须提供已建立的生产批、上游任务及显式计划范围');
 for(const b of productionBatches){
  try{
   if(b.unit!=='kg')throw Error('非kg粒度未决；不换算或拆批');
   if(!b.id||!b.orderId||!b.inputKg||!b.qualifiedKg)throw Error('缺少B3/生产批身份与精确投入/产出');
   const input=exact(b.inputKg),output=exact(b.qualifiedKg);
   if(input.n<=0n||input.d<=0n||output.n<=0n||output.d<=0n)throw Error('生产批投入/产出须为正精确量');
   const order=one((data.orders||[]).filter(o=>o['订单编号']===b.orderId),'订单');
   const product=one((data.products||[]).filter(p=>p['产品编号']===order['产品编号']),'产品');
   if(order['数量单位']!=='kg')throw Error('订单非kg，粒度未决');
   if(Q.cmp(Q.mul(input,Q.q(product['总收率'])),output)!==0n)throw Error('生产批投入×总收率与合格产出不守恒');
   const route=(data.routes||[]).filter(r=>r['产品编号']===order['产品编号']);
   if(new Set(route.map(r=>r['工序编号'])).size!==route.length||!route.length)throw Error('路线为空或工序重复');
   const roots=route.filter(r=>!r['前序工序']);let cursor=one(roots,'顺序路线起点'),visited=new Set();
   while(cursor){if(visited.has(cursor['工序编号']))throw Error('路线循环');visited.add(cursor['工序编号']);const next=route.filter(r=>r['前序工序']===cursor['工序编号']);if(next.length>1)throw Error('本切片只支持顺序路线');cursor=next[0];}
   if(visited.size!==route.length)throw Error('路线悬空或循环');
   const cool=one(route.filter(r=>String(r['最大等待分钟']??'').trim()!==''),'显式最大等待工序');
   const heat=one(route.filter(r=>r['工序编号']===cool['前序工序']),'等待窗前序工序');
   const machineFor=op=>{
    const dep=one((data.dependencies||[]).filter(r=>r['订单编号']===b.orderId&&r['工序编号']===op['工序编号']&&r['资源类型']==='设备'),'给定设备依赖');
    if(String(dep['需求数量'])!=='1'||n(dep,'提前占用分钟')!==0||n(dep,'后延占用分钟')!==0)throw Error('设备仅支持显式1台及零偏移');
    return one((data.machines||[]).filter(m=>m['设备编号']===dep['资源编号']&&m['工序编号']===op['工序编号']),'设备');
   };
   const hm=machineFor(heat),cm=machineFor(cool);
   if(hm['装载计量基准']!=='BOM总投入'||cm['装载计量基准']!=='合格产出')throw Error('仅v0.3加工总投入/冷却合格产出节点；其他装载节点待决');
   if(Q.cmp(output,Q.q(cm['最小装载kg']))<0n||Q.cmp(output,Q.q(cm['最大装载kg']))>0n)throw Error('冷却工位产出装载不满足上下限');
   const batch=one((data.batchResources||[]).filter(r=>r['资源编号']===hm['设备编号']&&r['资源类型']==='批处理装载'),'加工资源批配置');
   if(batch['单位']!=='kg'||Q.cmp(Q.q(batch['容量']),Q.q(hm['最大装载kg']))!==0n)throw Error('加工容量单位或表03/15容量冲突');
   if(!heat['程序编号']||!String(batch['允许程序']).split(';').includes(heat['程序编号']))throw Error('加工程序不在显式允许清单');
   const spaceDep=one((data.dependencies||[]).filter(r=>r['订单编号']===b.orderId&&r['工序编号']===cool['工序编号']&&r['资源类型']==='空间'),'冷却空间依赖');
   if(spaceDep['需求数量']!=='按合格产出kg'&&Q.cmp(Q.q(spaceDep['需求数量']),output)!==0n)throw Error('空间声明须显式按合格产出kg或与本生产批精确产出一致');
   if(n(spaceDep,'提前占用分钟')!==0||n(spaceDep,'后延占用分钟')!==0)throw Error('本v0.3切片只支持完整冷却区间及显式零偏移；其他释放语义待决');
   const space=one((data.batchResources||[]).filter(r=>r['资源编号']===spaceDep['资源编号']&&r['资源类型']==='共享冷却空间'),'共享冷却空间');
   if(space['单位']!=='kg')throw Error('非kg空间/load-node语义待决');
   const claims=(data.resourceClaims||[]).filter(r=>r['订单编号']===b.orderId&&r['工序编号']===cool['工序编号']&&r['资源类型']==='空间');
   if(claims.length>1||claims.some(c=>c['资源编号']!==space['资源编号']||c['单位']!=='kg'||Q.cmp(Q.q(c['需求数量']),output)!==0n||n(c,'提前占用分钟')!==0||n(c,'后延占用分钟')!==0||c['占用口径']!=='显式逐生产批完整区间'))throw Error('空间运行声明与已批准产出口径冲突');
   const duration=op=>{const t=one((data.times||[]).filter(t=>t['产品编号']===order['产品编号']&&t['工序编号']===op['工序编号']),'固定工时');if(t['计算方式']!=='固定'||n(t,'固定分钟')===0)throw Error('加工/冷却须正数固定工时');return n(t,'固定分钟');};
   const prior=heat['前序工序']?one(upstreamTasks.filter(t=>t.productionBatchId===b.id&&t.operation===heat['前序工序']),'本生产批已排上游任务'):null;
   if(prior&&(!Number.isSafeInteger(prior.end)||prior.end<0||prior.orderId!==b.orderId))throw Error('上游任务身份或完成分钟无效');
   const ready=Math.max(startMinute,prior?.end??startMinute);
   const day=new Date(Date.parse(PLAN_TIME_ORIGIN)+ready*60000+8*3600000).toISOString().slice(0,10);
   const bom=(data.bom||[]).filter(r=>r['产品编号']===order['产品编号']&&r['生效日期']<=day);
   if(!bom.length)throw Error('缺少已生效配方版本；须B3提供');
   const latest=bom.map(r=>r['生效日期']).sort().at(-1),current=bom.filter(r=>r['生效日期']===latest);
   one([...new Set(current.map(r=>r['版本编号']))],'同日BOM版本');
   const hw=allowedWindows(data,inheritedCalendarId(data,hm),'设备',hm['设备编号'],startMinute,endMinute);
   const cw=allowedWindows(data,inheritedCalendarId(data,cm),'设备',cm['设备编号'],startMinute,endMinute);
   const sw=allowedWindows(data,inheritedCalendarId(data,cm),'空间',space['资源编号'],startMinute,endMinute);
   members.push({id:b.id,orderId:b.orderId,productId:order['产品编号'],recipeKey:JSON.stringify(current),routeKey:JSON.stringify(route),program:heat['程序编号'],heatOperation:heat['工序编号'],coolOperation:cool['工序编号'],heatMachine:hm['设备编号'],coolMachine:cm['设备编号'],spaceId:space['资源编号'],inputKg:b.inputKg,outputKg:b.qualifiedKg,minimumInputKg:hm['最小装载kg'],maximumInputKg:hm['最大装载kg'],spaceCapacityKg:space['容量'],heatDuration:duration(heat),coolDuration:duration(cool),readyMinute:ready,maxWait:n(cool,'最大等待分钟'),heatWindows:hw,coolWindows:intersect(cw,sw),predecessorTaskId:prior?.id||'',sourceRefs:{order:b.orderId,route:[heat['工序编号'],cool['工序编号']],batch:hm['设备编号'],space:space['资源编号'],bomVersion:current[0]['版本编号']}});
  }catch(e){findings.push({code:'BLOCKED / PROCESS_COOLING_ADAPTER',memberIds:[b.id],message:e.message});}
 }
 return {members,findings};
}

// Named integrator entry. A blocked member never silently disappears into PASS.
export function proposeProcessCooling(input) {
 const prepared=prepareCoolingMembers(input);
 if(prepared.findings.length)return {contract:'v0.3-process-cooling-v1',scope:'process-cooling-only',integrated:false,tasks:[],groups:[],reservations:[],attempts:[],findings:prepared.findings};
 return scheduleCoolingPairs({members:prepared.members,reservations:input.reservations||[],endMinute:input.endMinute});
}
