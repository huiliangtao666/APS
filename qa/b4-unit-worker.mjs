import {parentPort,workerData} from 'node:worker_threads';
import {proposeProcessCooling} from '../src/lib/process-cooling-adapter.mjs';
parentPort.postMessage(proposeProcessCooling(workerData));
