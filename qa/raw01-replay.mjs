// Keep APS-Test originals immutable. Change only their outcome assertions and
// output paths for the fix replay; the original keyboard workflow is identical.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const run=file=>execFileSync(process.execPath,['--experimental-strip-types',file],{stdio:'inherit'});
const source=fs.readFileSync('qa/raw01-independent/raw01-repro.mjs','utf8');
// Original probes read focus/selection immediately after a mount, before the
// product's requestAnimationFrame necessarily runs. Wait for readiness only;
// keep the full expected physical selection and all original assertions.
const ready=text=>text.replaceAll('await editor.waitFor();',"await editor.waitFor();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='批量 CSV 修正原文');");
fs.mkdirSync('/evidence/runner-scripts',{recursive:true});
const write=(file,text)=>{fs.writeFileSync('qa/.'+file,text);fs.writeFileSync('/evidence/runner-scripts/'+file,text);return 'qa/.'+file;};
// Only the disposable container copy is swapped, never the read-only checkout.
assert.equal(process.env.RAW01_DISPOSABLE_VALIDATION,'1');
const product='src/lib/csv-draft.mjs',repaired=fs.readFileSync(product);
try{
 fs.copyFileSync('qa/raw01-independent/baseline-csv-draft.mjs',product);
 run(write('raw01-baseline.mjs',ready(source.replace("'/evidence/raw01-repro'","'/evidence/raw01-baseline'"))));
 assert.equal(JSON.parse(fs.readFileSync('/evidence/raw01-baseline/report.json')).reproduced,true);
}finally{fs.writeFileSync(product,repaired);}
let fixed=source.replace('repairRounds:0','repairRounds:1,origin:"APS-Dev replay of unchanged APS-Test keyboard scenario; outcome assertions updated"')
 .replace('assert.notEqual(report.actual,desired)','assert.equal(report.actual,desired)')
 .replace("assert.equal(report.saved,'CHANGED\\r\\nKEEP_CR\\r\\nKEEP_LF\\r\\nKEEP_CRLF')","assert.equal(report.saved,'CHANGED\\rKEEP_CR\\nKEEP_LF\\r\\nKEEP_CRLF')")
 .replace('report.reproduced=true','report.fixed=true')
 .replace('accepted-corrupted-preview.png','exact-preview.png')
 .replace('RAW01_REPRODUCED keyboard select-all + insertText -> accepted changed untouched newlines -> persisted revision1','RAW01_FIXED keyboard select-all + insertText -> exact raw bytes -> exact persisted revision1');
assert.notEqual(fixed,source);assert.ok(!fixed.includes('assert.notEqual(report.actual,desired)'));assert.ok(fixed.includes("assert.equal(report.saved,'CHANGED\\rKEEP_CR\\nKEEP_LF\\r\\nKEEP_CRLF')"));
run(write('raw01-fixed.mjs',ready(fixed)));
for(const name of ['independent','guards'])run(write('raw01-'+name+'.mjs',ready(fs.readFileSync('qa/raw01-independent/'+name+'.mjs','utf8'))));
const result=JSON.parse(fs.readFileSync('/evidence/independent/report.json'));assert.deepEqual(result.failures,[]);assert.deepEqual(result.errors,[]);assert.equal(result.complete,true);
console.log('RAW01_TEST_AUTHORED_POSITIVES_PASS '+result.checks.length+' groups');
