export type PersonnelGroup = Record<string, string>;
export type PersonnelRequirement = Record<string, string>;
export type PersonnelReservation = { groupId: string; count: number; start: number; end: number; roleSource?:string;requiredSkill?:string;providedSkill?:string;relationId?:string;reason?:string };
export function allocatePersonnel(requirements: PersonnelRequirement[], groups: PersonnelGroup[], start: number, end: number, reservations?: PersonnelReservation[], substitutions?:Record<string,string>[]): { ok: boolean; reason?: string; allocations?: PersonnelReservation[] };
