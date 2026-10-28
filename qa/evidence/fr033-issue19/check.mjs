import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=x=>createHash('sha256').update(x).digest('hex');
const files=JSON.parse(readFileSync('SHA256-MANIFEST.json'));
for(const [path,hash] of Object.entries(files))assert.equal(sha(readFileSync(path)),hash,path);
for(const m of JSON.parse(readFileSync('provenance/source-mappings.json')))assert.equal(sha(readFileSync(m.file)),m.sha256,m.file);
const before=JSON.parse(readFileSync('dev-captures/before-measurements.json'));
const after=JSON.parse(readFileSync('dev-captures/after-measurements.json'));
assert.equal(before.length,8);assert.equal(after.length,24);
assert(before.some(r=>r.minimumGap<0&&r.axisOverflow));
for(const r of after){
 assert.equal(r.immutable,true);assert.deepEqual(r.errors,[]);
 assert.equal(r.dateLabels.axisOverflow,false);assert.equal(r.dateLabels.inkOverflow,false);
 assert(r.dateLabels.minimumGap===null||r.dateLabels.minimumGap>=0);
}
console.log(`PASS: ${Object.keys(files).length} file hashes, source mappings, 8 before / 24 after Dev records. This does not execute a browser or grant acceptance.`);
