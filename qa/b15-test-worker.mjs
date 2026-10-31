import {parentPort,workerData} from 'node:worker_threads';
import {comparePlans} from '../src/lib/plan-comparison.mjs';
import {checkProtectedTasks,freezeTrialSnapshot,resolveTrialCandidate} from '../src/lib/b15-protection.mjs';
const {a,b}=workerData,original=freezeTrialSnapshot(a.plan,a.data),candidate=freezeTrialSnapshot(b.plan,b.data);
parentPort.postMessage({comparison:comparePlans(a.plan,a.data,b.plan,b.data),protection:checkProtectedTasks(a.plan,a.plan,a.data),kept:resolveTrialCandidate(original,candidate,'keep')});
