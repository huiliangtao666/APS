type BomRow = Record<string, string>;
export type BomConfigIssue = { code: string; message: string };
export function validateBomConfig(input: {
  products?: BomRow[];
  materials?: BomRow[];
  routes?: BomRow[];
  bom?: BomRow[];
}): BomConfigIssue[];
