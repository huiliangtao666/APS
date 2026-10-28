type MasterRow = Record<string, string>;
export type MasterDataIssue = { code: string; message: string };
export function validateMasterData(input: {
  products?: MasterRow[];
  materials?: MasterRow[];
  orders?: MasterRow[];
  routes?: MasterRow[];
  dependencies?: MasterRow[];
}): MasterDataIssue[];
