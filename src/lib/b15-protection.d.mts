type Data=Record<string,Record<string,string>[]>;
type Position={start:number;end:number;machine:string};
type Plan={tasks?:any[];[key:string]:any};
type Snapshot={contract:'B15-protection-v1';plan:Plan;data:Data};
export function freezeTrialSnapshot(plan:Plan,data:Data):Snapshot;
export function resolveTrialCandidate<T>(original:T,candidate:T,decision:'keep'|'discard'):{decision:'keep'|'discard';original:T;retained:T};
export function trialInputIssues(current:Data,proposed:Data):any[];
export function checkProtectedTasks(before:Plan,candidate:Plan,data:Data,options?:{locks?:Record<string,Position>;protectionUntil?:number}):{contract:'B15-protection-v1';valid:boolean;issues:any[];handlingRequired:any[];locks:Record<string,Position>;requiresResourceVerification:true};
