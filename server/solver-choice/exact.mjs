import {quantityMath as Q} from '../../src/lib/material-allocation.mjs';
import {SolverProblem} from './contract.mjs';
export const gcd=(a,b)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b)[a,b]=[b,a%b];return a;};
export function rational(value){
 try{const r=value&&typeof value==='object'?value:Q.q(String(value)),g=gcd(r.n,r.d);if(typeof r.n!=='bigint'||typeof r.d!=='bigint'||r.n<0n||r.d<=0n)throw Error();return {n:r.n/g,d:r.d/g};}
 catch{throw new SolverProblem('CP_QUANTITY_PRECISION','须有明确非负十进制或内部精确有理数',{value:String(value)});}
}
export const lcm=(a,b)=>a/gcd(a,b)*b;
export function safe(value,path){const n=BigInt(value);if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw new SolverProblem('CP_QUANTITY_OVERFLOW','数量或系数不能无损表达',{path,value:String(n)});return Number(n);}
export function ratio(a,b=1){const r=Q.div(rational(a),rational(b));return {n:safe(r.n,'ratio.n'),d:safe(r.d,'ratio.d')};}
export function encode(value,scale,path){const r=rational(value),n=r.n*BigInt(scale);if(n%r.d)throw new SolverProblem('CP_QUANTITY_NOT_EXACT','数量不符合冻结量纲精度，不能截断',{path,value,scale});return safe(n/r.d,path);}
export const exactValue=(value,scale)=>Q.exact(Q.div(rational(value),rational(scale)));
export const decode=(value,scale)=>Q.num(Q.fromExact(exactValue(value,scale)));
export function coefficient(childScale,parentScale,a,b){const r=Q.div(Q.mul(rational(a),rational(childScale)),Q.mul(rational(b),rational(parentScale)));return {n:safe(r.n,'BOM.n'),d:safe(r.d,'BOM.d')};}
export function quantityScales(d){
 const scales=new Map(),sources=new Map();
 const add=(id,value,path)=>{if(value===undefined||value===null||value==='')return;if(typeof value==='number'&&!Number.isSafeInteger(value))throw new SolverProblem('CP_QUANTITY_PRECISION','源小数须保留原十进制，不能推断浮点精度',{path,value});const r=rational(value);scales.set(id,lcm(scales.get(id)||1n,r.d));(sources.get(id)||sources.set(id,[]).get(id)).push({path,value:String(value),n:String(r.n),d:String(r.d)});};
 for(const r of d.tables['物料主数据']||[]){const id=r['物料编号'];scales.set(id,1n);for(const f of ['每箱净重千克','每件净重千克'])add(id,r[f],'物料主数据/'+id+'/'+f);}
 for(const [table,key,fields]of [['每日需求','成品编号',['需求千克']],['期初库存','物料编号',['当前数量','期初已占用量']],['既有采购在途','物料编号',['订购数量']],['期初在制','成品编号',['预计合格产出']]])for(const r of d.tables[table]||[])for(const f of fields)add(r[key],r[f],table+'/'+r._row+'/'+f);
 for(const r of d.tables['在制剩余映射']||[]){const w=(d.tables['期初在制']||[]).find(w=>w['在制批次编号']===r['在制批次编号']);if(w)add(w['成品编号'],r['当前占用数量千克'],'在制剩余映射/'+r._row+'/当前占用数量千克');}
 for(const table of ['期初库存','既有采购在途','期初在制'])for(const r of d.tables[table]||[]){const id=r['物料编号']??r['成品编号'],material=(d.tables['物料主数据']||[]).find(m=>m['物料编号']===id);if(r['数量单位']!==material?.['基础单位'])throw new SolverProblem('CP_QUANTITY_UNIT','供给数量须保留物料基础单位',{table,row:r._row,materialId:id,sourceUnit:r['数量单位'],baseUnit:material?.['基础单位']});}
 for(const r of d.drafts||[])add(r.materialId,r.quantity,'draft/'+r.id);
 for(const t of d.urgentOrder?.seedTasks||[])add(t.productId,t.quantity,'execution/task/'+t.id);
 for(const a of d.urgentOrder?.seedAllocations||[])add(a.materialId,a.quantity,'execution/allocation/'+a.supplyId);
 // Exact common denominators are a representation, not a new rounding rule.
 // Parent-to-child ratios are retained in the model; indivisible packages use
 // the existing group-level ceiling, never one ceiling per arbitrary batch.
 return Object.fromEntries([...scales].map(([id,s])=>{const material=d.tables['物料主数据'].find(x=>x['物料编号']===id);if(!material)throw new SolverProblem('CP_BOM_SOURCE','数量物料缺失',{materialId:id});if(material['基础单位']==='个'&&s!==1n)throw new SolverProblem('CP_INDIVISIBLE_UNIT','实物个数存在小数',{materialId:id});return [id,{scale:s,unit:material['基础单位'],source:sources.get(id)||[]}];}));
}
