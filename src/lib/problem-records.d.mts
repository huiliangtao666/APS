export type RecordRef={table:string;row:Record<string,string>};
export function recordRefs(table:string,rows:Record<string,string>[]):RecordRef[];
export function attachProblemRecords<T>(finding:T,data:Record<string,Record<string,string>[]>):T;
export function currentRecord(ref:RecordRef,data:Record<string,Record<string,string>[]>):{row:Record<string,string>;index:number}|null;
