import {materialFixture} from './material-fixture.mjs';
export const provenance={kind:'明确可替换模拟',version:'B09-domain-r1',source:'v0.3 UAT09/10 + existing normalized qa/material-fixture.mjs',mapping:'Normalized BOM only; original09 is separately preserved, never inferred',approvalBoundary:'No new DEC04/05/06 formula or global reservation'};
export function fixture(late='62.5'){
 const data=materialFixture({products:[{'产品编号':'HC40','单支净重kg':'0.04','每袋支数':'10','总收率':'0.96'}],materials:['LEAN','FAT','WATER','PREMIX','BAG'].map(id=>({'物料编号':id,'单位':id==='BAG'?'个':'kg'})),orders:[{'订单编号':'A','产品编号':'HC40','合格需求':'240','数量单位':'kg'}],rules:[{'规则编号':'MATERIAL'}],routes:[],dependencies:[]});
 data.orders[0]['合格需求']='240';
 data.routes=['MIX','FILL'].map(id=>({'产品编号':'HC40','工序编号':id}));
 data.dependencies=['MIX','FILL'].map(id=>({'订单编号':'A','工序编号':id,'资源类型':'设备','资源编号':id+'01'}));
 data.machines=['MIX','FILL'].map(id=>({'设备编号':id+'01','工序编号':id,'日历编号':'C'}));
 data.calendars=[{'日历编号':'C','是否工作':'是','起始分钟':'0','结束分钟':'600'}];data.downtime=[];
 const lot=data.inventory[0];data.inventory=data.inventory.slice(1);
 for(const [id,book,occupied,expiry,quality,ready] of [
  ['late',late,'0','2026-12-31','合格',''],['early','137.5','37.5','2026-11-03','合格',''],
  ['frozen','999','0','2026-11-03','冻结',''],['expired','999','0','2026-11-01','合格',''],
  ['pending','999','0','2026-12-31','待检',''],['rejected','999','0','2026-12-31','不合格',''],
  ['future','999','0','2026-12-31','合格','2026-11-02T11:00:00+08:00']
 ])data.inventory.push({...lot,'批次编号':id,'账面数量':book,'已占用数量':occupied,'有效期':expiry,'质量状态':quality,'预计可用时间':ready});
 return data;
}
export const conditions={jointConditionsContract:'FR022-joint-v1',ruleEvaluationAt:'2026-10-31T00:00:00Z',enabledRuleIds:['MATERIAL']};
export const tasks=[{id:'A-MIX',orderId:'A',operation:'MIX',machine:'MIX01',start:0,end:30},{id:'A-FILL',orderId:'A',operation:'FILL',machine:'FILL01',start:30,end:60}];
export function supplyFixture(){
 const d=fixture();d.inventory=d.inventory.filter(r=>r['物料编号']!=='LEAN');
 const p=JSON.parse(d.rules[0]['参数JSON']);p['允许预计供给']=true;d.rules[0]['参数JSON']=JSON.stringify(p);
 d.supplies=[{'供给编号':'S','物料编号':'LEAN','批次编号':'EXPECTED','预计数量':'162.5','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
 d.supplyUses=[{'引用编号':'U','订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'162.5'}];return d;
}
