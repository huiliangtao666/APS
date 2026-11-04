// One full product invocation per OS process; stdout contains only small receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workbookSource,rawHash} from '../../server/simulator/source.mjs';
import {convertNative} from '../../server/simulator/import.mjs';
import {schema} from './import-fixture.mjs';
const dir=process.env.SIMULATOR_REAL_SOURCE_DIR;
assert.ok(dir,'explicit detached source directory required');
const load=(file,name,hash)=>({name,hash,bytes:fs.readFileSync(path.join(dir,file))});
const businessName='肉食品仿真数据_202611_完整分钟版_V2.0_20261102.xlsx',parameterName='APS配置参数梳理_完整分钟版_V2.0_20261102.xlsx';
const workbooks={business:load(businessName,businessName,'247423ea73d441e8ef6d03f538f393973287e17acb93d81ec1353abc4283d247'),parameters:load(parameterName,parameterName,'f9a4fea37b2c50038cc7c7bd9ad513d2c73b981d8ef0cd1cc2d8f47a775b176e'),identity:{id:'explicit-real-v2-copy',version:1,capturedAt:'2026-11-04T00:00:00+08:00'}};
const hashes=[rawHash(workbooks.business.bytes),rawHash(workbooks.parameters.bytes)];
let receipt;
if(process.argv[2]==='source'){
 const source=workbookSource(workbooks,schema);
 assert.equal(source.input.tables['物料主数据'].length,140);assert.equal(source.input.tables['物料清单'].length,317);assert.equal(source.input.parameterDefinitions.length,181);
 receipt={phase:'source',identity:source.identity,rows:Object.fromEntries(Object.entries(source.input.tables).map(([t,rs])=>[t,rs.length])),definitions:181};
}else{
 assert.equal(process.argv[2],'convert');
 const out=convertNative({kind:'WORKBOOK_BYTES_COPY',workbooks,calendar:{dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00',startDate:'2026-10-31',endDate:'2026-11-02',coverageEnd:'2026-11-15'},opening:{asOf:'2026-10-31T00:00:00+08:00',source:'negative-test-missing-actual-opening',version:'negative-test@1',inventoryBasis:'AFTER_CONSUMPTION'},script:{events:[],rules:{version:'negative-test@1',hash:'b'.repeat(64)}},production:{mode:'NON_PRODUCTION',taskIds:[]}},schema);
 assert.equal(out.spec,null);assert.equal(out.status,'BLOCKED');assert.ok(out.diagnostics.some(i=>i.path.startsWith('opening.materialScales.')));
 assert.equal(out.references.parameters.definitions.length,181);assert.equal(out.references.parameters.layers.length,9292);assert.equal(out.references.bom.length,317);
 for(const [t,n]of [['物料主数据',140],['期初库存',420],['既有采购在途',55],['每日需求',2150],['期初在制',8]])assert.equal(out.references.nativeContext[t].length,n);
 receipt={phase:'convert',identity:out.source,rows:Object.fromEntries(out.references.nativeCoverage.filter(v=>Object.hasOwn(v,'rows')).map(v=>[v.table,v.rows])),definitions:181,status:out.status,spec:null};
}
assert.deepEqual([rawHash(workbooks.business.bytes),rawHash(workbooks.parameters.bytes)],hashes);receipt.bytesUnchanged=true;
console.log(JSON.stringify(receipt));
