import type {RecordRef} from './problem-records.mjs';
type BomRow = Record<string, string>;
export type BomConfigIssue = { code: string; message: string;table:string;row:number;field:string;relatedRecords:RecordRef[];missingTarget?:{table:string;key?:string} };
export function validateBomConfig(input: {
  products?: BomRow[];
  materials?: BomRow[];
  routes?: BomRow[];
  bom?: BomRow[];
}): BomConfigIssue[];
