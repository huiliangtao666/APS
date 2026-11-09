import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {copyReportSource} from './query-reports/source-copy.mjs';

/** Per-router cache of decoded JSON, never a mutable dataset authority.
 * Every caller receives detached nodes. State/meta is still read on each request
 * and selects the actual version/P workspace/inputRef. File replacement, even at
 * the same ref/size, invalidates on inode/ctime/mtime. No result/query cache.
 * Bounds count uncompressed UTF-8 source bytes, not compressed archive bytes.
 */
export function createWorkbookSnapshotReader(dir,{maxBytes=32*1024*1024,maxEntries=8,compressed=true,project}={}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||!Number.isSafeInteger(maxEntries)||maxEntries<0)throw Error('Invalid snapshot cache limits');
  if(project!==undefined&&typeof project!=='function')throw Error('Invalid snapshot projection');
  const cache=new Map();let bytes=0,hits=0,misses=0;
  const remove=ref=>{const old=cache.get(ref);if(old){bytes-=old.bytes;cache.delete(ref);}};
  const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
  const read=ref=>{
    const file=path.join(dir,ref);let identity;
    try{identity=stamp(fs.statSync(file,{bigint:true}));}catch(e){remove(ref);throw e;}
    const old=cache.get(ref);
    if(old?.identity===identity){hits++;cache.delete(ref);cache.set(ref,old);return copyReportSource(old.value);}
    misses++;remove(ref);
    const fileBytes=fs.readFileSync(file),raw=compressed?gunzipSync(fileBytes):fileBytes,decoded=JSON.parse(raw.toString('utf8')),value=project?project(decoded):decoded;
    // A metadata projection retains only its selected tree, never the full
    // parsed state. Bound that smaller tree independently of historical results.
    const retainedBytes=project?Buffer.byteLength(JSON.stringify(value)):raw.length;
    if(stamp(fs.statSync(file,{bigint:true}))!==identity)throw Error('Snapshot changed during read');
    if(maxEntries&&retainedBytes<=maxBytes){
      while(cache.size&&(cache.size>=maxEntries||bytes+retainedBytes>maxBytes))remove(cache.keys().next().value);
      cache.set(ref,{identity,bytes:retainedBytes,value});bytes+=retainedBytes;
      return copyReportSource(value);
    }
    return value;
  };
  read.clear=()=>{cache.clear();bytes=0;};
  read.stats=()=>({entries:cache.size,bytes,hits,misses,maxEntries,maxBytes});
  return read;
}
