export const origin:number;
export function validMinute(minute:any):boolean;
export function validInterval(start:any,end:any):boolean;
export function timeLabel(minute:number|null):string;
export function projection(task:any,minute:number|null):string;
export function timetable(plan:any):{tasks:any[];facts:any[];reservations:any[];downtime:any[];machines:string[];input?:Record<string,Record<string,string>[]>;extent:number[]};
export function filterTasks(tasks:any[],filters?:any):any[];
export function lanes(items:any[]):{items:any[];count:number};
export function clip(start:number,end:number,from:number,to:number,width:number):{left:number;width:number}|null;

export function axisTicks(start:number,end:number,width:number):number[];
