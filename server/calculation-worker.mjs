import {calculateWorkbook} from './workbook-plan.mjs';
import { parentPort, workerData } from 'node:worker_threads';
import { calculate } from './planner.ts';
try {
  const { executionData, revision, calculatedAt, conditions }=workerData;
  parentPort.postMessage({kind:'progress',phase:'计算中'});
  const plan=workerData.workbookData?calculateWorkbook(workerData.workbookData,workerData.selection):calculate(executionData,revision,calculatedAt,conditions);
  parentPort.postMessage({kind:'result',plan});
} catch {
  // Never put raw stack/data or deployment credentials into persisted failures.
  parentPort.postMessage({kind:'failure',code:'calculation_error',message:'计算发生内部错误，未保存结果；请核对输入或联系维护人员。'});
}
