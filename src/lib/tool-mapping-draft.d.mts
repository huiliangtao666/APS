type Row=Record<string,string>;
export function toolMappingDraft(data:Record<string,Row[]>,saved:Record<string,Row[]>,options?:{simulation?:boolean}):{tables:Record<string,Row[]>;changed:number};
