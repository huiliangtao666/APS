import {defs,seed} from '../server/planner.ts';
export function sourceFile(table,rows,{mixed=false,blank=false,name}={}){
 const def=defs.find(d=>d.key===table),quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const lines=[def.fields,...rows.map(row=>def.fields.map(f=>row[f]??''))].map(row=>row.map(quote).join(','));
 return {name:name||def.file,text:(mixed?'\ufeff\r\n':'')+lines.join(blank?'\r\n\r\n':'\r\n')+'\r\n'};
}
export function invalidProducts(){
 const rows=structuredClone(seed.products);rows[0]['产品名称']='原名\r保留\n引号"逗号,\r\n末行';rows[1]['总收率']='1.01';
 // BOM + blank first physical line; blank separator after header and record.
 // Header starts2, first record4 (four physical lines), second record9.
 return {rows,file:sourceFile('products',rows,{mixed:true,blank:true}),lines:[4,9]};
}
export function duplicateRoutes(){
 const rows=structuredClone(seed.routes);rows[0]['工序名称']='原工序\r\n名称';rows.push({...rows[0]});
 // Header1, first2..3, then remaining4,5,6 and duplicate7..8.
 return {rows,file:sourceFile('routes',rows),lines:[2,4,5,6,7]};
}
