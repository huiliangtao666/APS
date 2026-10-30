export type ProcessConfigRow = Record<string, string>;
import type {RecordRef} from './problem-records.mjs';
export type ProcessConfigIssue = { code: string; message: string; table?:string; row?:number; field?:string; relatedRecords?:RecordRef[]; missingTarget?:{table:string;key:string} };
export function validateProcessConfig(input: {
  products?: ProcessConfigRow[];
  orders?: ProcessConfigRow[];
  routes?: ProcessConfigRow[];
  times?: ProcessConfigRow[];
  dependencies?: ProcessConfigRow[];
  machines?: ProcessConfigRow[];
  materials?: ProcessConfigRow[];
  tools?: ProcessConfigRow[];
  personnelGroups?: ProcessConfigRow[];
}): ProcessConfigIssue[];
