import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const expected=JSON.parse(fs.readFileSync('docs/n06-readiness/product-source-sha256.json'));
const actual={};
function walk(p){for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=p+'/'+d.name;if(d.isDirectory())walk(f);else actual[f]=createHash('sha256').update(fs.readFileSync(f)).digest('hex');}}
walk('src');walk('server');assert.deepEqual(actual,expected);
fs.writeFileSync('/evidence/executed-product-source-sha256.json',JSON.stringify(actual,null,2));
