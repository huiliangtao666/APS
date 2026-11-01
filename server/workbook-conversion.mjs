import {randomUUID} from 'node:crypto';
import {hash,refreshDerived} from './workbook-model.mjs';
const mappingVersion='workbook-identity-copy:r1';
// Only a byte-preserving, same-profile isolated copy is currently lossless.
// Cross-model conversions stay previews until their business semantics exist.
export function registerWorkbookConversions(router,ctx) {
 const {read,write,dataset,audit,summary,handle,permission,persist,tableRefs}=ctx;
 router.post('/datasets/:id/conversions/preview',permission('read'),handle((req,res)=>{
  const d=dataset(read(),req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});
  if(req.body.version!==d.version)return res.status(409).json({error:'INPUT_CHANGED'});
  const targetModel=req.body.targetModel;if(!['workbook','native'].includes(targetModel))throw Error('未知目标模型');
  const supported=targetModel==='workbook'&&!(d.parameterTrials?.length),fields=[{field:'quantity',status:supported?'lossless':'blocked',basis:supported?'同profile字面数量，不换算':'D02：投入基准/单位/损耗未映射'},{field:'time',status:supported?'lossless':'blocked',basis:supported?'保持自然日轴及半开边界':'D01：日容量不含分钟工时和班次'},{field:'physicalPools',status:supported?'lossless':'blocked',basis:supported?'原映射不变，保留mock标签':'D03/D04：真实物理池与跨线语义未核定'},{field:'identity',status:supported?'lossless':'blocked',basis:supported?'隔离数据集，来源键原样；不合并需求':'D05/D06：跨源身份及新公式未核定'}];
  const sourceRef={model:'workbook',id:d.id,version:d.version,inputHash:hash(d)},conversionId=hash({sourceRef,targetModel,mappingVersion});
  res.json({conversionId,sourceRef,targetModel,mappingVersion,fields,mayCommit:supported,targetPreviewHash:hash({sourceRef,targetModel,mappingVersion}),sourceUnchanged:true,message:supported?'显式复制为隔离数据集；不会同步源或改变当前原生输入':targetModel==='workbook'?'数据集含私有试算，不能把他人试算复制到新身份；请先明确数据集采用范围':'仅预览；D01–D06转换未开放确认，不影响Excel日主线'});
 }));
 router.post('/datasets/:id/conversions/confirm',permission('edit'),handle((req,res)=>{
  const s=read(),b=req.body;if(b.targetModel!=='workbook'||b.mappingVersion!==mappingVersion)return res.status(422).json({error:'conversion_semantics_not_supported'});
  // A lost response may be retried even after the source has advanced.
  const prior=s.conversions?.find(c=>c.conversionId===b.conversionId);
  if(prior){if(prior.targetPreviewHash!==b.targetPreviewHash)return res.status(409).json({error:'conversion_changed'});return res.json({...prior,idempotent:true});}
  const d=dataset(s,req.params.id);if(!d)return res.status(404).json({error:'dataset_not_found'});
  const sourceRef={model:'workbook',id:d.id,version:d.version,inputHash:hash(d)},conversionId=hash({sourceRef,targetModel:'workbook',mappingVersion}),targetPreviewHash=hash({sourceRef,targetModel:'workbook',mappingVersion});
  if(!b.confirm||b.conversionId!==conversionId||b.targetPreviewHash!==targetPreviewHash)return res.status(409).json({error:'conversion_changed'});
  const target=structuredClone(d);target.id=randomUUID();target.name=d.name+' · 显式隔离副本';target.version=1;target.conversion={conversionId,sourceRef,mappingVersion};target.parameterTrials=[];target.tables['配置参数']=(target.tables['配置参数']||[]).filter(p=>!p._scope||p._scope==='dataset');target.parameterCandidates=(target.parameterCandidates||[]).filter(p=>!p._scope||p._scope==='dataset');target.parameterContext={scope:'dataset',effectiveDay:0};target.createdAt=new Date().toISOString();
  refreshDerived(target);const ref=persist(target),entry={...summary(target),ref,tableRefs:tableRefs(target,ref)};
  const result={conversionId,sourceRef,targetRef:{model:'workbook',id:target.id,version:1,inputHash:hash(target)},targetPreviewHash,mappingVersion};
  s.datasets.push({id:target.id,versions:[entry],imports:[]});(s.conversions??=[]).push(result);audit(s,req,'workbook_conversion',result);write(s);res.json(result);
 }));
}
