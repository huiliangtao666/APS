// UAT07 only; all supplements are explicit replaceable simulation, no customer defaults.
import fs from 'node:fs';import path from 'node:path';
import {b2Scenario} from './b2-fixture.mjs';
import {configuredOriginalBatch,literalRows} from './b231-fixture.mjs';
export function uat07(){
 const root=path.join(process.env.B2_INPUTS,'UAT-07'),read=n=>literalRows(fs.readFileSync(path.join(root,fs.readdirSync(root).find(f=>f.startsWith(n+'_'))),'utf8'));
 const d=b2Scenario('07').data,b=configuredOriginalBatch('07'),rules=read('16');
 d.rules=d.rules.map(r=>({...r,'是否启用':rules.find(x=>x['规则编号']===r['规则编号'])?.['是否启用']||'否'}));
 // Original05+12 remain literal; explicit runtime fields use the already supported CR contract.
 return {data:d,batch:b,rawFiles:b.files.slice(0,19),source:{customerDefaults:false,scenario:'UAT07',orders:read('17'),tools:read('05'),claims:read('12'),times:read('11'),rules,choices:b.provenance,contract:b.resourceRuleBinding}};
}
export const selection=d=>({orderIds:d.orders.map(r=>r['订单编号']),startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:d.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'});
