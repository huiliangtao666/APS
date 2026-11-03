import {explainRiskNode} from './workbook-risk-timeline.mjs';
const rows=(v,t)=>v.input.tables?.[t]||[];
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const rec=(id,values)=>({id:String(id),values});
const cols=entries=>entries.map(([key,label,format])=>({key,label,...(format?{format,timeUnit:'day'}:{})}));
const fail=code=>{throw Object.assign(Error(code),{code,status:422});};
/** Read-only card: explicit frozen links only; raw BOM/inventory are references. */
export function riskCard(v,{record,node,section='overview',offset=0}){
 const analysis=explainRiskNode(v,{record,node}); // validates node and record ownership
 if(!['overview','demands'].includes(section))fail('INVALID_DETAIL_SECTION');
 if(!Number.isSafeInteger(offset)||offset<0)fail('INVALID_PAGE');
 const p=v.run.result,kind=record.id.split(':')[0],key=record.id.slice(record.id.indexOf(':')+1);
 const raw=kind==='shortage'?(p.shortages||[]).find(r=>String(r.id)===key):({finding:p.findings,allocation:p.allocations,suggestion:p.suggestions}[kind]||[])[Number(key)];
 const t=record.timeline,material=t.materialId,need=record.need,explicitTasks=new Set([raw.taskId,raw.source?.taskId,raw.evidence?.taskId].filter(Boolean));
 const tasks=(p.tasks||[]).filter(t=>explicitTasks.has(t.id)),links=new Map();
 if(need)links.set(need,'本记录明确关联');
 for(const task of tasks)if(task.orderId&&!links.has(task.orderId))links.set(task.orderId,'本记录关联任务 '+task.id);
 if(need&&rows(v,'期初在制').some(w=>w['在制批次编号']===need))for(const allocation of p.allocations||[]){
  if(allocation.supplyId==='wip:'+need&&allocation.need&&!links.has(allocation.need))links.set(allocation.need,'冻结分配采用在制 '+need);
 }
 const demands=(p.demandResults||[]).filter(d=>links.has(d.id)),dates=new Map(t.events.map(e=>[e.key,e])),date=n=>num(n)===null?null:new Date(Date.parse(v.identity.dayZero+'T00:00:00Z')+Math.floor(Number(n))*86400000).toISOString().slice(0,10);
 const at=e=>e?date(e.at/1440):null;
 const fields=[{label:'物料编号',value:material},{label:'风险性质',value:record.values.sourceKind},{label:'物料名称',value:t.materialName},{label:'关联任务',value:tasks.map(t=>t.id).join('、')||null},{label:'关联需求 / 在制',value:need},{label:kind==='finding'&&raw.evidence?.kind==='material-at-feed'?'候选投料日期':'需料日期',value:date(raw.needDay??raw.feedDay)??(raw.evidence?.kind==='material-at-feed'?date(num(raw.evidence.actualFeed)===null?null:raw.evidence.actualFeed/(raw.evidence.timeUnit==='minute'?1440:1)):at(dates.get('feed')))},{label:'预计可用日期',value:date(raw.availableDay)??(num(raw.evidence?.ready)===null?null:date(raw.evidence.ready/(raw.evidence.timeUnit==='minute'?1440:1)))},{label:kind==='suggestion'?'建议采购数量':'本记录数量',value:t.quantity===null?null:t.quantity+(t.unit?' '+t.unit:'（单位未提供）')},{label:'关联BOM',value:raw.bomId??raw.evidence?.bomId??null},{label:'来源说明',value:kind==='suggestion'?'采购参考尚未采用；建议日期不表示缺口已经解除':raw.message||record.values.meaning||'按冻结记录展示'}];
 let groups=[];
 if(section==='demands'){
  const demandRows=demands.map(d=>{const source=rows(v,'每日需求').find(r=>r['需求编号']===d.id),m=rows(v,'物料主数据').find(r=>r['物料编号']===d.productId);return rec(d.id,{id:d.id,customer:source?.['客户名称']??source?.['客户编号']??null,productId:d.productId??source?.['成品编号']??null,productName:m?.['物料名称']??null,quantity:d.quantity??null,unit:d.unit??null,product:[d.productId??source?.['成品编号'],m?.['物料名称']].filter(Boolean).join(' · ')||null,amount:num(d.quantity)===null?null:d.quantity+(d.unit?' '+d.unit:'（单位未提供）'),outcome:(d.status==='scheduled'?'已排':d.status==='unplanned'?'未排':d.status||'未提供')+(num(d.lateDays)>0?' · 预计迟交 '+d.lateDays+' 天':''),requiredDate:num(source?.['需求日']),latestArrivalDate:num(d.latestArrivalDay??source?.['最晚到货日']),arrivalDate:num(d.arrivalDay),status:d.status==='scheduled'?'已排':d.status==='unplanned'?'未排':d.status??null,lateDays:d.lateDays??null,relation:links.get(d.id),impact:kind==='allocation'?'计划采用供给；不直接视为缺料':kind==='suggestion'?'采购参考；尚未采用':kind==='finding'?'计算过程记录；最终状态以需求结果为准':'本需求有冻结净缺口记录'});});
  groups=[{id:'demands',title:'受影响的需求',columns:cols([['id','需求编号'],['customer','客户'],['product','成品编号 / 名称'],['amount','需求数量'],['requiredDate','需求日期','date'],['latestArrivalDate','最晚到货日期','date'],['arrivalDate','计划到货日期','date'],['outcome','排程结果'],['impact','影响说明']]),records:demandRows}];
 }else if(material){
  const inventory=rows(v,'期初库存').filter(r=>r['物料编号']===material).map((r,i)=>rec(r['库存批次编号']||i,{id:r['库存批次编号'],quantity:num(r['当前数量']),unit:r['数量单位']??null,quality:r['质量状态']??null,available:num(r['期初可用量']),expiry:num(r['到期日'])}));
  const bom=rows(v,'物料清单').filter(r=>r['子项编号']===material).map((r,i)=>rec(r['用量关系编号']||i,{id:r['用量关系编号'],parent:r['父项编号'],child:r['子项编号'],quantity:num(r['子项基准用量']),unit:r['数量单位']??null,operation:r['投料位置']??null}));
  const allocations=(p.allocations||[]).filter(a=>a.materialId===material&&links.has(a.need)).map((a,i)=>rec(i,{need:a.need,supply:a.supplyId,quantity:a.quantity,unit:a.unit??t.unit,feed:num(a.feedDay),conditional:a.conditional?'条件供给':'供给分配'}));
  groups=[{id:'allocations',title:'关联需求已保存的供给分配',note:'仅展示冻结分配记录，不代表现场已领料。',columns:cols([['need','需求 / 在制'],['supply','供给编号'],['quantity','分配数量'],['unit','单位'],['feed','需料日期','date'],['conditional','供给性质']]),records:allocations},{id:'inventory',title:'该物料的原始期初批次',note:'原始库存参考，不表示这些批次已分配给本记录；期初可用量也不是本次排程剩余量。',columns:cols([['id','库存批次编号'],['quantity','当前数量'],['unit','数量单位'],['quality','质量状态'],['available','期初可用量'],['expiry','到期日期','date']]),records:inventory},{id:'bom',title:'引用该物料的BOM原文',note:'BOM引用为来源参考，不据此推算受影响需求。',columns:cols([['id','用量关系编号'],['parent','父项编号'],['child','子项编号'],['quantity','子项基准用量'],['unit','数量单位'],['operation','投料位置']]),records:bom}];
 }
 const total=groups.reduce((n,g)=>n+g.records.length,0);let position=0,count=0,bytes=0,stopped=false;
 groups=groups.map(g=>{const all=g.records,part=[];for(const r of all){const n=Buffer.byteLength(JSON.stringify(r));if(position++<offset)continue;if(stopped)continue;if(n>120000)fail('DETAIL_RECORD_LIMIT');if(count>=100||bytes+n>150000){stopped=true;continue;}part.push(r);count++;bytes+=n;}return {...g,total:all.length,records:part};});
 const note=demands.length?'仅列本记录明确关联的需求及有冻结分配依据的下游需求；过程问题不代表需求最终未排。':need?'关联对象 '+need+'；未保存与需求结果的明确关联，不按同物料或BOM推测受影响需求。':'本记录未保存需求关联，不按同物料或BOM推测受影响需求。';
 return {section,node:analysis.node,title:record.id+(t.materialName?' · '+t.materialName:''),fields,taskIds:tasks.map(t=>t.id),demandTotal:demands.length,relationNote:note,groups,total,nextOffset:offset+count<total?offset+count:null,analysis:section==='overview'?analysis:undefined};
}
