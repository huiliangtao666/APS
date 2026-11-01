// Finite executable example, synthetic state removed in finally. No sockets.
import {fixture,importEnvelope,usage} from './exchange-adapter-fixture.mjs';
import {createExchangeAdapter,makeEnvelope} from '../server/exchange-adapters/index.mjs';
import {createMockTransport} from '../server/exchange-adapters/mock-transport.mjs';
const f=fixture();
try {
  const transport=createMockTransport({dispatch:f.dispatch,retry:{maxReadAttempts:1,source:'qa/exchange-adapter-example.mjs explicit mock policy'}});
  const adapter=createExchangeAdapter({transport,scope:'synthetic:mock#planner'});
  const request=await importEnvelope(f,{idempotencyKey:'example-import-1',correlationId:'example-correlation-1'});
  const imported=await adapter.execute(request);
  const repeated=await adapter.execute({...request,correlationId:'example-repeat'});
  const outgoing=makeEnvelope({source:'explicit-local-fixture',sourceVersion:'mock-fixture-v1',idempotencyKey:'example-export-1',correlationId:'example-export-correlation',direction:'export',payload:{table:'orders',reason:'Explicit offline #44 mock export'}});
  const exported=await adapter.execute(outgoing);
  if(imported.status!=='COMMITTED'||!repeated.duplicate||exported.status!=='ACKNOWLEDGED')throw Error('example failed');
  console.log(JSON.stringify({mode:'MOCK',request,imported,repeated,exportRequest:outgoing,exported,calls:transport.calls,
    realConnection:adapter.realConnection,usage:usage(),temporaryStateRemovedOnExit:true},null,2));
} finally {f.close();}
