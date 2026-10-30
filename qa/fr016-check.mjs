// Offline integrity check; no browser/server/dependencies or business writes.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='docs/fr016-acceptance',manifest=JSON.parse(fs.readFileSync(root+'/evidence/product-preservation.json'));
for(const [file,expected]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file);
const report=JSON.parse(fs.readFileSync(root+'/evidence/fr016-report.json'));
assert.equal(report.productSHA,manifest.productBaseSHA);assert.equal(report.complete,true);assert.deepEqual(report.errors,[]);
assert.equal(report.matrix.length,21);assert.equal(report.matrix.filter(r=>r.supported).length,13);assert.equal(report.navigation.length,15);assert.equal(report.navigation.filter(r=>r.problemActivated).length,5);assert.equal(report.inputConditions.length,9);assert.equal(report.proofs.length,88);
console.log('FR016_INTEGRITY_PASS '+Object.keys(manifest.files).length+' preserved non-QA/docs files; finite report counts verified');
