import {contentHash} from './index.mjs';
// No URL, credentials, fetch, sockets or timers. The injected dispatcher calls
// the existing authenticated CSV API locally. Faults are explicit fixture data.
export function createMockTransport({dispatch,faults=[],retry,destination=new Map()}={}) {
  if(typeof dispatch!=='function' || !retry || typeof retry.source!=='string' || !retry.source.trim() ||
     !Number.isInteger(retry.maxReadAttempts) || retry.maxReadAttempts<1 || retry.maxReadAttempts>3 || !(destination instanceof Map)) throw new Error('explicit_mock_retry_source_required');
  const pending=structuredClone(faults),calls=[];
  function fault(step,phase) {
    const i=pending.findIndex(f=>f.step===step&&f.phase===phase);
    if(i<0)return;
    const f=pending.splice(i,1)[0];
    if(!['disconnect','timeout'].includes(f.code))throw Error('unknown_mock_fault');
    const e=new Error('mock_'+f.code);e.code='mock_'+f.code;e.mockFault={step,phase,source:retry.source};throw e;
  }
  return Object.freeze({kind:'explicit-local-mock',retry:Object.freeze({...retry}),calls,destination,
    async request(method,path,body) {
      if(![['GET','/session'],['POST','/imports/preview'],['POST','/imports/commit'],['POST','/export']].some(([m,p])=>method===m&&path===p))throw Error('unsupported_mock_operation');
      const limit=method==='GET'?retry.maxReadAttempts:1;
      for(let attempt=1;attempt<=limit;attempt++) {
        calls.push({method,path,attempt,retrySource:retry.source});
        try {
          fault(path,'before');
          const r=await dispatch(method,path,structuredClone(body));
          fault(path,'after');return r;
        } catch(error) { if(attempt===limit || !['mock_disconnect','mock_timeout'].includes(error.code))throw error; }
      }
    },
    async deliver({deliveryKey,contentHash:hash,csv,correlationId}) {
      calls.push({method:'MOCK',path:'mock-target',attempt:1,retrySource:retry.source});
      fault('mock-target','before');
      if(contentHash(csv)!==hash)throw Error('mock_target_hash_mismatch');
      const old=destination.get(deliveryKey);
      if(old&&old.contentHash!==hash)throw Error('mock_target_conflict');
      const receipt=old||{status:'ACKNOWLEDGED',target:'explicit-local-mock',receiptId:contentHash(deliveryKey),contentHash:hash,bytes:Buffer.byteLength(csv),correlationId};
      if(!old)destination.set(deliveryKey,receipt);
      fault('mock-target','after');return structuredClone(receipt);
    }
  });
}
