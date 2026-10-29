import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
for(const name of ['source','preserved']){
 const manifest=JSON.parse(fs.readFileSync('qa/raw01-'+name+'-sha256.json'));
 for(const [file,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file);
 console.log('RAW01_'+name.toUpperCase()+'_PASS '+Object.keys(manifest.files).length);
}
const provenance=JSON.parse(fs.readFileSync('qa/raw01-independent/provenance.json'));
for(const [file,hash] of Object.entries(provenance.sha256))assert.equal(createHash('sha256').update(fs.readFileSync('qa/raw01-independent/'+file)).digest('hex'),hash,file);
console.log('RAW01_TEST_ORIGINALS_PASS '+Object.keys(provenance.sha256).length);
