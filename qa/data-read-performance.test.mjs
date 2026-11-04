import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createWorkbookSnapshotReader} from '../server/workbook-snapshot-reader.mjs';
import {sourceHash,sourceJsonBytes,copyReportSource} from '../server/query-reports/source-copy.mjs';

test('bounded JSON streaming is byte-identical across chunks, Unicode and provenance',()=>{
  const row=JSON.parse('{"__proto__":{"来源":"保留"},"2":2,"1":1}');
  const value={tables:{rows:Array.from({length:1200},(_,i)=>({...row,id:i,text:'来源😀\ud800\n"\\'.repeat(30),nested:[undefined,null,-0,NaN,Infinity]}))},sparse:new Array(700)};
  const text=JSON.stringify(value);
  assert.equal(sourceHash(value),createHash('sha256').update(text).digest('hex'));
  assert.equal(sourceJsonBytes(value),Buffer.byteLength(text));
  const copied=copyReportSource(value);assert.deepEqual(copied,value);
  assert.equal(Object.getPrototypeOf(copied.tables.rows[0]),Object.prototype);
  copied.tables.rows[0].__proto__.来源='changed';assert.equal(row.__proto__.来源,'保留');
});

test('snapshot reads isolate mutable callers, plans, P revisions and old frozen runs',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps147-cache-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const put=(ref,v)=>fs.writeFileSync(path.join(dir,ref),gzipSync(JSON.stringify(v)));
  const read=createWorkbookSnapshotReader(dir),old={id:'plan-A',version:1,tables:{配置参数:[{value:'P1',source:'P'}]},mapping:{id:'mapping-A'}};
  put('frozen.gz',old);put('current.gz',old);put('other.gz',{...old,id:'plan-B'});
  assert.deepEqual(read('current.gz'),old);
  const dirty=read('current.gz');dirty.tables.配置参数[0].value='EDIT';dirty.mapping.id='other';
  assert.deepEqual(read('current.gz'),old);
  assert.equal(read('other.gz').id,'plan-B');
  // Same ref and byte length, replaced inode: metadata identity must invalidate.
  put('next.gz',{...old,tables:{配置参数:[{value:'P2',source:'P'}]}});
  fs.renameSync(path.join(dir,'next.gz'),path.join(dir,'current.gz'));
  assert.equal(read('current.gz').tables.配置参数[0].value,'P2');
  assert.deepEqual(read('frozen.gz'),old);
  put('version2.gz',{...old,version:2});assert.equal(read('version2.gz').version,2);
  fs.unlinkSync(path.join(dir,'current.gz'));assert.throws(()=>read('current.gz'),{code:'ENOENT'});
  fs.writeFileSync(path.join(dir,'current.gz'),'corrupt');assert.throws(()=>read('current.gz'));
  put('current.gz',old);assert.deepEqual(read('current.gz'),old);
  read.clear();assert.equal(read.stats().entries,0);assert.equal(read.stats().bytes,0);
});

test('snapshot cache is bounded under sustained reads and skips oversized sources',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps147-bound-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const read=createWorkbookSnapshotReader(dir,{maxBytes:1024,maxEntries:2});
  for(let i=0;i<30;i++){
    const value={id:i,text:'x'.repeat(300)};fs.writeFileSync(path.join(dir,i+'.gz'),gzipSync(JSON.stringify(value)));
    assert.deepEqual(read(i+'.gz'),value);assert.deepEqual(read(i+'.gz'),value);
    assert.ok(read.stats().entries<=2);assert.ok(read.stats().bytes<=1024);
  }
  const big={id:'oversized',text:'x'.repeat(2000)};fs.writeFileSync(path.join(dir,'big.gz'),gzipSync(JSON.stringify(big)));
  const before=read.stats();assert.deepEqual(read('big.gz'),big);assert.equal(read.stats().entries,before.entries);assert.equal(read.stats().bytes,before.bytes);
});

test('atomic state saves, reopen and external writes invalidate plain JSON cache',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps147-state-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json'),read=createWorkbookSnapshotReader(dir,{compressed:false,maxEntries:1});
  assert.throws(()=>read('state.json'),{code:'ENOENT'});
  fs.writeFileSync(file,JSON.stringify({datasets:[{id:'A',version:1,ref:'P1'}],runs:[{id:'old',inputRef:'frozen'}]}));
  const next=read('state.json');next.datasets[0].ref='P2';next.datasets[0].version=2;
  assert.equal(read('state.json').datasets[0].version,1);
  fs.writeFileSync(file+'.tmp',JSON.stringify(next));fs.renameSync(file+'.tmp',file);
  assert.equal(read('state.json').datasets[0].ref,'P2');
  const reopened=createWorkbookSnapshotReader(dir,{compressed:false,maxEntries:1});
  assert.deepEqual(reopened('state.json'),next);assert.equal(read('state.json').runs[0].inputRef,'frozen');
  fs.writeFileSync(file,'{bad');assert.throws(()=>read('state.json'),SyntaxError);
});
