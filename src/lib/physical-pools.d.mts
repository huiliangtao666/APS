export type Row=Record<string,string>;
export type PoolIssue={code:string;table:string;file:string;row:number;field:string;message:string};
export const poolStrategyOptions:Record<string,string[]>;
export function hasPhysicalPools(data:Record<string,Row[]>):boolean;
export function validatePhysicalPools(data:Record<string,Row[]>,options?:{at?:string;forRun?:boolean;allowLegacy?:boolean}):PoolIssue[];
export function poolCapacityAt(pool:Row,minute:number):number;
export function poolPolicyPoints(pool:Row):number[];
