export const CHANGEOVER_CONTRACT: 'BR13-directed-occupations-v1';
export interface ChangeoverSource {id: string; version: string; [extra: string]: unknown}
export interface ChangeoverWindow {start: number; end: number}
export interface ChangeoverRegistry {
  id: string;
  capacity: number;
  capacityScope: 'independent';
  windows: ChangeoverWindow[];
  unavailable: ChangeoverWindow[];
  source: ChangeoverSource;
}
export interface ChangeoverPersonnel extends ChangeoverRegistry {skills: string[]}
export interface ChangeoverResourceDemand {id: string; quantity: number}
export interface ChangeoverPersonnelDemand extends ChangeoverResourceDemand {skill: string}
export interface ChangeoverPolicy {
  id: string;
  from: string;
  to: string;
  resourceIds: string[];
  prohibited: boolean;
  durationMinutes: number;
  resources: ChangeoverResourceDemand[];
  personnel: ChangeoverPersonnelDemand[];
  validation: {
    clock: 'elapsed-minutes';
    waitMinutes: number;
    resources: ChangeoverResourceDemand[];
    personnel: ChangeoverPersonnelDemand[];
  };
  source: ChangeoverSource;
}
export interface ChangeoverTransition {
  id: string;
  from: string;
  to: string;
  fromTaskId: string;
  toTaskId: string;
  resourceId: string;
  predecessorEnd: number;
  start: number;
  successorStart: number;
  source: ChangeoverSource;
}
export interface ChangeoverExistingOccupation extends ChangeoverWindow {
  id: string;
  kind: 'resource' | 'personnel';
  resourceId: string;
  quantity: number;
  source: ChangeoverSource;
}
export interface ChangeoverInput {
  config: {
    contract: typeof CHANGEOVER_CONTRACT;
    source: ChangeoverSource;
    timebase: {unit: 'minute'; origin: string};
    products: string[];
    resources: ChangeoverRegistry[];
    personnel: ChangeoverPersonnel[];
    policies: ChangeoverPolicy[];
  };
  transitions: ChangeoverTransition[];
  existingOccupations: ChangeoverExistingOccupation[];
  horizon: ChangeoverWindow;
  source: ChangeoverSource;
}
export interface ChangeoverOccupation extends ChangeoverWindow {
  transitionId: string;
  taskIds: string[];
  policyId: string;
  direction: string[];
  kind: 'resource' | 'personnel';
  resourceId: string;
  quantity: number;
  skill?: string;
  phase: 'changeover' | 'validation';
  policySource: ChangeoverSource;
  sequenceSource: ChangeoverSource;
  registrySource: ChangeoverSource;
}
export interface ChangeoverResult {
  contract: typeof CHANGEOVER_CONTRACT;
  domainValid: boolean;
  status: 'checked' | 'rejected';
  overallSchedulable: null;
  requiredOccupations: ChangeoverOccupation[];
  acceptedOccupations: ChangeoverOccupation[];
  findings: {code: string; path: string; message: string; [evidence: string]: unknown}[];
  inspections: Record<string, unknown>[];
  notChecked: string[];
  /** Raw frozen JSON input (possibly invalid); call checker before consuming it. */
  snapshot: unknown;
}
/** Pure, atomic candidate check; does not allocate or mutate application state. */
export function checkChangeovers(input: unknown): ChangeoverResult;
