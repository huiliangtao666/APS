import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workbookSource,rawHash} from '../../server/simulator/source.mjs';
import {convertNative} from '../../server/simulator/import.mjs';
import {schema} from './import-fixture.mjs';

// Supply an explicit detached directory in the approved container window.
// No implicit current-state discovery, source writes or downloaded fixture fallback.
const dir=process.env.SIMULATOR_REAL_SOURCE_DIR;
test('real V2 B/P bytes parse with native 140SKU / 317BOM / 181P definitions; incomplete opening never becomes a runnable scenario',
  {skip:!dir?'NOT_EXECUTED: explicit detached real-source directory not supplied':false},()=>{
  const load=(name,hash)=>({name,hash,bytes:fs.readFileSync(path.join(dir,name))});
  const workbooks={business:load('肉食品仿真数据_202611_完整分钟版_V2.0_20261102.xlsx','247423ea73d441e8ef6d03f538f393973287e17acb93d81ec1353abc4283d247'),
    parameters:load('APS配置参数梳理_完整分钟版_V2.0_20261102.xlsx','f9a4fea37b2c50038cc7c7bd9ad513d2c73b981d8ef0cd1cc2d8f47a775b176e'),
    identity:{id:'explicit-real-v2-copy',version:1,capturedAt:'2026-11-04T00:00:00+08:00'}};
  const hashes=[rawHash(workbooks.business.bytes),rawHash(workbooks.parameters.bytes)];
  const source=workbookSource(workbooks,schema);
  assert.equal(source.input.tables['物料主数据'].length,140);assert.equal(source.input.tables['物料清单'].length,317);
  assert.equal(source.input.parameterDefinitions.length,181);
  const negative={kind:'WORKBOOK_BYTES_COPY',workbooks,calendar:{dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00',
    startDate:'2026-10-31',endDate:'2026-11-02',coverageEnd:'2026-11-15'},
    opening:{asOf:'2026-10-31T00:00:00+08:00',source:'negative-test-missing-actual-opening',version:'negative-test@1',inventoryBasis:'AFTER_CONSUMPTION'},
    script:{events:[],rules:{version:'negative-test@1',hash:'b'.repeat(64)}},production:{mode:'NON_PRODUCTION',taskIds:[]}};
  const out=convertNative(negative,schema);assert.equal(out.spec,null);assert.equal(out.status,'BLOCKED');
  assert.ok(out.diagnostics.some(i=>i.path.startsWith('opening.materialScales.')));
  assert.equal(out.references.parameters.definitions.length,181);
  assert.deepEqual([rawHash(workbooks.business.bytes),rawHash(workbooks.parameters.bytes)],hashes);
});
