import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const dir=process.env.SIMULATOR_REAL_SOURCE_DIR;
test('real V2 B/P: isolated single source and single conversion preserve all rows/P/bytes; missing opening is blocked',
 {skip:!dir?'NOT_EXECUTED: explicit detached real-source directory not supplied':false},()=>{
  const run=phase=>{
   const child=spawnSync(process.execPath,['--max-old-space-size=192','--experimental-strip-types',fileURLToPath(new URL('./real-import-child.mjs',import.meta.url)),phase],{env:process.env,encoding:'utf8',timeout:65000,maxBuffer:128*1024});
   assert.ifError(child.error);assert.equal(child.signal,null,child.stderr);assert.equal(child.status,0,child.stderr);
   return JSON.parse(child.stdout.trim());
  };
  const parsed=run('source'),converted=run('convert');
  assert.deepEqual(converted.identity,parsed.identity);assert.deepEqual(converted.rows,parsed.rows);
  assert.equal(converted.definitions,parsed.definitions);assert.equal(converted.status,'BLOCKED');assert.equal(converted.spec,null);
  assert.equal(parsed.bytesUnchanged,true);assert.equal(converted.bytesUnchanged,true);
 });
