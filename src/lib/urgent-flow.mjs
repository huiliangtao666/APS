import {completionPercent} from './urgent-progress.mjs';
// A new confirmation form starts from the selected frozen plan. Saved facts
// always win; defaults are editable assumptions until the user confirms them.
export function initialUrgentFacts(run,plan){
 const result=run?.result||{},saved=plan?.facts;
 const taskFacts=new Map((saved?.tasks||[]).map(t=>[t.id,t]));
 const allocationFacts=new Map((saved?.allocations||[]).map(a=>[a.index,a]));
 return {
  statuses:Object.fromEntries((result.tasks||[]).map(t=>[t.id,taskFacts.get(t.id)?.status??'not_started'])),
  completed:Object.fromEntries((result.demandResults||[]).map(r=>[r.id,String(saved?.completed?.[r.id]??0)])),
  footprints:Object.fromEntries((result.tasks||[]).map(t=>{const f=taskFacts.get(t.id);return [t.id,{startMinute:f?.startDay??f?.startMinute??t.start,endMinute:f?.endDay??f?.endMinute??t.end,quantity:f?.quantity??t.quantity,executedQuantity:f?.executedQuantity??0,...(result.timeUnit==='day'?{completionPercent:completionPercent(t,f?.status??'not_started',f?{...f,quantity:f.quantity??t.quantity}:{} )}:{}),cleaning:f?.cleaning??t.cleaning,laborIntervals:f?.laborIntervals??t.laborIntervals,toolEndMinute:f?.toolEndMinute??t.toolEndMinute}];})),
  allocations:Object.fromEntries((result.allocations||[]).map((a,index)=>{const f=allocationFacts.get(index);return [index,{index,quantity:String(f?.quantity??0),kind:f?.kind??'none',feedMinute:result.timeUnit==='day'?(f?.feedDay??a.feedDay):(f?.feedMinute??a.feedMinute)}];}))
 };
}
export function selectUrgentPlan(plans,run){
 if(!run)return undefined;
 return run.urgentPlanId?plans.find(p=>p.id===run.urgentPlanId):plans.find(p=>p.headRunId===run.id||p.baseRunId===run.id);
}
export function initialUrgentStrategy(plan){
 const daily=plan?.timeUnit==='day',observation=daily?plan?.facts.observationDay:plan?.facts.observationMinute;
 return plan?.workspace?structuredClone(plan.workspace):{...(daily?{timeUnit:'day',freezeDay:observation,semiFreezeDay:observation,priorityDirection:'数值小优先'}:{freezeMinute:observation,semiFreezeMinute:observation}),strategy:'delay',scope:'full',seedTaskIds:[],events:[],exceptions:[],overtime:[]};
}
export function urgentQueue(result,plan,draft){
 const urgent=(plan?.batches||[]).filter(b=>b.status!=='withdrawn').flatMap(b=>b.demands.map(r=>({id:b.id+':'+r['需求编号'],type:'插单',taskId:'待排程生成',demandId:r['需求编号'],productId:r['成品编号'],label:'新增需求',machine:'待分配',quantity:Number(r['需求千克']),unit:'千克',status:'not_started',date:r['需求日']})));
 const activeIds=new Set(urgent.map(r=>r.demandId));
 const withdrawn=new Set((plan?.batches||[]).filter(b=>b.status==='withdrawn').flatMap(b=>b.demands.map(r=>r['需求编号'])).filter(id=>!activeIds.has(id)));
 const original=(result?.tasks||[]).filter(t=>!withdrawn.has(t.orderId)&&['not_started','started'].includes(draft.statuses[t.id])).map(t=>({id:t.id,type:activeIds.has(t.orderId)?'插单再排':'原任务再排',taskId:t.id,demandId:t.orderId,productId:t.productId,label:t.label,machine:t.machine,quantity:Math.max(0,(draft.footprints[t.id]?.quantity??t.quantity)-(draft.statuses[t.id]==='started'?Number(draft.footprints[t.id]?.executedQuantity||0):0)),unit:'千克',status:draft.statuses[t.id],date:draft.footprints[t.id]?.startMinute??t.start}));
 // Once an adopted insertion already has tasks, list its remaining task rows
 // instead of listing the demand a second time.
 const planned=new Set((result?.tasks||[]).map(t=>t.orderId));
 const pending=(result?.demandResults||[]).filter(r=>!planned.has(r.id)&&!activeIds.has(r.id)&&!withdrawn.has(r.id)&&r.quantity>Number(draft.completed[r.id]||0)).map(r=>({id:'pending:'+r.id,type:'原需求待排',taskId:'待排程生成',demandId:r.id,productId:r.productId,label:'待生成工序',machine:'待分配',quantity:r.quantity-Number(draft.completed[r.id]||0),unit:'千克',status:'not_started',date:undefined}));
 return [...urgent.filter(r=>!planned.has(r.demandId)),...original.filter(r=>r.type==='插单再排'),...original.filter(r=>r.type==='原任务再排'),...pending];
}

// The run uses the revision returned by saving this exact strategy. No second
// strategy selector or hidden prerequisite can override the displayed choice.
export async function scheduleUrgentFlow(api,plan,workspace,solver={solver:'basic'}){
 const root='/workbooks/urgent/plans/'+plan.id;
 let current=plan;
 if(JSON.stringify(plan.workspace)!==JSON.stringify(workspace))current=(await api(root+'/workspace',{targetToken:plan.targetToken,workspace})).plan;
 try{
 const readiness=await api(root+'/readiness',{targetToken:current.targetToken,...solver});
 if(!readiness.ready)throw Error((readiness.issues||[]).map(i=>i.message).join('；')||'本次排程条件未就绪');
 const run=await api(root+'/run',{targetToken:current.targetToken,...solver,...(readiness.token?{solverReadinessToken:readiness.token}:{})});return {plan:current,run};}
 catch(error){throw Object.assign(error,{plan:current});}
}
