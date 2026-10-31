import {validateSingleLineScope} from './line-scope.mjs';
import {quantityMath as Q, calculateMaterialDemand, createMaterialAllocator, materialPolicy} from './material-allocation.mjs';
import {validateInventoryBatches} from './inventory.mjs';
import {validateExpectedSupply} from './expected-supply.mjs';
import {independentlyVerifyPlan} from './independent-verification.mjs';
import {sourceRefs} from './problem-records.mjs';

// Opt-in offline adapter only. Nothing imports this from an application entry.
export const sharingContract='B16-offline-sharing-v1';
const text=v=>typeof v==='string'&&v.length>0&&v===v.trim();
const decimal=v=>typeof v==='string'&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)&&Number.isFinite(Number(v));
const count=v=>decimal(v)&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>0;
const key=r=>JSON.stringify([r.type,r.resourceId]);
const resourceSpec={人员:['personnelGroups','人员组编号','人员数量','人'],工装:['tools','工装编码','可用数量','套']};
const unique=(rows,field)=>new Set(rows.map(r=>r[field])).size===rows.length;
const problem=(code,message,taskIds=[],relatedRecords=[],interval)=>({code:'B16 / '+code,message,taskIds,relatedRecords,...(interval?{interval}:{})});

export function validateSharingProfile(profile,data){
 const issues=[],add=(code,message)=>issues.push(problem(code,message));
 if(!profile||profile.contract!==sharingContract||!text(profile.version)||!text(profile.source)||profile.mock!==true){add('PROFILE','Requires explicit offline contract, version, source and replaceable mock=true');return issues;}
 for(const name of ['lines','products','resources','materials','selections'])if(!Array.isArray(profile[name])||!profile[name].length)add('PROFILE',name+' must be an explicit nonempty array');
 for(const name of ['orders','products','materials','machines','routes','times','factoryLines','inventory','supplies','supplyDelays','supplyUses','bom','rules','tools','personnelGroups','personnelPools','dependencies','resourceClaims','batchResources','skillSubstitutions','calendars','downtime','resourceStops'])if(!Array.isArray(data?.[name]))add('INPUT','Missing frozen table '+name);
 if(issues.length)return issues;
 for(const [name,rows]of [...Object.entries(profile).filter(([,v])=>Array.isArray(v)),...Object.entries(data).filter(([,v])=>Array.isArray(v))])if(rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))add('INPUT','Invalid record in '+name);
 if(issues.length)return issues;
 const {lines,products,resources,materials,selections}=profile;
 if(lines.some(r=>!text(r.id)||!text(r.factoryId))||!unique(lines,'id'))add('LINE','Missing or duplicate line identity');
 const factories=new Set(lines.map(r=>r.factoryId));if(factories.size!==1)add('FACTORY','Cross-factory production/transport is outside this contract');
 const scope=(r,label)=>{if(!Array.isArray(r.lineIds)||!r.lineIds.length||new Set(r.lineIds).size!==r.lineIds.length||r.lineIds.some(id=>!lines.some(l=>l.id===id)))add('SCOPE',label+' requires unique known explicit lineIds');};
 for(const r of lines){const match=data.factoryLines.filter(x=>x['产线编号']===r.id);if(match.length!==1||match[0]['工厂编号']!==r.factoryId)add('LINE','Line/factory differs from frozen mapping '+r.id);}
 for(const [table,field]of [['orders','订单编号'],['products','产品编号'],['materials','物料编号'],['machines','设备编号'],['tools','工装编码'],['personnelGroups','人员组编号'],['personnelPools','poolId'],['inventory','批次编号'],['supplies','供给编号'],['supplyUses','引用编号']])if(data[table].some(r=>!text(r[field]))||!unique(data[table],field))add('IDENTITY',table+' has missing/duplicate global identity');
 for(const r of data.machines)if(!lines.some(l=>l.id===r['产线编号']))add('LINE','Machine has unknown/missing line '+r['设备编号']);
 if(!unique(products,'productId'))add('PRODUCT','Duplicate product mapping');
 for(const r of products){scope(r,'Product '+r.productId);if(!data.products.some(p=>p['产品编号']===r.productId))add('PRODUCT','Unknown product '+r.productId);}
 if(new Set(resources.map(key)).size!==resources.length)add('RESOURCE','Duplicate global resource identity, even across lines');
 for(const r of resources){
  scope(r,'Resource '+r.resourceId);const spec=resourceSpec[r.type];
  if(!spec||!text(r.resourceId)||!count(r.capacity)||r.unit!==spec?.[3]||typeof r.allowCrossLine!=='boolean')add('RESOURCE','Unknown type/unit/quantity/sharing permission '+r.resourceId);
  if(!factories.has(r.factoryId))add('FACTORY','Resource factory unknown '+r.resourceId);
  if(r.lineIds?.length>1&&r.allowCrossLine!==true)add('SHARING','Cross-line resource requires explicit permission '+r.resourceId);
  if(spec){const rows=data[spec[0]].filter(x=>x[spec[1]]===r.resourceId);if(rows.length!==1||!count(rows[0][spec[2]])||!count(r.capacity)||Q.cmp(Q.q(rows[0][spec[2]]),Q.q(r.capacity))!==0n)add('CAPACITY','Capacity must match unique frozen object '+r.resourceId);}
 }
 for(const [type,spec]of Object.entries(resourceSpec))for(const r of data[spec[0]])if(!resources.some(x=>x.type===type&&x.resourceId===r[spec[1]]))add('SCOPE','Missing resource scope '+r[spec[1]]);
 // A physical personnel pool may have several skill groups; it remains ONE pool.
 for(const pool of data.personnelPools){const members=data.personnelGroups.filter(g=>g.poolId===pool.poolId),scopes=members.map(g=>resources.find(r=>r.type==='人员'&&r.resourceId===g['人员组编号']));if(!count(pool['总人数'])||members.length===0||scopes.some(r=>!r)||new Set(scopes.flatMap(r=>r?.lineIds||[])).size>1&&scopes.some(r=>r?.allowCrossLine!==true))add('POOL','Physical pool missing capacity/members or cross-line permission '+pool.poolId);}
 if(data.personnelGroups.some(g=>g.poolId&&!data.personnelPools.some(p=>p.poolId===g.poolId)))add('POOL','Unknown physical personnel pool');
 if(!unique(materials,'materialId'))add('MATERIAL','Duplicate material scope');
 for(const r of materials){scope(r,'Material '+r.materialId);if(!factories.has(r.factoryId)||!data.materials.some(m=>m['物料编号']===r.materialId))add('MATERIAL','Unknown material/factory '+r.materialId);}
 for(const r of data.bom)if(!materials.some(m=>m.materialId===r['物料编号']))add('MATERIAL','Missing BOM material scope '+r['物料编号']);
 if(!unique(selections,'orderId'))add('SELECTION','Duplicate order selection');
 for(const s of selections)if(!data.orders.some(o=>o['订单编号']===s.orderId)||!['specified','automatic'].includes(s.mode)||s.mode==='specified'&&!text(s.lineId)||s.mode==='automatic'&&s.lineId!==undefined)add('SELECTION','Unknown order/mode or ambiguous requested line');
 for(const order of data.orders){if(!selections.some(s=>s.orderId===order['订单编号']))add('SELECTION','Missing explicit selection '+order['订单编号']);if(!products.some(p=>p.productId===order['产品编号']))add('PRODUCT','Missing product applicability '+order['产品编号']);}
 issues.push(...validateInventoryBatches(data.inventory,data.materials).map(f=>problem('INVENTORY',f.message,[],f.relatedRecords||[])));
 issues.push(...validateExpectedSupply({supplies:data.supplies,delays:data.supplyDelays,uses:data.supplyUses,materials:data.materials,orders:data.orders,routes:data.routes}).map(f=>problem('SUPPLY',f.message,[],f.relatedRecords||[])));
 return issues;
}

