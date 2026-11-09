import {parameterMaintenanceView,parameterHistory,restoreNationalMonth} from './parameter-maintenance.mjs';
import {parameterWorkbook,resolvedExportRecords} from './parameter-workbook-export.mjs';
import {randomUUID} from 'node:crypto';
import {parameterCatalog,parameterView,changeParameter,scopeFor,businessDefinition} from './parameter-contract.mjs';
import {parameterTemplate} from './parameter-import.mjs';
const csv=rows=>'\ufeff'+rows.map(r=>r.map(v=>'"'+String(typeof v==='object'?JSON.stringify(v):v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
export function registerParameterRoutes(router,ctx){
 const {permission,handle,read,dataset,saveVersion,actorKey}=ctx;
 router.get('/parameters/template',permission('export'),(_req,res)=>res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('配置参数模板.xlsx').send(parameterWorkbook()));
 router.get('/parameters/catalog',permission('read'),(_req,res)=>res.json({catalog:parameterCatalog,template:parameterTemplate()}));
 router.get('/datasets/:id/parameters',permission('read'),handle((req,res)=>{const d=dataset(read(),req.params.id,req.query.version);if(!d)return res.status(404).json({error:'dataset_not_found'});res.json(req.query.mode==='maintenance'?parameterMaintenanceView(d,req.query,actorKey(req)):parameterView(d,req.query,actorKey(req)));}));
 router.get('/datasets/:id/parameters/history',permission('read'),handle((req,res)=>{const d=dataset(read(),req.params.id,req.query.version);if(!d)return res.status(404).json({error:'dataset_not_found'});res.json(parameterHistory(d,req.query,actorKey(req)));}));
 router.post('/datasets/:id/parameters',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>req.body.operation==='restore-national-month'?restoreNationalMonth(d,req.body,actorKey(req)):changeParameter(d,{...req.body,configuration:true},actorKey(req)),{configuration:true})));
 router.post('/datasets/:id/parameter-trials',permission('edit'),handle((req,res)=>saveVersion(req,res,d=>{const name=String(req.body.name||'').trim();if(!name||name.length>100)throw Error('试算名称必填，最多100字');const trial={id:randomUUID(),name,actor:actorKey(req),baseVersion:d.version,createdAt:new Date().toISOString()};(d.parameterTrials??=[]).push(trial);return {trial};},{configuration:true})));
 router.get('/datasets/:id/parameters/export',permission('export'),handle((req,res)=>{const d=dataset(read(),req.params.id,req.query.version);if(!d)return res.status(404).end();scopeFor(d,req.query.scope,actorKey(req));let offset=0,result=[],page;do{page=req.query.mode==='maintenance'?parameterMaintenanceView(d,{...req.query,offset,limit:100},actorKey(req)):parameterView(d,{...req.query,offset,limit:100},actorKey(req));result.push(...page.records.filter(p=>p['参数编号']&&!p._placeholder||p.adoptable&&p.objectTable==='物料主数据'&&p.effectiveValue!==undefined).map((p,i)=>p['参数编号']&&!p._placeholder?p:{...p,'参数编号':'BASE-'+offset+'-'+i,_cp:p.cp,_sourceRole:'B',_scope:'dataset',_placeholder:false}));offset+=page.limit||100;}while(offset<page.total);
  if(req.query.format==='xlsx')return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('配置参数.xlsx').send(parameterWorkbook(resolvedExportRecords(result.map(p=>({...p,_cp:p.cp,_scope:p.scope}))),d.version,d.parameterAnnotations,parameterCatalog.map(c=>businessDefinition(d,c['参数编号']))));
  const headers=['参数编号','CP编号','对象编号','对象名称','参数名称','参数值','单位','生效日','失效日','scope','版本','状态','来源'];res.type('text/csv; charset=utf-8').attachment('配置参数.csv').send(csv([headers,...result.map(p=>[p['参数编号'],p.cp,p['对象编号'],p['对象名称'],p['参数名称'],p['参数值'],p['单位'],p['生效日'],p['失效日'],p.scope,d.version,p.status,p._source])]));
 }));
 return router;
}
