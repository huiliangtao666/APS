import {workbookQueryBoundContext} from './workbook-query-report-context.mjs';
import {capacityOptions,analyzeCapacity} from './capacity-analysis.mjs';
export function registerCapacityAnalysis(router,ctx){
 const handle=fn=>(req,res)=>{try{const result=fn(req),body=JSON.stringify(result);if(Buffer.byteLength(body)>256*1024)return res.status(413).json({error:'CAPACITY_RESPONSE_LIMIT',message:'分析结果较多，请缩小日期或物料范围'});res.type('application/json').send(body);}catch(e){res.status(e.status||422).json({error:e.code||'CAPACITY_ANALYSIS_INVALID',message:e.status===409?'数据或参数来源已变化，请刷新业务数据来源后重算。':e.status===403?'当前来源无权访问，请重新选择。':e.message});}};
 const source=(req,identity)=>workbookQueryBoundContext(ctx,identity,ctx.actorKey(req));
 router.get('/capacity-analysis/options',ctx.permission('read'),handle(req=>{let q;try{q=JSON.parse(req.query.request);}catch{throw Error('产能来源请求无效');}return capacityOptions(source(req,q.identity));}));
 router.post('/capacity-analysis',ctx.permission('read'),handle(req=>analyzeCapacity(source(req,req.body.identity),req.body)));
 router.post('/capacity-analysis/detail',ctx.permission('read'),handle(req=>analyzeCapacity(source(req,req.body.identity),req.body,{detail:true})));
}
