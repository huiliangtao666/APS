import {quantityScales,rational,lcm,gcd,safe} from './exact.mjs';
import {SolverProblem} from './contract.mjs';
const exact=r=>({n:String(r.n),d:String(r.d)});
function sourceDecimal(value,path){if(typeof value==='number'&&!Number.isSafeInteger(value))throw new SolverProblem('CP_QUANTITY_PRECISION','源小数须保留原十进制，不能推断浮点精度',{path,value});return rational(value);}
// This is the least denominator closure of the existing integer lattices,
// not an assumed business precision. Keep the whole-quantity generator 1:
// source values do not authorize coarsening a variable's admissible domain.
export function quantityLattice(d){
 const scales=quantityScales(d),boms=d.tables['物料清单']||[],visited=new Set(),visiting=new Set(),order=[],steps=[];
 function visit(id){if(visiting.has(id))throw new SolverProblem('CP_BOM_CYCLE','BOM循环',{materialId:id});if(visited.has(id))return;visiting.add(id);for(const b of boms.filter(b=>b['父项编号']===id))visit(b['子项编号']);visiting.delete(id);visited.add(id);order.unshift(id);}
 for(const id of Object.keys(scales))visit(id);
 const source=Object.fromEntries(Object.entries(scales).map(([id,s])=>[id,{...s,scale:String(s.scale)}]));
 for(const id of order)for(const b of boms.filter(b=>b['父项编号']===id)){
  const child=b['子项编号'],p=scales[id],c=scales[child];if(!p||!c)throw new SolverProblem('CP_BOM_SOURCE','BOM物料缺失',{bomId:b['用量关系编号']});
  if(p.unit!=='千克'||b['数量单位']!==c.unit)throw new SolverProblem('CP_QUANTITY_UNIT','BOM须为父项千克及子项基础单位',{bomId:b['用量关系编号'],parentUnit:p.unit,childUnit:c.unit,sourceUnit:b['数量单位']});
  const a=sourceDecimal(b['子项基准用量'],b['用量关系编号']+'/子项基准用量'),z=sourceDecimal(b['父项基准产出千克'],b['用量关系编号']+'/父项基准产出千克');if(!z.n)throw new SolverProblem('CP_QUANTITY_PRECISION','父项基准须大于0',{bomId:b['用量关系编号']});
  const numerator=a.n*z.d,denominator=a.d*z.n,g=gcd(numerator,denominator),n=numerator/g,den=denominator/g;
  const parentStepDenominator=p.scale*den,stepGcd=gcd(n,parentStepDenominator),required=parentStepDenominator/stepGcd,before=c.scale;
  // Counted packages retain the existing per-group ceil. For kg no rounding
  // is introduced. Zero coefficients add no denominator requirement.
  if(c.unit!=='个')c.scale=lcm(c.scale,required);
  steps.push({bomId:b['用量关系编号'],sheet:'物料清单',row:b._row??null,cells:b._cells??{},parent:id,child,
   source:{parentKg:b['父项基准产出千克'],childQuantity:b['子项基准用量'],unit:b['数量单位'],yield:b['标准收率']??null,rounding:b['取整方式']??null,formulas:b._formulas??{}},
   ratio:{unreduced:{n:String(numerator),d:String(denominator)},gcd:String(g),...exact({n,d:den})},
   parentScale:String(p.scale),unitStep:{unreduced:{n:String(n),d:String(parentStepDenominator)},gcd:String(stepGcd),...exact({n:n/stepGcd,d:required})},
   childBefore:String(before),childAfter:String(c.scale),ceil:c.unit==='个',yieldTreatment:'frozen qualified-output BOM ratio; yield/loss already embodied; no second deduction'});
 }
 return {contract:'exact-quantity-lattice:v1',method:'independent material denominators; reduced parent step; no source rounding or coarsening',
  source,steps,materials:Object.fromEntries(Object.entries(scales).map(([id,s])=>[id,{...s,scale:String(s.scale)}]))};
}
export function nativeScales(certificate){
 const result={};for(const [id,s]of Object.entries(certificate.materials)){
  const scale=BigInt(s.scale);if(scale>BigInt(Number.MAX_SAFE_INTEGER)){
   const int64=(1n<<63n)-1n;
   throw new SolverProblem('CP_QUANTITY_OVERFLOW','精确物料格点超出现有整数协议；保留源精度，未采用候选',{
    path:id,value:s.scale,protocol:'JSON number / JS safe integer',protocolMax:String(Number.MAX_SAFE_INTEGER),int64Max:String(int64),exceedsInt64:scale>int64,
    sourceScale:certificate.source[id].scale,propagation:certificate.steps.filter(x=>x.child===id),
    limitation:'single integer per material quantity; no claimed proof against every possible multi-limb reformulation',
    remedy:'exact multi-limb quantity/flow and resource reformulation, or explicit approved precision/rounding semantics; no default precision'});
  }result[id]={...s,scale:safe(scale,id)};
 }return result;
}
export function decimalProduct(a,b){
 const x=sourceDecimal(a,'decimalProduct.left'),y=sourceDecimal(b,'decimalProduct.right'),r=rational({n:x.n*y.n,d:x.d*y.d});let den=r.d,places=0;
 while(den!==1n){const g=gcd(den,10n);if(g===1n)throw new SolverProblem('CP_QUANTITY_PRECISION','非有限十进制须保留有理数');den/=g;places++;}
 const value=String(r.n*(10n**BigInt(places))/r.d).padStart(places+1,'0');return places?value.slice(0,-places)+'.'+value.slice(-places):value;
}
export function exactBatchBound(values,multipliedValues,multiplier,scale){
 const candidates=values.map((x,i)=>sourceDecimal(x,'batch capacity '+i));
 for(const [i,x]of multipliedValues.entries()){const r=sourceDecimal(x,'tool capacity '+i);candidates.push(rational({n:r.n*BigInt(multiplier),d:r.d}));}
 const r=candidates.reduce((a,b)=>a.n*b.d<=b.n*a.d?a:b);
 return safe(r.n*BigInt(scale)/r.d,'batch bound');
}
export function sourceLotQuantity(lot,d){
 const record=(d.tables[lot.source.sheet]||[]).find(r=>r._row===lot.source.row);
 if(lot.id.startsWith('inventory:')&&record){const a=rational(record['当前数量']),b=rational(record['期初已占用量']),n=a.n*b.d-b.n*a.d;return rational({n:n>0n?n:0n,d:a.d*b.d});}
 if(lot.id.startsWith('transit:')&&record)return record['订购数量'];
 if(lot.id.startsWith('draft:'))return d.drafts.find(r=>r.id===lot.source.draft).quantity;
 throw new SolverProblem('CP_QUANTITY_PRECISION','供给缺少可核原数量',{lotId:lot.id});
}
