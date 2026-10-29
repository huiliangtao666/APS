export function inventoryView(data:Record<string,Record<string,string>[]>,asOf?:string): (Record<string,string|number|null>&{'账面数量':number;'当前可用数量':number})[];
