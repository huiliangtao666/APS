import {parentPort,workerData} from 'node:worker_threads';
import {scheduleProcessRoute} from '../src/lib/process-route-planner.mjs';
import {verifyProcessRoute} from '../src/lib/verify-process-route.mjs';
const {data,conditions,at}=workerData,plan={...scheduleProcessRoute(data,data.orders,at,conditions),rules:conditions.enabledRuleIds,jointConditionsContract:conditions.jointConditionsContract,workingWindowsContract:conditions.workingWindowsContract};
parentPort.postMessage({plan,verdict:verifyProcessRoute(plan,data,conditions)});
