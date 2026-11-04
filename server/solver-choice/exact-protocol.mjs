import {SolverProblem} from './contract.mjs';
import {rational,gcd} from './exact.mjs';
export const EXACT_MODEL='aps-cpsat-workbook:v3';
export const EXACT_INTEGER='aps-exact-integer:v1';
export const EXACT_CANDIDATE='aps-cpsat-workbook-candidate:v3';
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
const fail=(path)=>{throw new SolverProblem('CP_EXACT_PROTOCOL','无效或不支持的精确整数协议',{path});};
export function readInteger(v,path='quantity'){
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||v<0)fail(path);return BigInt(v);}
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='contract,value'||v.contract!==EXACT_INTEGER||typeof v.value!=='string'||! /^(0|[1-9][0-9]{0,255})$/.test(v.value))fail(path);
 const n=BigInt(v.value);if(n<=MAX_SAFE)fail(path);return n;
}
export function writeInteger(n){if(typeof n!=='bigint'||n<0n||String(n).length>256)fail('encode');return n<=MAX_SAFE?Number(n):{contract:EXACT_INTEGER,value:String(n)};}
// Only declared quantity fields accept the exact carrier. Time, identities,
// source rows and original business input retain their existing schema.
export function quantityFields(m,fn){
 const put=(o,k,p)=>{if(o[k]!==null&&o[k]!==undefined)o[k]=fn(o[k],p+'.'+k);};
 for(const [id,s]of Object.entries(m.scales))put(s,'scale','scales.'+id);put(m,'weightScale','model');
 for(const r of m.resources)put(r,'capacity',r.id);
 for(const g of m.groups){for(const k of ['maxQuantity','fixedQuantity'])put(g,k,g.id);for(const r of g.routes){put(r,'retainedQuantity',r.id);for(const k of ['n','d'])put(r.durationRatio,k,r.id+'.durationRatio');}}
 for(const t of m.tasks){put(t,'maxQuantity',t.id);for(const o of t.options){for(const k of ['capacity','weightMultiplier'])put(o,k,t.id+'.'+o.id);for(const [i,d]of o.days.entries())d[1]=fn(d[1],t.id+'.day.'+i);}}
 for(const l of m.lots)for(const k of ['quantity','reserved'])put(l,k,l.id);
 for(const f of m.feeds){for(const k of ['maxQuantity','protectedQuantity'])put(f,k,f.id);if(f.coefficient)for(const k of ['n','d'])put(f.coefficient,k,f.id+'.coefficient');}
 for(const d of m.demands)for(const k of ['quantity','completedQuantity','protectedQuantity','remaining'])put(d,k,d.id);
 for(const r of m.reservations)put(r,'amount',r.id);
 for(const w of m.metadata.frozenUrgent?.wipDaily||[])put(w,'quantityScaled','wipDaily');return m;
}
export function packModel(m){
 const copy=structuredClone(m);let wide=false;
 quantityFields(copy,(n,p)=>{if(typeof n!=='bigint')n=readInteger(n,p);if(n>MAX_SAFE)wide=true;return writeInteger(n);});
 copy.contract=wide?EXACT_MODEL:'aps-cpsat-workbook:v2';if(wide)copy.integerProtocol={contract:EXACT_INTEGER,base:1000,maximumDecimalDigits:256};
 return copy;
}
export function unpackModel(m){
 if(m.contract!=='aps-cpsat-workbook:v2'&&m.contract!==EXACT_MODEL)fail('model.contract');
 if(m.contract===EXACT_MODEL&&(!m.integerProtocol||Object.keys(m.integerProtocol).sort().join(',')!=='base,contract,maximumDecimalDigits'||m.integerProtocol.contract!==EXACT_INTEGER||m.integerProtocol.base!==1000||m.integerProtocol.maximumDecimalDigits!==256))fail('integerProtocol');
 const {integerBounds,...body}=m;const copy=structuredClone(body);quantityFields(copy,(v,p)=>{if(m.contract==='aps-cpsat-workbook:v2'&&typeof v!=='number')fail(p);return readInteger(v,p);});return copy;
}
export function packCandidate(c,m){const out=structuredClone(c);for(const [key,field]of [['tasks','quantity'],['groups','quantity'],['demands','scheduledQuantity'],['allocations','quantity']])for(const x of out[key])x[field]=writeInteger(x[field]);if(m.contract===EXACT_MODEL)out.contract=EXACT_CANDIDATE;return out;}
export function unpackCandidate(c,m){
 if(!c||!['tasks','groups','demands','allocations','cleaning','unplanned'].every(k=>Array.isArray(c[k])))fail('candidate');
 if(m.contract===EXACT_MODEL?c.contract!==EXACT_CANDIDATE:c.contract!==undefined)fail('candidate.contract');
 const out=structuredClone(c);for(const [key,field]of [['tasks','quantity'],['groups','quantity'],['demands','scheduledQuantity'],['allocations','quantity']])for(const x of out[key]){if(!x||m.contract!==EXACT_MODEL&&typeof x[field]!=='number')fail(key);x[field]=readInteger(x[field],key+'.'+field);}return out;
}
export function encodeWide(value,scale,path){const r=rational(value),n=r.n*BigInt(scale);if(n%r.d)throw new SolverProblem('CP_QUANTITY_NOT_EXACT','原精确量不能截断',{path});return n/r.d;}
export function coefficientWide(cs,ps,a,b){const x=rational(a),y=rational(b),n=x.n*y.d*BigInt(cs),d=x.d*y.n*BigInt(ps),g=gcd(n,d);if(d<=0n)fail('coefficient denominator');return {n:n/g,d:d/g};}
export function batchBoundWide(values,toolValues,multiplier,scale){const rs=values.map(rational);for(const x of toolValues){const r=rational(x);rs.push({n:r.n*BigInt(multiplier),d:r.d});}const r=rs.reduce((a,b)=>a.n*b.d<=b.n*a.d?a:b);return r.n*BigInt(scale)/r.d;}
export const minInteger=(...xs)=>xs.reduce((a,b)=>a<b?a:b);
export const maxInteger=(...xs)=>xs.reduce((a,b)=>a>b?a:b);
