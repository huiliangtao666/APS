import {resolvedInput,calendarDay,dayCalendar,number,fail} from './context.mjs';
import {effectiveBom} from './bom.mjs';

/** Root = an active BOM parent that is not a child in any active BOM.
 * Independent of table paging, SKU prefixes, categories and process routes. */
export function bomProducts(snapshot,request={}){
 const at=calendarDay(snapshot.identity.dayZero,request.asOfDate),d=resolvedInput(snapshot,at),graph=effectiveBom(d,at);
 const offset=request.offset??0,limit=100;
 if(!Number.isSafeInteger(offset)||offset<0)fail('产品展示分页无效',422);
 const childIds=new Set(graph.edges.map(r=>r['子项编号']));
 const roots=[...graph.children.keys()].filter(id=>!childIds.has(id)&&graph.materials.has(id)).sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
 const items=roots.slice(offset,offset+limit).map(id=>{const m=graph.materials.get(id);return {id,name:m['物料名称']||id,category:m['物料类别']||null,unit:m['基础单位']||null,pieceKg:number(m['每件净重千克']),boxKg:number(m['每箱净重千克'])};});
 return {items,total:roots.length,offset,nextOffset:offset+items.length<roots.length?offset+items.length:null,asOfDate:dayCalendar(snapshot.identity.dayZero,at),
  warning:graph.diagnostics.length?'BOM存在缺失、冲突或循环关系，请在用量关系中核对；图鉴按当前有效关系识别顶层物料。':null};
}
