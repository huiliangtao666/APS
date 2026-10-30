type Row=Record<string,string>;
export type MaterialAllocation={lotId:string;supplyId:string;quantity:number;exactQuantity:{numerator:string;denominator:string};conditional:boolean;expiry:string;quality:string;readyAt:string;remaining:number;source:string};
export type MaterialDemandRow={orderId:string;productId:string;operation:string;taskId:string;materialId:string;unit:string;version:string;effective:string;feedMinute:number;feedAt:string;remainingKg:number;quantity:number;exactQuantity:{numerator:string;denominator:string};formula:string;allocations:MaterialAllocation[];shortage:number;exactShortage:{numerator:string;denominator:string};committed:boolean;suggestion:string;blockedReason?:string};
export function feedTime(minute:number):string;
export function materialPolicy(data:Record<string,Row[]>,at:string):Record<string,any>|null;
export function calculateMaterialDemand(data:Record<string,Row[]>,order:Row,operation:string,minute:number,remainingKg?:{numerator:string;denominator:string},trace?:(table:string,rows:Row[])=>void):Omit<MaterialDemandRow,'allocations'|'shortage'|'exactShortage'|'committed'|'suggestion'>[];
export function createMaterialAllocator(data:Record<string,Row[]>,policy:Record<string,any>):{futureMinutes:number[];preview(demands:ReturnType<typeof calculateMaterialDemand>,minute:number,trace?:(table:string,rows:Row[])=>void):{ok:boolean;rows:MaterialDemandRow[];commit():void}};

export function orderHasRemaining(order:Row):boolean;

export const quantityMath:any;

export function executionInventory(data:Record<string,Row[]>):Row[];
export function remainingExecutionDemand(data:Record<string,Row[]>,order:Row,operation:string,minute:number):ReturnType<typeof calculateMaterialDemand>;

export function executionMaterialDemand(data:Record<string,Row[]>,order:Row,operation:string,minute:number,trace?:(table:string,rows:Row[])=>void):ReturnType<typeof calculateMaterialDemand>;
