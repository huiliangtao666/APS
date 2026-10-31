import {quantityMath as Q} from './material-allocation.mjs';

export const BOM_LOSS_MODEL = 'bom-loss-kg-v1';
export const LOSS_KINDS = Object.freeze(['raw', 'production', 'transport']);
export class BomLossError extends Error {
 constructor(code, path, message) { super(`${code}: ${path}：${message}`); this.name='BomLossError'; this.code=code; this.path=path; }
}
const fail=(code,path,message)=>{throw new BomLossError(code,path,message);};
const object=(v,path)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_OBJECT',path,'须为对象');return v;};
const text=(v,path)=>{if(typeof v!=='string'||!v.trim())fail('MISSING_SOURCE',path,'须明确填写');return v;};
// Accept decimal text only: never trust quantityMath.q's object fast path.
export function decimalInput(value,path='quantity',percent=false) {
 if(typeof value!=='string'&&typeof value!=='number')fail('INVALID_DECIMAL',path,'须为非负有限十进制');
 const s=String(value);
 if(!/^\d+(?:\.\d+)?$/.test(s)||!Number.isFinite(Number(s)))fail('INVALID_DECIMAL',path,'须为非负有限十进制，不自动修正');
 const q=Q.q(s);
 if(percent&&Q.cmp(q,Q.q('100'))>0n)fail('PERCENT_RANGE',path,'损耗须为0至100%');
 return s;
}
export function createBomLossConfig(source,version) {
 return normalizeBomLossConfig({model:BOM_LOSS_MODEL,source,version,percentUnit:'%',unified:{raw:'0',production:'0',transport:'0'},overrides:[]});
}
export function normalizeBomLossConfig(value) {
 const c=object(value,'config');
 if(c.model!==BOM_LOSS_MODEL)fail('MODEL_VERSION','config.model','不支持的模型');
 if(c.percentUnit!=='%')fail('PERCENT_UNIT','config.percentUnit','须明确为%');
 const u=object(c.unified,'unified'),unified={};
 for(const k of LOSS_KINDS)unified[k]=decimalInput(u[k],`unified.${k}`,true);
 if(!Array.isArray(c.overrides))fail('INVALID_OVERRIDES','overrides','须为数组');
 const ids=new Set(),overrides=c.overrides.map((row,i)=>{
  object(row,`overrides[${i}]`);const materialId=text(row.materialId,`overrides[${i}].materialId`);
  if(ids.has(materialId))fail('DUPLICATE_OVERRIDE',materialId,'物料覆盖重复');ids.add(materialId);
  const losses=object(row.losses,`${materialId}.losses`),out={};
  for(const k of Object.keys(losses)){
   if(!LOSS_KINDS.includes(k))fail('UNKNOWN_LOSS_KIND',`${materialId}.${k}`,'未知损耗类别');
   out[k]=decimalInput(losses[k],`${materialId}.${k}`,true);
  }
  return {materialId,losses:out};
 });
 return {model:BOM_LOSS_MODEL,source:text(c.source,'config.source'),version:text(c.version,'config.version'),percentUnit:'%',unified,overrides};
}
export function normalizeBomLossRecipe(value) {
 const r=object(value,'recipe');
 if(r.unit!=='kg')fail('UNIT_MISMATCH','recipe.unit','仅支持统一kg质量模型');
 const basisKg=decimalInput(r.basisKg,'recipe.basisKg');
 if(Q.cmp(Q.q(basisKg),Q.zero)===0n)fail('ZERO_BASIS','recipe.basisKg','基准投入须大于0');
 if(!Array.isArray(r.materials)||!r.materials.length)fail('MISSING_RECIPE','recipe.materials','缺少完整配方');
 const ids=new Set();let total=Q.zero;
 const materials=r.materials.map((m,i)=>{
  object(m,`materials[${i}]`);const materialId=text(m.materialId,`materials[${i}].materialId`);
  if(ids.has(materialId))fail('DUPLICATE_MATERIAL',materialId,'重复物料');ids.add(materialId);
  if(m.unit!=='kg')fail('UNIT_MISMATCH',materialId,'物料单位须为kg');
  const quotaKg=decimalInput(m.quotaKg,`${materialId}.quotaKg`);total=Q.add(total,Q.q(quotaKg));
  return {materialId,quotaKg,unit:'kg'};
 });
 if(Q.cmp(total,Q.q(basisKg))!==0n)fail('BASIS_MISMATCH','recipe.basisKg','完整配方定额合计须等于声明基准，不归一化');
 return {recipeId:text(r.recipeId,'recipe.recipeId'),version:text(r.version,'recipe.version'),source:text(r.source,'recipe.source'),unit:'kg',basisKg,materials};
}
function effective(c,id) {
 const row=c.overrides.find(o=>o.materialId===id),out={};
 for(const k of LOSS_KINDS){const own=Object.hasOwn(row?.losses||{},k);out[k]={percent:own?row.losses[k]:c.unified[k],source:own?'material':'unified'};}
 return out;
}
export function resolveBomLosses(config,materialId) {return effective(normalizeBomLossConfig(config),text(materialId,'materialId'));}
export function setBomLossOverride(config,materialId,kind,value) {
 const c=normalizeBomLossConfig(config);text(materialId,'materialId');
 if(!LOSS_KINDS.includes(kind))fail('UNKNOWN_LOSS_KIND',kind,'未知损耗类别');
 let row=c.overrides.find(o=>o.materialId===materialId);
 if(value===undefined){if(row)delete row.losses[kind];}
 else {const s=decimalInput(value,`${materialId}.${kind}`,true);if(!row){row={materialId,losses:{}};c.overrides.push(row);}row.losses[kind]=s;}
 c.overrides=c.overrides.filter(o=>Object.keys(o.losses).length);return c;
}
export function calculateBomLoss(recipe,config,targetKg) {
 const r=normalizeBomLossRecipe(recipe),c=normalizeBomLossConfig(config);
 for(const o of c.overrides)if(!r.materials.some(m=>m.materialId===o.materialId))fail('UNKNOWN_MATERIAL',o.materialId,'覆盖物料不在本配方');
 let total=Q.zero,output=Q.zero;
 const work=r.materials.map(m=>{const losses=effective(c,m.materialId),input=Q.q(m.quotaKg),kept=Q.mul(input,Q.sub(Q.one,Q.div(Q.q(losses.production.percent),Q.q('100'))));total=Q.add(total,input);output=Q.add(output,kept);return {m,losses,input,kept};});
 const producible=Q.cmp(output,Q.zero)>0n;
 let target,scale;
 if(targetKg!==undefined){target=decimalInput(targetKg,'targetKg');if(!producible)fail('NO_PRODUCIBLE_OUTPUT','targetKg','配方无可生产产出，不能反算目标投入');scale=Q.div(Q.q(target),output);}
 const rows=work.map(({m,losses,input,kept})=>({materialId:m.materialId,quotaKg:m.quotaKg,unit:'kg',losses,input:Q.exact(input),output:Q.exact(kept),...(scale?{targetInput:Q.exact(Q.mul(input,scale)),targetOutput:Q.exact(Q.mul(kept,scale))}:{})}));
 return {model:BOM_LOSS_MODEL,unit:'kg',percentUnit:'%',recipeId:r.recipeId,recipeVersion:r.version,configVersion:c.version,producible,totalInput:Q.exact(total),totalOutput:Q.exact(output),yield:Q.exact(Q.div(output,total)),rows,...(scale?{targetKg:target,scale:Q.exact(scale),targetTotalInput:Q.exact(Q.mul(total,scale)),targetTotalOutput:Q.exact(Q.q(target))}:{})};
}
export const serializeBomLossConfig=c=>JSON.stringify(normalizeBomLossConfig(c));
export function parseBomLossConfig(json) {
 let value;try{value=JSON.parse(json);}catch{fail('INVALID_JSON','config','无效JSON');}
 return normalizeBomLossConfig(value);
}
const deepFreeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;};
export function freezeBomLossRun(recipe,config,targetKg) {
 const r=normalizeBomLossRecipe(recipe),c=normalizeBomLossConfig(config),result=calculateBomLoss(r,c,targetKg);
 return deepFreeze({model:BOM_LOSS_MODEL,recipe:r,config:c,result});
}
// For presentation only. Exact numerator/denominator remain authoritative.
export function displayBomLossExact(e,places=6) {
 let n=BigInt(e.numerator),d=BigInt(e.denominator),whole=n/d,rem=n%d,tail='';
 for(let i=0;i<places&&rem;i++){rem*=10n;tail+=String(rem/d);rem%=d;}
 return String(whole)+(tail?'.'+tail:'')+(rem?'…':'');
}
