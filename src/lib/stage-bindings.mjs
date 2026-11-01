import {sourceRefs} from './problem-records.mjs';
import {sameRecord} from './resource-mapping.mjs';
import {PLAN_TIME_ORIGIN} from './expected-supply.mjs';
import {minuteInstant,validateMinuteValidity} from './minute-validity.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
export const stageContract='FR013-stage-bindings-v1';
export const stageMappingDef={key:'stageMappings',label:'原13/14/18/19 显式运行绑定',file:'38_原13与14与18与19运行绑定.csv',fields:['配置编号','配置版本','合同版本','状态','来源类别','来源编号','源记录JSON','运行编号','参数JSON','配置依据','数据性质']};
export const stageMappingNote='每条原来源须显式绑定唯一运行身份、单位、位置、质量、范围、固定分钟原点和到期边界；原字节/物理行保持冻结。READY绑定在新运行及独立复核中逐值核对；修改须递增版本。明确模拟是可替换工程数据，不代表客户事实或原件已获真实采用。原18必须另填工序产出与逐批耗料，原19须绑定组和唯一池，历史事实账不改写。';
const sourceId={originalInventory:'批次编号',originalSupply:'批次编号',originalProgress:'任务编号',originalEvents:'事件编号'};
const json=v=>{try{return JSON.parse(v);}catch{return null;}};
const positive=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const qty=(a,b)=>{try{return Q.cmp(Q.q(a),Q.q(b))===0n;}catch{return false;}};
export function checkStageBindings(data,{forRun=false,startMinute=0}={}){
 const issues=[],bindings=[],maps=data.stageMappings||[],seen=new Set(),targets=new Set();
 const refs=(table,rows)=>sourceRefs(table,rows,data[table]||[]);
 for(const [i,m] of maps.entries()){
  const category=m['来源类别'],key=sourceId[category],sources=(data[category]||[]).filter(r=>key&&r[key]===m['来源编号']),s=sources[0];
  const relatedRecords=[...refs('stageMappings',[m]),...refs(category,sources)];
  const fail=(field,message)=>issues.push({code:'NOT_READY_STAGE_BINDING',table:'stageMappings',file:stageMappingDef.file,row:i+2,field,message,relatedRecords});
  const initial=issues.length;
  for(const f of stageMappingDef.fields)if(!m[f]?.trim())fail(f,'显式绑定必填；不推定业务值或默认边界');
  if(!positive(m['配置版本']))fail('配置版本','须为安全正整数版本');
  if(m['合同版本']!==stageContract)fail('合同版本','未知运行合同');
  if(!['明确模拟','已核实事实'].includes(m['数据性质']))fail('数据性质','须明确数据性质；配置依据须保留权威来源');
  const id=JSON.stringify([category,m['来源编号']]);if(seen.has(id))fail('来源编号','一个原来源只允许一条运行绑定');seen.add(id);
  if(!['READY','NOT_READY_CONFIG'].includes(m['状态']))fail('状态','须显式READY或NOT_READY_CONFIG');
  if(sources.length!==1||!sameRecord(s,json(m['源记录JSON'])))fail('源记录JSON','须逐字匹配唯一当前原记录；不从名称猜测身份，不接受陈旧来源');
  const p=json(m['参数JSON']);if(!p||typeof p!=='object'||Array.isArray(p)){fail('参数JSON','须为显式参数对象');continue;}
  if(m['状态']!=='READY'){if(forRun)fail('状态','待配置的具体来源不能用于运行');continue;}
  if(!s||!key)continue;
  const table=category==='originalInventory'?'inventory':category==='originalSupply'?'supplies':category==='originalProgress'?'executionFacts':'simulationEvents';
  const field=table==='inventory'?'批次编号':table==='supplies'?'供给编号':table==='executionFacts'?'事实编号':'事件编号';
  const found=(data[table]||[]).filter(r=>r[field]===m['运行编号']),t=found[0],tk=table+':'+m['运行编号'];
  relatedRecords.push(...refs(table,found));
  if(targets.has(tk))fail('运行编号','不同来源不能重复采用同一运行身份或容量');targets.add(tk);
  if(found.length!==1){fail('运行编号','须显式绑定唯一现有运行记录，不自动创建');continue;}
  if(category==='originalInventory'||category==='originalSupply'){
   const supply=category==='originalSupply',amount=supply?'到料kg或个':'库存kg或个';
   const allowed=['unit','origin','location','quality','scope','expiryBoundary',...(supply?['uses']:[])];
   if(Object.keys(p).some(k=>!allowed.includes(k)))fail('参数JSON','包含未支持映射参数');
   for(const f of allowed)if(p[f]===undefined||typeof p[f]==='string'&&!p[f].trim())fail('参数JSON',f+'须显式配置');
   const material=(data.materials||[]).filter(r=>r['物料编号']===s['物料编号']);
   if(material.length!==1||p.unit!==material[0]['单位'])fail('参数JSON','unit须与物料主数据完全一致；不自动kg/个换算');
   if(p.scope!==s['共享范围']||p.scope!=='全工厂')fail('参数JSON','仅支持原全工厂在当前单线范围内唯一物料事务；不复制跨线库存');
   if(!['合格','待检','冻结','不合格','预计可用'].includes(p.quality)||t['质量状态']!==p.quality)fail('参数JSON','显式质量映射须匹配现行状态，不自动认定合格');
   if(p.origin!==PLAN_TIME_ORIGIN)fail('参数JSON','origin须显式既有分钟原点；不重置为运行起点');
   if(t['物料编号']!==s['物料编号']||!qty(t[supply?'预计数量':'账面数量'],s[amount])||!qty(t['已占用数量']||'0',s['已占用kg或个']))fail('运行编号','运行物料/数量/独立占用须与原记录一致；不重复扣耗');
   const expected={'时效模式':'显式分钟','时间原点':p.origin,'到达分钟':s['到达分钟'],'可用分钟':s['最早可用分钟'],'到期分钟':s['到期分钟'],'到期边界':p.expiryBoundary};
   if(Object.keys(expected).some(f=>t[f]!==expected[f])||validateMinuteValidity(t).length)fail('运行编号','运行时效须无损匹配原分钟及显式边界，不截成日期');
   if(!supply&&t['位置']!==p.location||!p.location?.trim())fail('参数JSON','location须显式非空；库存运行位置须一致');
   if(supply){
    if(t['批次编号']!==s['批次编号'])fail('运行编号','供给批次须与原批次逐字一致');
    try{if(Date.parse(t['预计到达时间'])!==Date.parse(minuteInstant(p.origin,s['到达分钟'])))fail('运行编号','供给到达时点不等于原分钟');}catch(e){fail('参数JSON',e.message);}
    const uses=(data.supplyUses||[]).filter(u=>u['供给编号']===m['运行编号']);relatedRecords.push(...refs('supplyUses',uses));
    if(!Array.isArray(p.uses)||!p.uses.length||!same(p.uses,uses))fail('参数JSON','uses须逐条匹配现行订单/工序/供给引用；不得从供给编号猜订单');
    if((data.inventory||[]).some(l=>l['批次编号']===s['批次编号']))fail('运行编号','同一批次不可同时记库存和预计供给');
   }
  }else if(category==='originalProgress'){
   if(Object.keys(p).sort().join(',')!=='fact,sourceId')fail('参数JSON','须显式fact完整累计事实与sourceId来源对账编号');
   if(!sameRecord(t,p.fact))fail('参数JSON','fact须完整匹配累计事实；产出不从投入推算');
   if(t['状态']!==s['状态']||!qty(t['开始分钟'],s['实际开始分钟'])||!qty(t['完成分钟'],s['实际结束分钟']))fail('运行编号','累计事实状态/原始起止须匹配来源');
   const rows=(data.executionSources||[]).filter(r=>r['来源编号']===p.sourceId),source=rows[0];relatedRecords.push(...refs('executionSources',rows));
   if(rows.length!==1||source['事实编号']!==t['事实编号']||source['原始任务编号']!==s['任务编号']||source['耗料单位']!=='kg'||!qty(source['原始汇总耗料'],s['已用投入kg']))fail('参数JSON','原投入须由唯一kg来源对账和显式逐批耗料守恒；零投入也须显式空分配');
  }else{
   if(Object.keys(p).sort().join(',')!=='event,groupBefore,poolBefore')fail('参数JSON','须显式event及变更前groupBefore/poolBefore；不改历史账');
   if(!sameRecord(t,p.event))fail('参数JSON','event须完整匹配已接纳事件');
   let effect;try{effect=JSON.parse(t['参数JSON']);}catch{effect={};}
   if(s['变更字段']!=='可用人数'||t['事件类型']!=='人员数量变化'||!qty(s['发生分钟'],t['事件分钟'])||effect.beforeCount!==s['原值']||effect.afterCount!==s['新值'])fail('运行编号','仅支持显式人数变化；事件时点/原值/新值须与原文一致');
   const resource=(data.resourceMappings||[]).filter(r=>r['来源类别']==='originalPersonnel'&&r['来源编号']===s['对象编号']&&r['状态']==='READY');
   if(resource.length!==1||resource[0]['运行编号']!==effect.groupId)fail('运行编号','事件原人员组须经原06唯一READY映射到现行组');
   const g=(data.personnelGroups||[]).find(g=>g['人员组编号']===effect.groupId),pool=(data.personnelPools||[]).find(p=>p.poolId===effect.poolId);
   relatedRecords.push(...refs('personnelGroups',g?[g]:[]),...refs('personnelPools',pool?[pool]:[]));
   if(!g||!pool||g.poolId!==pool.poolId||g['人员数量']!==effect.afterCount||pool['总人数']!==effect.afterCount||p.groupBefore?.['人员组编号']!==g['人员组编号']||p.poolBefore?.poolId!==pool.poolId||p.groupBefore?.['人员数量']!==effect.beforeCount||p.poolBefore?.['总人数']!==effect.beforeCount)fail('参数JSON','同一资格组与唯一物理池须从原人数到新人数；不能复制双池');
   if(g&&p.groupBefore&&Object.keys(g).some(k=>k!=='人员数量'&&g[k]!==p.groupBefore[k])||pool&&p.poolBefore&&Object.keys(pool).some(k=>k!=='总人数'&&pool[k]!==p.poolBefore[k]))fail('参数JSON','人数事件不能隐式改变身份、技能、班次、策略或范围');
   if(forRun&&startMinute<Number(s['发生分钟']))fail('运行编号','人数变化仅用于事件时点起的新运行；历史必须保留冻结账');
  }
  bindings.push({configurationId:m['配置编号'],version:m['配置版本'],sourceTable:category,sourceId:m['来源编号'],targetTable:table,targetId:m['运行编号'],dataKind:m['数据性质'],status:issues.length===initial?'BOUND':'BLOCKED',relatedRecords});
 }
 if(forRun)for(const [table,id] of Object.entries(sourceId))for(const [i,row] of (data[table]||[]).entries())if(!maps.some(m=>m['状态']==='READY'&&m['来源类别']===table&&m['来源编号']===row[id]))issues.push({code:'NOT_READY_STAGE_BINDING',table,row:i+2,field:'运行映射',message:`${table} ${row[id]} 缺唯一READY显式绑定；只阻此来源字段`,relatedRecords:refs(table,[row])});
 return {issues,bindings,contract:maps.length?stageContract:null};
}
export function stageMappingTransition(before,after,records=[]){
 return (after.stageMappings||[]).flatMap((m,i)=>{
  const old=(before.stageMappings||[]).find(p=>p['配置编号']===m['配置编号']);
  const history=records.filter(r=>r.target==='stageMappings').flatMap(r=>[...(r.before||[]),...(r.after||[])]).filter(p=>p['配置编号']===m['配置编号']);
  const reused=!old&&history.some(p=>Number(p['配置版本'])>=Number(m['配置版本']));
  return (old&&!sameRecord(old,m)&&Number(m['配置版本'])<=Number(old['配置版本'])||reused)?[{code:'STAGE_MAPPING_VERSION',table:'stageMappings',file:stageMappingDef.file,row:i+2,field:'配置版本',message:'修改相同绑定身份须高于现行及历史版本；原运行保持冻结',relatedRecords:sourceRefs('stageMappings',[m],after.stageMappings)}]:[];
 });
}
