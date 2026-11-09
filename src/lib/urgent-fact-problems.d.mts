export type UrgentFactProblem={code:string;title:string;reason:string;action:string;message:string;section?:string;key?:string;taskId?:string;demandId?:string;status?:string;observedDate?:string;startDate?:string;endDate?:string;supplyId?:string};
export const factStatusNames:Record<string,string>;
export function factDate(day:number,origin?:string):string;
export function factProblem(code:string,title:string,reason:string,action:string,context?:Partial<UrgentFactProblem>):UrgentFactProblem;
export function explainFactFailure(code:string,message:string,context?:Partial<UrgentFactProblem>):UrgentFactProblem;
