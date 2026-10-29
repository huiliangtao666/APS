import fs from 'node:fs';import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync('/evidence/'+p));
const summary=read('fr014015-validation-summary.json');
const fixed=read('raw01-repro/report.json'),baseline=read('raw01-baseline/report.json'),controls=read('raw01-controls/report.json'),positives=read('independent/report.json'),guards=read('guards/report.json');
assert.equal(fixed.fixed,true);assert.equal(baseline.reproduced,true);assert.equal(controls.complete,true);assert.equal(controls.repeatNoOp,true);assert.deepEqual(controls.errors,[]);assert.deepEqual(positives.failures,[]);
assert.equal(fixed.actual,fixed.expected);assert.equal(fixed.saved,'CHANGED\rKEEP_CR\nKEEP_LF\r\nKEEP_CRLF');
assert.deepEqual(fixed.afterPreview,fixed.before);assert.equal(fixed.afterCommit.plans,fixed.before.plans);assert.equal(fixed.afterCommit.facts,fixed.before.facts);
Object.assign(summary,{base:'f00e705572c6f034f3982ca236060fae2750b801',sourceManifest:'qa/raw01-source-sha256.json',repairRound:1,raw01:{baselineReproduced:baseline.reproduced,fixed:fixed.fixed,exactRaw:true,exactPersistedName:true,positiveGroups:positives.checks.length,guardGroups:guards.checks.length,keyboardControlGroups:controls.checks.length,origin:'APS-Dev replay; APS-Test independent acceptance still required'}});
fs.writeFileSync('/evidence/raw01-validation-summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
