export function validateInventoryBatches(batches?: Record<string, string>[], materials?: Record<string, string>[]): { code: string; message: string }[];
export function getUsableQualityStatuses(rules?: Record<string, string>[], materialId?: string, at?: string): string[];
export function queryInventoryAvailability(batches?: Record<string, string>[], options?: { materialId?: string; asOf?: string; rules?: Record<string, string>[] }): (Record<string, string | number> & { '当前可用数量': number; '账面数量': number; '已占用数量': number })[];
