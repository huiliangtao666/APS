export type PersonnelGroup = Record<string, string>;
export type PersonnelRequirement = Record<string, string>;
export type PersonnelReservation = { poolId?: string; groupId: string; count: number; start: number; end: number; demandKey?:string;roleSource?:string;requiredSkill?:string;providedSkill?:string;relationId?:string;reason?:string };
export function allocatePersonnel(requirements: PersonnelRequirement[], groups: PersonnelGroup[], start: number, end: number, reservations?: PersonnelReservation[], substitutions?:Record<string,string>[], pools?:Record<string,string>[],windowContext?:{data:any;calendarId:string}): { ok: boolean; nextStart?:number; reason?: string; searchStatus?:string; searchSteps?:number; allocations?: PersonnelReservation[] };

export function effectivePersonnelRequirements(requirements:PersonnelRequirement[],groups:PersonnelGroup[],pools:Record<string,string>[]):PersonnelRequirement[];
