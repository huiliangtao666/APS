// Reconstruct from frozen literals/configuration without using the intake
// adapter, scheduler or resource allocator as an oracle.
export function verifyOriginalDependencies(d,c){
 const rows=d.originalDependencies||[],bindings=c?.originalDependencyBindings,problems=[];
 if(!rows.length)return c?.originalDependencyContract?['原12冻结合同缺原记录，禁止降级']:[];
 if(c?.originalDependencyContract!=='original12-explicit-bindings-v1'||!Array.isArray(bindings)||bindings.length!==rows.length)return ['原12冻结记录缺完整采用/延期合同'];
 const equal=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
 const sameTask=(a,b)=>a['订单编号']===b['订单编号']&&a['工序编号']===b['工序编号'];
 for(const [i,r] of rows.entries()){
  const b=bindings[i],rule=({设备:'MACHINE',模具:'MOLD',工具:'MOLD',人员:'LABOR',物料:'MATERIAL',空间:'STORAGE'})[r['资源类型']];
  const config=(d.rules||[]).find(x=>x['规则编号']===rule),active=config?.['是否启用']==='是'&&(!config['生效时间']||Date.parse(config['生效时间'])<=Date.parse(c.ruleEvaluationAt));
  const fail=message=>problems.push(`原12第${i+2}记录 ${message}`);
  if(!rule||!config||!b||b.sourceIndex!==i||b.sourceTable!=='originalDependencies'||!equal(r,b.sourceRecord)||b.ruleId!==rule){fail('来源、类型、规则或冻结索引不一致');continue;}
  if(!c.orderIds?.includes(r['订单编号'])){if(b.status!=='NOT_SELECTED'||(b.targets||[]).length)fail('未选择订单不得采用');continue;}
  if(!active){if(b.status!=='DEFERRED'||(b.targets||[]).length)fail('未生效记录必须仅保留来源');continue;}
  if(b.status!=='BOUND'){fail('启用记录没有采用');continue;}
  if(r['资源类型']==='物料'){
   const order=d.orders.find(o=>o['订单编号']===r['订单编号']);
   const bom=d.bom.filter(x=>x['产品编号']===order?.['产品编号']&&x['投料工序编号']===r['工序编号']&&x['物料编号']===r['资源编号']);
   if(r['需求数量']!=='由BOM计算'||r['提前占用分钟']!=='0'||r['后延占用分钟']!=='0'||b.materialContract!=='existing-versioned-bom-at-feed-v1'||!bom.length||!d.dependencies.some(x=>equal(x,r)))fail('物料原文/投料点/运行BOM绑定缺失');
   for(const row of bom)if(!b.targets.some(x=>x.table==='bom'&&equal(x.record,row)))fail('版本BOM冻结来源缺失');
   if(b.targets.filter(x=>x.table==='bom').length!==bom.length||!b.targets.some(x=>x.table==='materials'&&equal(x.record,d.materials.find(m=>m['物料编号']===r['资源编号']))))fail('物料/BOM冻结来源不一致');
   continue;
  }
  if(r['资源类型']==='空间'){
   const target=d.dependencies.filter(x=>sameTask(x,r)&&x['资源类型']==='空间'&&x['资源编号']===r['资源编号']),claims=d.resourceClaims.filter(x=>sameTask(x,r)&&x['资源类型']==='空间'&&x['资源编号']===r['资源编号']);
   if(target.length!==1||claims.length!==1||!b.targets.some(x=>x.table==='dependencies'&&equal(x.record,target[0]))||!b.targets.some(x=>x.table==='resourceClaims'&&equal(x.record,claims[0])))fail('空间采用目标不一致');
   else if(r['需求数量']==='按合格产出kg'){
    if(b.quantityContract!=='existing-qualified-production-output-v1'||!c.enabledRuleIds.includes('CAPACITY')||claims[0]['单位']!=='kg'||claims[0]['占用口径']!=='显式逐生产批完整区间'||Number(target[0]['需求数量'])!==Number(claims[0]['需求数量']))fail('生产批合格产出空间合同缺失');
   }else if(Number(target[0]['需求数量'])!==Number(r['需求数量'])||Number(claims[0]['需求数量'])!==Number(r['需求数量']))fail('空间数量未采用原值');
   for(const field of ['提前占用分钟','后延占用分钟'])if(target.length===1&&claims.length===1&&(Number(target[0][field])!==Number(r[field])||Number(claims[0][field])!==Number(r[field])))fail('空间偏移未采用原值');
   continue;
  }
  if(r['资源类型']==='设备'){
   if(!(d.dependencies||[]).some(x=>sameTask(x,r)&&Object.keys(r).every(k=>x[k]===r[k])))fail('运行设备未采用原依赖');
   continue;
  }
  const tool=['模具','工具'].includes(r['资源类型']),maps=(d.resourceMappings||[]).filter(m=>m['状态']==='READY'&&m['来源类别']===(tool?'originalTools':'originalPersonnel')&&m['来源编号']===r['资源编号']);
  if(maps.length!==1||maps[0]['配置编号']!==b.configurationId||maps[0]['配置版本']!==b.configurationVersion){fail('显式绑定身份或版本不一致');continue;}
  const m=maps[0],table=tool?'resourceClaims':'dependencies',matches=(d[table]||[]).filter(x=>sameTask(x,r)&&x['资源编号']===m['运行编号']&&x['资源类型']===(tool?'工装':'人员技能'));
  if(matches.length!==1){fail('运行需求不唯一或缺失');continue;}
  const target=matches[0];if(!(b.targets||[]).some(t=>t.table===table&&equal(t.record,target)))fail('冻结采用目标与实际需求不一致');
  const fields=tool?['需求数量','提前占用分钟','后延占用分钟']:['需求数量','所需技能'];
  for(const field of fields){const t=(d.tools||[]).find(t=>t['工装编码']===m['运行编号']);const value=tool&&target['参数来源']==='工装配置'?t?.[field==='需求数量'?'每任务需求数量':field]:target[field];if(field==='所需技能'?value!==r[field]:!value||Number(value)!==Number(r[field]))fail(`${field}未采用原值`);}
 }
 return problems;
}
