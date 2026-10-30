export const originalResourceDefs:{key:string;label:string;file:string;fields:string[]}[];
export const originalResourceKeys:string[];
export const originalResourceNote:string;
export function validateOriginalResources(data:Record<string,Record<string,string>[]>):{table:string;file:string;row:number;field:string;message:string}[];
