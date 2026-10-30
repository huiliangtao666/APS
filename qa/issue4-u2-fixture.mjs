import {seed} from '../server/planner.ts';
// Original Design mock-cases.json: S=30, U1=20, U2=15, unrelated T/U3=9.
// Extra required columns come from the existing application seed, not new defaults.
export function u2Data(){
 const d=structuredClone(seed);
 const supply=(id,amount)=>({'供给编号':id,'物料编号':d.materials[0]['物料编号'],'批次编号':'U2-'+id,'预计数量':amount,'预计到达时间':'2026-11-02T08:00:00+08:00','预计可用时间':'2026-11-02T09:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'});
 d.supplies=[supply('S','30'),supply('T','9')];
 d.supplyUses=[['U1','S','20'],['U2','S','15'],['U3','T','9']].map(([id,s,qty])=>({'引用编号':id,'订单编号':d.orders[0]['订单编号'],'工序编号':d.routes.find(r=>r['产品编号']===d.orders[0]['产品编号'])['工序编号'],'供给编号':s,'使用数量':qty}));
 d.supplyDelays=[];return d;
}
export const supplyInput=d=>({supplies:d.supplies,uses:d.supplyUses,delays:d.supplyDelays,materials:d.materials,orders:d.orders,routes:d.routes});
export const delay=(id,time,arrival,ready)=>({'记录编号':id,'供给编号':'S','记录时间':`2026-11-01T${time}:00+08:00`,'调整后到达时间':`2026-11-02T${arrival}:00+08:00`,'调整后可用时间':`2026-11-02T${ready}:00+08:00`,'原因':'U2 comparison fixture'});
