export type RuleSetting={id:string;category:string;name:string;enabled:boolean;active:boolean;supported:boolean;required:boolean;effectiveFrom:string;scope:string;parameters:Record<string,unknown>;status:string};
import type {SchedulingScope} from './scheduling-scope.mjs';
export type RuleSnapshot={checkScope?:SchedulingScope;capabilityVersion:string;at:string;settings:RuleSetting[];issues:{table:string;file:string;row:number;field:string;message:string}[];intrinsicChecks:string[];independentChecks:string[];note:string};
export const ruleCatalog:{id:string;category:string;name:string;required:boolean;supported:boolean;scope:string;parameters:string;unit:string;range:string}[];
export function validRuleTime(value:string):boolean;
export function assessRules(data:Record<string,Record<string,string>[]>,at?:string,checkCoverage?:boolean,mode?:string):RuleSnapshot;
