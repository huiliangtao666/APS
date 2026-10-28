export type ProcessConfigRow = Record<string, string>;
export type ProcessConfigIssue = { code: string; message: string };
export function validateProcessConfig(input: {
  products?: ProcessConfigRow[];
  orders?: ProcessConfigRow[];
  routes?: ProcessConfigRow[];
  times?: ProcessConfigRow[];
  dependencies?: ProcessConfigRow[];
  machines?: ProcessConfigRow[];
  materials?: ProcessConfigRow[];
  personnelGroups?: ProcessConfigRow[];
}): ProcessConfigIssue[];
