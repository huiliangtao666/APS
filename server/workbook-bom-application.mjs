import {createBomLossConfig,normalizeBomLossConfig,normalizeBomLossRecipe,calculateBomLoss} from '../src/lib/bom-loss-policy.mjs';
export function bomApplication(data,productId,version) {
 const bom=(data.bom||[]).filter(b=>b['产品编号']===productId&&b['用量类型']==='BOM物料'&&b['版本编号']===version);
 if(!bom.length)throw Error('缺少所选完整标准投入配方');
 if(bom.some(b=>b['用量基准']!=='每1000kg投入'||b['用量单位']!=='kg'))throw Error('此来源不是kg标准投入profile，禁止猜损耗');
 const recipe=normalizeBomLossRecipe({recipeId:productId,version,source:'原09标准投入配方:'+productId+':'+version,unit:'kg',basisKg:'1000',materials:bom.map(b=>({materialId:b['物料编号'],quotaKg:b['配置用量'],unit:'kg'}))});
 const saved=(data.bomLossProfiles||[]).find(p=>p.productId===productId&&p.recipe.version===version);
 return {productId,recipe,config:saved?.config||createBomLossConfig('未采用；保存后用于新运行','0'),adopted:!!saved};
}
export function saveBomApplication(data,productId,version,config,revision) {
 const p=bomApplication(data,productId,version);p.config=normalizeBomLossConfig({...config,source:p.recipe.source+'；服务端保存版本'+revision,version:String(revision)});calculateBomLoss(p.recipe,p.config);
 return {...p,adopted:true};
}
// Both parameter entry points reuse the existing standard-input source, including
// an explicitly selected existing plan trial. This never writes an Excel profile.
export function bomScope(state,trialId,actor){
 if(trialId===undefined||trialId==='')return {target:state,scope:'standard-input:shared'};
 if(typeof trialId!=='string')throw Error('试算编号无效');const trial=(state.trials||[]).find(t=>t.id===trialId);
 if(!trial||trial.status!=='active'||trial.actor!==actor)throw Error('试算不存在、已结束或不属于当前访问主体');
 return {target:trial,scope:'trial:'+trial.id};
}
export function changeScopedBomApplication(state,body,actor){
 const {target,scope}=bomScope(state,body.trialId,actor);if(body.revision!==target.revision)return {conflict:true,revision:target.revision};
 const p=saveBomApplication(target.data,body.productId,body.version,body.config,target.revision+1);
 target.data.bomLossProfiles=[...(target.data.bomLossProfiles||[]).filter(old=>old.productId!==p.productId||old.recipe.version!==p.recipe.version),p];target.revision++;
 return {...p,revision:target.revision,scope};
}
