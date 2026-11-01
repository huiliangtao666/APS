import {inflateRawSync} from 'node:zlib';
import {quantityMath as Q} from '../src/lib/material-allocation.mjs';
// OOXML values are data. No eval, shell, macro, external connection or general formula VM.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buf){let crc=0xffffffff;for(const b of buf)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function unzip(buf){if(buf.length>12*1024*1024)throw Error('工作簿超过12MB');let end=-1;for(let p=buf.length-22;p>=Math.max(0,buf.length-65557);p--)if(buf.readUInt32LE(p)===0x06054b50){end=p;break;}if(end<0)throw Error('不是有效xlsx压缩包');
 const count=buf.readUInt16LE(end+10),offset=buf.readUInt32LE(end+16);if(count>1500||buf.readUInt16LE(end+4)||buf.readUInt16LE(end+6))throw Error('不支持多卷或过大工作簿');let at=offset,total=0;const files=new Map();
 for(let i=0;i<count;i++){if(at+46>buf.length||buf.readUInt32LE(at)!==0x02014b50)throw Error('ZIP目录损坏');const flag=buf.readUInt16LE(at+8),method=buf.readUInt16LE(at+10),crc=buf.readUInt32LE(at+16),size=buf.readUInt32LE(at+20),expanded=buf.readUInt32LE(at+24),n=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),local=buf.readUInt32LE(at+42),name=buf.subarray(at+46,at+46+n).toString('utf8');at+=46+n+extra+comment;total+=expanded;
  if(flag&1||!name||name.includes('..')||files.has(name)||total>100*1024*1024||![0,8].includes(method)||local+30>buf.length||buf.readUInt32LE(local)!==0x04034b50)throw Error('不支持加密/重复/非法ZIP条目');
  const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);if(start+size>buf.length)throw Error('ZIP条目越界');const source=buf.subarray(start,start+size);files.set(name,{source,method,expanded,crc});
 }return files;
}
const unescape=s=>String(s??'').replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,(_,t)=>t[0]==='#'?String.fromCodePoint(t[1]==='x'?parseInt(t.slice(2),16):Number(t.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[t]));
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1],unescape(m[2]??m[3])]));
const text=s=>[...s.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>unescape(m[1])).join('');
const exactText=q=>{let n=q.n,d=q.d,sign=n<0n?'-':'';if(n<0n)n=-n;let out=String(n/d),r=n%d,places=0;if(r)out+='.';while(r&&places++<18){r*=10n;out+=String(r/d);r%=d;}return sign+out;};
const asQ=v=>typeof v==='object'?v:/^\d+(?:\.\d+)?$/.test(v||'')?Q.q(v):v;
export function parseWorkbook(buffer,schema){
 const zip=unzip(buffer);const xml=name=>{const entry=zip.get(name);if(!entry)throw Error('缺少OOXML条目 '+name);const raw=entry.method===8?inflateRawSync(entry.source,{maxOutputLength:Math.max(1,entry.expanded)}):entry.source;if(raw.length!==entry.expanded||crc32(raw)!==entry.crc)throw Error('ZIP条目校验失败');const s=raw.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('不支持XML实体');return s.replace(/(<\/?)[A-Za-z_][\w.-]*:/g,'$1');};
 const strings=zip.has('xl/sharedStrings.xml')?[...xml('xl/sharedStrings.xml').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>text(m[1])):[];
 const rels=new Map([...xml('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map(m=>attrs(m[1])).filter(a=>a.TargetMode!=='External').map(a=>[a.Id,a.Target]));
 const cells=new Map(),names=[],paths=new Map();for(const m of xml('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?\s*>/g)){const a=attrs(m[1]),target=rels.get(a['r:id']||Object.entries(a).find(([key])=>key.endsWith(':id'))?.[1]);if(!target)throw Error('缺少工作表关系');const file=target.startsWith('/')?target.slice(1):'xl/'+target;if(!/^xl\/worksheets\/[\w.-]+\.xml$/.test(file))throw Error('非法工作表路径');paths.set(a.name,file);names.push(a.name);}
 function getCells(name){if(cells.has(name))return cells.get(name);if(!paths.has(name))throw Error('公式引用未知工作表');const map=new Map();let count=0;
  for(const c of xml(paths.get(name)).matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)){if(++count>800000)throw Error('单表单元格超限');const ca=attrs(c[1]),body=c[2]||'',v=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]||'',f=body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];if(ca.t==='s'&&!strings[Number(v)]&&strings[Number(v)]!=='')throw Error('共享字符串索引无效');map.set(ca.r,{value:ca.t==='s'?strings[Number(v)]:ca.t==='inlineStr'?text(body):unescape(v),formula:f===undefined?null:unescape(f)});}
  cells.set(name,map);return map;
 }
 const cache=new Map(),visiting=new Set();function value(sheet,address){address=address.replaceAll('$','');const key=sheet+'!'+address;if(cache.has(key))return cache.get(key);if(visiting.has(key))throw Error('公式引用循环');visiting.add(key);const c=getCells(sheet).get(address)||{value:''};let v=c.value;if(c.formula)v=formula(c.formula,sheet);visiting.delete(key);cache.set(key,v);return v;}
 function formula(f,sheet){const tokens=f.match(/'(?:[^']|'')+'!\$?[A-Z]+\$?\d+|\$?[A-Z]+\$?\d+|\d+(?:\.\d+)?|"[^"]*"|[A-Z]+|[()+*/=,:-]/g)||[];if(tokens.join('')!==f.replace(/\s+/g,''))throw Error('未知公式或外部引用');let i=0;
  function expr(){let a=term();while(['+','-'].includes(tokens[i])){const op=tokens[i++],b=term();a=op==='+'?Q.add(a,b):Q.sub(a,b);}if(tokens[i]==='='){i++;const b=term();return typeof a==='string'?a===b:typeof b!=='string'&&Q.cmp(a,b)===0n;}return a;}
  function term(){let a=atom();while(['*','/'].includes(tokens[i])){const op=tokens[i++],b=atom();a=op==='*'?Q.mul(a,b):Q.div(a,b);}return a;}
  function atom(){const t=tokens[i++];if(!t)throw Error('不完整公式');if(/^\d/.test(t))return Q.q(t);if(t.startsWith('"'))return t.slice(1,-1);
   if(/^(?:'.+'!)?\$?[A-Z]+\$?\d+$/.test(t)){let sn=sheet,ad=t;if(t.includes('!')){const at=t.lastIndexOf('!');sn=t.slice(1,at-1).replaceAll("''", "'");ad=t.slice(at+1);}if(tokens[i]===':'){i++;const end=tokens[i++],start=Number(ad.match(/\d+/)[0]),stop=Number(end.match(/\d+/)[0]),c=ad.replace(/[\d$]/g,''),ec=end.replace(/[\d$]/g,'');if(start!==stop||c.length!==1||ec.length!==1)throw Error('只支持本版同行求和区间');return Array.from({length:ec.charCodeAt(0)-c.charCodeAt(0)+1},(_,j)=>asQ(value(sn,String.fromCharCode(c.charCodeAt(0)+j)+start)));}return asQ(value(sn,ad));}
   if(t==='-')return Q.sub(Q.zero,atom());if(t==='('){const a=expr();if(tokens[i++]!==')')throw Error('括号错误');return a;}
   if(!['SUM','MAX','IF','ROUND','ROUNDUP'].includes(t)||tokens[i++]!=='(')throw Error('不在白名单的公式函数');const args=[];do{args.push(expr());if(tokens[i]!==','&&tokens[i]!==')')throw Error('公式参数无效');}while(tokens[i++ ]!==')');
   if(t==='IF')return args[0]?args[1]:args[2];const flat=args.flat();if(t==='SUM')return flat.reduce(Q.add,Q.zero);if(t==='MAX')return flat.reduce((a,b)=>Q.cmp(a,b)>0n?a:b,Q.zero);
   const places=Number(exactText(args[1]));if(!Number.isInteger(places)||places<0||places>12)throw Error('取整位数超限');const scale=Q.q(String(10**places)),v=Q.mul(args[0],scale);const rounded=t==='ROUNDUP'?Q.ceil(v):{n:(v.n*2n+v.d)/(v.d*2n),d:1n};return Q.div(rounded,scale);
  }const v=expr();if(i!==tokens.length)throw Error('未解释的公式尾部');return typeof v==='object'?exactText(v):String(v);
 }
 const tables={},classification=[],bindings=[],issues=[],warnings=[];const issue=(sheet,row,field,cell,message,code='WORKBOOK_INPUT')=>issues.push({severity:'error',code,sheet,row,field,cell,message,remedy:'更正该记录后重新预览'});
 for(const name of names){const spec=schema.tables[name],sc=getCells(name);if(!spec){if([...sc.values()].some(c=>c.value||c.formula))issue(name,0,'','','未知非空工作表，须明确忽略或补映射','UNKNOWN_SHEET');classification.push({sheet:name,kind:'未知',rows:0});continue;}
  if(!['输入','参考结果'].includes(spec.kind)){classification.push({sheet:name,kind:spec.kind,rows:0});continue;}const headers=new Map(),known=new Set(spec.fields.map(f=>f.name));
  for(const [a,c]of sc)if(a.match(/\d+$/)?.[0]==='2'&&c.value){if([...headers.values()].includes(c.value))issue(name,2,c.value,a,'重复中文表头','DUPLICATE_HEADER');headers.set(a.replace(/\d/g,''),c.value);if(!known.has(c.value))issue(name,2,c.value,a,'未知非空业务列，须明确忽略或补映射','UNKNOWN_FIELD');}
  for(const field of known)if(![...headers.values()].includes(field))issue(name,2,field,'','缺少字段','MISSING_FIELD');const rs=new Map();
  for(const [a,c]of sc){const m=a.match(/^([A-Z]+)(\d+)$/);if(!m||Number(m[2])<3||(!c.value&&!c.formula))continue;const row=Number(m[2]),field=headers.get(m[1]);if(!field){issue(name,row,'',a,'无表头非空业务列','UNKNOWN_FIELD');continue;}if(!rs.has(row))rs.set(row,{_row:row,_cells:{},_formulas:{}});const r=rs.get(row);r._cells[field]=a;
   try{let v=c.value;if(c.formula){r._formulas[field]=c.formula;if(name==='配置参数'&&field==='参数值')throw Error('参数值必须为字面值，不接受公式');v=value(name,a);if(Number.isFinite(Number(v))&&Number(v)!==Number(c.value)||!Number.isFinite(Number(v))&&v!==c.value)warnings.push({code:'STALE_CACHE',sheet:name,row,field,cell:a,message:'缓存差异，采用权威参数重算值',cached:c.value,value:v});const f=c.formula.match(/^'配置参数'!\$?([A-Z]+)\$?(\d+)$/);if(f)bindings.push({sheet:name,row,field,parameterId:getCells('配置参数').get('A'+f[2])?.value});}r[field]=v;}catch(e){issue(name,row,field,a,e.message,'INVALID_FORMULA');r[field]=c.value;}
  }tables[name]=[...rs.values()];for(const b of bindings.filter(b=>b.sheet===name)){const r=rs.get(b.row);b.recordKey=name==='单位换算'?[r['物料编号'],r['换算前单位'],r['换算后单位']].join('|'):r[spec.key];}classification.push({sheet:name,kind:spec.kind,rows:rs.size});if(!['配置参数','物料主数据','供应商与供货条件'].includes(name))cells.delete(name);
 }
 for(const [name,spec]of Object.entries(schema.tables))if(spec.kind==='输入'&&!names.includes(name))issue(name,0,'','','缺少本版必填输入表','MISSING_SHEET');
 return {tables,bindings,classification,issues,warnings,schemaVersion:schema.version};
}
