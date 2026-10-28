export type PersonnelGroup = Record<string, string>;
export type PersonnelRequirement = Record<string, string>;
export type PersonnelReservation = { groupId: string; count: number; start: number; end: number };
export function allocatePersonnel(requirements: PersonnelRequirement[], groups: PersonnelGroup[], start: number, end: number, reservations?: PersonnelReservation[]): { ok: boolean; reason?: string; allocations?: PersonnelReservation[] };
