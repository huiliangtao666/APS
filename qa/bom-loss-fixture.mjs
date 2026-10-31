import {createBomLossConfig,setBomLossOverride} from '../src/lib/bom-loss-policy.mjs';
export const recipe={recipeId:'DEMO-1000',version:'fixture-v1',source:'Issue38 approved example (replaceable fixture)',unit:'kg',basisKg:'1000',materials:[['LEAN','650'],['FAT','150'],['WATER','150'],['PREMIX','50']].map(([materialId,quotaKg])=>({materialId,quotaKg,unit:'kg'}))};
export const defaults=()=>createBomLossConfig('CR-BOM-LOSS-20261031 / explicit fixture','draft-v1');
export function example(){let c=defaults();for(const [id,loss]of [['LEAN','2'],['FAT','4'],['WATER','10'],['PREMIX','0']])c=setBomLossOverride(c,id,'production',loss);return c;}
