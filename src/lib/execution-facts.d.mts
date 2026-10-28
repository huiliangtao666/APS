type Data=Record<string,Record<string,string>[]>;
export const factTables:string[];
export function executionState(data:Data):Data;
export function factFor(data:Data,order:string,operation:string):Record<string,string>|undefined;
export function validateExecution(data:Data):any[];
export function executionTransition(before:Data,after:Data):any[];
export function executionAdmission(data:Data,conditions:any):any[];
export function executionSummary(data:Data,at?:string):any;
export function executionRisks(data:Data,at?:string):any[];
export function executionTrialIssues(current:Data,trial:Data):any[];

export function executionOrderImpact(data:Data):any[];
