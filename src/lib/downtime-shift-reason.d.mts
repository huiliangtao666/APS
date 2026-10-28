export type DowntimeRow = Record<string, string>;
export type DowntimeShiftReason = { start: number; end: number; reason: string } | null;
export function findDowntimeShiftReason(downtime: DowntimeRow[], machineId: string, earliest: number, duration: number, scheduledStart: number): DowntimeShiftReason;
