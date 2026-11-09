export function defaultCompletionPercent(status:string):number;
export function completionPercent(task:any,status:string,footprint?:any):number|string;
export function editTaskCompletion(task:any,status:string,footprint:any,percent:number|string):any;
export function progressProjection(run:any,draft:any,context:any,observationDay:number):{allocations:Record<number,any>;consumed:any[];completed:any[];tasks:any[]};
