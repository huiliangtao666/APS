export const urgentImportFields:string[];
export function adoptedUrgentBatchIds(plan:any,headResult?:any):Set<string>;
export type UrgentImportChange={id:string;action:string;batchId:string|null;before:Record<string,any>|null;after:Record<string,any>;changedFields:string[];reason:string};
export type UrgentImportChanges={added:number;updated:number;unchanged:number;blocked:number;records:UrgentImportChange[]};
export function reviewUrgentImport(plan:any,demands:any[],options?:{originalDemandIds?:string[];headResult?:any;effectiveDay?:number;effectiveMinute?:number}):UrgentImportChanges;
