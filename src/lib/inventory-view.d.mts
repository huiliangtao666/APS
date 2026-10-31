export function inventoryView(data:Record<string,Record<string,string>[]>,asOf?:string): (Record<string,string|number|null>&{'账面数量':number;'当前可用数量':number})[];
export function materialTaskSources(view:any,taskIds:string[]):{table:string;index:number;row:Record<string,string>;canonicalRow:number;physicalRow:number|null;file:string|null;sourceSha256:string|null;inputVersionId:string}[];
