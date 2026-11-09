import {number} from './query-reports/context.mjs';
import {sumKnown} from './query-reports/projections.mjs';

const flowKeys=['independent','dependent','purchase','firm','mps'];
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
const plusDays=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
const total=values=>sumKnown(values);

/** Read-only daily quantity projection. Start from unreserved qualified stock,
 * replay saved source flows to the requested start, consume FEFO, and expire
 * only each lot's unused remainder. Unissued suggestions never enter supply.
 * Missing or invalid source facts remain absent; they are not numeric zero.
 */
export function createMpsProjection(c,eventIndex){
 const cache=new Map(),rows=new Map(Object.values(c.details).flat().map(r=>[r.id,r]));
 const materialStocks=new Map();for(const row of c.stocks){if(!materialStocks.has(row.materialId))materialStocks.set(row.materialId,[]);materialStocks.get(row.materialId).push(row);}
 function calculate(material){
  const id=material['物料编号'],unit=material['基础单位'],stocks=materialStocks.get(id)||[];
  if(!Object.hasOwn(c.d.tables,'期初库存')||!Object.hasOwn(c.d.tables,'每日需求')||!Object.hasOwn(c.d.tables,'物料需求来源'))return null;
  if(material['物料来源']==='采购'&&!Object.hasOwn(c.d.tables,'既有采购在途'))return null;
  if(material['物料来源']==='制造'&&(!Object.hasOwn(c.d.tables,'期初在制')||c.p&&!Array.isArray(c.p.tasks)))return null;
  if(stocks.some(r=>r.values.unit!==unit||r.values.free===null||!validDate(r.values.snapshotDate)||!validDate(r.values.expiryDate)))return null;
  const snapshots=new Set(stocks.map(r=>r.values.snapshotDate));if(snapshots.size>1)return null;
  const base=stocks[0]?.values.snapshotDate??c.v.identity.dayZero;
  if(base>c.from)return null;
  const events=flowKeys.flatMap(key=>(eventIndex.get(JSON.stringify([id,key]))||[]).map(e=>({...e})));
  if(events.some(e=>!validDate(e.date)||e.quantity===null||e.quantity<0||e.unit!==unit))return null;
  const supplies=new Map(),demands=new Map(),lots=[],dates=new Set(c.days);
  let balance=0;
  const addDate=date=>{if(date>=base&&date<=c.to)dates.add(date);};
  const supply=(date,quantity,expiry,record)=>{
   if(date<base||date>c.to||quantity===0)return;
   if(!supplies.has(date))supplies.set(date,[]);
   supplies.get(date).push({quantity,expiry,record,availableDate:date});addDate(date);if(expiry)addDate(expiry);
  };
  for(const row of stocks){
   const {free,expiryDate}=row.values;
   if(free===0||expiryDate<=base)continue;
   lots.push({quantity:free,initialQuantity:free,expiry:expiryDate,record:row.id,availableDate:row.values.snapshotDate});balance=total([balance,free]);addDate(expiryDate);
  }
  for(const e of events){
   if(e.date<base||e.date>c.to)continue;
   if(['independent','dependent'].includes(e.metric)){
    demands.set(e.date,total([demands.get(e.date)||0,e.quantity]));addDate(e.date);continue;
   }
   const row=rows.get(e.record),raw=row?.raw||{};
   const explicit=number(raw['预计到期日']??raw['到期日']);
   const shelf=number(material['保质天数']);
   const expiry=explicit!==null?plusDays(c.v.identity.dayZero,explicit):shelf!==null&&shelf>=0?plusDays(row?.values.completionDate||e.date,shelf):null;
   supply(e.date,e.quantity,expiry,e.record);
  }
  const result=new Map(),baseline=balance;
  let priorSupply=0,priorDemand=0,priorExpiry=0;
  for(const date of [...dates].sort()){
   const opening=balance;
   const openingBasis=c.q.date===date&&c.q.metric==='opening'?{snapshotFree:baseline,priorSupply,priorDemand,priorExpiry}:null;
   const trace=c.q.date===date&&c.q.metric==='expiry',expiredLots=[];
   let expiry=0;
   for(const lot of lots)if(lot.expiry!==null&&lot.expiry<=date&&lot.quantity>0){
    if(trace)expiredLots.push({record:lot.record,availableDate:lot.availableDate,expiryDate:lot.expiry,initialQuantity:lot.initialQuantity,consumedQuantity:total([lot.initialQuantity,-lot.quantity]),expiredQuantity:lot.quantity});
    expiry=total([expiry,lot.quantity]);lot.quantity=0;
   }
   balance=total([balance,-expiry]);
   for(const incoming of supplies.get(date)||[]){
    priorSupply=total([priorSupply,incoming.quantity]);
    if(incoming.expiry!==null&&incoming.expiry<=date){
     if(trace)expiredLots.push({record:incoming.record,availableDate:date,expiryDate:incoming.expiry,initialQuantity:incoming.quantity,consumedQuantity:0,expiredQuantity:incoming.quantity});
     expiry=total([expiry,incoming.quantity]);continue;
    }
    // A prior shortage absorbs future supply before any remainder is stored.
    const debt=Math.max(0,-balance),remaining=Math.max(0,total([incoming.quantity,-debt]));
    balance=total([balance,incoming.quantity]);
    if(remaining>0)lots.push({...incoming,initialQuantity:incoming.quantity,quantity:remaining});
   }
   const demand=demands.get(date)||0;
   let unconsumed=demand;
   lots.sort((a,b)=>(a.expiry||'9999-12-31').localeCompare(b.expiry||'9999-12-31'));
   for(const lot of lots){const used=Math.min(lot.quantity,unconsumed);lot.quantity=total([lot.quantity,-used]);unconsumed=total([unconsumed,-used]);if(unconsumed<=0)break;}
   balance=total([balance,-demand]);
   priorDemand=total([priorDemand,demand]);priorExpiry=total([priorExpiry,expiry]);
   result.set(date,{opening,balance,expiry,...(trace?{expiredLots}:{}),...(openingBasis?{openingBasis}:{})});
  }
  return result;
 }
 return (material,date)=>{
  const id=material['物料编号'];if(!cache.has(id))cache.set(id,calculate(material));
  return cache.get(id)?.get(date)??null;
 };
}
