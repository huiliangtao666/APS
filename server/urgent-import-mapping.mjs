const normalize=value=>String(value??'').normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]/g,'').replace(/(?:\(必填\)|[*＊])+$/g,'').toLowerCase();
export const DEMAND_HEADER_ALIASES={
 需求编号:['需求单号','需求单编号','订单编号','订单号','插单编号','需求ID'],
 需求日:['需求日期','需求日序','交付日期','交货日期','交期'],
 客户编号:['客户编码','客户代码','客户ID'],客户名称:['客户名'],
 区域编号:['区域编码','区域代码'],区域名称:['区域'],客户等级:['客户级别'],
 成品编号:['成品编码','成品代码','产品编号','产品编码','产品代码','物料编号','物料编码'],
 成品名称:['产品名称','物料名称'],
 需求箱数:['箱数','订单箱数','需求数量(箱)','数量(箱)','需求箱数(箱)'],
 每箱净重千克:['每箱净重(千克)','每箱净重(kg)','箱重(千克)','箱重(kg)'],
 需求千克:['需求重量(千克)','需求重量(kg)','需求数量(千克)','需求数量(kg)'],
 最早到货日:['最早到货日期'],最晚到货日:['最晚到货日期'],按要求日最晚发运日:['最晚发运日期','按要求日最晚发运日期'],到货剩余保质天数:['剩余保质天数'],范围:['备注','说明']
};

