import {createHash} from 'node:crypto';
import {SolverProblem,fingerprint} from './contract.mjs';
import {unpackModel} from './exact-protocol.mjs';
export const LIMB_BASE=1000n,INT64=(1n<<63n)-1n;
const floor=(a,b)=>a>=0n?a/b:-((-a+b-1n)/b);
export function digits(value,base=LIMB_BASE){let n=BigInt(value);if(n<0n)throw Error('negative digit input');const d=[];do{d.push(n%base);n/=base;}while(n);return d;}
export function restore(values,base=LIMB_BASE){let n=0n;for(let i=values.length-1;i>=0;i--){const d=BigInt(values[i]);if(d<0n||d>=base)throw Error('limb domain');n=n*base+d;}return n;}
const i64=(x,path)=>{if(x< -INT64-1n||x>INT64)throw new SolverProblem('CP_INT64_OVERFLOW','分肢原生变量/系数/活动界超限',{path,value:String(x)});return x;};
// A certificate over independent rectangular digit domains, before any
// narrowing by another constraint. Bounds never assume correlated decisions.
export function limbEquation(terms,constant=0n,base=LIMB_BASE){
 const columns=[],vars=[];const add=(k,id,c,min,max)=>{(columns[k]??=[]).push({id,c,min,max});};
 for(const [j,t]of terms.entries()){
  if(BigInt(t.min??0)!==0n||BigInt(t.max)<0n)throw Error('use nonnegative quantity domains');
  const ds=digits(t.max,base),cs=digits(BigInt(t.coefficient??1)<0n?-BigInt(t.coefficient):BigInt(t.coefficient??1),base),sign=BigInt(t.coefficient??1)<0n?-1n:1n;
  for(let i=0;i<ds.length;i++){const id='x'+j+'.'+i,max=i===ds.length-1?ds[i]:base-1n;vars.push({id,min:'0',max:String(max)});for(let k=0;k<cs.length;k++)if(cs[k])add(i+k,id,sign*cs[k],0n,max);}
 }
 const constantDigits=digits(constant<0n?-constant:constant,base),sign=constant<0n?-1n:1n;let carryLo=0n,carryHi=0n;const rows=[];
 // Extra columns flush all carries; the final carry is explicitly zero.
 const total=columns.length+digits(BigInt(Math.max(1,terms.length)),base).length+2;
 for(let k=0;k<Math.max(total,constantDigits.length+2);k++){
  const c=(constantDigits[k]??0n)*sign,ts=columns[k]||[];let lo=c+carryLo,hi=c+carryHi;
  for(const t of ts){i64(t.c,'coefficient');i64(t.min,'digit.min');i64(t.max,'digit.max');lo+=t.c>=0n?t.c*t.min:t.c*t.max;hi+=t.c>=0n?t.c*t.max:t.c*t.min;}
  const last=k===Math.max(total,constantDigits.length+2)-1,nextLo=last?0n:floor(lo,base),nextHi=last?0n:floor(hi,base);
  const activityLo=lo-base*nextHi,activityHi=hi-base*nextLo;
  for(const [name,v]of Object.entries({carryLo,carryHi,nextLo,nextHi,activityLo,activityHi,base}))i64(v,name);
  rows.push({column:k,constant:String(c),terms:ts.map(t=>({id:t.id,coefficient:String(t.c),min:String(t.min),max:String(t.max)})),carryIn:[String(carryLo),String(carryHi)],carryOut:[String(nextLo),String(nextHi)],activity:[String(activityLo),String(activityHi)]});carryLo=nextLo;carryHi=nextHi;
 }
 return {base:Number(base),variables:vars,rows,finalCarry:'0'};
}
// Independent witness evaluator: accepts the original integers, computes the
// only possible carry at each column, and checks the lowered row domains.
export function equationWitness(proof,values){
 const ds=values.map(v=>digits(v,BigInt(proof.base)));let carry=0n;
 for(const r of proof.rows){if(carry<BigInt(r.carryIn[0])||carry>BigInt(r.carryIn[1]))return false;let sum=carry+BigInt(r.constant);for(const t of r.terms){const [,j,i]=/^x(\d+)\.(\d+)$/.exec(t.id),v=ds[Number(j)][Number(i)]??0n;if(v<BigInt(t.min)||v>BigInt(t.max))return false;sum+=v*BigInt(t.coefficient);}if(sum%BigInt(proof.base))return false;carry=sum/BigInt(proof.base);if(carry<BigInt(r.carryOut[0])||carry>BigInt(r.carryOut[1]))return false;}
 return carry===0n;
}
export function workbookLimbCertificate(input,expected=null,{diagnostic=null,sink=null,unpacked=null}={}){
 const m=unpacked??unpackModel(input),hasher=createHash('sha256');hasher.update('[');let count=0,max=0n,rowCount=0,variables=0;
 const put=(path,terms,k=0n)=>{const digitTerms=terms.reduce((n,t)=>n+digits(t.max).length*digits(BigInt(t.coefficient??1n)<0n?-BigInt(t.coefficient):BigInt(t.coefficient??1n)).length,0);if(count%128===0||digitTerms>4096)diagnostic?.('certificate.before-expression',{count,path,terms:terms.length,digitTerms,estimatedTemporaryBytes:digitTerms*640+65536});const p=limbEquation(terms,k),entry={path,terms:terms.map(t=>({max:String(t.max),coefficient:String(t.coefficient??1n)})),constant:String(k),digitDomains:p.variables.map(v=>[v.id,v.min,v.max]),columns:p.rows.map(r=>({column:r.column,carryIn:r.carryIn,carryOut:r.carryOut,activity:r.activity})),coefficientBound:[String(-LIMB_BASE),String(LIMB_BASE)],expandedRowsHash:fingerprint(p.rows)};
  rowCount+=p.rows.length;variables+=p.variables.length;for(const r of p.rows)for(const a of r.activity){const x=BigInt(a);if((x<0n?-x:x)>max)max=x<0n?-x:x;}
  if(expected?.contract==='aps-limb-bounds:v1'&&fingerprint(entry)!==fingerprint(expected.expressions[count]))throw new SolverProblem('CP_EXACT_CERTIFICATE','分肢活动证书变化',{path});
  sink?.({entry,proof:p});
  if(count)hasher.update(',');hasher.update(JSON.stringify(entry));count++;
 },v=(max,c=1n)=>({max:BigInt(max),coefficient:BigInt(c)}),gs=new Map(m.groups.map(g=>[g.id,g])),ts=new Map(m.tasks.map(t=>[t.id,t]));
 for(const g of m.groups)for(const r of g.routes){put(g.id+'/'+r.id+'/conservation',[...r.taskIds.map(id=>v(ts.get(id).maxQuantity)),v(g.maxQuantity,-1n)]);for(const id of r.taskIds){const t=ts.get(id),rmax=t.maxQuantity*r.durationRatio.n+r.durationRatio.d-1n;put(id+'/durationCeil',[v(t.maxQuantity,r.durationRatio.n),v(rmax,-1n)],r.durationRatio.d-1n);put(id+'/durationDivision',[v(BigInt(m.window[1]-m.window[0]),r.durationRatio.d),v(r.durationRatio.d-1n),v(rmax,-1n)]);}}
 const claims=new Map(m.lots.map(l=>[l.id,[]])),quotas=new Map(),occupancy=new Map(m.resources.map(r=>[r.id,[]]));
 for(const f of m.feeds){if(f.coefficient){const c=f.coefficient;put(f.id+'/BOM',[v(gs.get(f.groupId).maxQuantity,c.n),v(f.maxQuantity,-c.d)]);if(f.ceil)put(f.id+'/BOMCeilRemainder',[v(gs.get(f.groupId).maxQuantity,c.n),v(f.maxQuantity,-c.d),v(c.d-1n,-1n)],c.d-1n);put(f.id+'/protected',[v(f.maxQuantity),v(f.maxQuantity,-1n)],f.protectedQuantity??0n);}put(f.id+'/flows',[...f.eligibleLotIds.map(()=>v(f.maxQuantity)),v(f.maxQuantity,-1n)]);for(const id of f.eligibleLotIds)claims.get(id).push(v(f.maxQuantity));}
 for(const l of m.lots){const total=claims.get(l.id);put(l.id+'/lot-and-FEFO',[...total,v(l.quantity,-1n)],l.reserved);}
 for(const t of m.tasks)for(const o of t.options){const amount=t.maxQuantity*o.weightMultiplier;put(t.id+'/'+o.id+'/weight',[v(t.maxQuantity,o.weightMultiplier),v(amount,-1n)]);occupancy.get(o.resourceId)?.push(v(o.shared?amount:1n));for(const [day]of o.days){const key=o.resourceId+'|'+day;if(!quotas.has(key))quotas.set(key,[]);quotas.get(key).push(v(t.maxQuantity,o.weightMultiplier));}}
 for(const w of m.metadata.frozenUrgent?.wipDaily||[]){const key=w.resourceId+'|'+w.day;if(!quotas.has(key))quotas.set(key,[]);quotas.get(key).push(v(w.quantityScaled));}
 for(const [key,terms]of quotas){const max=terms.reduce((s,t)=>s+t.max*t.coefficient,0n);put(key+'/daily-pool',[...terms,v(max,-1n)]);}
 for(const r of m.reservations)occupancy.get(r.resourceId)?.push(v(r.amount));
 for(const [id,terms]of occupancy){const cap=m.resources.find(r=>r.id===id).capacity,total=terms.reduce((s,t)=>s+t.max,0n);put(id+'/event-active-weight-capacity',[...terms,v(total,-1n)],-cap);}
 hasher.update(']');const certificateHash=hasher.digest('hex');
 const summary={expressions:count,rows:rowCount,digitDomainOccurrences:variables,maxAbsoluteLinearActivity:String(max)};
 if(expected){if((expected.contract==='aps-limb-bounds:v1'?expected.expressions.length:expected.expressionCount)!==count||fingerprint(expected.summary)!==fingerprint(summary)||expected.certificateHash!==certificateHash||!['aps-limb-bounds:v1','aps-limb-bounds:v2'].includes(expected.contract)||expected.base!==Number(LIMB_BASE)||expected.nativeMax!==String(INT64))throw new SolverProblem('CP_EXACT_CERTIFICATE','分肢证书不符');return expected;}
 return {contract:'aps-limb-bounds:v2',base:Number(LIMB_BASE),nativeMax:String(INT64),expressionCount:count,summary,nativeValidation:'NOT_EXECUTED',adapter:'every emitted native row and variable rechecked by limb_cp_sat.py; cumulative uses exact active-at-start events, never separate digit cumulatives',certificateHash};
}
