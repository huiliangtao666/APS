export type Source={domain:string;inputVersionId:string;revision:number;checkedAt:string;scope?:unknown;executionVersionId?:string};
export type Occurrence={index:number;logicalRow:number;keyCount:number};
export type RecordRef={table:string;row:Record<string,string>;occurrence?:Occurrence;versionSide?:'before'|'after';sourceContext?:'executionContext';origin?:Source & {occurrence:Occurrence}};
export type IdentityContext={inputVersionId?:string;operations?:any[]};
export function recordRefs(table:string,rows:Record<string,string>[]):RecordRef[];
export function sourceRefs(table:string,rows:Record<string,string>[],original?:Record<string,string>[]):RecordRef[];
export function bindProblemSource<T>(finding:T,source:Source,original?:Record<string,Record<string,string>[]>,sourceMap?:Record<string,number[]>):T;
export function attachProblemRecords<T>(finding:T,data:Record<string,Record<string,string>[]>):T;
export function currentRecord(ref:RecordRef,data:Record<string,Record<string,string>[]>,context?:IdentityContext):{row:Record<string,string>;index:number}|null;
