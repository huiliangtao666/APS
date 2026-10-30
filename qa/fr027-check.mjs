// Offline, read-only source provenance gate; no installs or service writes.
import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('qa/fr027-source-sha256.json'));
for(const [file,expected] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file);
const preserved=JSON.parse(fs.readFileSync('qa/fr027-preserved-sha256.json'));
for(const [file,expected] of Object.entries(preserved.files))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file+' changed from FR036 base');
console.log('FR027_SOURCE_PASS '+Object.keys(manifest.files).length+' current / '+Object.keys(preserved.files).length+' preserved');
