import {createHash} from 'node:crypto';
import {permit,fail,digest,canonical,LIMITS} from './context.mjs';
import {prepareReport,reportInfo} from './query.mjs';

/** Existing authenticated route checks export permission, then streams chunks
 * directly with backpressure. Never collect this generator into one HTTP JSON. */
export function openReportExport(snapshot,query,{scope='ALL_MATCHED',selectedIds,format='ndjson'}={},access){
  permit(access,'export');const p=prepareReport(snapshot,query,access);
  if(!query.fingerprint)fail('QUERY_FINGERPRINT_REQUIRED');
  if(!['ALL_MATCHED','SELECTED'].includes(scope)||!['ndjson','csv'].includes(format))fail('INVALID_EXPORT');
  let rows=p.rows;
  if(scope==='SELECTED'){
    if(!Array.isArray(selectedIds)||selectedIds.length>LIMITS.records||new Set(selectedIds).size!==selectedIds.length)fail('INVALID_EXPORT_SELECTION');
    const ids=new Set(selectedIds);if(selectedIds.some(id=>!p.rows.some(r=>r.id===id)))fail('EXPORT_SELECTION_OUTSIDE_QUERY',409);rows=p.rows.filter(r=>ids.has(r.id));
  }else if(selectedIds!==undefined)fail('INVALID_EXPORT_SELECTION');
  const manifest={kind:'manifest',schema:'query-reports:1',identity:snapshot.identity,snapshotFingerprint:snapshot.fingerprint,fingerprint:p.queryFingerprint,
    view:p.n.view,scope,format,total:rows.length,matchedTotal:p.rows.length,columns:p.displayColumns,stableSort:p.stableSort,
    summaryByMaterialUnit:reportInfo({...p,rows}).summaryByMaterialUnit,valueEncoding:format==='ndjson'?'typed-json-with-presence':'UTF-8 CSV; formula-like strings prefixed with apostrophe',
    sources:'Records retain source references; complete original source details are a separate read under the same identity',complete:false};
  function* lines(){
    const sha=createHash('sha256');let bytes=0,count=0;
    const certify=line=>{sha.update(line);bytes+=Buffer.byteLength(line);return line;};
    const csv=v=>{let text=v===undefined||v===null?'':typeof v==='object'?canonical(v):String(v);
      if(typeof v!=='number'&&/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    if(format==='ndjson')yield certify(JSON.stringify(manifest)+'\n');
    else yield certify('\ufeff'+p.displayColumns.map(csv).join(',')+'\r\n');
    for(const r of rows){
      const values=Object.fromEntries(p.displayColumns.filter(k=>k!=='id').map(k=>[k,{present:Object.hasOwn(r.values,k),value:r.values[k]}]));
      const line=format==='ndjson'?JSON.stringify({kind:'record',id:r.id,values,sourceRefs:r.refs,runRefs:r.runRefs||[],mappingRefs:r.mappingRefs||[],notProvided:r.notProvided||[]})+'\n':p.displayColumns.map(k=>csv(k==='id'?r.id:r.values[k])).join(',')+'\r\n';
      // Chunk very long records without losing content or creating giant HTTP
      // writes. Chunk length is UTF-16 code units, matching the value endpoint.
      for(let at=0;at<line.length;){let end=Math.min(line.length,at+LIMITS.valueChunk);
        if(end<line.length&&/[\uD800-\uDBFF]/.test(line[end-1]))end--;
        yield certify(line.slice(at,end));at=end;}count++;
    }
    const completion={kind:'completion',complete:true,total:count,contentBytes:bytes,contentSha256:sha.digest('hex'),recordIdentityDigest:digest(rows.map(r=>r.id))};
    if(format==='ndjson')yield JSON.stringify(completion)+'\n';
    else Object.assign(manifest,{completion});
  }
  return {manifest,chunks:lines()};
}
