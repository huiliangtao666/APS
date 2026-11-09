import {workbookDate} from './lib/workbook-dates';

const dateFields=new Set(['需求日','最早到货日','最晚到货日','按要求日最晚发运日']);
const fieldNames:Record<string,string>={'按要求日最晚发运日':'要求发运日','每箱净重千克':'每箱净重（千克）','需求千克':'需求量（千克）'};
const fieldLabel=(field:string)=>fieldNames[field]||field;
const has=(value:any,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
function displayValue(field:string,value:unknown,raw=false){
 if(value===undefined||value===null||value==='')return '—';
 return !raw&&dateFields.has(field)?workbookDate(value)||String(value):String(value);
}
function noteReason(note:any){
 if(note.code==='URGENT_COLUMN_IGNORED')return '此列未纳入插单。需要使用时，可展开字段映射后调整并重新校验。';
 if(note.code==='URGENT_DATE_NORMALIZED')return '已将文件中的日期转换为当前排程日历的对应日期。';
 if(has(note,'cached')&&has(note,'value'))return '采用当前数据版本的物料资料、客户交付规则及有效参数重新计算；文件原值仅供对照。';
 return note.message||'请核对文件中的对应信息。';
}

export function UrgentImportNotes({preview}:{preview:any}){
 const notes:any[]=preview.warnings||[],differences=notes.filter(n=>!n.code&&has(n,'cached')).length,ignored=notes.filter(n=>n.code==='URGENT_COLUMN_IGNORED').length,dates=notes.filter(n=>n.code==='URGENT_DATE_NORMALIZED').length,other=notes.length-differences-ignored-dates;
 return <details className="urgent-import-notes"><summary>导入说明与参考差异（{notes.length}）</summary>
  <p>{notes.length?`本次有 ${differences} 项参考值差异、${dates} 项日期格式转换、${ignored} 个忽略列${other?`、${other} 项其他提醒`:''}；请在确认生效前核对以下明细。`:'本次没有参考值差异或忽略列。'}</p>
  {differences>0&&<p>文件参考值与当前资料或规则不一致时，排程使用下表的“本次采用值”；这些差异本身不阻止导入。</p>}
  {notes.length>0&&<div className="urgent-scroll"><table><thead><tr><th>需求 / 文件位置</th><th>信息项</th><th>文件原值</th><th>本次采用值</th><th>处理说明</th></tr></thead><tbody>{notes.map((note,index)=>{const sourceSheet=note.sheet==='每日需求'?preview.importMapping?.sheet||note.sheet:note.sheet,demand=preview.demands.find((r:any)=>r._row===note.row&&(r._sheet||'每日需求')===sourceSheet),ignored=note.code==='URGENT_COLUMN_IGNORED';return <tr key={index}><td>{demand?.['需求编号']&&<>{demand['需求编号']}<br/></>}{sourceSheet||'需求工作表'}{note.row?` · 第 ${note.row} 行`:''}{note.cell?` · ${note.cell}`:''}</td><td>{fieldLabel(note.field)||'文件列'}</td><td>{ignored?'—':displayValue(note.field,note.cached,note.code==='URGENT_DATE_NORMALIZED')}</td><td>{ignored?'不参与插单':displayValue(note.field,note.value)}</td><td>{noteReason(note)}</td></tr>;})}</tbody></table></div>}
  <p>来源文件：{preview.fileName}。{preview.importMapping?.sheet&&`需求工作表：${preview.importMapping.sheet}。`}确认导入后按需求编号新增或更新尚未采用的插单，之后须重新执行插单排程更新结果和影响。</p>
 </details>;
}

export function UrgentImportDemand({record,onClose}:{record:any;onClose:()=>void}){
 const fields=['需求编号','需求日','客户编号','客户名称','成品编号','成品名称','需求箱数','每箱净重千克','需求千克','最早到货日','最晚到货日','按要求日最晚发运日'];
 return <aside className="qr-drawer urgent-import-demand" role="dialog" aria-label="插单需求明细" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}><header><h3>需求 {record['需求编号']}</h3><button autoFocus onClick={onClose}>关闭明细</button></header>
  <p>客户 {record['客户编号']} 需要产品 {record['成品编号']}，共 {record['需求箱数']} 箱、{record['需求千克']} 千克，需求日期为 {displayValue('需求日',record['需求日'])}；{record._batchId?(record._adopted?'已随排程结果采用生效。':'已保存到插单清单，可修改 Excel 后重新导入更新；须重新排程后采用。'):'本笔仍为导入预览，尚未生效。'}</p>
  <dl>{fields.map(field=><div key={field}><dt>{fieldLabel(field)}</dt><dd>{displayValue(field,record[field])}</dd></div>)}</dl>
  <p>来源：{record._source?.fileName||'本次需求文件'} · {record._sheet||record._source?.sheet||'需求工作表'} · 第 {record._row} 行。箱重与交付日期采用当前版本的物料资料、客户规则和有效参数。</p>
 </aside>;
}
