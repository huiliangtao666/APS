export type FindingExplanation={code:string;need?:string;title:string;logic:string;facts:string[];effect:string;action:string;limitation:string};
export const findingRules:Record<string,{category:string;title:string;logic:string;action:string}>;
export function findingRule(f:any):{category:string;title:string;logic:string;action:string};
export function explainFinding(f:any,p?:any):FindingExplanation;
export function explainShortage(s:any,p?:any):FindingExplanation;
