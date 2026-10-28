/** Strict CSV shape parsing. Business validation stays on the authenticated server. */
export function parseInputCsv(text){
 text=text.replace(/^\ufeff/,'');
 const rows=[];let row=[],cell='',quoted=false,closed=false,line=1;
 const fail=message=>{throw new Error(`CSV 第${line}行：${message}`);};
 const endCell=()=>{row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();rows.push(row);row=[];};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
  if(c===','){endCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();line++;continue;}
  if(closed)fail('引号结束后须为分隔符或换行');
  if(c==='"'){if(cell)fail('未转义的引号');quoted=true;}else cell+=c;
 }
 if(quoted)fail('引号未闭合');
 if(cell||row.length||closed)endRow();
 return rows;
}
