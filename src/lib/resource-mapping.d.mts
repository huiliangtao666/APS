export const resourceMappingDef:{key:string;label:string;file:string;fields:string[]};
export const mappingOptions:Record<string,string[]>;
export function validateResourceMappings(data:any,options?:{forRun?:boolean}):any[];
export function mappingFingerprintInput(data:any):any;
export function sameRecord(a:any,b:any):boolean;
export function resourceMappingTransition(before:any,after:any,records?:any[]):any[];
