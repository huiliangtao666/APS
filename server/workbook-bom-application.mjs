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
