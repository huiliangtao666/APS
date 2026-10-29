import fs from 'node:fs';import {createHash} from 'node:crypto';
const entries={};function walk(p){for(const n of fs.readdirSync(p).sort()){const q=p+'/'+n;if(fs.statSync(q).isDirectory())walk(q);else entries[q]=createHash('sha256').update(fs.readFileSync(q)).digest('hex');}}
walk('src');walk('server');fs.writeFileSync('/evidence/executed-source-sha256.json',JSON.stringify(entries,null,2)+'\n');
