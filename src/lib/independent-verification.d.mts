export type VerificationStatus = 'pass' | 'problem' | 'not_checked';
export type VerificationCheck = { status: VerificationStatus; details: string[] };
export type VerificationReport = {
  checkedAt: string;
  planId: string;
  inputVersion?: string;
  checks: {
    lineScope: VerificationCheck;
    machineOverlap: VerificationCheck;
    precedence: VerificationCheck;
  };
};
export function independentlyVerifyPlan(
  plan: { id?: string; tasks?: Array<{ id: string; orderId: string; productId: string; operation: string; machine: string; start: number; end: number; predecessor?: string }> },
  orders: Array<Record<string, string>>,
  routes?: Array<Record<string, string>>,
  enabledRules?: string[],
  checkedAt?: string,
): VerificationReport;
