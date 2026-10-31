// Independent checker: no production scheduling, quantity, window or adapter imports.
const frac=x=>{
 if(x&&typeof x==='object')return [BigInt(x.numerator),BigInt(x.denominator)];
 const [a,b='']=String(x).split('.');return [BigInt(a+b),10n**BigInt(b.length)];
};
const add=([a,b],[c,d])=>[a*d+c*b,b*d];
const cmp=([a,b],[c,d])=>a*d-c*b;
const total=(rows,key)=>rows.reduce((s,r)=>add(s,frac(r[key])),[0n,1n]);
const window=(ws,t)=>ws.some(([a,b])=>a<=t.start&&t.end<=b);

export function checkCooling(members,proposal,{reservations=[],endMinute=600,complete=true}={}) {
 const errors=[],tasks=proposal.tasks||[];
 const fail=(code,detail)=>errors.push({code,detail});
 const seen=new Set();for(const t of tasks){if(seen.has(t.id))fail('DUPLICATE_TASK',t.id);seen.add(t.id);const m=members.find(m=>m.id===t.productionBatchId);if(!m)fail('UNKNOWN_MEMBER',t.id);else if(![m.heatOperation,m.coolOperation].includes(t.operation))fail('UNKNOWN_OPERATION',t.id);}
 const heatResources=new Map(),usage=[];
 for(const m of members){
  const heat=tasks.filter(t=>t.productionBatchId===m.id&&t.operation===m.heatOperation),cool=tasks.filter(t=>t.productionBatchId===m.id&&t.operation===m.coolOperation);
  if(!complete&&!heat.length&&!cool.length)continue;
  if(heat.length!==1||cool.length!==1){fail('COVERAGE',m.id);continue;}
  const h=heat[0],c=cool[0];
  if(h.start<m.readyMinute||c.start<h.end||c.start-h.end>m.maxWait)fail('WAIT_OR_PRECEDENCE',m.id);
  if(h.end-h.start!==m.heatDuration||c.end-c.start!==m.coolDuration)fail('FIXED_DURATION',m.id);
  if(!window(m.heatWindows,h)||!window(m.coolWindows,c))fail('WINDOW',m.id);
  if(h.machine!==m.heatMachine||c.machine!==m.coolMachine||h.program!==m.program)fail('IDENTITY_PROGRAM',m.id);
  if(h.orderId!==m.orderId||c.orderId!==m.orderId||h.productId!==m.productId||c.productId!==m.productId||c.predecessor!==h.id)fail('ORDER_IDENTITY',m.id);
  if(cmp(frac(h.exactLoadKg),frac(m.inputKg))!==0n||cmp(frac(c.exactQuantity),frac(m.outputKg))!==0n||cmp(frac(h.exactQuantity),frac(m.outputKg))!==0n)fail('QUANTITY',m.id);
  for(const t of [h,c])if(t.start<0||t.end>endMinute||t.end<=t.start||!Number.isSafeInteger(t.start)||!Number.isSafeInteger(t.end))fail('HORIZON',t.id);
  const group=heatResources.get(h.resourceBatchId)||[];group.push({m,h});heatResources.set(h.resourceBatchId,group);
  usage.push({resource:'machine:'+m.coolMachine,start:c.start,end:c.end,quantity:'1',capacity:'1'},{resource:'space:'+m.spaceId,start:c.start,end:c.end,quantity:m.outputKg,capacity:m.spaceCapacityKg});
 }
 for(const [id,rows]of heatResources){
  const {m,h}=rows[0],input=rows.reduce((s,r)=>add(s,frac(r.m.inputKg)),[0n,1n]);
  if(cmp(input,frac(m.maximumInputKg))>0n||cmp(input,frac(m.minimumInputKg))<0n)fail('HEAT_CAPACITY',id);
  if(rows.some(x=>x.h.start!==h.start||x.h.end!==h.end||x.m.heatMachine!==m.heatMachine||x.m.productId!==m.productId||x.m.recipeKey!==m.recipeKey||x.m.routeKey!==m.routeKey||x.m.program!==m.program||x.m.heatDuration!==m.heatDuration))fail('GROUP_COMPATIBILITY',id);
  const g=(proposal.groups||[]).filter(g=>g.heatResourceBatchId===id);
  if(g.length!==1||g[0].memberIds.length!==rows.length||rows.some(r=>!g[0].memberIds.includes(r.m.id))||cmp(frac(g[0].exactInputKg),input)!==0n||cmp(frac(g[0].exactOutputKg),rows.reduce((s,r)=>add(s,frac(r.m.outputKg)),[0n,1n]))!==0n)fail('GROUP_LEDGER',id);
  usage.push({resource:'machine:'+m.heatMachine,start:h.start,end:h.end,quantity:'1',capacity:'1'});
 }
 const all=[...usage,...reservations];
 for(const u of usage){
  const relevant=all.filter(r=>r.resource===u.resource),points=[...new Set(relevant.flatMap(r=>[r.start,r.end]))];
  for(const t of points){const active=relevant.filter(r=>r.start<=t&&t<r.end);if(cmp(total(active,'quantity'),frac(u.capacity))>0n)fail('OCCUPANCY',{resource:u.resource,minute:t});}
 }
 // Do not trust a scheduler's self-reported reservations to prove the tasks.
 for(const u of usage){const matching=(proposal.reservations||[]).filter(r=>r.resource===u.resource&&r.start===u.start&&r.end===u.end);if(!matching.some(r=>cmp(frac(r.quantity),frac(u.quantity))===0n))fail('MISSING_RESERVATION',u.resource);}
 return errors;
}
