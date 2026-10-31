export const occupationOrders:string[]; export const occupationScopes:string[]; export const occupationFields:string[];
export function hasOccupation(r:any):boolean; export function occupationErrors(r:any):[string,string][]; export function occupationInterval(r:any,start:number,end:number):{baseStart:number;baseEnd:number;start:number;end:number;configured:boolean};
