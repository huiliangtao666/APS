import {effectiveClaim} from './resource-policies.mjs';
import {sourceRefs} from './problem-records.mjs';
import {establishProcessProduction} from './process-route.mjs';
import {quantityMath as Q} from './material-allocation.mjs';

// An eight-column original is source data, never the fifteen-column runtime
// contract. No literal is rewritten and no business configuration is created.
export const originalDependencyDef={key:'originalDependencies',label:'原12 资源与物料依赖（原文及运行核对）',file:'12_原始工序资源与物料依赖.csv',fields:['订单编号','工序编号','资源类型','资源编号','需求数量','提前占用分钟','后延占用分钟','所需技能']};
export const runtimeDependencyFile='32_运行工序资源依赖.csv';
export const originalDependencyContract='original12-explicit-bindings-v1';
const minute=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=525600;
const positive=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
const sameTask=(a,b)=>a['订单编号']===b['订单编号']&&a['工序编号']===b['工序编号'];
const sameNumber=(a,b)=>a!==undefined&&a!==''&&Number(a)===Number(b);

export function adaptOriginalDependencies(input,{at=new Date().toISOString()}={}){
 const rows=input.originalDependencies||[],issues=[],bindings=[],projected=[];
 if(!rows.length)return {data:input,issues,bindings,contract:null};
 const fail=(i,field,message)=>issues.push({code:'NOT_READY_ORIGINAL12',table:'originalDependencies',file:originalDependencyDef.file,row:i+2,field,message,relatedRecords:sourceRefs('originalDependencies',[rows[i]],rows)});
 const active=id=>{const r=(input.rules||[]).find(r=>r['规则编号']===id);return r&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at));};
 const ruleFor={设备:'MACHINE',模具:'MOLD',工具:'MOLD',人员:'LABOR',物料:'MATERIAL',空间:'STORAGE'};
 for(const [i,r] of rows.entries()){
  const before=issues.length,type=r['资源类型'],rule=ruleFor[type],binding={sourceIndex:i,sourceTable:'originalDependencies',sourceRecord:structuredClone(r),ruleId:rule,status:'BLOCKED',targets:[]};
  bindings.push(binding);
  for(const f of originalDependencyDef.fields.filter(f=>f!=='所需技能'))if(!r[f]?.trim())fail(i,f,'原字段必填；不补默认值');
  if(!rule){fail(i,'资源类型','未支持的原资源类型；未建立运行合同，整批拒绝');continue;}
  if(!(input.rules||[]).some(x=>x['规则编号']===rule)){fail(i,'资源类型',`缺少显式 ${rule} 规则配置；不能推定关闭`);continue;}
  if(!(input.orders||[]).some(o=>o['订单编号']===r['订单编号']))fail(i,'订单编号','引用不存在的订单');
  const order=(input.orders||[]).find(o=>o['订单编号']===r['订单编号']);
  if(order&&!(input.routes||[]).some(x=>x['产品编号']===order['产品编号']&&x['工序编号']===r['工序编号']))fail(i,'工序编号','原依赖不属于订单的产品路线');
  for(const f of ['提前占用分钟','后延占用分钟'])if(!minute(r[f]))fail(i,f,'须为显式0–525600整数分钟；原文不换算');
  if(type==='物料'){
   if(r['需求数量']!=='由BOM计算'&&(!positive(r['需求数量'])||active(rule)))fail(i,'需求数量','物料运行须显式“由BOM计算”并绑定独立配置的版本BOM；数值物料仅可在关闭规则时保留原文');
  }else if(type==='空间'){
   if(r['需求数量']!=='按合格产出kg'&&!positive(r['需求数量']))fail(i,'需求数量','空间仅支持显式正整数或既有kg生产批的“按合格产出kg”');
  }else if(!positive(r['需求数量']))fail(i,'需求数量','资源需求须为显式安全正整数');
  if(issues.length!==before)continue;
  if(!active(rule)){binding.status='DEFERRED';binding.reason=`${rule}显式关闭或尚未生效；仅保存原文，本次运行不采用`;continue;}
  if(type==='物料'){
   for(const f of ['提前占用分钟','后延占用分钟'])if(r[f]!=='0')fail(i,f,'物料投料时点仅支持本工序开始；提前/后延公式未定义');
   const material=(input.materials||[]).filter(m=>m['物料编号']===r['资源编号']);
   const bom=(input.bom||[]).filter(b=>b['产品编号']===order['产品编号']&&b['投料工序编号']===r['工序编号']&&b['物料编号']===r['资源编号']);
   if(material.length!==1||!bom.length)fail(i,'资源编号','须有唯一物料及显式版本/日期/单位的运行BOM；原09来源不自动转成计算BOM');
   projected.push({...r});binding.targets.push({table:'dependencies',record:{...r}},...bom.map(record=>({table:'bom',record})),...material.map(record=>({table:'materials',record})));
   binding.materialContract='existing-versioned-bom-at-feed-v1';
  }else if(type==='空间'){
   const deps=(input.dependencies||[]).filter(d=>sameTask(d,r)&&d['资源类型']==='空间'&&d['资源编号']===r['资源编号']);
   const claims=(input.resourceClaims||[]).filter(c=>sameTask(c,r)&&c['资源类型']==='空间'&&c['资源编号']===r['资源编号']);
   const spaces=(input.batchResources||[]).filter(s=>s['资源编号']===r['资源编号']&&s['资源类型']==='共享冷却空间');
   if(deps.length!==1||claims.length!==1||spaces.length!==1){fail(i,'资源编号','须显式绑定唯一空间、运行需求及表23占用声明');continue;}
   const d=deps[0],c=claims[0];
   for(const f of ['提前占用分钟','后延占用分钟'])if(!sameNumber(d[f],r[f])||!sameNumber(c[f],r[f]))fail(i,f,'运行空间需求/声明须与原12逐值一致');
   if(r['需求数量']==='按合格产出kg'){
    if(!active('CAPACITY')||spaces[0]['单位']!=='kg'||c['单位']!=='kg'||c['占用口径']!=='显式逐生产批完整区间')fail(i,'需求数量','按合格产出kg须采用既有kg生产批及显式逐生产批完整区间；不使用整炉投入或任意节点');
    binding.quantityContract='existing-qualified-production-output-v1';
   }else if(!sameNumber(d['需求数量'],r['需求数量'])||!sameNumber(c['需求数量'],r['需求数量']))fail(i,'需求数量','运行空间需求/声明须与原12数量一致');
   projected.push(d);binding.targets.push({table:'dependencies',record:d},{table:'resourceClaims',record:c},{table:'batchResources',record:spaces[0]});
  }else if(type==='设备'){
   if(!(input.machines||[]).some(m=>m['设备编号']===r['资源编号']&&m['工序编号']===r['工序编号']))fail(i,'资源编号','原设备与运行工序不匹配');
   if(r['需求数量']!=='1')fail(i,'需求数量','单设备依赖仅支持显式数量1');
   for(const f of ['提前占用分钟','后延占用分钟'])if(r[f]!=='0')fail(i,f,'设备依赖未支持额外提前/后延窗口，不能忽略原值');
   const target={...r};projected.push(target);binding.targets.push({table:'dependencies',record:target});
  }else if(type==='工具'||type==='模具'){
   const maps=(input.resourceMappings||[]).filter(m=>m['状态']==='READY'&&m['来源类别']==='originalTools'&&m['来源编号']===r['资源编号']);
   const source=(input.originalTools||[]).find(s=>s['资源编号']===r['资源编号']);
   if(!source||source['资源类型']!==type)fail(i,'资源编号','须引用类型一致的原05记录');
   if(maps.length!==1){fail(i,'资源编号',`${r['资源编号']}缺唯一READY原05→运行工装显式映射；不自动生成适用任务、单位或占用口径`);continue;}
   const m=maps[0],claims=(input.resourceClaims||[]).filter(c=>sameTask(c,r)&&c['资源类型']==='工装'&&c['资源编号']===m['运行编号']);
   if(claims.length!==1){fail(i,'资源编号',`${r['资源编号']}须绑定唯一表23任务占用声明（套、完整区间或明确窗口及参数来源）；原12未提供该运行口径`);continue;}
   const c=effectiveClaim(claims[0],input);
   for(const f of ['需求数量','提前占用分钟','后延占用分钟'])if(!sameNumber(c[f],r[f]))fail(i,f,`表23有效${f}与原12不一致；不能覆盖原值`);
   binding.targets.push({table:'resourceClaims',record:claims[0]},{table:'tools',id:m['运行编号']});binding.configurationId=m['配置编号'];binding.configurationVersion=m['配置版本'];
  }else if(type==='人员'){
   for(const f of ['提前占用分钟','后延占用分钟'])if(r[f]!=='0')fail(i,f,'H-P04人员窗外提前/后延公式待用户裁决；禁止隐式叠加');
   const maps=(input.resourceMappings||[]).filter(m=>m['状态']==='READY'&&m['来源类别']==='originalPersonnel'&&m['来源编号']===r['资源编号']);
   if(maps.length!==1){fail(i,'资源编号',`${r['资源编号']}缺唯一READY原06→运行人员组映射；班次、物理池及参与窗不能由原06时间猜值`);continue;}
   const m=maps[0],matches=(input.dependencies||[]).filter(d=>sameTask(d,r)&&d['资源类型']==='人员技能'&&d['资源编号']===m['运行编号']&&!d['候选人员组']?.trim());
   if(matches.length!==1){fail(i,'资源类型','原“人员”须显式绑定唯一“人员技能”运行需求及岗位/班次/参与窗；不自动创建');continue;}
   const d=matches[0];
   for(const f of ['需求数量','所需技能'])if(d[f]!==r[f])fail(i,f,`运行人员${f}须与原12逐字一致`);
   for(const f of ['所需技能','所需班次','人员参与阶段','人员开始偏移','人员结束偏移','窗口外释放'])if(!d[f]?.trim())fail(i,'资源类型',`人员运行需求缺显式${f}；不补默认值`);
   projected.push(d);binding.targets.push({table:'dependencies',record:d},{table:'personnelGroups',id:m['运行编号']});binding.configurationId=m['配置编号'];binding.configurationVersion=m['配置版本'];
  }
  if(issues.length===before){binding.status='BOUND';binding.reason='仅采用原字段与已保存显式运行配置；未生成业务默认值';}
 }
 const orders=new Set(rows.map(r=>r['订单编号']));
 for(const [i,r] of (input.dependencies||[]).entries())if(orders.has(r['订单编号'])&&r['资源类型']==='设备'){
  const matches=rows.filter(s=>s['资源类型']==='设备'&&sameTask(s,r)&&s['资源编号']===r['资源编号']);
  if(matches.length!==1||originalDependencyDef.fields.some(f=>(r[f]??'')!==matches[0][f])||Object.keys(r).some(f=>!originalDependencyDef.fields.includes(f)&&r[f]?.trim()))issues.push({code:'NOT_READY_ORIGINAL12',table:'dependencies',file:runtimeDependencyFile,row:i+2,field:'资源编号',message:'运行设备依赖与原12冲突；须在同一批次显式统一来源及运行配置，禁止悄悄忽略额外设备条件',relatedRecords:sourceRefs('dependencies',[r],input.dependencies)});
 }
 // Original source owns this order's dependency set. Disabled labor/material
 // must not leak in through an older canonical row or seed configuration.
 const dependencies=[...(input.dependencies||[]).filter(r=>!orders.has(r['订单编号'])),...projected];
 for(const b of bindings.filter(b=>b.status==='BOUND'&&b.quantityContract)){
  try{
   const records=establishProcessProduction({...input,dependencies},input.orders.filter(o=>o['订单编号']===b.sourceRecord['订单编号'])).records;
   const d=b.targets.find(t=>t.table==='dependencies').record,c=b.targets.find(t=>t.table==='resourceClaims').record;
   if(!records.length||records.some(p=>Q.cmp(Q.q(d['需求数量']),Q.fromExact(p.qualifiedKg))!==0n||Q.cmp(Q.q(c['需求数量']),Q.fromExact(p.qualifiedKg))!==0n))throw Error('空间运行需求/声明须等于每个实际生产批合格产出，不能用整订单或热投入替代');
  }catch(e){fail(b.sourceIndex,'需求数量',e.message);b.status='BLOCKED';}
 }
 return {data:{...input,dependencies},issues,bindings,contract:originalDependencyContract};
}
