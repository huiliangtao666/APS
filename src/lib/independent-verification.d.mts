export type VerificationStatus = 'pass' | 'problem' | 'not_checked';
export type VerificationFinding = {code:string;message:string;taskIds:string[];relatedRecords?:import('./problem-records.mjs').RecordRef[];associationGap?:string;interval?:Record<string,any>;evidence?:Record<string,any>};
export type VerificationCheck = { status: VerificationStatus; details: string[];findings?:VerificationFinding[];diagnostics?:VerificationFinding[] };
export type VerificationReport = {
  ruleStatuses?: Array<{id:string;enabled:boolean;supported:boolean;adopted:boolean;status:VerificationStatus;reason:string}>;
  findings?: VerificationFinding[];
  scopeNote?:string;
  checkedAt: string;
  planId: string;
  inputVersion?: string;
  checks: {
    lineScope: VerificationCheck;
    machineOverlap: VerificationCheck;
    precedence: VerificationCheck;
    calendar?: VerificationCheck;
    resourcePolicies?: VerificationCheck;
    batchAndWait?: VerificationCheck;
  };
};
export function independentlyVerifyPlan(
  plan: { id?: string; tasks?: Array<{ id: string; orderId: string; productId: string; operation: string; machine: string; start: number; end: number; predecessor?: string }> },
  orders: Array<Record<string, string>>,
  routes?: Array<Record<string, string>>,
  enabledRules?: string[],
  checkedAt?: string,
  frozenData?: any,
  frozenConditions?: any,
): VerificationReport;
