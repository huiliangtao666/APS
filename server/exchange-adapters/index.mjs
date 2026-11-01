// #44 technical boundary only. Existing CSV API owns schemas, authorization,
// validation, atomic business writes, revisions and immutable history.
import {createHash} from 'node:crypto';

export const exchangeContract = 'aps-existing-csv-api@1';
export const realConnection = Object.freeze({status:'NOT_CONFIGURED', enabled:false, productionWrites:false});
const clone = value => structuredClone(value);
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  }
  throw new Error('envelope_requires_plain_JSON');
}
export const contentHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
function checked(e) {
  const keys=['contract','source','sourceVersion','idempotencyKey','correlationId','direction','payload','contentHash'];
  if (!e || Object.keys(e).sort().join() !== keys.sort().join() || e.contract !== exchangeContract ||
      !['import','export'].includes(e.direction) || !['source','sourceVersion','idempotencyKey','correlationId'].every(k=>text(e[k])) ||
      !e.payload || Object.getPrototypeOf(e.payload)!==Object.prototype ||
      typeof e.payload.reason!=='string' || !e.payload.reason.trim() || e.payload.reason.length>1000) throw new Error('invalid_envelope');
  const body={contract:e.contract,source:e.source,sourceVersion:e.sourceVersion,direction:e.direction,payload:e.payload};
  const serialized=canonical(body);
  if (Buffer.byteLength(serialized)>4*1024*1024) throw new Error('envelope_too_large');
  if (e.contentHash!==contentHash(body)) throw new Error('content_hash_mismatch');
  if (e.direction==='import') {
    const allowed=['files','revision','table','repairs','r21ConfigRevision','inputStage','resourceRuleBinding','reason'];
    if (Object.keys(e.payload).some(k=>!allowed.includes(k)) || !Number.isSafeInteger(e.payload.revision) || e.payload.revision<0 ||
        !Array.isArray(e.payload.files) || !e.payload.files.length || e.payload.files.some(f=>!f||Object.keys(f).sort().join()!=='name,text'||typeof f.name!=='string'||typeof f.text!=='string')) throw new Error('invalid_import_payload');
  }
  if (e.direction==='export') {
    const allowed=['table','planId','query','reason','report','reportSnapshot','viewId','resourceLoad','runId','ruleSettings'];
    if (Object.keys(e.payload).some(k=>!allowed.includes(k))) throw new Error('invalid_export_payload');
  }
  return clone(e);
}
export function makeEnvelope({source,sourceVersion,idempotencyKey,correlationId,direction,payload}) {
  const e={contract:exchangeContract,source,sourceVersion,idempotencyKey,correlationId,direction,payload:clone(payload)};
  e.contentHash=contentHash({contract:e.contract,source,sourceVersion,direction,payload:e.payload});
  return checked(e);
}

// Explicit MOCK delivery journal, not an import ledger. Contains technical
// receipts/promises only; business data is stored exclusively by the CSV API.
// Pass the same Map across adapter recreation in one mock session. No durable
// or multi-process exactly-once guarantee is claimed.
export function createExchangeAdapter({transport,scope,journal=new Map()}={}) {
  if (!transport || transport.kind!=='explicit-local-mock' || !text(scope) || !(journal instanceof Map)) throw new Error('explicit_mock_and_trusted_session_scope_required');
  const call=async(method,path,body,trace)=>{
    const r=await transport.request(method,path,clone(body??{}));
    trace.push({step:path,status:r.status});
    if (!Number.isInteger(r.status) || r.status<200 || r.status>=300) {
      const error=new Error(r.body?.error||'csv_api_rejected'); error.status=r.status; error.details=clone(r.body); throw error;
    }
    return r.body;
  };
  async function execute(raw) {
    let e;
    try { e=checked(raw); } catch(error) { return {status:'REJECTED',code:error.message,mode:'MOCK',businessWrite:false}; }
    const trace=[];
    const base={mode:'MOCK',direction:e.direction,source:e.source,sourceVersion:e.sourceVersion,idempotencyKey:e.idempotencyKey,correlationId:e.correlationId,contentHash:e.contentHash};
    // Recheck current session permissions BEFORE returning a cached receipt.
    // Trusted dispatcher must bind scope to this exact session; never accept a
    // caller-supplied actor/role/scope or bypass existing router middleware.
    try {
      const session=await call('GET','/session',{},trace);
      if (!(e.direction==='import'?session.canWrite:session.canExport)) return {...base,status:'REJECTED',code:'forbidden',httpStatus:403,trace};
    } catch(error) { return {...base,status:'REJECTED',code:error.message,httpStatus:error.status,trace}; }
    const key=canonical([scope,e.source,e.direction,e.idempotencyKey]);
    const previous=journal.get(key);
    if (previous) {
      if(previous.hash!==e.contentHash) return {...base,status:'CONFLICT',code:'idempotency_content_conflict',httpStatus:409,businessWrite:false,trace};
      const result=await previous.result;
      return {...clone(result),correlationId:e.correlationId,originalCorrelationId:result.correlationId,duplicate:true};
    }
    let resolve;
    const result=new Promise(r=>{resolve=r;});
    journal.set(key,{hash:e.contentHash,result}); // reserve before any write or asynchronous preview
    let mutatingStep=null;
    try {
      let receipt;
      if(e.direction==='import') {
        const preview=await call('POST','/imports/preview',e.payload,trace);
        if(preview.valid!==true || !text(preview.id)) {
          receipt={...base,status:'REJECTED',code:'preview_invalid',issues:clone(preview.issues||[]),businessWrite:false,trace};
        } else {
          mutatingStep='/imports/commit';
          const commit=await call('POST',mutatingStep,{previewId:preview.id,reason:e.payload.reason},trace);
          receipt={...base,status:'COMMITTED',previewId:preview.id,revision:commit.revision,inputVersionId:commit.inputVersionId??null,unchanged:commit.unchanged===true,trace};
        }
      } else {
        // The existing export route may write an audit record; never retry it.
        mutatingStep='/export';
        const csv=await call('POST','/export',e.payload,trace);
        if(typeof csv!=='string') throw new Error('csv_export_expected');
        mutatingStep='mock-target';
        const target=await transport.deliver({deliveryKey:key,contentHash:contentHash(csv),csv,correlationId:e.correlationId});
        if(target.status!=='ACKNOWLEDGED' || target.contentHash!==contentHash(csv)) throw new Error('invalid_mock_receipt');
        receipt={...base,status:'ACKNOWLEDGED',target,trace};
      }
      resolve(clone(receipt)); return receipt;
    } catch(error) {
      // A transport failure after dispatch may have committed. Retain UNKNOWN,
      // including on explicit repeat; never transparently replay a write.
      const uncertain=!!mutatingStep&&(!error.status||error.status>=500);
      const receipt={...base,status:uncertain?'UNKNOWN':'REJECTED',code:error.code||error.message,
        httpStatus:error.status??null,details:error.details??null,step:mutatingStep||'preview',automaticWriteRetries:0,
        requiresReconciliation:uncertain,
        transportFailure:error.mockFault??null,trace};
      resolve(clone(receipt)); return receipt;
    }
  }
  return Object.freeze({execute,realConnection,mode:'MOCK'});
}
