export type UrgentTaskDateResult={statuses:Record<string,string>;throughStatus:'started'|'locked';cutoffDate:string;cutoffDay:number;throughIds:string[];afterIds:string[];changedSavedIds:string[]};
export function urgentTaskDateRule(result:any,statuses:Record<string,string>,cutoffDate:string,savedTasks?:any[],throughStatus?:'started'|'locked'):UrgentTaskDateResult;
