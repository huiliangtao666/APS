export const jointParameters:Record<string,string>;
export function jointFlags(data:any,at?:string):Record<string,boolean>;
export function validateJointResources(data:any,at?:string):any[];
export function claimsFor(data:any,members:any[],operation:string,flags:Record<string,boolean>):any[];
export function previewResources(claims:any[],start:number,end:number,reservations?:any[]):{ok:boolean;reason?:string;nextStart?:number;allocations?:any[]};
