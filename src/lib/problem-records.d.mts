export type Source={domain:string;inputVersionId:string;revision:number;checkedAt:string;scope?:unknown;executionVersionId?:string};
export type Occurrence={index:number;logicalRow:number;keyCount:number};
export type RecordRef={csv?:{file:string;physicalRow:number;field:string;sourceField:string;occurrence:number;sha256:string};associationGap?:string;table:string;field?:string;row:Record<string,string>;occurrence?:Occurrence;versionSide?:'before'|'after';sourceContext?:'executionContext';origin?:Source & {occurrence:Occurrence}};
export type IdentityContext={inputVersionId?:string;operations?:any[]};
export function recordRefs(table:string,rows:Record<string,string>[]):RecordRef[];
export function sourceRefs(table:string,rows:Record<string,string>[],original?:Record<string,string>[]):RecordRef[];
export function bindProblemSource<T>(finding:T,source:Source,original?:Record<string,Record<string,string>[]>,sourceMap?:Record<string,number[]>,csvSources?:any):T;
export function attachProblemRecords<T>(finding:T,data:Record<string,Record<string,string>[]>):T;
export function currentRecord(ref:RecordRef,data:Record<string,Record<string,string>[]>,context?:IdentityContext):{row:Record<string,string>;index:number}|null;

export type CsvProblem={code?:string;message?:string;taskIds?:string[];relatedRecords?:RecordRef[];associationGap?:string;file:string;row:number;field:string;reason?:string;index?:number;table?:string;inBatch?:boolean};
export type CheckedCsvInput=Source & {data:Record<string,Record<string,string>[]>};
export type OpenCsvProblem=(issue:CsvProblem,input?:CheckedCsvInput)=>void;