// Opt-in for urgent demand imports. Ordinary business/parameter imports retain
// their existing strict workbook contract. Unknown units are never guessed.
export function resolveDemandMapping(names,getCells,{fields,required,overrides={},date1904=false,releaseCells=()=>{}}){
 const known=new Set(fields),lookup=new Map();for(const field of fields)for(const label of [field,...(DEMAND_HEADER_ALIASES[field]||[])])lookup.set(normalize(label),field);
 const issues=[],warnings=[],add=(code,message,extra={})=>issues.push({code,sheet:extra.sheet||'每日需求',row:extra.row||0,field:extra.field||'',cell:extra.cell||'',message});
 const result={sheet:null,target:'每日需求',headerRow:null,sheets:names,columns:[],fields,requiredFields:required,missingFields:[],date1904,issues,warnings};
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(k=>!['sheetName','headerRow','columns'].includes(k))){add('URGENT_MAPPING','字段映射格式无效');return result;}
 const forced=overrides.headerRow;
 if(forced!==undefined&&(!Number.isSafeInteger(forced)||forced<1||forced>30)){add('URGENT_HEADER_ROW','表头行须为1至30的整数');return result;}
 const scan=sheet=>{const rows=new Map();for(const [address,c]of getCells(sheet)){const match=address.match(/^([A-Z]+)(\d+)$/);if(!match)continue;const row=Number(match[2]);if(row>30||forced!==undefined&&row!==forced||!String(c.value).trim())continue;if(!rows.has(row))rows.set(row,[]);rows.get(row).push({column:match[1],header:String(c.value),field:c.formula===null?lookup.get(normalize(c.value))||'':'',cell:address,formula:c.formula});}
  releaseCells(sheet);return [...rows].map(([row,columns])=>{const matches=new Set(columns.map(c=>c.field).filter(Boolean));return {sheet,row,columns,requiredCount:required.filter(f=>matches.has(f)).length,score:required.filter(f=>matches.has(f)).length*100+matches.size};}).sort((a,b)=>b.score-a.score||a.row-b.row);
 };
 let sheets;
 if(overrides.sheetName!==undefined){if(typeof overrides.sheetName!=='string'||!names.includes(overrides.sheetName)){add('URGENT_MAPPING_SHEET','所选工作表不存在，请重新选择');return result;}sheets=[overrides.sheetName];}
 else {const preferred=names.filter(n=>normalize(n)===normalize('每日需求'));sheets=preferred.length?preferred:names;}
 if(sheets.length>10){add('URGENT_MAPPING_SHEET','工作表较多，请先明确选择要导入的需求工作表');return result;}
 const candidates=sheets.flatMap(scan).sort((a,b)=>b.score-a.score||a.row-b.row),best=candidates[0];
 if(!best||best.score===0&&forced===undefined){add('URGENT_HEADER_NOT_FOUND','未识别到需求表头；请指定工作表和表头行，再按列选择需求字段');result.sheet=sheets.length===1?sheets[0]:null;return result;}
 const ties=candidates.filter(c=>c.score===best.score);
 if(ties.length>1&&forced===undefined||new Set(ties.map(c=>c.sheet)).size>1){add('URGENT_HEADER_AMBIGUOUS','多个工作表或行都匹配需求表头，请明确选择工作表和表头行');result.candidates=ties.map(c=>({sheet:c.sheet,headerRow:c.row}));return result;}
 result.sheet=best.sheet;result.headerRow=best.row;
 const bodyColumns=new Set([...getCells(best.sheet)].filter(([address,c])=>Number(address.match(/\d+$/)?.[0])>best.row&&(String(c.value).trim()||c.formula!==null)).map(([address])=>address.replace(/\d/g,'')));
 for(const column of bodyColumns)if(!best.columns.some(c=>c.column===column))best.columns.push({column,header:'（空表头）',field:'',cell:column+best.row,formula:null});
 const columns=overrides.columns??{};
 if(!columns||typeof columns!=='object'||Array.isArray(columns)||Object.keys(columns).some(col=>!best.columns.some(c=>c.column===col))||Object.values(columns).some(field=>typeof field!=='string'||field!==''&&!known.has(field))){add('URGENT_MAPPING_COLUMNS','映射列须来自当前表头，目标须为已知需求字段或忽略');return result;}
 const seen=new Set();
 for(const c of best.columns){const field=Object.hasOwn(columns,c.column)?columns[c.column]:c.field;result.columns.push({column:c.column,header:c.header,field,automaticField:c.field,required:required.includes(field),ignored:!field});
  if(c.formula!==null){add('URGENT_HEADER_FORMULA','表头须为字段名称，不接受公式',{sheet:best.sheet,row:best.row,cell:c.cell});continue;}
  if(field==='需求箱数'&&/千克|公斤|kg/.test(normalize(c.header)))add('URGENT_MAPPING_UNIT','重量不能直接映射为箱数，请提供需求箱数或先按箱重换算',{sheet:best.sheet,row:best.row,field,cell:c.cell});
  if(field){if(seen.has(field))add('DUPLICATE_HEADER','多列映射到“'+field+'”，请仅保留一列，其余选择忽略',{sheet:best.sheet,row:best.row,field,cell:c.cell});seen.add(field);}
  else warnings.push({code:'URGENT_COLUMN_IGNORED',sheet:best.sheet,row:best.row,cell:c.cell,field:c.header,message:'此列未映射，不参与插单；可在字段映射中调整'});
 }
 result.missingFields=required.filter(f=>!seen.has(f));for(const field of result.missingFields)add('MISSING_FIELD','缺少必填字段“'+field+'”，请在字段映射中选择对应列',{sheet:best.sheet,row:best.row,field});
 return result;
}

export function demandDay(value,date1904=false){
 const text=String(value??'').trim();if(/^\d{1,2}$/.test(text))return text;
 let iso;
 const match=text.match(/^(\d{4})[-/年]([0-9]{1,2})[-/月]([0-9]{1,2})日?$/)||text.match(/^(\d{4})(\d{2})(\d{2})$/);
 if(match){iso=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');const at=Date.parse(iso+'T00:00:00Z');if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==iso)throw Error('需求日期无效');}
 else if(/^\d+$/.test(text)&&Number(text)>=20000&&Number(text)<100000)iso=new Date(Date.parse(date1904?'1904-01-01T00:00:00Z':'1899-12-30T00:00:00Z')+Number(text)*86400000).toISOString().slice(0,10);
 else return text;
 return String((Date.parse(iso+'T00:00:00Z')-Date.parse('2026-10-31T00:00:00Z'))/86400000);
}