export function lineCandidates(profile,productId,selection){
 const mapping=profile?.products?.filter(p=>p.productId===productId)||[];
 if(profile?.contract!==sharingContract||mapping.length!==1||!Array.isArray(mapping[0].lineIds)||!mapping[0].lineIds.length||new Set(mapping[0].lineIds).size!==mapping[0].lineIds.length||mapping[0].lineIds.some(id=>profile.lines?.filter(l=>l.id===id).length!==1))return {status:'problem',candidates:[],reason:'Unknown/ambiguous product applicability'};
 if(selection?.mode==='automatic'&&selection.lineId===undefined)return {status:'pass',candidates:[...mapping[0].lineIds],basis:'applicability-only; calendar/material/due/resource feasibility is checked on a fixed plan'};
 if(selection?.mode==='specified'&&mapping[0].lineIds.includes(selection.lineId))return {status:'pass',candidates:[selection.lineId],basis:'specified allowed line; no scheduling performed'};
 return {status:'problem',candidates:[],reason:'Unknown selection or inapplicable specified line'};
}

function fixedPlanFindings(profile,data,plan){
 const findings=[],tasks=plan?.tasks;
 const add=(code,message,ids=[],refs=[],interval)=>findings.push(problem(code,message,ids,refs,interval));
 if(!Array.isArray(tasks)||!Array.isArray(plan.resourceReservations)){add('PLAN','Tasks and resource ledger must be explicit arrays');return findings;}
 if([...tasks,...plan.resourceReservations].some(r=>!r||typeof r!=='object'||Array.isArray(r))){add('PLAN','Invalid task/ledger row');return findings;}
 const refs=(table,rows)=>sourceRefs(table,rows,data[table]);
 if(!unique(tasks,'id')||tasks.some(t=>!text(t.id)))add('IDENTITY','Task identities must be unique');
 const supported=tasks.every(t=>!t.productionBatchId&&!t.resourceBatchId)&&data.orders.every(o=>o['数量单位']==='kg'&&o['是否允许拆分']==='否');
 if(!supported)add('GAP','This fixed-plan adapter supports explicit unsplit kg orders only; B12 batch integration remains with Dev');
 for(const o of data.orders){
  const route=data.routes.filter(r=>r['产品编号']===o['产品编号']),rows=tasks.filter(t=>t.orderId===o['订单编号']);
  const rr=refs('orders',[o]);let remaining;
  try{remaining=Q.sub(Q.q(o['合格需求']),Q.q(o['已完成合格数量']||'0'));if(Q.cmp(remaining,Q.zero)<=0n)throw Error();}catch{add('QUANTITY','Order demand/completion invalid '+o['订单编号'],[],rr);continue;}
  if(!route.length||!unique(route,'工序编号'))add('COVERAGE','Missing/duplicate frozen route '+o['订单编号'],[],rr);
  if(supported)for(const op of route){const found=rows.filter(t=>t.operation===op['工序编号']);if(found.length!==1)add('COVERAGE','Each remaining order-operation requires exactly one task '+o['订单编号']+'/'+op['工序编号'],found.map(t=>t.id),[...rr,...refs('routes',[op])]);}
  const s=profile.selections.find(s=>s.orderId===o['订单编号']),candidate=lineCandidates(profile,o['产品编号'],s);
  if(candidate.status!=='pass')add('APPLICABILITY',candidate.reason,rows.map(t=>t.id),rr);
  const chosen=new Set(rows.map(t=>t.lineId));if(chosen.size>1)add('LINE','An unsplit order must stay on one line '+o['订单编号'],rows.map(t=>t.id),rr);
  const due=o['要求可交付分钟'],product=data.products.find(p=>p['产品编号']===o['产品编号']),wait=product?.['模拟交付等待分钟'];
  if(!decimal(due)||!decimal(wait))add('DUE','Explicit due minute and delivery wait required '+o['订单编号'],[],rr);
  else if(rows.length&&Math.max(...rows.map(t=>t.end))+Number(wait)>Number(due))add('DUE','Order finishes after explicit delivery deadline '+o['订单编号'],rows.map(t=>t.id),rr);
  for(const t of rows){
   const m=data.machines.find(m=>m['设备编号']===t.machine);
   if(!text(t.lineId)||!candidate.candidates.includes(t.lineId)||m?.['产线编号']!==t.lineId||o['产线编号']!==t.lineId||m?.['工序编号']!==t.operation||t.productId!==o['产品编号'])add('APPLICABILITY','Task/order/machine/product line mismatch '+t.id,[t.id],[...rr,...refs('machines',m?[m]:[])]);
   if(!route.some(r=>r['工序编号']===t.operation))add('COVERAGE','Unknown order operation '+t.id,[t.id],rr);
   if(!Number.isFinite(t.start)||!Number.isFinite(t.end)||t.start<0||t.end<=t.start||t.duration!==t.end-t.start)add('INTERVAL','Invalid fixed task interval '+t.id,[t.id],rr);
   const times=data.times.filter(r=>r['产品编号']===t.productId&&r['工序编号']===t.operation);
   if(times.length!==1||times[0]['计算方式']!=='固定'||!decimal(times[0]['固定分钟']))add('GAP','Requires unique explicit fixed operation duration '+t.id,[t.id],refs('times',times));
   else if(t.end-t.start!==Number(times[0]['固定分钟']))add('DURATION','Task duration differs from frozen operation '+t.id,[t.id],refs('times',times));
   if(supported&&(!decimal(t.quantity)||Q.cmp(Q.q(t.quantity),remaining)!==0n||t.unit!=='kg'))add('QUANTITY','Task quantity must cover original remaining demand '+t.id,[t.id],rr);
  }
 }
 for(const t of tasks)if(!data.orders.some(o=>o['订单编号']===t.orderId))add('COVERAGE','Unknown order task '+t.id,[t.id]);
 for(const [i,r]of plan.resourceReservations.entries()){
  if(!resourceSpec[r.type]){add('GAP','Unsupported reservation type; explicit resource adapter required '+r.type);continue;}
  const rawIds=r.taskIds||[r.taskId],ids=Array.isArray(rawIds)?rawIds:[],scope=profile.resources.find(x=>key(x)===key(r));
  if(!text(r.id)||plan.resourceReservations.filter(x=>x.id===r.id).length!==1||!count(String(r.quantity))||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end<=r.start||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!tasks.some(t=>t.id===id)))add('LEDGER','Missing/duplicate identity, invalid quantity, task or interval at resource row '+i,ids);
  if(!scope||r.unit!==scope.unit||ids.some(id=>!scope.lineIds.includes(tasks.find(t=>t.id===id)?.lineId)))add('SCOPE','Resource use outside explicit allowed lines '+r.resourceId,Array.isArray(ids)?ids:[]);
 }
 for(const t of tasks)for(const b of data.bom.filter(b=>b['产品编号']===t.productId&&b['投料工序编号']===t.operation))if(!profile.materials.find(m=>m.materialId===b['物料编号'])?.lineIds.includes(t.lineId))add('MATERIAL_SCOPE','Material unavailable to task line '+t.id,[t.id],refs('bom',[b]));
 return findings;
}

