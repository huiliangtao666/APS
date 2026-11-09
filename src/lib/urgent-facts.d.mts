export const URGENT_FACT_STATUSES: string[];
export const URGENT_FACT_CONFIRM_LABEL: string;
export type UrgentFactDraft={statuses:Record<string,string>;footprints?:Record<string,any>;completed:Record<string,string>;allocations:Record<number,any>};
export type UrgentFactReview={pendingTasks:any[];pendingProgress:any[];pendingCompleted:any[];pendingAllocations:any[];totalTasks:number;confirmedTasks:number;blocked:boolean;message:string};
export function taskDispositionIssue(tasks:any[],submitted:any[]):null|{code:string;message:string;count:number;taskIds:string[]};
export function reviewUrgentFactDraft(result:any,draft:UrgentFactDraft):UrgentFactReview;
export function confirmUnfilledUrgentFacts(result:any,draft:UrgentFactDraft):UrgentFactDraft;
