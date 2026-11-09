import type {UrgentFactDraft} from './urgent-facts.mjs';
export function initialUrgentFacts(run:any,plan?:any):Required<UrgentFactDraft>;
export function selectUrgentPlan(plans:any[],run:any):any;
export function initialUrgentStrategy(plan:any):any;
export function urgentQueue(result:any,plan:any,draft:Required<UrgentFactDraft>):any[];
export function scheduleUrgentFlow(api:(p:string,b?:object)=>Promise<any>,plan:any,workspace:any,solver?:object):Promise<{plan:any;run:any}>;
