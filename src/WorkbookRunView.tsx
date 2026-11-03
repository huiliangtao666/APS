import {EquipmentSchedule} from './EquipmentSchedule';
import {workbookView} from './lib/workbook-view.mjs';
export function WorkbookRunView({run,api,canExport=false,canWrite=false,onDraft}:{run:any;api:(p:string,b?:object)=>Promise<any>;canExport?:boolean;canWrite?:boolean;onDraft?:(suggestion:any)=>void}){
 try{workbookView(run);}catch(e){return <p role="alert">{String(e)}</p>;}
 if(!run.result)return <p>尚无计算结果；{run.failure||run.status}</p>;
 return <EquipmentSchedule key={run.id+run.resultHash} run={run} api={api} canExport={canExport} canWrite={canWrite} onDraft={onDraft}/>;
}
