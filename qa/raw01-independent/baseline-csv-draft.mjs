// Textareas expose LF-only values. Keep untouched source bytes, including CR/CRLF.
export function editCsvDraft(original,value){
 const normalized=original.replace(/\r\n?/g,'\n');
 let prefix=0;while(prefix<normalized.length&&prefix<value.length&&normalized[prefix]===value[prefix])prefix++;
 if(normalized===value)return original;
 let suffix=0;while(suffix<normalized.length-prefix&&suffix<value.length-prefix&&normalized[normalized.length-1-suffix]===value[value.length-1-suffix])suffix++;
 const offsets=[0];for(let i=0;i<original.length;i++){if(original[i]==='\r'&&original[i+1]==='\n')i++;offsets.push(i+1);}
 const newline=original.match(/\r\n|\r|\n/)?.[0]||'\n';
 const inserted=value.slice(prefix,value.length-suffix).replace(/\n/g,newline);
 return original.slice(0,offsets[prefix])+inserted+original.slice(offsets[normalized.length-suffix]);
}
