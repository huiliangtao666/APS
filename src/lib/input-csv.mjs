/** Strict CSV shape parsing. Business validation stays on the authenticated server. */
export function parseInputCsvRecords(text,{whitespace=false}={}){
 text=text.replace(/^\ufeff/,'');
 const rows=[];let row=[],cell='',quoted=false,closed=false,line=1,rowLine=1;
 const fail=message=>{const e=new Error(`CSV 第${line}行：${message}`);e.line=line;e.rowLine=rowLine;throw e;};
 const endCell=()=>{row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();rows.push({cells:row,line:rowLine});row=[];};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\r'){line++;if(text[i+1]==='\n'){cell+='\n';i++;}}else if(c==='\n')line++;}continue;}
  if(c===','){endCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();line++;rowLine=line;continue;}
  if(closed&&whitespace&&/[ \t]/.test(c))continue;
  if(closed)fail('引号结束后须为分隔符或换行');
  if(c==='"'){if(cell&&(!whitespace||cell.trim()))fail('未转义的引号');cell='';quoted=true;}else cell+=c;
 }
 if(quoted)fail('引号未闭合');
 if(cell||row.length||closed)endRow();
 return rows;
}

export function parseInputCsv(text){return parseInputCsvRecords(text).map(r=>r.cells);}
