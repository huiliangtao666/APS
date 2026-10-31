type Row=Record<string,string>;
export const personnelProfileFields:string[];
export function personnelProfileDraft(data:Record<string,Row[]>,indices:number[],profile:Row):{dependencies:Row[]};
export function personnelMappingDraft(data:Record<string,Row[]>,saved:Record<string,Row[]>,options:{simulation?:boolean;groupIds:string[]}):{tables:Record<string,Row[]>;changed:number};