export function allocateSharingMaterials({profile,data,plan,conditions}){
 const findings=[...validateSharingProfile(profile,data)];
 if(!findings.length)findings.push(...fixedPlanFindings(profile,data,plan));
 const output=structuredClone(plan);
 // Refuse to overwrite a saved commitment or historical result.
 if(plan?.materialDemands?.length)findings.push(problem('FROZEN','Allocation requires an uncommitted candidate; saved ledgers are checked, never rewritten'));
 if(findings.length)return {status:'problem',findings,plan:output};
 const policy=materialPolicy(data,conditions?.ruleEvaluationAt);
 if(!policy)return {status:'problem',findings:[problem('MATERIAL','Explicit effective MATERIAL policy required')],plan:output};
 try{
  const ledger=createMaterialAllocator(data,policy),tx=ledger.begin();let ok=true;
  for(const task of [...plan.tasks].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id))){
   const order=data.orders.find(o=>o['订单编号']===task.orderId);
   const demands=calculateMaterialDemand(data,order,task.operation,task.start).map(r=>({...r,taskId:task.id}));
   const staged=tx.stage(demands,task.start);ok=staged.ok&&ok;
   if(!staged.ok)findings.push(problem('MATERIAL','Global inventory insufficient/not ready at fixed feed minute '+task.start,[task.id],sourceRefs('orders',[order],data.orders)));
  }
  if(ok)tx.commit();else tx.rollback();
  output.materialDemands=structuredClone(tx.rows);output.materialChecked=true;
  return {status:ok?'pass':'problem',findings,plan:output};
 }catch(error){return {status:'problem',findings:[problem('MATERIAL',error.message)],plan:output};}
}

