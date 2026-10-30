export const batchParameters:Record<string,string>;
export function activeBatchRule(data:Record<string,Record<string,string>[]>,at:string):boolean;
export function prepareProductionBatches(source:any,orders:any[],minute:number,at?:string):any;
export function batchSummary(context:any,tasks:any[]):any;
