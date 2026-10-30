export const configurationContract:string;
export const unsupportedCombinations:{id:string;reason:string}[];
export function configurationPreview(data:Record<string,Record<string,string>[]>,at?:string,mode?:string):{contract:string;at:string;note:string;rules:{id:string;name:string;state:string;active:boolean;scope:string;effectiveFrom:string;issues:any[]}[];rows:{table:string;row:number;scope:string;state:string;notes:string[];issues:any[];fields:{field:string;value:string;source:string;raw:string}[]}[];unsupportedCombinations:{id:string;reason:string}[];issues:any[]};
