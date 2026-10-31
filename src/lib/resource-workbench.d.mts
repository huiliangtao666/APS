export const resourceTables:Record<string,string>;
export function terminalResourceRun(run:any):boolean;
export function resourceRunView(run:any,snapshot:any,plan:any):any;
export function resourceTaskSources(view:any,taskIds:string[]):any[];
export function resourceClient(request:(path:string,body?:any)=>Promise<any>):any;
