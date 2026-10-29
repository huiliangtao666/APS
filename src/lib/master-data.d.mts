type MasterRow = Record<string, string>;
export type MasterDataIssue = { code: string; message: string; table?:string; field?:string; relatedRecords?:import('./problem-records.mjs').RecordRef[] };
export function validateMasterData(input: {
  products?: MasterRow[];
  materials?: MasterRow[];
  orders?: MasterRow[];
  routes?: MasterRow[];
  dependencies?: MasterRow[];
}, original?:Record<string,MasterRow[]>): MasterDataIssue[];
