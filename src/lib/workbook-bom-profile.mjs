import {calculateBomLoss} from './bom-loss-policy.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
// New inputs opt in explicitly; historical inputs without a profile retain their original yield.
export function productionYield(data,productId,version) {
 const profiles=(data.bomLossProfiles||[]).filter(p=>p.productId===productId&&(!version||p.recipe.version===version));
 if(profiles.length>1)throw Error('多个新损耗配方版本，须显式选择');
 if(!profiles.length)return Q.q(data.products.find(p=>p['产品编号']===productId)['总收率']);
 const result=calculateBomLoss(profiles[0].recipe,profiles[0].config);
 if(!result.producible)throw Error('NO_PRODUCIBLE_OUTPUT：配方无可生产产出，不能反算目标');
 return Q.fromExact(result.yield);
}