export function checkSharingPlan({profile,data,plan,conditions}){
 const findings=validateSharingProfile(profile,data),checks={};
 const result=()=>({contract:sharingContract,status:findings.length?'problem':'pass',findings,checks,profile:structuredClone(profile),offlineOnly:true,applicationEnabled:false,qaUat:'NOT_EXECUTED',scope:'Fixed unsplit kg plan; no allocation search, application workflow or final multi-line UAT'});
 if(findings.length)return result();
 findings.push(...fixedPlanFindings(profile,data,plan));
 if(findings.length)return result();
 const required=['MACHINE','PRECEDENCE','CALENDAR','MATERIAL','MOLD','LABOR'];
 for(const id of required){const rows=data.rules.filter(r=>r['规则编号']===id);if(rows.length!==1||rows[0]['是否启用']!=='是'||!conditions?.enabledRuleIds?.includes(id)||rows[0]['生效时间']&&Date.parse(rows[0]['生效时间'])>Date.parse(conditions?.ruleEvaluationAt))findings.push(problem('RULE','Required rule unavailable/disabled '+id));}
 if(conditions?.mode!=='supported'||conditions?.jointConditionsContract!=='FR022-joint-v1'||conditions?.workingWindowsContract!=='P06-windows-v1')findings.push(problem('CONTRACT','Explicit supported joint and working-window contracts required'));
 if(findings.length)return result();
 try{
  const review=independentlyVerifyPlan(plan,data.orders,data.routes,conditions.enabledRuleIds,conditions.ruleEvaluationAt,data,conditions);
  // Preserve the old P0 finding intact. This opt-in adapter owns multi-line scope;
  // it does not relabel the legacy single-line checker as a multi-line PASS.
  checks.legacySingleLine={findings:validateSingleLineScope(data.orders,data.machines),review:review.checks.lineScope,adoptedAsMultiLine:false};
  checks.independent=review;
  for(const name of ['machineOverlap','precedence','calendar','resourcePolicies','jointConditions'])if(review.checks[name]?.status!=='pass')findings.push(problem('VERIFY',name+' '+(review.checks[name]?.details||['not_checked']).join('; ')));
  findings.push(...review.findings);
  for(const [name,c]of Object.entries(review.checks))if(!['lineScope','machineOverlap','precedence','calendar','resourcePolicies','jointConditions'].includes(name)&&c.status==='problem')findings.push(problem('VERIFY',name+' '+(c.details||[]).join('; ')));
 }catch(error){findings.push(problem('VERIFY','Frozen checker could not complete: '+error.message));}
 return result();
}

// Records are a domain mapping export, not a native application CSV importer.
export function sharingMappingCsv(profile){
 const rows=[['contract','version','source','mock','kind','id','factoryId','lineIds','allowCrossLine','capacity','unit']];
 for(const [kind,list]of [['line',profile.lines],['product',profile.products],['resource',profile.resources],['material',profile.materials]])for(const r of list)rows.push([profile.contract,profile.version,profile.source,String(profile.mock),kind,r.id||r.productId||r.resourceId||r.materialId,r.factoryId||'',(r.lineIds||[r.id]).join('|'),r.allowCrossLine===undefined?'':String(r.allowCrossLine),r.capacity||'',r.unit||'']);
 return rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
