import {parentPort,workerData} from 'node:worker_threads';
import {allocateSharingMaterials,checkSharingPlan} from '../src/lib/b16-sharing.mjs';
const allocation=allocateSharingMaterials(workerData);
parentPort.postMessage({allocation,check:checkSharingPlan({...workerData,plan:allocation.plan})});
