import {fingerprint,SolverProblem,requireCoverage} from './contract.mjs';
import {workbookIntegerBounds} from './integer-bounds.mjs';
import {unpackModel,EXACT_MODEL} from './exact-protocol.mjs';
import {workbookLimbCertificate} from './limb-integer.mjs';
const CONTRACT='aps-cpsat-workbook:v2';
const problem=(path,message)=>{throw new SolverProblem('CP_MODEL_INPUT',message,{path});};
export function validateWorkbookModel(input,{copy=true,diagnostic=null}={}){
 const {modelHash,...wire}=input;let m;try{m=unpackModel(input);}catch(e){if(input.contract===CONTRACT)problem(e.details?.path??'quantity',e.message);throw e;}if(m.contract!==CONTRACT&&m.contract!==EXACT_MODEL)problem('contract','未知工作簿模型');
 if(!modelHash||fingerprint(wire)!==modelHash)problem('modelHash','冻结模型已变化');
 if(m.objective?.kind!=='feasibility'||!m.objective.source)problem('objective','未批准优化目标');
 if(!m.source?.inputHash||!m.source.configurationHash||!m.source.selectionHash)problem('source','冻结来源不完整');
 requireCoverage(m.rules);
 const integer=(v,path,min=0)=>{if(!Number.isSafeInteger(v)||v<min)problem(path,'不是安全整数');};
 const quantity=(v,path,min=0n)=>{if(typeof v!=='bigint'||v<BigInt(min))problem(path,'不是已验证精确整数');};
 const identities={};for(const key of ['tasks','groups','lots','feeds','resources','demands']){if(!Array.isArray(m[key]))problem(key,'缺少完整声明');const ids=new Set();for(const x of m[key]){if(typeof x.id!=='string'||!x.id||ids.has(x.id))problem(key,'身份缺失或重复');ids.add(x.id);}identities[key]=ids;}
 if(!m.demands.length)problem('demands','空需求不能成功');
 integer(m.window?.[0],'window.start');integer(m.window?.[1],'window.end');if(m.window[1]<=m.window[0])problem('window','窗口为空');
 for(const [id,s]of Object.entries(m.scales)){quantity(s.scale,'scale/'+id,1);if(!s.unit)problem(id,'量纲缺失');}
 quantity(m.weightScale,'weightScale',1);
 for(const r of m.resources){quantity(r.capacity,r.id+'.capacity');if(!Array.isArray(r.calendar))problem(r.id,'日历缺失');for(const [a,b]of r.calendar){integer(a,'calendar.start');integer(b,'calendar.end');if(b<=a)problem(r.id,'日历为空');}}
 for(const g of m.groups){quantity(g.maxQuantity,g.id+'.maxQuantity',1);if(!m.scales[g.materialId])problem(g.id,'物料量纲缺失');if(g.fixedQuantity!==null)quantity(g.fixedQuantity,g.id+'.fixedQuantity',1);if(!identities.lots.has(g.lotId))problem(g.id,'产出批次缺失');for(const r of g.routes){if(!r.durationRatio)problem(g.id,'工时比例缺失');quantity(r.durationRatio.n,'duration.n');quantity(r.durationRatio.d,'duration.d',1);if(r.taskIds.some(id=>!identities.tasks.has(id)))problem(g.id,'路线任务引用缺失');}}
 for(const t of m.tasks){quantity(t.maxQuantity,t.id+'.maxQuantity',1);if(!identities.groups.has(t.groupId)||!t.options.length)problem(t.id,'任务义务或候选缺失');const opts=new Set();for(const o of t.options){if(opts.has(o.id))problem(t.id,'候选重复');opts.add(o.id);if(!identities.resources.has(o.resourceId)||!identities.resources.has('crew:'+o.crewId)||o.tools.some(id=>!identities.resources.has(id)))problem(t.id,'资源引用缺失');for(const key of ['capacity','weightMultiplier'])quantity(o[key],t.id+'.'+key,1);integer(o.people,t.id+'.people',1);for(const [day,cap]of o.days){integer(day,'quota.day');quantity(cap,'quota.capacity');}}}
 for(const l of m.lots){quantity(l.quantity,l.id+'.quantity');quantity(l.reserved,l.id+'.reserved');if(l.reserved>l.quantity)problem(l.id,'保留量超供给');if(l.qualityEligible){integer(l.ready,l.id+'.ready');integer(l.expiry,l.id+'.expiry');if(l.expiry<=l.ready)problem(l.id,'放行/效期倒置');}if(l.producerGroup&&!identities.groups.has(l.producerGroup))problem(l.id,'制造来源缺失');}
 for(const f of m.feeds){quantity(f.maxQuantity,f.id+'.maxQuantity');if(!m.scales[f.materialId]||f.eligibleLotIds.some(id=>!identities.lots.has(id)))problem(f.id,'物料或批次来源缺失');if(f.minShelfMinutes!==undefined)integer(f.minShelfMinutes,f.id+'.minShelfMinutes');if(f.coefficient){quantity(f.coefficient.n,f.id+'.coefficient.n');quantity(f.coefficient.d,f.id+'.coefficient.d',1);}}
 for(const d of m.demands){for(const key of ['quantity','completedQuantity','protectedQuantity','remaining'])quantity(d[key],d.id+'.'+key);integer(d.earliest,d.id+'.earliest');integer(d.target,d.id+'.target');integer(d.minShelfMinutes,d.id+'.minShelfMinutes');if(d.completedQuantity+d.protectedQuantity+d.remaining!==d.quantity)problem(d.id,'净量不守恒');}
 const windows=(ranges,path)=>{if(!Array.isArray(ranges))problem(path,'缺少整数时间范围');for(const [a,b]of ranges){integer(a,path+'.start');integer(b,path+'.end');if(a>=b)problem(path,'空时间范围');}};
 for(const g of m.groups){if(g.wip)for(const k of ['completeMinute','releaseMinute'])integer(g.wip[k],g.id+'.wip.'+k);for(const r of g.routes){integer(r.minLag,r.id+'.minLag');if(r.maxLag!==null)integer(r.maxLag,r.id+'.maxLag');for(const k of ['固定准备分钟','基准加工分钟','最短工艺分钟','开始参与分钟','结束参与分钟']){const v=r.source[k];if(String(v??'').trim()===''||!Number.isSafeInteger(Number(v))||Number(v)<0)problem(r.id+'.'+k,'工时源须有明确整数');}}}
 for(const t of m.tasks){if(t.seed){integer(t.seed.start,t.id+'.seed.start');integer(t.seed.end,t.id+'.seed.end');integer(t.seed.toolEndMinute,t.id+'.seed.toolEnd');for(const l of t.seed.laborIntervals){integer(l.start,'seed.labor.start');integer(l.end,'seed.labor.end');}}else integer(t.earliest,t.id+'.earliest');for(const o of t.options){integer(o.toolTail,o.id+'.toolTail');windows(o.shifts,o.id+'.shifts');windows(o.deviceCalendar,o.id+'.deviceCalendar');}}
 for(const l of m.lots)if(l.producerGroup)integer(l.shelfLife,l.id+'.shelfLife');
 for(const f of m.feeds)if(f.coefficient){quantity(f.protectedQuantity??0n,f.id+'.protectedQuantity');for(const v of f.validity)integer(v,f.id+'.validity',Number.MIN_SAFE_INTEGER);}
 for(const r of m.reservations){integer(r.start,r.id+'.start');integer(r.end,r.id+'.end');quantity(r.amount,r.id+'.amount');if(!identities.resources.has(r.resourceId))problem(r.id,'保留资源不存在');}
 for(const s of m.stops){integer(s.start,s.id+'.start');integer(s.end,s.id+'.end');}
 for(const s of m.sequences)for(const r of s.transitions){integer(r.minutes,s.resourceId+'.clean.minutes');integer(r.people,s.resourceId+'.clean.people');}
 for(const w of m.metadata.frozenUrgent?.wipDaily||[]){quantity(w.quantityScaled,'wipDaily.quantity');integer(w.day,'wipDaily.day');}
 if(m.contract===EXACT_MODEL){if(!input.integerBounds||!['aps-limb-bounds:v1','aps-limb-bounds:v2'].includes(input.integerBounds.contract))throw new SolverProblem('CP_EXACT_CERTIFICATE','缺少或未知精确整数证书');workbookLimbCertificate(input,input.integerBounds,{diagnostic,unpacked:m});}else workbookIntegerBounds(input);
 return copy?structuredClone(input):input;
}
