import {fingerprint,SolverProblem,requireCoverage} from './contract.mjs';
const CONTRACT='aps-cpsat-workbook:v2';
const problem=(path,message)=>{throw new SolverProblem('CP_MODEL_INPUT',message,{path});};
export function validateWorkbookModel(input){
 const {modelHash,...m}=input;if(m.contract!==CONTRACT)problem('contract','未知工作簿模型');
 if(!modelHash||fingerprint(m)!==modelHash)problem('modelHash','冻结模型已变化');
 if(m.objective?.kind!=='feasibility'||!m.objective.source)problem('objective','未批准优化目标');
 if(!m.source?.inputHash||!m.source.configurationHash||!m.source.selectionHash)problem('source','冻结来源不完整');
 requireCoverage(m.rules);
 const integer=(v,path,min=0)=>{if(!Number.isSafeInteger(v)||v<min)problem(path,'不是安全整数');};
 const identities={};for(const key of ['tasks','groups','lots','feeds','resources','demands']){if(!Array.isArray(m[key]))problem(key,'缺少完整声明');const ids=new Set();for(const x of m[key]){if(typeof x.id!=='string'||!x.id||ids.has(x.id))problem(key,'身份缺失或重复');ids.add(x.id);}identities[key]=ids;}
 if(!m.demands.length)problem('demands','空需求不能成功');
 integer(m.window?.[0],'window.start');integer(m.window?.[1],'window.end');if(m.window[1]<=m.window[0])problem('window','窗口为空');
 for(const [id,s]of Object.entries(m.scales)){integer(s.scale,'scale/'+id,1);if(!s.unit)problem(id,'量纲缺失');}
 integer(m.weightScale,'weightScale',1);
 for(const r of m.resources){integer(r.capacity,r.id+'.capacity');if(!Array.isArray(r.calendar))problem(r.id,'日历缺失');for(const [a,b]of r.calendar){integer(a,'calendar.start');integer(b,'calendar.end');if(b<=a)problem(r.id,'日历为空');}}
 for(const g of m.groups){integer(g.maxQuantity,g.id+'.maxQuantity',1);if(!m.scales[g.materialId])problem(g.id,'物料量纲缺失');if(g.fixedQuantity!==null)integer(g.fixedQuantity,g.id+'.fixedQuantity',1);if(!identities.lots.has(g.lotId))problem(g.id,'产出批次缺失');for(const r of g.routes){if(!r.durationRatio)problem(g.id,'工时比例缺失');integer(r.durationRatio.n,'duration.n');integer(r.durationRatio.d,'duration.d',1);if(BigInt(g.maxQuantity)*BigInt(r.durationRatio.n)+BigInt(r.durationRatio.d)>BigInt(Number.MAX_SAFE_INTEGER))problem(g.id,'工时系数溢出');if(r.taskIds.some(id=>!identities.tasks.has(id)))problem(g.id,'路线任务引用缺失');}}
 for(const t of m.tasks){integer(t.maxQuantity,t.id+'.maxQuantity',1);if(!identities.groups.has(t.groupId)||!t.options.length)problem(t.id,'任务义务或候选缺失');const opts=new Set();for(const o of t.options){if(opts.has(o.id))problem(t.id,'候选重复');opts.add(o.id);if(!identities.resources.has(o.resourceId)||!identities.resources.has('crew:'+o.crewId)||o.tools.some(id=>!identities.resources.has(id)))problem(t.id,'资源引用缺失');for(const key of ['capacity','people','weightMultiplier'])integer(o[key],t.id+'.'+key,1);for(const [day,cap]of o.days){integer(day,'quota.day');integer(cap,'quota.capacity');}}}
 for(const l of m.lots){integer(l.quantity,l.id+'.quantity');integer(l.reserved,l.id+'.reserved');if(l.reserved>l.quantity)problem(l.id,'保留量超供给');if(l.qualityEligible){integer(l.ready,l.id+'.ready');integer(l.expiry,l.id+'.expiry');if(l.expiry<=l.ready)problem(l.id,'放行/效期倒置');}if(l.producerGroup&&!identities.groups.has(l.producerGroup))problem(l.id,'制造来源缺失');}
 for(const f of m.feeds){integer(f.maxQuantity,f.id+'.maxQuantity');if(!m.scales[f.materialId]||f.eligibleLotIds.some(id=>!identities.lots.has(id)))problem(f.id,'物料或批次来源缺失');if(f.minShelfMinutes!==undefined)integer(f.minShelfMinutes,f.id+'.minShelfMinutes');if(f.coefficient){integer(f.coefficient.n,f.id+'.coefficient.n');integer(f.coefficient.d,f.id+'.coefficient.d',1);if(BigInt(f.maxQuantity)*BigInt(f.coefficient.d)>BigInt(Number.MAX_SAFE_INTEGER))problem(f.id,'BOM系数溢出');}}
 for(const d of m.demands){for(const key of ['quantity','completedQuantity','protectedQuantity','remaining'])integer(d[key],d.id+'.'+key);integer(d.earliest,d.id+'.earliest');integer(d.target,d.id+'.target');integer(d.minShelfMinutes,d.id+'.minShelfMinutes');if(d.completedQuantity+d.protectedQuantity+d.remaining!==d.quantity)problem(d.id,'净量不守恒');}
 return structuredClone(input);
}
