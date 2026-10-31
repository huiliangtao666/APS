import {checkProtectedTasks} from '../src/lib/b15-protection.mjs';
import {eventSummary} from '../src/lib/simulation-events.mjs';

// Projection checks concern selected orders. Full executionContext still owns
// occupancy, consumption and independent resource checks for unselected work.
export function protectCalculatedTasks(before,candidate,data,conditions={},locks={}){
 const selected=new Set(conditions.orderIds??(data.orders||[]).map(o=>o['订单编号']));
 const facts=(data.executionFacts||[]).filter(f=>selected.has(f['订单编号']));
 return checkProtectedTasks(before||{tasks:[]},candidate,{...data,executionFacts:facts},{locks,protectionUntil:eventSummary(data).protectionUntil});
}
