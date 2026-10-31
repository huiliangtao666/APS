// Standalone selftest harness. Does NOT use or modify the application Worker.
import {parentPort, workerData} from 'node:worker_threads';
import {checkChangeovers} from '../src/lib/b12-changeover.mjs';
parentPort.postMessage(checkChangeovers(workerData));
